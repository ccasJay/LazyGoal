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
import { readStaticCatalogModels } from "./static-catalog";

/** DeepSeek 官方 Chat Completions 端点前缀。 */
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/**
 * 创建 DeepSeek 目录来源。
 *
 * @returns 静态模型事实与本供应商的在线发现。
 *
 * @example
 * ```ts
 * const source = createDeepSeekCatalogSource();
 * ```
 */
export function createDeepSeekCatalogSource(): CatalogSource {
    const fetcher = new DefaultProviderModelFetcher();
    return {
        provider: "deepseek",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        staticModels: readStaticCatalogModels("deepseek"),
        discover: (config, options) => fetcher.fetchModels(config, options),
    };
}

/**
 * 创建 DeepSeek 执行适配器。
 *
 * @remarks
 * DeepSeek 不提供 `response_format.json_schema`；线格式层省略原生结构约束，
 * 并在请求声明结构化输出时使用文本提取与修复。
 *
 * @param config - 已校验的 DeepSeek 连接配置。
 * @returns 通过 Chat Completions 线格式执行的适配器。
 * @throws LLMConfigurationError 连接不属于 DeepSeek 时抛出。
 *
 * @example
 * ```ts
 * const adapter = createDeepSeekAdapter({ provider: "deepseek", apiKey: "secret", model: "deepseek-chat", structuredOutputMode: "prompt_only" });
 * ```
 */
export function createDeepSeekAdapter(config: LLMConfig): LLMAdapter {
    if (config.provider !== "deepseek") {
        throw new LLMConfigurationError([], `Provider "${config.provider}" is not the DeepSeek adapter`);
    }
    const identity: NativeConversationIdentity = {
        provider: "openai-compatible",
        endpoint: DEFAULT_DEEPSEEK_BASE_URL,
        model: config.model,
        protocol: "openai-chat",
    };
    return new ChatCompletionsAdapter({
        url: `${DEFAULT_DEEPSEEK_BASE_URL}/chat/completions`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
        model: config.model,
        ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
        identity,
        nativeStructuredOutput: false,
        supportsRequiredToolChoice: true,
    });
}

/**
 * DeepSeek 的注册表声明。
 *
 * @returns 供应商标识、协议、目录来源与适配器工厂。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createDeepSeekProviderAdapter()]);
 * ```
 */
export function createDeepSeekProviderAdapter(): ProviderAdapterDefinition {
    return {
        id: "deepseek",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        catalog: createDeepSeekCatalogSource(),
        createAdapter: createDeepSeekAdapter,
    };
}
