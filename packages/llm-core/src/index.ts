export type { LLMAdapter } from "./adapter";

export type { ProviderId, ProtocolId } from "./ids";
export type {
    LlmModelDescriptor,
    ModelAvailabilitySource,
    ModelMetadataSource,
} from "./model-descriptor";

export {
    LLMRequestModeMismatchError,
} from "./types";
export type {
    LLMRole,
    LLMMessage,
    LLMStructuredOutput,
    LLMToolDefinition,
    LLMToolCall,
    LLMRequest,
    LLMTextBlockFormat,
    LLMTextBlock,
    LLMReasoningBlock,
    LLMToolCallBlock,
    LLMContentBlock,
    LLMContentDeltaKind,
    LLMContentDelivery,
    LLMResponse,
    LLMStreamEvent,
} from "./types";

export {
    readTextBlocks,
    readTextBlocksWithIndex,
    readAssistantText,
    readReasoningText,
    readToolCalls,
} from "./content-blocks";
export { readModelAssistantReasoning, readModelAssistantText, readModelMessageText, readModelToolCalls } from "../../model-contracts/src/index";

export {
    LLMStreamProtocolError,
    createContentBlockStreamTracker,
} from "./content-block-stream";
export type { ContentBlockStreamTracker } from "./content-block-stream";

export {
    LLMConfigurationError,
} from "./llm-config";
export type {
    StructuredOutputMode,
    LLMProvider,
    LLMExecutionApi,
    LLMConfig,
} from "./llm-config";

export {
    toSafeTokenCount,
    readNormalizedUsage,
} from "./usage";
export type { NormalizedUsage } from "./usage";

export { classifyContextWindowRejection, classifyTransientModelFailure } from "./model-request-failure";

export { ServerSentEventDecoder, readServerSentEvents } from "./sse";
export type { ServerSentEvent } from "./sse";

export { extractJsonText, parseJsonText, repairJsonText } from "./json-text";
export type { JsonTextFailure } from "./json-text";

export { ModelHttpRequestError, parseRetryAfterMs } from "./http-error";

export type { NativeConversationIdentity, ModelContinuation } from "../../model-contracts/src/index";
export { sameNativeIdentity } from "../../model-contracts/src/index";
