export {
    createBuiltinCatalogSources,
    resolveOpenCodeGoExecutionMetadata,
} from "./catalog-sources";
export type { OpenCodeGoExecutionMetadata } from "./catalog-sources";

export { DefaultProviderModelFetcher } from "./catalog-fetchers";
export type { ProviderModelConnection } from "./catalog-fetchers";

export { ChatCompletionsAdapter } from "./chat-completions-adapter";

export {
    ANTHROPIC_VERSION,
    DEFAULT_ANTHROPIC_BASE_URL,
    AnthropicMessagesAdapter,
    createAnthropicAdapter,
    createAnthropicCatalogSource,
    createAnthropicProviderAdapter,
} from "./anthropic";

export {
    createGoogleAdapter,
    createGoogleCatalogSource,
    createGoogleProviderAdapter,
} from "./google";

export {
    DEFAULT_OPENAI_BASE_URL,
    createOpenAICatalogSource,
    createOpenAIAdapter,
    createOpenAIProviderAdapter,
} from "./openai";

export {
    DEFAULT_DEEPSEEK_BASE_URL,
    createDeepSeekAdapter,
    createDeepSeekCatalogSource,
    createDeepSeekProviderAdapter,
} from "./deepseek";

export {
    DEFAULT_OPENROUTER_BASE_URL,
    createOpenRouterAdapter,
    createOpenRouterCatalogSource,
    createOpenRouterProviderAdapter,
} from "./openrouter";

export {
    createOpenAICompatibleAdapter,
    createOpenAICompatibleCatalogSource,
    createOpenAICompatibleProviderAdapter,
} from "./openai-compatible";

export { createConfiguredCatalogSource } from "./configured-catalog";

export { createProviderRegistry } from "./registry";
export type { ProviderAdapterDefinition, ProviderRegistry } from "./registry";

export { createDefaultProviderRegistry } from "./default-registry";

export {
    LAZYGOAL_USER_AGENT,
    OPENCODE_GO_BASE_URL,
    OPENCODE_GO_SESSION_HEADER,
    createOpenCodeGoAdapter,
    createOpenCodeGoCatalogSource,
    createOpenCodeGoProviderAdapter,
} from "./opencode-go";

export {
    ANTHROPIC_MESSAGES_PROTOCOL,
    CHAT_COMPLETIONS_PROTOCOL,
    GOOGLE_GENERATE_CONTENT_PROTOCOL,
    IMPLEMENTED_PROTOCOLS,
    assertProtocolImplemented,
    isProtocolImplemented,
} from "./protocols";

export { readStaticCatalogModels } from "./static-catalog";
