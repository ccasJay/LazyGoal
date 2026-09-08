import assert from "node:assert/strict";
import { test } from "node:test";
import { contract, createModelOutputContractBundle } from "../../contracts/src/index";

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

test("Gemini SDK serializes every LazyGoal phase with typed enums and nullable unions", async () => {
    const originalFetch = globalThis.fetch;
    const sent: any[] = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        sent.push(JSON.parse(await request.text()));
        return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "{}" }] }, finishReason: "STOP" }] }), {
            headers: { "Content-Type": "application/json" },
        });
    };
    try {
        for (const kind of ["gathering", "planning", "executing", "checkpoint"] as const) {
            const bundle = createModelOutputContractBundle(kind === "executing" ? {
                kind, authorizedTools: [{ id: "shell", inputContract: contract.object({ command: contract.string() }) }],
            } : { kind });
            const before = JSON.stringify(bundle.jsonSchema);
            await createAdapter("strict").generate({ messages: [{ role: "user", content: "Return JSON" }], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
            assert.equal(JSON.stringify(bundle.jsonSchema), before, "conversion must not mutate the shared contract");
            const config = sent.at(-1).generationConfig;
            assert.equal(config.responseJsonSchema, undefined);
            let nullableCount = 0;
            let versionCount = 0;
            function inspect(node: any) {
                assert.equal(node.additionalProperties, undefined);
                if (node.enum) assert.equal(node.type, "STRING");
                if (node.nullable) nullableCount++;
                if (node.minimum === 1 && node.maximum === 1) {
                    assert.equal(node.type, "INTEGER");
                    versionCount++;
                }
                if (node.properties) Object.values(node.properties).forEach(inspect);
                if (node.items) inspect(node.items);
                if (node.anyOf) node.anyOf.forEach(inspect);
            }
            inspect(config.responseSchema);
            assert.equal(config.responseSchema.type, "OBJECT");
            assert.ok(nullableCount > 0, kind);
            assert.ok(versionCount > 0, kind);
        }
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("Gemini retains numeric enum values as numeric constraints and rejects unsupported enum kinds", async () => {
    const adapter = createAdapter("strict");
    let captured: any;
    (adapter as any).client = { models: { generateContent: async (input: any) => {
        captured = input;
        return { text: "{}" };
    } } };
    await adapter.generate({ messages: [], structuredOutput: { name: "numbers", schema: {
        type: "object", properties: { choice: { enum: [1, 2.5] } }, required: ["choice"], additionalProperties: false,
    } } });
    assert.deepEqual(captured.config.responseSchema.properties.choice, { anyOf: [
        { type: "integer", minimum: 1, maximum: 1 },
        { type: "number", minimum: 2.5, maximum: 2.5 },
    ] });
    captured = undefined;
    await assert.rejects(adapter.generate({ messages: [], structuredOutput: { name: "boolean", schema: {
        type: "object", properties: { fixed: { enum: [true] } }, required: ["fixed"], additionalProperties: false,
    } } }), /only supports string or numeric enums/);
    assert.equal(captured, undefined);
});

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

test("Gemini in strict mode maps structuredOutput to responseMimeType and responseSchema", async () => {
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
    assert.deepEqual(capturedInput.config?.responseSchema, dummySchema);
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

test("Gemini in prompt_only mode does not send native schema parameters", async () => {
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
    assert.equal(capturedInput.config?.responseSchema, undefined);
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

test("Gemini native adapter applies configured output limit unless request overrides it", async () => {
    const adapter = new Gemini({ apiKey: "key", model: "model", structuredOutputMode: "strict", maxOutputTokens: 512 });
    const limits: number[] = [];
    (adapter as any).client = { models: { generateContent: async (params: any) => {
        limits.push(params.config.maxOutputTokens);
        return { text: "{}" };
    } } };
    const request = { messages: [{ role: "user" as const, content: "hi" }], structuredOutput: { name: "answer", schema: dummySchema } };
    await adapter.generate(request);
    await adapter.generate({ ...request, maxOutputTokens: 128 });
    assert.deepEqual(limits, [512, 128]);
});
