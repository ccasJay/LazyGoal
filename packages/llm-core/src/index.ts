export type { LLMAdapter } from "./adapter";

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
    readAssistantText,
    readReasoningText,
    readToolCalls,
} from "./content-blocks";

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
    LLMConfig,
} from "./llm-config";

export {
    toSafeTokenCount,
    readNormalizedUsage,
} from "./usage";
export type { NormalizedUsage } from "./usage";

export { classifyTransientModelFailure } from "./model-request-failure";
