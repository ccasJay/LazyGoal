import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    type AgentProfile,
    type TrajectoryEvent,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../../packages/runtime/src/index.js";
import { InMemoryGoalStore } from "../../packages/storage/src/index.js";
import {
    HeadlessCompositionRoot,
    type BenchmarkAdapter,
    type BenchmarkPersistenceAdapter,
    type HeadlessCompositionRootDependencies,
} from "../src/headless-composition-root.js";

const profile: AgentProfile = {
    id: "fake-profile",
    systemPrompt: "You are a test agent.",
    instructions: ["Use the available tools."],
    toolIds: [],
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
    return {
        benchmarkId: "fake-benchmark",
        workspaceRoot: "/workspace",
        profile,
        promptBundleVersion: 3,
        llmAdapter: {
            generate: async () => ({
                content: JSON.stringify({
                    kind: "complete",
                    checkpoint: "done",
                    summary: "done",
                }),
            }),
        },
        renderer: { render: () => "system" },
        contextCompactor: { compact: async (units) => units },
        adapter,
        persistence,
        goalIdGenerator: () => "goal-fake",
        runIdGenerator: () => "run-fake",
    };
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
            maxSteps: 1,
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
