import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
    createGoal,
    createEmptyGoalPlan,
    GoalCoordinator,
    reduceGoalPlan,
    TrajectoryCommitMarkerError,
    transition,
    type AgentProfile,
    type Goal,
    type GoalStore,
    type GoalProgressResult,
    type RunRef,
    type RunScheduler,
    type RunnerResult,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";
import {
    JsonFileGoalStore,
    JsonFileTrajectoryStore,
} from "../../storage/src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "multi-run-recovery-profile",
    systemPrompt: "Recover one Goal across persisted Runs.",
    instructions: [],
    toolIds: [],
};

function completedGoal(id: string, mode: "normal" | "plan" = "normal"): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        intent: "首轮输入",
        promptBundleVersion: 1,
        profile,
        runId: "run-1",
        mode,
    });
    const started = transition(created.state.run, { kind: "start" });
    if (!started.ok) throw new Error(started.error.message);
    const completed = transition(started.state, {
        kind: "decision",
        decision: { kind: "complete", summary: "首轮完成", completionEvidence: [] },
    });
    if (!completed.ok) throw new Error(completed.error.message);

    return {
        ...created,
        state: {
            ...created.state,
            run: completed.state,
        },
    };
}

class ThrowingScheduler implements RunScheduler {
    readonly receivedRefs: RunRef[] = [];

    constructor(private readonly failure: Error) {}

    async schedule(ref: RunRef): Promise<RunnerResult> {
        this.receivedRefs.push(ref);
        throw this.failure;
    }
}

class WaitingScheduler implements RunScheduler {
    readonly receivedRefs: RunRef[] = [];

    constructor(private readonly store: GoalStore) {}

    async schedule(ref: RunRef): Promise<RunnerResult> {
        this.receivedRefs.push(ref);
        const goal = await this.store.restore(ref.goalId);
        assert.ok(goal);
        assert.equal(goal.state.run.id, ref.runId);
        const started = transition(goal.state.run, { kind: "start" });
        if (!started.ok) throw new Error(started.error.message);
        const waiting = transition(started.state, {
            kind: "decision",
            decision: { kind: "wait", reason: "等待下一条输入" },
        });
        if (!waiting.ok) throw new Error(waiting.error.message);
        const next = {
            ...goal,
            state: { ...goal.state, run: waiting.state },
        };
        await this.store.save(next);
        return { ok: true, state: next.state.run };
    }
}

class FailingSaveStore implements GoalStore {
    failNextSave = false;

    constructor(
        private readonly delegate: GoalStore,
        private readonly failure: Error,
    ) {}

    async save(goal: Goal): Promise<void> {
        if (this.failNextSave) {
            this.failNextSave = false;
            throw this.failure;
        }
        await this.delegate.save(goal);
    }

    restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }
}

class MarkerFailingTrajectoryStore implements TrajectoryStore {
    constructor(
        private readonly delegate: TrajectoryStore,
        private readonly runId: string,
        private readonly failure: Error,
    ) {}

    append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        if (draft.runId === this.runId && draft.eventType === "state_committed") {
            return Promise.reject(this.failure);
        }
        return this.delegate.append(draft);
    }

    read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.delegate.read(query);
    }

    readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return this.delegate.readWithBoundary(query, committedThroughSequence);
    }
}

test("JSON Snapshot survives Scheduler failure and a restarted Coordinator resumes the saved Run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-multi-run-recovery-"));
    try {
        const goalDirectory = join(directory, "goals");
        const trajectoryDirectory = join(directory, "trajectory");
        const store = new JsonFileGoalStore(goalDirectory);
        const trajectory = new JsonFileTrajectoryStore(trajectoryDirectory);
        const initial = completedGoal("goal-scheduler-recovery");
        await store.save(initial);
        const schedulerFailure = new Error("scheduler unavailable");
        const failingScheduler = new ThrowingScheduler(schedulerFailure);
        const firstCoordinator = new GoalCoordinator({
            store,
            scheduler: failingScheduler,
            trajectoryStore: trajectory,
            runIdGenerator: () => "run-2",
        });

        await assert.rejects(
            firstCoordinator.continue(
                { goalId: initial.id, runId: initial.state.run.id },
                "恢复后继续执行",
            ),
            (error: unknown) => error === schedulerFailure,
        );
        assert.deepEqual(failingScheduler.receivedRefs, [{
            goalId: initial.id,
            runId: "run-2",
        }]);

        const restartedStore = new JsonFileGoalStore(goalDirectory);
        const savedAfterFailure = await restartedStore.restore(initial.id);
        assert.ok(savedAfterFailure);
        assert.equal(savedAfterFailure.state.run.id, "run-2");
        assert.equal(savedAfterFailure.state.run.status, "created");
        assert.deepEqual(savedAfterFailure.state.messages.at(-1), {
            role: "user",
            content: "恢复后继续执行",
        });
        assert.deepEqual(savedAfterFailure.state.completedRuns, [{
            runId: "run-1",
            stepCount: 1,
            committedThroughSequence: 0,
            messageRange: { start: 0, end: 1 },
        }]);

        const restartedScheduler = new WaitingScheduler(restartedStore);
        const restartedCoordinator = new GoalCoordinator({
            store: restartedStore,
            scheduler: restartedScheduler,
            trajectoryStore: new JsonFileTrajectoryStore(trajectoryDirectory),
            runIdGenerator: () => "run-3",
        });
        const recovered = await restartedCoordinator.advance({
            goalId: initial.id,
            runId: "run-2",
        });
        assert.equal(recovered.ok, true);
        if (!recovered.ok) return;
        assert.equal(recovered.kind, "waiting");
        assert.deepEqual(restartedScheduler.receivedRefs, [{
            goalId: initial.id,
            runId: "run-2",
        }]);
        assert.equal((await restartedStore.restore(initial.id))?.state.run.status, "waiting");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("Checkpoint save failure leaves the completed Snapshot unchanged and never schedules the new Run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-multi-run-save-failure-"));
    try {
        const baseStore = new JsonFileGoalStore(join(directory, "goals"));
        const initial = completedGoal("goal-save-failure");
        await baseStore.save(initial);
        const failure = new Error("snapshot write failed");
        const store = new FailingSaveStore(baseStore, failure);
        store.failNextSave = true;
        const scheduler = new ThrowingScheduler(new Error("must not schedule"));
        const coordinator = new GoalCoordinator({
            store,
            scheduler,
            trajectoryStore: new JsonFileTrajectoryStore(join(directory, "trajectory")),
            runIdGenerator: () => "run-2",
        });

        await assert.rejects(
            coordinator.continue(
                { goalId: initial.id, runId: initial.state.run.id },
                "不会调用模型",
            ),
            (error: unknown) => error === failure,
        );
        assert.deepEqual(await baseStore.restore(initial.id), initial);
        assert.deepEqual(scheduler.receivedRefs, []);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("marker failure keeps the newly committed Run recoverable and bounds its facts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-multi-run-marker-failure-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const initial = completedGoal("goal-marker-recovery");
        await store.save(initial);
        const rawTrajectory = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        const markerFailure = new Error("state marker unavailable");
        const trajectory = new MarkerFailingTrajectoryStore(rawTrajectory, "run-2", markerFailure);
        const scheduler = new ThrowingScheduler(new Error("must not schedule"));
        const coordinator = new GoalCoordinator({
            store,
            scheduler,
            trajectoryStore: trajectory,
            runIdGenerator: () => "run-2",
        });

        await assert.rejects(
            coordinator.continue(
                { goalId: initial.id, runId: initial.state.run.id },
                "保存后恢复",
            ),
            (error: unknown) => error instanceof TrajectoryCommitMarkerError
                && error.cause instanceof Error
                && error.cause.cause === markerFailure,
        );
        const persisted = await store.restore(initial.id);
        assert.ok(persisted);
        assert.equal(persisted.state.run.id, "run-2");
        assert.equal(persisted.state.run.status, "created");
        const bounded = await new JsonFileTrajectoryStore(join(directory, "trajectory"))
            .readWithBoundary(
                { goalId: initial.id, runId: "run-2" },
                persisted.state.run.committedThroughSequence,
            );
        assert.deepEqual(bounded.committed.map((event) => event.eventType), ["run_created"]);
        assert.deepEqual(bounded.uncommittedTail, []);
        assert.deepEqual(scheduler.receivedRefs, []);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("advance returns one completed Plan Run and does not auto-start pending Todo items", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-multi-run-plan-boundary-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const created = completedGoal("goal-plan-boundary", "plan");
        const added = reduceGoalPlan(createEmptyGoalPlan(), {
            baseRevision: 0,
            operations: [{ type: "add", content: "等待用户触发" }],
        }, { idFactory: () => "todo-1" });
        assert.equal(added.ok, true);
        if (!added.ok) return;
        const planGoal: Goal = {
            ...created,
            state: { ...created.state, goalPlan: added.plan },
        };
        await store.save(planGoal);
        let scheduleCalls = 0;
        const coordinator = new GoalCoordinator({
            store,
            scheduler: {
                async schedule(): Promise<RunnerResult> {
                    scheduleCalls += 1;
                    throw new Error("pending Todo must wait for continue");
                },
            },
        });

        const result = await coordinator.advance({
            goalId: planGoal.id,
            runId: planGoal.state.run.id,
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.kind, "terminal");
        assert.equal(scheduleCalls, 0);
        assert.equal(result.goal.state.goalPlan?.items[0]?.status, "pending");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
