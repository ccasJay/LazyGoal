import type { InferContract } from "../../../contracts/src/index";
import { sessionMetricsValuesContract } from "../contracts/metrics";
import type { SessionMetricsSnapshot } from "../metrics";

/** 指标字段集合的只读输出。 */
type MetricsValues = InferContract<typeof sessionMetricsValuesContract>;

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
 * 会话指标快照的上下文剩余比例不变量。
 *
 * @param snapshot - 已通过结构解析的指标快照。
 * @returns 可选剩余比例位于 0 与 1 之间时为 `true`。
 *
 * @example
 * ```ts
 * if (hasValidContextRemainingPercent(snapshot)) console.log(snapshot.goalId);
 * ```
 */
export function hasValidContextRemainingPercent(snapshot: SessionMetricsSnapshot): boolean {
    const value = snapshot.contextRemainingPercent;
    return value === undefined || value === null || (value >= 0 && value <= 1);
}
