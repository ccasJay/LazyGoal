import assert from "node:assert/strict";
import { test } from "node:test";

import {
    assertValidGoalPlan,
    bindGoalPlanTodo,
    completeGoalPlanTodo,
    createEmptyGoalPlan,
    GoalPlanPatchError,
    releaseGoalPlanTodo,
    reduceGoalPlan,
} from "../src/index";

test("GoalPlan reducer allocates Runtime IDs and increments revision once", () => {
    const result = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [
            { type: "add", content: "检查现有实现" },
            { type: "add", content: "补充回归测试" },
        ],
    }, { idFactory: (ordinal) => `runtime-todo-${ordinal}` });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.revision, 1);
    assert.deepEqual(result.createdIds, ["runtime-todo-1", "runtime-todo-2"]);
    assert.deepEqual(result.plan.items, [
        { id: "runtime-todo-1", content: "检查现有实现", position: 0, status: "pending" },
        { id: "runtime-todo-2", content: "补充回归测试", position: 1, status: "pending" },
    ]);
});

test("GoalPlan reducer preserves untouched items for incremental updates", () => {
    const initial = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [
            { type: "add", content: "第一项" },
            { type: "add", content: "第二项" },
        ],
    }, { idFactory: (ordinal) => `todo-${ordinal}` });
    assert.equal(initial.ok, true);
    if (!initial.ok) return;

    const updated = reduceGoalPlan(initial.plan, {
        baseRevision: 1,
        operations: [{ type: "update", id: "todo-1", content: "第一项（更新）" }],
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.deepEqual(updated.plan.items[1], initial.plan.items[1]);
    assert.equal(updated.plan.items[0]?.content, "第一项（更新）");
});

test("GoalPlan reducer enforces one in-progress Todo and valid transitions", () => {
    const initial = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [
            { type: "add", content: "第一项" },
            { type: "add", content: "第二项" },
        ],
    }, { idFactory: (ordinal) => `todo-${ordinal}` });
    assert.equal(initial.ok, true);
    if (!initial.ok) return;

    const running = reduceGoalPlan(initial.plan, {
        baseRevision: 1,
        operations: [{ type: "update", id: "todo-1", status: "in_progress" }],
    });
    assert.equal(running.ok, true);
    if (!running.ok) return;

    const rejected = reduceGoalPlan(running.plan, {
        baseRevision: 2,
        operations: [{ type: "update", id: "todo-2", status: "in_progress" }],
    });
    assert.equal(rejected.ok, false);
    assert.deepEqual(rejected.plan, running.plan);

    const invalidComplete = reduceGoalPlan(initial.plan, {
        baseRevision: 1,
        operations: [{ type: "update", id: "todo-1", status: "completed" }],
    });
    assert.equal(invalidComplete.ok, false);
});

test("GoalPlan reducer rejects a stale or partially invalid batch atomically", () => {
    const initial = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [{ type: "add", content: "保留项" }],
    }, { idFactory: () => "todo-1" });
    assert.equal(initial.ok, true);
    if (!initial.ok) return;

    const stale = reduceGoalPlan(initial.plan, {
        baseRevision: 0,
        operations: [{ type: "add", content: "过期项" }],
    });
    assert.equal(stale.ok, false);
    assert.deepEqual(stale.plan, initial.plan);

    const invalidBatch = reduceGoalPlan(initial.plan, {
        baseRevision: 1,
        operations: [
            { type: "add", content: "不会提交" },
            { type: "update", id: "unknown", content: "非法引用" },
        ],
    });
    assert.equal(invalidBatch.ok, false);
    assert.deepEqual(invalidBatch.plan, initial.plan);
});

test("GoalPlan reducer exposes a stable domain error for malformed persisted state", () => {
    assert.throws(
        () => assertValidGoalPlan({ revision: 0, items: [{
            id: "duplicate",
            content: "a",
            position: 0,
            status: "pending",
        }, {
            id: "duplicate",
            content: "b",
            position: 1,
            status: "pending",
        }] }),
        (error: unknown) => error instanceof GoalPlanPatchError,
    );
});

test("Runtime binds, completes and releases one Todo with an exact Run identity", () => {
    const initial = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [{ type: "add", content: "执行一个 Todo" }],
    }, { idFactory: () => "todo-1" });
    assert.equal(initial.ok, true);
    if (!initial.ok) return;

    const bound = bindGoalPlanTodo(initial.plan, "todo-1", "run-1");
    assert.deepEqual(bound.items, [{
        id: "todo-1",
        content: "执行一个 Todo",
        position: 0,
        status: "in_progress",
        activeRunId: "run-1",
    }]);
    assert.equal(bound.revision, 2);

    const completed = completeGoalPlanTodo(bound, "todo-1", "run-1");
    assert.deepEqual(completed.items, [{
        id: "todo-1",
        content: "执行一个 Todo",
        position: 0,
        status: "completed",
    }]);
    assert.equal(completed.revision, 3);

    assert.throws(
        () => completeGoalPlanTodo(bound, "todo-1", "old-run"),
        GoalPlanPatchError,
    );

    const retried = releaseGoalPlanTodo(bound, "todo-1", "run-1");
    assert.deepEqual(retried.items, [{
        id: "todo-1",
        content: "执行一个 Todo",
        position: 0,
        status: "pending",
    }]);
});
