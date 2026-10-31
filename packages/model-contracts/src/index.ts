/**
 * 模型交互协议契约与统一模式定义。
 *
 * @remarks
 * 承载 LazyGoal Agent 运行时的模型输出 TS 单源、同源生成绑定、动态声明组合、
 * Provider Schema 投影、语义校验及模型对话身份。模型线不拥有工具权限、Runtime
 * 状态转换或持久化；业务工具输入绑定由工具线提供并在组合时插入。
 *
 * @example
 * ```ts
 * import {
 *     createBoundModelOutputContractBundle,
 *     modelOutputBindings,
 * } from "@lazygoal/model-contracts";
 *
 * const bundle = createBoundModelOutputContractBundle({ kind: "executing" }, modelOutputBindings);
 * ```
 *
 * @packageDocumentation
 */

export type * from "./model-output/schema-types";

export type {
    WorkingMemoryPatch as ExecutingWorkingMemoryPatch,
} from "./model-output/schema-types";

export {
    normalizeAskUserRequest,
    validateAskUserAnswers,
    validateCompletionReviewResult,
    validateModelOutputSemantics,
} from "./model-output/semantics";

export type {
    AskUserAnswer,
    AskUserOption,
    AskUserQuestion,
    ModelOutputSemanticIssue,
    ModelOutputSemanticIssueCode,
} from "./model-output/semantics";

export { ModelOutputContractDefinitionError } from "./model-output/errors";

export {
    assertPortableModelSchema,
    buildShapeGuide,
    SHAPE_GUIDE_PREFIX,
} from "./model-output/provider-schema";

export type { ModelOutputBundle } from "./model-output/bundle";

export type { ModelContractDecodeOptions } from "./model-output/decode-options";

export {
    createBoundBusinessToolDeclaration,
    createBoundCheckpointToolDeclarations,
    createBoundCompletionReviewDeclaration,
    createBoundExecutingToolDeclarations,
    createBoundModelOutputContractBundle,
    createBoundRunStageToolDeclarations,
    createBoundSystemToolDeclaration,
    createBoundUnifiedToolDeclarations,
    validateAndSortAuthorizedToolBindings,
} from "./model-output/bound-factory";

export type { BoundModelOutputRequest } from "./model-output/bound-factory";

export type {
    AuthorizedToolBinding,
    ExecutingDecisionBindings,
    ModelOutputBindingSet,
    SystemToolBindingSet,
} from "./model-output/bindings";

export { modelOutputBindings } from "./model-output/generated-bindings";

export { decodeBoundAgentDecision } from "./model-output/decision-validation";

export {
    decodePhaseToolCall,
} from "./model-output/tool-declaration";

export type {
    AskUserTool,
    SystemToolDeclaration,
} from "./model-output/tool-declaration";

export type { RunStageToolContext } from "./model-output/system-tool-specs";

export * from "./model-conversation";
