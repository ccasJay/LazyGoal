import assert from "node:assert/strict";
import { test } from "node:test";

import {
    TrajectoryCheckpointCommitter,
    TrajectoryAppendError,
    createGoal,
    type Goal,
    type GoalStore,
    type TrajectoryEventDraft,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { InMemoryTrajectoryStore } from "./current-fixtures";

const profile = {
    id: "restore-count-profile",
    systemPrompt: "system",
    instructions: [],
    toolIds: [],
};

class CountingGoalStore implements GoalStore {
    restores = 0;
    saves = 0;

    constructor(private readonly inner: InMemoryGoalStore) {}

    async save(goal: Goal): Promise<void> {
        this.saves += 1;
        await this.inner.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        this.restores += 1;
        return this.inner.restore(goalId);
    }
}

class FlushCountingTrajectoryStore extends InMemoryTrajectoryStore {
    readonly flushes: Array<{ readonly goalId: string; readonly runId: string }> = [];

    async flushIndex(goalId: string, runId: string): Promise<void> {
        this.flushes.push({ goalId, runId });
    }
}

function runningGoal(): Goal {
    const goal = createGoal({
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        id: "goal-restore-count",
        runId: "run-restore-count",
        intent: "restore count",
        promptBundleVersion: 1,
        profile,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing" },
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence: 0,
            },
        },
    };
}

const runStartedFact = (goal: Goal): TrajectoryEventDraft => ({
    goalId: goal.id,
    runId: goal.state.run.id,
    phase: "executing",
    eventType: "run_started",
    payload: { type: "run_started" },
});

test("commit 只读取一次最新 Snapshot 并在 prepare 返回后保存一次", async () => {
    const goal = runningGoal();
    const inner = new InMemoryGoalStore();
    await inner.save(goal);
    const store = new CountingGoalStore(inner);
    const trajectoryStore = new InMemoryTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore });

    const committed = await committer.commit(goal, {
        facts: [runStartedFact(goal)],
        prepare: (latest) => {
            assert.equal(latest?.id, goal.id);
            assert.equal(latest?.state.run.id, goal.state.run.id);
            return goal;
        },
    });

    assert.equal(store.restores, 1);
    assert.equal(store.saves, 1);
    assert.equal(committed.events.length, 1);
    assert.ok(committed.goal.state.run.committedThroughSequence >= 1);
});

test("commit 在保存 Snapshot 前刷新该 Run 的派生索引", async () => {
    const goal = runningGoal();
    const inner = new InMemoryGoalStore();
    await inner.save(goal);
    const store = new CountingGoalStore(inner);
    const trajectoryStore = new FlushCountingTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore });

    await committer.commit(goal, { facts: [runStartedFact(goal)] });

    assert.deepEqual(trajectoryStore.flushes, [
        { goalId: goal.id, runId: goal.state.run.id },
    ]);
});

test("prepare 抛错时中止提交且不追加事实或保存 Snapshot", async () => {
    const goal = runningGoal();
    const inner = new InMemoryGoalStore();
    await inner.save(goal);
    const store = new CountingGoalStore(inner);
    const trajectoryStore = new InMemoryTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore });

    await assert.rejects(
        committer.commit(goal, {
            facts: [runStartedFact(goal)],
            prepare: () => {
                throw new Error("prepare rejected");
            },
        }),
        /prepare rejected/,
    );

    assert.equal(store.restores, 1);
    assert.equal(store.saves, 0);
    assert.equal(trajectoryStore.events.length, 0);
});

test("prepare 返回不同 Goal ID 时拒绝提交", async () => {
    const goal = runningGoal();
    const inner = new InMemoryGoalStore();
    await inner.save(goal);
    const store = new CountingGoalStore(inner);
    const trajectoryStore = new InMemoryTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore });

    await assert.rejects(
        committer.commit(goal, {
            facts: [runStartedFact(goal)],
            prepare: () => ({ ...goal, id: "other-goal" }),
        }),
        (error: unknown) => error instanceof TrajectoryAppendError
            && /same Goal ID/.test(error.message),
    );

    assert.equal(store.saves, 0);
    assert.equal(trajectoryStore.events.length, 0);
});

test("未启用 Trajectory 时 prepare 路径同样只读取一次并保存一次", async () => {
    const goal = runningGoal();
    const inner = new InMemoryGoalStore();
    await inner.save(goal);
    const store = new CountingGoalStore(inner);
    const committer = new TrajectoryCheckpointCommitter({ store });

    await committer.commit(goal, {
        prepare: (latest) => {
            assert.equal(latest?.id, goal.id);
            return goal;
        },
    });

    assert.equal(store.restores, 1);
    assert.equal(store.saves, 1);
});
