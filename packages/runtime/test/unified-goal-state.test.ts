import assert from "node:assert/strict";
import test from "node:test";
import {
    createGoal,
    transition,
    type AgentProfile,
    type GoalCreationInput,
    type PendingInteractionAskUser,
    type PendingInteractionTaskApproval,
    type RunState,
} from "../src/index";

const testProfile: AgentProfile = {
    id: "test-agent",
    name: "Test Agent",
    instructions: ["测试指令"],
    toolIds: ["read_file"],
};

function buildSampleGoalInput(): GoalCreationInput {
    return {
        id: "goal-test-1",
        intent: "统一执行生命周期测试",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile: testProfile,
        runId: "run-test-1",
    };
}

test("createGoal 创建直接进入 executing 阶段的全新 Goal，无 task，Run 状态为 created 且 stepCount 为 0", () => {
    const goal = createGoal(buildSampleGoalInput());

    assert.equal(goal.state.workflow.phase, "executing");
    assert.equal(goal.state.workflow.task, undefined);
    assert.equal(goal.state.run.status, "created");
    assert.equal(goal.state.run.stepCount, 0);
    assert.equal(goal.state.run.lastStep, undefined);
    assert.equal(goal.state.run.pendingAction, undefined);
    assert.equal(goal.state.run.pendingInteraction, undefined);
});

test("transition 处理 stage_interaction (ask_user) 进入 waiting，且不增加 Step", () => {
    let run: RunState = {
        id: "run-1",
        status: "running",
        stepCount: 0,
        committedThroughSequence: 0,
        contextEpoch: { version: 1, number: 0, conversationStartIndex: 0, openedAtSequence: 0 },
    };

    const askUserInteraction: PendingInteractionAskUser = {
        kind: "ask_user",
        requestId: "ask-100",
        mode: "plan",
        questions: [
            {
                id: "q-1",
                header: "分支选择",
                question: "要合并到哪个分支？",
                options: [{ id: "o-1", label: "main" }, { id: "o-2", label: "dev" }],
                multiSelect: false,
            },
        ],
    };

    // 暂存交互
    const stagedResult = transition(run, {
        kind: "stage_interaction",
        interaction: askUserInteraction,
    });
    assert.equal(stagedResult.ok, true);
    if (!stagedResult.ok) return;

    assert.equal(stagedResult.state.status, "waiting");
    assert.equal(stagedResult.state.stepCount, 0);
    assert.equal(stagedResult.state.lastStep, undefined);
    assert.deepEqual(stagedResult.state.pendingInteraction, askUserInteraction);

    // 等待交互期间，普通 resume 必须被拒绝（防止绕过用户回答）
    const resumeResult = transition(stagedResult.state, { kind: "resume" });
    assert.equal(resumeResult.ok, false);

    // 解决交互类型不匹配时必须被拒绝
    const mismatchResolve = transition(stagedResult.state, {
        kind: "resolve_interaction",
        interactionKind: "task_approval",
    });
    assert.equal(mismatchResolve.ok, false);

    // 正确解决交互：回到 running，stepCount 不变，pendingInteraction 清除
    const resolvedResult = transition(stagedResult.state, {
        kind: "resolve_interaction",
        interactionKind: "ask_user",
    });
    assert.equal(resolvedResult.ok, true);
    if (!resolvedResult.ok) return;

    assert.equal(resolvedResult.state.status, "running");
    assert.equal(resolvedResult.state.stepCount, 0);
    assert.equal(resolvedResult.state.pendingInteraction, undefined);
});

test("transition 处理 stage_interaction (task_approval) 进入 waiting，且与 pendingAction 互斥", () => {
    let run: RunState = {
        id: "run-1",
        status: "running",
        stepCount: 0,
        committedThroughSequence: 0,
        contextEpoch: { version: 1, number: 0, conversationStartIndex: 0, openedAtSequence: 0 },
    };

    const taskApprovalInteraction: PendingInteractionTaskApproval = {
        kind: "task_approval",
        proposal: {
            objective: "执行自动化测试",
            completionCriteria: [{ text: "全部通过" }],
        },
        approvalRequest: "请批准任务方案",
    };

    const staged = transition(run, {
        kind: "stage_interaction",
        interaction: taskApprovalInteraction,
    });
    assert.equal(staged.ok, true);
    if (!staged.ok) return;

    // 当处于交互等待时，拒绝 stage_action
    const stageActionFail = transition(staged.state, {
        kind: "stage_action",
        action: { actionId: "a-1", toolId: "bash", input: {} },
    });
    assert.equal(stageActionFail.ok, false);

    // 当处于交互等待时，拒绝 terminal decision
    const decisionFail = transition(staged.state, {
        kind: "decision",
        decision: { kind: "complete", summary: "已完成", completionEvidence: [] },
    });
    assert.equal(decisionFail.ok, false);

    // 取消等待：清除 pendingInteraction，进入 cancelled，不计 Step
    const cancelResult = transition(staged.state, { kind: "cancel" });
    assert.equal(cancelResult.ok, true);
    if (!cancelResult.ok) return;

    assert.equal(cancelResult.state.status, "cancelled");
    assert.equal(cancelResult.state.stepCount, 0);
    assert.equal(cancelResult.state.pendingInteraction, undefined);
});
