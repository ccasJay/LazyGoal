import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalCoordinator,
    type AgentProfile,
    type Goal,
    type GoalProgressResult,
    type RunScheduler,
    type RunnerResult,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "profile-plan-mode",
    systemPrompt: "You are a planning agent.",
    instructions: [],
    toolIds: [],
};

class NoopScheduler implements RunScheduler {
    async schedule(): Promise<RunnerResult> {
        throw new Error("scheduler must not be called by enterPlanMode");
    }
}

function goal(): Goal {
    return createGoal({
        id: "goal-plan-mode",
        intent: "进入计划模式",
        promptBundleVersion: 1,
        profile,
        runId: "run-plan-mode",
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    });
}

test("GoalCoordinator.enterPlanMode materializes an empty GoalPlan atomically", async () => {
    const store = new InMemoryGoalStore();
    const initial = goal();
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new NoopScheduler(),
        trajectoryStore: trajectory,
    });

    const result = await coordinator.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.goal.state.mode, "plan");
    assert.deepEqual(result.goal.state.goalPlan, { revision: 0, items: [] });
    assert.deepEqual(result.goal.state.messages, initial.state.messages);
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "plan_mode_entered",
        "state_committed",
    ]);

    const restored = await store.restore(initial.id);
    assert.equal(restored?.state.mode, "plan");
});

test("GoalCoordinator.enterPlanMode is idempotent and rejects a running Run", async () => {
    const store = new InMemoryGoalStore();
    const initial = goal();
    await store.save(initial);
    const coordinator = new GoalCoordinator({ store, scheduler: new NoopScheduler() });

    const first = await coordinator.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(first.ok, true);
    const second = await coordinator.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.goal.state.goalPlan?.revision, 0);

    const running = {
        ...second.goal,
        state: { ...second.goal.state, run: { ...second.goal.state.run, status: "running" as const } },
    };
    await store.save(running);
    const rejected: GoalProgressResult = await coordinator.enterPlanMode({
        goalId: running.id,
        runId: running.state.run.id,
    });
    assert.deepEqual(rejected, {
        ok: false,
        error: {
            code: "PLAN_MODE_BUSY",
            message: "Plan Mode cannot be entered while the current Run is executing",
        },
    });
});
