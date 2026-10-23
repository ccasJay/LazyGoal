import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm-core/src/index.js";
import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";
import { readBenchmarkAttempt } from "../../src/attempt-recorder.js";
import { fingerprintPromptEvaluationCandidate } from "../../src/prompt-evaluation/profile.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import type { SwebenchTask } from "../src/container.js";
import {
    SwebenchPromptEvaluationAdapter,
    type SwebenchPromptEvaluationDomainResult,
    type SwebenchPromptEvaluationTask,
} from "../src/prompt-evaluation-adapter.js";
import { scoreRuntimeTrajectoryEvents } from "../src/runtime-error-scorer.js";
import {
    SWE_ACP_PROFILE,
    parseSwebenchAcpTaskMetadata,
    validateSwebenchPromptEvaluationProfile,
} from "../src/worker-runtime.js";

const sampleTask: SwebenchTask = {
    instance_id: "astropy__astropy-12907",
    repo: "astropy/astropy",
    base_commit: "d16bfe05a744909de4b27f5875fe0d4ed41ce607",
    problem_statement: "Modeling's `separability_matrix` does not compute separability correctly for nested CompoundModels",
    hints_text: "",
    version: "4.3",
    environment_setup_commit: "298ccb478e6bf092953bca67a3d29dc6c35f6752",
    FAIL_TO_PASS: ["astropy/modeling/tests/test_separable.py::test_cm_4d_expected"],
    PASS_TO_PASS: [],
    patch: "",
    test_patch: "",
    image_name: "sweb.eval.x86_64.astropy_1776_astropy-12907:latest",
};

const sampleEvaluationTask: SwebenchPromptEvaluationTask = {
    task: sampleTask,
    maxSteps: 30,
    taskTimeoutSeconds: 900,
    testTimeoutSeconds: 600,
};

const workerArtifact: WorkerArtifact = {
    bundlePath: "/tmp/worker.mjs",
    manifestPath: "/tmp/worker-manifest.json",
    manifest: {
        schemaVersion: 1,
        entryPoint: "benchmarks/swebench/src/worker.ts",
        bundleSha256: "a".repeat(64),
        sourceDigest: "b".repeat(64),
        promptAssets: {},
        nodeVersion: "v22.0.0",
        builtAt: "2026-10-23T00:00:00.000Z",
    },
};

const llmAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    async generate() {
        throw new Error("not used in unit test");
    },
};

test("validateSwebenchPromptEvaluationProfile and parseSwebenchAcpTaskMetadata accept candidate profile and templateOverrides", () => {
    const candidateProfile: AgentProfile = {
        ...SWE_ACP_PROFILE,
        systemPrompt: "Fix the bug in /testbed using read_file, edit_file, write_file, grep, and bash.",
        instructions: [
            "Inspect the target files before editing.",
            "Run targeted pytest checks using bash after modifying files.",
        ],
    };

    const validated = validateSwebenchPromptEvaluationProfile(candidateProfile);
    assert.equal(validated.systemPrompt, candidateProfile.systemPrompt);

    const parsedMeta = parseSwebenchAcpTaskMetadata({
        instanceId: sampleTask.instance_id,
        repo: sampleTask.repo,
        baseCommit: sampleTask.base_commit,
        problemStatement: sampleTask.problem_statement,
        goalId: "goal-1",
        runId: "run-1",
        maxSteps: 30,
        structuredOutputMode: "strict",
        baseProfile: SWE_ACP_PROFILE,
        profile: candidateProfile,
        templateOverrides: {
            "global-overview@1": "# Custom Global Overview\nYou are an autonomous agent.",
        },
    });

    assert.equal(parsedMeta.profile?.systemPrompt, candidateProfile.systemPrompt);
    assert.equal(
        parsedMeta.templateOverrides?.["global-overview@1"],
        "# Custom Global Overview\nYou are an autonomous agent.",
    );
});

test("parseSwebenchAcpTaskMetadata rejects locked template overrides and unauthorized tool removal", () => {
    assert.throws(
        () =>
            parseSwebenchAcpTaskMetadata({
                instanceId: sampleTask.instance_id,
                repo: sampleTask.repo,
                baseCommit: sampleTask.base_commit,
                problemStatement: sampleTask.problem_statement,
                goalId: "goal-1",
                runId: "run-1",
                maxSteps: 30,
                structuredOutputMode: "strict",
                templateOverrides: {
                    "working-memory@1": "illegal override",
                },
            }),
        /MUTABLE_PROMPT_TEMPLATE_IDS/,
    );

    assert.throws(
        () =>
            validateSwebenchPromptEvaluationProfile({
                ...SWE_ACP_PROFILE,
                systemPrompt: "Only use bash and read_file in /testbed.",
                instructions: ["Edit files."],
            }),
        /write_file/,
    );
});

test("SwebenchPromptEvaluationAdapter forwards profile and templateOverrides and records runtimeHealth score", async (t) => {
    const tempDir = await mkdtemp(join(tmpdir(), "lg-swe-pe-adapter-"));
    t.after(() => rm(tempDir, { recursive: true, force: true }));

    const manifestPath = join(tempDir, "manifest.json");
    await writeFile(
        manifestPath,
        JSON.stringify({
            dataset: "princeton-nlp/SWE-bench_Verified",
            revision: "a".repeat(40),
            maxSteps: 30,
            taskTimeoutSeconds: 900,
            testTimeoutSeconds: 600,
            instanceIds: [sampleTask.instance_id],
        }),
        "utf8",
    );

    let capturedMeta: Record<string, unknown> | undefined;
    const cleanHealth = scoreRuntimeTrajectoryEvents({
        events: [],
        runStatus: "completed",
        stopReason: "end_turn",
        patch: "diff --git a/a.py b/a.py\n+x = 1\n",
    });

    const adapter = new SwebenchPromptEvaluationAdapter({
        workerArtifact,
        loadTasksFromManifest: async () => [sampleTask],
        runSupervisor: async (options) => {
            capturedMeta = options.metadata;
            return {
                instanceId: sampleTask.instance_id,
                goalId: String(options.metadata["goalId"]),
                runId: String(options.metadata["runId"]),
                imageName: sampleTask.image_name,
                imageId: "sha256:1234",
                sessionId: "sess-1",
                stopReason: "end_turn",
                meta: { runStatus: "completed", stepCount: 4 },
                patch: "diff --git a/a.py b/a.py\n+x = 1\n",
                patchPath: null,
                persistence: {
                    goalSnapshot: "runtime/goals",
                    trajectory: "runtime/trajectories",
                    diagnosticTrace: "runtime/traces",
                },
                errors: [],
            };
        },
        scoreTrajectory: async () => cleanHealth,
    });

    const tasks = await adapter.loadManifest(manifestPath);
    assert.equal(tasks.length, 1);
    assert.equal(adapter.taskId(tasks[0]!), sampleTask.instance_id);

    const candidate = {
        id: "cand-swe-1",
        baseProfileId: SWE_ACP_PROFILE.id,
        systemPrompt: SWE_ACP_PROFILE.systemPrompt,
        instructions: SWE_ACP_PROFILE.instructions,
        templateOverrides: {
            "run-mode@1": "# Execution Protocol\n## Current Run Mode\nMode: `{{ mode }}`",
        },
    };
    const fingerprint = fingerprintPromptEvaluationCandidate(candidate);

    const taskOutputDir = join(tempDir, "task-out");
    const result = await adapter.runTask({
        evaluationId: "eval-swe-1",
        candidateId: candidate.id,
        modelConfigId: "default",
        modelId: "test-model",
        task: sampleEvaluationTask,
        baseProfile: SWE_ACP_PROFILE,
        profile: SWE_ACP_PROFILE,
        templateOverrides: candidate.templateOverrides,
        fingerprint,
        outputDirectory: taskOutputDir,
        llmAdapter,
    });

    assert.equal(result.status, "passed");
    assert.equal(result.metricScore, 1.0);
    assert.equal(result.domainResult?.runtimeHealth.zeroFaultPass, true);
    assert.deepEqual(capturedMeta?.["templateOverrides"], candidate.templateOverrides);
    assert.ok(result.attemptPath !== null);

    const attempt = await readBenchmarkAttempt<SwebenchPromptEvaluationDomainResult>(result.attemptPath);
    assert.equal(attempt.benchmarkId, "swebench");
    assert.equal(attempt.promptEvaluation?.candidateId, "cand-swe-1");
    assert.deepEqual(attempt.promptEvaluation?.promptSummary.overriddenTemplateIds, ["run-mode@1"]);
    assert.equal(attempt.domainResult.runtimeHealth.runtimeScore, 1.0);
});
