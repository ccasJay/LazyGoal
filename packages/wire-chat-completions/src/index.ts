export { generateChatCompletions, streamChatCompletions } from "./client";
export type { ChatCompletionsConnection } from "./client";

export {
    buildChatCompletionsRequest,
    buildChatCompletionsStreamRequest,
    chatTextFormat,
    toChatCompletionsMessages,
} from "./request";
export type {
    ChatCompletionsMessage,
    ChatCompletionsRequestBody,
    ChatCompletionsRequestOptions,
    ChatCompletionsStreamRequestBody,
    ChatCompletionsToolCall,
} from "./request";

export { ChatCompletionsStreamAssembler, toChatCompletionsResponse } from "./events";
export type {
    ChatCompletionsResponseOptions,
    ChatCompletionsToolCallIdPolicy,
} from "./events";

export { ChatCompletionsIncompleteError, ChatCompletionsRefusalError } from "./errors";
export type { ChatCompletionsIncompleteReason } from "./errors";
