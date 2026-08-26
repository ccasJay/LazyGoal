import type {
    AgentDecision,
    ExecutionErrorCode,
    JsonObject,
    JsonValue,
    Observation,
    ToolCallAction,
} from "./domain";
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
        readonly type: "decision_received";
        readonly decision: AgentDecision;
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
}

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

const TRAJECTORY_EVENT_TYPES: ReadonlySet<TrajectoryEventType> = new Set([
    "goal_created",
    "run_started",
    "run_resumed",
    "decision_received",
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
            return "lifecycle";
        case "decision_received":
            return "decision";
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

let localIdCounter = 0;

function createLocalId(prefix: string): string {
    localIdCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${localIdCounter.toString(36)}`;
}

/**
 * 兼容旧 Runtime 调用方的进程内 no-op Trajectory recorder。
 *
 * @remarks
 * 该实现不保存历史，只生成合法的临时事件以便调用链继续工作；Composition Root
 * 应注入真实 TrajectoryStore，不能把 no-op 结果当作审计数据。
 *
 * @example
 * ```ts
 * const recorder = createNoopTrajectoryRecorder();
 * await recorder.append(draft);
 * ```
 */
export class NoopTrajectoryRecorder implements TrajectorySink {
    private readonly sequences = new Map<string, number>();

    /**
     * @param draft - 需要校验并生成临时 envelope 的事件草稿。
     * @returns 深度冻结的临时事件。
     * @throws 草稿违反 Trajectory 协议时拒绝。
     */
    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        assertValidTrajectoryEventDraft(draft);
        const key = `${draft.goalId}\u0000${draft.runId}`;
        const sequence = (this.sequences.get(key) ?? 0) + 1;
        this.sequences.set(key, sequence);
        return allocateImmutableEvent(draft, sequence, createLocalId("noop-event"));
    }
}

/** 创建不持久化事件但保持调用协议可用的 no-op recorder。 */
export function createNoopTrajectoryRecorder(): TrajectorySink {
    return new NoopTrajectoryRecorder();
}

/** 创建隔离诊断失败的 no-op TraceSink。 */
export function createNoopDiagnosticTraceSink(): DiagnosticTraceSink {
    return {
        async append(record) {
            freezeDeep(structuredClone(record));
        },
    };
}
