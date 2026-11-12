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
    type SessionNotification,
    type Stream,
} from "@agentclientprotocol/sdk";
import {
    serveLazyGoalAcpAgent,
    type AcpPromptContent,
    type AcpSession,
    type AcpSessionFactory,
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
