import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, createRun } from "../src/index";
import type { AgentProfile, GoalMessage } from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["完成目标"],
    toolIds: ["read"],
};

const messages: GoalMessage[] = [
    { role: "user", content: "请开始执行" },
    { role: "assistant", content: "我会先检查输入" },
];

test("createGoal creates a complete aggregate with independent goalId/runId", () => {
    const goal = createGoal({
        id: "goal-1",
        task: {
            objective: "完成最小 Runtime",
            completionCriteria: ["主生命周期可以完成"],
        },
        profile,
        messages,
        runId: "run-1",
    });

    assert.deepEqual(goal, {
        id: "goal-1",
        metadata: { schemaVersion: 1 },
        task: {
            objective: "完成最小 Runtime",
            completionCriteria: ["主生命周期可以完成"],
        },
        profile,
        messages,
        run: {
            id: "run-1",
            status: "created",
            stepCount: 0,
        },
    });
    assert.notEqual(goal.id, goal.run.id);
    assert.notStrictEqual(goal.profile, profile);
    assert.notStrictEqual(goal.profile.instructions, profile.instructions);
    assert.notStrictEqual(goal.messages, messages);
});

test("createGoal freezes task, profile, and initial messages", () => {
    const mutableProfile = {
        ...profile,
        instructions: ["原始指令"],
        toolIds: ["read"],
    };
    const mutableMessages: GoalMessage[] = [
        { role: "user", content: "原始消息" },
    ];
    const goal = createGoal({
        id: "goal-2",
        task: {
            objective: "原始目标",
            completionCriteria: ["原始条件"],
        },
        profile: mutableProfile,
        messages: mutableMessages,
        runId: "run-2",
    });

    mutableProfile.instructions[0] = "修改后的指令";
    mutableProfile.toolIds.push("write");
    mutableMessages[0] = { role: "assistant", content: "修改后的消息" };

    assert.deepEqual(goal.profile.instructions, ["原始指令"]);
    assert.deepEqual(goal.profile.toolIds, ["read"]);
    assert.deepEqual(goal.messages, [
        { role: "user", content: "原始消息" },
    ]);
    assert.deepEqual(goal.task, {
        objective: "原始目标",
        completionCriteria: ["原始条件"],
    });
});

test("a complete Goal supports a JSON round-trip", () => {
    const goal = createGoal({
        id: "goal-3",
        task: {
            objective: "验证序列化",
            completionCriteria: ["恢复后字段一致"],
        },
        profile,
        messages,
        runId: "run-3",
    });

    const restored: unknown = JSON.parse(JSON.stringify(goal));

    assert.deepEqual(restored, goal);
});

test("createRun creates a deterministic core RunState", () => {
    assert.deepEqual(createRun("run-4"), {
        id: "run-4",
        status: "created",
        stepCount: 0,
    });
});
