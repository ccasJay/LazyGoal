import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/domain";
import type {
    Goal,
    GoalInput,
    GoalMessage,
} from "../../runtime/src/domain";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import {
    buildStepRequest,
    buildStepUserMessage,
    STEP_RESULT_PROTOCOL,
} from "../src/prompt";

const goal: GoalInput = {
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

function createTestGoal(
    runId = "run-1",
    messages: readonly GoalMessage[] = [],
): Goal {
    return createGoal({
        id: goal.id,
        task: goal,
        profile,
        messages,
        runId,
    });
}

test("buildStepRequest 包含冻结 Profile、Goal 和严格 JSON 协议", () => {
    const currentGoal = createTestGoal();
    const request = buildStepRequest(currentGoal);

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

test("buildStepRequest 按顺序包含历史 messages 和本轮 user message", () => {
    const history: readonly GoalMessage[] = [
        { role: "user", content: "历史用户输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "历史模型响应" },
    ];
    const currentGoal = createTestGoal("run-history", history);
    const request = buildStepRequest(currentGoal);

    assert.deepEqual(
        request.messages.slice(1, 3),
        history.map(({ role, content }) => ({ role, content })),
    );
    assert.deepEqual(
        JSON.parse(request.messages.at(-1)?.content ?? ""),
        {
            objective: goal.objective,
            completionCriteria: goal.completionCriteria,
            stepCount: 0,
        },
    );
    assert.deepEqual(buildStepUserMessage(currentGoal), {
        role: "user",
        content: request.messages.at(-1)?.content,
    });
});

test("buildStepRequest 仅在存在时加入 lastResult", () => {
    const baseGoal = createTestGoal("run-2");
    const currentGoal: Goal = {
        ...baseGoal,
        state: {
            ...baseGoal.state,
            run: {
                ...baseGoal.state.run,
                status: "running",
                stepCount: 2,
                lastStep: {
                    result: {
                        kind: "continue",
                        summary: "已经完成输入检查",
                    },
                },
            },
        },
    };

    const context = JSON.parse(buildStepRequest(currentGoal).messages.at(-1)?.content ?? "") as {
        readonly stepCount: number;
        readonly lastResult?: { readonly kind: string; readonly summary: string };
    };

    assert.equal(context.stepCount, 2);
    assert.deepEqual(context.lastResult, {
        kind: "continue",
        summary: "已经完成输入检查",
    });
});

test("buildStepRequest 不修改传入的 Goal", () => {
    const currentGoal = createTestGoal("run-3", [
        { role: "user", content: "不可修改的历史" },
    ]);
    const before = JSON.stringify(currentGoal);

    const request = buildStepRequest(currentGoal);

    assert.equal(JSON.stringify(currentGoal), before);
    assert.notStrictEqual(request.messages[1], currentGoal.state.messages[0]);
});
