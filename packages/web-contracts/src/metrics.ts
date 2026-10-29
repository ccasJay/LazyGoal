import type { InferContract } from "../../contracts/src/index";
import {
    metricsCoverageContract,
    runSessionMetricsContract,
    sessionMetricsSnapshotContract,
} from "./contracts/metrics";

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
export type MetricsCoverage = InferContract<typeof metricsCoverageContract>;

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
export type RunSessionMetrics = InferContract<typeof runSessionMetricsContract>;


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
export type SessionMetricsSnapshot =
    InferContract<typeof sessionMetricsSnapshotContract>;
