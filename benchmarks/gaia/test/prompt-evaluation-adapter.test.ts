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
    GAIA_DEFAULT_MAX_STEPS,
    GAIA_WORKER_PROFILE,
    parseGaiaAcpTaskMetadata,
    projectGaiaAcpResult,
} from "../src/worker-entry.js";
import { GaiaManifestValidationError } from "../src/manifest.js";
import { GaiaPromptEvaluationAdapter } from "../src/prompt-evaluation-adapter.js";
import { runGaiaSupervisor } from "../src/supervisor.js";
import type { GaiaDomainResult, GaiaManifestTask } from "../src/types.js";

const testDataRoot = await mkdtemp(join(tmpdir(), "gaia-adapter-test-root-"));

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

test("GAIA Worker 默认不设置执行步数上限", () => {
    assert.equal(GAIA_DEFAULT_MAX_STEPS, 0);
});

test("GAIA ACP 不把普通未提交结果伪装为 max_turn_requests", () => {
    const response = projectGaiaAcpResult({
        goal: { state: { run: { status: "completed", stepCount: 2 } } },
        progress: { ok: true, kind: "terminal", phase: "executing" },
        runner: { ok: true, state: { status: "completed", stepCount: 2 } },
        model: { completed: false, runStatus: "completed" },
        outcome: { submitted: false, submittedAnswer: null },
        persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
    } as never);

    assert.equal(response.stopReason, "end_turn");
});

test("GAIA ACP 将 INVALID_AGENT_DECISION 映射为 end_turn 并记录 executionError", () => {
    const response = projectGaiaAcpResult({
        goal: {
            state: {
                run: {
                    status: "failed",
                    stepCount: 5,
                    stopReason: {
                        kind: "execution_error",
                        code: "INVALID_AGENT_DECISION",
                        message: "Action ID repeated",
                    },
                },
            },
        },
        progress: { ok: true, kind: "terminal", phase: "executing" },
        runner: { ok: true, state: { status: "failed", stepCount: 5 } },
        model: { completed: false, runStatus: "failed" },
        outcome: { submitted: false, submittedAnswer: null },
        persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
    } as never);

    assert.equal(response.stopReason, "end_turn");
    assert.equal(response.meta?.executionError, "INVALID_AGENT_DECISION");
    assert.equal(response.meta?.submitted, false);
});

test("GAIA Prompt Evaluation adapter forwards candidate identity and uses domain score", async () => {
    let receivedDataRoot: string | undefined;
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: testDataRoot,
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

    assert.equal(receivedDataRoot, testDataRoot);
    assert.equal(result.status, "passed");
    assert.equal(result.domainResult?.correct, true);
    assert.equal(result.attemptPath, "/output/task-1/attempt.json");
});

test("GAIA Prompt Evaluation adapter maps an authoritative wrong answer to failed", async () => {
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: "/data/gaia",
            dataRoot: testDataRoot,
            tasks: [task],
        }),
        runSupervisor: async () => supervisorResult({ correct: false }),
    });
    await adapter.loadManifest("/manifest.json");

    const result = await adapter.runTask({
        evaluationId: "eval-wrong-answer",
        candidateId: "candidate-wrong-answer",
        modelConfigId: "default",
        modelId: "model-1",
        task,
        baseProfile: GAIA_WORKER_PROFILE,
        profile: candidateProfile,
        fingerprint: fingerprintPromptEvaluationCandidate(candidateProfile),
        outputDirectory: "/output/task-1",
        llmAdapter,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.domainResult?.correct, false);
});

test("GAIA Prompt Evaluation adapter does not turn infrastructure errors into scores", async () => {
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: "/data/gaia",
            dataRoot: testDataRoot,
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

test("GAIA Prompt Evaluation adapter treats agent failure as infrastructure, not a domain score", async () => {
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: "/data/gaia",
            dataRoot: testDataRoot,
            tasks: [task],
        }),
        runSupervisor: async () => ({
            ...supervisorResult({ correct: false }),
            status: "failed",
            errors: [{ stage: "agent", message: "LLM RPC failed" }],
        }),
    });
    await adapter.loadManifest("/manifest.json");

    const result = await adapter.runTask({
        evaluationId: "eval-agent-failure",
        candidateId: "candidate-agent-failure",
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

test("GAIA Prompt Evaluation adapter rejects non-existent dataRoot on loadManifest", async () => {
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: join(testDataRoot, "non-existent-dir"),
            tasks: [task],
        }),
    });
    await assert.rejects(
        () => adapter.loadManifest("/manifest.json"),
        (err: Error) => err instanceof GaiaManifestValidationError && err.code === "DATA_ROOT_NOT_FOUND",
    );
});

test("GAIA Prompt Evaluation adapter rejects non-existent or escaping attachment on loadManifest", async () => {
    const adapter = new GaiaPromptEvaluationAdapter({
        loadManifestFile: async () => ({
            source: "huggingface",
            loadedAt: "2026-09-20T00:00:00.000Z",
            dataRoot: testDataRoot,
            tasks: [{ ...task, attachments: ["missing.file"] }],
        }),
    });
    await assert.rejects(
        () => adapter.loadManifest("/manifest.json"),
        (err: Error) => err instanceof GaiaManifestValidationError && err.code === "ATTACHMENT_NOT_FOUND",
    );
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
    assert.throws(
        () => parseGaiaAcpTaskMetadata({
            ...metadata,
            structuredOutputMode: "prompt_only",
        }),
        /structuredOutputMode must be strict/,
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

test("GAIA Supervisor rejects mismatched answer artifacts without producing a domain score", async (t) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-gaia-mismatch-"));
    t.after(() => rm(outputDirectory, { recursive: true, force: true }));
    const isolatedEnvironment = {
        async run() {
            return {
                status: "completed" as const,
                artifact: {
                    submittedAnswer: "42",
                    answerTaskId: "another-task",
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
    });

    assert.equal(result.status, "infrastructure_error");
    assert.equal(result.domainResult.correct, null);
    assert.equal(result.errors[0]?.code, "ANSWER_TASK_MISMATCH");
    const attempt = await readBenchmarkAttempt<GaiaDomainResult>(result.attemptPath);
    assert.equal(attempt.domainResult.correct, null);
    assert.equal(attempt.artifactLocator?.goalSnapshot, "goal.json");
});

test("GAIA Supervisor preserves ACP stop reason when answer artifact is missing", async (t) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-gaia-missing-answer-"));
    t.after(() => rm(outputDirectory, { recursive: true, force: true }));
    const isolatedEnvironment = {
        async run() {
            return {
                status: "completed" as const,
                artifact: {
                    submittedAnswer: null,
                    answerTaskId: null,
                    persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
                    errors: [{ stage: "result_read" as const, message: "answer.json is missing" }],
                },
                imageId: null,
                acp: {
                    sessionId: "session-1",
                    stopReason: "max_turn_requests" as const,
                    meta: {
                        modelCompleted: true,
                        runStatus: "completed",
                        stepCount: 2,
                        submitted: false,
                    },
                },
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
    });

    assert.equal(result.status, "infrastructure_error");
    assert.deepEqual(
        result.errors.map((error) => `${error.code}:${error.message}`),
        [
            "result_read:answer.json is missing",
            "ACP_STOP_REASON:ACP prompt ended with stopReason=max_turn_requests, modelCompleted=true, runStatus=completed, stepCount=2",
        ],
    );
});

test("GAIA Supervisor 将 INVALID_AGENT_DECISION 模型决策失败判定为 completed 且 correct 为 false 的领域失败", async (t) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-gaia-invalid-decision-"));
    t.after(() => rm(outputDirectory, { recursive: true, force: true }));
    const isolatedEnvironment = {
        async run() {
            return {
                status: "completed" as const,
                artifact: {
                    submittedAnswer: null,
                    answerTaskId: null,
                    persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
                    errors: [{ stage: "result_read" as const, message: "answer.json is missing" }],
                },
                imageId: null,
                acp: {
                    sessionId: "session-1",
                    stopReason: "end_turn" as const,
                    meta: {
                        modelCompleted: false,
                        runStatus: "failed",
                        stepCount: 5,
                        submitted: false,
                        executionError: "INVALID_AGENT_DECISION",
                    },
                },
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
    });

    assert.equal(result.status, "completed");
    assert.equal(result.domainResult.correct, false);
    assert.equal(result.domainResult.submittedAnswer, null);
    const attempt = await readBenchmarkAttempt<GaiaDomainResult>(result.attemptPath);
    assert.equal(attempt.domainResult.correct, false);
    assert.equal(attempt.status, "completed");
});

test("GAIA Supervisor 将 TASK_TIMEOUT 超时判定为 completed 且 correct 为 false 的领域失败并保留轨迹", async (t) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-gaia-task-timeout-"));
    t.after(() => rm(outputDirectory, { recursive: true, force: true }));
    const isolatedEnvironment = {
        async run() {
            return {
                status: "failed" as const,
                artifact: {
                    submittedAnswer: null,
                    answerTaskId: null,
                    persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
                    errors: [{ stage: "result_read" as const, message: "answer.json is missing" }],
                },
                imageId: null,
                acp: {
                    sessionId: "session-1",
                    stopReason: "cancelled" as const,
                    meta: {
                        modelCompleted: false,
                        runStatus: "failed",
                        stepCount: 15,
                        submitted: false,
                    },
                },
                errors: [
                    { stage: "agent" as const, code: "TASK_TIMEOUT", message: "Task exceeded timeout of 300000ms" },
                ],
            };
        },
    } as unknown as IsolatedEnvironment;

    const result = await runGaiaSupervisor({
        task,
        dataRoot: "/data/gaia",
        outputDirectory,
        llmAdapter,
        isolatedEnvironment,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.domainResult.correct, false);
    assert.equal(result.domainResult.submittedAnswer, null);
    assert.deepEqual(result.persistence, { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" });
    const attempt = await readBenchmarkAttempt<GaiaDomainResult>(result.attemptPath);
    assert.equal(attempt.domainResult.correct, false);
    assert.equal(attempt.status, "completed");
    assert.deepEqual(attempt.artifactLocator, { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" });
});

test("GAIA Supervisor 将真正基础设施故障判定为 infrastructure_error 且无领域得分", async (t) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-gaia-infra-error-"));
    t.after(() => rm(outputDirectory, { recursive: true, force: true }));
    const isolatedEnvironment = {
        async run() {
            return {
                status: "infrastructure_error" as const,
                artifact: null,
                imageId: null,
                acp: null,
                errors: [
                    { stage: "container_start" as const, message: "Docker daemon unavailable" },
                ],
            };
        },
    } as unknown as IsolatedEnvironment;

    const result = await runGaiaSupervisor({
        task,
        dataRoot: "/data/gaia",
        outputDirectory,
        llmAdapter,
        isolatedEnvironment,
    });

    assert.equal(result.status, "infrastructure_error");
    assert.equal(result.domainResult.correct, null);
    assert.equal(result.domainResult.submittedAnswer, null);
    const attempt = await readBenchmarkAttempt<GaiaDomainResult>(result.attemptPath);
    assert.equal(attempt.status, "infrastructure_error");
    assert.equal(attempt.domainResult.correct, null);
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
