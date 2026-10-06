/**
 * 会话模型用量与执行指标数据传输对象 (DTO)。
 */

/**
 * 指标覆盖度分类。
 *
 * @example
 * ```ts
 * const coverage: MetricsCoverage = "complete";
 * ```
 */
export type MetricsCoverage = "complete" | "partial" | "unavailable";

/**
 * 单个 Run 的模型用量与步数统计。
 *
 * @example
 * ```ts
 * const runMetrics: RunSessionMetrics = {
 *     runId: "run-1",
 *     stepCount: 2,
 *     reportedCalls: 1,
 *     missingCalls: 0,
 *     inputTokens: 100,
 *     outputTokens: 50,
 *     coverage: "complete",
 *     cacheMeasuredCalls: 1,
 *     cacheExcludedCalls: 0,
 *     cacheHitRate: 0.5,
 *     throughputMeasuredCalls: 1,
 *     throughputExcludedCalls: 0,
 *     tokensPerSecond: 25,
 * };
 * ```
 */
export interface RunSessionMetrics {
    /** Run 标识。 */
    readonly runId: string;
    /** 已提交 Step 数。 */
    readonly stepCount: number;
    /** 确认用量的调用数。 */
    readonly reportedCalls: number;
    /** 缺少用量数据的调用数。 */
    readonly missingCalls: number;
    /** 输入 Token 统计。 */
    readonly inputTokens: number | null;
    /** 输出 Token 统计。 */
    readonly outputTokens: number | null;
    /** 覆盖度。 */
    readonly coverage: MetricsCoverage;
    /** 参与缓存统计的调用数。 */
    readonly cacheMeasuredCalls: number;
    /** 排除在缓存统计外的调用数。 */
    readonly cacheExcludedCalls: number;
    /** 缓存命中率（0-1 之间）。 */
    readonly cacheHitRate: number | null;
    /** 参与吞吐量统计的调用数。 */
    readonly throughputMeasuredCalls: number;
    /** 排除在吞吐量统计外的调用数。 */
    readonly throughputExcludedCalls: number;
    /** 生成速度（Token/秒）。 */
    readonly tokensPerSecond: number | null;
}

/**
 * 整个 Goal 会话的模型指标聚合快照。
 *
 * @example
 * ```ts
 * const snapshot: SessionMetricsSnapshot = {
 *     goalId: "goal-1",
 *     roundCount: 1,
 *     stepCount: 2,
 *     reportedCalls: 1,
 *     missingCalls: 0,
 *     inputTokens: 100,
 *     outputTokens: 50,
 *     coverage: "complete",
 *     cacheMeasuredCalls: 1,
 *     cacheExcludedCalls: 0,
 *     cacheHitRate: 0.5,
 *     throughputMeasuredCalls: 1,
 *     throughputExcludedCalls: 0,
 *     tokensPerSecond: 25,
 *     contextRemainingPercent: 0.8,
 *     runs: [],
 * };
 * ```
 */
export interface SessionMetricsSnapshot {
    /** Goal 标识。 */
    readonly goalId: string;
    /** 提交过 Step 的 Run 数量。 */
    readonly roundCount: number;
    /** 全会话已提交 Step 总数。 */
    readonly stepCount: number;
    /** 确认用量的调用数。 */
    readonly reportedCalls: number;
    /** 缺失用量的调用数。 */
    readonly missingCalls: number;
    /** 全会话输入 Token。 */
    readonly inputTokens: number | null;
    /** 全会话输出 Token。 */
    readonly outputTokens: number | null;
    /** 全会话覆盖度。 */
    readonly coverage: MetricsCoverage;
    /** 参与缓存统计调用数。 */
    readonly cacheMeasuredCalls: number;
    /** 排除缓存统计调用数。 */
    readonly cacheExcludedCalls: number;
    /** 全会话缓存命中率。 */
    readonly cacheHitRate: number | null;
    /** 参与吞吐量统计调用数。 */
    readonly throughputMeasuredCalls: number;
    /** 排除吞吐量统计调用数。 */
    readonly throughputExcludedCalls: number;
    /** 全会话输出速度。 */
    readonly tokensPerSecond: number | null;
    /** 当前 Run 最近一次调用剩余上下文比例（0-1）。 */
    readonly contextRemainingPercent?: number | null;
    /** 历史与当前 Run 指标列表。 */
    readonly runs: readonly RunSessionMetrics[];
}
