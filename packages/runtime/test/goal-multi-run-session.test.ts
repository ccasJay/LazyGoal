import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createRun,
    reduceGoalPlan,
    GoalCoordinator,
    transition,
    type AgentProfile,
    type Goal,
    type GoalProgressResult,
    type GoalTask,
    type RunRef,
    type RunScheduler,
    type RunnerResult,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "multi-run-profile",
    systemPrompt: "You continue one Goal across multiple Runs.",
    instructions: [],
    toolIds: [],
};

const task: GoalTask = {
    objective: "完成会话目标",
    completionCriteria: [],
};

function completedGoal(mode: "normal" | "plan"): Goal {
    const created = createGoal({
        ...currentProtocols,
        id: `goal-continue-${mode}`,
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

    const plan = mode === "plan"
        ? reduceGoalPlan(created.state.goalPlan!, {
            baseRevision: 0,
            operations: [{ type: "add", content: "下一项工作" }],
        }, { idFactory: () => "todo-1" })
        : undefined;
    if (plan !== undefined && !plan.ok) throw new Error(plan.error.message);

    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing", task },
            run: completed.state,
            ...(plan === undefined ? {} : { goalPlan: plan.plan }),
        },
    };
}

class WaitingScheduler implements RunScheduler {
    readonly receivedRefs: RunRef[] = [];
    readonly persistedBeforeSchedule: Goal[] = [];

    constructor(private readonly store: InMemoryGoalStore) {}

    async schedule(ref: RunRef): Promise<RunnerResult> {
        this.receivedRefs.push(ref);
        const goal = await this.store.restore(ref.goalId);
        assert.ok(goal);
        this.persistedBeforeSchedule.push(goal);
        const started = transition(goal.state.run, { kind: "start" });
        if (!started.ok) throw new Error(started.error.message);
        const waiting = transition(started.state, {
            kind: "decision",
            decision: { kind: "wait", reason: "等待下一条输入" },
        });
        if (!waiting.ok) throw new Error(waiting.error.message);
        const next = { ...goal, state: { ...goal.state, run: waiting.state } };
        await this.store.save(next);
        return { ok: true, state: next.state.run };
    }
}

function requireFailure(result: GoalProgressResult) {
    if (result.ok) assert.fail("expected a continuation failure");
    return result;
}

test("completed normal Run is archived before a new Run is scheduled", async () => {
    const store = new InMemoryGoalStore();
    const initial = completedGoal("normal");
    await store.save(initial);
    const scheduler = new WaitingScheduler(store);
    const coordinator = new GoalCoordinator({
        store,
        scheduler,
        trajectoryStore: trajectoryStoreFor(store),
        runIdGenerator: () => "run-2",
    });

    const result = await coordinator.continue(
        { goalId: initial.id, runId: initial.state.run.id },
        "继续处理新的输入",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.kind, "waiting");
    assert.deepEqual(scheduler.receivedRefs, [{ goalId: initial.id, runId: "run-2" }]);
    assert.equal(scheduler.persistedBeforeSchedule.length, 1);

    const persisted = await store.restore(initial.id);
    assert.ok(persisted);
    assert.equal(persisted.state.run.id, "run-2");
    assert.equal(persisted.state.run.todoId, undefined);
    assert.deepEqual(persisted.state.messages.at(-1), {
        role: "user",
        content: "继续处理新的输入",
    });
    assert.deepEqual(persisted.state.completedRuns, [{
        runId: "run-1",
        stepCount: 1,
        committedThroughSequence: 0,
        messageRange: { start: 0, end: 1 },
    }]);
});

test("Plan Mode continue binds the first pending Todo and keeps normal mode plan-free", async () => {
    const store = new InMemoryGoalStore();
    const initial = completedGoal("plan");
    await store.save(initial);
    const scheduler = new WaitingScheduler(store);
    const coordinator = new GoalCoordinator({
        store,
        scheduler,
        trajectoryStore: trajectoryStoreFor(store),
        runIdGenerator: () => "run-2",
    });

    const result = await coordinator.continue(
        { goalId: initial.id, runId: initial.state.run.id },
        "执行下一个 Todo",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.kind, "waiting");
    const persisted = await store.restore(initial.id);
    assert.ok(persisted);
    assert.equal(persisted.state.mode, "plan");
    assert.equal(persisted.state.run.id, "run-2");
    assert.equal(persisted.state.run.todoId, "todo-1");
    assert.deepEqual(persisted.state.goalPlan?.items, [{
        id: "todo-1",
        content: "下一项工作",
        position: 0,
        status: "in_progress",
        activeRunId: "run-2",
    }]);
    assert.equal(persisted.state.goalPlan?.revision, 2);
});

test("continue only accepts completed current Run, non-empty input and an available pending Todo", async () => {
    const store = new InMemoryGoalStore();
    const initial = completedGoal("normal");
    await store.save(initial);
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new WaitingScheduler(store),
        runIdGenerator: () => "run-2",
    });

    const empty = requireFailure(await coordinator.continue(
        { goalId: initial.id, runId: initial.state.run.id },
        "   ",
    ));
    assert.equal(empty.error.code, "INVALID_GOAL_INPUT");
    assert.deepEqual(await store.restore(initial.id), initial);

    const waiting = {
        ...initial,
        state: {
            ...initial.state,
            run: (() => {
                const started = transition({
                    ...createRun("run-1"),
                }, { kind: "start" });
                if (!started.ok) throw new Error(started.error.message);
                const blocked = transition(started.state, {
                    kind: "decision",
                    decision: { kind: "wait", reason: "等待" },
                });
                if (!blocked.ok) throw new Error(blocked.error.message);
                return blocked.state;
            })(),
        },
    };
    await store.save(waiting);
    const wrongState = requireFailure(await coordinator.continue(
        { goalId: waiting.id, runId: waiting.state.run.id },
        "继续",
    ));
    assert.equal(wrongState.error.code, "GOAL_NOT_COMPLETED");
    assert.equal((await store.restore(initial.id))?.state.run.id, "run-1");

    const plan = completedGoal("plan");
    const completedTodo = {
        ...plan,
        state: {
            ...plan.state,
            goalPlan: {
                revision: 1,
                items: [{ id: "todo-1", content: "已完成", position: 0, status: "completed" as const }],
            },
        },
    };
    await store.save(completedTodo);
    const noTodoCoordinator = new GoalCoordinator({
        store,
        scheduler: new WaitingScheduler(store),
        runIdGenerator: () => "run-3",
    });
    const noTodo = requireFailure(await noTodoCoordinator.continue(
        { goalId: completedTodo.id, runId: completedTodo.state.run.id },
        "继续",
    ));
    assert.equal(noTodo.error.code, "INVALID_GOAL_INPUT");
    assert.equal((await store.restore(completedTodo.id))?.state.run.id, "run-1");
});

test("同一 Goal 的并发 continue 只消费一次 completed Run", async () => {
    const store = new InMemoryGoalStore();
    const initial = completedGoal("normal");
    await store.save(initial);
    let nextId = 1;
    const scheduler = new WaitingScheduler(store);
    const coordinator = new GoalCoordinator({
        store,
        scheduler,
        runIdGenerator: () => `run-${++nextId}`,
    });

    const [first, second] = await Promise.all([
        coordinator.continue({ goalId: initial.id, runId: initial.state.run.id }, "第一次继续"),
        coordinator.continue({ goalId: initial.id, runId: initial.state.run.id }, "第二次继续"),
    ]);
    const failures = [first, second].filter((result) => !result.ok);
    assert.equal(failures.length, 1);
    assert.equal((failures[0] as Extract<GoalProgressResult, { readonly ok: false }>).error.code, "RUN_NOT_FOUND");
    assert.equal(scheduler.receivedRefs.length, 1);
    assert.equal((await store.restore(initial.id))?.state.messages.filter((message) => message.role === "user").length, 2);
});
