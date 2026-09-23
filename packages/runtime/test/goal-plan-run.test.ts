import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createEmptyGoalPlan,
    createRun,
    reduceGoalPlan,
    Runner,
    transition,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type GoalTask,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "plan-run-profile",
    systemPrompt: "You execute one planned Todo at a time.",
    instructions: [],
    toolIds: [],
};

const task: GoalTask = {
    objective: "执行计划项",
    completionCriteria: [],
};

class SequenceExecutor implements StepExecutor {
    private index = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {}

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        const decision = this.decisions[this.index];
        this.index += 1;
        if (decision === undefined) throw new Error("unexpected executor call");
        return structuredClone(decision);
    }
}

function planGoal(
    runStatus: "running" | "created" = "running",
    decisionTask: GoalTask | undefined = task,
): Goal {
    const created = createGoal({
        ...currentProtocols,
        id: "plan-run-goal",
        intent: "执行计划",
        promptBundleVersion: 1,
        profile,
        runId: "run-1",
        mode: "plan",
    });
    const added = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [{ type: "add", content: "执行计划项" }],
    }, { idFactory: () => "todo-1" });
    if (!added.ok) throw new Error(added.error.message);
    const run = runStatus === "running"
        ? transition(createRun("run-1", "plan"), { kind: "start" })
        : { ok: true as const, state: createRun("run-1", "plan") };
    if (!run.ok) throw new Error(run.error.message);
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            goalPlan: added.plan,
            run: {
                ...run.state,
                ...(decisionTask === undefined ? {} : { approvedTask: decisionTask }),
            },
        },
    };
}

function emptyPlanGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        id: "plan-update-goal",
        intent: "维护计划",
        promptBundleVersion: 1,
        profile,
        runId: "run-plan-update",
        mode: "plan",
    });
}

test("Plan Mode goal_plan_update is a non-terminal Step and persists the reducer result", async () => {
    const store = new InMemoryGoalStore();
    const created = emptyPlanGoal();
    const initial = {
        ...created,
        state: {
            ...created.state,
            goalPlan: { revision: 0, items: [] },
            run: createRun("run-plan-update", "plan"),
        },
    };
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: new SequenceExecutor([
            {
                kind: "goal_plan_update",
                baseRevision: 0,
                operations: [{ type: "add", content: "先建立清单" }],
            },
            { kind: "wait", reason: "等待用户选择下一项" },
        ]),
    });

    const result = await runner.run({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "waiting");
    assert.equal(result.state.stepCount, 2);
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.mode, "plan");
    assert.deepEqual(saved?.state.goalPlan, {
        revision: 1,
        items: [{ id: "todo-1-1", content: "先建立清单", position: 0, status: "pending" }],
    });
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "run_started",
        "state_committed",
        "decision_received",
        "goal_plan_updated",
        "state_committed",
        "decision_received",
        "run_waiting",
        "state_committed",
    ]);
});

test("当前 Run 完成后，GoalPlan Todo 状态独立保留", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        executor: new SequenceExecutor([{
            kind: "complete",
            summary: "计划项已完成",
            completionEvidence: [],
        }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.status, "completed");
    assert.deepEqual(saved?.state.goalPlan?.items, [{
        id: "todo-1",
        content: "执行计划项",
        position: 0,
        status: "pending",
    }]);
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "decision_received",
        "run_completed",
        "context_epoch_closed",
        "memory_patch_accepted",
        "state_committed",
    ]);
});

test("失败 Run 不隐式改变 GoalPlan Todo", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const result = await new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: new SequenceExecutor([{ kind: "fail", error: "执行失败" }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    const saved = await store.restore(initial.id);
    assert.deepEqual(saved?.state.goalPlan?.items, [{
        id: "todo-1",
        content: "执行计划项",
        position: 0,
        status: "pending",
    }]);
});

test("模型不能用 GoalPlan Patch 绕过当前 Run Evidence 直接完成 Todo", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const result = await new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: new SequenceExecutor([{
            kind: "goal_plan_update",
            baseRevision: initial.state.goalPlan!.revision,
            operations: [{ type: "update", id: "todo-1", status: "completed" }],
        }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.goalPlan?.items[0]?.status, "pending");
});
