import assert from "node:assert/strict";
import { test } from "node:test";
import { RpcLlmAdapter, createLlmRpcServer, executeLlmWithTransientRetry } from "../src/llm-rpc.js";
import { MultiplexedConnection } from "../src/multiplex.js";
import type { LLMAdapter, LLMRequest } from "../../packages/llm-core/src/index.js";
import { readToolCalls } from "../../packages/llm-core/src/index";
import { blockResponse, textResponse } from "../../packages/llm-core/test/response-fixtures";
import { ExecutionAbortedError, TransientModelRequestFailure } from "../../packages/execution-control/src/index.js";
test("RPC preserves native calls without JSON response schema", async () => {
    const hostToWorker = new TransformStream<Uint8Array>();
    const workerToHost = new TransformStream<Uint8Array>();
    const host = new MultiplexedConnection({ input: workerToHost.readable, output: hostToWorker.writable });
    const worker = new MultiplexedConnection({ input: hostToWorker.readable, output: workerToHost.writable });
    const identity = { provider: "google" as const, endpoint: "https://provider.test", model: "native", protocol: "gemini-content" as const };
    const adapter: LLMAdapter = { nativeConversationIdentity: identity,
        generate: async () => ({
            ...blockResponse(
                { type: "tool_call", callId: "signed-call", toolId: "system_fail_goal", argumentsJson: '{"error":"probe","memoryPatch":null}' },
            ),
            continuation: { identity, parts: [{ functionCall: { name: "system_fail_goal", args: { error: "probe", memoryPatch: null } }, thoughtSignature: "original-signature" }] },
        }) };
    const server = createLlmRpcServer({ stream: host.channel("llm"), adapter });
    const rpc = new RpcLlmAdapter({ stream: worker.channel("llm"), nativeConversationIdentity: identity });
    try {
        const response = await rpc.generate({ messages: [{ role: "user", content: "probe" }], tools: [{ id: "system_fail_goal", description: "Fail", parametersSchema: { type: "object" } }], toolChoice: "required" });
        assert.equal(response.continuation?.parts?.[0]?.thoughtSignature, "original-signature");
        assert.deepEqual(rpc.nativeConversationIdentity, identity);
        const replay = await rpc.generate({
            messages: [{ role: "user", content: "probe" },
                { role: "assistant", content: "", toolCalls: readToolCalls(response), continuation: response.continuation! },
                { role: "tool", callId: "signed-call", toolId: "system_fail_goal", content: '{"kind":"accepted"}' }],
            tools: [{ id: "system_fail_goal", description: "Fail", parametersSchema: { type: "object" } }], toolChoice: "required",
        }, { signal: AbortSignal.timeout(300) });
        assert.equal(readToolCalls(replay)[0]?.callId, "signed-call");
    } finally { await rpc.close(); await server.close(); await host.close(); await worker.close(); }
});

test("executeLlmWithTransientRetry 首次调用成功时不触发重试", async () => {
    let callCount = 0;
    const adapter: LLMAdapter = {
        generate: async () => {
            callCount += 1;
            return textResponse("success");
        },
    };
    const req: LLMRequest = { messages: [{ role: "user", content: "hello" }] };
    const res = await executeLlmWithTransientRetry(adapter, req);
    assert.equal(callCount, 1);
    assert.equal(res.blocks[0]?.type, "text");
});

test("executeLlmWithTransientRetry 遭遇 HTTP 429 限流时自动退避重试并最终成功", async () => {
    let callCount = 0;
    const retries: number[] = [];
    const adapter: LLMAdapter = {
        generate: async () => {
            callCount += 1;
            if (callCount < 3) {
                const err = new Error("Model provider request failed (HTTP 429)");
                (err as Record<string, unknown>).status = 429;
                throw err;
            }
            return textResponse("recovered from 429");
        },
    };
    const req: LLMRequest = { messages: [{ role: "user", content: "hello" }] };
    const res = await executeLlmWithTransientRetry(adapter, req, undefined, {
        maxAttempts: 4,
        baseDelayMs: 10,
        maxDelayMs: 50,
        onRetry: (attempt) => retries.push(attempt),
    });
    assert.equal(callCount, 3);
    assert.deepEqual(retries, [1, 2]);
    assert.equal(res.blocks[0]?.type, "text");
});

test("executeLlmWithTransientRetry 遭遇 TransientModelRequestFailure 时遵循 retryAfterMs 进行重试", async () => {
    let callCount = 0;
    const delays: number[] = [];
    const adapter: LLMAdapter = {
        generate: async () => {
            callCount += 1;
            if (callCount === 1) {
                throw new TransientModelRequestFailure("rate_limited", { status: 429, retryAfterMs: 25 });
            }
            return textResponse("recovered with retry-after");
        },
    };
    const req: LLMRequest = { messages: [{ role: "user", content: "hello" }] };
    const res = await executeLlmWithTransientRetry(adapter, req, undefined, {
        baseDelayMs: 5,
        onRetry: (_attempt, delayMs) => delays.push(delayMs),
    });
    assert.equal(callCount, 2);
    assert.equal(delays.length, 1);
    assert.ok(delays[0]! >= 25);
    assert.equal(res.blocks[0]?.type, "text");
});

test("executeLlmWithTransientRetry 遭遇非暂时性错误直接抛出不浪费重试", async () => {
    let callCount = 0;
    const adapter: LLMAdapter = {
        generate: async () => {
            callCount += 1;
            const err = new Error("Invalid API Key");
            (err as Record<string, unknown>).status = 401;
            throw err;
        },
    };
    const req: LLMRequest = { messages: [{ role: "user", content: "hello" }] };
    await assert.rejects(
        () => executeLlmWithTransientRetry(adapter, req, undefined, { maxAttempts: 5, baseDelayMs: 10 }),
        (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /Invalid API Key/);
            return true;
        },
    );
    assert.equal(callCount, 1);
});

test("executeLlmWithTransientRetry 超过最大尝试次数抛出最后一次错误", async () => {
    let callCount = 0;
    const adapter: LLMAdapter = {
        generate: async () => {
            callCount += 1;
            const err = new Error("Persistent 503");
            (err as Record<string, unknown>).status = 503;
            throw err;
        },
    };
    const req: LLMRequest = { messages: [{ role: "user", content: "hello" }] };
    await assert.rejects(
        () => executeLlmWithTransientRetry(adapter, req, undefined, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20 }),
        (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /Persistent 503/);
            return true;
        },
    );
    assert.equal(callCount, 3);
});

test("executeLlmWithTransientRetry 在退避等待期间响应 AbortSignal 并抛出 ExecutionAbortedError", async () => {
    let callCount = 0;
    const controller = new AbortController();
    const adapter: LLMAdapter = {
        generate: async () => {
            callCount += 1;
            const err = new Error("HTTP 429");
            (err as Record<string, unknown>).status = 429;
            throw err;
        },
    };
    const req: LLMRequest = { messages: [{ role: "user", content: "hello" }] };
    const promise = executeLlmWithTransientRetry(adapter, req, { signal: controller.signal }, {
        maxAttempts: 5,
        baseDelayMs: 1000,
        onRetry: () => {
            // 在重试退避等待阶段触发 abort
            setTimeout(() => controller.abort(), 10);
        },
    });

    await assert.rejects(promise, (err: unknown) => {
        assert.ok(err instanceof ExecutionAbortedError);
        return true;
    });
    assert.equal(callCount, 1);
});


test("LlmRpcServer 在底层 Adapter 抛出暂时性 HTTP 500 时自动退避重试并成功交付响应", async () => {
    let callCount = 0;
    const adapter: LLMAdapter = {
        generate: async () => {
            callCount += 1;
            if (callCount < 3) {
                const err = new Error("Model provider request failed (HTTP 500)");
                (err as Record<string, unknown>).status = 500;
                throw err;
            }
            return textResponse("success response");
        },
    };

    const hostToWorker = new TransformStream<Uint8Array, Uint8Array>();
    const workerToHost = new TransformStream<Uint8Array, Uint8Array>();

    const serverMux = new MultiplexedConnection({
        input: workerToHost.readable,
        output: hostToWorker.writable,
    });
    const clientMux = new MultiplexedConnection({
        input: hostToWorker.readable,
        output: workerToHost.writable,
    });

    const server = createLlmRpcServer({
        stream: serverMux.channel("llm"),
        adapter,
    });
    const client = new RpcLlmAdapter({
        stream: clientMux.channel("llm"),
    });

    const response = await client.generate({
        messages: [{ role: "user", content: "test 500 retry" }],
    });

    assert.equal(callCount, 3);
    assert.equal(response.blocks[0]?.type, "text");
    assert.equal((response.blocks[0] as { text: string }).text, "success response");

    await client.close();
    await server.close();
    await clientMux.close();
    await serverMux.close();
});
