import assert from "node:assert/strict";
import { test } from "node:test";

import { createRun } from "../src/index";
import type { Goal } from "../src/index";

const goal: Goal = {
    id: "goal-1",
    objective: "完成最小 Runtime",
    completionCriteria: ["主生命周期可以完成"],
};

test("createRun creates the initial state and associates its goal", () => {
    const run = createRun(goal, "run-1");

    assert.deepEqual(run, {
        id: "run-1",
        goal,
        status: "created",
        stepCount: 0,
    });
    assert.strictEqual(run.goal, goal);
});

test("a newly created run supports a JSON round-trip", () => {
    const run = createRun(goal, "run-1");

    const restored: unknown = JSON.parse(JSON.stringify(run));

    assert.deepEqual(restored, run);
});
