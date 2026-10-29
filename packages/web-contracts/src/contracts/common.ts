import { contract } from "../../../contracts/src/index";

/** wire 上可用的授权期限。 */
export const browserGrantScopeContract = contract.enum([
    "action",
    "goal",
    "workspace",
] as const);

/** Run 生命周期状态。 */
export const browserRunStatusContract = contract.enum([
    "created",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
] as const);

/** Run 进程活动状态。 */
export const browserExecutionStateContract = contract.enum([
    "active",
    "recoverable",
    "inactive",
] as const);

/** 非空且包含非空白字符的 wire 文本。 */
export const browserNonEmptyStringContract = contract.string({ pattern: "\\S" });

/** 浏览器可读的 Run 内消息位置。 */
export const browserMessagePositionContract = contract.openObject({
    afterSequence: contract.integer({ minimum: 0 }),
    order: contract.integer({ minimum: 0 }),
});

/** 工具授权或沙箱访问中的单个外部文件/目录条目。 */
export const browserToolGrantExtraFileContract = contract.openObject({
    canonicalPath: browserNonEmptyStringContract,
    access: contract.enum(["read", "write"] as const),
    kind: contract.enum(["file", "directory_tree"] as const),
});

/** 沙箱权限审阅摘要。 */
export const browserSandboxReviewContract = contract.openObject({
    extraFiles: contract.array(browserToolGrantExtraFileContract),
    network: contract.enum(["none", "all_outbound"] as const),
    networkNotice: contract.optional(contract.string()),
});

/** 会话输入种类。 */
export const browserSessionInputKindContract = contract.enum([
    "message",
    "steer",
    "interrupt",
    "respond",
    "resume",
    "queue_control",
] as const);

/** 输入账本中的受理状态。 */
export const browserSessionInputStatusContract = contract.enum([
    "pending",
    "applied",
    "cleared",
] as const);

/** 一条已持久化输入的受理收据投影。 */
export const browserSessionInputReceiptContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    inputId: browserNonEmptyStringContract,
    kind: browserSessionInputKindContract,
    sequence: contract.integer({ minimum: 1 }),
    status: browserSessionInputStatusContract,
    admittedAtRevision: contract.integer({ minimum: 0 }),
    targetRunId: contract.optional(browserNonEmptyStringContract),
    appliedRunId: contract.optional(browserNonEmptyStringContract),
    messageIndex: contract.optional(contract.integer({ minimum: 0 })),
});

/** 当前交互视图的种类。 */
export const browserInteractionKindContract = contract.enum([
    "question",
    "task_approval",
    "action_approval",
    "action_recovery",
] as const);

/** 当前交互允许的决定。 */
export const browserInteractionDecisionContract = contract.enum([
    "answer_questions",
    "reply_to_question",
    "skip_question",
    "approve_task",
    "send_task_feedback",
    "approve_action",
    "approve_action_revision",
    "reject_action",
    "retry_unknown_action",
    "decline_unknown_action_retry",
] as const);

/** 当前已提交等待的类型化交互视图摘要。 */
export const browserInteractionViewContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    kind: browserInteractionKindContract,
    interactionId: browserNonEmptyStringContract,
    requestId: contract.optional(browserNonEmptyStringContract),
    actionId: contract.optional(browserNonEmptyStringContract),
    recoveryRef: contract.optional(browserNonEmptyStringContract),
    decisions: contract.array(browserInteractionDecisionContract, { minItems: 1 }),
    truncated: contract.boolean(),
});

/** 本模块建立的共享 wire 合同，用于早期定义检查。 */
export const sharedWebContracts = [
    browserGrantScopeContract,
    browserRunStatusContract,
    browserExecutionStateContract,
    browserNonEmptyStringContract,
    browserMessagePositionContract,
    browserToolGrantExtraFileContract,
    browserSandboxReviewContract,
    browserSessionInputKindContract,
    browserSessionInputStatusContract,
    browserSessionInputReceiptContract,
    browserInteractionKindContract,
    browserInteractionDecisionContract,
    browserInteractionViewContract,
] as const;
