import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    MUTABLE_PROMPT_TEMPLATE_IDS,
    PROMPT_EVALUATION_PROTOCOL,
    PromptEvaluationBenchmarkRegistry,
    PromptEvaluationRequestError,
    PromptEvaluationRunner,
    PromptTemplateOverrideError,
    fingerprintPromptEvaluationCandidate,
    loadAndVerifyPromptTemplateOverrides,
    normalizeTemplateOverrides,
    parsePromptEvaluationRequest,
} from "../src/index.js";
import type { LLMAdapter } from "../../packages/llm-core/src/index.js";

test("normalizeTemplateOverrides 仅允许白名单模板并按 key 字典序规范化", () => {
    assert.equal(normalizeTemplateOverrides(undefined), undefined);

    const normalized = normalizeTemplateOverrides({
        "run-mode@1": "Line 1\r\nLine 2",
        "global-overview@1": "Global Overview:\nContract text",
    });
    assert.deepEqual(Object.keys(normalized ?? {}), ["global-overview@1", "run-mode@1"]);
    assert.equal(normalized?.["run-mode@1"], "Line 1\nLine 2");

    assert.throws(
        () => normalizeTemplateOverrides({ "profile@1": "illegal override" }),
        (error: unknown) =>
            error instanceof PromptTemplateOverrideError
            && error.code === "UNSUPPORTED_TEMPLATE_ID"
            && error.templateId === "profile@1",
    );

    assert.throws(
        () => normalizeTemplateOverrides({ "global-overview@1": "   " }),
        (error: unknown) =>
            error instanceof PromptTemplateOverrideError
            && error.code === "EMPTY_TEMPLATE_SOURCE",
    );
});

test("loadAndVerifyPromptTemplateOverrides 对合法模板通过 Golden Fixture 试渲染，对缺失锚点或语法错误拒绝", async () => {
    const validRenderer = await loadAndVerifyPromptTemplateOverrides({
        "global-overview@1": "Global Overview:\nCustom invariant overview rules.",
        "agent-decision@1": "Active Decide Instructions: structured@1; trajectory-layered@1; bm25-lite@1\nCustom decide instructions.",
        "agent-think@1": "Active Think Instructions: free-text output; Memory structured@1; Context trajectory-layered@1; Retrieval bm25-lite@1\nCustom think instructions.",
    });
    assert.ok(validRenderer);

    await assert.rejects(
        () => loadAndVerifyPromptTemplateOverrides({
            "agent-decision@1": "Decide Instructions without protocol markers",
        }),
        (error: unknown) =>
            error instanceof PromptTemplateOverrideError
            && error.code === "GOLDEN_FIXTURE_ANCHOR_MISSING"
            && error.templateId === "agent-decision@1",
    );

    await assert.rejects(
        () => loadAndVerifyPromptTemplateOverrides({
            "authorized-tools@1": "Static text that drops section.projection interpolation",
        }),
        (error: unknown) =>
            error instanceof PromptTemplateOverrideError
            && error.code === "GOLDEN_FIXTURE_ANCHOR_MISSING"
            && error.templateId === "authorized-tools@1",
    );

    await assert.rejects(
        () => loadAndVerifyPromptTemplateOverrides({
            "run-mode@1": "{% if unclosed",
        }),
        (error: unknown) =>
            error instanceof PromptTemplateOverrideError
            && error.code === "TEMPLATE_COMPILE_ERROR",
    );
});

test("fingerprintPromptEvaluationCandidate 在无 templateOverrides 时保持原哈希，有覆盖时纳入指纹与摘要", () => {
    const baseCandidate = {
        systemPrompt: "Solve the issue.",
        instructions: ["Use authorized tools."],
    };
    const fpWithout = fingerprintPromptEvaluationCandidate(baseCandidate);
    assert.equal(fpWithout.promptSummary.overriddenTemplateIds, undefined);

    const fpWith = fingerprintPromptEvaluationCandidate({
        ...baseCandidate,
        templateOverrides: {
            "global-overview@1": "Global Overview:\nUpdated text",
        },
    });
    assert.notEqual(fpWith.promptSha256, fpWithout.promptSha256);
    assert.deepEqual(fpWith.promptSummary.overriddenTemplateIds, ["global-overview@1"]);
    assert.equal(MUTABLE_PROMPT_TEMPLATE_IDS.length, 5);
});

test("parsePromptEvaluationRequest 与 PromptEvaluationRunner 校验并传递 templateOverrides", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lg-template-override-test-"));
    try {
        const manifestPath = join(dir, "manifest.json");
        await writeFile(manifestPath, JSON.stringify({ tasks: ["task-1"] }), "utf8");

        const request = await parsePromptEvaluationRequest({
            protocol: PROMPT_EVALUATION_PROTOCOL,
            benchmark: { id: "mock-bench", manifestPath },
            candidate: {
                id: "cand-1",
                baseProfileId: "mock-profile",
                systemPrompt: "Solve carefully.",
                instructions: ["Check files."],
                templateOverrides: {
                    "global-overview@1": "Global Overview:\nEnhanced invariant rules.",
                },
            },
            model: { configId: "default", modelId: "mock-model" },
            outputDirectory: dir,
        });

        assert.deepEqual(request.candidate.templateOverrides, {
            "global-overview@1": "Global Overview:\nEnhanced invariant rules.",
        });

        await assert.rejects(
            () => parsePromptEvaluationRequest({
                protocol: PROMPT_EVALUATION_PROTOCOL,
                benchmark: { id: "mock-bench", manifestPath },
                candidate: {
                    id: "cand-2",
                    baseProfileId: "mock-profile",
                    systemPrompt: "Solve carefully.",
                    instructions: ["Check files."],
                    templateOverrides: {
                        "working-memory@1": "disallowed override",
                    },
                },
                model: { configId: "default", modelId: "mock-model" },
                outputDirectory: dir,
            }),
            (error: unknown) =>
                error instanceof PromptEvaluationRequestError
                && error.code === "INVALID_SCHEMA",
        );

        let receivedOverrides: Readonly<Record<string, string>> | undefined;
        const registry = new PromptEvaluationBenchmarkRegistry([
            {
                benchmarkId: "mock-bench",
                loadManifest: async () => [{ id: "task-1" }],
                loadBaseProfile: async () => ({
                    id: "mock-profile",
                    systemPrompt: "Base",
                    instructions: ["Base instruction"],
                    toolIds: ["read_file"],
                }),
                validateCandidateProfile: (p) => p,
                taskId: (t) => t.id,
                runTask: async (input) => {
                    receivedOverrides = input.templateOverrides;
                    return {
                        taskId: input.task.id,
                        status: "passed",
                        domainResult: { ok: true },
                        metricScore: 1.0,
                        attemptPath: null,
                        artifactLocator: null,
                        errors: [],
                    };
                },
            },
        ]);

        const runner = new PromptEvaluationRunner({ registry });
        const dummyAdapter = {
            provider: "mock",
            modelId: "mock-model",
            generate: async () => {
                throw new Error("not called");
            },
        } as unknown as LLMAdapter;

        const result = await runner.run(request, { llmAdapter: dummyAdapter });
        assert.equal(result.status, "completed");
        assert.deepEqual(receivedOverrides, {
            "global-overview@1": "Global Overview:\nEnhanced invariant rules.",
        });
        assert.deepEqual(result.promptSummary.overriddenTemplateIds, ["global-overview@1"]);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
