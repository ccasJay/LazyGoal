/**
 * 上下文组装的公共入口。
 *
 * @remarks
 * 该入口提供从 Runtime 状态、committed Trajectory 与原生历史组装模型输入 View 的
 * 投影器、来源适配、Hot/Warm 组装与默认 Warm 归约；只读取注入的 Port，不推进
 * Goal 状态，也不执行模型请求。模型可见表示类型由 `@lazygoal/model-view` 拥有。
 */

export { ModelInferenceProjector } from "./model-inference-projector";

export {
    CONTEXT_LOOKUP_FRESHNESS_WARNING,
    CONTEXT_LOOKUP_SOURCE_SCOPE,
    projectContextLookupResult,
    projectLookupResult,
} from "./context-lookup-projection";

export {
    MODEL_CONTEXT_ASSEMBLY_ERROR_CODE,
    ModelContextAssemblyError,
    TrajectoryModelContextAssembler,
} from "./trajectory-model-context-assembler";
export type {
    TrajectoryModelContextAssemblerOptions,
    TrajectoryModelContextAssemblyInput,
    TrajectoryWarmEntryExtractionInput,
    TrajectoryWarmEntryExtractor,
} from "./trajectory-model-context-assembler";

export {
    ConversationContextUnitAdapter,
    flattenContextUnits,
} from "./conversation-context-unit-adapter";

export {
    HotWindowSelector,
    MODEL_CONTEXT_SOURCE_ERROR_CODE,
    ModelContextSourceError,
    TrajectoryExecutionUnitAdapter,
    TrajectoryExecutionUnitProjectionAdapter,
    projectTrajectoryExecutionUnits,
} from "./trajectory-execution-unit-adapter";
export type {
    HotWindowSelection,
    HotWindowSelectionOptions,
    ModelExecutionUnit,
    TrajectoryExecutionUnitAdapterOptions,
} from "./trajectory-execution-unit-adapter";

export { TrajectoryEventProjector } from "./trajectory-event-projector";
export type {
    TrajectoryArtifactReference,
    TrajectoryArtifactResolver,
    TrajectoryEventProjectorOptions,
} from "./trajectory-event-projector";

export { collectNativeModelExchanges } from "./native-model-history";

export {
    DEFAULT_WARM_PARTITION_QUOTA,
    WARM_ENTRY_KINDS,
    WarmReducer,
    createDefaultWarmPartitionQuotas,
    reinforceWarmEntry,
} from "./warm-reducer";
export type {
    WarmPartitionQuota,
    WarmPartitionQuotas,
    WarmReducerOptions,
    WarmReductionResult,
    WarmReinforcementInput,
    WarmReinforcementReason,
} from "./warm-reducer";

export {
    DeterministicWarmEntryExtractor,
    deterministicWarmEntryExtractor,
} from "./deterministic-warm";

export { buildGoalContextNavigation } from "./goal-context-navigation";
export type {
    GoalContextNavigationBuildOptions,
    GoalContextNavigationHistoricalStageInput,
    GoalContextNavigationNoteInput,
} from "./goal-context-navigation";
