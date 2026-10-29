import type { InferContract } from "../../contracts/src/index";
import {
    browserActivityActionContextContract,
    browserActivityFactItemContract,
    browserActivityGapContract,
    browserActivityItemContract,
    browserActivityMessageItemContract,
    browserActivityPageContract,
    browserActivityPositionContract,
    browserActivityQueryContract,
    browserActivityReadResultContract,
    browserActivityRunContextContract,
    browserActivityRunWindowContract,
    browserActivityStageContextContract,
    browserActivityThinkItemContract,
    browserActivityToolLifecycleEntryContract,
    browserActivityToolStateContract,
    BROWSER_ACTIVITY_EVENT_TYPES,
} from "./contracts/activity";
export { BROWSER_ACTIVITY_EVENT_TYPES } from "./contracts/activity";


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
export type BrowserActivityPosition = InferContract<typeof browserActivityPositionContract>;

/**
 * Activity 窗口中的正式消息摘要。
 *
 * @remarks
 * 摘要只含稳定身份、Run 内位置、助手消息用途和最多 4,000 UTF-16 code unit 正文；
 * `truncated` 为 true 时须按 `messageId` 使用单条正文读取接口继续读取。用户消息不带
 * `purpose`；助手消息必须区分过程、最终答复或公开通知。被正式接受的完成候选可带
 * `previewId`，以便浏览器将公开预览原位结算为规范 Snapshot 消息。
 *
 * @example
 * ```ts
 * const item: BrowserActivityMessageItem = {
 *     type: "message", itemId: "message:msg-1", messageId: "msg-1", role: "assistant",
 *     runId: "run-1", purpose: "answer", previewId: "call-1",
 *     position: { runId: "run-1", runOrder: 0, sequence: 0, itemKind: "message", order: 0 },
 *     content: "继续", contentLength: 2, truncated: false,
 * };
 * ```
 */
export type BrowserActivityMessageItem =
    InferContract<typeof browserActivityMessageItemContract>;

/**
 * Activity 工具动作的一条已提交生命周期记录。
 *
 * @remarks
 * 记录只来自同一 Action 的白名单 Trajectory 事实，按来源顺序排列，用于把授权申请、
 * 授权结果、执行开始、重试与结果折叠进同一个工具活动。`title` 是固定短标签，
 * `detail` 只包含既有安全说明；原始工具参数、Observation 正文、审批表单和模型内部
 * 反馈不进入该结构。
 *
 * @example
 * ```ts
 * const entry: BrowserActivityToolLifecycleEntry = {
 *     kind: "approval", title: "Permission granted",
 *     detail: "The approved action may now execute within its authorized scope.",
 * };
 * ```
 */
export type BrowserActivityToolLifecycleEntry =
    InferContract<typeof browserActivityToolLifecycleEntryContract>;

/**
 * Activity 事实项携带的已提交工具状态白名单投影。
 *
 * @remarks
 * 只包含恢复活动组所需的工具身份、执行状态与既有安全摘要；不包含原始工具参数、
 * Observation 正文、供应商 reasoning 或审批表单内容。`status` 只反映已提交的
 * Observation 与拒绝事实，实时返回不会把它提前标为成功。`lifecycle` 按来源顺序保留
 * 同一 Action 的授权、执行、重试与结果记录，供前端折叠为一个活动。`activityBoundaryBefore`
 * 表示该动作与前一个活动组之间存在已验证的来源边界，隐藏正文不会改变该判定。
 *
 * @example
 * ```ts
 * const tool: BrowserActivityToolState = {
 *     toolId: "read_file", status: "completed",
 *     inputSummary: "src/index.ts", summary: "读取成功",
 *     lifecycle: [{ kind: "execution", title: "Tool started" }],
 * };
 * ```
 */
export type BrowserActivityToolState =
    InferContract<typeof browserActivityToolStateContract>;

/**
 * Activity 窗口中的安全轨迹事实摘要。
 *
 * @remarks
 * 只包含事实身份及必要关联标识，不包含原始 payload、工具参数、Observation、私有
 * Prompt 或模型内部推理。阶段标题仅取自已提交 `run_stage_declared.target`，并按公开
 * 文本上限截断；其他事件不携带阶段标题。同一 Action 的决策、授权、执行、重试与结果
 * 事实都携带该动作的最终安全状态和生命周期，供前端在不读取完整会话的情况下恢复为
 * 一个活动组。检索事实仅携带同 Run 内的 `lookupId`、枚举生成的请求摘要和白名单错误码，
 * 不公开查询正文或原始错误消息。
 *
 * @example
 * ```ts
 * const item: BrowserActivityFactItem = {
 *     type: "fact", itemId: "event:event-12", eventId: "event-12", runId: "run-1",
 *     eventType: "tool_started", title: "Tool started",
 *     position: { runId: "run-1", runOrder: 0, sequence: 12, itemKind: "fact", order: 0 },
 *     tool: { toolId: "read_file", status: "recorded", inputSummary: "src/index.ts" },
 * };
 * ```
 */
export type BrowserActivityFactItem =
    InferContract<typeof browserActivityFactItemContract>;

/**
 * Activity 窗口中的显式 Think 摘要。
 *
 * @remarks
 * 只保留既有获准摘要与已提交输出：思考目标、已提交的分析正文及其截断标记。不包含
 * 供应商隐藏推理、私有阶段或原始 Prompt。Think 是同一 Runtime Step 内的展示成员，
 * 不增加 Step 计数，也不产生新的工具事实。`executionUnitId` 是该 Think 的详情
 * 定位引用，指向 Trajectory 中同一执行单元的已提交事件。
 *
 * @example
 * ```ts
 * const item: BrowserActivityThinkItem = {
 *     type: "think", itemId: "think:event-4", runId: "run-1",
 *     position: { runId: "run-1", runOrder: 0, sequence: 4, itemKind: "fact", order: 0 },
 *     executionUnitId: "unit-1",
 *     think: { goal: "比较证据", output: "需要一次新观察。" },
 * };
 * ```
 */
export type BrowserActivityThinkItem =
    InferContract<typeof browserActivityThinkItemContract>;

/** 正式消息、安全轨迹事实与显式 Think 组成的原子 Activity 项。 */
export type BrowserActivityItem = InferContract<typeof browserActivityItemContract>;

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
export type BrowserActivityRunContext =
    InferContract<typeof browserActivityRunContextContract>;

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
export type BrowserActivityRunWindow =
    InferContract<typeof browserActivityRunWindowContract>;

/**
 * Activity 页中跨页阶段的安全上下文。
 *
 * @remarks
 * `target` 为已提交阶段声明的目标摘要，最多 1,000 个 UTF-16 代码单元；没有声明时省略。
 * `completeWithinPage` 为 false 表示阶段来源未全部加载，不代表阶段尚未完成。
 *
 * @example
 * ```ts
 * const stage: BrowserActivityStageContext = {
 *     runId: "run-1", stageId: "stage-1", revision: 1, status: "executing",
 *     firstSequence: 8, completeWithinPage: false,
 * };
 * ```
 */
export type BrowserActivityStageContext =
    InferContract<typeof browserActivityStageContextContract>;

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
export type BrowserActivityActionContext =
    InferContract<typeof browserActivityActionContextContract>;

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
export type BrowserActivityGap = InferContract<typeof browserActivityGapContract>;

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
export type BrowserActivityPage = InferContract<typeof browserActivityPageContract>;

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
export type BrowserActivityQuery = InferContract<typeof browserActivityQueryContract>;

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
    InferContract<typeof browserActivityReadResultContract>;
