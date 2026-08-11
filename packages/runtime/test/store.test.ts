import assert from "node:assert/strict";
import { test } from "node:test";

import { createRun, InMemoryRunStore } from "../src/index";
import type { Goal, RunState, RunStore } from "../src/index";

const goal: Goal = {
    id: "goal-1",
    objective: "保存 Run 的最新状态",
    completionCriteria: ["可以按 Run ID 加载最新快照"],
};

test("saves and loads a run by its ID", async () => {
    const store: RunStore = new InMemoryRunStore();
    const saved = createRun(goal, "run-1");

    await store.save(saved);

    assert.deepEqual(await store.load("run-1"), saved);
});

test("overwrites the previous snapshot for the same run ID", async () => {
    const store: RunStore = new InMemoryRunStore();
    const initial = createRun(goal, "run-1");
    const latest: RunState = {
        ...initial,
        status: "running",
    };

    await store.save(initial);
    await store.save(latest);

    assert.deepEqual(await store.load("run-1"), latest);
});

test("returns undefined when the run ID does not exist", async () => {
    const store: RunStore = new InMemoryRunStore();

    assert.equal(await store.load("missing-run"), undefined);
});
