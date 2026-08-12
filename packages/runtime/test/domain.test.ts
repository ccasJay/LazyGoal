import assert from "node:assert/strict";
import { test } from "node:test";

import { createRun } from "../src/index";
import type { AgentProfile, Goal } from "../src/index";

const goal: Goal = {
    id: "goal-1",
    objective: "完成最小 Runtime",
    completionCriteria: ["主生命周期可以完成"],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["完成目标"],
    toolIds: ["read"],
};

test("createRun creates the initial state and associates its goal", () => {
    const run = createRun(goal, "run-1", profile);

    assert.deepEqual(run, {
        id: "run-1",
        goal,
        profile,
        status: "created",
        stepCount: 0,
    });
    assert.strictEqual(run.goal, goal);
});

test("a newly created run supports a JSON round-trip", () => {
    const run = createRun(goal, "run-1", profile);

    const restored: unknown = JSON.parse(JSON.stringify(run));

    assert.deepEqual(restored, run);
});
