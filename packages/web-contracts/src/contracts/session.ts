import { contract } from "../../../contracts/src/index";
import {
    browserExecutionStateContract,
    browserInteractionViewContract,
    browserMessagePositionContract,
    browserNonEmptyStringContract,
    browserRunStatusContract,
    browserSandboxReviewContract,
} from "./common";

/** 会话与看板投影中的 Run 执行与恢复状态。 */
export const browserGoalExecutionContract = contract.openObject({
    state: browserExecutionStateContract,
    committedThroughSequence: contract.number(),
});

/** 会话时间线中的用户或助手文本消息。 */
export const browserSessionMessageContract = contract.openObject({
    messageId: browserNonEmptyStringContract,
    role: contract.enum(["user", "assistant"] as const),
    content: contract.string(),
    runId: browserNonEmptyStringContract,
    position: browserMessagePositionContract,
});

/** Bash 命令执行的有界观察结果详情。 */
export const browserBashExecutionDetailContract = contract.openObject({
    command: contract.string(),
    exitCode: contract.optional(contract.number()),
    stdout: contract.optional(contract.string()),
    stderr: contract.optional(contract.string()),
    failure: contract.optional(contract.string()),
});

/** 已提交 Step 内显式 Think 的目标、输出与截断标记。 */
export const browserSessionStepThinkContract = contract.openObject({
    goal: contract.string(),
    output: contract.optional(contract.string()),
    truncated: contract.optional(contract.literal(true)),
});

/** 会话单步执行的安全投影。 */
export const browserSessionStepContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    executionUnitId: browserNonEmptyStringContract,
    sourceEventId: contract.optional(browserNonEmptyStringContract),
    actionId: contract.optional(browserNonEmptyStringContract),
    activityBoundaryBefore: contract.optional(contract.literal(true)),
    sequence: contract.integer(),
    stepIndex: contract.integer(),
    decisionKind: contract.optional(contract.string()),
    toolId: contract.optional(contract.string()),
    inputSummary: contract.optional(contract.string()),
    actionStatus: contract.optional(
        contract.enum(["awaiting_approval", "approved", "rejected"] as const),
    ),
    status: contract.enum(["recorded", "completed", "failed", "rejected"] as const),
    summary: contract.optional(contract.string()),
    think: contract.optional(browserSessionStepThinkContract),
    bashExecution: contract.optional(browserBashExecutionDetailContract),
    bashExecutionOmitted: contract.optional(contract.literal(true)),
    recoveryAttempts: contract.optional(contract.array(contract.string())),
    stageId: contract.optional(browserNonEmptyStringContract),
});

/** 阶段生命周期状态。 */
export const browserRunStageStatusContract = contract.enum([
    "in_progress",
    "review_pending",
    "accepted",
] as const);

/** 阶段修订历史记录。 */
export const browserRunStageRevisionContract = contract.openObject({
    revision: contract.number(),
    target: contract.string(),
    reason: contract.optional(contract.string()),
});

/** 阶段审查拒绝反馈。 */
export const browserRunStageRejectionContract = contract.openObject({
    code: contract.string(),
    issues: contract.array(contract.string()),
});

/** 前序阶段结果引用。 */
export const browserRunStageResultRefContract = contract.openObject({
    stageId: browserNonEmptyStringContract,
    revision: contract.integer(),
});

/** Run 中按稳定身份聚合的阶段执行与审查记录看板投影。 */
export const browserRunStageGroupContract = contract.openObject({
    stageId: browserNonEmptyStringContract,
    revision: contract.integer(),
    target: contract.string(),
    acceptanceCriteria: contract.array(contract.string()),
    status: browserRunStageStatusContract,
    resultSummary: contract.optional(contract.string()),
    latestReviewRejection: contract.optional(browserRunStageRejectionContract),
    previousStageResultRef: contract.optional(browserRunStageResultRefContract),
    revisions: contract.optional(contract.array(browserRunStageRevisionContract)),
    steps: contract.array(browserSessionStepContract),
});

/** 已批准 Plan Run 中带 Runtime 身份的阶段状态。 */
export const browserPlanRouteStageStateContract = contract.openObject({
    stageId: browserNonEmptyStringContract,
    revision: contract.integer({ minimum: 1 }),
    status: contract.enum(["pending", "executing", "accepted"] as const),
    target: browserNonEmptyStringContract,
    acceptanceCriteria: contract.array(browserNonEmptyStringContract, { minItems: 1 }),
    acceptedSequence: contract.optional(contract.integer({ minimum: 0 })),
});

/** Plan Run 会话中的一条已批准路线。 */
export const browserPlanRouteContract = contract.openObject({
    revision: contract.integer({ minimum: 1 }),
    revisionReason: contract.optional(browserNonEmptyStringContract),
    nextStageIndex: contract.integer({ minimum: 0 }),
    stages: contract.array(browserPlanRouteStageStateContract, { minItems: 1 }),
});

/** Run 会话中单个 Run 的终态原因详情。 */
export const browserSessionRunTerminalDetailContract = contract.openObject({
    code: contract.optional(contract.string()),
    message: contract.string(),
});

/** 会话中单个 Run 的历史投影。 */
export const browserSessionRunContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    status: browserRunStatusContract,
    stepCount: contract.integer(),
    steps: contract.array(browserSessionStepContract),
    current: contract.boolean(),
    stages: contract.optional(contract.array(browserRunStageGroupContract)),
    planRoute: contract.optional(browserPlanRouteContract),
    terminalDetail: contract.optional(browserSessionRunTerminalDetailContract),
});

/** 结构化问卷选项。 */
export const browserAskUserOptionContract = contract.openObject({
    id: browserNonEmptyStringContract,
    label: contract.string(),
    description: contract.optional(contract.string()),
});

/** 结构化问卷问题。 */
export const browserAskUserQuestionContract = contract.openObject({
    id: browserNonEmptyStringContract,
    header: contract.string(),
    question: contract.string(),
    multiSelect: contract.boolean(),
    options: contract.array(browserAskUserOptionContract),
});

/** 结构化问卷单个问题的用户回答。 */
export const browserAskUserAnswerContract = contract.openObject({
    questionId: browserNonEmptyStringContract,
    optionIds: contract.array(contract.string()),
    otherText: contract.optional(contract.string()),
});

/** Plan Run 任务提案中的一个有序阶段。 */
export const browserPlanRouteStageContract = contract.openObject({
    target: contract.string(),
    acceptanceCriteria: contract.array(contract.string()),
});

/** 目标拆解计划中的条目。 */
export const browserGoalPlanItemContract = contract.openObject({
    id: browserNonEmptyStringContract,
    content: contract.string(),
    position: contract.integer(),
    status: contract.enum(["pending", "in_progress", "completed", "cancelled"] as const),
});

/** Goal 的多步任务执行计划视图。 */
export const browserGoalPlanContract = contract.openObject({
    revision: contract.integer(),
    items: contract.array(browserGoalPlanItemContract),
});

/** 父程序调用标识。 */
export const browserParentProgramContract = contract.openObject({
    actionId: browserNonEmptyStringContract,
    callNumber: contract.integer({ minimum: 1 }),
});

/** 待用户审批的工具或沙箱 Action 视图。 */
export const browserPendingActionContract = contract.openObject({
    actionId: browserNonEmptyStringContract,
    toolId: browserNonEmptyStringContract,
    status: contract.enum(["approved", "awaiting_approval", "outcome_unknown"] as const),
    inputSummary: contract.optional(contract.string()),
    inputPreview: contract.string(),
    inputPreviewTruncated: contract.boolean(),
    targetPath: contract.optional(contract.string()),
    approvalKind: contract.optional(contract.enum(["tool", "sandbox"] as const)),
    sandboxReview: contract.optional(browserSandboxReviewContract),
    parentProgram: contract.optional(browserParentProgramContract),
});

/** 工作区 Goal 列表项的安全传输对象。 */
export const browserGoalListItemContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    intent: contract.string(),
    workflowPhase: contract.string(),
    runStatus: browserRunStatusContract,
    execution: contract.optional(browserGoalExecutionContract),
    updatedAt: contract.string(),
    archived: contract.boolean(),
});

/** 工作区 Goal 列表响应信封。 */
export const browserGoalListContract = contract.openObject({
    goals: contract.array(browserGoalListItemContract),
    unreadableCount: contract.integer({ minimum: 0 }),
});

/** 已受理且尚未进入模型输入的 Steer 消息。 */
export const browserPendingSteerContract = contract.openObject({
    messageId: browserNonEmptyStringContract,
    content: contract.string(),
});

/** 已受理、尚未应用的普通消息。 */
export const browserPendingMessageContract = contract.openObject({
    inputId: browserNonEmptyStringContract,
    content: contract.string(),
});

/** 消息队列修订与暂停事实。 */
export const browserQueueStateContract = contract.openObject({
    revision: contract.integer({ minimum: 0 }),
    paused: contract.boolean(),
    pauseReason: contract.optional(contract.enum(["run_failed", "user_interrupt"] as const)),
});

/** 已受理的用户终止及取消结算状态。 */
export const browserInterruptionContract = contract.openObject({
    requestId: browserNonEmptyStringContract,
    status: contract.enum(["requested", "finished"] as const),
    outcomeUnknown: contract.optional(contract.boolean()),
});

/** 完整 Goal 会话详情的传输对象。 */
export const browserGoalSessionContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    intent: contract.string(),
    currentRunId: browserNonEmptyStringContract,
    runStatus: browserRunStatusContract,
    currentRunMode: contract.enum(["normal", "plan"] as const),
    nextRunMode: contract.optional(contract.literal("plan")),
    execution: contract.optional(browserGoalExecutionContract),
    messages: contract.array(browserSessionMessageContract),
    pendingSteers: contract.optional(contract.array(browserPendingSteerContract)),
    pendingMessages: contract.optional(contract.array(browserPendingMessageContract)),
    queue: contract.optional(browserQueueStateContract),
    interruption: contract.optional(browserInterruptionContract),
    runs: contract.array(browserSessionRunContract),
    goalPlan: contract.optional(browserGoalPlanContract),
    interaction: contract.optional(browserInteractionViewContract),
    pendingAction: contract.optional(browserPendingActionContract),
    historyTruncated: contract.boolean(),
});

/** 窄 Goal 状态中指向 Activity 窗口的历史标记。 */
export const browserActivityHistoryMarkerContract = contract.openObject({
    included: contract.literal(false),
    source: contract.literal("activity"),
});

/** 初始读取和分页使用的窄 Goal 状态。 */
export const browserGoalSessionStateContract = contract.object({
    goalId: browserNonEmptyStringContract,
    intent: contract.string(),
    currentRunId: browserNonEmptyStringContract,
    runStatus: browserRunStatusContract,
    currentRunMode: contract.enum(["normal", "plan"] as const),
    nextRunMode: contract.optional(contract.literal("plan")),
    currentRunStepCount: contract.integer({ minimum: 0 }),
    currentRunTerminalDetail: contract.optional(contract.object({
        code: contract.optional(contract.string()),
        message: contract.string(),
    })),
    currentPlanRoute: contract.optional(browserPlanRouteContract),
    execution: contract.optional(browserGoalExecutionContract),
    pendingSteers: contract.optional(contract.array(browserPendingSteerContract)),
    pendingMessages: contract.optional(contract.array(browserPendingMessageContract)),
    queue: contract.optional(browserQueueStateContract),
    interruption: contract.optional(browserInterruptionContract),
    goalPlan: contract.optional(browserGoalPlanContract),
    interaction: contract.optional(browserInteractionViewContract),
    pendingAction: contract.optional(browserPendingActionContract),
    history: contract.object({
        messages: browserActivityHistoryMarkerContract,
        steps: browserActivityHistoryMarkerContract,
        stages: browserActivityHistoryMarkerContract,
    }),
});

/** 会话消息的公开条目。 */
export const browserSessionMessageEntryContract = contract.openObject({
    messageId: browserNonEmptyStringContract,
    role: contract.enum(["user", "assistant"] as const),
    runId: browserNonEmptyStringContract,
    position: browserMessagePositionContract,
    purpose: contract.optional(contract.enum(["process", "answer", "notice"] as const)),
    sourceKind: contract.string(),
    sourceId: contract.string(),
    content: contract.string(),
    contentLength: contract.integer({ minimum: 0 }),
    truncated: contract.boolean(),
});

/** 有界消息列表的 wire 结果。 */
export const browserSessionMessageListResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        messages: contract.array(browserSessionMessageEntryContract),
        nextAfterMessageId: contract.optional(browserNonEmptyStringContract),
        throughMessageId: contract.optional(browserNonEmptyStringContract),
        total: contract.integer({ minimum: 0 }),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum(["message_range_invalid", "goal_not_found"] as const),
    }),
]);

/** 单条消息正文的 wire 结果。 */
export const browserSessionMessageResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        message: browserSessionMessageEntryContract,
        nextOffset: contract.optional(contract.integer({ minimum: 0 })),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum(["message_not_found", "goal_not_found"] as const),
    }),
]);

/** 本模块建立的会话、Run、Plan 与消息合同。 */
export const sessionWebContracts = [
    browserGoalExecutionContract,
    browserSessionMessageContract,
    browserBashExecutionDetailContract,
    browserSessionStepThinkContract,
    browserSessionStepContract,
    browserRunStageStatusContract,
    browserRunStageRevisionContract,
    browserRunStageRejectionContract,
    browserRunStageResultRefContract,
    browserRunStageGroupContract,
    browserPlanRouteStageStateContract,
    browserPlanRouteContract,
    browserSessionRunTerminalDetailContract,
    browserSessionRunContract,
    browserAskUserOptionContract,
    browserAskUserQuestionContract,
    browserAskUserAnswerContract,
    browserPlanRouteStageContract,
    browserGoalPlanItemContract,
    browserGoalPlanContract,
    browserParentProgramContract,
    browserPendingActionContract,
    browserGoalListItemContract,
    browserGoalListContract,
    browserPendingSteerContract,
    browserPendingMessageContract,
    browserQueueStateContract,
    browserInterruptionContract,
    browserGoalSessionContract,
    browserActivityHistoryMarkerContract,
    browserGoalSessionStateContract,
    browserSessionMessageEntryContract,
    browserSessionMessageListResultContract,
    browserSessionMessageResultContract,
] as const;
