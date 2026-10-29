import type { InferContract } from "../../contracts/src/index";
import {
    browserSessionInputKindContract,
    browserSessionInputReceiptContract,
    browserSessionInputStatusContract,
} from "./contracts/common";

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
    | {
        readonly kind: "answer_ask_user";
        readonly answers: readonly {
            readonly questionId: string;
            readonly optionIds: readonly string[];
            readonly otherText?: string;
        }[];
    }
    | { readonly kind: "reply_to_question"; readonly content: string }
    | { readonly kind: "skip_question" }
    | { readonly kind: "approve_task" }
    | { readonly kind: "feedback_task"; readonly feedback: string }
    | {
        /**
         * 批准首次未执行的工具调用。
         *
         * @remarks 只消费首次审批等待；不消费结果未知的恢复等待。
         */
        readonly kind: "approve_action";
        readonly actionId: string;
        readonly scope?: "action" | "goal" | "workspace";
    }
    | {
        /**
         * 批准同一工具的修订参数版本。
         *
         * @remarks 必须携带预检返回的审阅引用；服务端会重新计算最终参数与范围并
         * 比对，不一致时明确拒绝并要求重新审阅。
         */
        readonly kind: "approve_action_revision";
        readonly actionId: string;
        readonly input: BrowserJsonValue;
        readonly reviewRef: string;
        readonly scope?: "action" | "goal" | "workspace";
    }
    | {
        /**
         * 明确允许结果未知的操作按获批版本再次执行。
         *
         * @remarks 绑定本次未知结果等待身份；不携带新参数或持续授权期限。
         */
        readonly kind: "retry_unknown_action";
        readonly actionId: string;
        readonly recoveryRef: string;
    }
    | {
        /**
         * 拒绝结果未知的操作再次执行。
         *
         * @remarks 保留此前效果未知的事实，不把原操作记作未执行、已回滚或成功。
         */
        readonly kind: "decline_unknown_action_retry";
        readonly actionId: string;
        readonly recoveryRef: string;
        readonly reason: string;
    }
    | { readonly kind: "reject_action"; readonly actionId: string; readonly reason: string };

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
    | { readonly kind: "message"; readonly inputId: string; readonly content: string }
    | {
        readonly kind: "steer";
        readonly inputId: string;
        readonly runId: string;
        readonly content: string;
        readonly queueBinding?: { readonly messageId: string; readonly queueRevision: number };
    }
    | { readonly kind: "interrupt"; readonly inputId: string; readonly runId: string }
    | {
        readonly kind: "respond";
        readonly inputId: string;
        readonly runId: string;
        readonly requestId: string;
        readonly response: BrowserSessionInteractionResponse;
    }
    | {
        readonly kind: "resume";
        readonly inputId: string;
        readonly runId: string;
        readonly commitRevision: number;
        readonly content?: string;
    }
    | {
        readonly kind: "queue_control";
        readonly inputId: string;
        readonly action: "continue" | "clear" | "remove";
        readonly queueRevision: number;
        readonly messageId?: string;
    };

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
export interface BrowserSessionInputOutcome {
    /** 受理该输入的 Goal。 */
    readonly goalId: string;
    /** 输入身份。 */
    readonly inputId: string;
    /** 输入种类。 */
    readonly kind: BrowserSessionInputKind;
    /** 是否已持久化受理。 */
    readonly ok: boolean;
    /** 是否为同身份同载荷的既有收据。 */
    readonly existing?: boolean;
    /** 已受理收据；拒绝时省略。 */
    readonly receipt?: BrowserSessionInputReceipt;
    /** 稳定业务拒绝代码；受理成功时省略。 */
    readonly code?: BrowserSessionInputErrorCode;
}

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
    | {
        readonly ok: true;
        readonly existing: boolean;
        readonly receipt: BrowserSessionInputReceipt;
    }
    | {
        readonly ok: false;
        readonly error: BrowserSessionInputErrorCode;
    };

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
    | { readonly ok: true; readonly found: false }
    | { readonly ok: true; readonly found: true; readonly receipt: BrowserSessionInputReceipt }
    | { readonly ok: false; readonly error: "GOAL_NOT_FOUND" | "input_read_failed" };

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
export interface BrowserSessionState {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 当前（或最新）Run 的稳定标识。 */
    readonly runId: string;
    /** 当前 Run 的持久化状态。 */
    readonly runStatus: "created" | "running" | "waiting" | "completed" | "failed" | "cancelled";
    /** 当前 Run 的模式。 */
    readonly mode: "normal" | "plan";
    /** Goal 级单调提交修订。 */
    readonly commitRevision: number;
    /** 消息队列修订。 */
    readonly queueRevision: number;
    /** 队列是否处于暂停。 */
    readonly queuePaused: boolean;
    /** 暂停原因；未暂停时省略。 */
    readonly queuePauseReason?: "run_failed" | "user_interrupt";
    /** 尚未应用的普通消息数量。 */
    readonly pendingMessageCount: number;
    /** 尚未应用的 Steer 数量。 */
    readonly pendingSteerCount: number;
    /** 当前等待的交互类型；运行中或终态时省略。 */
    readonly waitingFor?:
        | "ask_user"
        | "task_approval"
        | "action_approval"
        | "action_recovery"
        | "blocked";
    /** 当前等待交互的规范引用；没有等待时省略。 */
    readonly interaction?: {
        readonly interactionId: string;
        readonly kind: "question" | "task_approval" | "action_approval" | "action_recovery";
        readonly runId: string;
        readonly requestId?: string;
        readonly actionId?: string;
    };
    /** 已提交消息的有界范围；不包含正文。 */
    readonly messages: {
        readonly count: number;
        readonly throughMessageId?: string;
        readonly recent: readonly {
            readonly messageId: string;
            readonly role: "user" | "assistant";
            readonly runId: string;
            /** 消息之前最后一条已提交 Run 事实及同锚点 Snapshot 次序。 */
            readonly position: { readonly afterSequence: number; readonly order: number };
            readonly purpose?: "process" | "answer" | "notice";
            readonly sourceKind: string;
            readonly sourceId: string;
        }[];
    };
    /** 是否需要调用方显式恢复执行。 */
    readonly needsRecovery: boolean;
    /** 当前 Run 的用户中断状态；未受理用户中断时省略。 */
    readonly interruption?: {
        readonly requestId: string;
        readonly status: "requested" | "finished";
        readonly outcomeUnknown: boolean;
    };
    /** 当前实例是否持有该 Goal 的执行所有者。 */
    readonly executionOwner: boolean;
}

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
export interface BrowserSessionMessageEntry {
    /** 消息稳定身份。 */
    readonly messageId: string;
    /** 消息角色。 */
    readonly role: "user" | "assistant";
    /** 消息所属 Run。 */
    readonly runId: string;
    /** 消息在所属 Run 已提交事实流中的稳定位置。 */
    readonly position: { readonly afterSequence: number; readonly order: number };
    /** 助手消息用途；用户消息省略。 */
    readonly purpose?: "process" | "answer" | "notice";
    /** 来源判别式。 */
    readonly sourceKind: string;
    /** 来源的稳定标识。 */
    readonly sourceId: string;
    /** 有界正文摘要。 */
    readonly content: string;
    /** 原始正文长度。 */
    readonly contentLength: number;
    /** 正文摘要是否被截断。 */
    readonly truncated: boolean;
}

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
    | {
        readonly ok: true;
        readonly messages: readonly BrowserSessionMessageEntry[];
        readonly nextAfterMessageId?: string;
        readonly throughMessageId?: string;
        readonly total: number;
    }
    | {
        readonly ok: false;
        readonly error: "message_range_invalid" | "goal_not_found";
    };

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
    | {
        readonly ok: true;
        readonly message: BrowserSessionMessageEntry;
        readonly nextOffset?: number;
    }
    | {
        readonly ok: false;
        readonly error: "message_not_found" | "goal_not_found";
    };

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
export interface BrowserCreateSessionCommand {
    /** 前端预生成的 Goal 稳定标识。 */
    readonly goalId: string;
    /** 首条输入的稳定身份。 */
    readonly inputId: string;
    /** 非空用户意图。 */
    readonly intent: string;
    /** 可选 Plan 模式。 */
    readonly mode?: "plan";
    /** 可选模型选择；省略时使用工作区默认选择。 */
    readonly modelId?: string;
}

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
    | {
        readonly ok: true;
        readonly existing: boolean;
        readonly goalId: string;
        readonly runId: string;
        readonly receipt: BrowserSessionInputReceipt;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_id_conflict"
            | "goal_busy"
            | "model_not_selectable"
            | "model_catalog_unavailable"
            | "profile_not_found"
            | "invalid_goal_input"
            | "goal_unreadable"
            | "service_shutting_down"
            | "create_failed";
    };
