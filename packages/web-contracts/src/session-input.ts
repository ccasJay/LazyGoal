import type { InferContract } from "../../contracts/src/index";
import {
    browserSessionInputKindContract,
    browserSessionInputReceiptContract,
    browserSessionInputStatusContract,
} from "./contracts/common";
import {
    browserCreateSessionCommandContract,
    browserCreateSessionResultContract,
    browserSessionInputCommandContract,
    browserSessionInputOutcomeContract,
    browserSessionInputQueryResultContract,
    browserSessionInputResultContract,
    browserSessionInteractionResponseContract,
    browserSessionStateContract,
} from "./contracts/input";
import {
    browserSessionMessageEntryContract,
    browserSessionMessageListResultContract,
    browserSessionMessageResultContract,
} from "./contracts/session";

/**
 * Web 统一会话输入、收据与安全会话状态的 wire 传输对象。
 *
 * @remarks
 * 浏览器只提交带稳定身份的会话输入，并从服务端投影读取队列、暂停、提交修订与
 * 是否需要显式恢复。这里不定义第二套受理或队列规则：受理、去重、队列与恢复
 * 判定全部由 Runtime 会话所有者完成，Browser 只做 wire 校验与安全投影。
 */

/**
 * 会话输入种类。
 *
 * @example
 * ```ts
 * const kind: BrowserSessionInputKind = "steer";
 * ```
 */
export type BrowserSessionInputKind = InferContract<typeof browserSessionInputKindContract>;

/**
 * wire 上允许传输的 JSON 值。
 *
 * @remarks 只包含 JSON 原生类型；浏览器提交的 Tool 参数必须是该形状的普通对象
 * 或标量，Runtime 会在提交边界按 Tool Contract 重新校验。
 *
 * @example
 * ```ts
 * const input: BrowserJsonValue = { path: "notes.md" };
 * ```
 */
export type BrowserJsonValue =
    | null
    | boolean
    | number
    | string
    | readonly BrowserJsonValue[]
    | { readonly [key: string]: BrowserJsonValue };

/**
 * 交互回答的 wire 载荷。
 *
 * @remarks
 * 与当前等待的 `requestId` 一起提交；Action 审批必须携带真实 `actionId`。
 * `answer_ask_user` 提交逐题答案，`reply_to_question` 以非空整体回复替代整份
 * 问卷，`skip_question` 表示未回答并要求继续；三者互斥。
 *
 * @example
 * ```ts
 * const response: BrowserSessionInteractionResponse = { kind: "skip_question" };
 * ```
 */
export type BrowserSessionInteractionResponse =
    InferContract<typeof browserSessionInteractionResponseContract>;

/**
 * `POST /api/goals/:goalId/inputs` 的严格 wire 命令。
 *
 * @remarks
 * 每个变体都携带 Goal 内稳定 `inputId`；同身份同载荷重试返回原收据，异载荷返回
 * 身份冲突。`steer`／`interrupt`／`respond`／`resume` 面向明确 `runId`；
 * `resume` 携带页面读取到的提交修订；`queue_control` 携带被观察到的队列修订。
 * 排队消息转为 Steer 时，`queueBinding` 绑定原消息与其观察到的队列修订。
 * 普通 `message` 面向 Goal 的后续队列，不绑定发送时的旧 Run。
 *
 * @example
 * ```ts
 * const command: BrowserSessionInputCommand = {
 *     kind: "message", inputId: "input-2", content: "继续",
 * };
 * ```
 */
export type BrowserSessionInputCommand =
    InferContract<typeof browserSessionInputCommandContract>;

/**
 * 输入账本中的受理状态。
 *
 * @example
 * ```ts
 * const status: BrowserSessionInputStatus = "pending";
 * ```
 */
export type BrowserSessionInputStatus = InferContract<typeof browserSessionInputStatusContract>;

/**
 * 一条已持久化输入的受理收据投影。
 *
 * @example
 * ```ts
 * const receipt: BrowserSessionInputReceipt = {
 *   goalId: "goal-1", inputId: "input-2", kind: "message", sequence: 2,
 *   status: "pending", admittedAtRevision: 4,
 * };
 * ```
 */
export type BrowserSessionInputReceipt = InferContract<typeof browserSessionInputReceiptContract>;

/**
 * 输入受理与查询的稳定 wire 拒绝代码。
 *
 * @remarks
 * 代码与 Runtime 会话受理的拒绝分类一致，另加 `input_admission_failed` 表示保存
 * 失败或结果不明：调用方必须使用原 `inputId` 查询收据或重试，不能改用新身份。
 *
 * @example
 * ```ts
 * const code: BrowserSessionInputErrorCode = "QUEUE_PAUSED";
 * ```
 */
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
    | "RUN_CONTROL_UNAVAILABLE"
    | "input_admission_failed"
    | "session_unavailable";

/**
 * 一条输入受理／拒绝的公开结果。
 *
 * @remarks
 * `ok: true` 只表示输入及其收据已经提交，不表示消息已应用、工具已停止或 Run
 * 已完成。业务拒绝不写入受理账本。
 *
 * @example
 * ```ts
 * const outcome: BrowserSessionInputOutcome = {
 *   goalId: "goal-1", inputId: "input-2", kind: "message", ok: true, existing: false,
 * };
 * ```
 */
export type BrowserSessionInputOutcome =
    InferContract<typeof browserSessionInputOutcomeContract>;

/**
 * 一次 inputs 受理的 wire 结果。
 *
 * @remarks
 * 新受理返回 `existing: false`（HTTP 202），同身份同载荷的既有收据返回
 * `existing: true`（HTTP 200）；拒绝不返回收据。
 *
 * @example
 * ```ts
 * const result: BrowserSessionInputResult = {
 *   ok: false, error: "QUEUE_PAUSED",
 * };
 * ```
 */
export type BrowserSessionInputResult =
    InferContract<typeof browserSessionInputResultContract>;

/**
 * 按身份查询持久化收据的结果。
 *
 * @remarks 未找到使用 `found: false` 表达；读取失败不伪装为不存在。
 *
 * @example
 * ```ts
 * const queried: BrowserSessionInputQueryResult = { ok: true, found: false };
 * ```
 */
export type BrowserSessionInputQueryResult =
    InferContract<typeof browserSessionInputQueryResultContract>;

/**
 * 安全会话状态投影。
 *
 * @remarks
 * 只包含公开、可核验的会话事实：Run 身份与状态、Goal 提交修订、队列修订与暂停、
 * 待处理数量、当前等待类型、中断阶段以及是否需要显式恢复。不包含隐藏推理、
 * 密钥、原始 Provider 响应或任意完整工具参数。
 *
 * @example
 * ```ts
 * const state: BrowserSessionState = {
 *   goalId: "goal-1", runId: "run-1", runStatus: "running", mode: "normal",
 *   commitRevision: 4, queueRevision: 2, queuePaused: false,
 *   pendingMessageCount: 1, pendingSteerCount: 0, needsRecovery: false,
 *   executionOwner: true,
 * };
 * ```
 */
export type BrowserSessionState = InferContract<typeof browserSessionStateContract>;

/**
 * 会话消息的公开条目。
 *
 * @remarks
 * 只包含身份、角色、Run 归属、稳定位置、用途、来源与有界正文摘要；正文超限时
 * 明确标记截断，完整原文按 `messageId` 另行读取。
 *
 * @example
 * ```ts
 * const entry: BrowserSessionMessageEntry = {
 *   messageId: "msg-1", role: "assistant", runId: "run-1",
 *   position: { afterSequence: 8, order: 0 },
 *   purpose: "answer", sourceKind: "completion_candidate", sourceId: "c1",
 *   content: "已完成", contentLength: 3, truncated: false,
 * };
 * ```
 */
export type BrowserSessionMessageEntry = InferContract<typeof browserSessionMessageEntryContract>;

/**
 * 有界消息列表的 wire 结果。
 *
 * @remarks
 * `nextAfterMessageId` 表示还有后续页；`throughMessageId` 是本批确定的范围
 * 末尾，翻页必须沿用同一值。
 *
 * @example
 * ```ts
 * const list: BrowserSessionMessageListResult = { ok: true, messages: [], total: 0 };
 * ```
 */
export type BrowserSessionMessageListResult =
    InferContract<typeof browserSessionMessageListResultContract>;

/**
 * 单条消息正文的 wire 结果。
 *
 * @remarks
 * `nextOffset` 是截断后续读的位置；`truncated` 明确说明本次不是完整原文。
 *
 * @example
 * ```ts
 * const message: BrowserSessionMessageResult = { ok: true, message: entry };
 * ```
 */
export type BrowserSessionMessageResult =
    InferContract<typeof browserSessionMessageResultContract>;

/**
 * 创建 Session 的 wire 命令。
 *
 * @remarks
 * `inputId` 是前端预生成的稳定首条输入身份：同身份同载荷的重试连接原 Goal 并
 * 返回原收据，不重复创建 Run，也不把创建重试当作重启后的执行恢复指令。
 *
 * @example
 * ```ts
 * const command: BrowserCreateSessionCommand = {
 *   goalId: "goal-1", inputId: "input-1", intent: "检查项目",
 * };
 * ```
 */
export type BrowserCreateSessionCommand =
    InferContract<typeof browserCreateSessionCommandContract>;

/**
 * 创建 Session 的 wire 结果。
 *
 * @example
 * ```ts
 * const result: BrowserCreateSessionResult = {
 *   ok: true, existing: false, goalId: "goal-1", runId: "run-1",
 *   receipt: { goalId: "goal-1", inputId: "input-1", kind: "message", sequence: 1, status: "applied", admittedAtRevision: 1 },
 * };
 * ```
 */
export type BrowserCreateSessionResult =
    InferContract<typeof browserCreateSessionResultContract>;
