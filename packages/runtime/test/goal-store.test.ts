import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalSnapshotSchema,
    InMemoryGoalStore,
} from "../src/index";
import type { AgentProfile, Goal, GoalMessage } from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["先检查输入", "再执行任务"],
    toolIds: ["read"],
};

const messages: GoalMessage[] = [
    { role: "user", content: "请开始执行" },
    { role: "assistant", content: "我会先检查输入" },
];

function createSnapshot(runId = "run-1"): Goal {
    return createGoal({
        id: "goal-1",
        task: {
            objective: "完成快照存储",
            completionCriteria: ["可以恢复最新 Goal"],
        },
        profile,
        messages,
        runId,
    });
}

test("GoalSnapshotSchema validates a complete Goal and rejects extra fields", () => {
    const goal = createSnapshot();
    const restored = GoalSnapshotSchema.parse(JSON.parse(JSON.stringify(goal)));

    assert.deepEqual(restored, goal);
    assert.throws(() => GoalSnapshotSchema.parse({
        ...goal,
        extra: true,
    }));
    assert.throws(() => GoalSnapshotSchema.parse({
        ...goal,
        profile: {
            ...goal.profile,
            extra: true,
        },
    }));
});

test("InMemoryGoalStore keeps only the latest complete snapshot", async () => {
    const store = new InMemoryGoalStore();
    const initial = createSnapshot("run-1");
    const latest: Goal = {
        ...initial,
        messages: [
            ...initial.messages,
            { role: "user", content: "继续执行" },
        ],
        run: {
            ...initial.run,
            id: "run-2",
            status: "running",
            stepCount: 1,
        },
    };

    await store.save(initial);
    await store.save(latest);

    assert.deepEqual(await store.restore("goal-1"), latest);
    assert.deepEqual((await store.restore("goal-1"))?.profile, profile);
    assert.deepEqual((await store.restore("goal-1"))?.messages, [
        { role: "user", content: "请开始执行" },
        { role: "assistant", content: "我会先检查输入" },
        { role: "user", content: "继续执行" },
    ]);
});

test("InMemoryGoalStore clones on save and restore", async () => {
    const store = new InMemoryGoalStore();
    const input = createSnapshot();

    await store.save(input);
    (input.profile.instructions as string[]).push("外部修改");
    (input.messages as GoalMessage[]).reverse();

    const first = await store.restore("goal-1");
    assert.deepEqual(first?.profile.instructions, ["先检查输入", "再执行任务"]);
    assert.deepEqual(first?.messages, messages);

    if (first === undefined) {
        assert.fail("expected a saved Goal");
    }

    (first.profile.instructions as string[]).push("恢复结果修改");
    (first.messages as GoalMessage[]).push({
        role: "assistant",
        content: "不应写回 Store",
    });

    assert.deepEqual(await store.restore("goal-1"), createSnapshot());
});

test("InMemoryGoalStore validates before saving and returns undefined when missing", async () => {
    const store = new InMemoryGoalStore();
    const invalid = {
        ...createSnapshot(),
        extra: true,
    } as Goal;

    await assert.rejects(store.save(invalid));
    assert.equal(await store.restore("missing-goal"), undefined);
});
