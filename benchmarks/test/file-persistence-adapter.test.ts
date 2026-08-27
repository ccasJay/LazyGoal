import assert from "node:assert/strict";
import {
    mkdtemp,
    readdir,
    readFile,
    rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    allocateDiagnosticTraceRecord,
    createGoal,
    type AgentProfile,
    type TrajectoryEventDraft,
} from "../../packages/runtime/src/index.js";
import {
    JsonFileBenchmarkPersistenceAdapter,
} from "../src/file-persistence-adapter.js";
import { readHeadlessTrajectoryAtSnapshot } from "../src/headless-composition-root.js";

const profile: AgentProfile = {
    id: "persistence-test",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

test("opens isolated LazyGoal stores and an optional trace sink per namespace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-benchmark-persistence-"));

    try {
        const adapter = new JsonFileBenchmarkPersistenceAdapter<{ readonly id: string }>({
            rootDirectory: directory,
            namespaceFor: (task) => task.id,
            enableTrace: true,
        });
        const first = await adapter.open({
            benchmarkId: "fake",
            namespace: adapter.namespaceFor({ id: "task/one" }),
            goalId: "goal-1",
            runId: "run-1",
        });
        const second = await adapter.open({
            benchmarkId: "fake",
            namespace: adapter.namespaceFor({ id: "task/two" }),
            goalId: "goal-2",
            runId: "run-2",
        });

        assert.ok(first.traceSink);
        assert.ok(second.traceSink);
        assert.notEqual(first.locator.goalSnapshot, second.locator.goalSnapshot);
        assert.notEqual(first.locator.trajectory, second.locator.trajectory);
        assert.notEqual(first.locator.diagnosticTrace, second.locator.diagnosticTrace);

        await first.goalStore.save(createGoal({
            id: "goal-1",
            intent: "first",
            promptBundleVersion: 3,
            profile,
            runId: "run-1",
            maxSteps: 1,
        }));
        const eventDraft: TrajectoryEventDraft = {
            goalId: "goal-1",
            runId: "run-1",
            phase: "gathering_context",
            eventType: "goal_created",
            payload: { type: "goal_created", intent: "first" },
        };
        await first.trajectoryStore.append(eventDraft);
        await first.traceSink!.append(allocateDiagnosticTraceRecord({
            goalId: "goal-1",
            runId: "run-1",
            kind: "test",
            payload: { source: "fake" },
        }));

        const restored = await first.goalStore.restore("goal-1");
        assert.equal(restored?.state.run.id, "run-1");
        assert.equal(
            (await first.trajectoryStore.read({ goalId: "goal-1", runId: "run-1" })).length,
            1,
        );
        assert.equal(await second.goalStore.restore("goal-1"), undefined);

        const goalFiles = await readdir(first.locator.goalSnapshot);
        const trajectoryGoalFiles = await readdir(first.locator.trajectory);
        const traceGoalFiles = await readdir(first.locator.diagnosticTrace!);
        assert.equal(goalFiles.length, 1);
        assert.equal(trajectoryGoalFiles.length, 1);
        assert.equal(traceGoalFiles.length, 1);

        const traceRunFiles = await readdir(
            join(first.locator.diagnosticTrace!, traceGoalFiles[0]!),
        );
        const traceContent = await readFile(
            join(
                first.locator.diagnosticTrace!,
                traceGoalFiles[0]!,
                traceRunFiles[0]!,
            ),
            "utf8",
        );
        assert.equal(JSON.parse(traceContent).runId, "run-1");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("encodes benchmark and task namespaces instead of allowing path traversal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-benchmark-safe-"));

    try {
        const adapter = new JsonFileBenchmarkPersistenceAdapter<{ readonly id: string }>({
            rootDirectory: directory,
            namespaceFor: () => "../../outside/task",
        });
        const bindings = await adapter.open({
            benchmarkId: "benchmark/../name",
            namespace: adapter.namespaceFor({ id: "ignored" }),
            goalId: "goal",
            runId: "run",
        });
        const event: TrajectoryEventDraft = {
            goalId: "goal",
            runId: "run",
            phase: "executing",
            eventType: "run_started",
            payload: { type: "run_started" },
        };
        const stored = await bindings.trajectoryStore.append(event);

        assert.equal(stored.sequence, 1);
        assert.equal(bindings.locator.trajectory.startsWith(directory), true);
        assert.equal(bindings.locator.trajectory.includes(".."), false);
        assert.equal(
            await bindings.trajectoryStore.read({ goalId: "goal", runId: "run" }).then((events) => events.length),
            1,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("reads trajectory using the latest Goal Snapshot boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-benchmark-boundary-"));

    try {
        const adapter = new JsonFileBenchmarkPersistenceAdapter<{ readonly id: string }>({
            rootDirectory: directory,
            namespaceFor: (task) => task.id,
        });
        const bindings = await adapter.open({
            benchmarkId: "fake",
            namespace: "task-1",
            goalId: "goal-1",
            runId: "run-1",
        });
        const goal = createGoal({
            id: "goal-1",
            intent: "boundary",
            promptBundleVersion: 3,
            profile,
            runId: "run-1",
            maxSteps: 1,
        });
        await bindings.goalStore.save({
            ...goal,
            state: {
                ...goal.state,
                run: {
                    ...goal.state.run,
                    committedThroughSequence: 2,
                },
            },
        });
        await bindings.trajectoryStore.append({
            goalId: "goal-1",
            runId: "run-1",
            phase: "gathering_context",
            eventType: "goal_created",
            payload: { type: "goal_created", intent: "boundary" },
        });
        await bindings.trajectoryStore.append({
            goalId: "goal-1",
            runId: "run-1",
            phase: "gathering_context",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 1 },
        });
        await bindings.trajectoryStore.append({
            goalId: "goal-1",
            runId: "run-1",
            phase: "planning",
            eventType: "run_waiting",
            payload: { type: "run_waiting", reason: "approval" },
        });

        const view = await readHeadlessTrajectoryAtSnapshot(
            bindings,
            { goalId: "goal-1", runId: "run-1" },
        );

        assert.deepEqual(view.committed.map((event) => event.sequence), [1, 2]);
        assert.deepEqual(view.uncommittedTail.map((event) => event.sequence), [3]);
        assert.equal(view.uncommittedTail[0]?.eventType, "run_waiting");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
