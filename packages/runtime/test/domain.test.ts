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
    { role: "user", content: "补充上下文" },
    {
        role: "assistant",
        assistant: { profileId: "profile-1" },
        content: "我会继续确认",
    },
];

test("createGoal creates an initial gathering snapshot with independent IDs", () => {
    const goal = createGoal({
        id: "goal-1",
        intent: "完成最小 Runtime",
        profile,
        messages,
        runId: "run-1",
    });

    assert.deepEqual(goal, {
        id: "goal-1",
        definition: {
            intent: "完成最小 Runtime",
            globalSystemPromptVersion: 1,
            profile,
            executionPolicy: { maxSteps: 0 },
        },
        state: {
            workflow: {
                phase: "gathering_context",
                preparation: { status: "active" },
            },
            messages: [
                { role: "user", content: "完成最小 Runtime" },
                ...messages,
            ],
            run: {
                id: "run-1",
                status: "created",
                stepCount: 0,
            },
        },
    });
    assert.notEqual(goal.id, goal.state.run.id);
    assert.equal(goal.state.workflow.phase, "gathering_context");
    assert.equal(goal.state.run.stepCount, 0);
    assert.equal(goal.state.run.lastStep, undefined);
});

test("createGoal isolates frozen definition and real messages from input mutation", () => {
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
        intent: "原始意图",
        profile: mutableProfile,
        messages: mutableMessages,
        runId: "run-2",
        maxSteps: 5,
    });

    mutableProfile.instructions[0] = "修改后的指令";
    mutableProfile.toolIds.push("write");
    mutableMessages[0] = { role: "user", content: "修改后的消息" };

    assert.deepEqual(goal.definition.profile.instructions, ["原始指令"]);
    assert.deepEqual(goal.definition.profile.toolIds, ["read"]);
    assert.deepEqual(goal.definition.executionPolicy, { maxSteps: 5 });
    assert.deepEqual(goal.state.messages, [
        { role: "user", content: "原始意图" },
        { role: "user", content: "原始消息" },
    ]);
});

test("preparation workflow cannot represent executing without a final task", () => {
    const goal = createGoal({
        id: "goal-3",
        intent: "先准备再执行",
        profile,
        runId: "run-3",
    });

    assert.equal(goal.state.workflow.phase, "gathering_context");
    assert.equal("task" in goal.state.workflow, false);
    assert.deepEqual(goal.state.run, createRun("run-3"));
});

test("createGoal accepts zero or a positive maxSteps and rejects invalid values", () => {
    assert.equal(createGoal({
        id: "goal-unlimited",
        intent: "无限执行",
        profile,
        runId: "run-unlimited",
    }).definition.executionPolicy.maxSteps, 0);

    for (const maxSteps of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(
            () => createGoal({
                id: "goal-invalid",
                intent: "非法预算",
                profile,
                runId: "run-invalid",
                maxSteps,
            }),
            /maxSteps/i,
        );
    }
});

test("a complete Goal with a frozen Global System Prompt version supports a JSON round-trip", () => {
    const goal = createGoal({
        id: "goal-4",
        intent: "验证序列化",
        profile,
        messages,
        runId: "run-4",
    });

    assert.deepEqual(JSON.parse(JSON.stringify(goal)), goal);
});

test("createRun creates a deterministic core RunState", () => {
    assert.deepEqual(createRun("run-5"), {
        id: "run-5",
        status: "created",
        stepCount: 0,
    });
});
