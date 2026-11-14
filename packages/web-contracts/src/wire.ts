/**
 * Web HTTP、SSE 与浏览器投影的原生 TypeScript wire 类型。
 *
 * @remarks
 * 本文件是 Web 传输字段与约束的唯一来源。`contracts/catalog.json` 只登记边界根类型、
 * 生成策略与制品路径；生成的 Schema、校验器与绑定由构建入口读取本文件产生。类型
 * 不拥有执行、审批、授权或持久化语义。
 */

/** JSON 协议允许的 Web wire 值。 */
export type BrowserJsonValue =
    | null
    | boolean
    | number
    | string
    | readonly BrowserJsonValue[]
    | { readonly [key: string]: BrowserJsonValue };

/**
 * Goal Server 健康探针的成功响应。
 *
 * @remarks
 * `GET /healthz` 只表示 HTTP 服务可响应，不包含业务依赖、配置或诊断状态。
 *
 * @example
 * ```ts
 * const response: HealthzResponse = { status: "ok" };
 * ```
 */
export interface HealthzResponse {
    readonly status: "ok";
}

/** wire 上可用的授权期限。 */
export type BrowserGrantScope = "action" | "goal" | "workspace";

/** Run 生命周期状态。 */
export type BrowserRunStatus =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

/** Run 进程活动状态。 */
export type BrowserExecutionState = "active" | "recoverable" | "inactive";

/** 会话输入种类。 */
export type BrowserSessionInputKind =
    | "message"
    | "steer"
    | "interrupt"
    | "respond"
    | "resume"
    | "queue_control"
    | "compact";

/** 输入账本中的受理状态。 */
export type BrowserSessionInputStatus = "pending" | "applied" | "cleared";

/** 当前交互视图的种类。 */
export type BrowserInteractionKind = "question" | "task_approval" | "action_approval" | "action_recovery";

/** 当前交互允许的决定。 */
export type BrowserInteractionDecision =
    | "answer_questions"
    | "reply_to_question"
    | "skip_question"
    | "approve_task"
    | "send_task_feedback"
    | "approve_action"
    | "approve_action_revision"
    | "reject_action"
    | "retry_unknown_action"
    | "decline_unknown_action_retry";

/**
 * 浏览器可读的 Run 内消息位置。
 *
 * @remarks
 * `afterSequence` 对应消息前最后一条已提交 Run 事实，`order` 保持同锚点消息的
 * Snapshot 次序；该值不表示墙钟时间或执行 Step。
 *
 * @example
 * ```ts
 * const position: BrowserMessagePosition = { afterSequence: 12, order: 0 };
 * ```
 */
export interface BrowserMessagePosition {
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly afterSequence: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly order: number;
}

/** 权限边界中的单个外部文件/目录条目。 */
export interface BrowserPermissionExtraFile {
    /** @pattern \S */
    readonly canonicalPath: string;
    readonly access: "read" | "write";
    readonly kind: "file" | "directory_tree";
}

/** 沙箱权限审阅摘要。 */
export interface BrowserSandboxReview {
    readonly extraFiles: readonly BrowserPermissionExtraFile[];
    readonly network: "none" | "all_outbound";
    readonly networkNotice?: string;
}

/** 一条已持久化输入的受理收据投影。 */
export interface BrowserSessionInputReceipt {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly inputId: string;
    readonly kind: BrowserSessionInputKind;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly sequence: number;
    readonly status: BrowserSessionInputStatus;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly admittedAtRevision: number;
    /** @pattern \S */
    readonly targetRunId?: string;
    /** @pattern \S */
    readonly appliedRunId?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly messageIndex?: number;
}

/** 当前已提交等待的类型化交互视图摘要。 */
export interface BrowserInteractionView {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    readonly kind: BrowserInteractionKind;
    /** @pattern \S */
    readonly interactionId: string;
    /** @pattern \S */
    readonly requestId?: string;
    /** @pattern \S */
    readonly actionId?: string;
    /** @pattern \S */
    readonly recoveryRef?: string;
    /** @minItems 1 */
    readonly decisions: readonly BrowserInteractionDecision[];
    readonly truncated: boolean;
}

/** Run 提交边界与执行活动投影。 */
export interface BrowserGoalExecution {
    readonly state: BrowserExecutionState;
    readonly committedThroughSequence: number;
}

/** 会话时间线中的用户或助手文本消息。 */
export interface BrowserSessionMessage {
    /** @pattern \S */
    readonly messageId: string;
    readonly role: "user" | "assistant";
    readonly content: string;
    /** @pattern \S */
    readonly runId: string;
    readonly position: BrowserMessagePosition;
}

/** Bash 命令执行的有界观察结果详情。 */
export interface BrowserBashExecutionDetail {
    readonly command: string;
    readonly exitCode?: number;
    readonly stdout?: string;
    readonly stderr?: string;
    readonly failure?: string;
}

/** 已提交 Step 与 Activity Think 共用的字段形状。 */
export interface BrowserSessionStepThink {
    readonly goal: string;
    readonly output?: string;
    readonly truncated?: true;
}

/** 会话单步执行的安全投影。 */
export interface BrowserSessionStep {
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly executionUnitId: string;
    /** @pattern \S */
    readonly sourceEventId?: string;
    /** @pattern \S */
    readonly actionId?: string;
    readonly activityBoundaryBefore?: true;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly sequence: number;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly stepIndex: number;
    readonly decisionKind?: string;
    readonly toolId?: string;
    readonly inputSummary?: string;
    readonly actionStatus?: "awaiting_approval" | "approved" | "rejected";
    readonly status: "recorded" | "completed" | "failed" | "rejected";
    readonly summary?: string;
    readonly think?: BrowserSessionStepThink;
    readonly bashExecution?: BrowserBashExecutionDetail;
    readonly bashExecutionOmitted?: true;
    readonly recoveryAttempts?: readonly string[];
    /** @pattern \S */
    readonly stageId?: string;
}

/** 阶段生命周期状态。 */
export type BrowserRunStageStatus = "in_progress" | "review_pending" | "accepted";

/** 阶段修订历史记录。 */
export interface BrowserRunStageRevision {
    readonly revision: number;
    readonly target: string;
    readonly reason?: string;
}

/** 阶段审查拒绝反馈。 */
export interface BrowserRunStageRejection {
    readonly code: string;
    readonly issues: readonly string[];
}

/** 前序阶段结果引用。 */
export interface BrowserRunStageResultRef {
    /** @pattern \S */
    readonly stageId: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly revision: number;
}

/** Run 中按稳定身份聚合的阶段执行与审查记录看板投影。 */
export interface BrowserRunStageGroup {
    /** @pattern \S */
    readonly stageId: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly revision: number;
    readonly target: string;
    readonly acceptanceCriteria: readonly string[];
    readonly status: BrowserRunStageStatus;
    readonly resultSummary?: string;
    readonly latestReviewRejection?: BrowserRunStageRejection;
    readonly previousStageResultRef?: BrowserRunStageResultRef;
    readonly revisions?: readonly BrowserRunStageRevision[];
    readonly steps: readonly BrowserSessionStep[];
}

/** 已批准 Plan Run 中带 Runtime 身份的阶段状态。 */
export interface BrowserPlanRouteStageState {
    /** @pattern \S */
    readonly stageId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly revision: number;
    readonly status: "pending" | "executing" | "accepted";
    /** @pattern \S */
    readonly target: string;
    /** @minItems 1 */
    readonly acceptanceCriteria: readonly string[];
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly acceptedSequence?: number;
}

/** Plan Run 会话中的一条已批准路线。 */
export interface BrowserPlanRoute {
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly revision: number;
    /** @pattern \S */
    readonly revisionReason?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly nextStageIndex: number;
    /** @minItems 1 */
    readonly stages: readonly BrowserPlanRouteStageState[];
}

/** Run 会话中单个 Run 的终态原因详情。 */
export interface BrowserSessionRunTerminalDetail {
    readonly code?: string;
    readonly message: string;
}

/** 会话中单个 Run 的历史投影。 */
export interface BrowserSessionRun {
    /** @pattern \S */
    readonly runId: string;
    readonly status: BrowserRunStatus;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly stepCount: number;
    readonly steps: readonly BrowserSessionStep[];
    readonly current: boolean;
    readonly stages?: readonly BrowserRunStageGroup[];
    readonly planRoute?: BrowserPlanRoute;
    readonly terminalDetail?: BrowserSessionRunTerminalDetail;
}

/** 结构化问卷选项。 */
export interface BrowserAskUserOption {
    /** @pattern \S */
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}

/** 结构化问卷问题。 */
export interface BrowserAskUserQuestion {
    /** @pattern \S */
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly multiSelect: boolean;
    readonly options: readonly BrowserAskUserOption[];
}

/** 结构化问卷单个问题的用户回答。 */
export interface BrowserAskUserAnswer {
    /** @pattern \S */
    readonly questionId: string;
    readonly optionIds: readonly string[];
    readonly otherText?: string;
}

/**
 * Plan Run 任务提案中的一个有序阶段。
 *
 * @example
 * ```ts
 * const stage: BrowserPlanRouteStage = {
 *     target: "调查入口", acceptanceCriteria: ["定位现有实现"],
 * };
 * ```
 */
export interface BrowserPlanRouteStage {
    /** 阶段目标。 */
    readonly target: string;
    /** 阶段验收条件。 */
    readonly acceptanceCriteria: readonly string[];
}

/** 目标拆解计划中的条目。 */
export interface BrowserGoalPlanItem {
    /** @pattern \S */
    readonly id: string;
    readonly content: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly position: number;
    readonly status: "pending" | "in_progress" | "completed" | "cancelled";
}

/** Goal 的多步任务执行计划视图。 */
export interface BrowserGoalPlan {
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly revision: number;
    readonly items: readonly BrowserGoalPlanItem[];
}

/** 父程序调用标识。 */
export interface BrowserParentProgram {
    /** @pattern \S */
    readonly actionId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly callNumber: number;
}

/** 待用户审批的工具或沙箱 Action 视图。 */
export interface BrowserPendingAction {
    /** @pattern \S */
    readonly actionId: string;
    /** @pattern \S */
    readonly toolId: string;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
    readonly inputSummary?: string;
    readonly inputPreview: string;
    readonly inputPreviewTruncated: boolean;
    readonly targetPath?: string;
    readonly approvalKind?: "tool" | "sandbox";
    readonly sandboxReview?: BrowserSandboxReview;
    readonly parentProgram?: BrowserParentProgram;
}

/** 工作区 Goal 列表项的安全传输对象。 */
export interface BrowserGoalListItem {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    readonly intent: string;
    readonly workflowPhase: string;
    readonly runStatus: BrowserRunStatus;
    readonly execution?: BrowserGoalExecution;
    readonly updatedAt: string;
    readonly archived: boolean;
}

/** 工作区 Goal 列表响应信封。 */
export interface BrowserGoalList {
    readonly goals: readonly BrowserGoalListItem[];
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly unreadableCount: number;
}

/** 已受理且尚未进入模型输入的 Steer 消息。 */
export interface BrowserPendingSteer {
    /** @pattern \S */
    readonly messageId: string;
    readonly content: string;
}

/** 已受理、尚未应用的普通消息。 */
export interface BrowserPendingMessage {
    /** @pattern \S */
    readonly inputId: string;
    readonly content: string;
}

/** 消息队列修订与暂停事实。 */
export interface BrowserQueueState {
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly revision: number;
    readonly paused: boolean;
    readonly pauseReason?: "run_failed" | "user_interrupt";
}

/** 已受理的用户终止及取消结算状态。 */
export interface BrowserInterruption {
    /** @pattern \S */
    readonly requestId: string;
    readonly status: "requested" | "finished";
    readonly outcomeUnknown?: boolean;
}

/** 完整 Goal 会话详情的传输对象。 */
export interface BrowserGoalSession {
    /** @pattern \S */
    readonly goalId: string;
    readonly intent: string;
    /** @pattern \S */
    readonly currentRunId: string;
    readonly runStatus: BrowserRunStatus;
    readonly currentRunMode: "normal" | "plan";
    readonly nextRunMode?: "plan";
    readonly execution?: BrowserGoalExecution;
    readonly messages: readonly BrowserSessionMessage[];
    readonly pendingSteers?: readonly BrowserPendingSteer[];
    readonly pendingMessages?: readonly BrowserPendingMessage[];
    readonly queue?: BrowserQueueState;
    readonly interruption?: BrowserInterruption;
    readonly runs: readonly BrowserSessionRun[];
    readonly goalPlan?: BrowserGoalPlan;
    readonly interaction?: BrowserInteractionView;
    readonly pendingAction?: BrowserPendingAction;
    readonly historyTruncated: boolean;
}

/** 窄 Goal 状态中指向 Activity 窗口的历史标记。 */
export interface BrowserActivityHistoryMarker {
    readonly included: false;
    readonly source: "activity";
}

/**
 * Goal 普通消息续接的可用性投影。
 *
 * @remarks
 * 只有宿主确认手动创建、当前 Run 已结算终态且没有待恢复 Worker 记录的 Goal 才可续接。
 * 不可用时 `reason` 说明拒绝依据；浏览器不得自行推断来源或当前 Run 是否结算。
 *
 * @example
 * ```ts
 * if (goal.continuation?.available === true) showComposer();
 * ```
 */
export interface BrowserGoalContinuation {
    readonly available: boolean;
    readonly reason?: "not_web_created" | "run_not_terminal" | "run_settling";
}

/** 初始读取和分页使用的窄 Goal 状态。 */
export interface BrowserGoalSessionState {
    /** @pattern \S */
    readonly goalId: string;
    readonly intent: string;
    /** @pattern \S */
    readonly currentRunId: string;
    readonly runStatus: BrowserRunStatus;
    readonly currentRunMode: "normal" | "plan";
    readonly nextRunMode?: "plan";
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly currentRunStepCount: number;
    readonly currentRunTerminalDetail?: BrowserSessionRunTerminalDetail;
    readonly currentPlanRoute?: BrowserPlanRoute;
    readonly execution?: BrowserGoalExecution;
    readonly continuation?: BrowserGoalContinuation;
    readonly pendingSteers?: readonly BrowserPendingSteer[];
    readonly pendingMessages?: readonly BrowserPendingMessage[];
    readonly queue?: BrowserQueueState;
    readonly interruption?: BrowserInterruption;
    readonly goalPlan?: BrowserGoalPlan;
    readonly interaction?: BrowserInteractionView;
    readonly pendingAction?: BrowserPendingAction;
    readonly history: {
        readonly messages: BrowserActivityHistoryMarker;
        readonly steps: BrowserActivityHistoryMarker;
        readonly stages: BrowserActivityHistoryMarker;
    };
}

/** 会话消息的公开条目。 */
export interface BrowserSessionMessageEntry {
    /** @pattern \S */
    readonly messageId: string;
    readonly role: "user" | "assistant";
    /** @pattern \S */
    readonly runId: string;
    readonly position: BrowserMessagePosition;
    readonly purpose?: "process" | "answer" | "notice";
    readonly sourceKind: string;
    readonly sourceId: string;
    readonly content: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly contentLength: number;
    readonly truncated: boolean;
}

/** 有界消息列表的 wire 结果。 */
export type BrowserSessionMessageListResult =
    | {
        readonly ok: true;
        readonly messages: readonly BrowserSessionMessageEntry[];
        /** @pattern \S */
        readonly nextAfterMessageId?: string;
        /** @pattern \S */
        readonly throughMessageId?: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly total: number;
    }
    | {
        readonly ok: false;
        readonly error: "message_range_invalid" | "goal_not_found";
    };

/** 单条消息正文的 wire 结果。 */
export type BrowserSessionMessageResult =
    | {
        readonly ok: true;
        readonly message: BrowserSessionMessageEntry;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly nextOffset?: number;
    }
    | {
        readonly ok: false;
        readonly error: "message_not_found" | "goal_not_found";
    };

/** Activity 历史中允许投影的已提交事件类型。 */
export type BrowserActivityEventType =
    | "run_created"
    | "run_started"
    | "run_waiting"
    | "run_completed"
    | "run_failed"
    | "run_cancelled"
    | "run_stage_declared"
    | "run_stage_accepted"
    | "run_stage_rejected"
    | "decision_received"
    | "model_repair_feedback_recorded"
    | "model_request_retry_recorded"
    | "context_lookup_requested"
    | "context_lookup_completed"
    | "context_lookup_not_found"
    | "context_lookup_failed"
    | "action_staged"
    | "action_approved"
    | "action_revised"
    | "action_rejected"
    | "tool_started"
    | "tool_attempt_started"
    | "tool_attempt_failed"
    | "tool_finished"
    | "observation_recorded"
    | "ask_user_answered"
    | "ask_user_replied"
    | "ask_user_skipped"
    | "task_approved"
    | "task_feedback_received"
    | "session_input_applied"
    | "steer_input_applied";

/** Activity 历史中允许投影的已提交事件类型列表。 */
export const BROWSER_ACTIVITY_EVENT_TYPES: readonly BrowserActivityEventType[] = [
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
];

/** Activity 项在固定历史窗口内的稳定排序键。 */
export interface BrowserActivityPosition {
    /** @pattern \S */
    readonly runId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly runOrder: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly sequence: number;
    readonly itemKind: "fact" | "message";
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly order: number;
}

/** Activity 事实项携带的已提交工具生命周期记录。 */
export interface BrowserActivityToolLifecycleEntry {
    readonly kind: "approval" | "execution" | "retry" | "result";
    /** @pattern \S */
    readonly title: string;
    readonly detail?: string;
}

/** Activity 事实项携带的已提交工具状态白名单投影。 */
export interface BrowserActivityToolState {
    /** @pattern \S */
    readonly toolId: string;
    readonly status: "recorded" | "pending-result" | "completed" | "failed" | "rejected";
    readonly actionStatus?: "awaiting_approval" | "approved" | "rejected";
    readonly inputSummary?: string;
    readonly summary?: string;
    readonly attempts?: readonly string[];
    readonly lifecycle?: readonly BrowserActivityToolLifecycleEntry[];
    /** @pattern \S */
    readonly revisionRef?: string;
    /** @pattern \S */
    readonly recoveryRef?: string;
    /** @pattern \S */
    readonly parentActionId?: string;
    readonly activityBoundaryBefore?: true;
}

/** Activity 窗口中的正式消息摘要。 */
export interface BrowserActivityMessageItem {
    readonly type: "message";
    /** @pattern \S */
    readonly itemId: string;
    /** @pattern \S */
    readonly messageId: string;
    readonly role: "user" | "assistant";
    readonly purpose?: "process" | "answer" | "notice";
    /** @pattern \S */
    readonly previewId?: string;
    /** @pattern \S */
    readonly runId: string;
    readonly position: BrowserActivityPosition;
    readonly content: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly contentLength: number;
    readonly truncated: boolean;
}

/** Activity 窗口中的安全轨迹事实摘要。 */
export interface BrowserActivityFactItem {
    readonly type: "fact";
    /** @pattern \S */
    readonly itemId: string;
    /** @pattern \S */
    readonly eventId: string;
    /** @pattern \S */
    readonly runId: string;
    readonly position: BrowserActivityPosition;
    readonly eventType: BrowserActivityEventType;
    readonly title: string;
    readonly detail?: string;
    /** @pattern \S */
    readonly lookupId?: string;
    readonly lookupRequest?: string;
    readonly lookupErrorCode?:
        | "INVALID_CONTEXT_LOOKUP"
        | "CONTEXT_LOOKUP_CHAIN_LIMIT"
        | "CONTEXT_LOOKUP_UNAVAILABLE"
        | "CONTEXT_LOOKUP_FAILED"
        | "INVALID_CONTEXT_LOOKUP_RESULT";
    /** @pattern \S */
    readonly executionUnitId?: string;
    /** @pattern \S */
    readonly actionId?: string;
    /** @pattern \S */
    readonly stageId?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly stageRevision?: number;
    /** @pattern \S */
    readonly stageTarget?: string;
    readonly tool?: BrowserActivityToolState;
}

/** Activity 窗口中的显式 Think 摘要。 */
export interface BrowserActivityThinkItem {
    readonly type: "think";
    /** @pattern \S */
    readonly itemId: string;
    /** @pattern \S */
    readonly runId: string;
    readonly position: BrowserActivityPosition;
    /** @pattern \S */
    readonly executionUnitId?: string;
    readonly think: BrowserSessionStepThink;
}

/** 正式消息、安全轨迹事实与显式 Think 组成的原子 Activity 项。 */
export type BrowserActivityItem =
    | BrowserActivityMessageItem
    | BrowserActivityFactItem
    | BrowserActivityThinkItem;

/** Activity 的 Run 终态摘要。 */
export interface BrowserActivityRunTerminalDetail {
    readonly code?: string;
    readonly message: string;
}

/** 一次读取涉及的 Run 上下文。 */
export interface BrowserActivityRunContext {
    /** @pattern \S */
    readonly runId: string;
    readonly status: BrowserRunStatus;
    readonly current: boolean;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly runOrder: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
    readonly terminalDetail?: BrowserActivityRunTerminalDetail;
}

/** 固定 Activity 窗口中单个 Run 的消息和轨迹上界。 */
export interface BrowserActivityRunWindow {
    /** @pattern \S */
    readonly runId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly messageCount: number;
    /** @pattern \S */
    readonly throughMessageId?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
}

/** Activity 页中跨页阶段的安全上下文。 */
export interface BrowserActivityStageContext {
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly stageId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly revision: number;
    readonly status: "executing" | "accepted" | "rejected";
    readonly target?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly firstSequence: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly lastSequence?: number;
    readonly completeWithinPage: boolean;
}

/** Activity 页中跨页 Action 活动组的完整性提示。 */
export interface BrowserActivityActionContext {
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly actionId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly firstSequence: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly lastSequence: number;
    readonly completeWithinPage: boolean;
}

/** 当前页之外、仍可按 Activity cursor 读取的连续项区间。 */
export interface BrowserActivityGap {
    readonly direction: "older" | "newer";
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly itemCount: number;
    readonly first: BrowserActivityPosition;
    readonly last: BrowserActivityPosition;
}

/** Activity 页的可用范围标记。 */
export interface BrowserActivityRange {
    readonly first?: BrowserActivityPosition;
    readonly last?: BrowserActivityPosition;
    readonly olderAvailable: boolean;
    readonly newerAvailable: boolean;
}

/** 固定水位的一页 Activity 查询结果。 */
export interface BrowserActivityPage {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runFilter?: string;
    /** @asType integer
     * @minimum 1
     * @maximum 100 */
    readonly limit: number;
    readonly items: readonly BrowserActivityItem[];
    readonly runs: readonly BrowserActivityRunContext[];
    readonly window: readonly BrowserActivityRunWindow[];
    /** @maxItems 2 */
    readonly gaps: readonly BrowserActivityGap[];
    readonly range: BrowserActivityRange;
    readonly stages: readonly BrowserActivityStageContext[];
    readonly actionGroups: readonly BrowserActivityActionContext[];
    /** @pattern ^[A-Za-z0-9_-]+$ */
    readonly beforeCursor?: string;
    /** @pattern ^[A-Za-z0-9_-]+$ */
    readonly afterCursor?: string;
}

/** Activity 读取路由的已验证参数。 */
export interface BrowserActivityQuery {
    /** @pattern \S */
    readonly runId?: string;
    /** @pattern ^[A-Za-z0-9_-]+$ */
    readonly before?: string;
    /** @pattern ^[A-Za-z0-9_-]+$ */
    readonly after?: string;
    /** @asType integer
     * @minimum 1
     * @maximum 100 */
    readonly limit?: number;
}

/** Activity 查询的稳定读取结果。 */
export type BrowserActivityReadResult =
    | { readonly ok: true; readonly page: BrowserActivityPage }
    | {
        readonly ok: false;
        readonly error: "goal_not_found" | "run_not_found" | "activity_cursor_invalid";
    };

/** 输入受理与查询的稳定 wire 拒绝代码。 */
export type BrowserSessionInputErrorCode =
    | "INVALID_INPUT"
    | "INPUT_CONFLICT"
    | "INPUT_NOT_FOUND"
    | "GOAL_NOT_FOUND"
    | "BUSY"
    | "STEER_CONFLICT"
    | "INTERRUPT_CONFLICT"
    | "STALE_REVISION"
    | "INTERACTION_MISMATCH"
    | "INTERACTION_REQUIRED"
    | "QUEUE_PAUSED"
    | "RUN_NOT_RESUMABLE"
    | "QUEUE_FULL"
    | "QUEUE_TEXT_TOO_LARGE"
    | "TEXT_TOO_LARGE"
    | "QUEUE_NOT_PAUSED"
    | "QUEUE_REVISION_MISMATCH"
    | "QUEUED_MESSAGE_NOT_FOUND"
    | "RUN_NOT_FOUND"
    | "RUN_NOT_RUNNING"
    | "CONTINUATION_UNAVAILABLE"
    | "RUN_CONTROL_UNAVAILABLE"
    | "CONTEXT_COMPACTION_UNAVAILABLE"
    | "input_admission_failed"
    | "session_unavailable";

/** 统一会话输入的严格 wire 交互回答。 */
export type BrowserSessionInteractionResponse =
    | {
        readonly kind: "answer_ask_user";
        /**
         * @minItems 1
         * @maxItems 3
         */
        readonly answers: readonly {
            /** @pattern \S */
            readonly questionId: string;
            /** @maxItems 3 */
            readonly optionIds: readonly string[];
            /** @pattern \S */
            readonly otherText?: string;
        }[];
    }
    | {
        readonly kind: "reply_to_question";
        /** @pattern \S */
        readonly content: string;
    }
    | { readonly kind: "skip_question" }
    | { readonly kind: "approve_task" }
    | {
        readonly kind: "feedback_task";
        /** @pattern \S */
        readonly feedback: string;
    }
    | {
        readonly kind: "approve_action";
        /** @pattern \S */
        readonly actionId: string;
        readonly scope?: BrowserGrantScope;
    }
    | {
        readonly kind: "approve_action_revision";
        /** @pattern \S */
        readonly actionId: string;
        readonly input: unknown;
        /** @pattern \S */
        readonly reviewRef: string;
        readonly scope?: BrowserGrantScope;
    }
    | {
        readonly kind: "retry_unknown_action";
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly recoveryRef: string;
    }
    | {
        readonly kind: "decline_unknown_action_retry";
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly recoveryRef: string;
        /** @pattern \S */
        readonly reason: string;
    }
    | {
        readonly kind: "reject_action";
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly reason: string;
    };

/** 排队消息转为 Steer 时的队列绑定。 */
export interface BrowserQueueBinding {
    /** @pattern \S */
    readonly messageId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly queueRevision: number;
}

/** `POST /api/goals/:goalId/inputs` 的严格 wire 命令。 */
export type BrowserSessionInputCommand =
    | {
        readonly kind: "message";
        /** @pattern \S */
        readonly inputId: string;
        /** @pattern \S */
        readonly content: string;
        /** @pattern \S */
        readonly runId: string;
    }
    | {
        readonly kind: "steer";
        /** @pattern \S */
        readonly inputId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly content: string;
        readonly queueBinding?: BrowserQueueBinding;
    }
    | {
        readonly kind: "interrupt";
        /** @pattern \S */
        readonly inputId: string;
        /** @pattern \S */
        readonly runId: string;
    }
    | {
        readonly kind: "respond";
        /** @pattern \S */
        readonly inputId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly requestId: string;
        readonly response: BrowserSessionInteractionResponse;
    }
    | {
        readonly kind: "resume";
        /** @pattern \S */
        readonly inputId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly commitRevision: number;
        /** @pattern \S */
        readonly content?: string;
        /** 已确认 Worker 退出后恢复运行中检查点时，承认原动作的外部副作用可能未知。 */
        readonly acknowledgeUnknownEffects?: boolean;
    }
    | {
        readonly kind: "queue_control";
        /** @pattern \S */
        readonly inputId: string;
        readonly action: "continue" | "clear" | "remove";
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly queueRevision: number;
        /** @pattern \S */
        readonly messageId?: string;
    }
    | {
        readonly kind: "compact";
        /** @pattern \S */
        readonly inputId: string;
        /** @pattern \S */
        readonly runId: string;
    };

/** 一条输入受理／拒绝的公开结果。 */
export interface BrowserSessionInputOutcome {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly inputId: string;
    readonly kind: BrowserSessionInputKind;
    readonly ok: boolean;
    readonly existing?: boolean;
    readonly receipt?: BrowserSessionInputReceipt;
    readonly code?: BrowserSessionInputErrorCode;
}

/** 一次 inputs 受理的 wire 结果。 */
export type BrowserSessionInputResult =
    | {
        readonly ok: true;
        readonly existing: boolean;
        readonly receipt: BrowserSessionInputReceipt;
    }
    | {
        readonly ok: false;
        readonly error: BrowserSessionInputErrorCode;
    };

/** 按身份查询持久化收据的结果。 */
export type BrowserSessionInputQueryResult =
    | { readonly ok: true; readonly found: false }
    | {
        readonly ok: true;
        readonly found: true;
        readonly receipt: BrowserSessionInputReceipt;
    }
    | {
        readonly ok: false;
        readonly error: "GOAL_NOT_FOUND" | "input_read_failed";
    };

/** 当前等待交互的规范引用。 */
export interface BrowserSessionStateInteraction {
    /** @pattern \S */
    readonly interactionId: string;
    readonly kind: BrowserInteractionKind;
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly requestId?: string;
    /** @pattern \S */
    readonly actionId?: string;
}

/** 会话状态中有界消息范围的一条摘要。 */
export interface BrowserSessionStateMessage {
    /** @pattern \S */
    readonly messageId: string;
    readonly role: "user" | "assistant";
    /** @pattern \S */
    readonly runId: string;
    readonly position: BrowserMessagePosition;
    readonly purpose?: "process" | "answer" | "notice";
    /** @pattern \S */
    readonly sourceKind: string;
    /** @pattern \S */
    readonly sourceId: string;
}

/** 当前 Run 的用户中断状态。 */
export interface BrowserSessionStateInterruption {
    /** @pattern \S */
    readonly requestId: string;
    readonly status: "requested" | "finished";
    readonly outcomeUnknown: boolean;
}

/** 安全会话状态投影。 */
export interface BrowserSessionState {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    readonly runStatus: BrowserRunStatus;
    readonly mode: "normal" | "plan";
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly commitRevision: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly queueRevision: number;
    readonly queuePaused: boolean;
    readonly queuePauseReason?: "run_failed" | "user_interrupt";
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly pendingMessageCount: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly pendingSteerCount: number;
    readonly waitingFor?: "ask_user" | "task_approval" | "action_approval" | "action_recovery" | "blocked";
    readonly interaction?: BrowserSessionStateInteraction;
    readonly messages: {
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly count: number;
        /** @pattern \S */
        readonly throughMessageId?: string;
        readonly recent: readonly BrowserSessionStateMessage[];
    };
    readonly needsRecovery: boolean;
    readonly interruption?: BrowserSessionStateInterruption;
    readonly executionOwner: boolean;
}

/** 创建 Session 的 wire 命令。 */
export interface BrowserCreateSessionCommand {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly inputId: string;
    /** @pattern \S */
    readonly intent: string;
    readonly mode?: "plan";
    /** @pattern \S */
    readonly modelId?: string;
}

/**
 * 创建 Session 的 wire 结果。
 *
 * @remarks
 * `execution_unavailable` 表示本机执行通道不可用且可重试，`create_failed` 只用于未分类
 * 的内部创建失败；两者不互换，其余错误码保持既有含义。
 */
export type BrowserCreateSessionResult =
    | {
        readonly ok: true;
        readonly existing: boolean;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly receipt: BrowserSessionInputReceipt;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_id_conflict"
            | "input_conflict"
            | "goal_busy"
            | "model_not_selectable"
            | "model_catalog_unavailable"
            | "profile_not_found"
            | "invalid_goal_input"
            | "goal_unreadable"
            | "service_shutting_down"
            | "execution_unavailable"
            | "create_failed";
    };

/** 完整会话响应信封。 */
export interface BrowserGoalSessionEnvelope {
    readonly goal: BrowserGoalSession;
    readonly session?: BrowserSessionState;
}

/** 窄状态响应信封。 */
export interface BrowserGoalSessionStateEnvelope {
    readonly goal: BrowserGoalSessionState;
    readonly session?: BrowserSessionState;
}

/** Action 审阅可申请的授权期限。 */
export type BrowserActionReviewScope = "action" | "goal" | "workspace";

/** 只读审批预检的 wire 请求。 */
export interface BrowserActionReviewCommand {
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly actionId: string;
    readonly input?: unknown;
    readonly scope?: BrowserActionReviewScope;
}

/** 重新计算出的实际能力范围。 */
export interface BrowserActionCapability {
    readonly network: "none" | "all_outbound";
    readonly extraFiles: readonly BrowserPermissionExtraFile[];
    readonly targetPaths: readonly string[];
}

/** 只读审批预检返回的可审阅内容。 */
export interface BrowserActionReview {
    /** @pattern \S */
    readonly actionId: string;
    /** @pattern \S */
    readonly toolId: string;
    readonly originalInput: unknown;
    readonly finalInput: unknown;
    readonly changed: boolean;
    readonly scope: BrowserActionReviewScope;
    readonly availableScopes: readonly BrowserActionReviewScope[];
    readonly capability: BrowserActionCapability;
    readonly requiresSandboxApproval: boolean;
    /** @pattern \S */
    readonly reviewRef: string;
}

/** 可定位的字段级问题。 */
export interface BrowserActionReviewIssue {
    readonly path: readonly (string | number)[];
    readonly message: string;
}

/** 只读审批预检的 wire 结果。 */
export type BrowserActionReviewResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly review: BrowserActionReview;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "action_not_waiting"
            | "action_id_mismatch"
            | "tool_not_found"
            | "invalid_tool_input"
            | "scope_unavailable"
            | "sandbox_scope_unavailable"
            | "review_unavailable";
        readonly issues?: readonly BrowserActionReviewIssue[];
    };

/** 问答详情中的路线修订提议。 */
export interface BrowserInteractionRouteRevision {
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly baseRevision: number;
    /** @pattern \S */
    readonly reason: string;
    /** @pattern \S */
    readonly approvalRequest: string;
    /** @pattern \S */
    readonly approvalOptionId: string;
    readonly stages: readonly BrowserPlanRouteStage[];
}

/** 当前交互的完整审阅内容。 */
export type BrowserInteractionDetail =
    | {
        readonly kind: "question";
        readonly mode: "plan" | "execution";
        readonly questions: readonly BrowserAskUserQuestion[];
        readonly routeRevision?: BrowserInteractionRouteRevision;
    }
    | {
        readonly kind: "task_approval";
        readonly objective: string;
        readonly approvalRequest: string;
        readonly completionCriteria: readonly string[];
        readonly stages: readonly BrowserPlanRouteStage[];
    }
    | {
        readonly kind: "action_approval";
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly toolId: string;
        readonly approvalKind?: "tool" | "sandbox";
        readonly input: unknown;
        /** @pattern \S */
        readonly recoveryRef?: string;
        readonly parentProgram?: BrowserParentProgram;
    }
    | {
        readonly kind: "action_recovery";
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly toolId: string;
        readonly approvalKind?: "tool" | "sandbox";
        readonly input: unknown;
        /** @pattern \S */
        readonly recoveryRef?: string;
        readonly parentProgram?: BrowserParentProgram;
    };

/** 当前交互完整详情读取的结果。 */
export type BrowserInteractionDetailResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly interactionId: string;
        readonly detail: BrowserInteractionDetail;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "interaction_not_waiting"
            | "interaction_mismatch"
            | "interaction_details_unavailable";
    };

/** 结构化输出模式。 */
export type BrowserStructuredOutputMode = "strict" | "prompt_only" | "two_stage";

/** 受管 Provider 档案的非敏感投影。 */
export interface BrowserProviderProfile {
    /** @pattern \S */
    readonly id: string;
    /** @pattern \S */
    readonly label: string;
    /** @pattern \S */
    readonly kind: string;
    /** @pattern \S */
    readonly defaultModel: string;
    readonly baseURL?: string;
    readonly contextWindowTokens?: number;
    readonly maxOutputTokens?: number;
    readonly structuredOutputMode?: BrowserStructuredOutputMode;
    readonly hasApiKey: boolean;
    readonly apiKeyMask: string;
}

/** 只读的 `config.toml` 回退来源投影。 */
export interface BrowserProviderFallback {
    readonly source: "config";
    readonly provider: string;
    readonly model: string;
}

/** 设置页读取结果。 */
export interface BrowserProviderSettings {
    /** @pattern \S */
    readonly activeProfileId?: string;
    readonly profiles: readonly BrowserProviderProfile[];
    readonly fallback?: BrowserProviderFallback;
}

/** 设置操作的稳定失败分类。 */
export type BrowserProviderSettingsError =
    | "provider_profile_not_found"
    | "provider_profile_conflict"
    | "provider_profile_active"
    | "provider_profile_invalid"
    | "provider_profile_unavailable";

/** 设置页读取结果。 */
export type BrowserProviderSettingsReadResult =
    | { readonly ok: true; readonly settings: BrowserProviderSettings }
    | { readonly ok: false; readonly error: BrowserProviderSettingsError };

/** 创建或部分更新档案的输入。 */
export interface BrowserProviderProfileInput {
    /** @pattern \S */
    readonly label: string;
    /** @pattern \S */
    readonly kind: string;
    /** @pattern \S */
    readonly defaultModel: string;
    /** @pattern \S */
    readonly apiKey?: string;
    /** @pattern \S */
    readonly baseURL?: string | null;
    /**
     * @maximum 9007199254740991
     * @minimum 1
     */
    readonly contextWindowTokens?: number | null;
    /**
     * @maximum 9007199254740991
     * @minimum 1
     */
    readonly maxOutputTokens?: number | null;
    readonly structuredOutputMode?: BrowserStructuredOutputMode | null;
}

/** 创建或更新结果。 */
export type BrowserProviderProfileWriteResult =
    | { readonly ok: true; readonly profile: BrowserProviderProfile }
    | {
        readonly ok: false;
        readonly error: BrowserProviderSettingsError;
        readonly fields?: readonly string[];
    };

/** 删除结果。 */
export type BrowserProviderProfileDeleteResult =
    | {
        readonly ok: true;
        readonly profile: BrowserProviderProfile;
        readonly mayBeReferencedByGoals: boolean;
    }
    | { readonly ok: false; readonly error: BrowserProviderSettingsError };

/** 激活结果。 */
export type BrowserProviderProfileActivationResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly activeProfileId: string;
    }
    | { readonly ok: false; readonly error: BrowserProviderSettingsError };

/** 连接测试的稳定失败分类。 */
export type BrowserProviderProfileTestError =
    | "provider_profile_not_found"
    | "model_catalog_authentication"
    | "model_catalog_permission"
    | "model_catalog_protocol"
    | "model_catalog_unavailable";

/** 连接测试结果。 */
export type BrowserProviderProfileTestResult =
    | {
        readonly ok: true;
        /** @asType integer
         * @minimum 1
         * @maximum 9007199254740991 */
        readonly modelCount: number;
    }
    | { readonly ok: false; readonly error: BrowserProviderProfileTestError };

/** 未保存表单的在线模型查询。 */
export interface BrowserProviderModelQuery {
    /** @pattern \S */
    readonly kind: string;
    /** @pattern \S */
    readonly apiKey?: string;
    /** @pattern \S */
    readonly baseURL?: string;
    /** @pattern \S */
    readonly profileId?: string;
}

/** Provider 在线目录返回的单个模型标识与展示名称。 */
export interface BrowserProviderModel {
    /** @pattern \S */
    readonly id: string;
    readonly name: string;
}

/** Provider 在线目录的成功响应。 */
export interface BrowserProviderModels {
    readonly ok: true;
    readonly models: readonly BrowserProviderModel[];
}

/** 受理的异步命令公共基础载荷。 */
export interface AcceptedCommand {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    readonly existing: boolean;
}

/** 切换计划模式命令。 */
export interface BrowserGoalPlanModeCommand {
    /** @pattern \S */
    readonly runId: string;
}

/** 切换计划模式结果。 */
export type BrowserGoalPlanModeResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly existing: boolean;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "goal_busy"
            | "plan_mode_busy"
            | "plan_mode_failed"
            | "service_shutting_down";
    };

/** 选定执行模型命令。 */
export interface BrowserModelSelectionCommand {
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly modelId: string;
    /** @pattern \S */
    readonly providerProfileId?: string;
    /** 是否同时保存为当前工作区默认模型；省略时只切换 Goal 模型。 */
    readonly persistAsDefault?: boolean;
}

/** 已提交的模型选择子结果。 */
export interface BrowserModelSelectionCommit {
    /** @pattern \S */
    readonly modelId: string;
    /** @pattern \S */
    readonly providerProfileId?: string;
}

/** 可选的默认偏好子结果；未请求时省略。 */
export type BrowserModelPreferenceOutcome =
    | { readonly ok: true }
    | { readonly ok: false; readonly error: "model_preference_save_failed" };

/** 模型选择结果。 */
export type BrowserModelSelectionResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly selection: BrowserModelSelectionCommit;
        /** 只在请求保存默认偏好时报告；模型切换已成功时仍可单独失败。 */
        readonly defaultPreference?: BrowserModelPreferenceOutcome;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "goal_busy"
            | "model_switch_not_allowed"
            | "model_not_selectable"
            | "model_catalog_unavailable"
            | "model_selection_failed"
            | "service_shutting_down";
    };

/** 设置工作区默认模型偏好命令。 */
export interface BrowserModelPreferenceCommand {
    /** @pattern \S */
    readonly modelId: string;
    /** @pattern \S */
    readonly providerProfileId?: string;
}

/** 设置工作区默认模型偏好结果。 */
export type BrowserModelPreferenceResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly modelId: string;
    }
    | { readonly ok: false; readonly error: string };

/**
 * 工作区权限档位的 wire 形状。
 *
 * @remarks
 * `sandbox` 决定内核强制的文件与网络边界；`approvals` 与 `reviewer` 只决定越界 Action
 * 的裁决方式；`writableRoots` 列出自工作区树之外额外允许读写的工作区外根目录。
 *
 * @example
 * ```ts
 * const profile: BrowserPermissionProfile = {
 *     sandbox: "workspace-write",
 *     approvals: "on-request",
 *     reviewer: "user",
 *     writableRoots: [],
 * };
 * ```
 */
export interface BrowserPermissionProfile {
    readonly sandbox: "read-only" | "workspace-write" | "danger-full-access";
    readonly approvals: "on-request" | "never";
    readonly reviewer: "user" | "auto_review";
    /** 工作区树之外额外允许读写的工作区外根目录，元素为绝对路径。 */
    readonly writableRoots: readonly string[];
}

/**
 * 变更当前工作区权限档位的命令。
 *
 * @remarks
 * 工作区身份由服务端会话绑定决定，请求体不携带 `workspaceId`；`expectedRevision`
 * 必须是客户端读取到的当前版本，并发提交由服务端返回当前档位而不是静默覆盖。
 *
 * @example
 * ```ts
 * const command: BrowserPermissionProfileCommand = { profile, expectedRevision: 3 };
 * ```
 */
export interface BrowserPermissionProfileCommand {
    readonly profile: BrowserPermissionProfile;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly expectedRevision: number;
}

/**
 * 权限档位查询或设置结果。
 *
 * @remarks
 * 成功时返回当前完整档位与版本；版本冲突时 `error` 为 `conflict`，并附带冲突时刻的
 * `profile` 与 `revision`，调用方可直接展示而不必再次读取。
 */
export type BrowserPermissionProfileResult =
    | {
        readonly ok: true;
        readonly profile: BrowserPermissionProfile;
        /** @asType integer
         * @maximum 9007199254740991 */
        readonly revision: number;
    }
    | {
        readonly ok: false;
        readonly error: "permissions_unavailable" | "conflict" | "service_shutting_down";
        /** 冲突时当前已持久化的档位。 */
        readonly profile?: BrowserPermissionProfile;
        /** 冲突时当前已持久化的版本。
         * @asType integer
         * @maximum 9007199254740991 */
        readonly revision?: number;
    };

/**
 * 一条边界越界豁免。
 *
 * @remarks
 * 只描述越过权限边界后仍持续放行的文件与网络范围；Tool 级授权已退役，因此不包含
 * 工具身份、输入摘要或目标路径。撤销后同一越界重新进入裁决。
 *
 * @example
 * ```ts
 * const exemption: BrowserPermissionExemptionSummary = {
 *     id: "grant-1",
 *     scope: "goal",
 *     network: "none",
 *     extraFiles: [],
 *     status: "active",
 * };
 * ```
 */
export interface BrowserPermissionExemptionSummary {
    /** @pattern \S */
    readonly id: string;
    readonly scope: "goal" | "workspace";
    readonly network: "none" | "all_outbound";
    readonly extraFiles: readonly BrowserPermissionExtraFile[];
    readonly status: "pending" | "active" | "revoked";
}

/**
 * 边界豁免查询或撤销结果。
 *
 * @remarks
 * 成功时返回当前 Goal/Run 下仍可见的豁免列表；撤销后同样返回更新后的列表。
 */
export type BrowserPermissionExemptionResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly exemptions: readonly BrowserPermissionExemptionSummary[];
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "permissions_unavailable"
            | "exemption_failed"
            | "service_shutting_down";
    };

/**
 * 撤销边界豁免请求体；`exemptionId` 只来自路径。
 *
 * @example
 * ```ts
 * const body: BrowserPermissionExemptionRevokeBody = { runId: "run-1" };
 * ```
 */
export interface BrowserPermissionExemptionRevokeBody {
    /** @pattern \S */
    readonly runId: string;
}

/**
 * 撤销边界豁免命令。
 *
 * @example
 * ```ts
 * const command: BrowserPermissionExemptionRevokeCommand = { runId: "run-1", exemptionId: "grant-1" };
 * ```
 */
export interface BrowserPermissionExemptionRevokeCommand {
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly exemptionId: string;
}

/** Action 完整输入查询结果。 */
export type BrowserActionDetailsResult =
    | {
        readonly ok: true;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly toolId: string;
        readonly input: unknown;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "action_not_waiting"
            | "action_details_unavailable";
    };

/** 当前工作区上下文视图。 */
export interface BrowserWorkspaceContext {
    /** @pattern \S */
    readonly workspaceRoot: string;
    /** @pattern \S */
    readonly worktreeRoot: string | null;
    /** @pattern \S */
    readonly branch: string | null;
}

/** 归档或恢复 Goal 的 wire 命令。 */
export interface BrowserGoalArchiveCommand {
    readonly archived: boolean;
}

/** 归档 Goal 结果。 */
export type BrowserGoalArchiveResult =
    | { readonly ok: true; readonly archived: boolean }
    | { readonly ok: false; readonly error: string };

/** 删除 Goal 结果。 */
export type BrowserGoalDeleteResult =
    | { readonly ok: true; readonly deleted: true }
    | { readonly ok: false; readonly error: string };

/** 实时执行活动事件的稳定联合。 */
export type BrowserGoalActivityEvent =
    | {
        readonly kind: "assistant_text_delta";
        readonly text: string;
        readonly truncated: boolean;
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
    }
    | {
        readonly kind: "model_started";
        readonly stage?: "think" | "decide" | "completion_review";
        /** @pattern \S */
        readonly modelCallId?: string;
        /** @pattern \S */
        readonly executionUnitId?: string;
        readonly occurredAt?: string;
    }
    | { readonly kind: "model_completed" }
    | { readonly kind: "step_started" }
    | {
        readonly kind: "tool_started";
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly executionUnitId: string;
        /** @pattern \S */
        readonly toolId: string;
        readonly inputSummary?: string;
    }
    | {
        readonly kind: "tool_finished";
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
        /** @pattern \S */
        readonly actionId: string;
        /** @pattern \S */
        readonly toolId: string;
        readonly outcome: "success" | "failure";
        readonly summary?: string;
    }
    | {
        readonly kind: "tool_attempt_started";
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
        /** @pattern \S */
        readonly actionId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly attempt: number;
    }
    | {
        readonly kind: "tool_attempt_failed";
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
        /** @pattern \S */
        readonly actionId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly attempt: number;
        readonly reason: string;
    }
    | {
        readonly kind: "activity_boundary";
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
        readonly reason: "assistant_reply" | "user_wait" | "stage_change" | "terminal" | "failure" | "unknown";
    }
    | {
        readonly kind: "candidate_preview";
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
        /** @pattern \S */
        readonly candidateId: string;
        readonly text: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly startOffset: number;
        readonly truncated: boolean;
        readonly complete: boolean;
    }
    | {
        readonly kind: "candidate_invalidated";
        /** @pattern \S */
        readonly sourceEventId: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 1 */
        readonly sourceCursor: number;
        /** @pattern \S */
        readonly candidateId: string;
        readonly reason: "rejected" | "cancelled" | "failed" | "replaced" | "ambiguous";
    };

/** 已提交消息的实时推送摘要。 */
export interface BrowserCommittedMessageEvent {
    /** @pattern \S */
    readonly messageId: string;
    readonly role: "user" | "assistant";
    /** @pattern \S */
    readonly runId: string;
    readonly position: BrowserMessagePosition;
    readonly purpose?: "process" | "answer" | "notice";
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly commitRevision: number;
    /** @pattern \S */
    readonly previewId?: string;
}

/** 交互要求的实时推送摘要。 */
export interface BrowserInteractionRequiredEvent {
    /** @pattern \S */
    readonly interactionId: string;
    readonly kind: "ask_user" | "task_approval" | "action_approval" | "action_recovery";
    /** @pattern \S */
    readonly runId: string;
}

/** 浏览器端消费的 Goal 范围实时推送事件。 */
export type BrowserGoalEvent =
    | {
        readonly type: "state_sync";
        /** @pattern \S */
        readonly goalId: string;
        readonly state: BrowserSessionState;
        /**
         * 同一提交边界的完整控制快照；无法与 Runtime 状态对齐时省略。
         *
         * @remarks
         * 存在时页面可直接替换控制状态，不再完整重读 session 与 activity 历史；
         * 省略时页面按窄状态入口自行恢复。
         */
        readonly snapshot?: BrowserControlSnapshot;
    }
    | {
        readonly type: "input_result";
        /** @pattern \S */
        readonly goalId: string;
        readonly outcome: BrowserSessionInputOutcome;
    }
    | {
        readonly type: "activity";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly activity: BrowserGoalActivityEvent;
    }
    | {
        readonly type: "message_committed";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly message: BrowserCommittedMessageEvent;
    }
    | {
        readonly type: "state_committed";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId?: string;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly commitRevision: number;
        /** @minItems 1 */
        readonly changed: readonly BrowserControlScope[];
    }
    | {
        readonly type: "run_status_changed";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly status: BrowserRunStatus;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly commitRevision?: number;
    }
    | {
        readonly type: "run_result";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly result: "completed" | "failed" | "cancelled";
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly commitRevision?: number;
    }
    | {
        readonly type: "interaction_opened";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly interactionId: string;
        readonly kind: BrowserInteractionKind;
    }
    | {
        readonly type: "interaction_settled";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly interactionId: string;
        readonly kind: BrowserInteractionKind;
    }
    | {
        readonly type: "tool_activity";
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        readonly activity: BrowserToolActivity;
    }
    | {
        readonly type: "stream_fault";
        /** @pattern \S */
        readonly goalId: string;
        readonly code: "gap" | "read_failed" | "backpressure" | "publisher_closed";
        /** @minItems 1 */
        readonly resync: readonly BrowserControlScope[];
    }
    | {
        readonly type: "closed";
        /** @pattern \S */
        readonly goalId: string;
        readonly reason: "backpressure" | "closed" | "publisher_closed";
    };

/** 指标覆盖度分类。 */
export type MetricsCoverage = "complete" | "partial" | "unavailable";

/** 单个 Run 与全会话共享的模型用量字段。 */
export interface SessionMetricsValues {
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly stepCount: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly reportedCalls: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly missingCalls: number;
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
    readonly coverage: MetricsCoverage;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly cacheMeasuredCalls: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly cacheExcludedCalls: number;
    readonly cacheHitRate: number | null;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly throughputMeasuredCalls: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly throughputExcludedCalls: number;
    readonly tokensPerSecond: number | null;
}

/** 单个 Run 的模型用量与步数统计。 */
export interface RunSessionMetrics extends SessionMetricsValues {
    /** @pattern \S */
    readonly runId: string;
}

/** 整个 Goal 会话的模型指标聚合快照。 */
/**
 * 当前工作窗口的占用结算。
 *
 * @remarks
 * 只描述最近一次已结算调用在当前模型上的占用，不累加历史调用。`usedPercent`
 * 以 `capacityTokens` 为基数；`source` 说明基数来自模型标称窗口还是用户配置。
 */
export interface SessionMetricsContextUsage {
    /** 已用比例（0–1）；超过容量时截断为 1。 */
    readonly usedPercent: number;
    /** 容量基数（Token）；必须为正的安全整数。 */
    readonly capacityTokens: number;
    /** 容量基数来源：模型标称窗口或用户配置。 */
    readonly source: "model" | "configured";
    /** 占用是否来自本地估算而不是供应商上报。 */
    readonly estimated: boolean;
}

export interface SessionMetricsSnapshot extends SessionMetricsValues {
    /** @pattern \S */
    readonly goalId: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly roundCount: number;
    /** 当前工作窗口占用；容量或占用不可用时省略为 `null`。 */
    readonly contextUsage?: SessionMetricsContextUsage | null;
    readonly runs: readonly RunSessionMetrics[];
}

/** 模型元数据来源分类。 */
export type BrowserModelMetadataSource = "live" | "catalog" | "execution" | "configured" | "mixed";

/** 模型可用性来源。 */
export type BrowserModelAvailabilitySource = "live" | "catalog" | "configured";

/** 候选模型项的展示属性。 */
export interface BrowserModelOption {
    /** @pattern \S */
    readonly id: string;
    /** @pattern \S */
    readonly displayName: string;
    readonly availabilitySource: BrowserModelAvailabilitySource;
    readonly metadataSource: BrowserModelMetadataSource;
    readonly selectable: boolean;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly contextWindowTokens?: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly maxOutputTokens?: number;
    readonly reasoning?: boolean;
    readonly vision?: boolean;
    readonly unavailableReason?: string;
}

/** 默认模型提示告警分类。 */
export type BrowserModelCatalogNotice = "provider_changed" | "model_unavailable";

/** 浏览器模型目录读取的稳定失败分类。 */
export type BrowserModelCatalogError =
    | "goal_not_found"
    | "stale_run"
    | "model_catalog_authentication"
    | "model_catalog_permission"
    | "model_catalog_protocol"
    | "model_catalog_unavailable";

/** 可供选择的模型来源。 */
export interface BrowserModelSourceRef {
    /** @pattern \S */
    readonly profileId?: string;
    readonly kind: string;
    readonly label: string;
    readonly active: boolean;
}

/** 完整模型目录投影。 */
export interface BrowserModelCatalog {
    /** @pattern \S */
    readonly provider: string;
    /** @pattern \S */
    readonly profileId?: string;
    readonly sources?: readonly BrowserModelSourceRef[];
    /** @pattern \S */
    readonly currentModelId: string;
    readonly defaultModelNotice?: BrowserModelCatalogNotice;
    readonly models: readonly BrowserModelOption[];
}

/** 供投影目录的最小模型元数据来源。 */
export interface BrowserModelSource extends BrowserModelOption {
    /** @pattern \S */
    readonly provider: string;
}

/** 读取模型目录结果。 */
export type BrowserModelCatalogReadResult =
    | { readonly ok: true; readonly catalog: BrowserModelCatalog }
    | { readonly ok: false; readonly error: BrowserModelCatalogError };

/** 模型输入消息的独立 wire 传输结构。 */
export interface BrowserModelInputMessageWire {
    readonly role: "system" | "user" | "assistant" | "tool";
    readonly content: string;
    readonly source:
        | "system"
        | "conversation"
        | "section"
        | "working_context"
        | "stage"
        | "request"
        | "native_history";
    readonly reasoning?: string;
    readonly toolCalls?: readonly BrowserModelInputToolCall[];
    readonly continuation?: unknown;
    /** @pattern \S */
    readonly callId?: string;
    /** @pattern \S */
    readonly toolId?: string;
}

/** 模型输入消息携带的工具调用摘要。 */
export interface BrowserModelInputToolCall {
    /** @pattern \S */
    readonly callId: string;
    /** @pattern \S */
    readonly toolId: string;
    readonly argumentsJson: string;
}

/** 完整模型输入调用的 wire 记录。 */
export interface BrowserModelInputRecordWire {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly callId: string;
    /** @pattern \S */
    readonly executionUnitId?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly stepIndex: number;
    readonly stage: "think" | "decide" | "completion_review";
    readonly occurredAt: string;
    readonly messages: readonly BrowserModelInputMessageWire[];
}

/** 模型输入预览消息。 */
export interface BrowserModelInputPreviewMessage {
    readonly role: "system" | "user" | "assistant" | "tool";
    readonly source:
        | "system"
        | "conversation"
        | "section"
        | "working_context"
        | "stage"
        | "request"
        | "native_history";
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly index: number;
    readonly preview: string;
    readonly truncated: boolean;
}

/** 模型输入摘要传输对象（用于调用列表展示）。 */
export interface BrowserModelInputSummary {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    /** @pattern \S */
    readonly callId: string;
    /** @pattern \S */
    readonly executionUnitId?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly stepIndex: number;
    readonly stage: "think" | "decide" | "completion_review";
    readonly occurredAt: string;
    readonly systemVersion: string;
    readonly systemChanged: boolean;
    readonly firstSystem: boolean;
    /** @pattern \S */
    readonly previousCallId: string | null;
    readonly messages: readonly BrowserModelInputPreviewMessage[];
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly omittedMessageCount: number;
}

/** 完整模型输入调用详情（用于只读比对）。 */
export interface BrowserModelInputDetail {
    readonly call: BrowserModelInputRecordWire;
    readonly previousSystem: string | null;
    /** @pattern \S */
    readonly previousCallId: string | null;
    readonly systemVersion: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
}

/** 模型输入列表响应。 */
export interface BrowserModelInputs {
    readonly calls: readonly BrowserModelInputSummary[];
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly total: number;
    /**
     * @maximum 9007199254740991
     * @minimum 0
     */
    readonly nextOffset: number | null;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
}

/** 轨迹 Run 状态投影。 */
export interface BrowserTrajectoryRun {
    /** @pattern \S */
    readonly runId: string;
    readonly status: BrowserRunStatus;
    readonly current: boolean;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
}

/** 单条轨迹事件列表条目。 */
export interface BrowserTrajectoryEntry {
    /** @pattern \S */
    readonly eventId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly sequence: number;
    readonly occurredAt: string;
    readonly eventType: string;
    readonly category:
        | "lifecycle"
        | "decision"
        | "memory"
        | "action"
        | "tool"
        | "observation"
        | "terminal"
        | "commit";
    /** @pattern \S */
    readonly executionUnitId?: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly stepIndex?: number;
    /** @pattern \S */
    readonly actionId?: string;
    /** @pattern \S */
    readonly programId?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly callIndex?: number;
    /** @pattern \S */
    readonly parentActionId?: string;
    readonly title: string;
    readonly preview: string;
    readonly previewTruncated: boolean;
    readonly inputPreview?: string;
    readonly resultPreview?: string;
    readonly modelCallId?: string;
    readonly modelStage?: "think" | "decide";
}

/** 轨迹分页查询响应页。 */
export interface BrowserTrajectoryPage {
    /** @pattern \S */
    readonly goalId: string;
    readonly run: BrowserTrajectoryRun;
    readonly entries: readonly BrowserTrajectoryEntry[];
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly total: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedCount: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
    /** 不透明游标；已到起点时为 `null`。 */
    readonly previousCursor: string | null;
    /** 不透明游标；已到终点时为 `null`。 */
    readonly nextCursor: string | null;
    /**
     * @maximum 9007199254740991
     * @minimum 0
     */
    readonly locatedSequence: number | null;
}

/** 执行单元事件页及显式上下文事件。 */
export interface BrowserExecutionUnitPage {
    /** @pattern \S */
    readonly goalId: string;
    readonly run: BrowserTrajectoryRun;
    readonly entries: readonly BrowserTrajectoryEntry[];
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly total: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
    readonly nextCursor: string | null;
    readonly contextBefore: readonly BrowserTrajectoryEntry[];
    readonly contextAfter: readonly BrowserTrajectoryEntry[];
}

/** 轨迹事件自身的稳定关联。 */
export interface BrowserTrajectoryCorrelation {
    /** @pattern \S */
    readonly actionId?: string;
    /** @pattern \S */
    readonly modelCallId?: string;
    /** @pattern \S */
    readonly programId?: string;
    /** @pattern \S */
    readonly parentActionId?: string;
}

/** 详情可返回的关联事件序号。 */
export interface BrowserTrajectoryRelatedSequences {
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly decision?: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly action?: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly toolStarted?: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly toolFinished?: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly observation?: number;
}

/** 外置 payload 的内容寻址引用。 */
export interface BrowserTrajectoryPayloadReference {
    /** @pattern ^[a-f0-9]{64}$ */
    readonly sha256: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly bytes: number;
    readonly encoding: "canonical-json";
}

/** 时间线的时间边界。 */
export interface BrowserTrajectoryTimeRange {
    readonly start: string;
    readonly end: string;
}

/** 单个事件类型在一个序列桶中的数量。 */
export interface BrowserTrajectoryEventTypeCount {
    readonly eventType: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly count: number;
}

/** 一个固定序列桶的事件统计。 */
export interface BrowserTrajectoryTimelineBucket {
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly startSequence: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly endSequence: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly eventCount: number;
    readonly eventTypes: readonly BrowserTrajectoryEventTypeCount[];
}

/** 一个 Run 的时间线概览。 */
export interface BrowserTrajectoryTimeline {
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly eventCount: number;
    readonly timeRange: BrowserTrajectoryTimeRange | null;
    readonly buckets: readonly BrowserTrajectoryTimelineBucket[];
}

/** 模型输出校验修复反馈。 */
export interface BrowserTrajectoryFeedbackWire {
    readonly code: string;
    readonly origin: string;
    readonly issues: readonly BrowserActionReviewIssue[];
    readonly constraints?: readonly string[];
}

/** 模型输出校验修复负载。 */
export interface BrowserModelRepairFeedbackRecordedPayload {
    readonly type: "model_repair_feedback_recorded";
    readonly stage: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly attempt: number;
    readonly feedback: BrowserTrajectoryFeedbackWire;
}

/** 执行错误停止负载。 */
export interface BrowserExecutionErrorPayload {
    readonly type: "execution_error";
    readonly code: string;
    readonly message: string;
}

/** 模型重试开始负载。 */
export interface BrowserModelRepairAttemptStartedPayload {
    readonly type: "model_repair_attempt_started";
    readonly stage?: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly attempt: number;
}

/** 轨迹事件 payload 的 wire 结构：判别字段之外的 JSON 字段原样保留。 */
export interface BrowserTrajectoryEventPayloadWire {
    readonly type: string;
    readonly [key: string]: BrowserJsonValue;
}

/** 轨迹事件 payload 的开放 JSON 补充约束。 */
export type BrowserTrajectoryEventPayload = BrowserTrajectoryEventPayloadWire;

/** 轨迹事件的 wire 传输信封。 */
export interface BrowserTrajectoryEventWire {
    /** @pattern \S */
    readonly eventId: string;
    /** @pattern \S */
    readonly goalId: string;
    /** @pattern \S */
    readonly runId: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly sequence: number;
    readonly occurredAt: string;
    readonly phase: string;
    readonly eventType: string;
    /** @pattern \S */
    readonly executionUnitId?: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly stepIndex?: number;
    /** @pattern \S */
    readonly actionId?: string;
    /** @pattern \S */
    readonly programId?: string;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly callIndex?: number;
    /** @pattern \S */
    readonly parentActionId?: string;
    readonly payload: BrowserTrajectoryEventPayloadWire;
    /** @asType integer
     * @maximum 9007199254740991 */
    readonly eventSchemaVersion?: number;
}

/** 观察结果 wire 表达；保留 Runtime 已提交 Observation 的开放 JSON 字段。 */
export interface BrowserTrajectoryObservationWire {
    readonly [key: string]: BrowserJsonValue;
}

/** 工具结束事件的 wire 投影。 */
export interface BrowserTrajectoryToolFinished {
    readonly eventType: string;
    readonly payload: {
        readonly observation?: unknown;
        readonly [key: string]: unknown;
    };
}

/** 轨迹 Run 列表响应。 */
export interface BrowserTrajectoryRuns {
    readonly runs: readonly BrowserTrajectoryRun[];
    /**
     * @maximum 9007199254740991
     * @minimum 0
     */
    readonly nextOffset: number | null;
}

/** 校验反馈中的具体问题条目。 */
export type BrowserTrajectoryIssueWire = BrowserActionReviewIssue;

/** 完整轨迹事件与关联上下文详情。 */
export interface BrowserTrajectoryDetail {
    readonly event: BrowserTrajectoryEventWire;
    readonly input?: unknown;
    readonly result?: BrowserTrajectoryObservationWire;
    readonly toolFinished?: BrowserTrajectoryToolFinished;
    readonly toolStartedAt?: string;
    readonly toolFinishedAt?: string;
    readonly toolDurationMs: number | null;
    readonly observationConfirmed: boolean;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly committedThroughSequence: number;
    readonly correlation: BrowserTrajectoryCorrelation;
    readonly related: BrowserTrajectoryRelatedSequences;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 0 */
    readonly payloadBytes: number;
    readonly payloadRef?: BrowserTrajectoryPayloadReference;
}

/**
 * 同一提交边界的 Browser 控制快照。
 *
 * @remarks
 * `session` 是 Runtime 一致会话状态，拥有 Run 状态、队列修订、交互引用与执行
 * 所有者；`goal` 是同一 Run 的完整 Goal 控制投影，拥有待处理 Action、完整交互
 * 视图与队列明细。两者共同构成可直接替换页面控制状态的权威来源，仅由
 * `state_sync` 携带；增量事件不得伪造快照。
 *
 * @example
 * ```ts
 * if (event.type === "state_sync" && event.snapshot !== undefined) {
 *     applyControlSnapshot(event.snapshot);
 * }
 * ```
 */
export interface BrowserControlSnapshot {
    /** 同一 Run 的完整 Goal 控制投影。 */
    readonly goal: BrowserGoalSessionState;
    /** 同一订阅的 Runtime 一致会话状态。 */
    readonly session: BrowserSessionState;
}

/** Browser 控制投影的可失效作用域。 */
export type BrowserControlScope =
    | "session"
    | "activity"
    | "trajectory"
    | "metrics"
    | "goals"
    | "grants"
    | "permission"
    | "model";

/**
 * Goal/Workspace 作用域的统一控制命令。
 *
 * @remarks
 * `intentId` 是客户端控制身份，不写入 Goal Snapshot；`session_input` 复用其
 * `input.inputId` 作为同一身份。`permission_profile` 是 workspace 作用域，其余命令
 * 必须携带目标 `goalId`。
 */
export type BrowserControlIntentCommand =
    | {
        readonly kind: "create_session";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly inputId: string;
        readonly intent: string;
        readonly mode?: "plan";
        /** @pattern \S */
        readonly modelId?: string;
    }
    | {
        readonly kind: "session_input";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
        readonly input: BrowserSessionInputCommand;
    }
    | {
        readonly kind: "plan_mode";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
    }
    | {
        readonly kind: "model_selection";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly modelId: string;
        /** @pattern \S */
        readonly providerProfileId?: string;
        readonly persistAsDefault: boolean;
    }
    | {
        readonly kind: "permission_profile";
        /** @pattern \S */
        readonly intentId: string;
        readonly profile: BrowserPermissionProfile;
        /** @asType integer
         * @maximum 9007199254740991
         * @minimum 0 */
        readonly expectedRevision: number;
    }
    | {
        readonly kind: "exemption_revoke";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly exemptionId: string;
    }
    | {
        readonly kind: "goal_archive";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
        readonly archived: boolean;
    }
    | {
        readonly kind: "goal_delete";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
    }
    | {
        readonly kind: "action_review";
        /** @pattern \S */
        readonly intentId: string;
        /** @pattern \S */
        readonly goalId: string;
        /** @pattern \S */
        readonly runId: string;
        /** @pattern \S */
        readonly actionId: string;
        readonly input?: BrowserJsonValue;
        readonly scope?: BrowserActionReviewScope;
    };

/**
 * 控制命令的成功结果。
 *
 * @remarks
 * `kind` 与 `BrowserControlIntentCommand` 的判别式一致，`result` 复用该命令既有的
 * wire 结果类型。收据必须按命令类型校验结果：不同命令的结果字段高度重叠，缺少
 * 判别式时无法把一份结果唯一归属到某个命令。
 */
export type BrowserControlIntentResult =
    | { readonly kind: "create_session"; readonly result: BrowserCreateSessionResult }
    | { readonly kind: "session_input"; readonly result: BrowserSessionInputResult }
    | { readonly kind: "plan_mode"; readonly result: BrowserGoalPlanModeResult }
    | { readonly kind: "model_selection"; readonly result: BrowserModelSelectionResult }
    | { readonly kind: "permission_profile"; readonly result: BrowserPermissionProfileResult }
    | { readonly kind: "exemption_revoke"; readonly result: BrowserPermissionExemptionResult }
    | { readonly kind: "goal_archive"; readonly result: BrowserGoalArchiveResult }
    | { readonly kind: "goal_delete"; readonly result: BrowserGoalDeleteResult }
    | { readonly kind: "action_review"; readonly result: BrowserActionReviewResult };

/** 控制命令的受理收据；只表达受理结果，不表达 Runtime 事实。 */
export type BrowserControlReceipt =
    | {
        readonly intentId: string;
        readonly status: "accepted" | "existing";
        readonly result: BrowserControlIntentResult;
    }
    | {
        readonly intentId: string;
        readonly status: "rejected";
        readonly error: string;
        readonly refresh?: boolean;
        /** @asType integer
         * @maximum 9007199254740991 */
        readonly actualRevision?: number;
    }
    | { readonly intentId: string; readonly status: "unknown" };

/** 单个工具活动的公开控制状态。 */
export interface BrowserToolActivity {
    /** @pattern \S */
    readonly actionId: string;
    /** @pattern \S */
    readonly executionUnitId?: string;
    /** @pattern \S */
    readonly toolId?: string;
    /** @asType integer
     * @maximum 9007199254740991
     * @minimum 1 */
    readonly attempt?: number;
    readonly phase: "started" | "attempting" | "retrying" | "result_pending" | "observed_committed" | "unknown";
    readonly outcome?: "success" | "failure";
    readonly summary?: string;
    readonly reason?: string;
}

/** 控制事实事件；包含同步、命令结果与 Run／交互控制事实。 */
export type BrowserControlEvent = Extract<
    BrowserGoalEvent,
    {
        readonly type:
            | "state_sync"
            | "state_committed"
            | "input_result"
            | "run_status_changed"
            | "run_result"
            | "interaction_opened"
            | "interaction_settled"
            | "tool_activity"
            | "stream_fault"
            | "closed";
    }
>;

/** 内容事实事件；生成正文、候选与正式消息保持既有语义。 */
export type BrowserContentEvent = Extract<
    BrowserGoalEvent,
    {
        readonly type:
            | "activity"
            | "message_committed";
    }
>;

