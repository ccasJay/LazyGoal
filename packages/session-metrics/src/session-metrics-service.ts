import type { Goal } from "../../runtime/src/domain";
import type { GoalStore } from "../../runtime/src/goal-store";
import type {
    MetricsStore,
    ModelCallFinishedMetricRecord,
    ModelCallMetricRecord,
} from "../../runtime/src/model-call-metrics";

/** 当前用量覆盖程度。 */
export type MetricsCoverage = "complete" | "partial" | "unavailable";

interface RunProjection {
    readonly metrics: RunSessionMetrics;
    readonly cachedInputTokens: number;
    readonly cacheInputTokens: number;
    readonly throughputOutputTokens: number;
    readonly decodeDurationMs: number;
}

/**
 * 一个 Run 的模型用量与 Runtime Step 数投影。
 *
 * @remarks
 * Token 合计只包含成功取得供应商确认用量的调用；没有可确认用量的已结束
 * 或恢复后遗留调用计入 `missingCalls`。无真实上报时 token 合计为 `null`。
 *
 * @example
 * ```ts
 * const run: RunSessionMetrics = {
 *     runId: "run-1", stepCount: 2, reportedCalls: 1, missingCalls: 0,
 *     inputTokens: 12, outputTokens: 8, coverage: "complete",
 *     cacheMeasuredCalls: 1, cacheExcludedCalls: 0, cacheHitRate: 0.25,
 *     throughputMeasuredCalls: 1, throughputExcludedCalls: 0, tokensPerSecond: 8,
 * };
 * ```
 */
export interface RunSessionMetrics {
    /** 当前或已完成 Run 的稳定标识。 */
    readonly runId: string;
    /** 从 Goal 当前状态或已完成 Run 摘要读取的已提交 Step 数。 */
    readonly stepCount: number;
    /** 供应商确认输入与输出用量的模型调用数。 */
    readonly reportedCalls: number;
    /** 无用量、失败、中止或恢复后缺少结束记录的调用数。 */
    readonly missingCalls: number;
    /** 真实上报调用的输入 token 合计；没有上报时为 `null`。 */
    readonly inputTokens: number | null;
    /** 真实上报调用的输出 token 合计；没有上报时为 `null`。 */
    readonly outputTokens: number | null;
    /** 该 Run 的用量覆盖状态。 */
    readonly coverage: MetricsCoverage;
    /** 满足真实缓存读取数及正输入量条件的调用数。 */
    readonly cacheMeasuredCalls: number;
    /** 未满足缓存命中率条件的调用数。 */
    readonly cacheExcludedCalls: number;
    /** 缓存读取 token / 参与调用输入 token；无参与调用时为 `null`。 */
    readonly cacheHitRate: number | null;
    /** 同时具有真实输出 token 与正解码时长的调用数。 */
    readonly throughputMeasuredCalls: number;
    /** 未满足生成速度条件的调用数。 */
    readonly throughputExcludedCalls: number;
    /** 输出 token / 首文本增量至完成的秒数；无参与调用时为 `null`。 */
    readonly tokensPerSecond: number | null;
}

/**
 * 按 Goal 汇总的当前会话模型指标。
 *
 * @example
 * ```ts
 * const snapshot: SessionMetricsSnapshot = {
 *     goalId: "goal-1", roundCount: 1, stepCount: 2,
 *     reportedCalls: 1, missingCalls: 0, inputTokens: 12,
 *     outputTokens: 8, coverage: "complete", cacheMeasuredCalls: 1,
 *     cacheExcludedCalls: 0, cacheHitRate: 0.25, throughputMeasuredCalls: 1,
 *     throughputExcludedCalls: 0, tokensPerSecond: 8, runs: [],
 * };
 * ```
 */
export interface SessionMetricsSnapshot {
    /** Session 的稳定 Goal 标识。 */
    readonly goalId: string;
    /** 至少提交一个 Step 的 Run 数。 */
    readonly roundCount: number;
    /** 当前及历史 Run 已提交 Step 数之和。 */
    readonly stepCount: number;
    /** 供应商确认用量的调用数。 */
    readonly reportedCalls: number;
    /** 缺少可确认用量的调用数。 */
    readonly missingCalls: number;
    /** 真实上报输入 token 合计；无真实用量时为 `null`。 */
    readonly inputTokens: number | null;
    /** 真实上报输出 token 合计；无真实用量时为 `null`。 */
    readonly outputTokens: number | null;
    /** 全会话的用量覆盖状态。 */
    readonly coverage: MetricsCoverage;
    /** 所有 Run 满足缓存命中率条件的调用数。 */
    readonly cacheMeasuredCalls: number;
    /** 所有 Run 未满足缓存命中率条件的调用数。 */
    readonly cacheExcludedCalls: number;
    /** 全会话缓存读取 token / 参与调用输入 token；无参与调用时为 `null`。 */
    readonly cacheHitRate: number | null;
    /** 所有 Run 满足生成速度条件的调用数。 */
    readonly throughputMeasuredCalls: number;
    /** 所有 Run 未满足生成速度条件的调用数。 */
    readonly throughputExcludedCalls: number;
    /** 全会话输出 token / 首文本增量至完成的秒数；无参与调用时为 `null`。 */
    readonly tokensPerSecond: number | null;
    /** 按完成顺序排列的历史 Run，最后一项为当前 Run。 */
    readonly runs: readonly RunSessionMetrics[];
}

/**
 * 会话指标查询服务。
 *
 * @remarks
 * 每次读取都以 GoalStore 的最新快照提供 Run 与 Step 权威，再从独立指标
 * Store 读取事实并重新归约；本服务不缓存累计值，也不修改 Goal。
 *
 * @example
 * ```ts
 * const service = new SessionMetricsService(goalStore, metricsStore);
 * const snapshot = await service.read("goal-1");
 * ```
 */
export class SessionMetricsService {
    /**
     * @param goals - 当前及已完成 Goal 快照的读取边界。
     * @param metrics - 每个 Goal/Run 调用事实的读取边界。
     */
    constructor(
        private readonly goals: Pick<GoalStore, "restore">,
        private readonly metrics: Pick<MetricsStore, "read">,
    ) {}

    /**
     * 读取一个 Goal 的会话汇总与逐 Run 指标。
     *
     * @param goalId - Session 的稳定标识。
     * @returns 指标快照；Goal 不存在时返回 `undefined`。
     * @throws Goal 快照或指标读取失败、事实身份矛盾、重复 Run ID 或安全整数溢出时抛出错误。
     */
    async read(goalId: string): Promise<SessionMetricsSnapshot | undefined> {
        const goal = await this.goals.restore(goalId);
        if (goal === undefined) return undefined;

        const runs = this.runsFor(goal);
        const projections = await Promise.all(runs.map(async ({ runId, stepCount }) => {
            const records = await this.metrics.read({ goalId: goal.id, runId });
            return projectRunMetrics(goal.id, runId, stepCount, records);
        }));
        const runMetrics = projections.map(({ metrics }) => metrics);
        const reportedCalls = sumSafe(runMetrics.map((run) => run.reportedCalls), "reportedCalls");
        const missingCalls = sumSafe(runMetrics.map((run) => run.missingCalls), "missingCalls");
        const reportedRuns = runMetrics.filter((run) => run.inputTokens !== null);
        const inputTokens = reportedRuns.length === 0
            ? null
            : sumSafe(reportedRuns.map((run) => run.inputTokens!), "inputTokens");
        const outputTokens = reportedRuns.length === 0
            ? null
            : sumSafe(reportedRuns.map((run) => run.outputTokens!), "outputTokens");
        const totalCalls = sumSafe(runMetrics.map((run) => run.reportedCalls + run.missingCalls), "callCount");
        const cacheCandidates = sumSafe(runMetrics.map((run) => run.cacheMeasuredCalls), "cacheMeasuredCalls");
        const throughputCandidates = sumSafe(runMetrics.map((run) => run.throughputMeasuredCalls), "throughputMeasuredCalls");
        const cacheInputTokens = sumOptional(projections.map((projection) => projection.cacheInputTokens));
        const cachedInputTokens = sumOptional(projections.map((projection) => projection.cachedInputTokens));
        const cacheAggregateValid = cacheInputTokens !== undefined && cachedInputTokens !== undefined;
        const cacheMeasuredCalls = cacheAggregateValid ? cacheCandidates : 0;
        const cacheExcludedCalls = cacheAggregateValid ? totalCalls - cacheCandidates : totalCalls;
        const cacheHitRate = !cacheAggregateValid || cacheCandidates === 0
            ? null
            : safeRatio(cachedInputTokens, cacheInputTokens);
        const throughputOutputTokens = sumOptional(projections.map((projection) => projection.throughputOutputTokens));
        const decodeDurationMs = sumFinite(projections.map((projection) => projection.decodeDurationMs));
        const throughputAggregateValid = throughputOutputTokens !== undefined && decodeDurationMs !== undefined;
        const throughputMeasuredCalls = throughputAggregateValid ? throughputCandidates : 0;
        const throughputExcludedCalls = throughputAggregateValid ? totalCalls - throughputCandidates : totalCalls;
        const tokensPerSecond = !throughputAggregateValid || throughputCandidates === 0
            ? null
            : safeRatio(throughputOutputTokens, decodeDurationMs / 1000);

        return Object.freeze({
            goalId: goal.id,
            roundCount: runMetrics.filter((run) => run.stepCount > 0).length,
            stepCount: sumSafe(runMetrics.map((run) => run.stepCount), "stepCount"),
            reportedCalls,
            missingCalls,
            inputTokens,
            outputTokens,
            coverage: coverageOf(reportedCalls, missingCalls),
            cacheMeasuredCalls,
            cacheExcludedCalls,
            cacheHitRate,
            throughputMeasuredCalls,
            throughputExcludedCalls,
            tokensPerSecond,
            runs: Object.freeze(runMetrics),
        });
    }

    private runsFor(goal: Goal): readonly { readonly runId: string; readonly stepCount: number }[] {
        const runs = [
            ...(goal.state.completedRuns ?? []).map((run) => ({ runId: run.runId, stepCount: run.stepCount })),
            { runId: goal.state.run.id, stepCount: goal.state.run.stepCount },
        ];
        const ids = new Set<string>();
        for (const run of runs) {
            if (ids.has(run.runId)) {
                throw new SessionMetricsProjectionError(`Duplicate Run ID in Goal snapshot: ${run.runId}`);
            }
            ids.add(run.runId);
        }
        return runs;
    }
}

/**
 * 调用事实不能构成一致指标投影时抛出的错误。
 *
 * @example
 * ```ts
 * try {
 *     await service.read("goal-1");
 * } catch (error) {
 *     if (error instanceof SessionMetricsProjectionError) console.error(error.code);
 * }
 * ```
 */
export class SessionMetricsProjectionError extends Error {
    readonly code = "SESSION_METRICS_PROJECTION_ERROR" as const;

    constructor(message: string) {
        super(message);
        this.name = "SessionMetricsProjectionError";
    }
}

function projectRunMetrics(
    goalId: string,
    runId: string,
    stepCount: number,
    records: readonly ModelCallMetricRecord[],
): RunProjection {
    const calls = new Map<string, {
        started?: string;
        finished?: { readonly serialized: string; readonly record: ModelCallFinishedMetricRecord };
    }>();

    for (const record of records) {
        if (record.goalId !== goalId || record.runId !== runId) {
            throw new SessionMetricsProjectionError(
                `Metric fact identity mismatch for Goal ${goalId} Run ${runId}`,
            );
        }
        const call = calls.get(record.callId) ?? {};
        const serialized = JSON.stringify(record);
        if (record.recordType === "call_started") {
            if (call.started !== undefined && call.started !== serialized) {
                throw new SessionMetricsProjectionError(`Conflicting start facts for call ${record.callId}`);
            }
            call.started = serialized;
        } else {
            if (call.finished !== undefined && call.finished.serialized !== serialized) {
                throw new SessionMetricsProjectionError(`Conflicting finish facts for call ${record.callId}`);
            }
            call.finished = { serialized, record };
        }
        calls.set(record.callId, call);
    }

    let reportedCalls = 0;
    let missingCalls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const cacheValues: { readonly inputTokens: number; readonly cachedInputTokens: number }[] = [];
    const throughputValues: { readonly outputTokens: number; readonly decodeDurationMs: number }[] = [];
    const callCount = calls.size;
    for (const [callId, call] of calls) {
        const finished = call.finished?.record;
        if (finished?.outcome === "completed" && finished.usage.source === "provider_reported") {
            reportedCalls += 1;
            inputTokens = sumSafe([inputTokens, finished.usage.inputTokens], `inputTokens for ${callId}`);
            outputTokens = sumSafe([outputTokens, finished.usage.outputTokens], `outputTokens for ${callId}`);
            const usage = finished.usage;
            if (
                usage.cachedInputTokens !== undefined
                && Number.isSafeInteger(usage.cachedInputTokens)
                && usage.cachedInputTokens >= 0
                && usage.inputTokens > 0
                && usage.cachedInputTokens <= usage.inputTokens
            ) {
                cacheValues.push({ inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens });
            }
            if (finished.decodeDurationMs !== undefined && finished.decodeDurationMs > 0) {
                throughputValues.push({ outputTokens: usage.outputTokens, decodeDurationMs: finished.decodeDurationMs });
            }
        } else {
            missingCalls += 1;
        }
    }
    const summedCacheInputs = sumOptional(cacheValues.map(({ inputTokens }) => inputTokens));
    const summedCachedInputs = sumOptional(cacheValues.map(({ cachedInputTokens }) => cachedInputTokens));
    const cacheAggregateValid = summedCacheInputs !== undefined && summedCachedInputs !== undefined;
    const cacheMeasuredCalls = cacheAggregateValid ? cacheValues.length : 0;
    const cacheHitRate = !cacheAggregateValid || cacheMeasuredCalls === 0
        ? null
        : safeRatio(summedCachedInputs, summedCacheInputs);
    const summedThroughputOutputs = sumOptional(throughputValues.map(({ outputTokens }) => outputTokens));
    const summedDurations = sumFinite(throughputValues.map(({ decodeDurationMs: duration }) => duration));
    const throughputAggregateValid = summedThroughputOutputs !== undefined && summedDurations !== undefined;
    const throughputMeasuredCalls = throughputAggregateValid ? throughputValues.length : 0;
    const tokensPerSecond = !throughputAggregateValid || throughputMeasuredCalls === 0
        ? null
        : safeRatio(summedThroughputOutputs, summedDurations / 1000);

    return Object.freeze({
        metrics: Object.freeze({
            runId,
            stepCount,
            reportedCalls,
            missingCalls,
            inputTokens: reportedCalls === 0 ? null : inputTokens,
            outputTokens: reportedCalls === 0 ? null : outputTokens,
            coverage: coverageOf(reportedCalls, missingCalls),
            cacheMeasuredCalls,
            cacheExcludedCalls: callCount - cacheMeasuredCalls,
            cacheHitRate,
            throughputMeasuredCalls,
            throughputExcludedCalls: callCount - throughputMeasuredCalls,
            tokensPerSecond,
        }),
        cacheInputTokens: cacheAggregateValid ? summedCacheInputs : 0,
        cachedInputTokens: cacheAggregateValid ? summedCachedInputs : 0,
        throughputOutputTokens: throughputAggregateValid ? summedThroughputOutputs : 0,
        decodeDurationMs: throughputAggregateValid ? summedDurations : 0,
    });
}

function coverageOf(reportedCalls: number, missingCalls: number): MetricsCoverage {
    if (reportedCalls === 0 && missingCalls > 0) return "unavailable";
    if (missingCalls > 0) return "partial";
    return "complete";
}

function sumSafe(values: readonly number[], label: string): number {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(total)) {
        throw new SessionMetricsProjectionError(`Unsafe integer total for ${label}`);
    }
    return total;
}

function safeRatio(numerator: number, denominator: number): number | null {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
        return null;
    }
    const ratio = numerator / denominator;
    return Number.isFinite(ratio) ? ratio : null;
}

function sumOptional(values: readonly number[]): number | undefined {
    const total = values.reduce((sum, value) => sum + value, 0);
    return Number.isSafeInteger(total) ? total : undefined;
}

function sumFinite(values: readonly number[]): number | undefined {
    const total = values.reduce((sum, value) => sum + value, 0);
    return Number.isFinite(total) && total > 0 ? total : values.length === 0 ? 0 : undefined;
}
