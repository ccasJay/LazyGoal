import { BASH_INPUT_CONTRACT, READ_FILE_INPUT_CONTRACT, WRITE_FILE_INPUT_CONTRACT, EDIT_FILE_INPUT_CONTRACT, GREP_INPUT_CONTRACT } from "../../tools/src/index";
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

test("Gemini SDK preserves complete phase schemas and all five tool branches", async () => {
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
                kind, authorizedTools: [
                    { id: "bash", inputContract: BASH_INPUT_CONTRACT },
                    { id: "read_file", inputContract: READ_FILE_INPUT_CONTRACT },
                    { id: "write_file", inputContract: WRITE_FILE_INPUT_CONTRACT },
                    { id: "edit_file", inputContract: EDIT_FILE_INPUT_CONTRACT },
                    { id: "grep", inputContract: GREP_INPUT_CONTRACT },
                ],
            } : { kind });
            const before = JSON.stringify(bundle.jsonSchema);
            await createAdapter("strict").generate({ messages: [{ role: "user", content: "Return JSON" }], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
            assert.equal(JSON.stringify(bundle.jsonSchema), before, "conversion must not mutate the shared contract");
            const config = sent.at(-1).generationConfig;
            assert.equal(config.responseJsonSchema, undefined);
            assert.ok(config.responseSchema);
            assert.equal(config.responseSchema.type, "OBJECT");

        }
    } finally {
        globalThis.fetch = originalFetch;
    }
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
    const promptOnlyAdapter = createAdapter("prompt_only");

    assert.equal(strictAdapter.structuredOutputMode, "strict");
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

test("Gemini preserves valid native completion evidence without rewriting", async () => {
    const bundle = createModelOutputContractBundle({ kind: "executing", authorizedTools: [] });
    const value = { result: { kind: "complete", summary: "Verified fix", memoryPatch: null,
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [96] }] } };
    const adapter = createAdapter("strict");
    const text = JSON.stringify(value);
    (adapter as any).client = { models: { generateContent: async () => ({ text }) } };
    const response = await adapter.generate({ messages: [], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
    assert.equal(response.content, text);
    assert.equal(bundle.decode(JSON.parse(response.content)).kind, "complete");
});

test("Gemini preserves and rejects invalid completion evidence formats", async () => {
    const bundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [{ id: "read_file", inputContract: contract.object({ path: contract.string() }) }],
    });
    const adapter = createAdapter("strict");
    let responseValue: unknown;
    (adapter as any).client = { models: { generateContent: async () => ({ text: JSON.stringify(responseValue) }) } };

    for (const completionEvidence of [
        "",
        "0:",
        "00:96",
        "-1:96",
        "0:96;0:97",
        "0:96,unsafe",
        [{ sequence: 96, kind: "tool_observation", summary: "old evidence" }],
    ]) {
        responseValue = {
            result: {
                kind: "complete",
                summary: "Task completed with verified evidence.",
                completionEvidence,
            },
        };
        const response = await adapter.generate({
            messages: [],
            structuredOutput: { name: bundle.name, schema: bundle.jsonSchema },
        });
        assert.deepEqual(JSON.parse(response.content), responseValue, JSON.stringify(completionEvidence));
        assert.throws(() => bundle.decode(JSON.parse(response.content)), JSON.stringify(completionEvidence));
    }
});

test("Gemini rejects non-placeholder completion evidence on tool calls", async () => {
    const bundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [{ id: "read_file", inputContract: contract.object({ path: contract.string() }) }],
    });
    const adapter = createAdapter("strict");
    const responseValue = {
        result: {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "README.md" } },
            completionEvidence: "0:96",
        },
    };
    (adapter as any).client = { models: { generateContent: async () => ({ text: JSON.stringify(responseValue) }) } };

    const response = await adapter.generate({
        messages: [],
        structuredOutput: { name: bundle.name, schema: bundle.jsonSchema },
    });
    assert.deepEqual(JSON.parse(response.content), responseValue);
    assert.throws(() => bundle.decode(JSON.parse(response.content)));
});

test("Gemini normalizes tool call and removes extraneous summary field", async () => {
    const bundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [{ id: "read_file", inputContract: contract.object({ path: contract.string() }) }],
    });
    const adapter = createAdapter("strict");
    const responseValue = {
        result: {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "README.md" } },
            summary: "a complete-only field",
            completionEvidence: "__lazygoal_absent__",
        },
    };
    (adapter as any).client = { models: { generateContent: async () => ({ text: JSON.stringify(responseValue) }) } };

    const response = await adapter.generate({
        messages: [],
        structuredOutput: { name: bundle.name, schema: bundle.jsonSchema },
    });
    const decoded = bundle.decode(JSON.parse(response.content));
    assert.equal(decoded.kind, "tool_call");
});

test("Gemini normalizes sentinel values and missing action into complete", async () => {
    const bundle = createModelOutputContractBundle({ kind: "executing", authorizedTools: [] });
    const text = JSON.stringify({
        result: { kind: "tool_call", summary: "Task completed with verified evidence.", memoryPatch: "__lazygoal_null__", completionEvidence: "0:96" },
    });
    const adapter = createAdapter("strict");
    (adapter as any).client = { models: { generateContent: async () => ({ text }) } };
    const response = await adapter.generate({ messages: [], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
    const wire = JSON.parse(response.content);
    assert.equal(wire.result.memoryPatch, null);
    const decoded = bundle.decode(wire);
    assert.equal(decoded.kind, "complete");
    assert.equal(decoded.memoryPatch, undefined);
});

test("Gemini leaves malformed JSON and missing non-nullable fields unchanged", async () => {
    const adapter = createAdapter("strict");
    let content = "not-json";
    (adapter as any).client = { models: { generateContent: async () => ({ text: content }) } };
    const request = { messages: [], structuredOutput: { name: "answer", schema: dummySchema } };
    assert.equal((await adapter.generate(request)).content, content);

    content = "{}";
    assert.equal((await adapter.generate(request)).content, content);
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


test("Gemini preserves executing Working Memory updates and rejects planning-only operations", async () => {
    const bundle = createModelOutputContractBundle({ kind: "executing", authorizedTools: [{ id: "bash", inputContract: BASH_INPUT_CONTRACT }] });
    const result = { kind: "tool_call", action: { actionId: "a", toolId: "bash", input: { command: "true", timeoutMs: null } },
        memoryPatch: { protocolVersion: 1, operations: [{ type: "upsert_fact", fact: {
            subject: "test", predicate: "status", value: "passed", stability: "stable", evidenceSequences: [5], scope: null,
        } }] } };
    const text = JSON.stringify({ result });
    const adapter = createAdapter("strict");
    (adapter as any).client = { models: { generateContent: async () => ({ text }) } };
    const response = await adapter.generate({ messages: [], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
    assert.equal(response.content, text);
    const decoded = bundle.decode(JSON.parse(response.content));
    assert.equal(decoded.kind, "tool_call");
    if (decoded.kind === "tool_call") assert.equal(decoded.memoryPatch?.operations[0]?.type, "upsert_fact");
    assert.ok(!JSON.stringify(bundle.jsonSchema).includes("create_plan_item"));
    assert.throws(() => bundle.decode({ result: { ...result, memoryPatch: { protocolVersion: 1, operations: [{ type: "create_plan_item" }] } } }));
});

test("Gemini strict Schema generates nullable required properties and unconstrained summary", async () => {
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
        const bundle = createModelOutputContractBundle({
            kind: "executing",
            authorizedTools: [{ id: "read_file", inputContract: contract.object({ path: contract.string() }) }],
        });
        const adapter = createAdapter("strict");
        await adapter.generate({
            messages: [{ role: "user", content: "hi" }],
            structuredOutput: { name: bundle.name, schema: bundle.jsonSchema },
        });

        const config = sent.at(-1).generationConfig;
        const schema = config.responseSchema;
        assert.ok(schema);
        const resultSchema = schema.properties.result;
        assert.ok(resultSchema);

        // 验证 Req 1.1: 关键属性全量进入 required
        const required = resultSchema.required as string[];
        assert.ok(required.includes("kind"));
        assert.ok(required.includes("action"));
        assert.ok(required.includes("summary"));
        assert.ok(required.includes("completionEvidence"));
        assert.ok(required.includes("memoryPatch"));

        // 验证 Req 1.1: action 为 nullable
        assert.equal(resultSchema.properties.action.nullable, true);

        // 验证 Req 1.2: summary 为 nullable 且无枚举
        assert.equal(resultSchema.properties.summary.nullable, true);
        assert.equal(resultSchema.properties.summary.enum, undefined);

        // 验证 Req 1.3: 保留 action 内部 AST 约束 (如 read_file 的 path)
        assert.ok(resultSchema.properties.action.properties.input);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("Gemini restores response and strips null properties for all branches", async () => {
    const bundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [{ id: "read_file", inputContract: contract.object({ path: contract.string() }) }],
    });
    const adapter = createAdapter("strict");

    // 1. complete 响应中附带 action: null
    const completeWithNullAction = {
        result: {
            kind: "complete",
            action: null,
            summary: "Finished the task",
            completionEvidence: "0:12",
            memoryPatch: null,
        },
    };
    (adapter as any).client = { models: { generateContent: async () => ({ text: JSON.stringify(completeWithNullAction) }) } };
    const res1 = await adapter.generate({ messages: [], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
    const parsed1 = JSON.parse(res1.content);
    assert.equal("action" in parsed1.result, false);
    const decoded1 = bundle.decode(parsed1);
    assert.equal(decoded1.kind, "complete");

    // 2. tool_call 响应中附带 summary: null, reason: null, error: null
    const toolCallWithNulls = {
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "read_file", input: { path: "a.txt" } },
            summary: null,
            reason: null,
            error: null,
            completionEvidence: "__lazygoal_absent__",
            memoryPatch: null,
        },
    };
    (adapter as any).client = { models: { generateContent: async () => ({ text: JSON.stringify(toolCallWithNulls) }) } };
    const res2 = await adapter.generate({ messages: [], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
    const parsed2 = JSON.parse(res2.content);
    assert.equal("summary" in parsed2.result, false);
    assert.equal("reason" in parsed2.result, false);
    assert.equal("error" in parsed2.result, false);
    assert.equal("completionEvidence" in parsed2.result, false);
    const decoded2 = bundle.decode(parsed2);
    assert.equal(decoded2.kind, "tool_call");
});

test("Gemini does not rollback on evidence sentinel and keeps corrupted output transparent", async () => {
    const bundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [{ id: "read_file", inputContract: contract.object({ path: contract.string() }) }],
    });
    const adapter = createAdapter("strict");

    // 响应包含证据哨兵值，反向模式匹配成功，不回退
    const validWithSentinel = {
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "read_file", input: { path: "a.txt" } },
            completionEvidence: "__lazygoal_absent__",
        },
    };
    (adapter as any).client = { models: { generateContent: async () => ({ text: JSON.stringify(validWithSentinel) }) } };
    const res = await adapter.generate({ messages: [], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
    assert.equal(JSON.parse(res.content).result.completionEvidence, undefined);
    assert.equal(bundle.decode(JSON.parse(res.content)).kind, "tool_call");

    // 响应严重违背契约（缺少 action 且无 summary），原样输出，严禁制造假数据，由 bundle.decode 明确抛出异常
    const invalidDecision = {
        result: {
            kind: "tool_call",
            action: null,
        },
    };
    (adapter as any).client = { models: { generateContent: async () => ({ text: JSON.stringify(invalidDecision) }) } };
    const resInvalid = await adapter.generate({ messages: [], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } });
    assert.throws(() => bundle.decode(JSON.parse(resInvalid.content)));
});

