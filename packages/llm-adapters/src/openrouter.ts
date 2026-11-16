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

/** OpenRouter 的 OpenAI-compatible 端点前缀。 */
export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * 创建 OpenRouter 目录来源。
 *
 * @returns 静态模型事实与本供应商的在线发现（含富元数据）。
 *
 * @example
 * ```ts
 * const source = createOpenRouterCatalogSource();
 * ```
 */
export function createOpenRouterCatalogSource(): CatalogSource {
    const fetcher = new DefaultProviderModelFetcher();
    return {
        provider: "openrouter",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        staticModels: readStaticCatalogModels("openrouter"),
        discover: (config, options) => fetcher.fetchModels(config, options),
    };
}

/**
 * 创建 OpenRouter 执行适配器。
 *
 * @remarks
 * 本期统一通过 Chat Completions 端点执行；模型不原生约束结构输出时由线格式层
 * 使用文本提取与修复，不切换到其它协议。
 *
 * @param config - 已校验的 OpenRouter 连接配置。
 * @returns 通过 Chat Completions 线格式执行的适配器。
 * @throws LLMConfigurationError 连接不属于 OpenRouter 时抛出。
 *
 * @example
 * ```ts
 * const adapter = createOpenRouterAdapter({ provider: "openrouter", apiKey: "secret", model: "openai/gpt-4o" });
 * ```
 */
export function createOpenRouterAdapter(config: LLMConfig): LLMAdapter {
    if (config.provider !== "openrouter") {
        throw new LLMConfigurationError([], `Provider "${config.provider}" is not the OpenRouter adapter`);
    }
    const identity: NativeConversationIdentity = {
        provider: "openai-compatible",
        endpoint: DEFAULT_OPENROUTER_BASE_URL,
        model: config.model,
        protocol: "openai-chat",
    };
    return new ChatCompletionsAdapter({
        url: `${DEFAULT_OPENROUTER_BASE_URL}/chat/completions`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
        model: config.model,
        ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
        identity,
        nativeStructuredOutput: false,
        supportsRequiredToolChoice: true,
    });
}

/**
 * OpenRouter 的注册表声明。
 *
 * @returns 供应商标识、协议、目录来源与适配器工厂。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createOpenRouterProviderAdapter()]);
 * ```
 */
export function createOpenRouterProviderAdapter(): ProviderAdapterDefinition {
    return {
        id: "openrouter",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        catalog: createOpenRouterCatalogSource(),
        createAdapter: createOpenRouterAdapter,
    };
}
