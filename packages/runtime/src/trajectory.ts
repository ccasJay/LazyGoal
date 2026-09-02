import { createHash } from "node:crypto";

import type {
    AgentDecision,
    ExecutionErrorCode,
    JsonValue,
    Observation,
    ToolCallAction,
    MemoryPatchAcceptedPayload,
    ModelContextEpochState,
} from "./domain";
import type {
    ContextLookupRequest,
    ContextLookupResult,
} from "./context-retrieval";
import type { GoalStore } from "./goal-store";
import type { ToolObservation } from "./tool";

/** Trajectory 事件允许出现的 Runtime 业务阶段。 */
export type TrajectoryPhase =
    | "gathering_context"
    | "planning"
    | "executing";

/** Domain Event 的稳定事件类型集合。 */
export type TrajectoryEventPayload =
    | {
        readonly type: "goal_created";
        readonly intent: string;
    }
    | { readonly type: "run_started" }
    | { readonly type: "run_resumed" }
    | {
        readonly type: "preparation_input_recorded";
        readonly messageIndex: number;
        readonly contentHash: `sha256:${string}`;
    }
    | {
        readonly type: "preparation_result";
        readonly result: "question" | "context_ready" | "task_proposal" | "context_lookup" | "context_checkpoint";
    }
    | {
        readonly type: "decision_received";
        readonly decision: AgentDecision;
    }
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
        readonly reason: "conversation_pruned" | "input_threshold" | "planning_approved";
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
    }
    | {
        readonly type: "action_approved";
        readonly actionId: string;
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

/** Preparation 用户输入在 Trajectory 中的可验证来源投影。 */
export interface PreparationInputEvidence {
    /** 记录该 provenance event 的 Trajectory sequence。 */
    readonly sequence: number;
    /** 指向 Goal Conversation 中原始 user 消息的数组索引。 */
    readonly messageIndex: number;
    /** 原始消息正文的 UTF-8 SHA-256 摘要。 */
    readonly contentHash: `sha256:${string}`;
}

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
 * @returns 已提交事件与未提交 tail；缺少 Snapshot 或 Run 不匹配时全部事件归入 tail。
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
    const committedThroughSequence = goal?.state.run.id === query.runId
        ? goal.state.run.committedThroughSequence ?? 0
        : 0;

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
    "run_resumed",
    "preparation_input_recorded",
    "preparation_result",
    "decision_received",
    "context_lookup_requested",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
    "memory_patch_accepted",
    "action_staged",
    "action_approved",
    "action_rejected",
    "action_recovered",
    "tool_started",
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
    "gathering_context",
    "planning",
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

function assertOptionalNonEmptyString(value: unknown, field: string): void {
    if (value !== undefined) assertNonEmptyString(value, field);
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
    if (eventType === "context_epoch_advanced") {
        if (Object.keys(payload).some((key) => ![
            "type", "closedEpoch", "openedEpoch", "reason", "memoryRevisionEventId",
        ].includes(key))) {
            throw new TrajectoryProtocolError("context_epoch_advanced contains unknown fields");
        }
        if (!isRecord(payload.closedEpoch) || !isRecord(payload.openedEpoch)
            || (payload.reason !== "conversation_pruned"
                && payload.reason !== "input_threshold"
                && payload.reason !== "planning_approved")) {
            throw new TrajectoryProtocolError("context_epoch_advanced payload is invalid");
        }
        assertEpochRange(payload.closedEpoch);
        assertEpochState(payload.openedEpoch);
        if (payload.memoryRevisionEventId !== undefined) {
            assertNonEmptyString(payload.memoryRevisionEventId, "memoryRevisionEventId");
        }
    }
    if (eventType === "preparation_input_recorded") {
        if (Object.keys(payload).some((key) => ![
            "type", "messageIndex", "contentHash",
        ].includes(key))) {
            throw new TrajectoryProtocolError(
                "preparation_input_recorded contains unknown fields",
            );
        }
        if (
            typeof payload.messageIndex !== "number"
            || !Number.isSafeInteger(payload.messageIndex)
            || payload.messageIndex < 0
        ) {
            throw new TrajectoryProtocolError(
                "preparation_input_recorded messageIndex is invalid",
            );
        }
        if (
            typeof payload.contentHash !== "string"
            || !/^sha256:[0-9a-f]{64}$/.test(payload.contentHash)
        ) {
            throw new TrajectoryProtocolError(
                "preparation_input_recorded contentHash is invalid",
            );
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
    if (
        value.stepIndex !== undefined
        && (typeof value.stepIndex !== "number"
            || !Number.isInteger(value.stepIndex)
            || value.stepIndex < 0)
    ) {
        throw new TrajectoryProtocolError("stepIndex must be a non-negative integer");
    }
    assertPayload(value.payload, value.eventType);
    if (
        value.eventType === "preparation_input_recorded"
        && value.phase === "executing"
    ) {
        throw new TrajectoryProtocolError(
            "preparation_input_recorded is not allowed in executing phase",
        );
    }
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
        case "run_resumed":
        case "preparation_input_recorded":
            return "lifecycle";
        case "preparation_result":
        case "context_epoch_advanced":
            return "decision";
        case "decision_received":
        case "context_lookup_requested":
        case "context_lookup_completed":
        case "context_lookup_not_found":
        case "context_lookup_failed":
            return "decision";
        case "memory_patch_accepted":
            return "memory";
        case "action_staged":
        case "action_approved":
        case "action_rejected":
        case "action_recovered":
            return "action";
        case "tool_started":
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
