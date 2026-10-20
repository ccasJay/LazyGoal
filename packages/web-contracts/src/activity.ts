import type { BrowserRunStatus } from "./session";

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

/** Activity 历史中可公开的轨迹事实种类。 */
export type BrowserActivityEventType = typeof BROWSER_ACTIVITY_EVENT_TYPES[number];

/**
 * Activity 项在固定历史窗口内的稳定排序键。
 *
 * @remarks
 * 同一 Run 先按事实序列排列；同一序列上事实在消息之前，消息再按 Snapshot 锚点次序排列。
 * `runOrder` 来自 Snapshot 中已完成 Run 顺序和当前 Run，不能由客户端时间替代。
 *
 * @example
 * ```ts
 * const position: BrowserActivityPosition = {
 *     runId: "run-1", runOrder: 0, sequence: 12, itemKind: "message", order: 0,
 * };
 * ```
 */
export interface BrowserActivityPosition {
    /** 所属 Run 身份。 */
    readonly runId: string;
    /** Goal 中稳定的 Run 顺序，从零开始。 */
    readonly runOrder: number;
    /** 事实序号；消息使用其 afterSequence 锚点。 */
    readonly sequence: number;
    /** 同序列处的事实先于消息。 */
    readonly itemKind: "fact" | "message";
    /** 同一事实锚点内消息的 Snapshot 次序；事实项固定为零。 */
    readonly order: number;
}

/**
 * Activity 窗口中的正式消息摘要。
 *
 * @remarks
 * 摘要只含稳定身份、Run 内位置、助手消息用途和最多 4,000 UTF-16 code unit 正文；
 * `truncated` 为 true 时须按 `messageId` 使用单条正文读取接口继续读取。用户消息不带
 * `purpose`；助手消息必须区分过程、最终答复或公开通知。
 *
 * @example
 * ```ts
 * const item: BrowserActivityMessageItem = {
 *     type: "message", itemId: "message:msg-1", messageId: "msg-1", role: "assistant",
 *     runId: "run-1", purpose: "answer",
 *     position: { runId: "run-1", runOrder: 0, sequence: 0, itemKind: "message", order: 0 },
 *     content: "继续", contentLength: 2, truncated: false,
 * };
 * ```
 */
export interface BrowserActivityMessageItem {
    readonly type: "message";
    /** 以来源种类和来源身份构造的稳定项身份。 */
    readonly itemId: string;
    /** 正式消息稳定身份。 */
    readonly messageId: string;
    readonly role: "user" | "assistant";
    /** 助手正文的 Runtime 用途；用户消息省略。 */
    readonly purpose?: "process" | "answer" | "notice";
    readonly runId: string;
    readonly position: BrowserActivityPosition;
    /** 最多 4,000 UTF-16 code unit 的正文摘要。 */
    readonly content: string;
    /** Snapshot 中的原始正文长度。 */
    readonly contentLength: number;
    /** 正文摘要是否因上限截断。 */
    readonly truncated: boolean;
}

/**
 * Activity 窗口中的安全轨迹事实摘要。
 *
 * @remarks
 * 只包含事实身份及必要关联标识，不包含原始 payload、工具参数、Observation、私有
 * Prompt 或模型内部推理。阶段标题仅取自已提交 `run_stage_declared.target`，并按公开
 * 文本上限截断；其他事件不携带阶段标题。
 *
 * @example
 * ```ts
 * const item: BrowserActivityFactItem = {
 *     type: "fact", itemId: "event:event-12", eventId: "event-12", runId: "run-1",
 *     eventType: "tool_started", title: "Tool started",
 *     position: { runId: "run-1", runOrder: 0, sequence: 12, itemKind: "fact", order: 0 },
 * };
 * ```
 */
export interface BrowserActivityFactItem {
    readonly type: "fact";
    /** 以事实事件身份构造的稳定项身份。 */
    readonly itemId: string;
    /** 不可变轨迹事件身份。 */
    readonly eventId: string;
    readonly runId: string;
    readonly position: BrowserActivityPosition;
    /** 白名单事件类型。 */
    readonly eventType: BrowserActivityEventType;
    /** 不含 payload 的短展示标签。 */
    readonly title: string;
    /** 存在时只用于关联真实 Runtime 活动。 */
    readonly executionUnitId?: string;
    readonly actionId?: string;
    readonly stageId?: string;
    /** 阶段生命周期事实携带的 Runtime 修订号。 */
    readonly stageRevision?: number;
    /** 已提交阶段声明中的有界目标；仅 `run_stage_declared` 提供。 */
    readonly stageTarget?: string;
}

/** 正式消息和安全轨迹事实组成的原子 Activity 项。 */
export type BrowserActivityItem = BrowserActivityMessageItem | BrowserActivityFactItem;

/**
 * 一次读取涉及的 Run 上下文。
 *
 * @remarks
 * `committedThroughSequence` 来自 Snapshot，是本次窗口允许读取的 Trajectory 上界。
 *
 * @example
 * ```ts
 * const run: BrowserActivityRunContext = {
 *     runId: "run-1", status: "running", current: true, runOrder: 0,
 *     committedThroughSequence: 12,
 * };
 * ```
 */
export interface BrowserActivityRunContext {
    readonly runId: string;
    readonly status: BrowserRunStatus;
    readonly current: boolean;
    readonly runOrder: number;
    readonly committedThroughSequence: number;
}

/**
 * 固定 Activity 窗口中单个 Run 的消息和轨迹上界。
 *
 * @example
 * ```ts
 * const window: BrowserActivityRunWindow = {
 *     runId: "run-1", messageCount: 8, throughMessageId: "msg-8", committedThroughSequence: 42,
 * };
 * ```
 */
export interface BrowserActivityRunWindow {
    readonly runId: string;
    readonly messageCount: number;
    readonly throughMessageId?: string;
    readonly committedThroughSequence: number;
}

/**
 * Activity 页中跨页阶段的安全上下文。
 *
 * @remarks
 * `completeWithinPage` 为 false 表示阶段声明或结算事实不都在当前连续窗口内。
 *
 * @example
 * ```ts
 * const stage: BrowserActivityStageContext = {
 *     runId: "run-1", stageId: "stage-1", revision: 1, status: "executing",
 *     firstSequence: 8, completeWithinPage: false,
 * };
 * ```
 */
export interface BrowserActivityStageContext {
    readonly runId: string;
    readonly stageId: string;
    readonly revision: number;
    readonly status: "executing" | "accepted" | "rejected";
    readonly firstSequence: number;
    readonly lastSequence?: number;
    readonly completeWithinPage: boolean;
}

/**
 * Activity 页中跨页 Action 活动组的完整性提示。
 *
 * @remarks
 * 服务只报告同一 Action 的来源跨度，不合并工具尝试或结果；前端只能在已加载的连续
 * 范围内组合活动。
 *
 * @example
 * ```ts
 * const group: BrowserActivityActionContext = {
 *     runId: "run-1", actionId: "action-1", firstSequence: 8, lastSequence: 12,
 *     completeWithinPage: true,
 * };
 * ```
 */
export interface BrowserActivityActionContext {
    readonly runId: string;
    readonly actionId: string;
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly completeWithinPage: boolean;
}

/**
 * 当前页之外、仍可按 Activity cursor 读取的连续项区间。
 *
 * @remarks
 * `itemCount` 和首尾位置只描述固定窗口中的未加载项数量与范围，不包含其正文或事件载荷。
 * `direction` 相对于当前页的正序位置，`older` 位于当前页之前，`newer` 位于之后。
 *
 * @example
 * ```ts
 * const gap: BrowserActivityGap = {
 *     direction: "older", itemCount: 12,
 *     first: { runId: "run-1", runOrder: 0, sequence: 1, itemKind: "fact", order: 0 },
 *     last: { runId: "run-1", runOrder: 0, sequence: 12, itemKind: "fact", order: 0 },
 * };
 * ```
 */
export interface BrowserActivityGap {
    readonly direction: "older" | "newer";
    readonly itemCount: number;
    readonly first: BrowserActivityPosition;
    readonly last: BrowserActivityPosition;
}

/**
 * 固定水位的一页 Activity 查询结果。
 *
 * @remarks
 * `beforeCursor` 与 `afterCursor` 只沿同一 Goal、筛选和各 Run 的消息／Trajectory 上界
 * 翻页，不是实时游标或访问凭据。`gaps` 给出当前页首尾尚未加载项的数量与位置范围。
 *
 * @example
 * ```ts
 * const page: BrowserActivityPage = {
 *     goalId: "goal-1", limit: 50, items: [], runs: [], window: [], gaps: [], stages: [], actionGroups: [],
 *     range: { olderAvailable: false, newerAvailable: false },
 * };
 * ```
 */
export interface BrowserActivityPage {
    readonly goalId: string;
    readonly runFilter?: string;
    readonly limit: number;
    readonly items: readonly BrowserActivityItem[];
    readonly runs: readonly BrowserActivityRunContext[];
    readonly window: readonly BrowserActivityRunWindow[];
    /** 当前页之前或之后尚未加载的固定窗口范围；至多各一段。 */
    readonly gaps: readonly BrowserActivityGap[];
    readonly range: {
        readonly first?: BrowserActivityPosition;
        readonly last?: BrowserActivityPosition;
        readonly olderAvailable: boolean;
        readonly newerAvailable: boolean;
    };
    readonly stages: readonly BrowserActivityStageContext[];
    readonly actionGroups: readonly BrowserActivityActionContext[];
    readonly beforeCursor?: string;
    readonly afterCursor?: string;
}

/**
 * Activity 读取路由的已验证参数。
 *
 * @remarks
 * 省略 cursor 时建立当前最新固定窗口；`before` 与 `after` 互斥且沿同一窗口读取。`runId`
 * 限定单个 Run，`limit` 默认为 50，最大为 100。
 *
 * @example
 * ```ts
 * const query: BrowserActivityQuery = { runId: "run-1", limit: 50 };
 * ```
 */
export interface BrowserActivityQuery {
    readonly runId?: string;
    readonly before?: string;
    readonly after?: string;
    readonly limit?: number;
}

/**
 * Activity 查询的稳定读取结果。
 *
 * @remarks
 * `goal_not_found` 与 `run_not_found` 表示来源不存在；`activity_cursor_invalid` 表示
 * cursor 非法、与 Goal／筛选不匹配或其固定上界不再是当前保存内容的合法前缀。
 *
 * @example
 * ```ts
 * const result: BrowserActivityReadResult = { ok: false, error: "activity_cursor_invalid" };
 * ```
 */
export type BrowserActivityReadResult =
    | { readonly ok: true; readonly page: BrowserActivityPage }
    | { readonly ok: false; readonly error: "goal_not_found" | "run_not_found" | "activity_cursor_invalid" };
