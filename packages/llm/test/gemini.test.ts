import assert from "node:assert/strict";
import { test } from "node:test";

import { ExecutionAbortedError } from "../../runtime/src/execution-control";
import { Gemini } from "../src/gemini";
import {
    LLMRequestModeMismatchError,
    type LLMRequest,
} from "../src/core/types";

const dummySchema = {
    type: "object" as const,
    properties: {
        summary: { type: "string" as const },
    },
    required: ["summary"],
    additionalProperties: false,
};

function createAdapter(mode: "strict" | "prompt_only") {
    return new Gemini({
        apiKey: "test-api-key",
        model: "gemini-2.5-flash",
        structuredOutputMode: mode,
    });
}

test("Gemini exposes configured structuredOutputMode immutably", () => {
    const strictAdapter = createAdapter("strict");
    assert.equal(strictAdapter.structuredOutputMode, "strict");

    const promptOnlyAdapter = createAdapter("prompt_only");
    assert.equal(promptOnlyAdapter.structuredOutputMode, "prompt_only");
});

test("Gemini in strict mode maps structuredOutput to responseMimeType and responseJsonSchema", async () => {
    const adapter = createAdapter("strict");
    let capturedInput: any = undefined;
    let callCount = 0;

    (adapter as any).client = {
        models: {
            generateContent: async (params: any) => {
                callCount += 1;
                capturedInput = params;
                return {
                    text: JSON.stringify({ summary: "done" }),
                };
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "hi" }],
        structuredOutput: {
            name: "test_output",
            schema: dummySchema,
        },
    };

    const response = await adapter.generate(request);

    assert.equal(callCount, 1);
    assert.equal(response.content, JSON.stringify({ summary: "done" }));
    assert.equal(capturedInput.model, "gemini-2.5-flash");
    assert.equal(capturedInput.config?.responseMimeType, "application/json");
    assert.deepEqual(capturedInput.config?.responseJsonSchema, dummySchema);
});

test("Gemini in strict mode fails fast when structuredOutput is missing without calling client", async () => {
    const adapter = createAdapter("strict");
    let callCount = 0;

    (adapter as any).client = {
        models: {
            generateContent: async () => {
                callCount += 1;
                return {};
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "hi" }],
    };

    await assert.rejects(
        () => adapter.generate(request),
        (error: unknown) => {
            assert.ok(error instanceof LLMRequestModeMismatchError);
            assert.equal(error.code, "LLM_REQUEST_MODE_MISMATCH");
            return true;
        },
    );

    assert.equal(callCount, 0, "Network client must not be called when mode mismatches");
});

test("Gemini in prompt_only mode does not send responseMimeType or responseJsonSchema", async () => {
    const adapter = createAdapter("prompt_only");
    let capturedInput: any = undefined;
    let callCount = 0;

    (adapter as any).client = {
        models: {
            generateContent: async (params: any) => {
                callCount += 1;
                capturedInput = params;
                return {
                    text: "plain text response",
                };
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "hi" }],
    };

    const response = await adapter.generate(request);

    assert.equal(callCount, 1);
    assert.equal(response.content, "plain text response");
    assert.equal(capturedInput.config?.responseMimeType, undefined);
    assert.equal(capturedInput.config?.responseJsonSchema, undefined);
});

test("Gemini in prompt_only mode fails fast when structuredOutput is unexpectedly provided", async () => {
    const adapter = createAdapter("prompt_only");
    let callCount = 0;

    (adapter as any).client = {
        models: {
            generateContent: async () => {
                callCount += 1;
                return {};
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "hi" }],
        structuredOutput: {
            name: "unexpected_output",
            schema: dummySchema,
        },
    };

    await assert.rejects(
        () => adapter.generate(request),
        (error: unknown) => {
            assert.ok(error instanceof LLMRequestModeMismatchError);
            assert.equal(error.code, "LLM_REQUEST_MODE_MISMATCH");
            return true;
        },
    );

    assert.equal(callCount, 0, "Network client must not be called when mode mismatches");
});

test("Gemini propagates SDK error directly without retry or fallback to prompt_only", async () => {
    const adapter = createAdapter("strict");
    let callCount = 0;
    const sdkError = new Error("Google Gen AI API Error: Schema compilation failure");

    (adapter as any).client = {
        models: {
            generateContent: async () => {
                callCount += 1;
                throw sdkError;
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "hi" }],
        structuredOutput: {
            name: "test_output",
            schema: dummySchema,
        },
    };

    await assert.rejects(
        () => adapter.generate(request),
        (error: unknown) => error === sdkError,
    );

    assert.equal(callCount, 1, "Must never retry or degrade upon SDK failure");
});

test("Gemini normalizes usageMetadata into providerMetadata.usage", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        models: {
            generateContent: async () => ({
                text: "ok",
                usageMetadata: {
                    promptTokenCount: 120,
                    candidatesTokenCount: 34,
                    totalTokenCount: 154,
                    cachedContentTokenCount: 50,
                },
            }),
        },
    };

    const response = await adapter.generate({
        messages: [{ role: "user", content: "hi" }],
    });

    assert.deepEqual(
        (response.providerMetadata as Record<string, unknown> | undefined)?.usage,
        {
            inputTokens: 120,
            outputTokens: 34,
            cachedInputTokens: 50,
        },
    );
});

test("Gemini omits cachedInputTokens when cachedContentTokenCount is absent", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        models: {
            generateContent: async () => ({
                text: "ok",
                usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 4,
                    totalTokenCount: 14,
                },
            }),
        },
    };

    const response = await adapter.generate({
        messages: [{ role: "user", content: "hi" }],
    });

    assert.deepEqual(
        (response.providerMetadata as Record<string, unknown> | undefined)?.usage,
        {
            inputTokens: 10,
            outputTokens: 4,
        },
    );
});

test("Gemini omits providerMetadata.usage when response has no usageMetadata", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        models: {
            generateContent: async () => ({
                text: "ok",
            }),
        },
    };

    const response = await adapter.generate({
        messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(
        (response.providerMetadata as Record<string, unknown> | undefined)?.usage,
        undefined,
    );
});

test("Gemini omits providerMetadata.usage when core token counts are non-finite or negative", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        models: {
            generateContent: async () => ({
                text: "ok",
                usageMetadata: {
                    promptTokenCount: Number.POSITIVE_INFINITY,
                    candidatesTokenCount: -3,
                    totalTokenCount: 0,
                },
            }),
        },
    };

    const response = await adapter.generate({
        messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(
        (response.providerMetadata as Record<string, unknown> | undefined)?.usage,
        undefined,
    );
});

test("Gemini passes abortSignal to generateContent config and handles abort cleanly", async () => {
    const adapter = createAdapter("strict");
    const controller = new AbortController();
    let capturedInput: any = undefined;

    (adapter as any).client = {
        models: {
            generateContent: async (params: any) => {
                capturedInput = params;
                return {
                    text: "ok",
                };
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "hi" }],
        structuredOutput: {
            name: "test_output",
            schema: dummySchema,
        },
    };

    await adapter.generate(request, { signal: controller.signal });
    assert.equal(capturedInput.config?.abortSignal, controller.signal);

    controller.abort();
    await assert.rejects(
        () => adapter.generate(request, { signal: controller.signal }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
});
