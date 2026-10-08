import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionControl } from "../../execution-control/src/index";
import { createGoal, RunRecoveryReader } from "../src/index";
import type { GoalStore, TrajectoryStore } from "../src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

const profile = {
    id: "recovery-reader-test",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

function makeGoal() {
    return createGoal({
        id: "goal-reader",
        intent: "read committed state",
        promptBundleVersion: 1,
        ...currentProtocols,
        profile,
        runId: "run-reader",
    });
}

test("RunRecoveryReader validates Run identity and reads only at the supplied Snapshot boundary", async () => {
    const goal = makeGoal();
    let goalReads = 0;
    let goalWrites = 0;
    const store: GoalStore = {
        async restore(goalId) {
            goalReads += 1;
            assert.equal(goalId, goal.id);
            return goal;
        },
        async save() {
            goalWrites += 1;
        },
    };
    const memoryTrajectory = new InMemoryTrajectoryStore();
    let trajectoryReads = 0;
    let trajectoryWrites = 0;
    const trajectoryStore: TrajectoryStore = {
        async append(draft) {
            trajectoryWrites += 1;
            return memoryTrajectory.append(draft);
        },
        async read(query) {
            trajectoryReads += 1;
            return memoryTrajectory.read(query);
        },
        async readWithBoundary(query, boundary) {
            trajectoryReads += 1;
            return memoryTrajectory.readWithBoundary(query, boundary);
        },
    };
    const reader = new RunRecoveryReader({ store, trajectoryStore });

    assert.equal(await reader.restoreGoal({ goalId: goal.id, runId: goal.state.run.id }), goal);
    assert.equal(await reader.restoreGoal({ goalId: goal.id, runId: "other-run" }), undefined);
    const result = await reader.readTrajectory(
        { goalId: goal.id, runId: goal.state.run.id },
        7,
    );

    assert.deepEqual(result, { committed: [], uncommittedTail: [] });
    assert.equal(goalReads, 2);
    assert.equal(trajectoryReads, 1);
    assert.equal(goalWrites, 0);
    assert.equal(trajectoryWrites, 0);
});

test("RunRecoveryReader checks cancellation before touching persistence", async () => {
    const goal = makeGoal();
    let reads = 0;
    const store: GoalStore = {
        async restore() {
            reads += 1;
            return goal;
        },
        async save() {
            throw new Error("read-only recovery must not save");
        },
    };
    const reader = new RunRecoveryReader({ store });
    const control: ExecutionControl = { signal: AbortSignal.abort(new Error("cancelled")) };

    await assert.rejects(
        reader.restoreGoal({ goalId: goal.id, runId: goal.state.run.id }, control),
    );
    assert.equal(reads, 0);
});
