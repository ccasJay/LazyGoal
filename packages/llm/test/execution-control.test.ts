import assert from "node:assert/strict";
import { test } from "node:test";

import { ExecutionAbortedError } from "../../execution-control/src/index";
import { Gemini } from "../../llm-google/src/index";
import { createOpenAICompatibleAdapter } from "../../llm-adapters/src/index";

const request = {
    messages: [{ role: "user" as const, content: "abort" }],
};

test("Chat Completions 适配器 rejects before opening a request when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = createOpenAICompatibleAdapter({
        provider: "openai-compatible",
        apiKey: "test-key",
        model: "test-model",
        baseURL: "http://127.0.0.1:1/v1",
        contextWindowTokens: 8192,
        maxOutputTokens: 1024,
    });

    await assert.rejects(
        () => adapter.generate(request, { signal: controller.signal }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
});

test("Gemini rejects before opening a request when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new Gemini({
        apiKey: "test-key",
        model: "test-model",
    });

    await assert.rejects(
        () => adapter.generate(request, { signal: controller.signal }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
});
