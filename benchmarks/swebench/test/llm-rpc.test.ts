import assert from "node:assert/strict";
import { test } from "node:test";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/agent/src/index.js";
import { ExecutionAbortedError } from "../../../packages/runtime/src/index.js";
import {
    LlmRpcError,
    LlmRpcServer,
    RpcLlmAdapter,
    type LlmRpcMessage,
} from "../../src/llm-rpc.js";
import type { MuxChannelStream } from "../../src/multiplex.js";

function pair(): [MuxChannelStream<LlmRpcMessage>, MuxChannelStream<LlmRpcMessage>] {
    const leftToRight = new TransformStream<LlmRpcMessage, LlmRpcMessage>();
    const rightToLeft = new TransformStream<LlmRpcMessage, LlmRpcMessage>();
    return [
        { readable: rightToLeft.readable, writable: leftToRight.writable },
        { readable: leftToRight.readable, writable: rightToLeft.writable },
    ];
}

const request: LLMRequest = {
    messages: [{ role: "user", content: "hello" }],
    structuredOutput: { name: "answer", schema: { type: "object", properties: {}, required: [] } },
};

function response(content = '{"ok":true}'): LLMResponse {
    return { content, providerMetadata: { requestId: "host-1", usage: { inputTokens: 2, outputTokens: 3 } } };
}

function adapter(generate: LLMAdapter["generate"]): LLMAdapter {
    return { structuredOutputMode: "strict", generate };
}

test("RPC forwards one complete request and response through the host adapter", async () => {
    const [worker, host] = pair();
    let calls = 0;
    const server = new LlmRpcServer({
        stream: host,
        adapter: adapter(async (received) => {
            calls += 1;
            assert.deepEqual(received, request);
            return response();
        }),
    });
    const client = new RpcLlmAdapter({ stream: worker, structuredOutputMode: "strict" });
    const actual = await client.generate(request);
    assert.deepEqual(actual, response());
    assert.equal(calls, 1);
    await client.close();
    await server.close();
});

test("provider failures are classified and do not expose credential text", async () => {
    const [worker, host] = pair();
    const server = new LlmRpcServer({
        stream: host,
        adapter: adapter(async () => { throw new Error("provider secret API_KEY=do-not-leak"); }),
    });
    const client = new RpcLlmAdapter({ stream: worker, structuredOutputMode: "strict" });
    await assert.rejects(client.generate(request), (error: unknown) => {
        assert.ok(error instanceof LlmRpcError);
        assert.equal(error.code, "provider");
        assert.doesNotMatch(error.message, /secret|API_KEY|do-not-leak/);
        return true;
    });
    await client.close();
    await server.close();
});

test("mode mismatch fails before the host adapter is called", async () => {
    const [worker, host] = pair();
    let calls = 0;
    const server = new LlmRpcServer({
        stream: host,
        adapter: adapter(async () => { calls += 1; return response(); }),
    });
    const client = new RpcLlmAdapter({ stream: worker, structuredOutputMode: "prompt_only" });
    await assert.rejects(client.generate(request), (error: unknown) => {
        assert.ok(error instanceof LlmRpcError);
        assert.equal(error.code, "mode_mismatch");
        return true;
    });
    assert.equal(calls, 0);
    await client.close();
    await server.close();
});

test("cancel races are propagated and late cancelled responses cannot become success", async () => {
    const [worker, host] = pair();
    let hostCancelled = false;
    const server = new LlmRpcServer({
        stream: host,
        adapter: adapter(async (_request, control) => {
            await new Promise<void>((resolve) => control?.signal?.addEventListener("abort", () => resolve(), { once: true }));
            hostCancelled = true;
            throw new ExecutionAbortedError();
        }),
    });
    const client = new RpcLlmAdapter({ stream: worker, structuredOutputMode: "strict" });
    const controller = new AbortController();
    const pending = client.generate(request, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof ExecutionAbortedError);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(hostCancelled, true);
    await client.close();
    await server.close();
});

test("unknown or malformed response IDs fail the RPC client", async () => {
    const [worker, host] = pair();
    const client = new RpcLlmAdapter({ stream: worker, structuredOutputMode: "strict" });
    const writer = host.writable.getWriter();
    await writer.write({ type: "result", id: "unknown", response: response() });
    await writer.close();
    await assert.rejects(client.generate(request), /Unknown LLM RPC response id|closed|protocol/i);
    await client.close();
});

