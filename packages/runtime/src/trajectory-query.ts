import type { JsonValue, Observation } from "./domain";
import { canonicalJson } from "../../contracts/src/index";
import {
    projectTrajectoryEvent,
    type TrajectoryEvent,
    type TrajectoryEventCategory,
    type TrajectoryEventType,
} from "./trajectory";

/**
 * 一次 Trajectory 查询固定的可见性边界。
 *
 * @remarks
 * `committedThroughSequence` 来自 Goal Snapshot，是该次浏览会话唯一允许看到的最大
 * 序号。查询 Port 不得根据索引、事件 marker 或当前 Run 状态自行扩大边界。
 *
 * @example
 * ```ts
 * const context: TrajectoryQueryContext = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     committedThroughSequence: 120,
 * };
 * ```
 */
export interface TrajectoryQueryContext {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** Run 稳定标识。 */
    readonly runId: string;
    /** 快照提交边界；查询只能返回序号不大于该值的事件。 */
    readonly committedThroughSequence: number;
}

/**
 * 一条事件与 Action、模型调用和 Program 的稳定关联。
 *
 * @remarks
 * 关联只来自事件自身携带的事实；无法确定时省略对应字段，不得按时间、相邻事件或
 * 执行单元位置推断。调用方可以用 `programId` 再解析 Program 的父 Action。
 *
 * @example
 * ```ts
 * const relation = projectTrajectoryEventCorrelation(event);
 * if (relation.actionId !== undefined) console.log(relation.actionId);
 * ```
 */
export interface TrajectoryEventCorrelation {
    /** 事件所属 Action。 */
    readonly actionId?: string;
    /** 产生该事实的模型调用；仅模型事件携带。 */
    readonly modelCallId?: string;
    /** 事件所属 Program。 */
    readonly programId?: string;
    /** Program 事件记录的父 Action。 */
    readonly parentActionId?: string;
}

/**
 * 提取一条事件自身携带的关联事实。
 *
 * @param event - 已提交边界内的不可变事件。
 * @returns 只包含事件能够直接确定的关联字段。
 *
 * @example
 * ```ts
 * const relation = projectTrajectoryEventCorrelation(event);
 * console.log(relation.programId, relation.parentActionId);
 * ```
 */
export function projectTrajectoryEventCorrelation(
    event: TrajectoryEvent,
): TrajectoryEventCorrelation {
    const actionId = event.actionId
        ?? (event.eventType === "action_staged" ? event.payload.action.actionId : undefined)
        ?? (event.eventType === "decision_received" && event.payload.decision.kind === "tool_call"
            ? event.payload.decision.action.actionId
            : undefined)
        ?? ("actionId" in event.payload ? event.payload.actionId : undefined);
    const modelCallId = event.eventType === "model_response_received"
        ? event.payload.modelCallId
        : event.eventType === "model_context_frame" ? event.payload.modelCallId : undefined;
    const programId = event.programId
        ?? (event.eventType === "program_started" || event.eventType === "program_settled"
            || event.eventType === "program_time_reserved" ? event.payload.programId : undefined);
    const parentActionId = event.eventType === "program_started" || event.eventType === "program_settled"
        ? event.payload.parentActionId : undefined;

    return {
        ...(actionId === undefined ? {} : { actionId }),
        ...(modelCallId === undefined ? {} : { modelCallId }),
        ...(programId === undefined ? {} : { programId }),
        ...(parentActionId === undefined ? {} : { parentActionId }),
    };
}

/**
 * 列表投影可用的关联事件。
 *
 * @remarks
 * 关联事件只用于补全列表摘要中的输入、观察、模型调用与 Program 父 Action；
 * 它们的序号必须落在同一个 `TrajectoryQueryContext` 内。
 *
 * @example
 * ```ts
 * const summary = projectTrajectoryEventSummary(started, {
 *     toolFinished,
 *     programStarted,
 * });
 * ```
 */
export interface TrajectoryEventSummaryRelations {
    /** 与 `tool_started` 同一 Action 的结束事件。 */
    readonly toolFinished?: Extract<TrajectoryEvent, { readonly eventType: "tool_finished" }>;
    /** 与 Decide 或 Think 决策同一执行单元的前置模型上下文帧。 */
    readonly modelContextFrame?: Extract<TrajectoryEvent, { readonly eventType: "model_context_frame" }>;
    /** 当前 `programId` 对应的启动事件。 */
    readonly programStarted?: Extract<TrajectoryEvent, { readonly eventType: "program_started" }>;
}

/**
 * 不读取完整 payload 的轨迹列表投影。
 *
 * @remarks
 * 摘要字段由 Runtime 统一生成，Browser 只负责展示。`preview` 与
 * `inputPreview`/`resultPreview` 都有固定上限；`previewTruncated` 只描述 `preview`。
 *
 * @example
 * ```ts
 * const entry: TrajectoryEventSummary = projectTrajectoryEventSummary(event);
 * console.log(entry.title, entry.preview);
 * ```
 */
export interface TrajectoryEventSummary {
    /** 事件稳定身份。 */
    readonly eventId: string;
    /** Run 内单调序号。 */
    readonly sequence: number;
    /** 事件发生时间。 */
    readonly occurredAt: string;
    /** 事件类型。 */
    readonly eventType: TrajectoryEventType;
    /** 消费者可见分类。 */
    readonly category: TrajectoryEventCategory;
    /** 执行单元归属；缺失表示未归属。 */
    readonly executionUnitId?: string;
    /** Step 序号。 */
    readonly stepIndex?: number;
    /** Action 关联。 */
    readonly actionId?: string;
    /** 模型调用关联。 */
    readonly modelCallId?: string;
    /** 模型阶段。 */
    readonly modelStage?: "think" | "decide";
    /** Program 关联。 */
    readonly programId?: string;
    /** Program 内部调用序号。 */
    readonly callIndex?: number;
    /** Program 的父 Action。 */
    readonly parentActionId?: string;
    /** 有界标题。 */
    readonly title: string;
    /** 有界预览。 */
    readonly preview: string;
    /** `preview` 是否被截断。 */
    readonly previewTruncated: boolean;
    /** 工具输入的有界预览。 */
    readonly inputPreview?: string;
    /** 观察结果的有界预览。 */
    readonly resultPreview?: string;
}

/**
 * 生成一条事件的列表摘要。
 *
 * @param event - 已提交边界内的不可变事件。
 * @param relations - 同一可见范围内的关联事件；省略时不补全跨事件字段。
 * @returns 带有界文本与关联字段的只读摘要。
 *
 * @example
 * ```ts
 * const summary = projectTrajectoryEventSummary(event);
 * console.log(summary.sequence, summary.category);
 * ```
 */
export function projectTrajectoryEventSummary(
    event: TrajectoryEvent,
    relations: TrajectoryEventSummaryRelations = {},
): TrajectoryEventSummary {
    let preview = canonicalJson(event.payload);
    if (event.eventType === "decision_received") {
        const decision = event.payload.decision;
        preview = decision.kind === "tool_call"
            ? "Tool call only"
            : "summary" in decision ? decision.summary : canonicalJson(decision);
    }
    if (event.eventType === "run_created") preview = `Run created, ${event.payload.mode}`;
    if (event.eventType === "run_started") preview = "Run started";
    if (event.eventType === "goal_created") preview = event.payload.intent;
    if (event.eventType === "tool_attempt_started") preview = `Tool attempt ${event.payload.attempt}`;
    if (event.eventType === "execution_error") preview = `${event.payload.code}: ${event.payload.message}`;
    if (event.eventType === "model_repair_feedback_recorded") {
        preview = `${event.payload.stage} rejected: ${event.payload.feedback.issues.slice(0, 3).map(issue => {
            const path = issue.path.join(".").replace(/^result\.action\./, "") || "response";
            return issue.code === "missing_field" ? `${path} is required`
                : issue.code === "extra_field" ? `Remove ${path}`
                    : `${path}: ${issue.message}`;
        }).join("; ")}${event.payload.feedback.issues.length > 3 ? ` (+${event.payload.feedback.issues.length - 3} more)` : ""}`;
    }
    if (event.eventType === "model_response_received") preview = event.payload.message.content || "Native model response";
    if (event.eventType === "model_context_frame") {
        preview = event.payload.sections.map(section => section.content).join("\n") || "No dynamic context updates";
    }
    if (event.eventType === "model_repair_attempt_started") {
        preview = event.payload.attempt === 1
            ? `${event.payload.stage}, Model request 1`
            : `${event.payload.stage}, Output retry ${event.payload.attempt}`;
    }
    if (event.eventType === "context_epoch_closed") preview = "Context epoch closed";
    if (event.eventType === "memory_patch_accepted") preview = "Working memory updated";
    if (event.eventType === "think_completed") preview = event.payload.output;
    if (event.eventType === "think_requested") preview = event.payload.goal;

    const relation = projectTrajectoryEventCorrelation(event);
    const finished = event.eventType === "tool_started" ? relations.toolFinished : undefined;
    const inputPreview = event.eventType === "tool_started" ? canonicalJson(event.payload.input) : undefined;
    const observation = finished?.payload.observation
        ?? (event.eventType === "tool_finished" ? event.payload.observation : undefined);
    const resultPreview = observation === undefined ? undefined : observationPreview(observation);
    const modelStage = event.eventType === "model_repair_attempt_started"
        || event.eventType === "model_repair_feedback_recorded"
        || event.eventType === "model_context_frame"
        || event.eventType === "model_response_received"
        ? event.payload.stage
        : undefined;
    const modelCallId = event.eventType === "model_response_received"
        ? event.payload.modelCallId
        : event.eventType === "model_context_frame"
            ? event.payload.modelCallId
            : event.eventType === "decision_received" || event.eventType === "think_completed"
                ? relations.modelContextFrame?.payload.modelCallId
                : undefined;
    const parentActionId = relation.parentActionId ?? relations.programStarted?.payload.parentActionId;
    const toolId = "toolId" in event.payload
        ? event.payload.toolId
        : event.eventType === "decision_received" && event.payload.decision.kind === "tool_call"
            ? event.payload.decision.action.toolId
            : undefined;

    return {
        eventId: event.eventId,
        sequence: event.sequence,
        occurredAt: event.occurredAt,
        eventType: event.eventType,
        category: projectTrajectoryEvent(event).category,
        ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
        ...(event.stepIndex === undefined ? {} : { stepIndex: event.stepIndex }),
        ...(relation.actionId === undefined ? {} : { actionId: relation.actionId }),
        ...(modelCallId === undefined ? {} : { modelCallId }),
        ...(modelStage === undefined ? {} : { modelStage }),
        ...(relation.programId === undefined ? {} : { programId: relation.programId }),
        ...(event.callIndex === undefined ? {} : { callIndex: event.callIndex }),
        ...(parentActionId === undefined ? {} : { parentActionId }),
        title: toolId === undefined ? event.eventType : `${event.eventType}: ${toolId}`,
        preview: preview.slice(0, 800),
        previewTruncated: preview.length > 800,
        ...(inputPreview === undefined ? {} : { inputPreview: inputPreview.slice(0, 400) }),
        ...(resultPreview === undefined ? {} : { resultPreview: resultPreview.slice(0, 500) }),
    };
}

/**
 * Trajectory 分页查询条件。
 *
 * @remarks
 * 游标由查询 Port 生成并绑定水位、过滤条件与索引版本；调用方不得修改或跨
 * `TrajectoryQueryContext` 复用。`limit` 取 1–200。
 *
 * @example
 * ```ts
 * const query: TrajectoryPageQuery = { limit: 100 };
 * ```
 */
export interface TrajectoryPageQuery {
    /** 不透明游标；省略时从当前过滤范围起点开始。 */
    readonly cursor?: string;
    /** 游标方向；省略时按 `forward` 处理。 */
    readonly direction?: "forward" | "backward";
    /** 单页条数，1–200。 */
    readonly limit: number;
    /** 事件分类过滤。 */
    readonly category?: TrajectoryEventCategory;
    /** 执行单元过滤；只匹配显式归属的事件。 */
    readonly executionUnitId?: string;
    /** Action 过滤。 */
    readonly actionId?: string;
    /** 模型调用过滤。 */
    readonly modelCallId?: string;
    /** 最小序号（包含）。 */
    readonly fromSequence?: number;
    /** 最大序号（包含）。 */
    readonly toSequence?: number;
}

/**
 * 一页轨迹摘要及其固定查询水位。
 *
 * @example
 * ```ts
 * const page: TrajectoryPage = await query.queryPage(context, { limit: 100 });
 * console.log(page.total, page.nextCursor);
 * ```
 */
export interface TrajectoryPage {
    /** 本页摘要。 */
    readonly entries: readonly TrajectoryEventSummary[];
    /** 过滤范围内的可见事件总数。 */
    readonly total: number;
    /** 水位内的已提交事件总数。 */
    readonly committedCount: number;
    /** 上一页游标；已到起点时为 `null`。 */
    readonly previousCursor: string | null;
    /** 下一页游标；已到终点时为 `null`。 */
    readonly nextCursor: string | null;
    /** 执行单元定位结果；未请求定位时为 `null`。 */
    readonly locatedSequence: number | null;
    /** 本页绑定的提交水位。 */
    readonly committedThroughSequence: number;
}

/**
 * 一个执行单元的事件页与显式上下文事件。
 *
 * @remarks
 * `entries` 只包含 `executionUnitId` 明确等于目标的事件；前后文事件分别位于
 * `contextBefore` 与 `contextAfter`，不得混入 `entries`。
 *
 * @example
 * ```ts
 * const page = await query.queryExecutionUnitPage(context, unitId, { limit: 100 });
 * console.log(page.entries.length, page.contextBefore.length);
 * ```
 */
export interface TrajectoryExecutionUnitPage {
    /** 显式归属目标执行单元的摘要。 */
    readonly entries: readonly TrajectoryEventSummary[];
    /** 归属事件总数。 */
    readonly total: number;
    /** 下一页游标；已到终点时为 `null`。 */
    readonly nextCursor: string | null;
    /** 执行单元之前的上下文事件。 */
    readonly contextBefore: readonly TrajectoryEventSummary[];
    /** 执行单元之后的上下文事件。 */
    readonly contextAfter: readonly TrajectoryEventSummary[];
}

/**
 * 详情查询可返回的关联事件序号。
 *
 * @example
 * ```ts
 * const detail = await query.readDetail(context, 42);
 * console.log(detail?.related.observation);
 * ```
 */
export interface TrajectoryRelatedEventSequences {
    /** 决策事件序号。 */
    readonly decision?: number;
    /** Action 暂存或开始事件序号。 */
    readonly action?: number;
    /** 工具开始事件序号。 */
    readonly toolStarted?: number;
    /** 工具结束事件序号。 */
    readonly toolFinished?: number;
    /** 已提交 Observation 事件序号。 */
    readonly observation?: number;
}

/**
 * 外置 payload 的内容寻址引用。
 *
 * @remarks
 * `sha256` 是规范 JSON 字节的摘要；`bytes` 是原始字节数。引用本身不包含 payload。
 *
 * @example
 * ```ts
 * const reference: TrajectoryPayloadReference = {
 *     sha256: "a".repeat(64),
 *     bytes: 131072,
 *     encoding: "canonical-json",
 * };
 * ```
 */
export interface TrajectoryPayloadReference {
    /** 规范 JSON 字节的 SHA-256。 */
    readonly sha256: string;
    /** payload 原始字节数。 */
    readonly bytes: number;
    /** 固定编码标识。 */
    readonly encoding: "canonical-json";
}

/**
 * 单条事件的完整详情与关联定位。
 *
 * @remarks
 * `event` 是物化后的领域事件；`payloadRef` 只在 payload 被外置时出现，
 * 此时 `event.payload` 仍由查询 Port 负责物化。所有关联序号都必须落在同一水位内。
 *
 * @example
 * ```ts
 * const detail = await query.readDetail(context, 42);
 * if (detail !== undefined) console.log(detail.event.eventType);
 * ```
 */
export interface TrajectoryEventDetail {
    /** 物化后的领域事件。 */
    readonly event: TrajectoryEvent;
    /** 事件自身携带的关联。 */
    readonly correlation: TrajectoryEventCorrelation;
    /** 关联事件序号。 */
    readonly related: TrajectoryRelatedEventSequences;
    /** 工具输入；仅 Action 事件提供。 */
    readonly input?: JsonValue;
    /** 已提交 Observation；存在时优先于 `toolFinished`。 */
    readonly observation?: Observation;
    /** 工具开始时间。 */
    readonly toolStartedAt?: string;
    /** 工具结束时间。 */
    readonly toolFinishedAt?: string;
    /** 工具耗时毫秒；无法计算时为 `null`。 */
    readonly toolDurationMs: number | null;
    /** 是否存在已提交 Observation。 */
    readonly observationConfirmed: boolean;
    /** 该事件 payload 的字节数。 */
    readonly payloadBytes: number;
    /** payload 外置引用；内联时为 `undefined`。 */
    readonly payloadRef?: TrajectoryPayloadReference;
}

/**
 * 单个序列桶内的事件统计。
 *
 * @example
 * ```ts
 * const bucket: TrajectoryTimelineBucket = {
 *     startSequence: 1,
 *     endSequence: 100,
 *     eventCount: 37,
 *     eventTypes: { tool_started: 2, observation_recorded: 2 },
 * };
 * ```
 */
export interface TrajectoryTimelineBucket {
    /** 桶起始序号（包含）。 */
    readonly startSequence: number;
    /** 桶结束序号（包含）。 */
    readonly endSequence: number;
    /** 桶内事件数。 */
    readonly eventCount: number;
    /** 按事件类型统计的数量。 */
    readonly eventTypes: Readonly<Record<string, number>>;
}

/**
 * 一个 Run 的时间线概览。
 *
 * @remarks
 * 统计只覆盖水位内的事件；`buckets` 按固定序列跨度切分，不返回事件 payload。
 *
 * @example
 * ```ts
 * const timeline = await query.queryTimeline(context, 100);
 * console.log(timeline.eventCount, timeline.buckets.length);
 * ```
 */
export interface TrajectoryTimeline {
    /** 水位内的事件总数。 */
    readonly eventCount: number;
    /** 可见事件时间范围；无事件时为 `null`。 */
    readonly timeRange: { readonly start: string; readonly end: string } | null;
    /** 固定序列桶。 */
    readonly buckets: readonly TrajectoryTimelineBucket[];
}

/**
 * Browser 读取 Trajectory 的唯一查询边界。
 *
 * @remarks
 * 实现必须以 `TrajectoryQueryContext.committedThroughSequence` 过滤所有结果，
 * 且不得通过索引或事件关联扩大可见范围。分页列表不得读取 payload；
 * 只有 `readDetail` 与 `readPayload` 可以物化单条事件的内容。
 *
 * @example
 * ```ts
 * const page = await query.queryPage(
 *     { goalId: "goal-1", runId: "run-1", committedThroughSequence: 120 },
 *     { limit: 100 },
 * );
 * ```
 */
export interface TrajectoryQueryPort {
    /**
     * @param context - 固定 Goal、Run 与水位。
     * @param query - 分页、过滤与游标条件。
     * @returns 固定水位下的一页摘要。
     * @throws 游标非法、游标越界或索引/JSONL 不一致时拒绝。
     */
    queryPage(
        context: TrajectoryQueryContext,
        query: TrajectoryPageQuery,
    ): Promise<TrajectoryPage>;

    /**
     * @param context - 固定 Goal、Run 与水位。
     * @param sequence - 目标事件序号。
     * @returns 物化详情；事件不存在或超出水位时返回 `undefined`。
     * @throws payload、Blob 或索引不一致时拒绝。
     */
    readDetail(
        context: TrajectoryQueryContext,
        sequence: number,
    ): Promise<TrajectoryEventDetail | undefined>;

    /**
     * @param context - 固定 Goal、Run 与水位。
     * @param executionUnitId - 目标执行单元。
     * @returns 首条显式归属事件的序号；不存在时返回 `undefined`。
     * @throws 索引损坏时拒绝。
     */
    locateExecutionUnit(
        context: TrajectoryQueryContext,
        executionUnitId: string,
    ): Promise<number | undefined>;

    /**
     * @param context - 固定 Goal、Run 与水位。
     * @param executionUnitId - 目标执行单元。
     * @param query - 分页与游标条件。
     * @returns 只含显式归属事件的分页，以及独立的上下文事件。
     * @throws 游标非法或索引损坏时拒绝。
     */
    queryExecutionUnitPage(
        context: TrajectoryQueryContext,
        executionUnitId: string,
        query: TrajectoryPageQuery,
    ): Promise<TrajectoryExecutionUnitPage>;

    /**
     * @param context - 固定 Goal、Run 与水位。
     * @param bucketSize - 每个序列桶覆盖的事件数，1–10,000。
     * @returns 水位内的时间线聚合。
     * @throws 桶大小非法或索引损坏时拒绝。
     */
    queryTimeline(
        context: TrajectoryQueryContext,
        bucketSize: number,
    ): Promise<TrajectoryTimeline>;

    /**
     * @param context - 固定 Goal、Run 与水位。
     * @returns 水位内出现过的模型调用身份，按首次出现顺序去重。
     * @throws 索引损坏时拒绝。
     */
    listModelCallIds(
        context: TrajectoryQueryContext,
    ): Promise<readonly string[]>;

    /**
     * @param context - 固定 Goal、Run 与水位。
     * @param sequence - 目标事件序号。
     * @returns 规范 JSON 文本；payload 内联时由 JSONL 物化。
     * @throws 事件不存在、超出水位或 Blob 缺失时拒绝。
     */
    readPayload(
        context: TrajectoryQueryContext,
        sequence: number,
    ): Promise<string | undefined>;
}

function observationPreview(observation: Observation): string {
    if (observation.kind === "failure") return `${observation.code}: ${observation.message}`;
    if (observation.kind === "rejected") return observation.reason;
    const output = observation.output;
    if (typeof output === "string") return output;
    if (output !== null && typeof output === "object" && "stdout" in output && typeof output.stdout === "string") {
        return output.stdout
            || ("stderr" in output && typeof output.stderr === "string" ? output.stderr : "")
            || ("exitCode" in output ? `Exit code ${output.exitCode}` : "Empty output");
    }
    return JSON.stringify(output);
}
