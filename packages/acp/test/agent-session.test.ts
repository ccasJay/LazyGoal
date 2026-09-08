import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    client,
    methods,
    type AnyMessage,
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
