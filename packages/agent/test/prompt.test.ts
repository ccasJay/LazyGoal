import assert from "node:assert/strict";
import { test } from "node:test";

import { createRun } from "../../runtime/src/domain";
import type { Goal, RunState } from "../../runtime/src/domain";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import { buildStepRequest, STEP_RESULT_PROTOCOL } from "../src/prompt";

const goal: Goal = {
    id: "goal-1",
    objective: "完成示例任务",
    completionCriteria: ["标准一", "标准二"],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
    toolIds: [],
};

test("buildStepRequest 包含 Profile、Goal 和严格 JSON 协议", () => {
    const state = createRun(goal, "run-1", profile);
    const request = buildStepRequest(state);

    assert.equal(request.messages.length, 2);
    assert.equal(request.messages[0]?.role, "system");
    assert.equal(request.messages[1]?.role, "user");
    assert.match(request.messages[0]?.content ?? "", /你是一个严谨的执行代理/);
    assert.match(request.messages[0]?.content ?? "", /1\. 先检查输入/);
    assert.match(request.messages[0]?.content ?? "", /2\. 再给出下一步/);
    assert.match(request.messages[0]?.content ?? "", new RegExp(STEP_RESULT_PROTOCOL));

    assert.deepEqual(JSON.parse(request.messages[1]?.content ?? ""), {
        objective: "完成示例任务",
        completionCriteria: ["标准一", "标准二"],
        stepCount: 0,
    });
});

test("buildStepRequest 仅在存在时加入 lastResult", () => {
    const state: RunState = {
        ...createRun(goal, "run-2", profile),
        status: "running",
        stepCount: 2,
        lastResult: {
            kind: "continue",
            summary: "已经完成输入检查",
        },
    };

    const context = JSON.parse(buildStepRequest(state).messages[1]?.content ?? "") as {
        readonly stepCount: number;
        readonly lastResult?: { readonly kind: string; readonly summary: string };
    };

    assert.equal(context.stepCount, 2);
    assert.deepEqual(context.lastResult, {
        kind: "continue",
        summary: "已经完成输入检查",
    });
});

test("buildStepRequest 不修改传入的 RunState", () => {
    const state = createRun(goal, "run-3", profile);
    const before = JSON.stringify(state);

    buildStepRequest(state);

    assert.equal(JSON.stringify(state), before);
});
