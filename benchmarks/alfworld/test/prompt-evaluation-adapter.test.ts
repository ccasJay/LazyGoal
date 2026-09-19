import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm/src/core/adapter.js";
import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";
import { readBenchmarkAttempt } from "../../src/attempt-recorder.js";
import { fingerprintPromptEvaluationCandidate } from "../../src/prompt-evaluation-profile.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import type { AlfworldContainerEnvironmentConfig } from "../src/environment-config.js";
import type { AlfworldManifestTask } from "../src/manifest.js";
import { ALFWORLD_PROFILE_TOOL_IDS } from "../src/profile.js";
import { AlfworldPromptEvaluationAdapter } from "../src/prompt-evaluation-adapter.js";

const task: AlfworldManifestTask = {
    order: 0,
    taskId: "task-1",
    split: "valid_seen",
    gameFile: "valid_seen/task-1/game.tw-pddl",
    seed: 1,
    maxSteps: 20,
};

const baseProfile: AgentProfile = {
    id: "alfworld-profile",
    name: "ALFWorld",
    description: "Prompt evaluation fixture",
    systemPrompt: "Base system Prompt",
    instructions: [
        "Call alfworld_reset first.",
        "Call alfworld_step once per decision.",
        "Do not use Bash; complete only when won=true.",
    ],
    toolIds: ALFWORLD_PROFILE_TOOL_IDS,
};

const candidateProfile: AgentProfile = {
    ...baseProfile,
    systemPrompt: "Candidate system Prompt",
    instructions: [
        "Call alfworld_reset before acting.",
        "Use alfworld_step for one admissible action.",
        "Never use Bash and finish only after won=true.",
    ],
};

const environment: AlfworldContainerEnvironmentConfig = {
    environmentName: "fixture",
    pythonExecutable: "python3",
    dataRoot: "/tmp/data",
    alfworldVersion: "0.4.2",
    textworldVersion: "1.6.2",
    condaSubdir: undefined,
    textworldOnly: true,
};

const llmAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    async generate() { throw new Error("not used"); },
};

test("ALFWorld Prompt Evaluation adapter forwards candidate Profile and persists won outcome", async (t) => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-prompt-"));
    t.after(() => rm(outputDirectory, { recursive: true, force: true }));
    const supervisorProfiles: AgentProfile[] = [];
    const adapter = new AlfworldPromptEvaluationAdapter({
        workspaceRoot: "/workspace",
        environment,
        workerArtifact: {} as WorkerArtifact,
        loadManifestFile: async () => ({ version: 1, name: "fixture", tasks: [task] }),
        loadProfile: async () => ({ profile: baseProfile, profilePath: "/profile.json", contentHash: "a".repeat(64) }),
        runSupervisor: async (options) => {
            assert.deepEqual(options.baseProfile, baseProfile);
            assert.deepEqual(options.profile, candidateProfile);
            supervisorProfiles.push(options.profile!);
            return {
                status: "completed",
                taskId: task.taskId,
                goalId: "goal-1",
                runId: "run-1",
                imageId: "sha256:image",
                environment: { done: true, won: true, steps: 4, goalConditionSuccessRate: 1 },
                model: {
                    runStatus: "completed",
                    completed: true,
                    usage: { inputTokens: 10, outputTokens: 2, missingCalls: 0 },
                },
                persistence: { goalSnapshot: "goal.json", trajectory: "trajectory.jsonl" },
                acp: null,
                errors: [],
            };
        },
        now: (() => {
            let value = 100;
            return () => value += 10;
        })(),
    });
    const candidate = {
        id: "candidate-1",
        baseProfileId: baseProfile.id,
        systemPrompt: candidateProfile.systemPrompt,
        instructions: candidateProfile.instructions,
    };

    const result = await adapter.runTask({
        evaluationId: "eval-1",
        candidateId: candidate.id,
        modelConfigId: "default",
        modelId: "model-1",
        task,
        baseProfile,
        profile: candidateProfile,
        fingerprint: fingerprintPromptEvaluationCandidate(candidate),
        outputDirectory,
        llmAdapter,
    });

    assert.equal(supervisorProfiles.length, 1);
    assert.equal(result.status, "passed");
    assert.deepEqual(result.domainResult, {
        won: true,
        steps: 4,
        goalConditionSuccessRate: 1,
        failureCategory: null,
        errorCode: null,
    });
    const attempt = await readBenchmarkAttempt(result.attemptPath!);
    assert.equal(attempt.promptEvaluation?.candidateId, "candidate-1");
    assert.equal(attempt.promptEvaluation?.modelId, "model-1");
    assert.equal(attempt.artifactLocator?.goalSnapshot, "goal.json");
});

test("ALFWorld Prompt Evaluation adapter retains environment won as the only pass authority", async () => {
    const adapter = new AlfworldPromptEvaluationAdapter({
        workspaceRoot: "/workspace",
        environment,
        workerArtifact: {} as WorkerArtifact,
        loadProfile: async () => ({ profile: baseProfile, profilePath: "/profile.json", contentHash: "a".repeat(64) }),
        runSupervisor: async () => ({
            status: "completed",
            taskId: task.taskId,
            goalId: "goal-2",
            runId: "run-2",
            imageId: null,
            environment: { done: false, won: false, steps: 3, goalConditionSuccessRate: 0.5 },
            model: { runStatus: "completed", completed: true },
            persistence: null,
            acp: null,
            errors: [],
        }),
    });
    const root = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-prompt-"));
    try {
        const result = await adapter.runTask({
            evaluationId: "eval-2",
            candidateId: "candidate-2",
            modelConfigId: "default",
            modelId: "model-1",
            task,
            baseProfile,
            profile: candidateProfile,
            fingerprint: fingerprintPromptEvaluationCandidate(candidateProfile),
            outputDirectory: root,
            llmAdapter,
        });
        assert.equal(result.status, "failed");
        assert.equal(result.domainResult?.won, false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
