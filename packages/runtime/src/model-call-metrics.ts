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
