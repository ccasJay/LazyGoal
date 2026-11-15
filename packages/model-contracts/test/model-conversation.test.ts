import assert from "node:assert/strict";
import { test } from "node:test";

import { isModelAssistantMessage } from "../src/index";

test("OpenAI continuation distinguishes replayable reasoning_content from recorded thought", () => {
    const message = {
        role: "assistant" as const,
        content: "",
        toolCalls: [{ callId: "call-1", toolId: "read_file", argumentsJson: "{}" }],
        continuation: {
            identity: {
                provider: "openai-compatible" as const,
                endpoint: "https://gateway.example/v1",
                model: "model",
                protocol: "openai-chat" as const,
            },
            reasoningContent: "summary",
            thought: "provider extension",
        },
    };
    assert.equal(isModelAssistantMessage(message), true);
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
