import assert from "node:assert/strict";
import { test } from "node:test";

import {
    classifyTrajectoryTail,
    createGoal,
    readTrajectoryAtSnapshot,
    type Goal,
    type GoalStore,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryStore,
} from "../src/index";
import { allocateImmutableEvent } from "../src/index";

function createSnapshot(): Goal {
    const goal = createGoal({
        id: "goal-reader",
        intent: "读取轨迹",
        promptBundleVersion: 1,
        profile: {
            id: "profile-1",
            systemPrompt: "trace",
            instructions: [],
            toolIds: [],
        },
        runId: "run-reader",
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                committedThroughSequence: 2,
            },
        },
    };
}

const events = [
    allocateImmutableEvent({
        goalId: "goal-reader",
        runId: "run-reader",
        phase: "gathering_context",
        eventType: "run_started",
        payload: { type: "run_started" },
    }, 1),
    allocateImmutableEvent({
        goalId: "goal-reader",
        runId: "run-reader",
        phase: "executing",
        eventType: "state_committed",
        payload: { type: "state_committed", committedThroughSequence: 1 },
    }, 2),
    allocateImmutableEvent({
        goalId: "goal-reader",
        runId: "run-reader",
        phase: "executing",
        eventType: "run_waiting",
        payload: { type: "run_waiting", reason: "等待输入" },
    }, 3),
] as readonly TrajectoryEvent[];

class MemoryGoalStore implements GoalStore {
    constructor(private readonly goal: Goal | undefined) {}

    async save(): Promise<void> {}

    async restore(): Promise<Goal | undefined> {
        return this.goal;
    }
}

class MemoryTrajectoryStore implements TrajectoryStore {
    async append(_draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        return events[0]!;
    }

    async read(_query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return events;
    }

    async readWithBoundary(
        _query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ) {
        return classifyTrajectoryTail(events, committedThroughSequence);
    }
}

test("readTrajectoryAtSnapshot uses Snapshot boundary and keeps marker in its actual sequence", async () => {
    const result = await readTrajectoryAtSnapshot(
        new MemoryGoalStore(createSnapshot()),
        new MemoryTrajectoryStore(),
        { goalId: "goal-reader", runId: "run-reader" },
    );

    assert.deepEqual(
        result.committed.map((event) => event.sequence),
        [1, 2],
    );
    assert.deepEqual(
        result.uncommittedTail.map((event) => event.sequence),
        [3],
    );
});

test("readTrajectoryAtSnapshot treats a missing Snapshot as an uncommitted-only audit view", async () => {
    const result = await readTrajectoryAtSnapshot(
        new MemoryGoalStore(undefined),
        new MemoryTrajectoryStore(),
        { goalId: "goal-reader", runId: "run-reader" },
    );

    assert.deepEqual(result.committed, []);
    assert.deepEqual(
        result.uncommittedTail.map((event) => event.sequence),
        [1, 2, 3],
    );
});
