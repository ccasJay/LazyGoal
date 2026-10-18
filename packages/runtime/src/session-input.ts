import { createHash } from "node:crypto";

import type { AskUserAnswer } from "../../model-contracts/src/index";
import type { Goal } from "./domain";

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
    | "queue_control";

/**
 * 交互回答提交的选项组合。
 *
 * @remarks 与当前等待的 `requestId` 一起提交；请求身份由会话输入携带。
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
    | { readonly kind: "cancel_ask_user" }
    | { readonly kind: "approve_task" }
    | { readonly kind: "feedback_task"; readonly feedback: string }
    | {
        readonly kind: "approve_action";
        readonly actionId: string;
        readonly scope?: "action" | "goal" | "workspace";
    }
    | { readonly kind: "reject_action"; readonly actionId: string; readonly reason: string };

/**
 * 宿主提交给单个 Goal 会话的稳定输入。
 *
 * @remarks
 * 每项都携带 Goal 内稳定 `inputId`；相同身份与规范化载荷重试返回原收据。
 * 普通 `message` 面向 Goal 的后续队列；`steer`、`interrupt`、`respond` 与
 * `resume` 必须携带目标 `runId`；`queue_control` 携带被观察到的队列修订。
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
    }
    | {
        readonly kind: "queue_control";
        readonly inputId: string;
        readonly action: "continue" | "clear";
        readonly queueRevision: number;
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
    | "QUEUE_FULL"
    | "QUEUE_TEXT_TOO_LARGE"
    | "TEXT_TOO_LARGE"
    | "QUEUE_NOT_PAUSED"
    | "QUEUE_REVISION_MISMATCH"
    | "RUN_NOT_FOUND"
    | "RUN_NOT_RUNNING"
    | "RUN_CONTROL_UNAVAILABLE";

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

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, child]) => child !== undefined)
                .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([key, child]) => [key, canonicalize(child)]),
        );
    }
    return value;
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
    const canonical = JSON.stringify(canonicalize(payload));
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
            if (input.response.kind === "feedback_task" && input.response.feedback.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "Task feedback must not be empty" };
            }
            if (input.response.kind === "reject_action" && input.response.reason.trim().length === 0) {
                return { code: "INVALID_INPUT", message: "Action rejection requires a reason" };
            }
            return undefined;
        }
        case "queue_control": {
            if (input.action !== "continue" && input.action !== "clear") {
                return { code: "INVALID_INPUT", message: "queue_control action must be continue or clear" };
            }
            if (!Number.isSafeInteger(input.queueRevision) || input.queueRevision < 0) {
                return { code: "INVALID_INPUT", message: "queue_control requires a non-negative queueRevision" };
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
