import { isRecord } from "../../contracts/src/index";
import type { ExecutionStreamEvent } from "../../execution-stream/src/index";
import type { GoalSessionState } from "./session";
import type { SessionInputOutcome } from "./session-stream";

/**
 * 会话输入结果的实时事件类型名。
 *
 * @remarks
 * 该类型名由会话受理路径发布，Stream Core 不解释其业务含义；会话输出层据此把
 * 它还原为类型化的输入结果，而不是让消费者猜测任意 payload。
 *
 * @example
 * ```ts
 * if (event.kind === SESSION_INPUT_RESULT_KIND) console.log(event.kind);
 * ```
 */
export const SESSION_INPUT_RESULT_KIND = "session_input_result" as const;

/**
 * 单条公开正文增量的最大长度（UTF-16 code unit）。
 *
 * @remarks
 * 超长正文只截断公开投影，不取消生成，也不改写已保存的完整正文。
 *
 * @example
 * ```ts
 * const text = raw.slice(0, MAX_LIVE_TEXT_LENGTH);
 * ```
 */
export const MAX_LIVE_TEXT_LENGTH = 2_000;

/**
 * 会话输出的来源信封。
 *
 * @remarks
 * 每条实时输出都携带真实 Goal、来源 Run、来源事件身份与实时 cursor；实时 cursor
 * 只在当前 Publisher 生命周期内排序，不充当持久化提交修订。
 *
 * @example
 * ```ts
 * const source: SessionEventSource = {
 *   goalId: "goal-1", runId: "run-1", eventId: "event-1", cursor: 1, occurredAt: "2026-01-01T00:00:00.000Z",
 * };
 * ```
 */
export interface SessionEventSource {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 产生该输出的 Run 稳定标识。 */
    readonly runId: string;
    /** 来源事件标识；与 Trajectory 标识空间分离。 */
    readonly eventId: string;
    /** 来源实时游标；只在该实时来源内排序。 */
    readonly cursor: number;
    /** 来源事件时间戳。 */
    readonly occurredAt: string;
    /**
     * 来源事件对应的提交边界。
     *
     * @remarks
     * `checkpoint` 表示该来源事件已经随 Snapshot 提交落盘：公开投影据此要求
     * 消费者按最新快照核对，而不把已提交事实当作实时增量重复呈现。
     */
    readonly durability: "live" | "trajectory" | "checkpoint";
}

/**
 * 公开活动分组边界的原因分类。
 *
 * @remarks
 * 边界表示“此处发生了一次需要分区呈现的状态变化”，不携带正文；未知来源事件也
 * 报告为 `unknown`，不会被静默丢弃。
 *
 * @example
 * ```ts
 * const reason: SessionActivityBoundaryReason = "user_wait";
 * ```
 */
export type SessionActivityBoundaryReason =
    | "assistant_reply"
    | "user_wait"
    | "stage_change"
    | "terminal"
    | "failure"
    | "unknown";

/**
 * 公开生成内容事件。
 *
 * @remarks
 * 只包含公开正文与生成阶段事实；reasoning、结构化协议 JSON 与工具参数不进入
 * 该联合。
 *
 * @example
 * ```ts
 * const event: SessionGenerationEvent = { kind: "text_delta", source, text: "先检查配置" };
 * ```
 */
export type SessionGenerationEvent =
    | {
        readonly kind: "model_call_started";
        readonly source: SessionEventSource;
        /** 调用公开的协议阶段，不是工作流 Stage 或隐藏推理；发布方未提供时省略。 */
        readonly stage?: "think" | "decide" | "completion_review";
        /** 发布方提供的模型调用身份；只用于观察与详情关联。 */
        readonly modelCallId?: string;
        /** 该调用所属的真实执行单元，缺失时不推断。 */
        readonly executionUnitId?: string;
    }
    | { readonly kind: "model_call_completed"; readonly source: SessionEventSource }
    | { readonly kind: "step_started"; readonly source: SessionEventSource }
    | {
        readonly kind: "text_delta";
        readonly source: SessionEventSource;
        readonly text: string;
        readonly truncated: boolean;
    }
    | { readonly kind: "reply"; readonly source: SessionEventSource }
    | {
        readonly kind: "candidate_preview";
        readonly source: SessionEventSource;
        readonly candidateId: string;
        readonly text: string;
        /**
         * 本次正文在候选完整正文中的起始位置。
         *
         * @remarks
         * 位置非零表示本次只提供了候选的后半段：消费者据此识别缺失前缀，不得
         * 把后半段当作从头生成的完整回答。
         */
        readonly startOffset: number;
        readonly truncated: boolean;
        readonly complete: boolean;
    }
    | {
        readonly kind: "candidate_invalidated";
        readonly source: SessionEventSource;
        readonly candidateId: string;
        readonly reason: "rejected" | "cancelled" | "failed" | "replaced" | "ambiguous";
    };

/**
 * 工具活动事件。
 *
 * @remarks
 * 区分实时返回与已提交事实：只有 Runtime／Tool 已经发布的事实才出现该事件；
 * 私有原始 Observation 与工具参数不进入公开信封。
 *
 * @example
 * ```ts
 * const event: SessionToolActivityEvent = {
 *   kind: "started", source, actionId: "action-1", executionUnitId: "unit-1", toolId: "read_file",
 * };
 * ```
 */
export type SessionToolActivityEvent =
    | {
        readonly kind: "started";
        readonly source: SessionEventSource;
        readonly actionId: string;
        readonly executionUnitId: string;
        readonly toolId: string;
        readonly inputSummary?: string | undefined;
    }
    | {
        readonly kind: "attempt_started";
        readonly source: SessionEventSource;
        readonly actionId: string;
        readonly attempt: number;
    }
    | {
        readonly kind: "attempt_failed";
        readonly source: SessionEventSource;
        readonly actionId: string;
        readonly attempt: number;
        readonly reason: string;
    }
    | {
        readonly kind: "finished";
        readonly source: SessionEventSource;
        readonly actionId: string;
        readonly toolId: string;
        readonly outcome: "success" | "failure";
        readonly summary?: string | undefined;
    };

/**
 * 人工交互事件。
 *
 * @remarks
 * 交互请求来自已提交等待，不是模型参数；正文与可用决定由 human-interaction 的
 * 规范视图提供，本事件只携带身份与种类。
 *
 * @example
 * ```ts
 * const event: SessionInteractionEvent = {
 *   kind: "required", source, interactionKind: "action_approval", interactionId: "action_approval:act-1",
 * };
 * ```
 */
export interface SessionInteractionEvent {
    /** 等待建立或结算。 */
    readonly kind: "required" | "settled";
    /** 来源信封。 */
    readonly source: SessionEventSource;
    /** 等待种类。 */
    readonly interactionKind: "ask_user" | "task_approval" | "action_approval" | "action_recovery";
    /** 规范交互引用；同一等待在重连后保持不变。 */
    readonly interactionId: string;
    /** 等待所属 Run。 */
    readonly runId: string;
}

/**
 * Run 运行状态事件。
 *
 * @remarks
 * 只表达运行、等待与阶段变化；真实终态由 {@link SessionRunResultEvent} 表达。
 *
 * @example
 * ```ts
 * const event: SessionRunStatusEvent = { kind: "waiting", source };
 * ```
 */
export type SessionRunStatusEvent =
    | { readonly kind: "waiting"; readonly source: SessionEventSource }
    | { readonly kind: "stage_changed"; readonly source: SessionEventSource }
    | { readonly kind: "failure"; readonly source: SessionEventSource }
    | { readonly kind: "unknown"; readonly source: SessionEventSource };

/**
 * Run 终态结果事件。
 *
 * @remarks
 * 只有 Run 真正 completed、failed 或 cancelled 时才出现；Run 身份是该终态的
 * 稳定结算键，重复发布按 Run 归并。
 *
 * @example
 * ```ts
 * const event: SessionRunResultEvent = { kind: "completed", source };
 * ```
 */
export interface SessionRunResultEvent {
    /** 终态分类。 */
    readonly kind: "completed" | "failed" | "cancelled";
    /** 来源信封。 */
    readonly source: SessionEventSource;
    /** 结算 Run 身份。 */
    readonly runId: string;
}

/**
 * 已保存正式消息的通知。
 *
 * @remarks
 * 只在消息保存成功后发布，携带稳定 `messageId`、Run 内位置、来源、用途与所属提交修订；
 * 重复通知按 `messageId` 归并，不追加第二份正文。
 *
 * @example
 * ```ts
 * const event: SessionMessageCommittedEvent = {
 *   source, messageId: "msg-1", role: "assistant", runId: "run-1",
 *   position: { afterSequence: 8, order: 0 }, purpose: "answer", commitRevision: 7,
 * };
 * ```
 */
export interface SessionMessageCommittedEvent {
    /** 来源信封。 */
    readonly source: SessionEventSource;
    /** 已保存消息的稳定身份。 */
    readonly messageId: string;
    /** 消息角色。 */
    readonly role: "user" | "assistant";
    /** 助手消息用途；用户消息省略。 */
    readonly purpose?: "process" | "answer" | "notice" | undefined;
    /** 消息所属 Run。 */
    readonly runId: string;
    /** 消息在所属 Run 已提交事实流中的稳定位置。 */
    readonly position: import("./domain").GoalMessagePosition;
    /** 保存该消息时的 Goal 提交修订。 */
    readonly commitRevision: number;
    /** 被该正式消息替换的预览身份；没有预览时省略。 */
    readonly previewId?: string | undefined;
}

/**
 * 流故障事件。
 *
 * @remarks
 * 表达缺口、背压或读取故障，需要重新核对；它不是 Run 失败，也不撤销真实提交。
 *
 * @example
 * ```ts
 * const event: SessionStreamFaultEvent = { kind: "gap", source };
 * ```
 */
export type SessionStreamFaultEvent =
    | { readonly kind: "gap"; readonly source: SessionEventSource }
    | { readonly kind: "read_failed"; readonly message: string };

/**
 * 已提交边界事件。
 *
 * @remarks
 * 表示一次 Snapshot 提交边界已经落盘；消费者据此重新核对消息范围与状态，
 * 不把该事件当作正式消息本身。
 *
 * @example
 * ```ts
 * const event: SessionCommitBoundaryEvent = { source, commitRevision: 7 };
 * ```
 */
export interface SessionCommitBoundaryEvent {
    /** 来源信封。 */
    readonly source: SessionEventSource;
    /**
     * 本次提交边界包含的来源事件类型。
     *
     * @remarks
     * `step_committed` 报告整批已提交事件的类型；其它边界只报告其自身类型。
     * 消费者据此推导实际变化范围，不需要读取 Trajectory 或按事件顺序猜测。
     */
    readonly eventTypes: readonly string[];
    /** 该提交边界的 Goal 提交修订；来源未提供时省略。 */
    readonly commitRevision?: number | undefined;
}

/**
 * 会话输出事件联合。
 *
 * @remarks
 * 每个成员都是可辨识判别式，消费者按 `type` 分派即可，不需要猜测任意
 * `kind: string` 或未知 payload。`state_sync` 是一致快照，`input_result` 关联
 * `inputId`，其余成员分别表达公开生成、正式消息、工具活动、人工交互、Run 状态、
 * Run 终态、流故障与提交边界。
 *
 * @example
 * ```ts
 * const event: SessionOutputEvent = { type: "state_sync", state };
 * ```
 */
export type SessionOutputEvent =
    | { readonly type: "state_sync"; readonly state: GoalSessionState }
    | { readonly type: "input_result"; readonly outcome: SessionInputOutcome }
    | { readonly type: "generation_event"; readonly event: SessionGenerationEvent }
    | { readonly type: "message_committed"; readonly event: SessionMessageCommittedEvent }
    | { readonly type: "tool_activity"; readonly event: SessionToolActivityEvent }
    | { readonly type: "interaction_required"; readonly event: SessionInteractionEvent }
    | { readonly type: "interaction_settled"; readonly event: SessionInteractionEvent }
    | { readonly type: "run_status"; readonly event: SessionRunStatusEvent }
    | { readonly type: "run_result"; readonly event: SessionRunResultEvent }
    | { readonly type: "stream_fault"; readonly event: SessionStreamFaultEvent }
    | { readonly type: "commit_boundary"; readonly event: SessionCommitBoundaryEvent }
    | { readonly type: "closed"; readonly reason: "backpressure" | "closed" | "publisher_closed" };

/** 不产生任何公开输出的实时事件类型。 */
const NON_PUBLIC_EVENT_KINDS: ReadonlySet<string> = new Set([
    "model_block_started",
    "model_failed",
    "model_cancelled",
    "model_response_received",
    "model_context_frame",
    "think_requested",
    "think_completed",
    "model_repair_attempt_started",
    "model_repair_feedback_recorded",
    "model_request_retry_recorded",
    "action_staged",
    "action_approved",
    "action_revised",
    "action_reexecution_authorized",
    "action_recovered",
    "observation_recorded",
    "state_committed",
    "memory_patch_accepted",
    "context_lookup_requested",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
]);

/**
 * 把一条实时执行事件分类为类型化会话输出。
 *
 * @remarks
 * 分类只依据来源事件自身的事实：可见性过滤由订阅策略负责，私密事件不进入
 * 公开信封。返回 `undefined` 表示该来源事件不产生任何公开输出。
 *
 * @param event - 来源实时事件。
 * @returns 类型化会话输出；该事件不公开时返回 `undefined`。
 * @example
 * ```ts
 * const output = classifySessionStreamEvent(event);
 * ```
 */
export function classifySessionStreamEvent(event: ExecutionStreamEvent): SessionOutputEvent | undefined {
    if (event.kind === SESSION_INPUT_RESULT_KIND) {
        const outcome = readInputOutcome(event.payload);
        return outcome === undefined ? undefined : { type: "input_result", outcome };
    }
    if (event.kind === "live_gap") {
        return { type: "stream_fault", event: { kind: "gap", source: toSource(event) } };
    }
    if (event.kind === "message_committed") {
        const committed = readMessageCommitted(event);
        return committed === undefined ? undefined : { type: "message_committed", event: committed };
    }
    if (event.kind === "candidate_preview") {
        const preview = readCandidatePreview(event);
        return preview === undefined ? undefined : { type: "generation_event", event: preview };
    }
    if (event.kind === "candidate_invalidated") {
        const invalidated = readCandidateInvalidation(event);
        return invalidated === undefined ? undefined : { type: "generation_event", event: invalidated };
    }
    if (event.kind === "step_committed") {
        return { type: "commit_boundary", event: readCommitBoundary(event) };
    }
    const classified = classifySemanticEvent(event);
    if (classified !== undefined) return classified;
    // 已随 Snapshot 落盘但没有公开语义的事件仍然是一次提交边界：消费者据此
    // 重新核对，不把它当作实时增量。
    if (event.durability === "checkpoint") {
        return { type: "commit_boundary", event: readCommitBoundary(event) };
    }
    return undefined;
}

function classifySemanticEvent(event: ExecutionStreamEvent): SessionOutputEvent | undefined {
    if (NON_PUBLIC_EVENT_KINDS.has(event.kind)) return undefined;
    const source = toSource(event);
    switch (event.kind) {
        case "model_started":
            return { type: "generation_event", event: { kind: "model_call_started", source, ...readModelProgress(event) } };
        case "model_completed":
            return { type: "generation_event", event: { kind: "model_call_completed", source } };
        case "step_started":
            return { type: "generation_event", event: { kind: "step_started", source } };
        case "model_block_delta": {
            const delta = readTextDelta(event.payload);
            if (delta === undefined) return undefined;
            return {
                type: "generation_event",
                event: { kind: "text_delta", source, text: delta.text, truncated: delta.truncated },
            };
        }
        case "model_block_completed": {
            const whole = readWholeText(event.payload);
            if (whole === undefined) return undefined;
            return {
                type: "generation_event",
                event: { kind: "text_delta", source, text: whole.text, truncated: whole.truncated },
            };
        }
        case "decision_received":
            if (isToolCallDecision(event.payload)) return undefined;
            return { type: "generation_event", event: { kind: "reply", source } };
        case "tool_started": {
            if (event.actionId === undefined || event.executionUnitId === undefined) return undefined;
            if (!isRecord(event.payload) || typeof event.payload.toolId !== "string") return undefined;
            const inputSummary = projectSafeToolInputSummary(event.payload.toolId, event.payload.input);
            return {
                type: "tool_activity",
                event: {
                    kind: "started",
                    source,
                    actionId: event.actionId,
                    executionUnitId: event.executionUnitId,
                    toolId: event.payload.toolId,
                    ...(inputSummary === undefined ? {} : { inputSummary }),
                },
            };
        }
        case "tool_finished": {
            if (event.actionId === undefined) return undefined;
            if (!isRecord(event.payload) || typeof event.payload.toolId !== "string") return undefined;
            if (!isRecord(event.payload.observation)) return undefined;
            const observation = event.payload.observation;
            const outcome = observation.kind === "failure"
                ? "failure"
                : observation.kind === "success" ? "success" : undefined;
            if (outcome === undefined) return undefined;
            const summary = outcome === "failure" && typeof observation.message === "string"
                ? observation.message
                : typeof observation.summary === "string" ? observation.summary : undefined;
            return {
                type: "tool_activity",
                event: {
                    kind: "finished",
                    source,
                    actionId: event.actionId,
                    toolId: event.payload.toolId,
                    outcome,
                    ...(summary === undefined ? {} : { summary: summary.slice(0, 500) }),
                },
            };
        }
        case "tool_attempt_started": {
            if (event.actionId === undefined) return undefined;
            if (!isRecord(event.payload) || !Number.isSafeInteger(event.payload.attempt)) return undefined;
            return {
                type: "tool_activity",
                event: {
                    kind: "attempt_started",
                    source,
                    actionId: event.actionId,
                    attempt: Number(event.payload.attempt),
                },
            };
        }
        case "tool_attempt_failed": {
            if (event.actionId === undefined) return undefined;
            if (!isRecord(event.payload)
                || !Number.isSafeInteger(event.payload.attempt)
                || typeof event.payload.reason !== "string") return undefined;
            return {
                type: "tool_activity",
                event: {
                    kind: "attempt_failed",
                    source,
                    actionId: event.actionId,
                    attempt: Number(event.payload.attempt),
                    reason: event.payload.reason.slice(0, 160),
                },
            };
        }
        case "run_waiting":
            return { type: "run_status", event: { kind: "waiting", source } };
        case "run_stage_declared":
        case "run_stage_accepted":
        case "run_stage_rejected":
        case "run_plan_route_revised":
            return { type: "run_status", event: { kind: "stage_changed", source } };
        case "execution_error":
        case "action_rejected":
            return { type: "run_status", event: { kind: "failure", source } };
        case "run_completed":
            return { type: "run_result", event: { kind: "completed", source, runId: event.runId } };
        case "run_failed":
            return { type: "run_result", event: { kind: "failed", source, runId: event.runId } };
        case "run_cancelled":
            return { type: "run_result", event: { kind: "cancelled", source, runId: event.runId } };
        case "task_approved":
        case "task_feedback_received":
            return {
                type: "interaction_settled",
                event: {
                    kind: "settled",
                    source,
                    interactionKind: "task_approval",
                    interactionId: `task_approval:${readRequestId(event.payload) ?? event.runId}`,
                    runId: event.runId,
                },
            };
        case "ask_user_answered":
        case "ask_user_replied":
        case "ask_user_skipped":
            return {
                type: "interaction_settled",
                event: {
                    kind: "settled",
                    source,
                    interactionKind: "ask_user",
                    interactionId: `question:${readRequestId(event.payload) ?? event.runId}`,
                    runId: event.runId,
                },
            };
        default:
            return { type: "run_status", event: { kind: "unknown", source } };
    }
}

function readModelProgress(event: ExecutionStreamEvent): Pick<Extract<SessionGenerationEvent, { kind: "model_call_started" }>, "stage" | "modelCallId" | "executionUnitId"> {
    const payload = event.payload;
    if (!isRecord(payload)) return {};
    const stage = payload.stage;
    return {
        ...(stage === "think" || stage === "decide" || stage === "completion_review" ? { stage } : {}),
        ...(typeof payload.modelCallId === "string" ? { modelCallId: payload.modelCallId.slice(0, 200) } : {}),
        ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
    };
}

/**
 * 读取会话状态投影中的等待交互引用。
 *
 * @param state - 最新安全会话状态。
 * @returns 当前等待的规范引用；没有等待时返回 `undefined`。
 * @example
 * ```ts
 * const pending = readPendingInteraction(state);
 * ```
 */
export function readPendingInteraction(
    state: GoalSessionState,
): { readonly interactionKind: SessionInteractionEvent["interactionKind"]; readonly interactionId: string } | undefined {
    if (state.waitingFor === undefined) return undefined;
    if (state.interaction === undefined) return undefined;
    return {
        interactionKind: state.interaction.kind === "question" ? "ask_user" : state.interaction.kind,
        interactionId: state.interaction.interactionId,
    };
}

function toSource(event: ExecutionStreamEvent): SessionEventSource {
    return {
        goalId: event.goalId,
        runId: event.runId,
        eventId: event.eventId,
        cursor: event.cursor,
        occurredAt: event.occurredAt,
        durability: event.durability,
    };
}

function readCommitBoundary(event: ExecutionStreamEvent): SessionCommitBoundaryEvent {
    const revision = readCommitRevision(event.payload);
    return {
        source: toSource(event),
        eventTypes: readCommittedEventTypes(event),
        ...(revision === undefined ? {} : { commitRevision: revision }),
    };
}

const MAX_COMMITTED_EVENT_TYPES = 200;

function readCommittedEventTypes(event: ExecutionStreamEvent): readonly string[] {
    if (event.kind !== "step_committed" || !isRecord(event.payload)) return [event.kind];
    const declared = event.payload.eventTypes;
    if (!Array.isArray(declared)) return [event.kind];
    const types = declared
        .filter((type): type is string => typeof type === "string")
        .slice(0, MAX_COMMITTED_EVENT_TYPES);
    return types.length === 0 ? [event.kind] : types;
}

/**
 * 按工具白名单投影可公开的输入摘要。
 *
 * @remarks
 * 只有已知工具的已知参数进入公开摘要；其它参数与原始输入不进入会话输出。
 *
 * @param toolId - 工具身份。
 * @param input - 工具输入。
 * @returns 有界摘要；该工具没有可公开参数时返回 `undefined`。
 */
function projectSafeToolInputSummary(toolId: string, input: unknown): string | undefined {
    if (!isRecord(input)) return undefined;
    const key = toolId === "read_file" || toolId === "write_file" || toolId === "edit_file" ? "path"
        : toolId === "web_search" ? "query"
            : toolId === "web_fetch" ? "url" : toolId === "bash" ? "command" : undefined;
    const value = key === undefined ? undefined : input[key];
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 240) : undefined;
}

function readInputOutcome(payload: unknown): SessionInputOutcome | undefined {
    if (!isRecord(payload)) return undefined;
    if (typeof payload.goalId !== "string" || typeof payload.inputId !== "string") return undefined;
    if (typeof payload.kind !== "string" || typeof payload.ok !== "boolean") return undefined;
    return payload as unknown as SessionInputOutcome;
}

function readTextDelta(payload: unknown): { readonly text: string; readonly truncated: boolean } | undefined {
    if (!isRecord(payload)) return undefined;
    if (payload.deltaKind !== "text" || typeof payload.delta !== "string") return undefined;
    return {
        text: payload.delta.slice(0, MAX_LIVE_TEXT_LENGTH),
        truncated: payload.delta.length > MAX_LIVE_TEXT_LENGTH,
    };
}

function readWholeText(payload: unknown): { readonly text: string; readonly truncated: boolean } | undefined {
    if (!isRecord(payload)) return undefined;
    if (payload.blockType !== "text" || payload.delivery !== "whole") return undefined;
    if (typeof payload.text !== "string" || payload.text.length === 0) return undefined;
    return {
        text: payload.text.slice(0, MAX_LIVE_TEXT_LENGTH),
        truncated: payload.text.length > MAX_LIVE_TEXT_LENGTH,
    };
}

function isToolCallDecision(payload: unknown): boolean {
    if (!isRecord(payload)) return false;
    if (!isRecord(payload.decision)) return false;
    return payload.decision.kind === "tool_call";
}

function readRequestId(payload: unknown): string | undefined {
    if (!isRecord(payload)) return undefined;
    return typeof payload.requestId === "string" ? payload.requestId : undefined;
}

function readCommitRevision(payload: unknown): number | undefined {
    if (!isRecord(payload)) return undefined;
    return typeof payload.commitRevision === "number" && Number.isSafeInteger(payload.commitRevision)
        ? payload.commitRevision
        : undefined;
}

function readCandidatePreview(event: ExecutionStreamEvent): SessionGenerationEvent | undefined {
    const payload = event.payload;
    if (!isRecord(payload)) return undefined;
    if (typeof payload.candidateId !== "string") return undefined;
    if (typeof payload.text !== "string") return undefined;
    return {
        kind: "candidate_preview",
        source: toSource(event),
        candidateId: payload.candidateId,
        text: payload.text,
        startOffset: typeof payload.startOffset === "number" && Number.isSafeInteger(payload.startOffset)
            && payload.startOffset > 0
            ? payload.startOffset
            : 0,
        truncated: payload.truncated === true,
        complete: payload.complete === true,
    };
}

function readCandidateInvalidation(event: ExecutionStreamEvent): SessionGenerationEvent | undefined {
    const payload = event.payload;
    if (!isRecord(payload)) return undefined;
    if (typeof payload.candidateId !== "string") return undefined;
    const reason = payload.reason;
    if (reason !== "rejected" && reason !== "cancelled" && reason !== "failed"
        && reason !== "replaced" && reason !== "ambiguous") return undefined;
    return {
        kind: "candidate_invalidated",
        source: toSource(event),
        candidateId: payload.candidateId,
        reason,
    };
}

function readMessageCommitted(event: ExecutionStreamEvent): SessionMessageCommittedEvent | undefined {    const payload = event.payload;
    if (!isRecord(payload)) return undefined;
    if (typeof payload.messageId !== "string") return undefined;
    if (!isRecord(payload.position)
        || !Number.isSafeInteger(payload.position.afterSequence)
        || Number(payload.position.afterSequence) < 0
        || !Number.isSafeInteger(payload.position.order)
        || Number(payload.position.order) < 0) return undefined;
    const role = payload.role === "assistant" ? "assistant" : payload.role === "user" ? "user" : undefined;
    if (role === undefined) return undefined;
    const purpose = payload.purpose === "process" || payload.purpose === "answer" || payload.purpose === "notice"
        ? payload.purpose
        : undefined;
    const commitRevision = readCommitRevision(payload) ?? 0;
    return {
        source: toSource(event),
        messageId: payload.messageId,
        role,
        ...(purpose === undefined ? {} : { purpose }),
        runId: typeof payload.runId === "string" ? payload.runId : event.runId,
        position: {
            afterSequence: Number(payload.position.afterSequence),
            order: Number(payload.position.order),
        },
        commitRevision,
        ...(typeof payload.previewId === "string" ? { previewId: payload.previewId } : {}),
    };
}
