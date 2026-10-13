import assert from "node:assert/strict";
import { test } from "node:test";
import { RpcLlmAdapter, createLlmRpcServer } from "../src/llm-rpc.js";
import { MultiplexedConnection } from "../src/multiplex.js";
import type { LLMAdapter } from "../../packages/agent/src/index.js";
test("RPC preserves native calls without JSON response schema and still rejects missing strict format", async () => {
    const hostToWorker = new TransformStream<Uint8Array>();
    const workerToHost = new TransformStream<Uint8Array>();
    const host = new MultiplexedConnection({ input: workerToHost.readable, output: hostToWorker.writable });
    const worker = new MultiplexedConnection({ input: hostToWorker.readable, output: workerToHost.writable });
    const identity = { provider: "google" as const, endpoint: "https://provider.test", model: "native", protocol: "gemini-content" as const };
    const adapter: LLMAdapter = { structuredOutputMode: "strict", nativeConversationIdentity: identity,
        generate: async () => ({ content: "", toolCalls: [{ callId: "signed-call", toolId: "system_fail_goal", argumentsJson: '{"error":"probe","memoryPatch":null}' }],
            continuation: { identity, parts: [{ functionCall: { name: "system_fail_goal", args: { error: "probe", memoryPatch: null } }, thoughtSignature: "original-signature" }] } }) };
    const server = createLlmRpcServer({ stream: host.channel("llm"), adapter });
    const rpc = new RpcLlmAdapter({ stream: worker.channel("llm"), structuredOutputMode: "strict", nativeConversationIdentity: identity });
    try {
        const response = await rpc.generate({ messages: [{ role: "user", content: "probe" }], tools: [{ id: "system_fail_goal", description: "Fail", parametersSchema: { type: "object" } }], toolChoice: "required" });
        assert.equal(response.continuation?.parts?.[0]?.thoughtSignature, "original-signature");
        assert.deepEqual(rpc.nativeConversationIdentity, identity);
        const replay = await rpc.generate({
            messages: [{ role: "user", content: "probe" },
                { role: "assistant", content: "", toolCalls: response.toolCalls!, continuation: response.continuation! },
                { role: "tool", callId: "signed-call", toolId: "system_fail_goal", content: '{"kind":"accepted"}' }],
            tools: [{ id: "system_fail_goal", description: "Fail", parametersSchema: { type: "object" } }], toolChoice: "required",
        }, { signal: AbortSignal.timeout(300) });
        assert.equal(replay.toolCalls?.[0]?.callId, "signed-call");

        await assert.rejects(() => rpc.generate({ messages: [{ role: "user", content: "probe" }] }), /requires structuredOutput/);
    } finally { await rpc.close(); await server.close(); await host.close(); await worker.close(); }
});
