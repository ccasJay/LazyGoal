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
