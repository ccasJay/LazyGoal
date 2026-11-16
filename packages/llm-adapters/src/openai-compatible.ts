import {
    LLMConfigurationError,
    type LLMAdapter,
    type LLMConfig,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";
import type { CatalogSource } from "../../model-catalog/src/index";
import { ChatCompletionsAdapter } from "./chat-completions-adapter";
import { DefaultProviderModelFetcher } from "./catalog-fetchers";
import { CHAT_COMPLETIONS_PROTOCOL } from "./protocols";
import type { ProviderAdapterDefinition } from "./registry";

/**
 * 创建 `openai-compatible` 家族的目录来源。
 *
 * @remarks
 * 家族本身没有静态模型；配置实例把 `models[]` 作为静态事实注入。
 *
 * @returns 供配置实例继承的目录来源模板。
 *
 * @example
 * ```ts
 * const source = createOpenAICompatibleCatalogSource();
 * ```
 */
export function createOpenAICompatibleCatalogSource(): CatalogSource {
    const fetcher = new DefaultProviderModelFetcher();
    return {
        provider: "openai-compatible",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        staticModels: [],
        discover: (config, options) => fetcher.fetchModels(config, options),
    };
}

/**
 * 创建 `openai-compatible` 执行适配器。
 *
 * @remarks
 * 端点由连接配置提供；始终通过 Chat Completions 线格式执行。
 *
 * @param config - 已校验的连接配置。
 * @returns Chat Completions 适配器。
 * @throws LLMConfigurationError 缺少端点时抛出。
 *
 * @example
 * ```ts
 * const adapter = createOpenAICompatibleAdapter({ provider: "mistral", apiKey: "secret", model: "m", baseURL: "https://gateway.example/v1" });
 * ```
 */
export function createOpenAICompatibleAdapter(config: LLMConfig): LLMAdapter {
    if (config.baseURL === undefined) {
        throw new LLMConfigurationError([], `Provider "${config.provider}" requires an explicit base URL`);
    }
    const endpoint = config.baseURL.replace(/\/+$/, "");
    const identity: NativeConversationIdentity = {
        provider: "openai-compatible",
        endpoint,
        model: config.model,
        protocol: "openai-chat",
    };
    return new ChatCompletionsAdapter({
        url: `${endpoint}/chat/completions`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
        model: config.model,
        ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
        identity,
        nativeStructuredOutput: config.nativeStructuredOutput ?? true,
        supportsRequiredToolChoice: config.supportsRequiredToolChoice ?? true,
        toolCallIds: { generateMissing: "keep", streamMissing: "reject" },
    });
}

/**
 * `openai-compatible` 家族的注册表声明。
 *
 * @returns 家族模板；配置实例复用同一协议与适配器工厂。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createOpenAICompatibleProviderAdapter()]);
 * ```
 */
export function createOpenAICompatibleProviderAdapter(): ProviderAdapterDefinition {
    return {
        id: "openai-compatible",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        catalog: createOpenAICompatibleCatalogSource(),
        createAdapter: createOpenAICompatibleAdapter,
    };
}
