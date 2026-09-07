import assert from "node:assert/strict";
import { test } from "node:test";

import { ExecutionAbortedError } from "../../runtime/src/execution-control";
import { OpenAICompatible } from "../src/openai-compatible";
import {
    LLMRequestModeMismatchError,
    type LLMRequest,
} from "../src/core/types";

const dummySchema = {
    type: "object" as const,
    properties: {
        answer: { type: "string" as const },
    },
    required: ["answer"],
    additionalProperties: false,
};

function createAdapter(mode: "strict" | "prompt_only") {
    return new OpenAICompatible({
        apiKey: "test-api-key",
        baseURL: "http://127.0.0.1:9999/v1",
        model: "test-model-name",
        structuredOutputMode: mode,
    });
}

test("OpenAICompatible exposes configured structuredOutputMode immutably", () => {
    const strictAdapter = createAdapter("strict");
    assert.equal(strictAdapter.structuredOutputMode, "strict");

    const promptOnlyAdapter = createAdapter("prompt_only");
    assert.equal(promptOnlyAdapter.structuredOutputMode, "prompt_only");
});

test("OpenAICompatible in strict mode maps structuredOutput to response_format.json_schema with strict: true", async () => {
    const adapter = createAdapter("strict");
    let capturedParams: any = undefined;
    let callCount = 0;

    (adapter as any).client = {
        chat: {
            completions: {
                create: async (params: any) => {
                    callCount += 1;
                    capturedParams = params;
                    return {
                        id: "chatcmpl-123",
                        model: "test-model-name",
                        created: 123456789,
                        choices: [
                            {
                                message: {
                                    content: JSON.stringify({ answer: "hello" }),
                                },
                                finish_reason: "stop",
                            },
                        ],
                    };
                },
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
    assert.equal(response.content, JSON.stringify({ answer: "hello" }));
    assert.equal(capturedParams.model, "test-model-name");
    assert.deepEqual(capturedParams.response_format, {
        type: "json_schema",
        json_schema: {
            name: "test_output",
            schema: dummySchema,
            strict: true,
        },
    });
});

test("OpenAICompatible in strict mode fails fast when structuredOutput is missing without calling client", async () => {
    const adapter = createAdapter("strict");
    let callCount = 0;

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => {
                    callCount += 1;
                    return {};
                },
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

test("OpenAICompatible in prompt_only mode does not send response_format parameter", async () => {
    const adapter = createAdapter("prompt_only");
    let capturedParams: any = undefined;
    let callCount = 0;

    (adapter as any).client = {
        chat: {
            completions: {
                create: async (params: any) => {
                    callCount += 1;
                    capturedParams = params;
                    return {
                        id: "chatcmpl-456",
                        model: "test-model-name",
                        created: 123456789,
                        choices: [
                            {
                                message: { content: "plain text response" },
                                finish_reason: "stop",
                            },
                        ],
                    };
                },
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "hi" }],
    };

    const response = await adapter.generate(request);

    assert.equal(callCount, 1);
    assert.equal(response.content, "plain text response");
    assert.equal(capturedParams.response_format, undefined);
});

test("OpenAICompatible in prompt_only mode fails fast when structuredOutput is unexpectedly provided", async () => {
    const adapter = createAdapter("prompt_only");
    let callCount = 0;

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => {
                    callCount += 1;
                    return {};
                },
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

test("OpenAICompatible propagates SDK error directly without retry or fallback to prompt_only", async () => {
    const adapter = createAdapter("strict");
    let callCount = 0;
    const sdkError = new Error("400 Bad Request: Invalid schema according to OpenAI specifications");

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => {
                    callCount += 1;
                    throw sdkError;
                },
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

test("OpenAICompatible normalizes response usage into providerMetadata.usage", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => ({
                    id: "chatcmpl-usage-1",
                    model: "test-model-name",
                    created: 123456789,
                    choices: [
                        {
                            message: { content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 120,
                        completion_tokens: 34,
                        total_tokens: 154,
                        prompt_tokens_details: { cached_tokens: 50 },
                    },
                }),
            },
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

test("OpenAICompatible omits cachedInputTokens when prompt_tokens_details is absent", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => ({
                    id: "chatcmpl-usage-2",
                    model: "test-model-name",
                    created: 123456789,
                    choices: [
                        {
                            message: { content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 4,
                        total_tokens: 14,
                    },
                }),
            },
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

test("OpenAICompatible omits providerMetadata.usage when response carries no usage", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => ({
                    id: "chatcmpl-usage-3",
                    model: "test-model-name",
                    created: 123456789,
                    choices: [
                        {
                            message: { content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                }),
            },
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

test("OpenAICompatible omits providerMetadata.usage when core token counts are non-finite or negative", async () => {
    const adapter = createAdapter("prompt_only");

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => ({
                    id: "chatcmpl-usage-4",
                    model: "test-model-name",
                    created: 123456789,
                    choices: [
                        {
                            message: { content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: Number.NaN,
                        completion_tokens: -3,
                        total_tokens: 0,
                    },
                }),
            },
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

test("OpenAICompatible passes abortSignal to create call and handles abort cleanly", async () => {
    const adapter = createAdapter("strict");
    const controller = new AbortController();
    let capturedOptions: any = undefined;

    (adapter as any).client = {
        chat: {
            completions: {
                create: async (_params: any, options: any) => {
                    capturedOptions = options;
                    return {
                        choices: [{ message: { content: "ok" } }],
                    };
                },
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
    assert.equal(capturedOptions?.signal, controller.signal);

    controller.abort();
    await assert.rejects(
        () => adapter.generate(request, { signal: controller.signal }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
});
