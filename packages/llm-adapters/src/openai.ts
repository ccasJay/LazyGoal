import {
    LLMConfigurationError,
    type LLMAdapter,
    type LLMConfig,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";
import type { CatalogSource } from "../../model-catalog/src/index";
import { ChatCompletionsAdapter } from "./chat-completions-adapter";
import { DefaultProviderModelFetcher } from "./catalog-fetchers";
import type { ProviderAdapterDefinition } from "./registry";
import { CHAT_COMPLETIONS_PROTOCOL } from "./protocols";
import { readStaticCatalogModels } from "./static-catalog";

/** OpenAI 官方端点。 */
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/** OpenAI 适配器声明的供应商事实。 */
export interface OpenAIConnectionFacts {
    readonly baseURL?: string | undefined;
}

/**
 * 创建 OpenAI 官方目录来源。
 *
 * @remarks
 * 静态模型事实来自锁定版本目录；在线发现由本适配器拥有的 fetcher 提供。
 *
 * @returns 可交给 `model-catalog` 的供应商目录来源。
 *
 * @example
 * ```ts
 * const source = createOpenAICatalogSource();
 * ```
 */
export function createOpenAICatalogSource(): CatalogSource {
    const fetcher = new DefaultProviderModelFetcher();
    return {
        provider: "openai",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        staticModels: readStaticCatalogModels("openai"),
        discover: (config, options) => fetcher.fetchModels(config, options),
    };
}

/**
 * 创建 OpenAI 官方执行适配器。
 *
 * @param config - 已校验的 OpenAI 连接配置。
 * @returns 通过 Chat Completions 线格式执行的适配器。
 * @throws LLMConfigurationError 必填连接字段缺失时抛出。
 *
 * @example
 * ```ts
 * const adapter = createOpenAIAdapter({ provider: "openai", apiKey: "secret", model: "gpt-4o", structuredOutputMode: "prompt_only" });
 * ```
 */
export function createOpenAIAdapter(config: LLMConfig): LLMAdapter {
    if (config.provider !== "openai") {
        throw new LLMConfigurationError([], `Provider "${config.provider}" is not the OpenAI adapter`);
    }
    const endpoint = (config.baseURL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
    const identity: NativeConversationIdentity = {
        provider: "openai",
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
        nativeStructuredOutput: true,
        supportsRequiredToolChoice: true,
        replayReasoningExtensions: true,
    });
}

/**
 * OpenAI 官方的注册表声明。
 *
 * @returns 供应商标识、协议、目录来源与适配器工厂。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createOpenAIProviderAdapter()]);
 * ```
 */
export function createOpenAIProviderAdapter(): ProviderAdapterDefinition {
    return {
        id: "openai",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        catalog: createOpenAICatalogSource(),
        createAdapter: createOpenAIAdapter,
    };
}
