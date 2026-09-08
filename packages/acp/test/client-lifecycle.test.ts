import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    client,
    methods,
    PROTOCOL_VERSION,
    type AnyMessage,
    type Stream,
} from "@agentclientprotocol/sdk";
import {
    runLazyGoalAcpClient,
    serveLazyGoalAcpAgent,
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

test("one-shot Client completes the ACP lifecycle and routes only its updates", async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-client-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    let prompts = 0;
    const updates: string[] = [];
    const [agentStream, clientStream] = streams();
    serveLazyGoalAcpAgent({
        stream: agentStream,
        sessions: {
            async create(input) {
                return {
                    async prompt(content) {
                        prompts += 1;
                        assert.deepEqual(content, [{ type: "text", text: "hello" }]);
                        await input.update({ sessionId: input.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } } });
                        return { stopReason: "end_turn", meta: { prompts } };
                    },
                    async dispose() {},
                };
            },
        } satisfies AcpSessionFactory,
    });
    const result = await runLazyGoalAcpClient({
        stream: clientStream,
        cwd,
        prompt: [{ type: "text", text: "hello" }],
        onUpdate: (update) => {
            if (update.update.sessionUpdate === "agent_message_chunk" && update.update.content.type === "text") {
                updates.push(update.update.content.text);
            }
        },
    });
    assert.equal(result.stopReason, "end_turn");
    assert.equal(result.meta?.prompts, 1);
    assert.deepEqual(updates, ["ok"]);
    assert.equal(prompts, 1);
});

test("same Session rejects re-entry while different Sessions run concurrently", async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-client-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const [agentStream, clientStream] = streams();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let disposeCount = 0;
    const agentConnection = serveLazyGoalAcpAgent({
        stream: agentStream,
        sessions: {
            async create(input) {
                return {
                    async prompt(_content, control) {
                        await Promise.race([blocked, new Promise<void>((resolve) => {
                            control.signal.addEventListener("abort", () => resolve(), { once: true });
                        })]);
                        return { stopReason: control.signal.aborted ? "cancelled" : "end_turn" };
                    },
                    async dispose() { disposeCount += 1; },
                };
            },
        },
    });
    const app = client();
    await app.connectWith(clientStream, async (context) => {
        await context.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION });
        const first = await context.request(methods.agent.session.new, { cwd, mcpServers: [] });
        const second = await context.request(methods.agent.session.new, { cwd, mcpServers: [] });
        const firstPrompt = context.request(methods.agent.session.prompt, { sessionId: first.sessionId, prompt: [{ type: "text", text: "one" }] });
        await assert.rejects(
            context.request(methods.agent.session.prompt, { sessionId: first.sessionId, prompt: [{ type: "text", text: "two" }] }),
            /progress|prompt/i,
        );
        const secondPrompt = context.request(methods.agent.session.prompt, { sessionId: second.sessionId, prompt: [{ type: "text", text: "two" }] });
        await context.notify(methods.agent.session.cancel, { sessionId: first.sessionId });
        await context.notify(methods.agent.session.cancel, { sessionId: second.sessionId });
        const [firstResult, secondResult] = await Promise.all([firstPrompt, secondPrompt]);
        assert.equal(firstResult.stopReason, "cancelled");
        assert.equal(secondResult.stopReason, "cancelled");
        release();
    });
    agentConnection.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(disposeCount, 2);
});

test("Client cancellation sends session/cancel and returns cancelled without late success", async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "lazygoal-acp-client-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const controller = new AbortController();
    const [agentStream, clientStream] = streams();
    let cancelled = false;
    serveLazyGoalAcpAgent({
        stream: agentStream,
        sessions: {
            async create(input) {
                return {
                    async prompt(_content, control) {
                        await new Promise<void>((resolve) => control.signal.addEventListener("abort", () => resolve(), { once: true }));
                        cancelled = true;
                        return { stopReason: "cancelled" };
                    },
                    async dispose() {},
                };
            },
        },
    });
    const resultPromise = runLazyGoalAcpClient({
        stream: clientStream,
        cwd,
        prompt: [{ type: "text", text: "cancel me" }],
        signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    const result = await resultPromise;
    assert.equal(result.stopReason, "cancelled");
    assert.equal(cancelled, true);
});
