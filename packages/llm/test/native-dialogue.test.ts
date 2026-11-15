import assert from "node:assert/strict";
import { test } from "node:test";
import { StructuredOutputModeOpenAICompatible } from "../../llm-openai/src/index";
import { Gemini } from "../../llm-google/src/index";
import type { LLMRequest, LLMResponse } from "../../llm-core/src/index";
import { readAssistantText, readReasoningText, readToolCalls } from "../../llm-core/src/index";
import { nativeResponseMessage } from "../../model-response/src/index";

const tools = [{ id: "read_file", description: "Read", parametersSchema: { type: "object", properties: {}, required: [], additionalProperties: false } }];
const firstRequest: LLMRequest = { messages: [{ role: "user", content: "Read" }], tools, toolChoice: "required", structuredOutput: { name: "unused", schema: { type: "object" } } };

function nextRequest(first: LLMResponse): LLMRequest {
    const toolCalls = readToolCalls(first);
    return { messages: [firstRequest.messages[0]!, nativeResponseMessage(first), {
        role: "tool", callId: toolCalls[0]!.callId, toolId: "read_file", content: '{"observation":{"kind":"success","output":"file"}}',
    }, { role: "user", content: "Continue" }], tools, toolChoice: "required" };
}

test("OpenAI two-turn dialogue preserves call IDs and supported reasoning extension without top-level JSON constraints", async () => {
    const adapter = new StructuredOutputModeOpenAICompatible({ apiKey: "test-key", model: "test", baseURL: "https://gateway.test/v1/" }, "strict");
    const requests: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({
            choices: [{ message: { content: "Checking", reasoning_content: "Summary", tool_calls: [{ id: "native-id", type: "function", function: { name: "read_file", arguments: "{}" } }] } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    let first: LLMResponse;
    try {
        first = await adapter.generate(firstRequest);
        assert.equal(readAssistantText(first), "Checking");
        assert.equal(readReasoningText(first), "Summary");
        await adapter.generate(nextRequest(first));
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.equal(requests[0].parallel_tool_calls, false);
    assert.equal(requests[0].response_format, undefined);
    assert.equal(requests[1].messages[1].tool_calls[0].id, "native-id");
    assert.equal(requests[1].messages[1].reasoning_content, "Summary");
    assert.equal(requests[1].messages[2].role, "tool");
    assert.equal(requests[1].messages[2].tool_call_id, "native-id");
    assert.equal(JSON.stringify(first.continuation).includes("test-key"), false);
    const other = new StructuredOutputModeOpenAICompatible({ apiKey: "test", baseURL: "https://other.test/v1", model: "test" }, "strict");
    await assert.rejects(other.generate(nextRequest(first)), /another provider/);
});

test("Gemini two-turn dialogue preserves signed parts verbatim and returns exact native function ID", async () => {
    const adapter = new Gemini({ apiKey: "test-key", model: "test", structuredOutputMode: "strict" });
    const parts = [{ text: "Summary", thought: true }, { text: "Checking" }, { functionCall: { id: "native-id", name: "read_file", args: {} }, thoughtSignature: "opaque-signature" }];
    const requests: any[] = [];
    (adapter as any).client = { models: { generateContent: async (request: unknown) => {
        requests.push(request);
        return { candidates: [{ content: { role: "model", parts } }] };
    } } };
    const first = await adapter.generate(firstRequest);
    assert.equal(readAssistantText(first), "Checking");
    assert.equal(readReasoningText(first), "Summary");
    await adapter.generate(nextRequest(first));
    assert.equal(requests[0].config.responseSchema, undefined);
    assert.equal(requests[0].config.responseMimeType, undefined);
    assert.deepEqual(requests[1].contents[1].parts, parts);
    assert.deepEqual(requests[1].contents[2].parts[0].functionResponse, { name: "read_file", id: "native-id", response: { observation: { kind: "success", output: "file" } } });
    assert.equal(JSON.stringify(first.continuation).includes("test-key"), false);
});

test("Gemini locally allocated call ID does not fabricate a provider function ID", async () => {
    const adapter = new Gemini({ apiKey: "test", model: "test", structuredOutputMode: "strict" });
    const requests: any[] = [];
    (adapter as any).client = { models: { generateContent: async (request: unknown) => {
        requests.push(request);
        return { candidates: [{ content: { parts: [{ text: "Summary", thought: true }, { functionCall: { name: "read_file", args: {} }, thoughtSignature: "signature" }] } }] };
    } } };
    const first = await adapter.generate(firstRequest);
    await adapter.generate(nextRequest(first));
    assert.ok(readToolCalls(first)[0]!.callId);
    assert.equal(requests[1].contents[2].parts[0].functionResponse.id, undefined);
});

test("native dialogue smoke uses the real OpenAI SDK for two HTTP turns and sends the first tool result", async () => {
    const { createServer } = await import("node:http");
    const { runNativeDialogueSmoke } = await import("./native-dialogue-smoke");
    const requests: any[] = [];
    const server = createServer((request, response) => {
        let body = "";
        request.on("data", chunk => { body += chunk; });
        request.on("end", () => {
            requests.push(JSON.parse(body));
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ choices: [{ message: { content: "", tool_calls: [{ id: `call-${requests.length}`, type: "function", function: { name: "smoke_evidence", arguments: "{}" } }] }, finish_reason: "tool_calls" }] }));
        });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
        const address = server.address();
        assert.ok(address !== null && typeof address !== "string");
        const report = await runNativeDialogueSmoke({ LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "test", LLM_MODEL: "test",
            LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`, LLM_CONTEXT_WINDOW_TOKENS: "16000", LLM_MAX_OUTPUT_TOKENS: "4096" });
        assert.equal(report.modelCalls, 2);
        assert.equal(requests.length, 2);
        const result = requests[1].messages.find((message: any) => message.role === "tool");
        assert.equal(result.tool_call_id, "call-1");
        assert.equal(JSON.parse(result.content).output.evidence, "smoke-1");
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
