import { contract } from "../../../contracts/src/index";
import {
    browserInteractionKindContract,
    browserMessagePositionContract,
    browserNonEmptyStringContract,
    browserRunStatusContract,
    browserSessionInputKindContract,
    browserSessionInputReceiptContract,
} from "./common";
import { browserActionReviewScopeContract } from "./interaction";
import {
    browserGoalSessionContract,
    browserGoalSessionStateContract,
} from "./session";

/** 输入受理与查询的稳定 wire 拒绝代码。 */
export const browserSessionInputErrorCodeContract = contract.enum([
    "INVALID_INPUT",
    "INPUT_CONFLICT",
    "INPUT_NOT_FOUND",
    "GOAL_NOT_FOUND",
    "BUSY",
    "STEER_CONFLICT",
    "INTERRUPT_CONFLICT",
    "STALE_REVISION",
    "INTERACTION_MISMATCH",
    "INTERACTION_REQUIRED",
    "QUEUE_PAUSED",
    "RUN_NOT_RESUMABLE",
    "QUEUE_FULL",
    "QUEUE_TEXT_TOO_LARGE",
    "TEXT_TOO_LARGE",
    "QUEUE_NOT_PAUSED",
    "QUEUE_REVISION_MISMATCH",
    "QUEUED_MESSAGE_NOT_FOUND",
    "RUN_NOT_FOUND",
    "RUN_NOT_RUNNING",
    "RUN_CONTROL_UNAVAILABLE",
    "input_admission_failed",
    "session_unavailable",
] as const);

/** 统一会话输入的严格 wire 交互回答。 */
export const browserSessionInteractionResponseContract = contract.union([
    contract.object({
        kind: contract.literal("answer_ask_user"),
        answers: contract.array(contract.object({
            questionId: browserNonEmptyStringContract,
            optionIds: contract.array(browserNonEmptyStringContract, { maxItems: 3 }),
            otherText: contract.optional(browserNonEmptyStringContract),
        }), { minItems: 1, maxItems: 3 }),
    }),
    contract.object({
        kind: contract.literal("reply_to_question"),
        content: browserNonEmptyStringContract,
    }),
    contract.object({ kind: contract.literal("skip_question") }),
    contract.object({ kind: contract.literal("approve_task") }),
    contract.object({
        kind: contract.literal("feedback_task"),
        feedback: browserNonEmptyStringContract,
    }),
    contract.object({
        kind: contract.literal("approve_action"),
        actionId: browserNonEmptyStringContract,
        scope: contract.optional(browserActionReviewScopeContract),
    }),
    contract.object({
        kind: contract.literal("approve_action_revision"),
        actionId: browserNonEmptyStringContract,
        input: contract.unknown(),
        reviewRef: browserNonEmptyStringContract,
        scope: contract.optional(browserActionReviewScopeContract),
    }),
    contract.object({
        kind: contract.literal("retry_unknown_action"),
        actionId: browserNonEmptyStringContract,
        recoveryRef: browserNonEmptyStringContract,
    }),
    contract.object({
        kind: contract.literal("decline_unknown_action_retry"),
        actionId: browserNonEmptyStringContract,
        recoveryRef: browserNonEmptyStringContract,
        reason: browserNonEmptyStringContract,
    }),
    contract.object({
        kind: contract.literal("reject_action"),
        actionId: browserNonEmptyStringContract,
        reason: browserNonEmptyStringContract,
    }),
]);

/** 排队消息转为 Steer 时的队列绑定。 */
export const browserQueueBindingContract = contract.object({
    messageId: browserNonEmptyStringContract,
    queueRevision: contract.integer({ minimum: 0 }),
});

/** `POST /api/goals/:goalId/inputs` 的严格 wire 命令。 */
export const browserSessionInputCommandContract = contract.union([
    contract.object({
        kind: contract.literal("message"),
        inputId: browserNonEmptyStringContract,
        content: browserNonEmptyStringContract,
    }),
    contract.object({
        kind: contract.literal("steer"),
        inputId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        content: browserNonEmptyStringContract,
        queueBinding: contract.optional(browserQueueBindingContract),
    }),
    contract.object({
        kind: contract.literal("interrupt"),
        inputId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
    }),
    contract.object({
        kind: contract.literal("respond"),
        inputId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        requestId: browserNonEmptyStringContract,
        response: browserSessionInteractionResponseContract,
    }),
    contract.object({
        kind: contract.literal("resume"),
        inputId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        commitRevision: contract.integer({ minimum: 0 }),
        content: contract.optional(browserNonEmptyStringContract),
    }),
    contract.object({
        kind: contract.literal("queue_control"),
        inputId: browserNonEmptyStringContract,
        action: contract.enum(["continue", "clear", "remove"] as const),
        queueRevision: contract.integer({ minimum: 0 }),
        messageId: contract.optional(browserNonEmptyStringContract),
    }),
]);

/** 一条输入受理／拒绝的公开结果。 */
export const browserSessionInputOutcomeContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    inputId: browserNonEmptyStringContract,
    kind: browserSessionInputKindContract,
    ok: contract.boolean(),
    existing: contract.optional(contract.boolean()),
    receipt: contract.optional(browserSessionInputReceiptContract),
    code: contract.optional(browserSessionInputErrorCodeContract),
});

/** 一次 inputs 受理的 wire 结果。 */
export const browserSessionInputResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        existing: contract.boolean(),
        receipt: browserSessionInputReceiptContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: browserSessionInputErrorCodeContract,
    }),
]);

/** 按身份查询持久化收据的结果。 */
export const browserSessionInputQueryResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        found: contract.literal(false),
    }),
    contract.openObject({
        ok: contract.literal(true),
        found: contract.literal(true),
        receipt: browserSessionInputReceiptContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum(["GOAL_NOT_FOUND", "input_read_failed"] as const),
    }),
]);

/** 当前等待交互的规范引用。 */
export const browserSessionStateInteractionContract = contract.openObject({
    interactionId: browserNonEmptyStringContract,
    kind: browserInteractionKindContract,
    runId: browserNonEmptyStringContract,
    requestId: contract.optional(browserNonEmptyStringContract),
    actionId: contract.optional(browserNonEmptyStringContract),
});

/** 会话状态中有界消息范围的一条摘要。 */
export const browserSessionStateMessageContract = contract.openObject({
    messageId: browserNonEmptyStringContract,
    role: contract.enum(["user", "assistant"] as const),
    runId: browserNonEmptyStringContract,
    position: browserMessagePositionContract,
    purpose: contract.optional(contract.enum(["process", "answer", "notice"] as const)),
    sourceKind: browserNonEmptyStringContract,
    sourceId: browserNonEmptyStringContract,
});

/** 当前 Run 的用户中断状态。 */
export const browserSessionStateInterruptionContract = contract.openObject({
    requestId: browserNonEmptyStringContract,
    status: contract.enum(["requested", "finished"] as const),
    outcomeUnknown: contract.boolean(),
});

/** 安全会话状态投影。 */
export const browserSessionStateContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    runStatus: browserRunStatusContract,
    mode: contract.enum(["normal", "plan"] as const),
    commitRevision: contract.integer({ minimum: 0 }),
    queueRevision: contract.integer({ minimum: 0 }),
    queuePaused: contract.boolean(),
    queuePauseReason: contract.optional(contract.enum(["run_failed", "user_interrupt"] as const)),
    pendingMessageCount: contract.integer({ minimum: 0 }),
    pendingSteerCount: contract.integer({ minimum: 0 }),
    waitingFor: contract.optional(contract.enum([
        "ask_user",
        "task_approval",
        "action_approval",
        "action_recovery",
        "blocked",
    ] as const)),
    interaction: contract.optional(browserSessionStateInteractionContract),
    messages: contract.openObject({
        count: contract.integer({ minimum: 0 }),
        throughMessageId: contract.optional(browserNonEmptyStringContract),
        recent: contract.array(browserSessionStateMessageContract),
    }),
    needsRecovery: contract.boolean(),
    interruption: contract.optional(browserSessionStateInterruptionContract),
    executionOwner: contract.boolean(),
});

/** 创建 Session 的 wire 命令。 */
export const browserCreateSessionCommandContract = contract.object({
    goalId: browserNonEmptyStringContract,
    inputId: browserNonEmptyStringContract,
    intent: browserNonEmptyStringContract,
    mode: contract.optional(contract.literal("plan")),
    modelId: contract.optional(browserNonEmptyStringContract),
});

/** 创建 Session 的 wire 结果。 */
export const browserCreateSessionResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        existing: contract.boolean(),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        receipt: browserSessionInputReceiptContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_id_conflict",
            "goal_busy",
            "model_not_selectable",
            "model_catalog_unavailable",
            "profile_not_found",
            "invalid_goal_input",
            "goal_unreadable",
            "service_shutting_down",
            "create_failed",
        ] as const),
    }),
]);

/** 完整会话响应信封。 */
export const browserGoalSessionEnvelopeContract = contract.openObject({
    goal: browserGoalSessionContract,
    session: contract.optional(browserSessionStateContract),
});

/** 窄状态响应信封。 */
export const browserGoalSessionStateEnvelopeContract = contract.openObject({
    goal: browserGoalSessionStateContract,
    session: contract.optional(browserSessionStateContract),
});

/** 本模块建立的统一输入、会话状态与创建命令合同。 */
export const inputWebContracts = [
    browserSessionInputErrorCodeContract,
    browserSessionInteractionResponseContract,
    browserQueueBindingContract,
    browserSessionInputCommandContract,
    browserSessionInputOutcomeContract,
    browserSessionInputResultContract,
    browserSessionInputQueryResultContract,
    browserSessionStateInteractionContract,
    browserSessionStateMessageContract,
    browserSessionStateInterruptionContract,
    browserSessionStateContract,
    browserCreateSessionCommandContract,
    browserCreateSessionResultContract,
    browserGoalSessionEnvelopeContract,
    browserGoalSessionStateEnvelopeContract,
] as const;
