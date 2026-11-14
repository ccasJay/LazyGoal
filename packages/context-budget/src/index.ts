/**
 * 上下文预算的公共入口。
 *
 * @remarks
 * 该入口提供字符/Token 计量、预算分配、通用完整单元选择/裁剪、思考链安全截断与
 * 确定性序列化；不感知 Goal、Trajectory、模板或 Provider，也不执行 I/O。
 */

export { compareCodeUnits, stableJson } from "./stable-json";

export {
    DEFAULT_MODEL_INPUT_CHARACTER_BUDGET,
    DEFAULT_MODEL_RESPONSE_RESERVE_RATIO,
    DEFAULT_MODEL_WARM_SHARE,
    DEFAULT_MODEL_LARGE_OUTPUT_TOKEN_PREVIEW_LIMIT,
    DEFAULT_MODEL_LARGE_OUTPUT_CHARACTER_PREVIEW_LIMIT,
    MODEL_CAPABILITIES_INVALID_CODE,
    CharacterModelInputEstimator,
    ModelCapabilitiesError,
    TokenBudgetPlanner,
    createDefaultModelContextBudgetPolicy,
    createModelCapabilities,
    createModelContextBudgetPolicy,
    createTokenModelInputEstimator,
    resolveModelInputEstimator,
    resolveTokenEstimatorEncoding,
} from "./model-context-budget";
export type {
    ModelCapabilities,
    ModelContextBudgetPlan,
    ModelContextBudgetPlanInput,
    ModelContextBudgetPolicy,
    ModelContextBudgetPolicyInput,
    ModelInputEstimate,
    ModelInputEstimator,
    ModelInputMeasurementUnit,
} from "./model-context-budget";

export {
    DEFAULT_COMPACT_THRESHOLD_PERCENT,
    EPOCH_CAPACITY_UNAVAILABLE,
    EpochCapacityError,
    exceedsCompactThreshold,
    resolveEpochCapacity,
} from "./epoch-capacity";
export type { EpochCapacity, EpochCapacityInput } from "./epoch-capacity";

export type { ContextUnit, ContextUnitAdapter } from "./context-unit";

export {
    DEFAULT_LLM_CONVERSATION_CHAR_BUDGET,
    DropOldestContextCompactor,
} from "./context-compactor";
export type { ContextCompactor } from "./context-compactor";

export {
    MODEL_CONTEXT_HARD_OVERFLOW,
    ContextSelector,
    ModelContextHardOverflowError,
} from "./context-selector";
export type {
    ContextSelectionInput,
    ContextSelectionResult,
    ContextSelectionUnit,
} from "./context-selector";

export {
    DEFAULT_MAX_THOUGHT_CHARS,
    THOUGHT_TRUNCATION_MARKER,
    formatThinkingContext,
    truncateThought,
} from "./thought-budget";
export type {
    TruncateThoughtOptions,
    TruncateThoughtResult,
} from "./thought-budget";
