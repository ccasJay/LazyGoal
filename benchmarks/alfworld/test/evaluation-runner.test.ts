import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    ExecutionAbortedError,
    type AgentProfile,
} from "../../../packages/runtime/src/index.js";
import {
    EvaluationRunner,
    createAlfworldEpisodeExecutor,
    type EpisodeExecutionContext,
} from "../src/evaluation-runner.js";
import {
    serializeEvaluationReport,
    type EpisodeExecutionFacts,
    type EvaluationReportMetadata,
} from "../src/report.js";
import {
    ALFWORLD_MANIFEST_VERSION,
    type AlfworldManifest,
} from "../src/manifest.js";
import type {
    SidecarClient,
    SidecarResetResult,
    SidecarStepResult,
} from "../src/sidecar-client.js";

const profile: AgentProfile = {
    id: "alfworld-profile",
    systemPrompt: "ALFWorld evaluator",
    instructions: ["Use only authorized tools."],
    toolIds: ["read_file", "grep", "alfworld_reset", "alfworld_step"],
};

const manifest: AlfworldManifest = {
    version: ALFWORLD_MANIFEST_VERSION,
    name: "smoke",
    tasks: [
        {
            order: 0,
            taskId: "task-1",
            split: "valid_seen",
            gameFile: "valid_seen/task-1/game.tw-pddl",
            seed: 7,
            maxSteps: 10,
        },
    ],
};

const metadata: EvaluationReportMetadata = {
    manifest,
    profile,
    profileHash: "profile-hash",
    promptBundleVersion: 1,
    configId: "alfworld-textworld-v1",
    modelId: "fake-model",
};

function execution(
    environment: EpisodeExecutionFacts["environment"],
    model: EpisodeExecutionFacts["model"],
    failure?: EpisodeExecutionFacts["failure"],
): EpisodeExecutionFacts {
    return {
        environment,
        model,
        ...(failure === undefined ? {} : { failure }),
    };
}

test("environment won is authoritative when model returns complete", async () => {
    const evaluator = new EvaluationRunner({
        metadata,
        executeEpisode: async (_context: EpisodeExecutionContext) => execution(
            { done: false, won: false, steps: 2, goalConditionSuccessRate: 0.5 },
            { runStatus: "completed", completed: true },
        ),
    });

    const report = await evaluator.run();
    assert.equal(report.summary.successfulTasks, 0);
    assert.equal(report.summary.successRate, 0);
    assert.equal(report.attempts[0]?.failureCategory, "model_complete_without_win");
});

test("infrastructure retry appends a new attempt without replacing the original", async () => {
    let calls = 0;
    const evaluator = new EvaluationRunner({
        metadata,
        maxInfrastructureRetries: 1,
        executeEpisode: async () => {
            calls += 1;
            if (calls === 1) {
                return execution(
                    { done: false, won: false, steps: 1, goalConditionSuccessRate: 0 },
                    { runStatus: null, completed: false },
                    { category: "infrastructure", code: "PROCESS_EXITED" },
                );
            }
            return execution(
                { done: true, won: true, steps: 3, goalConditionSuccessRate: 1 },
                { runStatus: "completed", completed: true },
            );
        },
    });

    const report = await evaluator.run();
    assert.equal(calls, 2);
    assert.equal(report.attempts.length, 2);
    assert.deepEqual(
        report.attempts.map((attempt) => [attempt.retrySequence, attempt.won]),
        [[0, false], [1, true]],
    );
    assert.equal(report.attempts[0]?.errorCode, "PROCESS_EXITED");
    assert.equal(report.summary.successfulTasks, 1);
    assert.equal(report.summary.averageSteps, 3);
});

test("report serialization remains machine-readable and contains only bounded facts", async () => {
    const evaluator = new EvaluationRunner({
        metadata,
        executeEpisode: async () => execution(
            { done: true, won: true, steps: 4, goalConditionSuccessRate: 1 },
            { runStatus: "completed", completed: true },
        ),
    });
    const report = await evaluator.run();
    const serialized = serializeEvaluationReport(report);
    const parsed = JSON.parse(serialized) as typeof report;

    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.summary.successRate, 1);
    assert.equal(serialized.includes("apiKey"), false);
    assert.equal(serialized.endsWith("\n"), true);
});

async function withTempPersistence<T>(run: (persistenceRoot: string) => Promise<T>): Promise<T> {
    const persistenceRoot = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-test-"));
    try {
        return await run(persistenceRoot);
    } finally {
        await rm(persistenceRoot, { recursive: true, force: true });
    }
}

function decision(content: unknown): string {
    return JSON.stringify(content);
}

test("ALFWorld adapter runs through the headless Root with authorized tools and facts", async () => {
    await withTempPersistence(async (persistenceRoot) => {
        let closed = 0;
        const responses: unknown[] = [
            {
                kind: "tool_call",
                action: { actionId: "reset-1", toolId: "alfworld_reset", input: {} },
            },
            {
                kind: "tool_call",
                action: { actionId: "step-1", toolId: "alfworld_step", input: { command: "look" } },
            },
            {
                kind: "complete",
                summary: "environment won",
                completionEvidence: [{ criterionIndex: 0, evidenceSequences: [24] }],
            },
        ];
        const executeEpisode = createAlfworldEpisodeExecutor({
            profile,
            adapter: {
                generate: async () => {
                    const next = responses.shift();
                    if (next === undefined) throw new Error("fake LLM responses exhausted");
                    return { content: decision(next) };
                },
            },
            renderer: { render: () => "system" },
            contextCompactor: { compact: async (units) => units },
            workspaceRoot: process.cwd(),
            persistenceRoot,
            enableTrace: true,
            createClient: () => ({
                async reset(): Promise<SidecarResetResult> {
                    return {
                        taskId: "task-1",
                        gameFile: "valid_seen/task-1/game.tw-pddl",
                        observation: "initial",
                        admissibleCommands: ["look"],
                    };
                },
                async step(): Promise<SidecarStepResult> {
                    return {
                        observation: "won",
                        done: true,
                        won: true,
                        goalConditionSuccessRate: 1,
                        admissibleCommands: [],
                        accepted: true,
                        error: null,
                    };
                },
                async close(): Promise<void> {
                    closed += 1;
                },
            }),
            goalIdFactory: () => "goal-alfworld",
            runIdFactory: () => "run-alfworld",
        });

        const result = await executeEpisode({
            task: manifest.tasks[0]!,
            profile,
        });
        assert.deepEqual(result.environment, {
            done: true,
            won: true,
            steps: 1,
            goalConditionSuccessRate: 1,
        });
        assert.deepEqual(result.model, { runStatus: "completed", completed: true });
        assert.equal(result.failure, undefined);
        assert.equal(closed, 1);
    });
});

test("ALFWorld model completion without an environment win remains evaluator-owned", async () => {
    await withTempPersistence(async (persistenceRoot) => {
        const responses: unknown[] = [
            {
                kind: "tool_call",
                action: { actionId: "reset-1", toolId: "alfworld_reset", input: {} },
            },
            {
                kind: "complete",
                summary: "claimed",
                completionEvidence: [{ criterionIndex: 0, evidenceSequences: [17] }],
            },
        ];
        let responseIndex = 0;
        const executeEpisode = createAlfworldEpisodeExecutor({
            profile,
            adapter: {
                generate: async () => ({
                    content: decision(responses[responseIndex++ % responses.length]),
                }),
            },
            renderer: { render: () => "system" },
            contextCompactor: { compact: async (units) => units },
            workspaceRoot: process.cwd(),
            persistenceRoot,
            createClient: () => ({
                async reset(): Promise<SidecarResetResult> {
                    return {
                        taskId: "task-1",
                        gameFile: "valid_seen/task-1/game.tw-pddl",
                        observation: "initial",
                        admissibleCommands: [],
                    };
                },
                async step(): Promise<SidecarStepResult> {
                    throw new Error("step should not be called");
                },
                async close(): Promise<void> {},
            }),
        });
        const result = await executeEpisode({ task: manifest.tasks[0]!, profile });
        assert.deepEqual(result.environment, {
            done: false,
            won: false,
            steps: 0,
            goalConditionSuccessRate: 0,
        });
        assert.deepEqual(result.model, { runStatus: "completed", completed: true });
        assert.equal(result.failure, undefined);

        const evaluator = new EvaluationRunner({
            metadata,
            executeEpisode,
        });
        const report = await evaluator.run();
        assert.equal(report.attempts[0]?.failureCategory, "model_complete_without_win");
    });
});

test("ALFWorld sidecar errors remain infrastructure failures", async () => {
    await withTempPersistence(async (persistenceRoot) => {
        const executeEpisode = createAlfworldEpisodeExecutor({
            profile,
            adapter: {
                generate: async () => ({
                    content: decision({
                        kind: "tool_call",
                        action: { actionId: "reset-1", toolId: "alfworld_reset", input: {} },
                    }),
                }),
            },
            renderer: { render: () => "system" },
            contextCompactor: { compact: async (units) => units },
            workspaceRoot: process.cwd(),
            persistenceRoot,
            createClient: () => ({
                async reset(): Promise<SidecarResetResult> {
                    throw new Error("sidecar reset failed");
                },
                async step(): Promise<SidecarStepResult> {
                    throw new Error("step should not be called");
                },
                async close(): Promise<void> {},
            }),
        });
        const result = await executeEpisode({ task: manifest.tasks[0]!, profile });
        assert.deepEqual(result.failure, {
            category: "infrastructure",
            code: "TOOL_EXECUTION_ERROR",
        });
    });
});

test("ALFWorld max-step and model-fail termination keep report failure semantics", async () => {
    await withTempPersistence(async (persistenceRoot) => {
        const resetClient = (): Pick<SidecarClient, "reset" | "step" | "close"> => ({
            async reset(): Promise<SidecarResetResult> {
                return {
                    taskId: "task-1",
                    gameFile: "valid_seen/task-1/game.tw-pddl",
                    observation: "initial",
                    admissibleCommands: [],
                };
            },
            async step(): Promise<SidecarStepResult> {
                throw new Error("step should not be called");
            },
            async close(): Promise<void> {},
        });
        const maxStepExecutor = createAlfworldEpisodeExecutor({
            profile,
            adapter: {
                generate: async () => ({
                    content: decision({
                        kind: "tool_call",
                        action: { actionId: "reset-1", toolId: "alfworld_reset", input: {} },
                    }),
                }),
            },
            renderer: { render: () => "system" },
            contextCompactor: { compact: async (units) => units },
            workspaceRoot: process.cwd(),
            persistenceRoot: join(persistenceRoot, "max-step"),
            createClient: () => resetClient(),
        });
        const maxStepTask = { ...manifest.tasks[0]!, maxSteps: 1 };
        const maxStepResult = await maxStepExecutor({ task: maxStepTask, profile });
        assert.deepEqual(maxStepResult.failure, {
            category: "task_not_won",
            code: "MAX_STEPS_EXCEEDED",
        });

        const modelFailExecutor = createAlfworldEpisodeExecutor({
            profile,
            adapter: {
                generate: async () => ({
                    content: decision({ kind: "fail", error: "model failed" }),
                }),
            },
            renderer: { render: () => "system" },
            contextCompactor: { compact: async (units) => units },
            workspaceRoot: process.cwd(),
            persistenceRoot: join(persistenceRoot, "model-fail"),
            createClient: () => resetClient(),
        });
        const modelFailResult = await modelFailExecutor({ task: manifest.tasks[0]!, profile });
        assert.deepEqual(modelFailResult.failure, {
            category: "task_not_won",
            code: "MODEL_FAILED",
        });
    });
});

test("evaluation abort stops before the next task and does not create a fake attempt", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const evaluator = new EvaluationRunner({
        metadata,
        executeEpisode: async () => {
            calls += 1;
            return execution(
                { done: true, won: true, steps: 1, goalConditionSuccessRate: 1 },
                { runStatus: "completed", completed: true },
            );
        },
    });

    await assert.rejects(
        evaluator.run(controller.signal),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.equal(calls, 0);
});
