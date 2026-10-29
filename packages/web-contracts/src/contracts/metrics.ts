import { contract } from "../../../contracts/src/index";
import { browserNonEmptyStringContract } from "./common";

/** 指标覆盖度分类。 */
export const metricsCoverageContract = contract.enum([
    "complete",
    "partial",
    "unavailable",
] as const);

/** 单个 Run 与全会话共享的模型用量字段。 */
const sessionMetricsShape = {
    stepCount: contract.integer({ minimum: 0 }),
    reportedCalls: contract.integer({ minimum: 0 }),
    missingCalls: contract.integer({ minimum: 0 }),
    inputTokens: contract.nullable(contract.number()),
    outputTokens: contract.nullable(contract.number()),
    coverage: metricsCoverageContract,
    cacheMeasuredCalls: contract.integer({ minimum: 0 }),
    cacheExcludedCalls: contract.integer({ minimum: 0 }),
    cacheHitRate: contract.nullable(contract.number()),
    throughputMeasuredCalls: contract.integer({ minimum: 0 }),
    throughputExcludedCalls: contract.integer({ minimum: 0 }),
    tokensPerSecond: contract.nullable(contract.number()),
} as const;

/** 指标字段集合的独立合同，用于公开数值守卫。 */
export const sessionMetricsValuesContract = contract.openObject(sessionMetricsShape);

/** 单个 Run 的模型用量与步数统计。 */
export const runSessionMetricsContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    ...sessionMetricsShape,
});

/** 整个 Goal 会话的模型指标聚合快照。 */
export const sessionMetricsSnapshotContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    roundCount: contract.integer(),
    ...sessionMetricsShape,
    contextRemainingPercent: contract.optional(contract.nullable(contract.number())),
    runs: contract.array(runSessionMetricsContract),
});

/** 本模块建立的指标合同。 */
export const metricsWebContracts = [
    metricsCoverageContract,
    sessionMetricsValuesContract,
    runSessionMetricsContract,
    sessionMetricsSnapshotContract,
] as const;
