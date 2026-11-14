import type { SessionMetricsSnapshot, SessionMetricsValues } from "../wire";

/** 指标字段集合的只读输出。 */
type MetricsValues = SessionMetricsValues;

function isNonNegativeOrNull(value: number | null): boolean {
    return value === null || value >= 0;
}

/**
 * 模型用量指标的数值范围不变量。
 *
 * @remarks
 * 合同已保证计数为非负安全整数并拒绝非有限数；该谓词补齐 Token、缓存命中率与
 * 速率的下界，以及 `cacheHitRate <= 1` 的上界。
 *
 * @param values - 已通过结构解析的指标字段。
 * @returns 所有数值范围成立时为 `true`。
 *
 * @example
 * ```ts
 * if (isMetricValues(snapshot)) console.log(snapshot.stepCount);
 * ```
 */
export function isMetricValues(values: MetricsValues): boolean {
    return isNonNegativeOrNull(values.inputTokens)
        && isNonNegativeOrNull(values.outputTokens)
        && isNonNegativeOrNull(values.tokensPerSecond)
        && (values.cacheHitRate === null
            || (values.cacheHitRate >= 0 && values.cacheHitRate <= 1));
}

/**
 * 会话指标快照的 Context 占用不变量。
 *
 * @param snapshot - 已通过结构解析的指标快照。
 * @returns 可选占用未出现时为 `true`；出现时比例、容量与来源均合法才为 `true`。
 * @example
 * ```ts
 * if (hasValidContextUsage(snapshot)) console.log(snapshot.goalId);
 * ```
 */
export function hasValidContextUsage(snapshot: SessionMetricsSnapshot): boolean {
    const usage = snapshot.contextUsage;
    if (usage === undefined || usage === null) return true;
    return usage.usedPercent >= 0
        && usage.usedPercent <= 1
        && Number.isSafeInteger(usage.capacityTokens)
        && usage.capacityTokens > 0
        && (usage.source === "model" || usage.source === "configured");
}
