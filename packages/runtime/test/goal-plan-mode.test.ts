import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalCoordinator,
    transition,
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

function completedRun(initial: Goal): Goal {
    const started = transition(initial.state.run, { kind: "start" });
    if (!started.ok) throw new Error(started.error.message);
    const completed = transition(started.state, {
        kind: "decision",
        decision: { kind: "complete", summary: "已完成", completionEvidence: [] },
    });
    if (!completed.ok) throw new Error(completed.error.message);
    return { ...initial, state: { ...initial.state, run: completed.state } };
}

test("GoalCoordinator.enterPlanMode switches the current Run without materializing GoalPlan", async () => {
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
    assert.equal(result.goal.state.run.mode, "plan");
    assert.equal(result.goal.state.goalPlan, undefined);
    assert.deepEqual(result.goal.state.messages, initial.state.messages);
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "plan_mode_entered",
        "state_committed",
    ]);

    const restored = await store.restore(initial.id);
    assert.equal(restored?.state.run.mode, "plan");
});

test("GoalCoordinator.enterPlanMode is idempotent and rejects a started normal Run", async () => {
    const store = new InMemoryGoalStore();
    const initial = goal();
    await store.save(initial);
    const coordinator = new GoalCoordinator({ store, scheduler: new NoopScheduler() });

    const first = await coordinator.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(first.ok, true);
    const second = await coordinator.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.goal.state.goalPlan, undefined);

    const running = {
        ...second.goal,
        state: {
            ...second.goal.state,
            run: { ...second.goal.state.run, mode: "normal" as const, status: "running" as const },
        },
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
            message: "Plan Mode can only be selected before run_started is committed or after a Run completes",
        },
    });
});

test("GoalCoordinator.enterPlanMode refuses an uncommitted run_started tail", async () => {
    const store = new InMemoryGoalStore();
    const initial = goal();
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    await trajectory.append({
        goalId: initial.id,
        runId: initial.state.run.id,
        phase: "executing",
        eventType: "run_started",
        payload: { type: "run_started" },
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new NoopScheduler(),
        trajectoryStore: trajectory,
    });

    const result = await coordinator.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.deepEqual(result, {
        ok: false,
        error: {
            code: "PLAN_MODE_BUSY",
            message: "Plan Mode can only be selected before run_started is committed or after a Run completes",
        },
    });
    assert.equal((await store.restore(initial.id))?.state.run.mode, "normal");
    assert.deepEqual(trajectory.events.map((event) => event.payload.type), ["run_started"]);
});

test("GoalCoordinator.enterPlanMode selects only the next Run after completion and consumes it once", async () => {
    const store = new InMemoryGoalStore();
    const initial = goal();
    const completed = completedRun(initial);
    await store.save(completed);
    const scheduler = {
        async schedule(ref: { readonly goalId: string }) {
            const current = await store.restore(ref.goalId);
            assert.equal(current?.state.run.mode, "plan");
            const started = transition(current!.state.run, { kind: "start" });
            if (!started.ok) throw new Error(started.error.message);
            const completedRunState = transition(started.state, {
                kind: "decision",
                decision: { kind: "complete", summary: "已完成", completionEvidence: [] },
            });
            if (!completedRunState.ok) throw new Error(completedRunState.error.message);
            const finished = {
                ...current!,
                state: { ...current!.state, run: completedRunState.state },
            };
            await store.save(finished);
            return { ok: true as const, state: finished.state.run };
        },
    };
    const coordinator = new GoalCoordinator({ store, scheduler, runIdGenerator: () => "run-next" });

    const selected = await coordinator.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    assert.equal(selected.goal.state.run.id, initial.state.run.id);
    assert.equal(selected.goal.state.run.mode, "normal");
    assert.equal(selected.goal.state.nextRunMode, "plan");

    const coordinatorAfterRestart = new GoalCoordinator({
        store,
        scheduler,
        runIdGenerator: () => "run-next",
    });
    const repeated = await coordinatorAfterRestart.enterPlanMode({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(repeated.ok, true);
    if (!repeated.ok) return;
    assert.equal(repeated.goal.state.nextRunMode, "plan");

    const continued = await coordinatorAfterRestart.continue(
        { goalId: initial.id, runId: initial.state.run.id },
        "继续计划任务",
    );
    assert.equal(continued.ok, true);
    if (!continued.ok) return;
    assert.equal(continued.goal.state.run.id, "run-next");
    assert.equal(continued.goal.state.run.mode, "plan");
    assert.equal(continued.goal.state.nextRunMode, undefined);

    const restored = await store.restore(initial.id);
    assert.equal(restored?.state.run.mode, "plan");
    assert.equal(restored?.state.nextRunMode, undefined);
});
