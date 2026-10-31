/**
 * 模型可见表示的公共入口。
 *
 * @remarks
 * 该入口提供模型输入 View、PromptContext、动态状态、Working Context 以及历史
 * 执行单元/事件/输出预览/原生交换/Warm 条目表示；不导入 Runtime、投影器、
 * Reducer、模板或执行实现，也不执行 I/O。
 */

export type {
    ModelBlocker,
    ModelCompletionCriterion,
    ModelCompletionEvidence,
    ModelContextControl,
    ModelContextEpochView,
    ModelContextLookupFreshness,
    ModelContextLookupMatch,
    ModelContextLookupResult,
    ModelContextProtocol,
    ModelContextRetrievalProtocol,
    ModelConversationMessage,
    ModelMessageSource,
    ModelDynamicContext,
    ModelFact,
    ModelGoalContextDirectoryEntry,
    ModelGoalContextExpandedSource,
    ModelGoalContextNavigationCurrentStage,
    ModelGoalContextNavigationNoteEntry,
    ModelGoalContextNavigationStageEntry,
    ModelGoalContextNavigationView,
    ModelGoalPlan,
    ModelGoalPlanItem,
    ModelHypothesis,
    ModelInferenceView,
    ModelMemoryEntryBase,
    ModelMemoryProtocol,
    ModelPendingAction,
    ModelPlanRoute,
    ModelProfileView,
    ModelRunStageView,
    ModelStepRecord,
    ModelTask,
    ModelToolCallAction,
    ModelToolDefinition,
    ModelTrajectoryContext,
    ModelWorkingContext,
    ModelWorkingMemory,
    GoalContextDirectoryEntry,
    GoalContextExpandedSource,
    PromptContext,
    PromptPhase,
    PromptStage,
    StepDynamicPayload,
    VisibleConversationMessageMapEntry,
} from "./model-inference-view";

export type {
    CompleteModelOutputProjection,
    ModelExecutionUnitProjection,
    ModelOutputProjection,
    ModelTrajectoryEvent,
    ModelTrajectoryEventType,
    NativeModelExchange,
    PreviewedModelOutputProjection,
    WarmCompactEntry,
    WarmEntryKind,
    WarmEntryStatus,
} from "./model-history-view";
