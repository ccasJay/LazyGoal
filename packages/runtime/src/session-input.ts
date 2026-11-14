import { createHash } from "node:crypto";

import { canonicalJson } from "../../contracts/src/index";
import type { AskUserAnswer } from "../../model-contracts/src/index";
import type { Goal, JsonValue, RunState } from "./domain";

/** 单条会话输入正文允许的最大 UTF-16 code unit 数。 */
export const MAX_SESSION_INPUT_TEXT_LENGTH = 64_000;

/** Goal 中待应用普通消息与 Steer 合计允许的最大项数。 */
export const MAX_PENDING_SESSION_INPUTS = 128;

/** Goal 中待应用普通消息与 Steer 正文合计允许的最大 UTF-16 code unit 数。 */
export const MAX_PENDING_SESSION_INPUT_TEXT_LENGTH = 1_048_576;

/** 输入去重键使用的规范化载荷摘要。 */
export type SessionInputDigest = `sha256:${string}`;

/** 会话输入种类。 */
export type SessionInputKind =
    | "message"
    | "steer"
    | "interrupt"
    | "respond"
    | "resume"
    | "queue_control"
    | "compact";

/**
 * 交互回答提交的响应分支。
 *
 * @remarks 与当前等待的 `requestId` 一起提交；请求身份由会话输入携带。
 * `answer_ask_user` 提交逐题答案，`reply_to_question` 以非空整体回复替代整份
 * 问卷，`skip_question` 提交“未回答并要求继续”的控制语义。三者互斥。
 *
 * @example
 * ```ts
 * const response: SessionInteractionResponse = {
 *   kind: "answer_ask_user",
 *   answers: [{ questionId: "q-1", optionIds: ["o-1"] }],
 * };
 * ```
 */
export type SessionInteractionResponse =
    | { readonly kind: "answer_ask_user"; readonly answers: readonly AskUserAnswer[] }
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
         * @remarks 提交必须携带预检返回的审阅引用；提交边界会重新计算最终参数与
         * 范围并比对，不一致时明确拒绝并要求重新审阅。
         */
        readonly kind: "approve_action_revision";
        readonly actionId: string;
        readonly input: JsonValue;
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
 * 宿主提交给单个 Goal 会话的稳定输入。
 *
 * @remarks
 * 每项都携带 Goal 内稳定 `inputId`；相同身份与规范化载荷重试返回原收据。
 * 普通 `message` 面向 Goal 的后续队列；`steer`、`interrupt`、`respond` 与
 * `resume` 必须携带目标 `runId`；`queue_control` 携带被观察到的队列修订。
 * `steer.queueBinding` 将同一已排队消息原子地转为当前 Run 的 Steer。
 * 正文只接受非空文本，会话不猜测隐含的消息种类。
 *
 * @example
 * ```ts
 * const input: SessionInput = { kind: "message", inputId: "input-1", content: "继续" };
 * ```
 */
export type SessionInput =
    | { readonly kind: "message"; readonly inputId: string; readonly content: string }
    | {
        readonly kind: "steer";
        readonly inputId: string;
        readonly runId: string;
        readonly content: string;
        /** 提供时将一条匹配修订的排队消息原子转为本 Steer。 */
        readonly queueBinding?: { readonly messageId: string; readonly queueRevision: number };
    }
    | { readonly kind: "interrupt"; readonly inputId: string; readonly runId: string }
    | {
        readonly kind: "respond";
        readonly inputId: string;
        readonly runId: string;
        readonly requestId: string;
        readonly response: SessionInteractionResponse;
    }
    | {
        readonly kind: "resume";
        readonly inputId: string;
        readonly runId: string;
        readonly commitRevision: number;
        /**
         * 解除 blocked 等待所需的显式文本。
         *
         * @remarks 仅当 Run 处于无问答／审批的 blocked 等待时使用；恢复不得代答，
         * 该文本会作为真实用户消息提交，成为继续执行的显式指令。
         */
        readonly content?: string | undefined;
    }
    | {
        readonly kind: "queue_control";
        readonly inputId: string;
        readonly action: "continue" | "clear" | "remove";
        readonly queueRevision: number;
        /** `remove` 时指定要删除的待处理消息。 */
        readonly messageId?: string;
    }
    | {
        readonly kind: "compact";
        readonly inputId: string;
        readonly runId: string;
    };

/** 目标 Run 明确的控制类输入；普通消息与队列控制不在此列。 */
export type SessionInputControl = Extract<
    SessionInput,
    { readonly kind: "steer" | "interrupt" | "respond" | "resume" }
>;

/** 输入账本中的受理状态。 */
export type SessionInputStatus = "pending" | "applied" | "cleared";

/**
 * Goal 输入账本中的一条稳定受理记录。
 *
 * @remarks
 * 记录只保存去重判定与追溯所需的字段，不复制真实对话正文；正文只保存在
 * 队列项、Run 内 Steer 记录或 Goal 消息中。`applied` 时给出唯一实际应用的
 * Run 与消息位置；`cleared` 只表示尚未应用即被显式清空。
 *
 * @example
 * ```ts
 * const record: SessionInputRecord = {
 *   inputId: "input-1",
 *   kind: "message",
 *   digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *   sequence: 1,
 *   status: "pending",
 *   admittedAtRevision: 3,
 * };
 * ```
 */
export interface SessionInputRecord {
    /** 首次调用方提供的稳定输入身份。 */
    readonly inputId: string;
    /** 输入种类；身份冲突判定的一部分。 */
    readonly kind: SessionInputKind;
    /** 规范化载荷摘要；身份冲突判定的一部分。 */
    readonly digest: SessionInputDigest;
    /** Goal 内单调递增的受理序号，从 1 开始。 */
    readonly sequence: number;
    /** 受理状态；同一身份不会回到更早的状态。 */
    readonly status: SessionInputStatus;
    /** 本次受理提交后的 Goal 提交修订。 */
    readonly admittedAtRevision: number;
    /** 控制类输入受理时的目标 Run。 */
    readonly targetRunId?: string | undefined;
    /** 已应用时的唯一实际 Run。 */
    readonly appliedRunId?: string | undefined;
    /** 已应用时在 `Goal.messages` 中的零基索引。 */
    readonly messageIndex?: number | undefined;
}

/**
 * 队列中尚未应用的普通消息。
 *
 * @example
 * ```ts
 * const item: SessionMessageQueueItem = { inputId: "input-2", content: "继续", sequence: 2 };
 * ```
 */
export interface SessionMessageQueueItem {
    /** 对应输入账本中的稳定身份。 */
    readonly inputId: string;
    /** 受理时保存的原文正文。 */
    readonly content: string;
    /** 该消息的受理序号。 */
    readonly sequence: number;
}

/** 队列暂停原因；区分执行失败与用户中断。 */
export type SessionQueuePauseReason = "run_failed" | "user_interrupt";

/**
 * Goal 的待处理普通消息队列及其修订与暂停状态。
 *
 * @remarks
 * 队列本身是 FIFO；每次有效变更（追加、应用、清空、暂停、继续）都推进
 * `revision`。暂停只约束后继 Run 启动，不阻止新消息追加到队尾。
 * Run 已结束且队列为空时，新消息受理同时解除暂停；已有积压消息须显式继续。
 *
 * @example
 * ```ts
 * const queue: SessionMessageQueue = { revision: 2, items: [] };
 * ```
 */
export interface SessionMessageQueue {
    /** 队列修订；每次有效变更递增。 */
    readonly revision: number;
    /** 尚未应用的普通消息，按受理顺序排列。 */
    readonly items: readonly SessionMessageQueueItem[];
    /** 暂停原因与关联 Run；省略表示队列未暂停。 */
    readonly pause?: {
        readonly reason: SessionQueuePauseReason;
        readonly runId: string;
    } | undefined;
}

/**
 * 一条已持久化输入的受理收据。
 *
 * @example
 * ```ts
 * const receipt: SessionInputReceipt = {
 *   goalId: "goal-1",
 *   inputId: "input-1",
 *   kind: "message",
 *   digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *   sequence: 1,
 *   status: "pending",
 *   admittedAtRevision: 1,
 * };
 * ```
 */
export interface SessionInputReceipt {
    /** 受理该输入的 Goal。 */
    readonly goalId: string;
    /** 输入身份。 */
    readonly inputId: string;
    /** 输入种类。 */
    readonly kind: SessionInputKind;
    /** 规范化载荷摘要。 */
    readonly digest: SessionInputDigest;
    /** 受理序号。 */
    readonly sequence: number;
    /** 当前受理状态。 */
    readonly status: SessionInputStatus;
    /** 受理提交后的 Goal 提交修订。 */
    readonly admittedAtRevision: number;
    /** 控制类输入的目标 Run。 */
    readonly targetRunId?: string | undefined;
    /** 已应用时的唯一实际 Run。 */
    readonly appliedRunId?: string | undefined;
    /** 已应用时的消息位置。 */
    readonly messageIndex?: number | undefined;
}

/** 输入受理与查询的稳定业务拒绝代码。 */
export type SessionInputRejectionCode =
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
    | "CONTEXT_COMPACTION_UNAVAILABLE";

/**
 * 输入受理的稳定结果。
 *
 * @remarks
 * `ok: true` 只表示输入及其收据已经提交；不表示消息已应用、工具已停止或
 * Run 已完成。业务拒绝不写入受理账本。
 *
 * @example
 * ```ts
 * const result = await admission.admit("goal-1", input);
 * if (result.ok) console.log(result.receipt.sequence);
 * ```
 */
export type SessionInputAdmissionResult =
    | { readonly ok: true; readonly existing: boolean; readonly receipt: SessionInputReceipt }
    | {
        readonly ok: false;
        readonly code: SessionInputRejectionCode;
        readonly message: string;
    };

/**
 * 按输入身份查询持久化收据的结果。
 *
 * @remarks `ok: false` 只用于明确失败；未找到使用 `found: false` 表达，读取
 * 故障不得伪装为不存在。
 *
 * @example
 * ```ts
 * const result = await admission.query("goal-1", "input-1");
 * if (result.ok && result.found) console.log(result.receipt.status);
 * ```
 */
export type SessionInputQueryResult =
    | { readonly ok: true; readonly found: false }
    | { readonly ok: true; readonly found: true; readonly receipt: SessionInputReceipt }
    | { readonly ok: false; readonly code: "GOAL_NOT_FOUND"; readonly message: string };

/**
 * 受理基础设施失败时抛出的类型化错误。
 *
 * @remarks
 * 抛出该错误表示调用方不能断言输入是否存在：保存可能已经发生而响应丢失。
 * 调用方必须使用原 `inputId` 查询收据或重试，不得生成新身份。
 *
 * @example
 * ```ts
 * try {
 *   await admission.admit("goal-1", input);
 * } catch (error) {
 *   if (error instanceof SessionInputAdmissionError) await admission.query(error.goalId, error.inputId);
 * }
 * ```
 */
export class SessionInputAdmissionError extends Error {
    readonly code = "SESSION_INPUT_ADMISSION_FAILED" as const;

    constructor(
        readonly goalId: string,
        readonly inputId: string,
        message: string,
        cause?: unknown,
    ) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = "SessionInputAdmissionError";
    }
}

/**
 * 计算输入去重键使用的规范化载荷摘要。
 *
 * @remarks
 * 摘要只覆盖有契约定义的种类与载荷字段；用户正文按原文参与计算，不做
 * 修剪或改写。相同身份与摘要重试视为同一输入。
 *
 * @param input - 任意一种会话输入。
 * @returns 稳定摘要；序列化结果与字段顺序无关。
 * @example
 * ```ts
 * const digest = computeSessionInputDigest({ kind: "message", inputId: "i-1", content: "继续" });
 * ```
 */
export function computeSessionInputDigest(input: SessionInput): SessionInputDigest {
    const { inputId: _inputId, ...payload } = input;
    const canonical = canonicalJson(payload);
    return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/**
 * 校验输入的身份与种类载荷形状。
 *
 * @param input - 待校验的会话输入。
 * @returns 非法时返回稳定拒绝；合法时返回 `undefined`。
 * @example
 * ```ts
 * const rejection = validateSessionInputShape(input);
 * ```
 */
export function validateSessionInputShape(
    input: SessionInput,
): { readonly code: SessionInputRejectionCode; readonly message: string } | undefined {
    if (typeof input.inputId !== "string" || input.inputId.trim().length === 0) {
        return { code: "INVALID_INPUT", message: "inputId must be a non-empty string" };
    }

    switch (input.kind) {
        case "message":
        case "steer": {
            if (typeof input.content !== "string" || input.content.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "Session input content must be non-empty text" };
            }
            if (input.content.length > MAX_SESSION_INPUT_TEXT_LENGTH) {
                return {
                    code: "TEXT_TOO_LARGE",
                    message: `Session input content exceeds ${MAX_SESSION_INPUT_TEXT_LENGTH} UTF-16 code units`,
                };
            }
            if (input.kind === "steer" && (typeof input.runId !== "string" || input.runId.trim().length === 0)) {
                return { code: "INVALID_INPUT", message: "Steer input requires a target runId" };
            }
            if (input.kind === "steer" && input.queueBinding !== undefined
                && (typeof input.queueBinding.messageId !== "string"
                    || input.queueBinding.messageId.trim().length === 0
                    || !Number.isSafeInteger(input.queueBinding.queueRevision)
                    || input.queueBinding.queueRevision < 0)) {
                return { code: "INVALID_INPUT", message: "Queued Steer requires a valid messageId and queueRevision" };
            }
            return undefined;
        }
        case "interrupt":
        case "resume": {
            if (typeof input.runId !== "string" || input.runId.trim().length === 0) {
                return { code: "INVALID_INPUT", message: `${input.kind} input requires a target runId` };
            }
            if (input.kind === "resume"
                && (!Number.isSafeInteger(input.commitRevision) || input.commitRevision < 0)) {
                return { code: "INVALID_INPUT", message: "resume input requires a non-negative commitRevision" };
            }
            return undefined;
        }
        case "respond": {
            if (typeof input.runId !== "string" || input.runId.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "respond input requires a target runId" };
            }
            if (typeof input.requestId !== "string" || input.requestId.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "respond input requires a requestId" };
            }
            if (input.response.kind === "reply_to_question") {
                if (typeof input.response.content !== "string" || input.response.content.trim().length === 0) {
                    return { code: "INVALID_INPUT", message: "Question reply must not be empty" };
                }
                if (input.response.content.length > MAX_SESSION_INPUT_TEXT_LENGTH) {
                    return {
                        code: "TEXT_TOO_LARGE",
                        message: `Question reply exceeds ${MAX_SESSION_INPUT_TEXT_LENGTH} UTF-16 code units`,
                    };
                }
            }
            if (input.response.kind === "feedback_task" && input.response.feedback.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "Task feedback must not be empty" };
            }
            if (input.response.kind === "reject_action" && input.response.reason.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "Action rejection requires a reason" };
            }
            if (input.response.kind === "approve_action_revision") {
                if (input.response.reviewRef.trim().length === 0) {
                    return { code: "INVALID_INPUT", message: "Approval revision requires a review reference" };
                }
                if (input.response.actionId.trim().length === 0) {
                    return { code: "INVALID_INPUT", message: "Approval revision requires an action identity" };
                }
            }
            if (
                (input.response.kind === "retry_unknown_action"
                    || input.response.kind === "decline_unknown_action_retry")
                && input.response.recoveryRef.trim().length === 0
            ) {
                return { code: "INVALID_INPUT", message: "A re-execution decision requires a recovery reference" };
            }
            if (
                input.response.kind === "decline_unknown_action_retry"
                && input.response.reason.trim().length === 0
            ) {
                return { code: "INVALID_INPUT", message: "Declining a re-execution requires a reason" };
            }
            return undefined;
        }
        case "queue_control": {
            if (input.action !== "continue" && input.action !== "clear" && input.action !== "remove") {
                return { code: "INVALID_INPUT", message: "queue_control action must be continue, clear, or remove" };
            }
            if (!Number.isSafeInteger(input.queueRevision) || input.queueRevision < 0) {
                return { code: "INVALID_INPUT", message: "queue_control requires a non-negative queueRevision" };
            }
            if (input.action === "remove" && (typeof input.messageId !== "string" || input.messageId.trim().length === 0)) {
                return { code: "INVALID_INPUT", message: "Removing a queued message requires a messageId" };
            }
            if (input.action !== "remove" && input.messageId !== undefined) {
                return { code: "INVALID_INPUT", message: "Only remove accepts a messageId" };
            }
            return undefined;
        }
        case "compact": {
            if (typeof input.runId !== "string" || input.runId.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "Compaction requires a target runId" };
            }
            return undefined;
        }
    }
}

/**
 * 统计 Goal 中待应用文本类输入的当前占用。
 *
 * @remarks
 * 只统计尚未应用的普通消息与 Steer；已应用、已清空项和不受额度约束的控制
 * 输入不计入。
 *
 * @param goal - 当前 Goal 快照。
 * @returns 待应用项数与正文的 UTF-16 code unit 合计。
 * @example
 * ```ts
 * const usage = measurePendingInputUsage(goal);
 * ```
 */
export function measurePendingInputUsage(
    goal: Goal,
): { readonly items: number; readonly textLength: number } {
    const queueItems = goal.state.messageQueue?.items ?? [];
    const pendingSteers = (goal.state.run.steerInputs ?? [])
        .filter((input): input is { readonly messageId: string; readonly status: "pending"; readonly content: string } =>
            input.status === "pending");
    return {
        items: queueItems.length + pendingSteers.length,
        textLength: queueItems.reduce((total, item) => total + item.content.length, 0)
            + pendingSteers.reduce((total, input) => total + input.content.length, 0),
    };
}

/**
 * 判断 Goal 是否仍有尚未消费的会话输入。
 *
 * @remarks
 * 待处理包括消息队列中未应用的普通消息，以及账本中仍为 `pending` 的任何
 * 输入。终态 Goal 的归档与删除必须据此拒绝，不得自动丢弃已受理工作。
 *
 * @param goal - 当前 Goal 快照。
 * @returns 仍有未消费输入时为 `true`。
 * @example
 * ```ts
 * if (hasPendingSessionInputs(goal)) return "goal_has_pending_inputs";
 * ```
 */
export function hasPendingSessionInputs(goal: Goal): boolean {
    if ((goal.state.messageQueue?.items.length ?? 0) > 0) return true;
    return (goal.state.inputLedger ?? []).some((record) => record.status === "pending");
}

/**
 * 判断 Goal 是否仍有未完成结算的会话工作。
 *
 * @remarks
 * 除未消费输入外，还包括未结算的用户中断与结果未知的 Action。只有这些工作
 * 都已明确处理或清空后，才允许归档或删除终态 Goal。
 *
 * @param goal - 当前 Goal 快照。
 * @returns 仍有未结算工作时为 `true`。
 * @example
 * ```ts
 * if (hasUnsettledSessionWork(goal)) return "goal_has_pending_inputs";
 * ```
 */
export function hasUnsettledSessionWork(goal: Goal): boolean {
    if (hasPendingSessionInputs(goal)) return true;
    const run = goal.state.run;
    if (run.interruption !== undefined && run.interruption.status !== "finished") return true;
    if (run.pendingAction?.status === "outcome_unknown") return true;
    return false;
}

/**
 * 在输入账本中查询指定输入身份。
 *
 * @param goal - 当前 Goal 快照。
 * @param inputId - 输入身份。
 * @returns 已受理记录；不存在时返回 `undefined`。
 * @example
 * ```ts
 * const record = findSessionInputRecord(goal, "input-1");
 * ```
 */
export function findSessionInputRecord(
    goal: Goal,
    inputId: string,
): SessionInputRecord | undefined {
    return (goal.state.inputLedger ?? []).find((record) => record.inputId === inputId);
}

/** 从账本记录构造稳定收据。 */
export function toSessionInputReceipt(
    goalId: string,
    record: SessionInputRecord,
): SessionInputReceipt {
    return {
        goalId,
        inputId: record.inputId,
        kind: record.kind,
        digest: record.digest,
        sequence: record.sequence,
        status: record.status,
        admittedAtRevision: record.admittedAtRevision,
        ...(record.targetRunId === undefined ? {} : { targetRunId: record.targetRunId }),
        ...(record.appliedRunId === undefined ? {} : { appliedRunId: record.appliedRunId }),
        ...(record.messageIndex === undefined ? {} : { messageIndex: record.messageIndex }),
    };
}

/** 下一受理序号；Goal 内单调递增且与账本长度解耦。 */
export function nextSessionInputSequence(goal: Goal): number {
    const ledger = goal.state.inputLedger ?? [];
    return ledger.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1;
}

/**
 * 将指定的待处理账本记录标记为已应用。
 *
 * @remarks
 * 只转换匹配身份且仍为 `pending` 的记录；已结束状态和缺少收据的旧执行路径保持
 * 不变。消息位置只在实际应用正文时提供。
 *
 * @param ledger - 当前输入账本；省略时仍返回 `undefined`。
 * @param applications - 实际应用的输入身份、Run 与可选消息位置。
 * @returns 更新后的账本副本；未匹配记录保持原样。
 * @example
 * ```ts
 * const ledger = applyPendingSessionInputs(goal.state.inputLedger, [
 *   { inputId: "input-1", appliedRunId: "run-2", messageIndex: 4 },
 * ]);
 * ```
 */
export function applyPendingSessionInputs(
    ledger: readonly SessionInputRecord[] | undefined,
    applications: readonly {
        readonly inputId: string;
        readonly appliedRunId: string;
        readonly messageIndex?: number;
    }[],
): readonly SessionInputRecord[] | undefined {
    if (ledger === undefined || applications.length === 0) return ledger;
    const byInputId = new Map(applications.map((application) => [application.inputId, application]));
    return ledger.map((record) => {
        const application = byInputId.get(record.inputId);
        if (record.status !== "pending" || application === undefined) return record;
        return {
            ...record,
            status: "applied",
            appliedRunId: application.appliedRunId,
            ...(application.messageIndex === undefined ? {} : { messageIndex: application.messageIndex }),
        };
    });
}

/**
 * 将指定的待处理账本记录标记为已清除。
 *
 * @remarks
 * 只转换调用方明确列出的 pending 身份；不移除收据，也不改变已应用或已清除记录。
 *
 * @param ledger - 当前输入账本；省略时仍返回 `undefined`。
 * @param inputIds - 已从对应队列或执行来源中清除的输入身份。
 * @returns 更新后的账本副本；未匹配记录保持原样。
 * @example
 * ```ts
 * const ledger = clearPendingSessionInputs(goal.state.inputLedger, new Set(["input-1"]));
 * ```
 */
export function clearPendingSessionInputs(
    ledger: readonly SessionInputRecord[] | undefined,
    inputIds: ReadonlySet<string>,
): readonly SessionInputRecord[] | undefined {
    if (ledger === undefined || inputIds.size === 0) return ledger;
    return ledger.map((record) => record.status === "pending" && inputIds.has(record.inputId)
        ? { ...record, status: "cleared" }
        : record);
}

/**
 * 追加一条待应用普通消息并推进队列修订。
 *
 * @param queue - 当前队列；省略时按空队列处理。
 * @param item - 新追加的消息。
 * @returns 更新后的队列；原对象不被修改。
 * @example
 * ```ts
 * const queue = appendQueuedMessage(goal.state.messageQueue, item);
 * ```
 */
export function appendQueuedMessage(
    queue: SessionMessageQueue | undefined,
    item: SessionMessageQueueItem,
): SessionMessageQueue {
    const current: SessionMessageQueue = queue ?? { revision: 0, items: [] };
    return {
        revision: current.revision + 1,
        items: [...current.items, item],
        ...(current.pause === undefined ? {} : { pause: current.pause }),
    };
}

function removeQueuedItemAt(
    queue: SessionMessageQueue,
    index: number,
): { readonly item: SessionMessageQueueItem; readonly queue: SessionMessageQueue } {
    const item = queue.items[index]!;
    return {
        item,
        queue: {
            revision: queue.revision + 1,
            items: [...queue.items.slice(0, index), ...queue.items.slice(index + 1)],
            ...(queue.pause === undefined ? {} : { pause: queue.pause }),
        },
    };
}

/**
 * 按输入身份删除一条待处理普通消息并推进队列修订。
 *
 * @param queue - 当前队列；省略时表示没有可删除项。
 * @param inputId - 要删除的消息身份。
 * @returns 被删除的队列项及更新队列；未找到时返回 `undefined`。
 * @example
 * ```ts
 * const removal = removeQueuedMessage(goal.state.messageQueue, "input-1");
 * ```
 */
export function removeQueuedMessage(
    queue: SessionMessageQueue | undefined,
    inputId: string,
): { readonly item: SessionMessageQueueItem; readonly queue: SessionMessageQueue } | undefined {
    if (queue === undefined) return undefined;
    const index = queue.items.findIndex((item) => item.inputId === inputId);
    return index < 0 ? undefined : removeQueuedItemAt(queue, index);
}

/**
 * 仅当预期身份仍是队首时将其出队并推进队列修订。
 *
 * @param queue - 当前队列；省略时表示没有可出队项。
 * @param expectedInputId - 本次消费所绑定的队首身份。
 * @returns 被消费的队首项及更新队列；队首失配时返回 `undefined`。
 * @example
 * ```ts
 * const dequeued = dequeueQueuedMessage(goal.state.messageQueue, "input-1");
 * ```
 */
export function dequeueQueuedMessage(
    queue: SessionMessageQueue | undefined,
    expectedInputId: string,
): { readonly item: SessionMessageQueueItem; readonly queue: SessionMessageQueue } | undefined {
    if (queue?.items[0]?.inputId !== expectedInputId) return undefined;
    return removeQueuedItemAt(queue, 0);
}

/**
 * 清空尚未应用的普通消息并推进队列修订。
 *
 * @param queue - 当前队列。
 * @returns 更新后的空队列；暂停状态保留。
 * @example
 * ```ts
 * const cleared = clearQueuedMessages(goal.state.messageQueue);
 * ```
 */
export function clearQueuedMessages(
    queue: SessionMessageQueue | undefined,
): SessionMessageQueue {
    const current: SessionMessageQueue = queue ?? { revision: 0, items: [] };
    return {
        revision: current.revision + 1,
        items: [],
        ...(current.pause === undefined ? {} : { pause: current.pause }),
    };
}

/**
 * 设置或更新队列暂停状态并推进队列修订。
 *
 * @param queue - 当前队列。
 * @param pause - 暂停原因与关联 Run。
 * @returns 更新后的队列；已处于相同暂停时返回原对象。
 * @example
 * ```ts
 * const paused = withQueuePause(queue, { reason: "user_interrupt", runId: "run-1" });
 * ```
 */
export function withQueuePause(
    queue: SessionMessageQueue | undefined,
    pause: { readonly reason: SessionQueuePauseReason; readonly runId: string },
): SessionMessageQueue {
    const current: SessionMessageQueue = queue ?? { revision: 0, items: [] };
    if (current.pause?.reason === pause.reason && current.pause.runId === pause.runId) {
        return current;
    }
    return { revision: current.revision + 1, items: [...current.items], pause };
}

/**
 * 解除队列暂停并推进队列修订。
 *
 * @param queue - 当前队列。
 * @returns 更新后的队列；原本未暂停时返回原对象。
 * @example
 * ```ts
 * const resumed = withoutQueuePause(queue);
 * ```
 */
export function withoutQueuePause(queue: SessionMessageQueue | undefined): SessionMessageQueue {
    const current: SessionMessageQueue = queue ?? { revision: 0, items: [] };
    if (current.pause === undefined) return current;
    return { revision: current.revision + 1, items: [...current.items] };
}

/**
 * 在失败或取消的 Run 结束时记录队列暂停。
 *
 * @remarks
 * 仅处理 `failed`／`cancelled` 且尚未暂停的状态；即使队列为空也保留暂停事实，
 * 以便后续新消息按既有生命周期解除暂停。已有暂停原因优先保留；Run 带有
 * Interrupt 记录时原因是 `user_interrupt`，否则为 `run_failed`。
 *
 * @param queue - 最新的普通消息队列；省略时按空队列处理。
 * @param run - 已提交的终态 Run。
 * @returns 终态对应的暂停队列；非终态或已有暂停时返回原队列。
 * @example
 * ```ts
 * const queue = pauseQueuedMessagesForTerminalRun(goal.state.messageQueue, goal.state.run);
 * ```
 */
export function pauseQueuedMessagesForTerminalRun(
    queue: SessionMessageQueue | undefined,
    run: Pick<RunState, "id" | "status" | "interruption">,
): SessionMessageQueue | undefined {
    if (
        (run.status !== "failed" && run.status !== "cancelled")
        || queue?.pause !== undefined
    ) {
        return queue;
    }
    return withQueuePause(queue, {
        reason: run.interruption === undefined ? "run_failed" : "user_interrupt",
        runId: run.id,
    });
}
