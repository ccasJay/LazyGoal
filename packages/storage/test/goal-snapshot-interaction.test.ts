import assert from "node:assert/strict";
import test from "node:test";

import {
    createGoal,
    type Goal,
    type GoalTask,
    type PendingInteractionAskUser,
    type PendingInteractionTaskApproval,
} from "../../runtime/src/index";
import {
    assertValidTrajectoryEventDraft,
    classifyTrajectoryEvent,
    type TrajectoryEventDraft,
} from "../../runtime/src/trajectory";
import {
    GoalSnapshotProtocolError,
    goalSnapshotCodec,
} from "../src/index";

const baseProfile = {
    id: "profile-1",
    name: "Assistant",
    systemPrompt: "You are an assistant.",
    instructions: ["Follow user constraints"],
    toolIds: ["read_file"],
};

function createBaseGoal(): Goal {
    return createGoal({
        id: "goal-test-1",
        intent: "测试交互恢复",
        promptBundleVersion: 1,
        profile: baseProfile,
        runId: "run-test-1",
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    });
}

test("Snapshot round-trip: 处于 ask_user 等待问答的 Goal 能够完整编码与恢复", () => {
    const goal = createBaseGoal();
    const askUserInteraction: PendingInteractionAskUser = {
        kind: "ask_user",
        requestId: "req-123",
        mode: "plan",
        questions: [
            {
                id: "q-1",
                header: "环境配置",
                question: "选择目标平台？",
                options: [
                    { id: "opt-linux", label: "Linux", description: "Ubuntu 22.04" },
                    { id: "opt-mac", label: "macOS", description: "Apple Silicon" },
                ],
                multiSelect: false,
            },
            {
                id: "q-2",
                header: "依赖选项",
                question: "选择附加特性？",
                options: [
                    { id: "opt-tracing", label: "链路追踪" },
                    { id: "opt-metrics", label: "指标监控" },
                    { id: "opt-profiling", label: "性能剖析" },
                ],
                multiSelect: true,
            },
        ],
    };

    const waitingGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingInteraction: askUserInteraction,
            },
        },
    };

    const encoded = goalSnapshotCodec.encode(waitingGoal);
    const decoded = goalSnapshotCodec.decode(encoded);

    assert.deepEqual(decoded, waitingGoal);
    assert.equal(decoded.state.run.status, "waiting");
    assert.equal(decoded.state.run.pendingInteraction?.kind, "ask_user");
    if (decoded.state.run.pendingInteraction?.kind === "ask_user") {
        assert.equal(decoded.state.run.pendingInteraction.requestId, "req-123");
        assert.equal(decoded.state.run.pendingInteraction.questions.length, 2);
        assert.equal(decoded.state.run.pendingInteraction.questions[0]?.multiSelect, false);
        assert.equal(decoded.state.run.pendingInteraction.questions[1]?.multiSelect, true);
    }
});

test("Snapshot round-trip: 处于 task_approval 等待批准的 Goal 能够完整编码与恢复", () => {
    const goal = createBaseGoal();
    const taskProposal: GoalTask = {
        objective: "重构持久化层",
        completionCriteria: [
            { text: "移除 preparation 工作流" },
            { text: "支持 ask_user 交互恢复", acceptance: { expectToolId: "read_file", expectOutcome: "success" } },
        ],
    };
    const approvalInteraction: PendingInteractionTaskApproval = {
        kind: "task_approval",
        proposal: taskProposal,
        approvalRequest: "请确认任务目标与完成条件",
    };

    const waitingGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingInteraction: approvalInteraction,
            },
        },
    };

    const encoded = goalSnapshotCodec.encode(waitingGoal);
    const decoded = goalSnapshotCodec.decode(encoded);

    assert.deepEqual(decoded, waitingGoal);
    assert.equal(decoded.state.run.pendingInteraction?.kind, "task_approval");
    if (decoded.state.run.pendingInteraction?.kind === "task_approval") {
        assert.equal(decoded.state.run.pendingInteraction.approvalRequest, "请确认任务目标与完成条件");
        assert.equal(decoded.state.run.pendingInteraction.proposal.objective, "重构持久化层");
        assert.equal(decoded.state.run.pendingInteraction.proposal.completionCriteria.length, 2);
    }
});

test("快照不变量: pendingAction 与 pendingInteraction 互斥拒绝", () => {
    const goal = createBaseGoal();
    const taskProposal: GoalTask = {
        objective: "任务目标",
        completionCriteria: [{ text: "完成条件" }],
    };

    const invalidGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                task: taskProposal,
            },
            run: {
                ...goal.state.run,
                status: "waiting",
                stepCount: 1,
                lastStep: {
                    kind: "decision",
                    result: { kind: "wait", reason: "等待授权与问答" },
                },
                pendingAction: {
                    action: { actionId: "act-1", toolId: "read_file", input: {} },
                    status: "awaiting_approval",
                },
                pendingInteraction: {
                    kind: "task_approval",
                    proposal: taskProposal,
                    approvalRequest: "请批准",
                },
            },
        },
    };

    assert.throws(
        () => goalSnapshotCodec.encode(invalidGoal),
        (error: unknown) => {
            return error instanceof GoalSnapshotProtocolError
                && error.message.includes("Goal does not satisfy the current snapshot schema");
        },
    );
});

test("快照不变量: pendingInteraction 必须处于 waiting 状态", () => {
    const goal = createBaseGoal();
    const invalidGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "running",
                pendingInteraction: {
                    kind: "task_approval",
                    proposal: { objective: "目标", completionCriteria: [{ text: "条件" }] },
                    approvalRequest: "请批准",
                },
            },
        },
    };

    assert.throws(
        () => goalSnapshotCodec.encode(invalidGoal),
        (error: unknown) => {
            return error instanceof GoalSnapshotProtocolError;
        },
    );
});

test("快照不变量: terminal 或 created 状态不得含有 pendingInteraction", () => {
    const goal = createBaseGoal();
    const task: GoalTask = { objective: "目标", completionCriteria: [{ text: "条件" }] };

    // created
    const createdGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "created",
                pendingInteraction: {
                    kind: "task_approval",
                    proposal: task,
                    approvalRequest: "请批准",
                },
            },
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(createdGoal), GoalSnapshotProtocolError);

    // completed
    const completedGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing", task },
            run: {
                ...goal.state.run,
                status: "completed",
                stepCount: 1,
                lastStep: {
                    kind: "decision",
                    result: { kind: "complete", summary: "完成", completionEvidence: [] },
                },
                pendingInteraction: {
                    kind: "task_approval",
                    proposal: task,
                    approvalRequest: "请批准",
                },
            },
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(completedGoal), GoalSnapshotProtocolError);
});

test("快照不变量: 任务未批准时允许普通 Step 与 pendingAction", () => {
    const goal = createBaseGoal();
    // task 未定义，却有普通只读 Action/Observation Step
    const stepCountGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing" },
            run: {
                ...goal.state.run,
                status: "running",
                stepCount: 1,
                lastStep: {
                    kind: "action",
                    action: { actionId: "read-1", toolId: "read_file", input: { path: "README.md" } },
                    observation: { kind: "success", output: "内容", summary: "读取完成" },
                },
            },
        },
    };
    const encodedStep = goalSnapshotCodec.encode(stepCountGoal);
    assert.equal(goalSnapshotCodec.decode(encodedStep).state.run.stepCount, 1);

    // task 未定义，却有需要批准的普通只读 Action
    const pendingActionGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing" },
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingAction: {
                    action: { actionId: "act-1", toolId: "read_file", input: {} },
                    status: "awaiting_approval",
                },
            },
        },
    };
    const encodedPending = goalSnapshotCodec.encode(pendingActionGoal);
    assert.equal(
        goalSnapshotCodec.decode(encodedPending).state.run.pendingAction?.status,
        "awaiting_approval",
    );
});

test("历史 Preparation 快照在 decode 时 fail-closed 拒绝", () => {
    const validGoal = createBaseGoal();
    const encoded = goalSnapshotCodec.encode(validGoal);

    // 含有旧 phase: "gathering_context"
    const gatheringSnapshot = JSON.parse(JSON.stringify(encoded));
    gatheringSnapshot.state.workflow = {
        phase: "gathering_context",
        preparation: { status: "active" },
    };
    assert.throws(
        () => goalSnapshotCodec.decode(gatheringSnapshot),
        (error: unknown) => {
            return error instanceof GoalSnapshotProtocolError
                && error.message.includes("legacy preparation workflows are no longer supported");
        },
    );

    // 含有旧 preparation 字段
    const executingWithPreparation = JSON.parse(JSON.stringify(encoded));
    executingWithPreparation.state.workflow = {
        phase: "executing",
        preparation: { status: "completed" },
        task: { objective: "目标", completionCriteria: [{ text: "条件" }] },
    };
    assert.throws(
        () => goalSnapshotCodec.decode(executingWithPreparation),
        (error: unknown) => {
            return error instanceof GoalSnapshotProtocolError
                && error.message.includes("legacy preparation workflows are no longer supported");
        },
    );
});

test("Trajectory: 支持 ask_user_answered 与 task_approved 事件，拒绝旧 preparation 事件", () => {
    const askUserDraft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "ask_user_answered",
        payload: {
            type: "ask_user_answered",
            requestId: "req-1",
            answers: [
                { questionId: "q-1", optionIds: ["opt-1"] },
            ],
        },
    };
    assertValidTrajectoryEventDraft(askUserDraft);
    assert.equal(classifyTrajectoryEvent(askUserDraft), "lifecycle");

    const taskApprovedDraft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "task_approved",
        payload: {
            type: "task_approved",
            task: {
                objective: "目标",
                completionCriteria: [{ text: "完成条件" }],
            },
        },
    };
    assertValidTrajectoryEventDraft(taskApprovedDraft);
    assert.equal(classifyTrajectoryEvent(taskApprovedDraft), "lifecycle");

    // 旧 preparation_input_recorded 事件被拒绝
    const legacyInputDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "preparation_input_recorded",
        payload: {
            type: "preparation_input_recorded",
            messageIndex: 0,
            contentHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
    };
    assert.throws(
        () => assertValidTrajectoryEventDraft(legacyInputDraft),
        (error: unknown) => error instanceof Error && error.message.includes("eventType is invalid"),
    );

    // 旧 preparation_result 事件被拒绝
    const legacyResultDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "preparation_result",
        payload: {
            type: "preparation_result",
            result: "task_proposal",
        },
    };
    assert.throws(
        () => assertValidTrajectoryEventDraft(legacyResultDraft),
        (error: unknown) => error instanceof Error && error.message.includes("eventType is invalid"),
    );

    // 非 executing 的旧阶段被拒绝
    const invalidPhaseDraft = {
        ...askUserDraft,
        phase: "planning" as unknown as "executing",
    };
    assert.throws(
        () => assertValidTrajectoryEventDraft(invalidPhaseDraft),
        (error: unknown) => error instanceof Error && error.message.includes("phase is invalid"),
    );
});
