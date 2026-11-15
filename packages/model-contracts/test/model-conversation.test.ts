import assert from "node:assert/strict";
import { test } from "node:test";

import {
    isModelAssistantMessage,
    readModelAssistantReasoning,
    readModelAssistantText,
    readModelToolCalls,
} from "../src/index";

test("OpenAI-compatible assistant history uses ordered blocks as its only content authority", () => {
    const message = {
        role: "assistant" as const,
        blocks: [
            { index: 0, type: "text" as const, format: "plain" as const, text: "Checking" },
            { index: 1, type: "reasoning" as const, source: "reasoning_content" as const, text: "summary" },
            { index: 2, type: "reasoning" as const, source: "thought" as const, text: "provider extension" },
            { index: 3, type: "tool_call" as const, callId: "call-1", toolId: "read_file", argumentsJson: "{}" },
        ],
        continuation: {
            identity: {
                provider: "openai-compatible" as const,
                endpoint: "https://gateway.example/v1",
                model: "model",
                protocol: "openai-chat" as const,
            },
        },
    };
    assert.equal(isModelAssistantMessage(message), true);
    assert.equal(readModelAssistantText(message), "Checking");
    assert.equal(readModelAssistantReasoning(message, "reasoning_content"), "summary");
    assert.equal(readModelAssistantReasoning(message, "thought"), "provider extension");
    assert.deepEqual(readModelToolCalls(message), [{ callId: "call-1", toolId: "read_file", argumentsJson: "{}" }]);
    assert.equal(isModelAssistantMessage({
        ...message,
        continuation: { ...message.continuation, reasoningContent: "duplicate" },
    }), false);
});

test("other OpenAI provider history keeps its existing flattened continuation shape", () => {
    assert.equal(isModelAssistantMessage({
        role: "assistant",
        content: "",
        toolCalls: [{ callId: "call-1", toolId: "read_file", argumentsJson: "{}" }],
        continuation: {
            identity: {
                provider: "openai",
                endpoint: "https://api.openai.com/v1",
                model: "model",
                protocol: "openai-chat",
            },
            reasoningContent: "summary",
            thought: "provider extension",
        },
    }), true);
});

test("Gemini continuation rejects OpenAI-only thought metadata", () => {
    assert.equal(isModelAssistantMessage({
        role: "assistant",
        content: "",
        continuation: {
            identity: {
                provider: "google",
                endpoint: "https://generativelanguage.googleapis.com/v1beta",
                model: "gemini",
                protocol: "gemini-content",
            },
            thought: "provider extension",
            parts: [{ text: "answer", thought: true }],
        },
    }), false);
});
