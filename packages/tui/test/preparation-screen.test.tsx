import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    createGoal,
    type Goal,
    type GoalMessage,
} from "../../runtime/src/index";
import {
    PreparationScreen,
    type UiSessionViewModel,
    type UiStepSummary,
} from "../src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";

afterEach(() => {
    cleanup();
});

const profile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Gather context and plan carefully."],
    toolIds: ["read_file", "grep"],
};

function gatheringGoal(id = "goal-gathering"): Goal {
    const messages: readonly GoalMessage[] = [
        { role: "user", content: "Optimize the data layer" },
    ];
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Optimize the data layer",
        profile,
        runId: `run-${id}`,
        messages,
    });
}

function planningGoal(id = "goal-planning"): Goal {
    const messages: readonly GoalMessage[] = [
        { role: "user", content: "Refactor database models" },
    ];
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Refactor database models",
        profile,
        runId: `run-${id}`,
        messages,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal: {
                        objective: "Refactor database models",
                        completionCriteria: [{ text: "Migrate user schema safely" }],
                    },
                },
            },
        },
    };
}

function session(
    goal: Goal,
    overrides: Partial<UiSessionViewModel> = {},
): UiSessionViewModel {
    return {
        screen: "session",
        busy: false,
        goal,
        phase: goal.state.workflow.phase,
        runStatus: goal.state.run.status,
        stepCount: goal.state.run.stepCount,
        messages: goal.state.messages,
        ...overrides,
    } as UiSessionViewModel;
}

const probeStep1: UiStepSummary = {
    stepNumber: 1,
    toolId: "read_file",
    actionId: "probe-goal-1",
    status: "success",
    inputSummary: "package.json",
    outputSummary: "Read 42 lines",
};

const probeStep2: UiStepSummary = {
    stepNumber: 2,
    toolId: "grep",
    actionId: "probe-goal-2",
    status: "success",
    inputSummary: "database",
    outputSummary: "found 5 matches",
};

test("PreparationScreen renders read-only probe steps in Static waterfall and preserves history across rerenders (Req 4.1)", () => {
    const goal = gatheringGoal("goal-prep-waterfall");
    const instance = render(
        <PreparationScreen
            session={session(goal, {
                preparationSteps: [],
            })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );

    // 初始状态：仅意图消息，尚无探查步骤
    let frame = instance.lastFrame() ?? "";
    assert.match(frame, /Optimize the data layer/);
    assert.doesNotMatch(frame, /Step 1:/);

    // 模型发起第一轮探查并提交完成 (probeStep1)
    instance.rerender(
        <PreparationScreen
            session={session(goal, {
                preparationSteps: [probeStep1],
            })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frame = instance.lastFrame() ?? "";
    assert.match(frame, /✔\s+Step 1:\s*\[read_file\]\s*package\.json\s*\(Read 42 lines\)/);

    // 模型发起第二轮探查并提交完成 (probeStep2)
    instance.rerender(
        <PreparationScreen
            session={session(goal, {
                preparationSteps: [probeStep1, probeStep2],
            })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frame = instance.lastFrame() ?? "";

    // 断言 Step 1 和 Step 2 同时留存在终端中，且 Step 1 在 Step 2 之前（瀑布流向上累积，不发生覆盖擦除）
    const idxStep1 = frame.indexOf("Step 1: [read_file]");
    const idxStep2 = frame.indexOf("Step 2: [grep]");
    assert.ok(idxStep1 !== -1, "Step 1 must be present in output");
    assert.ok(idxStep2 !== -1, "Step 2 must be present in output");
    assert.ok(idxStep1 < idxStep2, "Step 1 must appear before Step 2");
});

test("PreparationScreen displays active probe description in drawer Spinner during probe execution (Req 4.2)", () => {
    const goal = gatheringGoal("goal-probe-spinner");
    const instance = render(
        <PreparationScreen
            session={session(goal, {
                busy: true,
                activeProbeDescription: "Reading file package.json...",
            })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );

    let frame = instance.lastFrame() ?? "";
    assert.match(frame, /Reading file package\.json\.\.\./);

    // 切换到 grep 探查中
    instance.rerender(
        <PreparationScreen
            session={session(goal, {
                busy: true,
                preparationSteps: [probeStep1],
                activeProbeDescription: "Searching for \"database\"...",
            })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frame = instance.lastFrame() ?? "";
    // 上方 Static 瀑布流保留已完成的 Step 1
    assert.match(frame, /Step 1:\s*\[read_file\]/);
    // 下方活动抽屉 Spinner 显示当前正在执行的 grep 探查说明
    assert.match(frame, /Searching for "database"\.\.\./);
});

test("PreparationScreen retains waterfall steps above Agent question panel (Req 4.3)", () => {
    const goal = gatheringGoal("goal-probe-question");
    const instance = render(
        <PreparationScreen
            session={session(goal, {
                preparationSteps: [probeStep1, probeStep2],
                waitingFor: "question",
                question: "Which database engine are you targeting?",
            })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    // 上方保留两步只读探查瀑布流
    assert.match(frame, /Step 1:\s*\[read_file\]/);
    assert.match(frame, /Step 2:\s*\[grep\]/);
    // 下方活动抽屉整洁展示 Agent 提问与输入框
    assert.match(frame, /Agent question/);
    assert.match(frame, /Which database engine are you targeting\?/);
    assert.match(frame, /Type your answer\.\.\./);
});

test("PreparationScreen retains waterfall steps above Task proposal approval panel (Req 4.3)", () => {
    const goal = planningGoal("goal-probe-proposal");
    const instance = render(
        <PreparationScreen
            session={session(goal, {
                preparationSteps: [probeStep1, probeStep2],
                waitingFor: "approval",
                proposal: {
                    objective: "Refactor database models",
                    completionCriteria: [{ text: "Migrate user schema safely" }],
                },
            })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    // 上方保留只读探查瀑布流
    assert.match(frame, /Step 1:\s*\[read_file\]/);
    assert.match(frame, /Step 2:\s*\[grep\]/);
    // 下方活动抽屉整洁展示提案审批面板
    assert.match(frame, /Task proposal/);
    assert.match(frame, /Refactor database models/);
    assert.match(frame, /• Migrate user schema safely/);
    assert.match(frame, /Press Y to approve or N to provide feedback/);
});
