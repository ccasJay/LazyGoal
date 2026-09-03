import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    ExecutionAbortedError,
    TrajectoryAppendError,
    type AgentProfile,
    type Goal,
    type GoalStore,
    isExecutionAbortedError,
    type TrajectoryEvent,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
    type Tool,
} from "../../packages/runtime/src/index.js";
import { InMemoryGoalStore } from "../../packages/storage/src/index.js";
import {
    HeadlessCompositionRoot,
    HeadlessEpisodeCleanupError,
    type BenchmarkAdapter,
    type BenchmarkPersistenceAdapter,
    type HeadlessCompositionRootDependencies,
} from "../src/headless-composition-root.js";

const profile: AgentProfile = {
    id: "fake-profile",
    systemPrompt: "You are a test agent.",
    instructions: ["Use the available tools."],
    toolIds: ["benchmark_evidence"],
};

const evidenceTool: Tool = {
    definition: {
        id: "benchmark_evidence",
        description: "Produce a committed benchmark fact.",
        inputSchema: { type: "object" },
    },
    replayPolicy: "safe",
    validate: () => ({ ok: true }),
    execute: async () => ({
        kind: "success",
        output: "benchmark evidence",
        summary: "benchmark evidence recorded",
    }),
};

class InMemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    async append(draft: Parameters<TrajectoryStore["append"]>[0]): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(draft, this.events.length + 1);
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence),
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(
            await this.read(query),
            committedThroughSequence,
        );
    }
}

function createDependencies<TTask, TOutcome>(
    adapter: BenchmarkAdapter<TTask, TOutcome>,
    trajectoryStore: InMemoryTrajectoryStore,
): HeadlessCompositionRootDependencies<TTask, TOutcome> {
    const goalStore = new InMemoryGoalStore();
    const persistence: BenchmarkPersistenceAdapter<TTask> = {
        namespaceFor: () => "fake-task",
        open: async () => ({
            goalStore,
            trajectoryStore,
            locator: {
                goalSnapshot: "memory://fake/goal",
                trajectory: "memory://fake/trajectory",
            },
        }),
    };
    let modelCalls = 0;
    return {
        benchmarkId: "fake-benchmark",
        workspaceRoot: "/workspace",
        profile,
        llmAdapter: {
            generate: async () => {
                modelCalls += 1;
                return {
                    content: JSON.stringify(modelCalls === 1
                        ? {
                            kind: "tool_call",
                            action: {
                                actionId: "benchmark-evidence-1",
                                toolId: "benchmark_evidence",
                                input: {},
                            },
                        }
                        : {
                            kind: "complete",
                            summary: "done",
                            completionEvidence: [{
                                criterionIndex: 0,
                                evidenceSequences: [latestObservationSequence(trajectoryStore)],
                            }],
                        }),
                };
            },
        },
        renderer: { render: () => "system" },
        contextCompactor: { compact: async (units) => units },
        adapter: {
            describeTask: adapter.describeTask,
            createEpisode: async (task, context) => {
                const episode = await adapter.createEpisode(task, context);
                return {
                    ...episode,
                    registry: {
                        get(toolId: string): Tool | undefined {
                            return toolId === evidenceTool.definition.id
                                ? evidenceTool
                                : episode.registry.get(toolId);
                        },
                    },
                };
            },
        },
        persistence,
        goalIdGenerator: () => "goal-fake",
        runIdGenerator: () => "run-fake",
    };
}

function latestObservationSequence(
    trajectoryStore: InMemoryTrajectoryStore,
): number {
    const observation = [...trajectoryStore.events]
        .reverse()
        .find((event) => event.eventType === "observation_recorded");
    assert.ok(observation, "the benchmark completion must follow a committed observation");
    return observation.sequence;
}

test("runs a task through preparation, planning, approval and executing", async () => {
    type Task = { readonly prompt: string };
    type Outcome = { readonly answer: number };
    let created = 0;
    let closed = 0;
    const adapter: BenchmarkAdapter<Task, Outcome> = {
        describeTask: (task) => ({
            intent: task.prompt,
            objective: "Return the expected answer",
            completionCriteria: ["The test environment confirms the answer"],
            maxSteps: 5,
        }),
        createEpisode: async (_task, context) => {
            assert.equal(context.workspaceRoot, "/workspace");
            assert.equal(context.profile.id, profile.id);
            created += 1;
            return {
                registry: { get: () => undefined },
                readOutcome: () => ({ answer: 42 }),
                close: async () => {
                    closed += 1;
                },
            };
        },
    };
    const trajectoryStore = new InMemoryTrajectoryStore();
    const root = new HeadlessCompositionRoot(
        createDependencies(adapter, trajectoryStore),
    );

    const result = await root.run({ prompt: "Solve the test task" });

    assert.equal(created, 1);
    assert.equal(closed, 1);
    assert.equal(result.progress.ok, true);
    assert.equal(result.progress.kind, "terminal");
    assert.equal(result.goal.state.workflow.phase, "executing");
    assert.equal(result.goal.state.run.status, "completed");
    assert.equal(result.model.completed, true);
    assert.equal(result.model.runStatus, "completed");
    assert.deepEqual(result.outcome, { answer: 42 });
    assert.equal(result.runner?.ok, true);
    assert.deepEqual(
        trajectoryStore.events
            .filter((event) => event.eventType === "preparation_result")
            .map((event) => event.payload.result),
        ["context_ready", "task_proposal"],
    );
});

test("the same Root contract supports a different task and outcome shape", async () => {
    type Task = { readonly values: readonly number[] };
    type Outcome = { readonly accepted: boolean; readonly count: number };
    const adapter: BenchmarkAdapter<Task, Outcome> = {
        describeTask: (task) => ({
            intent: `Process ${task.values.length} values`,
            objective: "Process all values",
            completionCriteria: ["The environment accepts the values"],
            maxSteps: 2,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ accepted: true, count: 3 }),
            close: async () => undefined,
        }),
    };
    const root = new HeadlessCompositionRoot(
        createDependencies(adapter, new InMemoryTrajectoryStore()),
    );

    const result = await root.run({ values: [1, 2, 3] });

    assert.equal(result.model.completed, true);
    assert.deepEqual(result.outcome, { accepted: true, count: 3 });
});

test("reports a cleanup failure without changing a successful outcome", async () => {
    const cleanupError = new Error("environment close failed");
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a cleanup test",
            objective: "Finish the cleanup test",
            completionCriteria: ["The test environment accepts completion"],
            maxSteps: 2,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: true }),
            close: async () => {
                throw cleanupError;
            },
        }),
    };
    const root = new HeadlessCompositionRoot(
        createDependencies(adapter, new InMemoryTrajectoryStore()),
    );

    const result = await root.run({ id: "cleanup" });

    assert.equal(result.model.completed, true);
    assert.strictEqual(result.cleanupError, cleanupError);
    assert.deepEqual(result.outcome, { ok: true });
});

test("preserves the primary failure when execution and cleanup both fail", async () => {
    const primaryError = new Error("model failed");
    const cleanupError = new Error("environment close failed");
    const goalStore = new InMemoryGoalStore();
    let saveCalls = 0;
    const failingGoalStore: GoalStore = {
        save: async (goal: Goal) => {
            saveCalls += 1;
            if (saveCalls === 2) throw primaryError;
            await goalStore.save(goal);
        },
        restore: (goalId) => goalStore.restore(goalId),
    };
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a failure test",
            objective: "Reach the failure boundary",
            completionCriteria: ["The failure is reported"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                throw cleanupError;
            },
        }),
    };
    const dependencies = createDependencies(
        adapter,
        new InMemoryTrajectoryStore(),
    );
    dependencies.persistence.open = async () => ({
        goalStore: failingGoalStore,
        trajectoryStore: new InMemoryTrajectoryStore(),
        locator: {
            goalSnapshot: "memory://fake/goal",
            trajectory: "memory://fake/trajectory",
        },
    });
    dependencies.llmAdapter.generate = async () => ({
        content: JSON.stringify({
            kind: "complete",
            summary: "done",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [] }],
        }),
    });
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(
        () => root.run({ id: "failure" }),
        (error: unknown) => {
            assert.ok(error instanceof HeadlessEpisodeCleanupError);
            assert.strictEqual(error.primaryError, primaryError);
            assert.strictEqual(error.cleanupError, cleanupError);
            return true;
        },
    );
});

test("keeps abort semantics and closes an episode exactly once", async () => {
    const controller = new AbortController();
    let closed = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run an abort test",
            objective: "Stop after cancellation",
            completionCriteria: ["The call reports an abort"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                closed += 1;
            },
        }),
    };
    const dependencies = createDependencies(
        adapter,
        new InMemoryTrajectoryStore(),
    );
    dependencies.llmAdapter.generate = async () => {
        controller.abort();
        return {
            content: JSON.stringify({
                kind: "complete",
                summary: "should not commit",
                completionEvidence: [{ criterionIndex: 0, evidenceSequences: [] }],
            }),
        };
    };
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(
        () => root.run({ id: "abort" }, { signal: controller.signal }),
        (error: unknown) => {
            assert.equal(isExecutionAbortedError(error), true);
            assert.ok(error instanceof ExecutionAbortedError);
            return true;
        },
    );
    assert.equal(closed, 1);
});

test("does not create an Episode or call the model when persistence cannot open", async () => {
    const openError = new Error("persistence unavailable");
    let created = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run an open failure test",
            objective: "Do not start",
            completionCriteria: ["The persistence error is visible"],
            maxSteps: 1,
        }),
        createEpisode: async () => {
            created += 1;
            return {
                registry: { get: () => undefined },
                readOutcome: () => ({ ok: false }),
                close: async () => undefined,
            };
        },
    };
    const dependencies = createDependencies(adapter, new InMemoryTrajectoryStore());
    dependencies.persistence.open = async () => {
        throw openError;
    };
    let modelCalls = 0;
    dependencies.llmAdapter.generate = async () => {
        modelCalls += 1;
        return { content: "{}" };
    };
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(() => root.run({ id: "open-failure" }), openError);
    assert.equal(created, 0);
    assert.equal(modelCalls, 0);
});

test("reports a required Goal Snapshot write failure and closes the Episode", async () => {
    const saveError = new Error("snapshot write failed");
    let closed = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a snapshot failure test",
            objective: "Stop when the snapshot cannot be saved",
            completionCriteria: ["The write failure is reported"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                closed += 1;
            },
        }),
    };
    const dependencies = createDependencies(adapter, new InMemoryTrajectoryStore());
    const failingStore: GoalStore = {
        save: async () => {
            throw saveError;
        },
        restore: async () => undefined,
    };
    dependencies.persistence.open = async () => ({
        goalStore: failingStore,
        trajectoryStore: new InMemoryTrajectoryStore(),
        locator: {
            goalSnapshot: "memory://failure/goal",
            trajectory: "memory://failure/trajectory",
        },
    });
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(() => root.run({ id: "snapshot-failure" }), saveError);
    assert.equal(closed, 1);
});

test("stops before the model when the first Trajectory append fails", async () => {
    const trajectoryStore = new InMemoryTrajectoryStore();
    const trajectoryError = new Error("trajectory unavailable");
    trajectoryStore.append = async () => {
        throw trajectoryError;
    };
    let modelCalls = 0;
    let closed = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a trajectory failure test",
            objective: "Stop before execution",
            completionCriteria: ["The trajectory failure is reported"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                closed += 1;
            },
        }),
    };
    const dependencies = createDependencies(adapter, trajectoryStore);
    dependencies.llmAdapter.generate = async () => {
        modelCalls += 1;
        return { content: "{}" };
    };
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(
        () => root.run({ id: "trajectory-failure" }),
        (error: unknown) => {
            assert.ok(error instanceof TrajectoryAppendError);
            assert.equal(error.cause, trajectoryError);
            return true;
        },
    );
    assert.equal(modelCalls, 0);
    assert.equal(closed, 1);
});

test("isolates a Trace sink failure from the successful Runtime result", async () => {
    const traceError = new Error("trace unavailable");
    const trajectoryStore = new InMemoryTrajectoryStore();
    const dependencies = createDependencies(
        {
            describeTask: () => ({
                intent: "Run a trace failure test",
                objective: "Complete while trace is unavailable",
                completionCriteria: ["The Runtime completes"],
                maxSteps: 2,
            }),
            createEpisode: async () => ({
                registry: { get: () => undefined },
                readOutcome: () => ({ ok: true }),
                close: async () => undefined,
            }),
        },
        trajectoryStore,
    );
    dependencies.persistence.open = async () => ({
        goalStore: new InMemoryGoalStore(),
        trajectoryStore,
        traceSink: {
            append: async () => {
                throw traceError;
            },
        },
        locator: {
            goalSnapshot: "memory://trace/goal",
            trajectory: "memory://trace/trajectory",
            diagnosticTrace: "memory://trace/diagnostic",
        },
    });
    const root = new HeadlessCompositionRoot(dependencies);

    const result = await root.run({ id: "trace-failure" });

    assert.equal(result.model.completed, true);
    assert.equal(result.cleanupError, undefined);
});
