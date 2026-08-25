import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ExecutionAbortedError,
    type AgentProfile,
} from "../../../packages/runtime/src/index.js";
import {
    EvaluationRunner,
    createRunnerEpisodeExecutor,
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
    promptBundleVersion: 3,
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

test("Runner Episode executor assembles the isolated store, authorized tools and sidecar facts", async () => {
    let closed = 0;
    const executeEpisode = createRunnerEpisodeExecutor({
        profile,
        promptBundleVersion: 3,
        adapter: { generate: async () => ({ content: "" }) },
        renderer: { render: () => "" },
        contextCompactor: { compact: async (units) => units },
        workspaceRoot: "/workspace",
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
        createRunner: (dependencies) => ({
            async run(ref) {
                const goal = await dependencies.store.restore(ref.goalId);
                assert.ok(goal);
                const registry = dependencies.toolRegistry;
                assert.ok(registry);
                const reset = registry.get("alfworld_reset");
                const step = registry.get("alfworld_step");
                assert.ok(reset);
                assert.ok(step);
                await reset.execute({ actionId: "reset-1", input: {} });
                await step.execute({ actionId: "step-1", input: { command: "look" } });
                return {
                    ok: true,
                    state: {
                        ...goal.state.run,
                        status: "completed",
                        stepCount: 2,
                        lastStep: {
                            kind: "decision",
                            result: {
                                kind: "complete",
                                checkpoint: "won",
                                summary: "done",
                            },
                        },
                    },
                };
            },
        }),
    });

    const context: EpisodeExecutionContext = {
        task: manifest.tasks[0]!,
        profile,
    };
    const result = await executeEpisode(context);
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
