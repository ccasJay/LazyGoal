import type { LLMConfig, LLMExecutionApi } from "../../llm-core/src/index";
import type { CatalogSource } from "../../model-catalog/src/index";
import { DefaultProviderModelFetcher } from "./catalog-fetchers";
import { createDeepSeekCatalogSource } from "./deepseek";
import { createOpenAICatalogSource } from "./openai";
import { createOpenCodeGoCatalogSource } from "./opencode-go";
import { createOpenRouterCatalogSource } from "./openrouter";
import {
    ANTHROPIC_MESSAGES_PROTOCOL,
    CHAT_COMPLETIONS_PROTOCOL,
    GOOGLE_GENERATE_CONTENT_PROTOCOL,
} from "./protocols";
import { readStaticCatalogModels } from "./static-catalog";

/**
 * OpenCode Go 已知模型的执行元数据。
 *
 * @remarks
 * 仅用于启动配置没有在线目录上下文时的回退。在线可用性以供应商目录为准；
 * 执行协议在本期统一为 Chat Completions。
 *
 * @example
 * ```ts
 * const metadata = resolveOpenCodeGoExecutionMetadata("beam-free");
 * ```
 */
export interface OpenCodeGoExecutionMetadata {
    /** 与 OpenCode Go 在线清单匹配的模型 ID。 */
    readonly modelId: string;
    /** 请求使用的协议族。 */
    readonly executionApi: LLMExecutionApi;
    /** 上下文窗口 Token 容量。 */
    readonly contextWindowTokens: number;
    /** 最大输出 Token 容量。 */
    readonly maxOutputTokens: number;
    /** 是否支持模型原生推理内容。 */
    readonly reasoning: boolean;
    /** 是否支持视觉输入。 */
    readonly vision: boolean;
    /** 是否支持强制工具选择。 */
    readonly supportsRequiredToolChoice: boolean;
}

const OPENCODE_GO_EXECUTION_METADATA: Readonly<Record<string, OpenCodeGoExecutionMetadata>> = {
    "beam-free": {
        modelId: "beam-free",
        executionApi: "openai-completions",
        contextWindowTokens: 1_048_576,
        maxOutputTokens: 131_072,
        reasoning: true,
        vision: false,
        supportsRequiredToolChoice: true,
    },
    "minimax-m3.1-flash-free": {
        modelId: "minimax-m3.1-flash-free",
        executionApi: "openai-completions",
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 524_288,
        reasoning: true,
        vision: false,
        supportsRequiredToolChoice: false,
    },
};

/**
 * 按模型 ID 解析已知的 OpenCode Go 执行元数据。
 *
 * @param modelId - 在线目录返回或服务端显式配置的模型 ID。
 * @returns 已登记的协议与容量；未登记模型返回 `undefined`。
 *
 * @example
 * ```ts
 * const metadata = resolveOpenCodeGoExecutionMetadata("beam-free");
 * ```
 */
export function resolveOpenCodeGoExecutionMetadata(modelId: string): OpenCodeGoExecutionMetadata | undefined {
    return OPENCODE_GO_EXECUTION_METADATA[modelId];
}

/**
 * 构建内置供应商的目录来源。
 *
 * @remarks
 * 静态模型元数据与在线发现端点都由适配器事实提供；`model-catalog` 只消费结果。
 * Anthropic 与 Google 在本期仍由既有实现服务，因此各自声明原生协议标识。
 *
 * @returns 可交给 `createLlmModelCatalog` 的来源列表。
 *
 * @example
 * ```ts
 * const catalog = createLlmModelCatalog({
 *     sources: createBuiltinCatalogSources(),
 *     isProtocolImplemented: () => true,
 * });
 * ```
 */
export function createBuiltinCatalogSources(): readonly CatalogSource[] {
    const fetcher = new DefaultProviderModelFetcher();
    const discover = (config: LLMConfig, options?: { readonly signal?: AbortSignal | undefined; readonly fetch?: typeof fetch | undefined }) =>
        fetcher.fetchModels(config, options);
    return [
        createOpenAICatalogSource(),
        createDeepSeekCatalogSource(),
        createOpenRouterCatalogSource(),
        createOpenCodeGoCatalogSource(),
        {
            provider: "anthropic",
            protocol: ANTHROPIC_MESSAGES_PROTOCOL,
            staticModels: readStaticCatalogModels("anthropic"),
            discover,
        },
        {
            provider: "google",
            protocol: GOOGLE_GENERATE_CONTENT_PROTOCOL,
            staticModels: readStaticCatalogModels("google"),
            discover,
        },
        {
            provider: "openai-compatible",
            protocol: CHAT_COMPLETIONS_PROTOCOL,
            staticModels: [],
            discover,
        },
    ];
}
