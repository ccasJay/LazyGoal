/**
 * 一次模型调用开始或结束时追加的指标事实。
 *
 * @remarks
 * 记录不进入 Goal 恢复状态。开始记录用于识别进程中断的未完成调用；结束记录
 * 只保存供应商确认的数值，或明确的用量缺失标记。计时仅保存首个非空文本增量
 * 到模型调用结束之间的单调时钟时长。
 *
 * @example
 * ```ts
 * const started: ModelCallMetricRecord = {
 *     recordType: "call_started",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     callId: "call-1",
 *     occurredAt: new Date().toISOString(),
 * };
 * ```
 */
export type ModelCallMetricRecord = ModelCallStartedMetricRecord
    | ModelCallFinishedMetricRecord;

/** 单次模型调用的稳定归属字段。 */
interface ModelCallMetricIdentity {
    readonly goalId: string;
    readonly runId: string;
    readonly executionUnitId?: string;
    readonly callId: string;
    readonly occurredAt: string;
}

/**
 * 模型调用开始事实。
 *
 * @example
 * ```ts
 * const record: ModelCallStartedMetricRecord = {
 *     recordType: "call_started",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     callId: "call-1",
 *     occurredAt: new Date().toISOString(),
 * };
 * ```
 */
export interface ModelCallStartedMetricRecord extends ModelCallMetricIdentity {
    readonly recordType: "call_started";
}

/**
 * 可确认用量；缓存读取数仅在供应商明确上报时存在。
 *
 * @example
 * ```ts
 * const usage: ProviderReportedModelCallUsage = {
 *     source: "provider_reported",
 *     inputTokens: 120,
 *     outputTokens: 24,
 * };
 * ```
 */
export interface ProviderReportedModelCallUsage {
    readonly source: "provider_reported";
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cachedInputTokens?: number;
}

/**
 * 本次调用没有可确认的供应商用量。
 *
 * @example
 * ```ts
 * const usage: UnavailableModelCallUsage = { source: "unavailable" };
 * ```
 */
export interface UnavailableModelCallUsage {
    readonly source: "unavailable";
}

/**
 * 模型调用结束事实。
 *
 * @example
 * ```ts
 * const record: ModelCallFinishedMetricRecord = {
 *     recordType: "call_finished",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     callId: "call-1",
 *     occurredAt: new Date().toISOString(),
 *     outcome: "completed",
 *     usage: { source: "unavailable" },
 * };
 * ```
 */
export interface ModelCallFinishedMetricRecord extends ModelCallMetricIdentity {
    readonly recordType: "call_finished";
    readonly outcome: "completed" | "failed" | "cancelled";
    readonly usage: ProviderReportedModelCallUsage | UnavailableModelCallUsage;
    readonly decodeDurationMs?: number;
}

/**
 * 按 Goal 与 Run 定位指标事实的读取条件。
 *
 * @example
 * ```ts
 * const query: ModelCallMetricReadQuery = { goalId: "goal-1", runId: "run-1" };
 * ```
 */
export interface ModelCallMetricReadQuery {
    readonly goalId: string;
    readonly runId: string;
}

/**
 * 模型调用指标事实的持久化边界。
 *
 * @remarks
 * Store 只追加调用事实并读取一个 Goal/Run 的全部记录，不负责聚合、去重或改变
 * Goal 恢复状态。读取结果包含开始后尚未结束的调用，交由投影层标记缺失。
 *
 * @example
 * ```ts
 * await store.append(record);
 * const facts = await store.read({ goalId: "goal-1", runId: "run-1" });
 * ```
 */
export interface MetricsStore {
    /**
     * 持久追加一条调用事实。
     *
     * @param record - 仅含归属、结果、数值和计时的不可变事实。
     * @returns 追加完成后 resolve。
     * @throws 无法持久化时 reject；调用方须隔离该故障，不得改变 Goal 结果。
     */
    append(record: ModelCallMetricRecord): Promise<void>;

    /**
     * 读取一个 Goal/Run 的全部调用事实。
     *
     * @param query - 稳定的 Goal 与 Run 身份。
     * @returns 按追加顺序读取的记录；不存在时返回空数组。
     * @throws 记录损坏、身份不匹配或底层读取失败时 reject。
     */
    read(query: ModelCallMetricReadQuery): Promise<readonly ModelCallMetricRecord[]>;
}

/**
 * Agent 向会话指标系统报告模型调用事实的边界。
 *
 * @remarks
 * 实现负责隔离持久化与通知故障；Agent 调用后仍独立捕获异常，确保观测通道
 * 不改变模型调用和 Goal 推进结果。
 *
 * @example
 * ```ts
 * const recorder: ModelCallMetricsRecorder = {
 *     async record(fact) { await store.append(fact); },
 * };
 * ```
 */
export interface ModelCallMetricsRecorder {
    /**
     * 报告一次模型调用开始或结束的事实。
     *
     * @param fact - 不含 Prompt、响应正文或凭据的调用记录。
     * @returns 记录已交给指标系统后 resolve。
     * @throws 指标接收或持久化失败时可以 reject；调用方必须将该错误与执行结果隔离。
     */
    record(fact: ModelCallMetricRecord): Promise<void>;
}

/** 可检测但未能写入模型调用事实的指标缺口。 */
export interface ModelCallMetricsGap {
    readonly goalId: string;
    readonly runId: string;
    readonly callId: string;
}

/**
 * Goal 指标历史覆盖标记及可检测的调用缺口。
 *
 * @example
 * ```ts
 * const coverage: ModelCallMetricsCoverage = {
 *     goalId: "goal-1", historyCovered: true, gaps: [],
 * };
 * ```
 */
export interface ModelCallMetricsCoverage {
    /** Session 的稳定 Goal 标识。 */
    readonly goalId: string;
    /** Goal 首次接入指标时，既有历史是否已全部纳入采集。 */
    readonly historyCovered: boolean;
    /** 可检测到但没有对应完整调用事实的指标写入缺口。 */
    readonly gaps: readonly ModelCallMetricsGap[];
}

/**
 * 指标覆盖标记与写入缺口的持久化边界。
 *
 * @example
 * ```ts
 * await coverageStore.initializeGoal("goal-1", true);
 * await coverageStore.recordGap({ goalId: "goal-1", runId: "run-1", callId: "call-1" });
 * ```
 */
export interface ModelCallMetricsCoverageStore {
    /**
     * 首次为 Goal 建立历史覆盖状态；后续调用不得覆盖已有状态。
     *
     * @param goalId - Session 的稳定标识。
     * @param historyCovered - 新建 Goal 传 `true`，首次接入的历史 Goal 传 `false`。
     * @throws 覆盖事实无法持久化时 reject。
     */
    initializeGoal(goalId: string, historyCovered: boolean): Promise<void>;

    /**
     * 持久记录一次指标事实写入失败。
     *
     * @param gap - 发生写入失败的 Goal、Run 与调用标识。
     * @throws 缺口标记无法持久化时 reject。
     */
    recordGap(gap: ModelCallMetricsGap): Promise<void>;

    /**
     * 读取 Goal 的历史覆盖标记与已知写入缺口。
     *
     * @param goalId - Session 的稳定标识。
     * @returns 持久化状态；尚无任何标记时返回 `undefined`。
     * @throws 覆盖记录损坏或底层读取失败时 reject。
     */
    readCoverage(goalId: string): Promise<ModelCallMetricsCoverage | undefined>;
}
