export { LLMStepExecutor } from "./llm-step-executor";
export type { LLMStepExecutorDependencies } from "./llm-step-executor";

export {
    buildStepRequest,
} from "./prompt";
export type {
    ModelOutputRequestPlan,
    StepPromptStageContext,
    StructuredOutputMode,
} from "./prompt";

export {
    ModelInferenceProjector,
} from "./model-inference-projector";
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
    ModelContextSourceError,
    TrajectoryExecutionUnitAdapter,
    TrajectoryExecutionUnitProjectionAdapter,
    projectTrajectoryExecutionUnits,
    MODEL_CONTEXT_SOURCE_ERROR_CODE,
} from "./trajectory-execution-unit-adapter";
export type {
    HotWindowSelection,
    HotWindowSelectionOptions,
    ModelExecutionUnit,
    TrajectoryExecutionUnitAdapterOptions,
} from "./trajectory-execution-unit-adapter";
export {
    TrajectoryEventProjector,
} from "./trajectory-event-projector";
export type {
    CompleteModelOutputProjection,
    ModelExecutionUnitProjection,
    ModelOutputProjection,
    ModelTrajectoryEvent,
    PreviewedModelOutputProjection,
    TrajectoryArtifactReference,
    TrajectoryArtifactResolver,
    TrajectoryEventProjectorOptions,
} from "./trajectory-event-projector";
export {
    WarmReducer,
    createDefaultWarmPartitionQuotas,
    reinforceWarmEntry,
    DEFAULT_WARM_PARTITION_QUOTA,
    WARM_ENTRY_KINDS,
} from "./warm-reducer";
export { DeterministicWarmEntryExtractor, deterministicWarmEntryExtractor } from "./deterministic-warm";
export type {
    WarmCompactEntry,
    WarmEntryKind,
    WarmEntryStatus,
    WarmPartitionQuota,
    WarmPartitionQuotas,
    WarmReducerOptions,
    WarmReductionResult,
    WarmReinforcementReason,
    WarmReinforcementInput,
} from "./warm-reducer";
export {
    createModelExecutionBinding,
    MutableModelBinding,
} from "./model-execution-binding";
export type {
    ModelExecutionBinding,
    ModelExecutionBindingProvider,
    CreateModelExecutionBindingInput,
} from "./model-execution-binding";
export {
    renderRequest,
    renderWorkingContextMessage,
} from "./render";
export type {
    ModelConversationMessage,
    ModelContextProtocol,
    ModelContextRetrievalProtocol,
    ModelMemoryProtocol,
    ModelMemoryEntryBase,
    ModelFact,
    ModelHypothesis,
    ModelBlocker,
    ModelCompletionEvidence,
    ModelContextLookupFreshness,
    ModelContextLookupMatch,
    ModelContextLookupResult,
    VisibleConversationMessageMapEntry,
    ModelContextControl,
    ModelContextEpochView,
    ModelWorkingMemory,
    ModelInferenceView,
    ModelDynamicContext,
    ModelTrajectoryContext,
    ModelPendingAction,
    ModelProfileView,
    ModelStepRecord,
    ModelTask,
    ModelGoalPlan,
    ModelGoalPlanItem,
    ModelToolCallAction,
    ModelToolDefinition,
    ModelWorkingContext,
    StepDynamicPayload,
    PromptContext,
    PromptPhase,
    PromptStage,
} from "./model-inference-view";

export {
    extractJsonPayload,
    parseJson,
    parseModelOutput,
    parseAgentDecision,
    requestRequiresContextCheckpoint,
} from "./model-output";

export {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
} from "./errors";
export type {
    FailedToolCallShape,
    LLMResponseProtocolErrorDetails,
    LLMResponseProtocolIssue,
} from "./errors";

export {
    createDefaultPromptBundleRenderer,
    createDefaultPromptBundleProtocolValidator,
    CURRENT_PROMPT_BUNDLE_VERSION,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
    PROMPT_BUNDLE_V1_MANIFEST,
} from "./prompting/default-bundles";
export { createPromptBundleRenderer } from "./prompting/renderer";
export { PromptBundleRegistry } from "./prompting/registry";
export {
    DynamicSectionRegistry,
    createDefaultDynamicSectionRegistry,
} from "./prompting/dynamic-section-registry";
export type {
    DynamicSectionDefinition,
    DynamicSectionIdentity,
    DynamicSectionMessage,
    DynamicSectionProjection,
    DynamicSectionRole,
} from "./prompting/dynamic-section-registry";
export {
    DYNAMIC_SECTION_DIFF_ERROR_CODE,
    DynamicSectionDiffError,
    planDynamicSectionUpdates,
} from "./prompting/dynamic-section-diff";
export type {
    DynamicSectionUpdateMessage,
    DynamicSectionUpdatePlan,
} from "./prompting/dynamic-section-diff";
export {
    PROMPT_BUNDLE_CONFIGURATION_ERROR_CODE,
    PROMPT_RENDER_ERROR_CODE,
    UNSUPPORTED_PROMPT_BUNDLE_VERSION_ERROR_CODE,
    PromptBundleConfigurationError,
    PromptRenderError,
    UnsupportedPromptBundleVersionError,
} from "./prompting/errors";
export {
    createPromptEnvironment,
    normalizeNewlines,
} from "./prompting/environment";
export { InMemoryLoader } from "./prompting/loader";
export type {
    PromptBundleManifest,
    PromptBundleRenderer,
    PromptBundleSection,
    PromptTemplateAsset,
    PromptTemplateDefinition,
} from "./prompting/types";

export type { LLMAdapter } from "../../llm/src/core/adapter";
export type { NormalizedUsage } from "../../llm/src/core/usage";
export { readNormalizedUsage } from "../../llm/src/core/usage";
export type {
    LLMMessage,
    LLMRequest,
    LLMResponse,
    LLMStreamEvent,
} from "../../llm/src/core/types";
export type {
    AgentDecision,
} from "../../runtime/src/domain";
export type { ToolDefinition } from "../../tool-core/src/index";

export {
    buildGoalContextNavigation,
} from "./goal-context-navigation";
export type {
    GoalContextNavigationBuildOptions,
} from "./goal-context-navigation";
export type {
    ModelGoalContextNavigationCurrentStage,
    ModelGoalContextNavigationStageEntry,
    ModelGoalContextNavigationNoteEntry,
    ModelGoalContextNavigationView,
} from "./model-inference-view";
