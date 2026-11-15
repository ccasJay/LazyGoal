import { createModels } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";

import type { LLMConfig, LLMExecutionApi } from "../../llm-core/src/index";
import type { CatalogModel, CatalogSource } from "../../model-catalog/src/index";
import { DefaultProviderModelFetcher } from "./catalog-fetchers";

/** Chat Completions 线格式的协议标识。 */
export const CHAT_COMPLETIONS_PROTOCOL = "chat-completions";

const STATIC_FACTORIES = {
    openai: openaiProvider,
    google: googleProvider,
    anthropic: anthropicProvider,
    openrouter: openrouterProvider,
    deepseek: deepseekProvider,
    "opencode-go": opencodeGoProvider,
} as const;

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

function getStaticModels() {
    const models = createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
    });
    for (const factory of Object.values(STATIC_FACTORIES)) {
        models.setProvider(factory());
    }
    return models;
}

function toCatalogModels(models: readonly {
    readonly id: string;
    readonly name?: string;
    readonly contextWindow: number;
    readonly maxTokens: number;
    readonly reasoning: boolean;
    readonly input: readonly string[];
}[]): CatalogModel[] {
    return models.map(model => ({
        id: model.id,
        displayName: model.name === undefined || model.name.length === 0 ? model.id : model.name,
        contextWindowTokens: model.contextWindow,
        maxOutputTokens: model.contextWindow > 1 ? Math.min(model.maxTokens, model.contextWindow - 1) : model.maxTokens,
        reasoning: model.reasoning,
        vision: model.input.includes("image"),
        isTextGeneration: model.input.includes("text"),
    }));
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
    const models = getStaticModels();
    const fetcher = new DefaultProviderModelFetcher();
    const discover = (config: LLMConfig, options?: { readonly signal?: AbortSignal | undefined; readonly fetch?: typeof fetch | undefined }) =>
        fetcher.fetchModels(config, options);
    return [
        {
            provider: "openai",
            protocol: CHAT_COMPLETIONS_PROTOCOL,
            staticModels: toCatalogModels(models.getModels("openai")),
            discover,
        },
        {
            provider: "deepseek",
            protocol: CHAT_COMPLETIONS_PROTOCOL,
            staticModels: toCatalogModels(models.getModels("deepseek")),
            discover,
        },
        {
            provider: "openrouter",
            protocol: CHAT_COMPLETIONS_PROTOCOL,
            staticModels: toCatalogModels(models.getModels("openrouter")),
            discover,
        },
        {
            provider: "opencode-go",
            protocol: CHAT_COMPLETIONS_PROTOCOL,
            staticModels: toCatalogModels(models.getModels("opencode-go")),
            requireLiveCapacity: true,
            discover,
        },
        {
            provider: "anthropic",
            protocol: "anthropic-messages",
            staticModels: toCatalogModels(models.getModels("anthropic")),
            discover,
        },
        {
            provider: "google",
            protocol: "google-generate-content",
            staticModels: toCatalogModels(models.getModels("google")),
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
