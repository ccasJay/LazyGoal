import assert from "node:assert/strict";
import fs, { mkdtemp, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import {
    client,
    methods,
    RequestError,
    type AnyMessage,
    type ContentBlock,
    type NewSessionRequest,
    type SessionNotification,
    type Stream,
} from "@agentclientprotocol/sdk";
import {
    serveLazyGoalAcpAgent,
    type AcpPromptContent,
    type AcpSession,
    type AcpSessionFactory,
    type AcpSessionInput,
} from "../src/index.js";

function streams(): [Stream, Stream] {
    const leftToRight = new TransformStream<AnyMessage, AnyMessage>();
    const rightToLeft = new TransformStream<AnyMessage, AnyMessage>();
    return [
        { readable: rightToLeft.readable, writable: leftToRight.writable },
        { readable: leftToRight.readable, writable: rightToLeft.writable },
    ];
}

function factoryFor(
    callback: (content: readonly AcpPromptContent[], signal: AbortSignal, update: (value: SessionNotification) => Promise<void>) => Promise<{ stopReason: "end_turn" | "cancelled" }>,
    created: Array<{ readonly cwd: string; readonly sessionId: string }>,
): AcpSessionFactory {
    return {
        async create(input) {
            created.push({ cwd: input.cwd, sessionId: input.sessionId });
            return {
                prompt: (content, control) => callback(content, control.signal, input.update),
                dispose: async () => undefined,
            } satisfies AcpSession;
        },
    };
}

async function withConnection<T>(
    factory: AcpSessionFactory,
    operation: (context: Parameters<Parameters<ReturnType<typeof client>["connectWith"]>[1]>[0]) => Promise<T>,
): Promise<T> {
    const [agentStream, clientStream] = streams();
    serveLazyGoalAcpAgent({ stream: agentStream, sessions: factory });
    const app = client({ name: "test-client" });
    return app.connectWith(clientStream, async (context) => {
        await context.request(methods.agent.initialize, { protocolVersion: 1 });
        return operation(context);
    });
}

function gate() {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => { open = resolve; });
    return { open, opened };
}

async function holdResourceRead(t: TestContext, fail = false) {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-resource-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const file = join(cwd, "context.txt");
    await writeFile(file, "context");
    const reading = gate();
    const release = gate();
    const readFile = fs.readFile;
    let reads = 0;
    const mock = t.mock.method(fs, "readFile", async (...args: Parameters<typeof fs.readFile>) => {
        if (args[0] === file) {
            reads += 1;
            reading.open();
            await release.opened;
            if (fail) throw new Error("resource read failed");
        }
        return readFile(...args);
    });
    // Hold only the final resource read while the Agent still runs the actual validator.
    syncBuiltinESMExports();
    t.after(() => {
        release.open();
        mock.mock.restore();
        syncBuiltinESMExports();
    });
    const prompt: ContentBlock[] = [{ type: "resource_link", uri: pathToFileURL(file).href, name: "context" }];
    return {
        cwd,
        prompt,
        reading: reading.opened,
        release: release.open,
        readCount: () => reads,
    };
}

const textPrompt: ContentBlock[] = [{ type: "text", text: "hello" }];
const busyError = { code: -32602, message: /prompt in progress/ };

test("Agent advertises only baseline capabilities and routes a valid session", async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-agent-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const created: Array<{ readonly cwd: string; readonly sessionId: string }> = [];
    const updates: SessionNotification[] = [];
    const result = await withConnection(
        factoryFor(async (content, signal, update) => {
            await update({ sessionId: "ignored", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } } });
            assert.equal(signal.aborted, false);
            assert.deepEqual(content, [{ type: "text", text: "hello" }]);
            return { stopReason: "end_turn" };
        }, created),
        async (context) => {
            const session = await context.request(methods.agent.session.new, { cwd, mcpServers: [] });
            return context.request(methods.agent.session.prompt, {
                sessionId: session.sessionId,
                prompt: [{ type: "text", text: "hello" }],
            });
        },
    );
    assert.equal(result.stopReason, "end_turn");
    assert.equal(created.length, 1);
    assert.equal(created[0]?.cwd, cwd);
    void updates;
});

test("Agent rejects unsupported session inputs and invalid prompt blocks before factory side effects", async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-agent-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const created: Array<{ readonly cwd: string; readonly sessionId: string }> = [];
    await withConnection(factoryFor(async () => ({ stopReason: "end_turn" }), created), async (context) => {
        await assert.rejects(
            context.request(methods.agent.session.new, { cwd: "relative", mcpServers: [] }),
            /absolute/i,
        );
        await assert.rejects(
            context.request(methods.agent.session.new, { cwd, mcpServers: [{ type: "stdio", name: "mcp", command: "mcp", args: [], env: [] }] }),
            /MCP/i,
        );
        const session = await context.request(methods.agent.session.new, { cwd, mcpServers: [] });
        await assert.rejects(
            context.request(methods.agent.session.prompt, {
                sessionId: session.sessionId,
                prompt: [{ type: "text", text: "  " }],
            }),
            /non-empty/i,
        );
        assert.equal(created.length, 1);
    });
});

test("Agent accepts a readable cwd-local file ResourceLink and rejects escape paths", async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-agent-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const file = join(cwd, "context.txt");
    await writeFile(file, "context", "utf8");
    const created: Array<{ readonly cwd: string; readonly sessionId: string }> = [];
    await withConnection(factoryFor(async (content) => {
        assert.deepEqual(content, [{ type: "resource_link", uri: new URL(`file://${file}`).href, name: "context" }]);
        return { stopReason: "end_turn" };
    }, created), async (context) => {
        const session = await context.request(methods.agent.session.new, { cwd, mcpServers: [] });
        await context.request(methods.agent.session.prompt, {
            sessionId: session.sessionId,
            prompt: [{ type: "resource_link", uri: new URL(`file://${file}`).href, name: "context" }],
        });
        await assert.rejects(
            context.request(methods.agent.session.prompt, {
                sessionId: session.sessionId,
                prompt: [{ type: "resource_link", uri: new URL(`file://${join(cwd, "..", "outside.txt")}`).href, name: "outside" }],
            }),
            /resource/i,
        );
    });
});

test("a Prompt reserves its Session before resource validation starts", { timeout: 5000 }, async (t) => {
    const resource = await holdResourceRead(t);
    let calls = 0;
    await withConnection(factoryFor(async () => {
        calls += 1;
        return { stopReason: "end_turn" };
    }, []), async (context) => {
        const { sessionId } = await context.request(methods.agent.session.new, { cwd: resource.cwd, mcpServers: [] });
        const params = { sessionId, prompt: resource.prompt };
        const first = context.request(methods.agent.session.prompt, params);
        await resource.reading;
        await assert.rejects(context.request(methods.agent.session.prompt, params), busyError);
        assert.equal(resource.readCount(), 1);
        assert.equal(calls, 0);
        resource.release();
        assert.deepEqual(await first, { stopReason: "end_turn" });
        assert.equal(calls, 1);
    });
});

test("validation and execution failures preserve the error and allow another Prompt", { timeout: 5000 }, async (t) => {
    const resource = await holdResourceRead(t, true);
    let calls = 0;
    const executionError = RequestError.internalError({ details: "execution failed" });
    await withConnection(factoryFor(async () => {
        calls += 1;
        if (calls === 1) throw executionError;
        return { stopReason: "end_turn" };
    }, []), async (context) => {
        const { sessionId } = await context.request(methods.agent.session.new, { cwd: resource.cwd, mcpServers: [] });
        const first = context.request(methods.agent.session.prompt, { sessionId, prompt: resource.prompt });
        await resource.reading;
        resource.release();
        await assert.rejects(first, { code: -32602, message: /resource read failed/ });
        assert.equal(calls, 0);
        const params = { sessionId, prompt: textPrompt };
        await assert.rejects(context.request(methods.agent.session.prompt, params), {
            code: executionError.code,
            data: executionError.data,
        });
        assert.deepEqual(await context.request(methods.agent.session.prompt, params), { stopReason: "end_turn" });
        assert.equal(calls, 2);
    });
});

for (const cancellation of ["session", "request"] as const) {
    test(`${cancellation} cancellation holds the Session until validation settles`, { timeout: 5000 }, async (t) => {
        const resource = await holdResourceRead(t, cancellation === "request");
        const controller = new AbortController();
        let calls = 0;
        await withConnection(factoryFor(async () => {
            calls += 1;
            return { stopReason: "end_turn" };
        }, []), async (context) => {
            const { sessionId } = await context.request(methods.agent.session.new, { cwd: resource.cwd, mcpServers: [] });
            const first = context.request(methods.agent.session.prompt, { sessionId, prompt: resource.prompt }, {
                cancellationSignal: controller.signal,
            });
            await resource.reading;
            if (cancellation === "session") {
                await context.notify(methods.agent.session.cancel, { sessionId });
            } else {
                controller.abort();
            }
            const next = { sessionId, prompt: textPrompt };
            await assert.rejects(context.request(methods.agent.session.prompt, next), busyError);
            resource.release();
            assert.equal((await first).stopReason, "cancelled");
            assert.equal(calls, 0);
            assert.deepEqual(await context.request(methods.agent.session.prompt, next), { stopReason: "end_turn" });
            assert.equal(calls, 1);
        });
    });
}

test("disconnect during validation waits for settlement without entering the Session", { timeout: 5000 }, async (t) => {
    const resource = await holdResourceRead(t);
    const disposed = gate();
    let calls = 0;
    let releases = 0;
    const [agentStream, clientStream] = streams();
    const connection = serveLazyGoalAcpAgent({
        stream: agentStream,
        sessions: {
            async create() {
                return {
                    async prompt() {
                        calls += 1;
                        return { stopReason: "end_turn" };
                    },
                    async dispose() {
                        releases += 1;
                        disposed.open();
                    },
                };
            },
        },
    });
    const peer = client().connect(clientStream);
    try {
        const context = peer.agent;
        const { sessionId } = await context.request(methods.agent.session.new, { cwd: resource.cwd, mcpServers: [] });
        const first = context.request(methods.agent.session.prompt, { sessionId, prompt: resource.prompt });
        const rejected = assert.rejects(first, /ACP connection closed/);
        await resource.reading;
        peer.close();
        connection.close();
        await rejected;
        assert.equal(releases, 0);
        resource.release();
        await disposed.opened;
        assert.equal(releases, 1);
        assert.equal(calls, 0);
    } finally {
        peer.close();
        connection.close();
    }
});

test("execution cancellation holds its Session without cancelling another Session", { timeout: 5000 }, async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-agent-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const entered = gate();
    const cancelled = gate();
    const release = gate();
    const enteredOther = gate();
    const releaseOther = gate();
    t.after(() => {
        release.open();
        releaseOther.open();
    });
    await withConnection(factoryFor(async (content, signal) => {
        const block = content[0];
        if (block?.type === "text" && block.text === "hold") {
            signal.addEventListener("abort", cancelled.open, { once: true });
            entered.open();
            await release.opened;
            return { stopReason: signal.aborted ? "cancelled" : "end_turn" };
        }
        if (block?.type === "text" && block.text === "other") {
            enteredOther.open();
            await releaseOther.opened;
        }
        assert.equal(signal.aborted, false);
        return { stopReason: "end_turn" };
    }, []), async (context) => {
        const a = await context.request(methods.agent.session.new, { cwd, mcpServers: [] });
        const b = await context.request(methods.agent.session.new, { cwd, mcpServers: [] });
        const first = context.request(methods.agent.session.prompt, { ...a, prompt: [{ type: "text", text: "hold" }] });
        await entered.opened;
        const other = context.request(methods.agent.session.prompt, { ...b, prompt: [{ type: "text", text: "other" }] });
        await enteredOther.opened;
        await context.notify(methods.agent.session.cancel, a);
        await cancelled.opened;
        const next = { ...a, prompt: textPrompt };
        await assert.rejects(context.request(methods.agent.session.prompt, next), busyError);
        releaseOther.open();
        assert.equal((await other).stopReason, "end_turn");
        release.open();
        assert.equal((await first).stopReason, "cancelled");
        assert.deepEqual(await context.request(methods.agent.session.prompt, next), { stopReason: "end_turn" });
    });
});

function messageUpdate(text: string): SessionNotification {
    return {
        sessionId: "overridden by Agent",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
    };
}

test("concurrent factories register independently and publish updates only after registration", { timeout: 5000 }, async () => {
    const a = { started: gate(), release: gate() };
    const b = { started: gate(), release: gate() };
    const pending = new Map<string, AcpSessionInput>();
    const [agentStream, clientStream] = streams();
    const connection = serveLazyGoalAcpAgent({
        stream: agentStream,
        sessions: {
            async create(input) {
                const label = input.sessionMeta?.label === "a" ? "a" : "b";
                const factory = label === "a" ? a : b;
                pending.set(label, input);
                await input.update(messageUpdate(`before ${label}`));
                factory.started.open();
                await factory.release.opened;
                return {
                    async prompt() {
                        await input.update(messageUpdate(label));
                        return { stopReason: "end_turn", meta: { label } };
                    },
                    async dispose() {},
                };
            },
        },
    });
    const updates: SessionNotification[] = [];
    const app = client();
    app.onNotification(methods.client.session.update, ({ params }) => { updates.push(params); });
    try {
        await app.connectWith(clientStream, async (context) => {
            const params: NewSessionRequest = { cwd: tmpdir(), mcpServers: [] };
            const first = context.request(methods.agent.session.new, { ...params, _meta: { label: "a" } });
            const second = context.request(methods.agent.session.new, { ...params, _meta: { label: "b" } });
            await Promise.all([a.started.opened, b.started.opened]);
            const firstInput = pending.get("a");
            const secondInput = pending.get("b");
            assert.ok(firstInput && secondInput);
            assert.notEqual(firstInput.sessionId, secondInput.sessionId);
            await assert.rejects(context.request(methods.agent.session.prompt, {
                sessionId: firstInput.sessionId,
                prompt: textPrompt,
            }), { code: -32602, message: /Unknown ACP session/ });
            assert.deepEqual(updates, []);

            b.release.open();
            const secondSession = await second;
            assert.equal(secondSession.sessionId, secondInput.sessionId);
            assert.deepEqual(await context.request(methods.agent.session.prompt, { ...secondSession, prompt: textPrompt }), {
                stopReason: "end_turn",
                _meta: { label: "b" },
            });
            a.release.open();
            const firstSession = await first;
            assert.equal(firstSession.sessionId, firstInput.sessionId);
            assert.deepEqual(await context.request(methods.agent.session.prompt, { ...firstSession, prompt: textPrompt }), {
                stopReason: "end_turn",
                _meta: { label: "a" },
            });
            assert.deepEqual(updates, [
                { ...messageUpdate("b"), sessionId: secondSession.sessionId },
                { ...messageUpdate("a"), sessionId: firstSession.sessionId },
            ]);
        });
    } finally {
        a.release.open();
        b.release.open();
        connection.close();
    }
});

test("a rejected factory preserves its error and only retries on a new request", { timeout: 5000 }, async () => {
    let calls = 0;
    let rejectedId: string | undefined;
    const factoryError = RequestError.internalError({ details: "factory failed" });
    await withConnection({
        async create(input) {
            calls += 1;
            if (calls === 1) {
                rejectedId = input.sessionId;
                throw factoryError;
            }
            return {
                async prompt() { return { stopReason: "end_turn" }; },
                async dispose() {},
            };
        },
    }, async (context) => {
        const params: NewSessionRequest = { cwd: tmpdir(), mcpServers: [] };
        await assert.rejects(context.request(methods.agent.session.new, params), {
            code: factoryError.code,
            data: factoryError.data,
        });
        assert.equal(calls, 1);
        assert.ok(rejectedId);
        await assert.rejects(context.request(methods.agent.session.prompt, {
            sessionId: rejectedId,
            prompt: textPrompt,
        }), { code: -32602, message: /Unknown ACP session/ });
        const next = await context.request(methods.agent.session.new, params);
        assert.notEqual(next.sessionId, rejectedId);
        assert.deepEqual(await context.request(methods.agent.session.prompt, { ...next, prompt: textPrompt }), {
            stopReason: "end_turn",
        });
        assert.equal(calls, 2);
    });
});

for (const disposeFails of [false, true]) {
    test(`disconnect releases a late Session once when disposal ${disposeFails ? "rejects" : "succeeds"}`, { timeout: 5000 }, async () => {
        const running = gate();
        const promptAborted = gate();
        const releasePrompt = gate();
        const registeredDisposed = gate();
        const creating = gate();
        const releaseFactory = gate();
        const lateDisposed = gate();
        let lateInput: AcpSessionInput | undefined;
        let registeredDisposals = 0;
        let lateDisposals = 0;
        let factoryCalls = 0;
        const [agentStream, clientStream] = streams();
        const connection = serveLazyGoalAcpAgent({
            stream: agentStream,
            sessions: {
                async create(input) {
                    factoryCalls += 1;
                    if (input.sessionMeta?.late === true) {
                        lateInput = input;
                        creating.open();
                        await releaseFactory.opened;
                        return {
                            async prompt() { throw new Error("late Session must never run"); },
                            async dispose() {
                                lateDisposals += 1;
                                lateDisposed.open();
                                if (disposeFails) throw new Error("late dispose failed");
                            },
                        };
                    }
                    return {
                        async prompt(_content, { signal }) {
                            signal.addEventListener("abort", promptAborted.open, { once: true });
                            running.open();
                            await releasePrompt.opened;
                            await input.update(messageUpdate("after disconnect"));
                            return { stopReason: "cancelled" };
                        },
                        async dispose() {
                            registeredDisposals += 1;
                            registeredDisposed.open();
                        },
                    };
                },
            },
        });
        const updates: SessionNotification[] = [];
        const app = client();
        app.onNotification(methods.client.session.update, ({ params }) => { updates.push(params); });
        const peer = app.connect(clientStream);
        try {
            const context = peer.agent;
            const params: NewSessionRequest = { cwd: tmpdir(), mcpServers: [] };
            const session = await context.request(methods.agent.session.new, params);
            const transportError = new Error("test transport disconnected");
            const promptRejected = assert.rejects(context.request(methods.agent.session.prompt, {
                ...session,
                prompt: textPrompt,
            }), transportError);
            const createRejected = assert.rejects(context.request(methods.agent.session.new, {
                ...params,
                _meta: { late: true },
            }), transportError);
            await Promise.all([running.opened, creating.opened]);

            // Break both directions of the in-memory transport so each SDK peer observes disconnect.
            await Promise.all([
                clientStream.writable.getWriter().abort(transportError),
                agentStream.writable.getWriter().abort(transportError),
            ]);
            await Promise.all([connection.closed, peer.closed, promptAborted.opened, promptRejected, createRejected]);
            assert.ok(lateInput?.signal.aborted);
            assert.equal(registeredDisposals, 0);
            assert.equal(lateDisposals, 0);

            releasePrompt.open();
            await registeredDisposed.opened;
            assert.equal(registeredDisposals, 1);
            assert.equal(lateDisposals, 0);

            releaseFactory.open();
            await lateDisposed.opened;
            await lateInput.update(messageUpdate("late Session"));
            await new Promise<void>((resolve) => setImmediate(resolve));
            assert.equal(registeredDisposals, 1);
            assert.equal(lateDisposals, 1);
            assert.equal(factoryCalls, 2);
            assert.deepEqual(updates, []);
        } finally {
            releasePrompt.open();
            releaseFactory.open();
            peer.close();
            connection.close();
        }
    });
}
