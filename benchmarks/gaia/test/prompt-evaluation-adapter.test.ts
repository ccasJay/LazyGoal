import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm/src/core/adapter.js";
import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";
import { readBenchmarkAttempt } from "../../src/attempt-recorder.js";
import type { IsolatedEnvironment } from "../../src/isolated-environment.js";
import { fingerprintPromptEvaluationCandidate } from "../../src/prompt-evaluation/profile.js";
import {
    GAIA_WORKER_PROFILE,
    parseGaiaAcpTaskMetadata,
} from "../src/worker-entry.js";
import { GaiaPromptEvaluationAdapter } from "../src/prompt-evaluation-adapter.js";
import { runGaiaSupervisor } from "../src/supervisor.js";
import type { GaiaDomainResult, GaiaManifestTask } from "../src/types.js";

const task: GaiaManifestTask = {
    taskId: "gaia-task-1",
    question: "What is six times seven?",
    expectedAnswer: "42",
    level: 1,
    split: "validation",
    attachments: [],
};

const candidateProfile: AgentProfile = {
    ...GAIA_WORKER_PROFILE,
    systemPrompt: "Solve the GAIA question and submit a concise verified answer.",
    instructions: [
        "Use read_file for local evidence.",
        "Use web_search and web_fetch when external evidence is required.",
        "Call submit_answer exactly once with the final answer.",
    ],
};

const llmAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    async generate() { throw new Error("not used"); },
};

test("GAIA Prompt Evaluation adapter forwards candidate identity and uses domain score", async () => {
    let receivedDataRoot: string | undefined;
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: "/data/gaia",
            tasks: [task],
        }),
        runSupervisor: async (options) => {
            receivedDataRoot = options.dataRoot;
            assert.deepEqual(options.baseProfile, GAIA_WORKER_PROFILE);
            assert.deepEqual(options.profile, candidateProfile);
            assert.equal(options.promptEvaluation?.candidateId, "candidate-1");
            return supervisorResult({ correct: true });
        },
    });
    await adapter.loadManifest("/manifest.json");
    const candidate = {
        id: "candidate-1",
        baseProfileId: GAIA_WORKER_PROFILE.id,
        systemPrompt: candidateProfile.systemPrompt,
        instructions: candidateProfile.instructions,
    };

    const result = await adapter.runTask({
        evaluationId: "eval-1",
        candidateId: candidate.id,
        modelConfigId: "default",
        modelId: "model-1",
        task,
        baseProfile: GAIA_WORKER_PROFILE,
        profile: candidateProfile,
        fingerprint: fingerprintPromptEvaluationCandidate(candidate),
        outputDirectory: "/output/task-1",
        llmAdapter,
    });

    assert.equal(receivedDataRoot, "/data/gaia");
    assert.equal(result.status, "passed");
    assert.equal(result.domainResult?.correct, true);
    assert.equal(result.attemptPath, "/output/task-1/attempt.json");
});

test("GAIA Prompt Evaluation adapter does not turn infrastructure errors into scores", async () => {
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: "/data/gaia",
            tasks: [task],
        }),
        runSupervisor: async () => ({
            ...supervisorResult({ correct: false }),
            status: "infrastructure_error",
        }),
    });
    await adapter.loadManifest("/manifest.json");

    const result = await adapter.runTask({
        evaluationId: "eval-2",
        candidateId: "candidate-2",
        modelConfigId: "default",
        modelId: "model-1",
        task,
        baseProfile: GAIA_WORKER_PROFILE,
        profile: candidateProfile,
        fingerprint: fingerprintPromptEvaluationCandidate(candidateProfile),
        outputDirectory: "/output/task-1",
        llmAdapter,
    });

    assert.equal(result.status, "infrastructure_error");
    assert.equal(result.domainResult, null);
});

test("GAIA Worker accepts paired Prompt profiles and rejects frozen-field drift", () => {
    const metadata = baseMetadata();
    const parsed = parseGaiaAcpTaskMetadata({
        ...metadata,
        baseProfile: GAIA_WORKER_PROFILE,
        profile: candidateProfile,
    });
    assert.deepEqual(parsed.profile, candidateProfile);

    assert.throws(
        () => parseGaiaAcpTaskMetadata({
            ...metadata,
            baseProfile: GAIA_WORKER_PROFILE,
            profile: { ...candidateProfile, toolIds: ["submit_answer"] },
        }),
        /toolIds/,
    );
});

test("GAIA Supervisor persists Prompt Evaluation identity in Attempt", async (t) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-gaia-prompt-"));
    t.after(() => rm(outputDirectory, { recursive: true, force: true }));
    const isolatedEnvironment = {
        async run() {
            return {
                status: "completed" as const,
                artifact: {
                    submittedAnswer: "42",
                    answerTaskId: task.taskId,
                    persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
                    errors: [],
                },
                imageId: null,
                acp: null,
                errors: [],
            };
        },
    } as unknown as IsolatedEnvironment;

    const result = await runGaiaSupervisor({
        task,
        dataRoot: "/data/gaia",
        outputDirectory,
        llmAdapter,
        isolatedEnvironment,
        baseProfile: GAIA_WORKER_PROFILE,
        profile: candidateProfile,
        promptEvaluation: {
            evaluationId: "eval-3",
            candidateId: "candidate-3",
            baseProfileId: GAIA_WORKER_PROFILE.id,
            promptSha256: "a".repeat(64),
            promptSummary: {
                systemPromptCharacters: candidateProfile.systemPrompt.length,
                instructionCount: candidateProfile.instructions.length,
                instructionCharacters: candidateProfile.instructions.join("").length,
            },
            modelConfigId: "default",
            modelId: "model-1",
        },
    });

    const attempt = await readBenchmarkAttempt<GaiaDomainResult>(result.attemptPath);
    assert.equal(attempt.promptEvaluation?.candidateId, "candidate-3");
    assert.equal(attempt.domainResult.correct, true);
    assert.equal(attempt.artifactLocator?.trajectory, "trajectory.jsonl");
});

function baseMetadata(): Record<string, unknown> {
    return {
        ...task,
        goalId: "goal-1",
        runId: "run-1",
        structuredOutputMode: "strict",
    };
}

function supervisorResult(
    values: { readonly correct: boolean },
): import("../src/supervisor.js").GaiaSupervisorResult {
    const domainResult: GaiaDomainResult = {
        submittedAnswer: values.correct ? "42" : "41",
        correct: values.correct,
        normalizedAnswer: values.correct ? "42" : "41",
        normalizedExpected: "42",
        level: 1,
    };
    return {
        status: "completed",
        taskId: task.taskId,
        goalId: "goal-1",
        runId: "run-1",
        durationMs: 10,
        domainResult,
        persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
        errors: [],
        attemptPath: "/output/task-1/attempt.json",
    };
}
