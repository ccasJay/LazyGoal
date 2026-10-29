import { contract } from "../../../contracts/src/index";
import {
    browserNonEmptyStringContract,
    browserRunStatusContract,
} from "./common";
import { browserActivityThinkDetailContract } from "./session";

/** Activity 历史中允许投影的已提交事件类型。 */
export const BROWSER_ACTIVITY_EVENT_TYPES = [
    "run_created",
    "run_started",
    "run_waiting",
    "run_completed",
    "run_failed",
    "run_cancelled",
    "run_stage_declared",
    "run_stage_accepted",
    "run_stage_rejected",
    "decision_received",
    "model_repair_feedback_recorded",
    "model_request_retry_recorded",
    "context_lookup_requested",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
    "action_staged",
    "action_approved",
    "action_revised",
    "action_rejected",
    "tool_started",
    "tool_attempt_started",
    "tool_attempt_failed",
    "tool_finished",
    "observation_recorded",
    "ask_user_answered",
    "ask_user_replied",
    "ask_user_skipped",
    "task_approved",
    "task_feedback_received",
    "session_input_applied",
    "steer_input_applied",
] as const;

/** Activity 项在固定历史窗口内的稳定排序键。 */
export const browserActivityPositionContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    runOrder: contract.integer({ minimum: 0 }),
    sequence: contract.integer({ minimum: 0 }),
    itemKind: contract.enum(["fact", "message"] as const),
    order: contract.integer({ minimum: 0 }),
});

/** Activity 事实项携带的已提交工具生命周期记录。 */
export const browserActivityToolLifecycleEntryContract = contract.object({
    kind: contract.enum(["approval", "execution", "retry", "result"] as const),
    title: browserNonEmptyStringContract,
    detail: contract.optional(contract.string()),
});

/** Activity 事实项携带的已提交工具状态白名单投影。 */
export const browserActivityToolStateContract = contract.object({
    toolId: browserNonEmptyStringContract,
    status: contract.enum([
        "recorded",
        "pending-result",
        "completed",
        "failed",
        "rejected",
    ] as const),
    actionStatus: contract.optional(
        contract.enum(["awaiting_approval", "approved", "rejected"] as const),
    ),
    inputSummary: contract.optional(contract.string()),
    summary: contract.optional(contract.string()),
    attempts: contract.optional(contract.array(contract.string())),
    lifecycle: contract.optional(contract.array(browserActivityToolLifecycleEntryContract)),
    revisionRef: contract.optional(browserNonEmptyStringContract),
    recoveryRef: contract.optional(browserNonEmptyStringContract),
    parentActionId: contract.optional(browserNonEmptyStringContract),
    activityBoundaryBefore: contract.optional(contract.literal(true)),
});

/** Activity 窗口中的正式消息摘要。 */
export const browserActivityMessageItemContract = contract.object({
    type: contract.literal("message"),
    itemId: browserNonEmptyStringContract,
    messageId: browserNonEmptyStringContract,
    role: contract.enum(["user", "assistant"] as const),
    purpose: contract.optional(contract.enum(["process", "answer", "notice"] as const)),
    previewId: contract.optional(browserNonEmptyStringContract),
    runId: browserNonEmptyStringContract,
    position: browserActivityPositionContract,
    content: contract.string(),
    contentLength: contract.integer({ minimum: 0 }),
    truncated: contract.boolean(),
});

/** Activity 窗口中的安全轨迹事实摘要。 */
export const browserActivityFactItemContract = contract.object({
    type: contract.literal("fact"),
    itemId: browserNonEmptyStringContract,
    eventId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    position: browserActivityPositionContract,
    eventType: contract.enum(BROWSER_ACTIVITY_EVENT_TYPES),
    title: contract.string(),
    detail: contract.optional(contract.string()),
    lookupId: contract.optional(browserNonEmptyStringContract),
    lookupRequest: contract.optional(contract.string()),
    lookupErrorCode: contract.optional(contract.enum([
        "INVALID_CONTEXT_LOOKUP",
        "CONTEXT_LOOKUP_CHAIN_LIMIT",
        "CONTEXT_LOOKUP_UNAVAILABLE",
        "CONTEXT_LOOKUP_FAILED",
        "INVALID_CONTEXT_LOOKUP_RESULT",
    ] as const)),
    executionUnitId: contract.optional(browserNonEmptyStringContract),
    actionId: contract.optional(browserNonEmptyStringContract),
    stageId: contract.optional(browserNonEmptyStringContract),
    stageRevision: contract.optional(contract.integer({ minimum: 1 })),
    stageTarget: contract.optional(browserNonEmptyStringContract),
    tool: contract.optional(browserActivityToolStateContract),
});

/** Activity 窗口中的显式 Think 摘要。 */
export const browserActivityThinkItemContract = contract.object({
    type: contract.literal("think"),
    itemId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    position: browserActivityPositionContract,
    executionUnitId: contract.optional(browserNonEmptyStringContract),
    think: browserActivityThinkDetailContract,
});

/** 正式消息、安全轨迹事实与显式 Think 组成的原子 Activity 项。 */
export const browserActivityItemContract = contract.discriminatedUnion("type", [
    browserActivityMessageItemContract,
    browserActivityFactItemContract,
    browserActivityThinkItemContract,
]);

/** Activity 的 Run 终态摘要。 */
export const browserActivityRunTerminalDetailContract = contract.object({
    code: contract.optional(contract.string()),
    message: contract.string(),
});

/** 一次读取涉及的 Run 上下文。 */
export const browserActivityRunContextContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    status: browserRunStatusContract,
    current: contract.boolean(),
    runOrder: contract.integer({ minimum: 0 }),
    committedThroughSequence: contract.integer({ minimum: 0 }),
    terminalDetail: contract.optional(browserActivityRunTerminalDetailContract),
});

/** 固定 Activity 窗口中单个 Run 的消息和轨迹上界。 */
export const browserActivityRunWindowContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    messageCount: contract.integer({ minimum: 0 }),
    throughMessageId: contract.optional(browserNonEmptyStringContract),
    committedThroughSequence: contract.integer({ minimum: 0 }),
});

/** Activity 页中跨页阶段的安全上下文。 */
export const browserActivityStageContextContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    stageId: browserNonEmptyStringContract,
    revision: contract.integer({ minimum: 1 }),
    status: contract.enum(["executing", "accepted", "rejected"] as const),
    target: contract.optional(contract.string()),
    firstSequence: contract.integer({ minimum: 0 }),
    lastSequence: contract.optional(contract.integer({ minimum: 0 })),
    completeWithinPage: contract.boolean(),
});

/** Activity 页中跨页 Action 活动组的完整性提示。 */
export const browserActivityActionContextContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    actionId: browserNonEmptyStringContract,
    firstSequence: contract.integer({ minimum: 0 }),
    lastSequence: contract.integer({ minimum: 0 }),
    completeWithinPage: contract.boolean(),
});

/** 当前页之外、仍可按 Activity cursor 读取的连续项区间。 */
export const browserActivityGapContract = contract.object({
    direction: contract.enum(["older", "newer"] as const),
    itemCount: contract.integer({ minimum: 1 }),
    first: browserActivityPositionContract,
    last: browserActivityPositionContract,
});

/** Activity 页的可用范围标记。 */
export const browserActivityRangeContract = contract.openObject({
    first: contract.optional(browserActivityPositionContract),
    last: contract.optional(browserActivityPositionContract),
    olderAvailable: contract.boolean(),
    newerAvailable: contract.boolean(),
});

/** 固定水位的一页 Activity 查询结果。 */
export const browserActivityPageContract = contract.object({
    goalId: browserNonEmptyStringContract,
    runFilter: contract.optional(browserNonEmptyStringContract),
    limit: contract.integer({ minimum: 1, maximum: 100 }),
    items: contract.array(browserActivityItemContract),
    runs: contract.array(browserActivityRunContextContract),
    window: contract.array(browserActivityRunWindowContract),
    gaps: contract.array(browserActivityGapContract, { maxItems: 2 }),
    range: browserActivityRangeContract,
    stages: contract.array(browserActivityStageContextContract),
    actionGroups: contract.array(browserActivityActionContextContract),
    beforeCursor: contract.optional(contract.string({ maxLength: 65_536, pattern: "^[A-Za-z0-9_-]+$" })),
    afterCursor: contract.optional(contract.string({ maxLength: 65_536, pattern: "^[A-Za-z0-9_-]+$" })),
});

/** Activity 读取路由的已验证参数。 */
export const browserActivityQueryContract = contract.openObject({
    runId: contract.optional(browserNonEmptyStringContract),
    before: contract.optional(contract.string({ maxLength: 65_536, pattern: "^[A-Za-z0-9_-]+$" })),
    after: contract.optional(contract.string({ maxLength: 65_536, pattern: "^[A-Za-z0-9_-]+$" })),
    limit: contract.optional(contract.integer({ minimum: 1, maximum: 100 })),
});

/** Activity 查询的稳定读取结果。 */
export const browserActivityReadResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        page: browserActivityPageContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_not_found",
            "run_not_found",
            "activity_cursor_invalid",
        ] as const),
    }),
]);

/** 本模块建立的 Activity 合同。 */
export const activityWebContracts = [
    browserActivityPositionContract,
    browserActivityToolLifecycleEntryContract,
    browserActivityToolStateContract,
    browserActivityMessageItemContract,
    browserActivityFactItemContract,
    browserActivityThinkItemContract,
    browserActivityItemContract,
    browserActivityRunTerminalDetailContract,
    browserActivityRunContextContract,
    browserActivityRunWindowContract,
    browserActivityStageContextContract,
    browserActivityActionContextContract,
    browserActivityGapContract,
    browserActivityRangeContract,
    browserActivityPageContract,
    browserActivityQueryContract,
    browserActivityReadResultContract,
] as const;
