import {
    isModelAssistantMessage,
    type ModelAssistantMessage,
    type NativeConversationIdentity,
} from "../../model-contracts/src/index";
import { createHash } from "node:crypto";

import type {
    AgentDecision,
    AskUserAnswer,
    ExecutionErrorCode,
    GoalTask,
    JsonValue,
    Observation,
    ToolCallAction,
    MemoryPatchAcceptedPayload,
    ModelContextEpochState,
} from "./domain";
import type { RuntimeFeedback } from "./runtime-feedback";
import type { GoalPlanPatchOperation } from "./goal-plan";
import type {
    ContextLookupRequest,
    ContextLookupResult,
} from "./context-retrieval";
import type { GoalStore } from "./goal-store";
import type { ToolObservation } from "./tool";
import type { EffectiveSandboxScope } from "../../sandbox/src/index";

/** Trajectory 事件允许出现的 Runtime 业务阶段。 */
export type TrajectoryPhase = "executing";

/** 模型请求中的动态 Section 所属阶段。 */
export type ModelContextStage = "decide" | "think";

/**
 * 已注册动态 Section 的稳定身份元数据。
 *
 * @remarks
 * 恢复时必须与当前 Registry 中同 ID 的定义完全匹配，避免旧模板或来源语义继续提供比较基线。
 *
 * @example
 * ```ts
 * const identity: ModelContextSectionIdentity = {
 *     sectionId: "run_mode", order: 10, source: "RunState.mode",
 *     role: "user", templateId: "run-mode@1",
 * };
 * ```
 */
export interface ModelContextSectionIdentity {
    readonly sectionId: string;
    readonly order: number;
    readonly source: string;
    readonly role: "user";
    readonly templateId: string;
}

/**
 * 一次模型请求实际发送的 Section 更新及其结构化比较状态。
 *
 * @remarks
 * `projection` 是比较基线；`content` 是模型实际收到的语义更新。恢复不得从 `content`
 * 反解析当前状态。失效更新使用 `status: "invalidated"` 与 `projection: null`。
 *
 * @example
 * ```ts
 * const update: ModelContextSectionUpdate = {
 *     sectionId: "run_mode", order: 10, source: "RunState.mode",
 *     role: "user", templateId: "run-mode@1", status: "active",
 *     projection: { mode: "normal" }, content: "当前为普通模式",
 * };
 * ```
 */
export interface ModelContextSectionUpdate extends ModelContextSectionIdentity {
    /** `active` 保存当前投影；`invalidated` 保存 tombstone 状态。 */
    readonly status: "active" | "invalidated";
    /** 失效时为 null；比较状态不会从 `content` 反解析。 */
    readonly projection: JsonValue | null;
    /** 实际随该请求发给模型的完整更新文本。 */
    readonly content: string;
}

/**
 * 一次成功模型响应对应的模型可见 Section frame。
 *
 * @remarks
 * frame 只记录本请求实际发送的动态 Section 更新；空数组表示本次请求没有追加 Section
 * 消息。Frame 自身仍作为 Trajectory 事实提交，以保留阶段和 Conversation 位置；
 * modelCallId 仅关联独立的完整输入日志，不推进或重建上下文基线。
 *
 * @example
 * ```ts
 * const frame: ModelContextFramePayload = {
 *     type: "model_context_frame", stage: "decide", epochNumber: 0,
 *     conversationPosition: 1, sections: [],
 * };
 * ```
 */
export interface ModelContextFramePayload {
    /** 当前请求的原生续接身份；null 表示语义路径并结束之前的续接段。 */
    readonly nativeIdentity?: NativeConversationIdentity | null;
    /** 对应完整模型输入日志的调用身份；不作为 Section 比较或恢复基线。 */
    readonly modelCallId?: string;
    readonly type: "model_context_frame";
    readonly stage: ModelContextStage;
    readonly epochNumber: number;
    /** 该 frame 对应请求的 Conversation 插入位置。 */
    readonly conversationPosition: number;
    /** 本次请求实际发送的 Section 更新；未变化时可以为空。 */
    readonly sections: readonly ModelContextSectionUpdate[];
}

/**
 * Domain Event 的稳定事实载荷集合。
 *
 * @remarks
 * 每个事件信封绑定一个 Goal 与 Run。AskUser 回答/取消及任务审批等待、批准和反馈携带
 * 同一交互的 `requestId`，消费者可据此识别过期操作；反馈或批准不会改变事件所属 Run。
 * `think_requested` 与 `think_completed` 记录一个 Step 内的阶段控制与自由文本，不是
 * AgentDecision、Tool Observation 或完成证据。
 *
 * @example
 * ```ts
 * const feedback: TrajectoryEventPayload = {
 *     type: "task_feedback_received",
 *     requestId: "proposal-1",
 *     feedback: "缩小验收范围",
 * };
 * ```
 */
export type TrajectoryEventPayload =
    | {
        readonly type: "goal_created";
        readonly intent: string;
    }
    | { readonly type: "run_started" }
    | {
        readonly type: "run_created";
        readonly mode: "normal" | "plan";
    }
    | { readonly type: "run_resumed" }
    | { readonly type: "plan_mode_entered" }
    | {
        readonly type: "goal_plan_updated";
        readonly revision: number;
        readonly operations: readonly GoalPlanPatchOperation[];
    }
    | {
        readonly type: "ask_user_answered";
        readonly requestId: string;
        readonly answers: readonly AskUserAnswer[];
    }
    | {
        readonly type: "ask_user_cancelled";
        readonly requestId: string;
    }
    | {
        readonly type: "task_approved";
        readonly requestId: string;
        readonly task: GoalTask;
    }
    | {
        readonly type: "task_feedback_received";
        readonly requestId: string;
        readonly feedback: string;
    }
    | {
        readonly type: "decision_received";
        readonly decision: AgentDecision;
        readonly thought?: string;
    }
    | {
        readonly type: "think_requested";
        readonly requestId: string;
        readonly stepOrdinal: number;
        readonly goal: string;
    }
    | {
        readonly type: "think_completed";
        readonly requestId: string;
        readonly stepOrdinal: number;
        readonly goal: string;
        readonly output: string;
    }
    | {
        readonly type: "model_repair_attempt_started";
        readonly stage: ModelContextStage;
        readonly attempt: number;
        readonly inputBoundary: string;
        readonly thinkRequestId?: string;
    }
    | {
        readonly type: "model_repair_feedback_recorded";
        readonly stage: ModelContextStage;
        readonly attempt: number;
        readonly feedback: RuntimeFeedback;
    }
    | {
        readonly type: "model_request_retry_recorded";
        readonly stage: ModelContextStage;
        readonly attempt: number;
        readonly reason: "rate_limited" | "service_unavailable" | "connection" | "timeout";
        readonly status?: number;
    }
    | {
        readonly type: "model_response_received";
        readonly modelCallId: string;
        readonly stage: ModelContextStage;
        readonly conversationPosition: number;
        readonly epochNumber: number;
        readonly message: ModelAssistantMessage;
    }
    | ModelContextFramePayload
    | {
        readonly type: "context_lookup_requested";
        readonly lookupId: string;
        readonly request: ContextLookupRequest;
    }
    | {
        readonly type: "context_lookup_completed";
        readonly lookupId: string;
        readonly result: Extract<ContextLookupResult, { readonly status: "found" }>;
    }
    | {
        readonly type: "context_lookup_not_found";
        readonly lookupId: string;
        readonly result: Extract<ContextLookupResult, { readonly status: "not_found" }>;
    }
    | {
        readonly type: "context_lookup_failed";
        readonly lookupId: string;
        readonly code: string;
        readonly message: string;
    }
    | MemoryPatchAcceptedPayload
    | {
        readonly type: "context_epoch_advanced";
        readonly closedEpoch: EpochRange;
        readonly openedEpoch: ModelContextEpochState;
        readonly reason: "conversation_pruned" | "input_threshold" | "task_approved";
        readonly memoryRevisionEventId?: string;
    }
    | {
        readonly type: "context_epoch_closed";
        readonly epoch: EpochRange;
        readonly reason: "run_completed" | "run_failed" | "run_cancelled";
    }
    | {
        readonly type: "action_staged";
        readonly action: ToolCallAction;
        readonly approvalStatus: "approved" | "awaiting_approval";
        readonly approvalKind?: "tool" | "sandbox" | undefined;
        readonly effectiveSandboxScope?: EffectiveSandboxScope | undefined;
    }
    | {
        readonly type: "program_started";
        readonly programId: string;
        readonly parentActionId: string;
        readonly codeHash: string;
        readonly workerHash: string;
        readonly nodeVersion: string;
    }
    | {
        readonly type: "program_settled";
        readonly programId: string;
        readonly parentActionId: string;
        readonly outcome: "success" | "failure" | "rejected";
    }
    | {
        readonly type: "action_approved";
        readonly actionId: string;
        readonly approvalScope?: "action" | "goal" | "workspace";
        readonly grantId?: string;
    }
    | {
        readonly type: "tool_grant_revoked";
        readonly grantId: string;
        readonly scope: "goal" | "workspace";
    }
    | {
        readonly type: "sandbox_grant_revoked";
        readonly grantId: string;
        readonly scope: "goal" | "workspace";
    }
    | {
        readonly type: "action_rejected";
        readonly actionId: string;
        readonly reason: string;
    }
    | {
        readonly type: "action_recovered";
        readonly actionId: string;
        readonly replayPolicy: "safe" | "manual";
    }
    | {
        readonly type: "tool_started";
        readonly actionId: string;
        readonly toolId: string;
        readonly input: JsonValue;
    }
    | {
        readonly type: "tool_attempt_started";
        readonly actionId: string;
        readonly attempt: number;
    }
    | {
        readonly type: "tool_attempt_failed";
        readonly actionId: string;
        readonly attempt: number;
        readonly reason: string;
        readonly retryAfterMs?: number;
    }
    | {
        readonly type: "program_time_reserved";
        readonly programId: string;
        readonly sliceIndex: number;
        readonly milliseconds: 1000;
    }
    | {
        readonly type: "tool_finished";
        readonly actionId: string;
        readonly toolId: string;
        readonly observation: ToolObservation;
    }
    | {
        readonly type: "observation_recorded";
        readonly actionId: string;
        readonly observation: Observation;
    }
    | {
        readonly type: "run_waiting";
        readonly reason: string;
        readonly requestId?: string;
    }
    | {
        readonly type: "run_completed";
        readonly summary: string;
    }
    | {
        readonly type: "run_failed";
        readonly code: ExecutionErrorCode | string;
        readonly message: string;
    }
    | {
        readonly type: "run_cancelled";
        readonly reason: string;
    }
    | {
        readonly type: "execution_error";
        readonly code: ExecutionErrorCode | string;
        readonly message: string;
        readonly actionId?: string;
    }
    | {
        readonly type: "state_committed";
        readonly committedThroughSequence: number;
    };

/** Domain Event 的稳定事件类型名称。 */
export type TrajectoryEventType = TrajectoryEventPayload["type"];

/**
 * 计算单条文本的 canonical UTF-8 SHA-256 content hash。
 *
 * @param content - 需要绑定来源的原始文本。
 * @returns 带 `sha256:` 前缀的小写十六进制摘要。
 * @example
 * ```ts
 * const hash = computeContentHash("用户约束");
 * ```
 */
export function computeContentHash(content: string): `sha256:${string}` {
    return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

/** Epoch 关闭时使用的完整范围。 */
export interface EpochRange {
    readonly number: number;
    readonly conversationStartIndex: number;
    readonly conversationEndIndexExclusive: number;
    readonly closedThroughSequence: number;
}

interface TrajectoryEventMetadata {
    readonly goalId: string;
    readonly runId: string;
    readonly phase: TrajectoryPhase;
    readonly executionUnitId?: string;
    readonly stepIndex?: number;
    readonly actionId?: string;
    readonly parentEventId?: string;
    /** 内部程序调用的宿主身份；缺失表示普通模型 Action。 */
    readonly programId?: string;
    /** 程序内部从零开始的调用序号。 */
    readonly callIndex?: number;
}

type DraftForPayload<P extends TrajectoryEventPayload> =
    TrajectoryEventMetadata & {
        readonly eventType: P["type"];
        readonly payload: P;
    };

/**
 * 未分配服务端事件身份的 Domain Event 草稿。
 *
 * @remarks
 * 草稿只描述已经发生的事实；`eventId`、`sequence` 和 `occurredAt` 由
 * `TrajectorySink` 分配。`eventType` 与 `payload.type` 在类型和运行时都必须一致。
 * 当前状态、计划和 pending Action 等派生结果不能作为 payload 字段写入。
 *
 * @example
 * ```ts
 * const draft: TrajectoryEventDraft = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     phase: "executing",
 *     eventType: "run_started",
 *     payload: { type: "run_started" },
 * };
 * ```
 */
export type TrajectoryEventDraft = {
    [P in TrajectoryEventPayload as P["type"]]: DraftForPayload<P>
}[TrajectoryEventType];

interface EventForPayload<P extends TrajectoryEventPayload>
    extends TrajectoryEventMetadata {
    readonly eventSchemaVersion: 1;
    readonly eventId: string;
    readonly sequence: number;
    readonly occurredAt: string;
    readonly eventType: P["type"];
    readonly payload: P;
}

/**
 * 已由 TrajectorySink 分配身份和顺序的不可变 Domain Event。
 *
 * @remarks
 * `sequence` 只在同一 `(goalId, runId)` 内保证单调递增。事件是事实账本，不能被
 * Runtime State 的当前结果回写或覆盖；需要当前结果时应读取 Goal Snapshot。
 *
 * @example
 * ```ts
 * const event: TrajectoryEvent = await sink.append(draft);
 * console.log(event.sequence, event.payload.type);
 * ```
 */
export type TrajectoryEvent = {
    [P in TrajectoryEventPayload as P["type"]]: EventForPayload<P>
}[TrajectoryEventType];

/** Trajectory 消费者可见的事件分类。 */
export type TrajectoryEventCategory =
    | "lifecycle"
    | "decision"
    | "memory"
    | "action"
    | "tool"
    | "observation"
    | "terminal"
    | "commit";

/**
 * 事件的只读投影，不携带可变 payload。
 *
 * @remarks
 * 投影用于 TUI、报告等只读消费者快速建立关联；它不参与 Runtime State reduce，
 * 也不能替代原始 Domain Event。
 *
 * @example
 * ```ts
 * const view = projectTrajectoryEvent(event);
 * if (view.category === "tool") console.log(view.actionId);
 * ```
 */
export interface TrajectoryEventProjection {
    readonly eventId: string;
    readonly sequence: number;
    readonly eventType: TrajectoryEventType;
    readonly category: TrajectoryEventCategory;
    readonly phase: TrajectoryPhase;
    readonly executionUnitId?: string;
    readonly actionId?: string;
    readonly parentEventId?: string;
    /** 内部调用所属程序；省略时为普通执行事件。 */
    readonly programId?: string;
    /** 程序内部的调用位置，用于审批和审计关联。 */
    readonly callIndex?: number;
}

/**
 * 追加并分配 Domain Event 元数据的边界。
 *
 * @remarks
 * 实现必须在同一 `(goalId, runId)` 内串行分配 `sequence`，并返回不再与草稿共享
 * 可变引用的事件。追加失败必须拒绝 Promise；调用方据此停止后续状态推进。
 *
 * @example
 * ```ts
 * const sink: TrajectorySink = {
 *     async append(draft) {
 *         return allocateImmutableEvent(draft, 1);
 *     },
 * };
 * ```
 */
export interface TrajectorySink {
    /**
     * @param draft - 只包含已发生事实的事件草稿。
     * @returns 分配了事件身份、顺序和时间的不可变事件。
     * @throws 草稿违反协议或底层追加失败时拒绝。
     */
    append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>>;
}

/**
 * 支持读取的 Trajectory 持久化边界。
 *
 * @remarks
 * 读取结果必须按 `sequence` 升序返回且不暴露可变存储引用；缺少对应轨迹时应返回
 * 空数组。提交边界由 Goal Snapshot 提供，不能由该接口根据 marker 自行推导。
 *
 * @example
 * ```ts
 * const events = await store.read({ goalId: "goal-1", runId: "run-1" });
 * ```
 */
export interface TrajectoryStore extends TrajectorySink {
    /**
     * @param query - Goal/Run 必选键和可选的闭区间序列范围。
     * @returns 按 `sequence` 排序的不可变事件列表。
     * @throws 事件文件损坏或底层读取失败时拒绝。
     */
    read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]>;

    /**
     * @param query - Goal/Run 必选键和可选的闭区间序列范围。
     * @param committedThroughSequence - 最新有效 Goal Snapshot 记录的提交边界。
     * @returns 按 Snapshot 边界分开的已提交事件与未提交 tail。
     * @throws 边界非法、事件文件损坏或底层读取失败时拒绝。
     */
    readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>>;
}

// TODO(trajectory-durable-outbox): 未来可在不改变事实事件契约的前提下增加持久化
// Outbox、异步重试和原子双写；当前实现不提供这些能力，也不通过 Trajectory replay 恢复 Runtime。

/** Trajectory 按 Goal、Run 和序列范围读取的查询条件。 */
export interface TrajectoryReadQuery {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** Run 稳定标识。 */
    readonly runId: string;
    /** 可选的最小序列（包含）。 */
    readonly fromSequence?: number;
    /** 可选的最大序列（包含）。 */
    readonly toSequence?: number;
}

/**
 * 以 Goal Snapshot 提交边界分类后的 Trajectory 读取结果。
 *
 * @remarks
 * `committed` 只包含序号不大于 Snapshot 边界的事件；其余事件保留在
 * `uncommittedTail` 中供审计。两组结果都不代表可 replay 的 Runtime State。
 *
 * @example
 * ```ts
 * const result = await store.readWithBoundary(
 *     { goalId: "goal-1", runId: "run-1" },
 *     goal.state.run.committedThroughSequence ?? 0,
 * );
 * console.log(result.uncommittedTail.length);
 * ```
 */
export interface TrajectoryReadResult {
    readonly committed: readonly TrajectoryEvent[];
    readonly uncommittedTail: readonly TrajectoryEvent[];
}

/**
 * 读取 Trajectory 并使用最新有效 Goal Snapshot 的提交边界完成分类。
 *
 * @param goalStore - 提供恢复权威 Snapshot 的只读 Port。
 * @param trajectoryStore - 提供事件读取的只读/追加 Port；本函数不会追加事件。
 * @param query - Goal/Run 标识和可选序列范围。
 * @returns 已提交事件与未提交 tail；当前 Run 使用当前边界，已完成 Run 使用其
 *   `completedRuns` 记录的边界，未知 Run 或缺少 Snapshot 时全部事件归入 tail。
 * @throws 底层 Snapshot 或 Trajectory 读取失败时拒绝。
 * @example
 * ```ts
 * const result = await readTrajectoryAtSnapshot(
 *     goalStore,
 *     trajectoryStore,
 *     { goalId: "goal-1", runId: "run-1" },
 * );
 * ```
 */
export async function readTrajectoryAtSnapshot(
    goalStore: GoalStore,
    trajectoryStore: TrajectoryStore,
    query: TrajectoryReadQuery,
): Promise<Readonly<TrajectoryReadResult>> {
    const goal = await goalStore.restore(query.goalId);
    const committedThroughSequence = goal === undefined
        ? 0
        : goal.state.run.id === query.runId
            ? goal.state.run.committedThroughSequence ?? 0
            : goal.state.completedRuns?.find((record) => record.runId === query.runId)
                ?.committedThroughSequence ?? 0;

    return trajectoryStore.readWithBoundary(query, committedThroughSequence);
}

/**
 * 与 Domain Event 分离的诊断记录写入边界。
 *
 * @remarks
 * Trace 可记录耗时、Provider metadata、脱敏后的原始请求/响应和异常，但不进入
 * Trajectory，也不参与 Snapshot 恢复。TraceSink 故障由调用方隔离，不得改写领域事实。
 *
 * @example
 * ```ts
 * const traceSink: DiagnosticTraceSink = {
 *     async append(record) {
 *         console.debug(record.kind);
 *     },
 * };
 * ```
 */
export interface DiagnosticTraceSink {
    /**
     * @param record - 已完成脱敏和大小限制的诊断记录。
     * @returns 记录完成后 resolve。
     * @throws 底层 Trace 写入失败；调用方不得因此改变 Snapshot 语义。
     */
    append(record: TraceRecord): Promise<void>;
}

/**
 * Diagnostic Trace 的最小记录格式。
 *
 * @remarks
 * `payload` 是诊断事实而不是可恢复状态；原始模型内容是否允许写入由上层脱敏策略决定。
 *
 * @example
 * ```ts
 * const record: TraceRecord = {
 *     traceSchemaVersion: 1,
 *     traceId: "trace-1",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     kind: "model_request",
 *     occurredAt: new Date().toISOString(),
 *     payload: { provider: "test" },
 * };
 * ```
 */
export interface TraceRecord {
    readonly traceSchemaVersion: 1;
    readonly traceId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly kind: string;
    readonly occurredAt: string;
    readonly executionUnitId?: string;
    readonly payload: JsonValue;
}

/** 轨迹协议稳定错误代码。 */
export const TRAJECTORY_PROTOCOL_ERROR_CODE = "TRAJECTORY_PROTOCOL_ERROR" as const;

/** Domain Event 追加失败的稳定错误代码。 */
export const TRAJECTORY_APPEND_FAILED_CODE = "TRAJECTORY_APPEND_FAILED" as const;

/** Snapshot 成功后提交 marker 追加失败的稳定错误代码。 */
export const TRAJECTORY_COMMIT_MARKER_FAILED_CODE = "TRAJECTORY_COMMIT_MARKER_FAILED" as const;

/**
 * Domain Event 草稿或事件违反稳定协议时抛出的错误。
 *
 * @example
 * ```ts
 * try {
 *     assertValidTrajectoryEventDraft(input);
 * } catch (error) {
 *     if (error instanceof TrajectoryProtocolError) console.error(error.code);
 * }
 * ```
 */
export class TrajectoryProtocolError extends Error {
    readonly code = TRAJECTORY_PROTOCOL_ERROR_CODE;

    constructor(message: string) {
        super(message);
        this.name = "TrajectoryProtocolError";
    }
}

/**
 * Domain Event 追加失败时抛出的稳定错误。
 *
 * @remarks
 * Runtime 会在外部效果或状态转换前暴露此错误并停止继续推进；已有事件和旧
 * Snapshot 不会被回写或删除。
 *
 * @example
 * ```ts
 * if (error instanceof TrajectoryAppendError) {
 *     console.error(error.code);
 * }
 * ```
 */
export class TrajectoryAppendError extends Error {
    readonly code = TRAJECTORY_APPEND_FAILED_CODE;

    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(message, options);
        this.name = "TrajectoryAppendError";
    }
}

/**
 * Snapshot 已保存但 `state_committed` marker 未能追加时抛出的稳定错误。
 *
 * @remarks
 * 该错误不回滚已经保存的 Snapshot；恢复和消费者仍以 Snapshot 的提交边界为准。
 *
 * @example
 * ```ts
 * if (error instanceof TrajectoryCommitMarkerError) {
 *     // Snapshot 已经是恢复权威，等待诊断或重试 marker。
 * }
 * ```
 */
export class TrajectoryCommitMarkerError extends Error {
    readonly code = TRAJECTORY_COMMIT_MARKER_FAILED_CODE;

    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(message, options);
        this.name = "TrajectoryCommitMarkerError";
    }
}

const TRAJECTORY_EVENT_TYPES: ReadonlySet<TrajectoryEventType> = new Set([
    "goal_created",
    "run_started",
    "run_created",
    "run_resumed",
    "plan_mode_entered",
    "goal_plan_updated",
    "ask_user_answered",
    "ask_user_cancelled",
    "task_approved",
    "task_feedback_received",
    "decision_received",
    "think_requested",
    "think_completed",
    "model_repair_attempt_started",
    "model_repair_feedback_recorded",
    "model_request_retry_recorded",
    "model_context_frame",
    "model_response_received",
    "context_lookup_requested",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
    "memory_patch_accepted",
    "action_staged",
    "program_started",
    "program_settled",
    "action_approved",
    "tool_grant_revoked",
    "sandbox_grant_revoked",
    "action_rejected",
    "action_recovered",
    "tool_started",
    "tool_attempt_started",
    "tool_attempt_failed",
    "program_time_reserved",
    "tool_finished",
    "observation_recorded",
    "run_waiting",
    "run_completed",
    "run_failed",
    "run_cancelled",
    "context_epoch_advanced",
    "context_epoch_closed",
    "execution_error",
    "state_committed",
]);

const TRAJECTORY_PHASES: ReadonlySet<TrajectoryPhase> = new Set([
    "executing",
]);

const DERIVED_PAYLOAD_KEYS = new Set([
    "currentRunStatus",
    "currentPlan",
    "currentPendingAction",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.length === 0) {
        throw new TrajectoryProtocolError(`${field} must be a non-empty string`);
    }
}

function assertNonBlankString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new TrajectoryProtocolError(`${field} must contain non-whitespace text`);
    }
}

function assertPositiveInteger(value: unknown, field: string): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
        throw new TrajectoryProtocolError(`${field} must be a positive safe integer`);
    }
}

function assertOptionalNonEmptyString(value: unknown, field: string): void {
    if (value !== undefined) assertNonEmptyString(value, field);
}

function assertRuntimeFeedback(value: unknown, stage: unknown, attempt: unknown): void {
    const field = "model_repair_feedback_recorded.feedback";
    if (!isRecord(value)
        || Object.keys(value).some((key) => ![
            "goalId", "runId", "executionUnitId", "stepOrdinal", "stage", "origin", "code",
            "attempt", "issues", "constraints",
        ].includes(key))) {
        throw new TrajectoryProtocolError(`${field} has an invalid shape`);
    }
    for (const key of ["goalId", "runId", "executionUnitId", "code"] as const) {
        assertNonEmptyString(value[key], `${field}.${key}`);
    }
    assertPositiveInteger(value.stepOrdinal, `${field}.stepOrdinal`);
    assertPositiveInteger(value.attempt, `${field}.attempt`);
    if (value.stage !== stage || value.attempt !== attempt) {
        throw new TrajectoryProtocolError(`${field} stage and attempt must match the event`);
    }
    if (![
        "response_parse", "output_contract", "decision_semantics", "tool_selection", "tool_input",
        "completion_evidence", "completion_review",
    ].includes(value.origin as string)) {
        throw new TrajectoryProtocolError(`${field}.origin is invalid`);
    }
    if (!Array.isArray(value.issues) || value.issues.length > 8) {
        throw new TrajectoryProtocolError(`${field}.issues must contain at most 8 items`);
    }
    for (const [index, issue] of value.issues.entries()) {
        const issueField = `${field}.issues[${index}]`;
        if (!isRecord(issue)
            || Object.keys(issue).some((key) => !["code", "path", "message"].includes(key))) {
            throw new TrajectoryProtocolError(`${issueField} has an invalid shape`);
        }
        for (const key of ["code", "message"] as const) assertNonEmptyString(issue[key], `${issueField}.${key}`);
        if ((issue.code as string).length > 80 || (issue.message as string).length > 240) {
            throw new TrajectoryProtocolError(`${issueField} exceeds its field limit`);
        }
        if (!Array.isArray(issue.path) || issue.path.length > 8
            || issue.path.some((part) => typeof part === "string"
                ? part.length > 80
                : !Number.isSafeInteger(part) || (part as number) < 0)) {
            throw new TrajectoryProtocolError(`${issueField}.path is invalid`);
        }
    }
    if (value.constraints !== undefined
        && (!Array.isArray(value.constraints)
            || value.constraints.length > 8
            || value.constraints.some((item) => typeof item !== "string" || item.length === 0 || item.length > 240))) {
        throw new TrajectoryProtocolError(`${field}.constraints is invalid`);
    }
    assertNonEmptyString(value.code, `${field}.code`);
    if (value.code.length > 80) throw new TrajectoryProtocolError(`${field}.code exceeds its field limit`);
}

function assertPayload(payload: unknown, eventType: unknown): void {
    if (!isRecord(payload) || payload.type !== eventType) {
        throw new TrajectoryProtocolError("payload.type must match eventType");
    }

    for (const key of DERIVED_PAYLOAD_KEYS) {
        if (key in payload) {
            throw new TrajectoryProtocolError(
                `payload must not contain derived state field: ${key}`,
            );
        }
    }

    if (eventType === "action_approved") {
        if (Object.keys(payload).some((key) => !["type", "actionId", "approvalScope", "grantId"].includes(key))) {
            throw new TrajectoryProtocolError("action_approved contains unknown fields");
        }
        assertNonEmptyString(payload.actionId, "action_approved.actionId");
        if (payload.approvalScope !== undefined
            && payload.approvalScope !== "action"
            && payload.approvalScope !== "goal"
            && payload.approvalScope !== "workspace") {
            throw new TrajectoryProtocolError("action_approved.approvalScope is invalid");
        }
        if (payload.grantId !== undefined) assertNonEmptyString(payload.grantId, "action_approved.grantId");
        if (payload.approvalScope !== undefined
            && ((payload.approvalScope === "action") !== (payload.grantId === undefined))) {
            throw new TrajectoryProtocolError("action_approved scope and Grant identity are inconsistent");
        }
        if (payload.approvalScope === undefined && payload.grantId !== undefined) {
            throw new TrajectoryProtocolError("action_approved Grant requires an approval scope");
        }
    }
    if (eventType === "tool_grant_revoked" || eventType === "sandbox_grant_revoked") {
        if (Object.keys(payload).some((key) => !["type", "grantId", "scope"].includes(key))) {
            throw new TrajectoryProtocolError(`${eventType} contains unknown fields`);
        }
        assertNonEmptyString(payload.grantId, `${eventType}.grantId`);
        if (payload.scope !== "goal" && payload.scope !== "workspace") {
            throw new TrajectoryProtocolError(`${eventType}.scope is invalid`);
        }
    }

    if (eventType === "decision_received") {
        if ("thought" in payload && payload.thought !== undefined && typeof payload.thought !== "string") {
            throw new TrajectoryProtocolError("thought must be a string");
        }
    }
    if (eventType === "think_requested") {
        if (Object.keys(payload).some((key) => !["type", "requestId", "stepOrdinal", "goal"].includes(key))) {
            throw new TrajectoryProtocolError("think_requested contains unknown fields");
        }
        assertNonEmptyString(payload.requestId, "think_requested.requestId");
        assertPositiveInteger(payload.stepOrdinal, "think_requested.stepOrdinal");
        assertNonBlankString(payload.goal, "think_requested.goal");
    }
    if (eventType === "think_completed") {
        if (Object.keys(payload).some((key) => !["type", "requestId", "stepOrdinal", "goal", "output"].includes(key))) {
            throw new TrajectoryProtocolError("think_completed contains unknown fields");
        }
        assertNonEmptyString(payload.requestId, "think_completed.requestId");
        assertPositiveInteger(payload.stepOrdinal, "think_completed.stepOrdinal");
        assertNonBlankString(payload.goal, "think_completed.goal");
        assertNonBlankString(payload.output, "think_completed.output");
    }
    if (eventType === "tool_attempt_started") {
        if (Object.keys(payload).some((key) => !["type", "actionId", "attempt"].includes(key))) {
            throw new TrajectoryProtocolError("tool_attempt_started contains unknown fields");
        }
        assertNonEmptyString(payload.actionId, "tool_attempt_started.actionId");
        assertPositiveInteger(payload.attempt, "tool_attempt_started.attempt");
        if (payload.attempt > 3) throw new TrajectoryProtocolError("tool_attempt_started.attempt exceeds three");
    }
    if (eventType === "program_time_reserved") {
        if (Object.keys(payload).some((key) => !["type", "programId", "sliceIndex", "milliseconds"].includes(key))) {
            throw new TrajectoryProtocolError("program_time_reserved contains unknown fields");
        }
        assertNonEmptyString(payload.programId, "program_time_reserved.programId");
        if (!Number.isSafeInteger(payload.sliceIndex) || (payload.sliceIndex as number) < 0
            || payload.milliseconds !== 1000) {
            throw new TrajectoryProtocolError("program_time_reserved has an invalid slice");
        }
    }
    if (eventType === "program_started") {
        if (Object.keys(payload).some((key) => ![
            "type", "programId", "parentActionId", "codeHash", "workerHash", "nodeVersion",
        ].includes(key))) {
            throw new TrajectoryProtocolError("program_started contains unknown fields");
        }
        for (const key of ["programId", "parentActionId", "codeHash", "workerHash", "nodeVersion"]) {
            assertNonEmptyString(payload[key], `program_started.${key}`);
        }
    }
    if (eventType === "program_settled") {
        if (Object.keys(payload).some((key) => !["type", "programId", "parentActionId", "outcome"].includes(key))) {
            throw new TrajectoryProtocolError("program_settled contains unknown fields");
        }
        assertNonEmptyString(payload.programId, "program_settled.programId");
        assertNonEmptyString(payload.parentActionId, "program_settled.parentActionId");
        if (payload.outcome !== "success" && payload.outcome !== "failure" && payload.outcome !== "rejected") {
            throw new TrajectoryProtocolError("program_settled.outcome is invalid");
        }
    }
    if (eventType === "tool_attempt_failed") {
        if (Object.keys(payload).some((key) => !["type", "actionId", "attempt", "reason", "retryAfterMs"].includes(key))) {
            throw new TrajectoryProtocolError("tool_attempt_failed contains unknown fields");
        }
        assertNonEmptyString(payload.actionId, "tool_attempt_failed.actionId");
        assertPositiveInteger(payload.attempt, "tool_attempt_failed.attempt");
        assertNonBlankString(payload.reason, "tool_attempt_failed.reason");
        if (payload.attempt > 3 || payload.reason.length > 120) {
            throw new TrajectoryProtocolError("tool_attempt_failed exceeds its bounds");
        }
        if (payload.retryAfterMs !== undefined
            && (typeof payload.retryAfterMs !== "number"
                || !Number.isSafeInteger(payload.retryAfterMs)
                || payload.retryAfterMs < 0
                || payload.retryAfterMs > 30_000)) {
            throw new TrajectoryProtocolError("tool_attempt_failed.retryAfterMs is invalid");
        }
    }
    if (eventType === "model_repair_attempt_started") {
        if (Object.keys(payload).some((key) => !["type", "stage", "attempt", "inputBoundary", "thinkRequestId"].includes(key))) {
            throw new TrajectoryProtocolError("model_repair_attempt_started contains unknown fields");
        }
        if (payload.stage !== "decide" && payload.stage !== "think") {
            throw new TrajectoryProtocolError("model_repair_attempt_started stage is invalid");
        }
        assertPositiveInteger(payload.attempt, "model_repair_attempt_started.attempt");
        if (typeof payload.inputBoundary !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(payload.inputBoundary)) {
            throw new TrajectoryProtocolError("model_repair_attempt_started inputBoundary is invalid");
        }
        assertOptionalNonEmptyString(payload.thinkRequestId, "model_repair_attempt_started.thinkRequestId");
    }
    if (eventType === "model_repair_feedback_recorded") {
        if (Object.keys(payload).some((key) => !["type", "stage", "attempt", "feedback"].includes(key))) {
            throw new TrajectoryProtocolError("model_repair_feedback_recorded contains unknown fields");
        }
        if (payload.stage !== "decide" && payload.stage !== "think") {
            throw new TrajectoryProtocolError("model_repair_feedback_recorded stage is invalid");
        }
        assertPositiveInteger(payload.attempt, "model_repair_feedback_recorded.attempt");
        assertRuntimeFeedback(payload.feedback, payload.stage, payload.attempt);
    }
    if (eventType === "model_request_retry_recorded") {
        if (Object.keys(payload).some((key) => !["type", "stage", "attempt", "reason", "status"].includes(key))) {
            throw new TrajectoryProtocolError("model_request_retry_recorded contains unknown fields");
        }
        if ((payload.stage !== "decide" && payload.stage !== "think")
            || !["rate_limited", "service_unavailable", "connection", "timeout"].includes(String(payload.reason))) {
            throw new TrajectoryProtocolError("model_request_retry_recorded stage or reason is invalid");
        }
        assertPositiveInteger(payload.attempt, "model_request_retry_recorded.attempt");
        if (payload.attempt > 3 || (payload.status !== undefined && (typeof payload.status !== "number" || !Number.isInteger(payload.status) || payload.status < 100 || payload.status > 599))) {
            throw new TrajectoryProtocolError("model_request_retry_recorded exceeds its bounds");
        }
    }
    if (eventType === "model_response_received") {
        if (Object.keys(payload).some(key => !["type", "modelCallId", "stage", "conversationPosition", "epochNumber", "message"].includes(key))
            || !["decide", "think"].includes(String(payload.stage))
            || !Number.isSafeInteger(payload.conversationPosition) || Number(payload.conversationPosition) < 0
            || !Number.isSafeInteger(payload.epochNumber) || Number(payload.epochNumber) < 0
            || !isModelAssistantMessage(payload.message) || payload.message.continuation === undefined) {
            throw new TrajectoryProtocolError("model_response_received contains invalid native response data");
        }
        if (payload.stage === "decide" && payload.message.toolCalls?.length !== 1
            || payload.stage === "think" && (payload.message.toolCalls?.length ?? 0) !== 0) {
            throw new TrajectoryProtocolError("model_response_received tool calls disagree with stage");
        }
        for (const call of payload.message.toolCalls ?? []) {
            let argumentsValue: unknown;
            try { argumentsValue = JSON.parse(call.argumentsJson); }
            catch { throw new TrajectoryProtocolError("model_response_received contains invalid tool argument JSON"); }
            if (!isRecord(argumentsValue)) throw new TrajectoryProtocolError("model_response_received tool arguments must be an object");
        }
        assertModelContextJson(payload.message, "model_response_received.message");
        assertNonEmptyString(payload.modelCallId, "model_response_received.modelCallId");
    }
    if (eventType === "model_context_frame") {
        if (payload.nativeIdentity !== undefined && payload.nativeIdentity !== null
            && !isModelAssistantMessage({ role: "assistant", content: "", continuation: {
                identity: payload.nativeIdentity,
                ...(isRecord(payload.nativeIdentity) && payload.nativeIdentity.protocol === "gemini-content" ? { parts: [] } : {}),
            } })) throw new TrajectoryProtocolError("model_context_frame.nativeIdentity is invalid");
        if (payload.modelCallId !== undefined) assertNonEmptyString(payload.modelCallId, "model_context_frame.modelCallId");
        if (Object.keys(payload).some((key) => ![
            "type", "stage", "epochNumber", "conversationPosition", "sections", "modelCallId", "nativeIdentity",
        ].includes(key))) {
            throw new TrajectoryProtocolError("model_context_frame contains unknown fields");
        }
        if (payload.stage !== "decide" && payload.stage !== "think") {
            throw new TrajectoryProtocolError("model_context_frame.stage is invalid");
        }
        if (!Number.isSafeInteger(payload.epochNumber) || (payload.epochNumber as number) < 0) {
            throw new TrajectoryProtocolError("model_context_frame.epochNumber is invalid");
        }
        if (!Number.isSafeInteger(payload.conversationPosition)
            || (payload.conversationPosition as number) < 0) {
            throw new TrajectoryProtocolError("model_context_frame.conversationPosition is invalid");
        }
        if (!Array.isArray(payload.sections)) {
            throw new TrajectoryProtocolError("model_context_frame.sections must be an array");
        }
        const sectionIds = new Set<string>();
        let previousOrder = -1;
        for (const section of payload.sections) {
            if (!isRecord(section)) {
                throw new TrajectoryProtocolError("model_context_frame section must be an object");
            }
            if (typeof section.sectionId !== "string"
                || !/^[a-z][a-z0-9_]*$/.test(section.sectionId)) {
                throw new TrajectoryProtocolError("model_context_frame sectionId is invalid");
            }
            if (sectionIds.has(section.sectionId)) {
                throw new TrajectoryProtocolError("model_context_frame contains duplicate sectionId");
            }
            sectionIds.add(section.sectionId);
            if (!Number.isSafeInteger(section.order) || (section.order as number) <= previousOrder) {
                throw new TrajectoryProtocolError("model_context_frame section order is invalid");
            }
            previousOrder = section.order as number;
            assertNonEmptyString(section.source, "model_context_frame.source");
            assertNonEmptyString(section.templateId, "model_context_frame.templateId");
            if (section.role !== "user") {
                throw new TrajectoryProtocolError("model_context_frame.role is invalid");
            }
            if (section.status !== "active" && section.status !== "invalidated") {
                throw new TrajectoryProtocolError("model_context_frame.status is invalid");
            }
            assertModelContextJson(section.projection, "model_context_frame.projection");
            if ((section.status === "active" && section.projection === null)
                || (section.status === "invalidated" && section.projection !== null)) {
                throw new TrajectoryProtocolError("model_context_frame projection does not match status");
            }
            assertNonEmptyString(section.content, "model_context_frame.content");
            if (Object.keys(section).some((key) => ![
                "sectionId", "order", "source", "role", "templateId", "status", "projection", "content",
            ].includes(key))) {
                throw new TrajectoryProtocolError("model_context_frame section contains unknown fields");
            }
        }
    }
    if (eventType === "run_created") {
        if (Object.keys(payload).some((key) => !["type", "mode"].includes(key))) {
            throw new TrajectoryProtocolError("run_created contains unknown fields");
        }
        if (payload.mode !== "normal" && payload.mode !== "plan") {
            throw new TrajectoryProtocolError("run_created.mode must be normal or plan");
        }
    }
    if (eventType === "plan_mode_entered") {
        if (Object.keys(payload).some((key) => key !== "type")) {
            throw new TrajectoryProtocolError("plan_mode_entered contains unknown fields");
        }
    }
    if (eventType === "goal_plan_updated") {
        if (Object.keys(payload).some((key) => !["type", "revision", "operations"].includes(key))) {
            throw new TrajectoryProtocolError("goal_plan_updated contains unknown fields");
        }
        if (typeof payload.revision !== "number" || !Number.isInteger(payload.revision) || payload.revision < 1) {
            throw new TrajectoryProtocolError("goal_plan_updated revision is invalid");
        }
        if (!Array.isArray(payload.operations)) {
            throw new TrajectoryProtocolError("goal_plan_updated operations must be an array");
        }
    }
    if (eventType === "ask_user_answered") {
        if (Object.keys(payload).some((key) => !["type", "requestId", "answers"].includes(key))) {
            throw new TrajectoryProtocolError("ask_user_answered contains unknown fields");
        }
        if (typeof payload.requestId !== "string" || payload.requestId.length === 0) {
            throw new TrajectoryProtocolError("ask_user_answered requestId is invalid");
        }
        if (!Array.isArray(payload.answers)) {
            throw new TrajectoryProtocolError("ask_user_answered answers must be an array");
        }
        for (const answer of payload.answers) {
            if (
                !isRecord(answer)
                || typeof answer.questionId !== "string"
                || !answer.questionId
                || !Array.isArray(answer.optionIds)
                || answer.optionIds.some((id: unknown) => typeof id !== "string" || !id)
                || (answer.otherText !== undefined && typeof answer.otherText !== "string")
            ) {
                throw new TrajectoryProtocolError("ask_user_answered contains invalid answer");
            }
        }
    }
    if (eventType === "ask_user_cancelled") {
        if (Object.keys(payload).some((key) => !["type", "requestId"].includes(key))) {
            throw new TrajectoryProtocolError("ask_user_cancelled contains unknown fields");
        }
        assertNonEmptyString(payload.requestId, "ask_user_cancelled.requestId");
    }
    if (eventType === "task_approved") {
        if (Object.keys(payload).some((key) => !["type", "requestId", "task"].includes(key))) {
            throw new TrajectoryProtocolError("task_approved contains unknown fields");
        }
        assertNonEmptyString(payload.requestId, "task_approved.requestId");
        if (
            !isRecord(payload.task)
            || typeof payload.task.objective !== "string"
            || !payload.task.objective
            || !Array.isArray(payload.task.completionCriteria)
        ) {
            throw new TrajectoryProtocolError("task_approved task is invalid");
        }
    }
    if (eventType === "task_feedback_received") {
        if (Object.keys(payload).some((key) => !["type", "requestId", "feedback"].includes(key))) {
            throw new TrajectoryProtocolError("task_feedback_received contains unknown fields");
        }
        assertNonEmptyString(payload.requestId, "task_feedback_received.requestId");
        assertNonEmptyString(payload.feedback, "task_feedback_received.feedback");
    }
    if (eventType === "run_waiting") {
        if (Object.keys(payload).some((key) => !["type", "reason", "requestId"].includes(key))) {
            throw new TrajectoryProtocolError("run_waiting contains unknown fields");
        }
        assertNonEmptyString(payload.reason, "run_waiting.reason");
        if (payload.reason === "task_approval") {
            assertNonEmptyString(payload.requestId, "run_waiting.requestId");
        } else if (payload.requestId !== undefined) {
            throw new TrajectoryProtocolError("run_waiting.requestId is only valid for task_approval");
        }
    }
    if (eventType === "context_epoch_advanced") {
        if (Object.keys(payload).some((key) => ![
            "type", "closedEpoch", "openedEpoch", "reason", "memoryRevisionEventId",
        ].includes(key))) {
            throw new TrajectoryProtocolError("context_epoch_advanced contains unknown fields");
        }
        if (!isRecord(payload.closedEpoch) || !isRecord(payload.openedEpoch)
            || (payload.reason !== "conversation_pruned"
                && payload.reason !== "input_threshold"
                && payload.reason !== "task_approved")) {
            throw new TrajectoryProtocolError("context_epoch_advanced payload is invalid");
        }
        assertEpochRange(payload.closedEpoch);
        assertEpochState(payload.openedEpoch);
        if (payload.memoryRevisionEventId !== undefined) {
            assertNonEmptyString(payload.memoryRevisionEventId, "memoryRevisionEventId");
        }
    }
    if (eventType === "context_epoch_closed") {
        if (Object.keys(payload).some((key) => !["type", "epoch", "reason"].includes(key))) {
            throw new TrajectoryProtocolError("context_epoch_closed contains unknown fields");
        }
        if (!isRecord(payload.epoch)
            || (payload.reason !== "run_completed"
                && payload.reason !== "run_failed"
                && payload.reason !== "run_cancelled")) {
            throw new TrajectoryProtocolError("context_epoch_closed payload is invalid");
        }
        assertEpochRange(payload.epoch);
    }
}

function assertModelContextJson(value: unknown, label: string, depth = 0): asserts value is JsonValue | null {
    if (value === null) return;
    if (depth > 64) throw new TrajectoryProtocolError(`${label} exceeds maximum depth`);
    if (typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
        if (Number.isFinite(value)) return;
        throw new TrajectoryProtocolError(`${label} contains a non-finite number`);
    }
    if (Array.isArray(value)) {
        for (const item of value) assertModelContextJson(item, label, depth + 1);
        return;
    }
    if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) {
            assertModelContextJson(item, `${label}.${key}`, depth + 1);
        }
        return;
    }
    throw new TrajectoryProtocolError(`${label} must be JSON serializable`);
}

function assertEpochState(value: Record<string, unknown>): void {
    if (value.version !== 1
        || !Number.isSafeInteger(value.number) || (value.number as number) < 0
        || !Number.isSafeInteger(value.conversationStartIndex) || (value.conversationStartIndex as number) < 0
        || !Number.isSafeInteger(value.openedAtSequence) || (value.openedAtSequence as number) < 0) {
        throw new TrajectoryProtocolError("Epoch state is invalid");
    }
}

function assertEpochRange(value: Record<string, unknown>): void {
    if (!Number.isSafeInteger(value.number) || (value.number as number) < 0
        || !Number.isSafeInteger(value.conversationStartIndex) || (value.conversationStartIndex as number) < 0
        || !Number.isSafeInteger(value.conversationEndIndexExclusive) || (value.conversationEndIndexExclusive as number) < (value.conversationStartIndex as number)
        || !Number.isSafeInteger(value.closedThroughSequence) || (value.closedThroughSequence as number) < 0) {
        throw new TrajectoryProtocolError("Epoch range is invalid");
    }
}

function assertMetadata(value: unknown): asserts value is TrajectoryEventMetadata & {
    readonly eventType: TrajectoryEventType;
    readonly payload: TrajectoryEventPayload;
} {
    if (!isRecord(value)) throw new TrajectoryProtocolError("event draft must be an object");
    assertNonEmptyString(value.goalId, "goalId");
    assertNonEmptyString(value.runId, "runId");
    if (typeof value.phase !== "string" || !TRAJECTORY_PHASES.has(value.phase as TrajectoryPhase)) {
        throw new TrajectoryProtocolError("phase is invalid");
    }
    if (typeof value.eventType !== "string" || !TRAJECTORY_EVENT_TYPES.has(value.eventType as TrajectoryEventType)) {
        throw new TrajectoryProtocolError("eventType is invalid");
    }
    assertOptionalNonEmptyString(value.executionUnitId, "executionUnitId");
    assertOptionalNonEmptyString(value.actionId, "actionId");
    assertOptionalNonEmptyString(value.parentEventId, "parentEventId");
    assertOptionalNonEmptyString(value.programId, "programId");
    if (value.callIndex !== undefined
        && (!Number.isSafeInteger(value.callIndex) || (value.callIndex as number) < 0)) {
        throw new TrajectoryProtocolError("callIndex must be a non-negative integer");
    }
    if ((value.programId === undefined) !== (value.callIndex === undefined)) {
        throw new TrajectoryProtocolError("programId and callIndex must occur together");
    }
    if (
        value.stepIndex !== undefined
        && (typeof value.stepIndex !== "number"
            || !Number.isInteger(value.stepIndex)
            || value.stepIndex < 0)
    ) {
        throw new TrajectoryProtocolError("stepIndex must be a non-negative integer");
    }
    assertPayload(value.payload, value.eventType);
}

/**
 * 校验事件草稿的运行时协议。
 *
 * @param draft - 可能来自外部边界的未知值。
 * @returns 无返回值；成功时 TypeScript 将其收窄为 `TrajectoryEventDraft`。
 * @throws `TrajectoryProtocolError` 当元数据、事件类型或事实 payload 非法时抛出。
 */
export function assertValidTrajectoryEventDraft(
    draft: unknown,
): asserts draft is TrajectoryEventDraft {
    assertMetadata(draft);
}

function assertEnvelope(value: unknown): asserts value is TrajectoryEvent {
    assertMetadata(value);
    const envelope = value as unknown as Record<string, unknown>;
    if (envelope.eventSchemaVersion !== 1) {
        throw new TrajectoryProtocolError("eventSchemaVersion must be 1");
    }
    assertNonEmptyString(envelope.eventId, "eventId");
    if (
        typeof envelope.sequence !== "number"
        || !Number.isInteger(envelope.sequence)
        || envelope.sequence <= 0
    ) {
        throw new TrajectoryProtocolError("sequence must be a positive integer");
    }
    assertNonEmptyString(envelope.occurredAt, "occurredAt");
    if (Number.isNaN(Date.parse(envelope.occurredAt))) {
        throw new TrajectoryProtocolError("occurredAt must be an ISO date string");
    }
}

function freezeDeep<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null) return value;
    if (seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) {
        freezeDeep(child, seen);
    }
    return Object.freeze(value);
}

/**
 * 将带服务端元数据的事件复制并冻结。
 *
 * @param event - 已通过协议校验的事件。
 * @returns 与输入无共享可变引用的深度冻结事件。
 * @throws 事件元数据不符合协议时抛出 `TrajectoryProtocolError`。
 */
export function freezeTrajectoryEvent(event: TrajectoryEvent): Readonly<TrajectoryEvent> {
    assertEnvelope(event);
    return freezeDeep(structuredClone(event));
}

/**
 * 在测试 recorder 或 Sink 实现中为草稿分配最小事件信封。
 *
 * @param draft - 已发生事实的事件草稿。
 * @param sequence - 当前 Run 内的正整数序号。
 * @param eventId - 可选的稳定事件 ID；省略时生成进程内唯一 ID。
 * @param occurredAt - 可选的 ISO 时间；省略时使用当前 UTC 时间。
 * @returns 深度冻结的事件。
 * @throws 草稿或分配参数违反协议时抛出 `TrajectoryProtocolError`。
 */
export function allocateImmutableEvent(
    draft: TrajectoryEventDraft,
    sequence: number,
    eventId = createLocalId("event"),
    occurredAt = new Date().toISOString(),
): Readonly<TrajectoryEvent> {
    assertValidTrajectoryEventDraft(draft);
    if (!Number.isInteger(sequence) || sequence <= 0) {
        throw new TrajectoryProtocolError("sequence must be a positive integer");
    }
    assertNonEmptyString(eventId, "eventId");
    assertNonEmptyString(occurredAt, "occurredAt");
    const event = {
        ...structuredClone(draft),
        eventSchemaVersion: 1 as const,
        eventId,
        sequence,
        occurredAt,
    } as TrajectoryEvent;
    return freezeTrajectoryEvent(event);
}

/**
 * 为 Diagnostic Trace 草稿补充进程内身份并深度冻结。
 *
 * @param input - 已完成脱敏和大小限制的诊断字段。
 * @returns 可安全交给 `DiagnosticTraceSink` 的不可变记录。
 * @example
 * ```ts
 * const record = allocateDiagnosticTraceRecord({
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     kind: "runtime_error",
 *     payload: { code: "EIO" },
 * });
 * ```
 */
export function allocateDiagnosticTraceRecord(
    input: Omit<TraceRecord, "traceSchemaVersion" | "traceId" | "occurredAt"> & {
        readonly occurredAt?: string;
        readonly traceId?: string;
    },
): Readonly<TraceRecord> {
    const record = {
        ...structuredClone(input),
        traceSchemaVersion: 1 as const,
        traceId: input.traceId ?? createLocalId("trace"),
        occurredAt: input.occurredAt ?? new Date().toISOString(),
    } as TraceRecord;
    return freezeDeep(record);
}

/**
 * 按稳定事件类型分类，供只读消费者构建展示分组。
 *
 * @param event - Domain Event 或带事件类型的最小对象。
 * @returns 不依赖 payload 文本的稳定分类。
 */
export function classifyTrajectoryEvent(
    event: Pick<TrajectoryEvent, "eventType">,
): TrajectoryEventCategory {
    switch (event.eventType) {
        case "goal_created":
        case "run_started":
        case "run_created":
        case "run_resumed":
        case "plan_mode_entered":
        case "ask_user_answered":
        case "ask_user_cancelled":
        case "task_approved":
        case "task_feedback_received":
            return "lifecycle";
        case "goal_plan_updated":
            return "decision";
        case "context_epoch_advanced":
            return "decision";
        case "decision_received":
        case "think_requested":
        case "think_completed":
        case "model_repair_attempt_started":
        case "model_repair_feedback_recorded":
        case "model_request_retry_recorded":
        case "model_context_frame":
        case "model_response_received":
        case "context_lookup_requested":
        case "context_lookup_completed":
        case "context_lookup_not_found":
        case "context_lookup_failed":
            return "decision";
        case "memory_patch_accepted":
            return "memory";
        case "action_staged":
        case "program_started":
        case "program_settled":
        case "action_approved":
        case "tool_grant_revoked":
        case "sandbox_grant_revoked":
        case "action_rejected":
        case "action_recovered":
            return "action";
        case "tool_started":
        case "tool_attempt_started":
        case "tool_attempt_failed":
        case "program_time_reserved":
        case "tool_finished":
            return "tool";
        case "observation_recorded":
            return "observation";
        case "run_waiting":
        case "run_completed":
        case "run_failed":
        case "run_cancelled":
        case "execution_error":
        case "context_epoch_closed":
            return "terminal";
        case "state_committed":
            return "commit";
    }
}

/**
 * 将事件映射为不包含 payload 的只读展示投影。
 *
 * @param event - 已完成协议校验的不可变事件。
 * @returns 新建且冻结的展示投影。
 */
export function projectTrajectoryEvent(
    event: TrajectoryEvent,
): Readonly<TrajectoryEventProjection> {
    const projection: TrajectoryEventProjection = {
        eventId: event.eventId,
        sequence: event.sequence,
        eventType: event.eventType,
        category: classifyTrajectoryEvent(event),
        phase: event.phase,
        ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
        ...(event.actionId === undefined ? {} : { actionId: event.actionId }),
        ...(event.parentEventId === undefined ? {} : { parentEventId: event.parentEventId }),
        ...(event.programId === undefined ? {} : { programId: event.programId }),
        ...(event.callIndex === undefined ? {} : { callIndex: event.callIndex }),
    };
    return Object.freeze(projection);
}

/**
 * 按最新有效 Goal Snapshot 的提交边界分类事件。
 *
 * @param events - 按同一 Goal/Run 读取的 Domain Events。
 * @param committedThroughSequence - Snapshot 声明的最大已提交序号。
 * @returns 深度冻结的分类结果；不会修改输入事件或根据 marker 推导边界。
 * @throws 提交边界不是非负整数时抛出 `TrajectoryProtocolError`。
 */
export function classifyTrajectoryTail(
    events: readonly TrajectoryEvent[],
    committedThroughSequence: number,
): Readonly<TrajectoryReadResult> {
    if (
        !Number.isInteger(committedThroughSequence)
        || committedThroughSequence < 0
    ) {
        throw new TrajectoryProtocolError(
            "committedThroughSequence must be a non-negative integer",
        );
    }

    const committed: TrajectoryEvent[] = [];
    const uncommittedTail: TrajectoryEvent[] = [];

    for (const event of events) {
        const immutableEvent = freezeTrajectoryEvent(event);

        if (immutableEvent.sequence <= committedThroughSequence) {
            committed.push(immutableEvent);
        } else {
            uncommittedTail.push(immutableEvent);
        }
    }

    return Object.freeze({
        committed: Object.freeze(committed),
        uncommittedTail: Object.freeze(uncommittedTail),
    });
}

/**
 * 已提交且与当前阶段、Epoch 和注册 Section 身份匹配的模型上下文 frame 查询。
 *
 * @example
 * ```ts
 * const query: CommittedModelContextFrameQuery = {
 *     goalId: "goal-1", runId: "run-1", committedThroughSequence: 12,
 *     stage: "decide", epochNumber: 2, conversationStartPosition: 4,
 *     sectionIdentities: [identity],
 * };
 * ```
 */
export interface CommittedModelContextFrameQuery {
    readonly goalId: string;
    readonly runId: string;
    readonly committedThroughSequence: number;
    readonly stage: ModelContextStage;
    readonly epochNumber: number;
    readonly conversationStartPosition: number;
    readonly sectionIdentities: readonly ModelContextSectionIdentity[];
}

/**
 * 从 Trajectory 事件中提取可用作比较基线的已提交模型上下文 frame。
 *
 * @remarks
 * 提交边界、Goal/Run 身份、推理阶段、Epoch 和 Conversation 起点均由调用方明确
 * 指定。未知 Section 或其来源、角色、顺序、模板身份与当前注册表不符时，恢复直接
 * 失败；它不能成为比较基线。该函数不解析更新文本，也不推导 Runtime 状态。
 *
 * @param events - 从 Trajectory Store 读取的事件；其中可能含未提交 tail。
 * @param query - 恢复时从 Snapshot 与当前 Section Registry 得到的查询条件。
 * @returns 按事件序号排列的匹配 frame，且只保留身份匹配的 Section 更新。
 * @throws 提交边界或查询位置非法、Section 注册身份冲突时抛出 `TrajectoryProtocolError`。
 * @example
 * ```ts
 * const frames = selectCommittedModelContextFrames(events, {
 *     goalId: "goal-1", runId: "run-1", committedThroughSequence: 12,
 *     stage: "decide", epochNumber: 2, conversationStartPosition: 4,
 *     sectionIdentities: registryIdentities,
 * });
 * ```
 */
export function selectCommittedModelContextFrames(
    events: readonly TrajectoryEvent[],
    query: CommittedModelContextFrameQuery,
): readonly Extract<TrajectoryEvent, { readonly eventType: "model_context_frame" }>[] {
    if (!Number.isSafeInteger(query.committedThroughSequence)
        || query.committedThroughSequence < 0
        || !Number.isSafeInteger(query.epochNumber)
        || query.epochNumber < 0
        || !Number.isSafeInteger(query.conversationStartPosition)
        || query.conversationStartPosition < 0
        || (query.stage !== "decide" && query.stage !== "think")) {
        throw new TrajectoryProtocolError("model context frame query is invalid");
    }

    const identities = new Map<string, ModelContextSectionIdentity>();
    for (const identity of query.sectionIdentities) {
        if (identities.has(identity.sectionId)) {
            throw new TrajectoryProtocolError("model context section registry contains duplicate identity");
        }
        identities.set(identity.sectionId, identity);
    }

    const frames: Extract<TrajectoryEvent, { readonly eventType: "model_context_frame" }>[] = [];
    for (const rawEvent of events) {
        if (rawEvent.sequence > query.committedThroughSequence
            || rawEvent.goalId !== query.goalId
            || rawEvent.runId !== query.runId
            || rawEvent.eventType !== "model_context_frame") {
            continue;
        }
        const event = freezeTrajectoryEvent(rawEvent);
        if (event.eventType !== "model_context_frame"
            || event.payload.stage !== query.stage
            || event.payload.epochNumber !== query.epochNumber
            || event.payload.conversationPosition < query.conversationStartPosition) {
            continue;
        }
        const sections = event.payload.sections.filter((section) => {
            const registered = identities.get(section.sectionId);
            if (registered === undefined) {
                throw new TrajectoryProtocolError(
                    `model context frame references unregistered section: ${section.sectionId}`,
                );
            }
            if (registered.order !== section.order
                || registered.source !== section.source
                || registered.role !== section.role
                || registered.templateId !== section.templateId) {
                throw new TrajectoryProtocolError(
                    `model context frame section identity does not match registry: ${section.sectionId}`,
                );
            }
            return true;
        });
        frames.push(freezeTrajectoryEvent({
            ...event,
            payload: { ...event.payload, sections },
        }) as Extract<TrajectoryEvent, { readonly eventType: "model_context_frame" }>);
    }
    return Object.freeze(frames.sort((left, right) => left.sequence - right.sequence));
}

let localIdCounter = 0;

function createLocalId(prefix: string): string {
    localIdCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${localIdCounter.toString(36)}`;
}

/** 创建隔离诊断失败的 no-op TraceSink。 */
export function createNoopDiagnosticTraceSink(): DiagnosticTraceSink {
    return {
        async append(record) {
            freezeDeep(structuredClone(record));
        },
    };
}
