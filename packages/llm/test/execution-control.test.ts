import assert from "node:assert/strict";
import { test } from "node:test";

import { ExecutionAbortedError } from "../../runtime/src/index";
import { Gemini } from "../src/gemini";
import { OpenAICompatible } from "../src/openai-compatible";

const request = {
    messages: [{ role: "user" as const, content: "abort" }],
};

test("OpenAICompatible rejects before opening a request when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new OpenAICompatible({
        apiKey: "test-key",
        baseURL: "http://127.0.0.1:1/v1",
        model: "test-model",
        structuredOutputMode: "prompt_only",
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
        structuredOutputMode: "prompt_only",
    });

    await assert.rejects(
        () => adapter.generate(request, { signal: controller.signal }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
});
