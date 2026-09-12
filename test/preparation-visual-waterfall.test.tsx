import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    createGoal,
    type Goal,
    type GoalMessage,
} from "../packages/runtime/src/index";
import {
    PreparationScreen,
    type UiSessionViewModel,
    type UiStepSummary,
} from "../packages/tui/src/index";
import { currentProtocols } from "../packages/runtime/test/current-fixtures";

afterEach(() => {
    cleanup();
});

const profile = {
    id: "profile-coder",
    systemPrompt: "You are a professional assistant.",
    instructions: ["Gather context and plan carefully."],
    toolIds: ["read_file", "grep", "web_search"],
};

function createInitialGatheringGoal(): Goal {
    const messages: readonly GoalMessage[] = [
        { role: "user", content: "Audit project security and auth configuration" },
    ];
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-visual-audit",
        intent: "Audit project security and auth configuration",
        profile,
        runId: "run-visual-audit",
        messages,
    });
}

function createSessionView(
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

test("Ink 渲染帧视觉交互：准备阶段只读探查流式瀑布累积留存与活动抽屉无缝衔接 (Req 4.1, 4.2, 4.3)", async () => {
    const goal = createInitialGatheringGoal();
    const frames: string[] = [];

    // 帧 1: 初始状态 - 意图已建立，准备阶段进入忙碌推进，展示初始 Spinner
    const view1 = createSessionView(goal, {
        busy: true,
        waitingFor: undefined,
        activeProbeDescription: undefined,
        preparationSteps: [],
    });
    const instance = render(
        <PreparationScreen
            session={view1}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    assert.match(frames[0]!, /Audit project security and auth configuration/);
    assert.match(frames[0]!, /Gathering context\.\.\./);
    assert.doesNotMatch(frames[0]!, /Step 1:/);

    // 帧 2: 探查 1 运行态 - 模型发起 read_file 探查，活动抽屉展示动态说明
    const view2 = createSessionView(goal, {
        busy: true,
        waitingFor: undefined,
        activeProbeDescription: "Reading package.json...",
        preparationSteps: [],
    });
    instance.rerender(
        <PreparationScreen
            session={view2}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    assert.match(frames[1]!, /Reading package\.json\.\.\./);

    // 帧 3: 探查 1 完成态 - read_file 完成，步骤条目推入 Static 瀑布流固化
    const probeStep1: UiStepSummary = {
        stepNumber: 1,
        toolId: "read_file",
        actionId: "probe-goal-visual-audit-1",
        status: "success",
        inputSummary: "package.json",
        outputSummary: "Read 86 lines, dependencies listed",
    };
    const view3 = createSessionView(goal, {
        busy: true,
        waitingFor: undefined,
        activeProbeDescription: undefined,
        preparationSteps: [probeStep1],
    });
    instance.rerender(
        <PreparationScreen
            session={view3}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    assert.match(frames[2]!, /✔\s+Step 1:\s*\[read_file\]\s*package\.json\s*\(Read 86 lines, dependencies listed\)/);

    // 帧 4: 探查 2 运行态 - 模型发起 grep 探查，活动抽屉展示 grep 操作说明
    const view4 = createSessionView(goal, {
        busy: true,
        waitingFor: undefined,
        activeProbeDescription: "Searching for secret keys in source files...",
        preparationSteps: [probeStep1],
    });
    instance.rerender(
        <PreparationScreen
            session={view4}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    assert.match(frames[3]!, /Searching for secret keys in source files\.\.\./);
    // 关键瀑布流断言：上方的 Step 1 必须完整可见
    assert.match(frames[3]!, /Step 1:\s*\[read_file\]/);

    // 帧 5: 探查 2 完成态 - grep 完成，瀑布流向上滚动累积
    const probeStep2: UiStepSummary = {
        stepNumber: 2,
        toolId: "grep",
        actionId: "probe-goal-visual-audit-2",
        status: "success",
        inputSummary: "JWT_SECRET",
        outputSummary: "found 0 exposed occurrences",
    };
    const view5 = createSessionView(goal, {
        busy: true,
        waitingFor: undefined,
        activeProbeDescription: undefined,
        preparationSteps: [probeStep1, probeStep2],
    });
    instance.rerender(
        <PreparationScreen
            session={view5}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    const f5 = frames[4]!;
    const posStep1_f5 = f5.indexOf("Step 1: [read_file]");
    const posStep2_f5 = f5.indexOf("Step 2: [grep]");
    assert.ok(posStep1_f5 !== -1, "Frame 5 must contain Step 1");
    assert.ok(posStep2_f5 !== -1, "Frame 5 must contain Step 2");
    assert.ok(posStep1_f5 < posStep2_f5, "Step 1 must be positioned before Step 2");

    // 帧 6: 提问交互态 - 模型在掌握两步探查事实后向用户提出澄清问题
    const goalWithQuestion: Goal = {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "gathering_context",
                preparation: {
                    status: "waiting_input",
                    question: "Should we also inspect environment files in .config directory?",
                },
            },
        },
    };
    const view6 = createSessionView(goalWithQuestion, {
        busy: false,
        waitingFor: "question",
        question: "Should we also inspect environment files in .config directory?",
        activeProbeDescription: undefined,
        preparationSteps: [probeStep1, probeStep2],
    });
    instance.rerender(
        <PreparationScreen
            session={view6}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    const f6 = frames[5]!;
    assert.match(f6, /Step 1:\s*\[read_file\]/);
    assert.match(f6, /Step 2:\s*\[grep\]/);
    assert.match(f6, /Agent question/);
    assert.match(f6, /Should we also inspect environment files in \.config directory\?/);
    assert.match(f6, /Type your answer\.\.\./);

    // 帧 7: 用户回复后进入 planning 阶段并执行外部/网络探查 (probeStep3)
    const probeStep3: UiStepSummary = {
        stepNumber: 3,
        toolId: "web_search",
        actionId: "probe-goal-visual-audit-3",
        status: "success",
        inputSummary: "OWASP API Security Top 10 2026",
        outputSummary: "Retrieved security checklist",
    };
    const planningGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "in_progress",
                },
            },
        },
    };
    const view7 = createSessionView(planningGoal, {
        busy: true,
        waitingFor: undefined,
        activeProbeDescription: undefined,
        preparationSteps: [probeStep1, probeStep2, probeStep3],
    });
    instance.rerender(
        <PreparationScreen
            session={view7}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    const f7 = frames[6]!;
    const posStep1_f7 = f7.indexOf("Step 1: [read_file]");
    const posStep2_f7 = f7.indexOf("Step 2: [grep]");
    const posStep3_f7 = f7.indexOf("Step 3: [web_search]");
    assert.ok(posStep1_f7 < posStep2_f7 && posStep2_f7 < posStep3_f7, "Steps 1, 2, and 3 must appear in monotonic order");

    // 帧 8: 提案审批交互态 - planning 完成产出 Task Proposal，瀑布流完整保留在上方，底部抽屉展示任务目标与审批指引
    const proposalData = {
        objective: "Harden authentication headers and sanitize secrets",
        completionCriteria: [
            { text: "Add rate-limiting middleware to auth routes" },
            { text: "Ensure JWT expiration is strictly enforced" },
        ],
    };
    const plannedGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal: proposalData,
                },
            },
        },
    };
    const view8 = createSessionView(plannedGoal, {
        busy: false,
        waitingFor: "approval",
        proposal: proposalData,
        activeProbeDescription: undefined,
        preparationSteps: [probeStep1, probeStep2, probeStep3],
    });
    instance.rerender(
        <PreparationScreen
            session={view8}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    frames.push(instance.lastFrame() ?? "");
    const f8 = frames[7]!;

    // 验证瀑布流完整性（所有 3 个只读探查步骤全都在终端输出中）
    assert.match(f8, /✔\s+Step 1:\s*\[read_file\]/);
    assert.match(f8, /✔\s+Step 2:\s*\[grep\]/);
    assert.match(f8, /✔\s+Step 3:\s*\[web_search\]/);

    // 验证活动抽屉无缝呈现任务提案与快捷键指引
    assert.match(f8, /Task proposal/);
    assert.match(f8, /Harden authentication headers and sanitize secrets/);
    assert.match(f8, /Add rate-limiting middleware to auth routes/);
    assert.match(f8, /Ensure JWT expiration is strictly enforced/);
    assert.match(f8, /Press Y to approve or N to provide feedback\./);
});
