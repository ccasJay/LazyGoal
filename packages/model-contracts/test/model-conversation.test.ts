import assert from "node:assert/strict";
import { test } from "node:test";
import { isModelAssistantMessage, isModelConversationMessage, type ModelAssistantMessage } from "../src/index";

const saved: ModelAssistantMessage = { role: "assistant", content: "Checking", toolCalls: [{ callId: "call", toolId: "read_file", argumentsJson: "{}" }], continuation: {
    identity: { provider: "google", model: "test", endpoint: "https://api.test/v1beta", protocol: "gemini-content" },
    parts: [{ functionCall: { id: "call", name: "read_file", args: {} }, thoughtSignature: "opaque" }],
} };

test("durable native message validation preserves opaque signature without coercion", () => {
    const value: unknown = JSON.parse(JSON.stringify(saved));
    assert.equal(isModelAssistantMessage(value), true);
    assert.deepEqual(value, saved);
    assert.equal(isModelConversationMessage({ role: "tool", content: "{}", callId: "call", toolId: "read_file" }), true);
});

test("durable native message validation rejects mismatched calls, protocol fields and credential-bearing identity", () => {
    const changes = [
        { ...saved, toolCalls: [{ ...saved.toolCalls![0]!, callId: "other" }] },
        { ...saved, toolCalls: [{ ...saved.toolCalls![0]!, toolId: "other" }] },
        { ...saved, toolCalls: [saved.toolCalls![0]!, saved.toolCalls![0]!] },
        { ...saved, continuation: { ...saved.continuation, identity: { ...saved.continuation!.identity, endpoint: "https://secret:password@api.test/v1beta" } } },
        { ...saved, continuation: { ...saved.continuation, parts: [{ thought: "incorrect-wire-type", text: "Summary" }] } },
        { ...saved, continuation: { ...saved.continuation, parts: [{ inlineData: { data: "unsupported" } }] } },
        { ...saved, continuation: { ...saved.continuation, apiKey: "secret" } },
        { ...saved, continuation: { ...saved.continuation, authorization: "Bearer secret" } },
    ];
    for (const altered of changes) assert.equal(isModelAssistantMessage(altered), false);
});
