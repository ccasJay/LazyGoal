/**
 * 模型交互协议契约与统一模式定义。
 *
 * @remarks
 * 承载 LazyGoal Agent 运行时的模型输出契约、Wire/Canonical 投影转换、
 * 结构化输出 Provider Schema 编译、系统工具声明、Completion Review 及请求工厂。
 * 遵循单向依赖，底层复用 `@lazygoal/contracts` 的通用 AST、Parser 与 Schema 编译器。
 *
 * @example
 * ```ts
 * import {
 *     createModelOutputContractBundle,
 *     AgentDecisionContract,
 * } from "@lazygoal/model-contracts";
 *
 * const bundle = createModelOutputContractBundle({ kind: "executing" });
 * ```
 *
 * @packageDocumentation
 */

export {
    AgentDecisionContract,
    BlockerCreateContract,
    BlockerUpdateContract,
    CompleteAgentDecisionContract,
    NormalCompleteAgentDecisionContract,
    CompletionAcceptanceContract,
    CompletionEvidenceContract,
    CompletionCriterionContract,
    CompletionExpectOutcomeContract,
    ContextLookupFiltersContract,
    ContextLookupNeedContract,
    ContextLookupRequestContract,
    ToolDiscoveryDecisionContract,
    ContextLookupSequenceRangeContract,
    ExecutingMemoryPatchOperationContract,
    ExecutingWorkingMemoryPatchContract,
    FactProposalContract,
    FactScalarContract,
    FactStabilityContract,
    FactValueContract,
    FailAgentDecisionContract,
    GoalPlanStatusContract,
    GoalPlanAddOperationContract,
    GoalPlanUpdateOperationContract,
    GoalPlanReorderOperationContract,
    GoalPlanCancelOperationContract,
    GoalPlanPatchOperationContract,
    GoalPlanUpdateAgentDecisionContract,
    GoalTaskContract,
    RequestThinkContract,
    HypothesisCreateContract,
    HypothesisUpdateContract,
    JsonValueContract,
    MemoryEntryScopeContract,
    MemoryEntryStatusContract,
    MemoryPatchOperationContract,
    ModelContextCheckpointResultContract,
    NonToolExecutingDecisionContract,
    OrdinaryExecutingDecisionContract,
    PlanModeExecutingDecisionContract,
    RetireFactProposalContract,
    StructuredAgentDecisionContract,
    ToolCallActionContract,
    ToolCallAgentDecisionContract,
    WaitAgentDecisionContract,
    WorkingMemoryPatchContract,
    AskUserOptionInputContract,
    AskUserQuestionInputContract,
    AskUserAgentDecisionContract,
    TaskProposalAgentDecisionContract,
    AskUserAnswerContract,
    normalizeAskUserRequest,
    validateAskUserAnswers,
    validateModelOutputSemantics,
} from "./model-output/canonical";

export type {
    AgentDecision,
    BlockerCreate,
    BlockerUpdate,
    CompletionAcceptance,
    CompletionEvidence,
    CompletionCriterion,
    CompletionExpectOutcome,
    ContextLookupFilters,
    ContextLookupNeed,
    ContextLookupRequest,
    ToolDiscoveryDecision,
    ContextLookupSequenceRange,
    ExecutingMemoryPatchOperation,
    ExecutingWorkingMemoryPatch,
    FactProposal,
    FactScalar,
    FactStability,
    FactValue,
    GoalTask,
    RequestThink,
    DecideOutput,
    GoalPlanStatus,
    GoalPlanPatchOperation,
    GoalPlanUpdateAgentDecision,
    HypothesisCreate,
    HypothesisUpdate,
    MemoryEntryScope,
    MemoryEntryStatus,
    MemoryPatchOperation,
    ModelContextCheckpointResult,
    ModelOutputSemanticIssue,
    ModelOutputSemanticIssueCode,
    RetireFactProposal,
    StructuredAgentDecision,
    PlanModeExecutingDecision,
    ToolCallAction,
    WorkingMemoryPatch,
    AskUserOptionInput,
    AskUserQuestionInput,
    AskUserAgentDecision,
    TaskProposalAgentDecision,
    AskUserOption,
    AskUserQuestion,
    AskUserAnswer,
} from "./model-output/canonical";

export { ModelOutputContractDefinitionError } from "./model-output/errors";

export {
    decodeWireResult,
    deriveWireContract,
    deriveWireEnvelopeContract,
} from "./model-output/wire";

export {
    buildShapeGuide,
    compileModelOutputSchema,
    SHAPE_GUIDE_PREFIX,
} from "./model-output/provider-schema";

export {
    createModelOutputContractBundle,
    isReadOnlyToolContract,
} from "./model-output/factory";

export type {
    AuthorizedToolContract,
    ModelOutputContractBundle,
    ModelOutputRequest,
} from "./model-output/factory";

export {
    SystemCompletionReviewDeclaration,
    SystemCompleteTaskDeclaration,
    SystemCompleteRunDeclaration,
    SystemWaitForInputDeclaration,
    SystemFailGoalDeclaration,
    SystemContextLookupDeclaration,
    SystemFindToolsDeclaration,
    SystemProposeTaskPlanDeclaration,
    SystemContextCheckpointDeclaration,
    SystemAskUserDeclaration,
    SystemUpdateGoalPlanDeclaration,
    SystemRequestThinkDeclaration,
    createExecutingToolDeclarations,
    createUnifiedToolDeclarations,
    createCheckpointToolDeclarations,
    decodePhaseToolCall,
} from "./model-output/system-tools";

export type {
    AskUserTool,
    SystemToolDeclaration,
    SystemFindToolsInput,
} from "./model-output/system-tools";

export {
    SystemFindToolsInputContract,
    SystemUpdateGoalPlanInputContract,
} from "./model-output/system-tools";

export { CompletionReviewResultContract } from "./model-output/completion-review";
export type { CompletionReviewResult } from "./model-output/completion-review";

export * from "./model-conversation";
