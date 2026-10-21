import { createModels } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";

import type { LLMConfig, LLMExecutionApi, LLMProvider } from "../../llm-core/src/index.js";
import {
    ModelCatalogError,
    type ProviderModelFetcher,
    type RawFetchedModel,
} from "./contracts.js";
import { DefaultProviderModelFetcher } from "./provider-fetchers.js";

/**
 * 结构化模型描述契约。
 *
 * @remarks
 * 包含模型标识、展示名、Token 容量上限、推理与视觉多模态能力，以及可用性与元数据来源标识。
 *
 * @example
 * ```ts
 * const descriptor: LlmModelDescriptor = {
 *   provider: "opencode-go",
 *   id: "minimax-m3.1-flash-free",
 *   displayName: "MiniMax M3.1 Flash Free",
 *   contextWindowTokens: 1_000_000,
 *   maxOutputTokens: 524_288,
 *   executionApi: "openai-completions",
 *   availabilitySource: "live",
 *   metadataSource: "execution",
 *   selectable: true,
 * };
 * ```
 */
export interface LlmModelDescriptor {
    /** 归属的语言模型供应商。 */
    readonly provider: LLMProvider;
    /** 稳定唯一的模型 ID（如 gpt-4o、claude-sonnet-4-5）。 */
    readonly id: string;
    /** 面向用户的模型可读名称。 */
    readonly displayName: string;
    /** 上下文窗口容量 Token 数；Token 预算模式必需，字符预算模式可缺省。 */
    readonly contextWindowTokens?: number | undefined;
    /** 单次补全最大输出 Token 上限；Token 预算模式必需，字符预算模式可缺省。 */
    readonly maxOutputTokens?: number | undefined;
    /** 由可信目录登记的执行 API；不会作为浏览器模型目录字段返回。 */
    readonly executionApi?: LLMExecutionApi | undefined;
    /** 模型是否具备原生推理思维链能力。 */
    readonly reasoning?: boolean | undefined;
    /** 模型是否支持图像等视觉输入。 */
    readonly vision?: boolean | undefined;
    /** 可用性验证来源：在线列表查询、内置静态目录或当前启动配置。 */
    readonly availabilitySource: "live" | "catalog" | "configured";
    /** 元数据字段来源：在线、静态目录、执行登记、当前配置或多来源补全。 */
    readonly metadataSource: "live" | "catalog" | "execution" | "configured" | "mixed";
    /** 当前运行链路和结构化模式下是否允许被用户选择。 */
    readonly selectable: boolean;
    /** 当 selectable 为 false 时说明不可选的具体原因。 */
    readonly unavailableReason?: string | undefined;
}

/**
 * 语言模型目录查询契约。
 *
 * @remarks
 * 获取当前 Provider 可用模型列表，支持在线查询、pi-ai Catalog 补全、排序与不可选过滤。
 * OpenCode Go 在线返回但不在 pi-ai 静态目录中的模型，只有存在独立执行登记时才可选；未知模型保留展示并标记不可选。
 *
 * @example
 * ```ts
 * const catalog = createLlmModelCatalog();
 * const models = await catalog.list(config, {
 *   requireTokenCapacity: selection.inputEstimator.kind === "token-encoding",
 * });
 * ```
 */
export interface LlmModelCatalog {
    /**
     * 查询并列出当前配置 Provider 的模型列表。
     *
     * @param config - 当前 LLM 配置。
     * @param options - 包含取消信号、注入 fetch 和是否需要 Token 容量的可选参数；Token 预算模式必须声明后者。
     * @returns 排序并补全后的模型描述符列表。
     * @throws ModelCatalogError 鉴权失败、权限被拒、协议格式错误或已取消时抛出。
     */
    list(
        config: LLMConfig,
        options?: {
            readonly signal?: AbortSignal | undefined;
            readonly fetch?: typeof fetch | undefined;
            readonly requireTokenCapacity?: boolean | undefined;
        },
    ): Promise<readonly LlmModelDescriptor[]>;
}

const STATIC_FACTORIES = {
    openai: openaiProvider,
    google: googleProvider,
    anthropic: anthropicProvider,
    openrouter: openrouterProvider,
    deepseek: deepseekProvider,
    "opencode-go": opencodeGoProvider,
};

/**
 * OpenCode Go 在线列表没有提供的、经独立资料确认的动态模型执行契约。
 *
 * @remarks
 * 注册项只描述可安全构造 Binding 的非敏感协议与容量。在线目录仍必须同时返回模型 ID，端点固定由 OpenCode Go Provider 所有。
 *
 * @example
 * ```ts
 * const metadata = resolveOpenCodeGoExecutionMetadata("minimax-m3.1-flash-free");
 * if (metadata !== undefined) console.log(metadata.executionApi);
 * ```
 */
export interface OpenCodeGoExecutionMetadata {
    /** 与 OpenCode Go 在线清单匹配的模型 ID。 */
    readonly modelId: string;
    /** 请求使用的 API 家族。 */
    readonly executionApi: LLMExecutionApi;
    /** 经模型资料登记的上下文窗口 Token 容量。 */
    readonly contextWindowTokens: number;
    /** 经模型资料登记的最大输出 Token 容量。 */
    readonly maxOutputTokens: number;
    /** 是否支持模型原生推理内容。 */
    readonly reasoning: boolean;
    /** 是否支持视觉输入。 */
    readonly vision: boolean;
}

const OPENCODE_GO_EXECUTION_METADATA: Readonly<Record<string, OpenCodeGoExecutionMetadata>> = {
    "minimax-m3.1-flash-free": {
        modelId: "minimax-m3.1-flash-free",
        executionApi: "openai-completions",
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 524_288,
        reasoning: true,
        vision: false,
    },
};

/**
 * 按模型 ID 解析可信的 OpenCode Go 动态执行元数据。
 *
 * @param modelId - 在线目录返回或服务端显式配置的模型 ID。
 * @returns 已登记的执行协议与容量；未登记模型返回 `undefined`。
 *
 * @example
 * ```ts
 * const metadata = resolveOpenCodeGoExecutionMetadata("minimax-m3.1-flash-free");
 * ```
 */
export function resolveOpenCodeGoExecutionMetadata(modelId: string): OpenCodeGoExecutionMetadata | undefined {
    return OPENCODE_GO_EXECUTION_METADATA[modelId];
}

function getStaticPiAiModels() {
    const models = createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
    });
    for (const factory of Object.values(STATIC_FACTORIES)) {
        models.setProvider(factory());
    }
    return models;
}

/** 已知明显的非文本生成模型关键字匹配。 */
const NON_TEXT_MODEL_PATTERNS = [
    /\btext-embedding\b/i,
    /\bembedding\b/i,
    /\bdall-e\b/i,
    /\bimagen\b/i,
    /\btts\b/i,
    /\bwhisper\b/i,
    /\bmoderation\b/i,
    /\baudio\b/i,
    /\brealtime\b/i,
];

function isKnownNonTextModel(id: string): boolean {
    return NON_TEXT_MODEL_PATTERNS.some((pattern) => pattern.test(id));
}

/**
 * 判定模型在当前配置与预算模式下是否可选及原因。
 *
 * @param requireTokenCapacity - Token 预算模式要求上下文容量与输出上限；字符预算模式允许两者缺省。
 */
export function determineSelectability(
    provider: LLMProvider,
    id: string,
    contextWindowTokens: number | undefined,
    maxOutputTokens: number | undefined,
    rawDetails: {
        readonly supportedGenerationMethods?: readonly string[] | undefined;
        readonly isTextGeneration?: boolean | undefined;
        readonly supportsStrictOutput?: boolean | undefined;
    },
    config: LLMConfig,
    requireTokenCapacity = false,
): { readonly selectable: boolean; readonly unavailableReason?: string | undefined } {
    // 1. 明确声明不支持文本生成，或命中明显非文本正则
    if (rawDetails.isTextGeneration === false || isKnownNonTextModel(id)) {
        return { selectable: false, unavailableReason: "Model does not support text generation." };
    }

    // Google 特性：若返回了 supportedGenerationMethods，必须包含 generateContent
    if (
        rawDetails.supportedGenerationMethods !== undefined &&
        rawDetails.supportedGenerationMethods.length > 0 &&
        !rawDetails.supportedGenerationMethods.includes("generateContent")
    ) {
        return { selectable: false, unavailableReason: "Model does not support generateContent method." };
    }

    // 2. 结构化输出模式兼容性校验
    if (config.structuredOutputMode === "strict") {
        if (!["openai", "google", "openai-compatible"].includes(provider)) {
            return {
                selectable: false,
                unavailableReason: `Provider "${provider}" does not support strict structured output mode.`,
            };
        }
        if (rawDetails.supportsStrictOutput === false) {
            return {
                selectable: false,
                unavailableReason: "Model does not support strict structured output mode.",
            };
        }
        // 针对 OpenAI 的老旧模型
        if (provider === "openai" && (id.includes("instruct") || id.startsWith("davinci") || id.startsWith("babbage"))) {
            return {
                selectable: false,
                unavailableReason: "Legacy model does not support strict structured output mode.",
            };
        }
    }

    if (requireTokenCapacity && (contextWindowTokens === undefined || contextWindowTokens <= 0)) {
        return {
            selectable: false,
            unavailableReason: "Token budgeting requires context window capacity metadata.",
        };
    }

    if (requireTokenCapacity && (maxOutputTokens === undefined || maxOutputTokens <= 0)) {
        return {
            selectable: false,
            unavailableReason: "Token budgeting requires max output token metadata.",
        };
    }

    if (contextWindowTokens !== undefined && maxOutputTokens !== undefined && maxOutputTokens >= contextWindowTokens) {
        return {
            selectable: false,
            unavailableReason: "Max output tokens must be strictly less than context window.",
        };
    }

    return { selectable: true };
}

/**
 * 对模型描述列表进行稳定排序：
 * 1. 当前模型优先；
 * 2. 可选择项优先；
 * 3. displayName 升序；
 * 4. id 升序。
 */
export function sortModelDescriptors(
    models: readonly LlmModelDescriptor[],
    currentModelId: string,
): readonly LlmModelDescriptor[] {
    return models.slice().sort((a, b) => {
        const aIsCurrent = a.id === currentModelId;
        const bIsCurrent = b.id === currentModelId;
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;

        if (a.selectable && !b.selectable) return -1;
        if (!a.selectable && b.selectable) return 1;

        const nameComparison = a.displayName.localeCompare(b.displayName);
        if (nameComparison !== 0) return nameComparison;

        return a.id.localeCompare(b.id);
    });
}

/**
 * 默认模型目录实现类。
 */
export class DefaultLlmModelCatalog implements LlmModelCatalog {
    private readonly piAiModels = getStaticPiAiModels();

    constructor(
        private readonly fetcher?: ProviderModelFetcher | undefined,
    ) {}

    public async list(
        config: LLMConfig,
        options?: {
            readonly signal?: AbortSignal | undefined;
            readonly fetch?: typeof fetch | undefined;
            readonly requireTokenCapacity?: boolean | undefined;
        },
    ): Promise<readonly LlmModelDescriptor[]> {
        if (options?.signal?.aborted) {
            throw new ModelCatalogError("cancelled", "Model catalog request was cancelled.");
        }

        // 尝试在线获取
        if (this.fetcher !== undefined) {
            try {
                const rawList = await this.fetcher.fetchModels(config, options);
                return this.processLiveModels(rawList, config, options?.requireTokenCapacity ?? false);
            } catch (error) {
                if (error instanceof ModelCatalogError) {
                    // 鉴权、权限、协议错误及已取消绝对禁止降级
                    if (
                        error.kind === "authentication" ||
                        error.kind === "permission" ||
                        error.kind === "protocol" ||
                        error.kind === "cancelled"
                    ) {
                        throw error;
                    }
                    // 超时、不可用或端点不支持时允许降级
                    return this.fallback(config, options?.requireTokenCapacity ?? false);
                }
                throw error;
            }
        }

        // 若未提供 fetcher，直接降级到静态目录/配置
        return this.fallback(config, options?.requireTokenCapacity ?? false);
    }

    private processLiveModels(
        rawList: readonly RawFetchedModel[],
        config: LLMConfig,
        requireTokenCapacity: boolean,
    ): readonly LlmModelDescriptor[] {
        const seenIds = new Set<string>();
        const results: LlmModelDescriptor[] = [];

        for (const raw of rawList) {
            if (seenIds.has(raw.id)) {
                continue;
            }
            seenIds.add(raw.id);

            // 用 pi-ai 静态目录补全
            const executionMetadata = config.provider === "opencode-go"
                ? resolveOpenCodeGoExecutionMetadata(raw.id)
                : undefined;
            const staticModel = config.provider === "openai-compatible"
                ? undefined
                : this.piAiModels.getModel(config.provider, raw.id);

            const hasLiveDisplayName = raw.displayName !== undefined;
            const hasLiveContext = raw.contextWindowTokens !== undefined;
            const hasLiveMaxTokens = raw.maxOutputTokens !== undefined;
            const hasLiveReasoning = raw.reasoning !== undefined;
            const hasLiveVision = raw.vision !== undefined;

            const displayName = raw.displayName ?? staticModel?.name ?? raw.id;
            const contextWindowTokens = raw.contextWindowTokens ?? executionMetadata?.contextWindowTokens ?? staticModel?.contextWindow;
            const maxOutputTokens = raw.maxOutputTokens ?? executionMetadata?.maxOutputTokens ?? staticModel?.maxTokens;
            const reasoning = raw.reasoning ?? executionMetadata?.reasoning ?? staticModel?.reasoning ?? false;
            const vision = raw.vision ?? executionMetadata?.vision ?? (staticModel?.input.includes("image") ?? false);

            let metadataSource: "live" | "catalog" | "execution" | "configured" | "mixed";
            const liveFieldCount =
                (hasLiveDisplayName ? 1 : 0) +
                (hasLiveContext ? 1 : 0) +
                (hasLiveMaxTokens ? 1 : 0) +
                (hasLiveReasoning ? 1 : 0) +
                (hasLiveVision ? 1 : 0);

            if (executionMetadata !== undefined) {
                metadataSource = liveFieldCount === 0 ? "execution" : "mixed";
            } else if (liveFieldCount === 5 || (hasLiveDisplayName && hasLiveContext && hasLiveMaxTokens)) {
                metadataSource = "live";
            } else if (liveFieldCount === 0) {
                metadataSource = "catalog";
            } else {
                metadataSource = "mixed";
            }

            const { selectable, unavailableReason } = config.provider === "opencode-go" && staticModel === undefined && executionMetadata === undefined
                ? { selectable: false, unavailableReason: "Model is not supported by the installed OpenCode Go adapter." }
                : determineSelectability(
                config.provider,
                raw.id,
                contextWindowTokens,
                maxOutputTokens,
                {
                    supportedGenerationMethods: raw.supportedGenerationMethods,
                    isTextGeneration: raw.isTextGeneration,
                    supportsStrictOutput: raw.supportsStrictOutput,
                },
                config,
                requireTokenCapacity,
            );

            results.push({
                provider: config.provider,
                id: raw.id,
                displayName,
                contextWindowTokens,
                maxOutputTokens,
                ...(executionMetadata === undefined ? {} : { executionApi: executionMetadata.executionApi }),
                reasoning,
                vision,
                availabilitySource: "live",
                metadataSource,
                selectable,
                ...(unavailableReason === undefined ? {} : { unavailableReason }),
            });
        }

        return sortModelDescriptors(results, config.model);
    }

    private fallback(config: LLMConfig, requireTokenCapacity: boolean): readonly LlmModelDescriptor[] {
        if (config.provider === "openai-compatible") {
            const descriptor: LlmModelDescriptor = {
                provider: config.provider,
                id: config.model,
                displayName: config.model,
                contextWindowTokens: config.contextWindowTokens,
                maxOutputTokens: config.maxOutputTokens,
                reasoning: false,
                vision: false,
                availabilitySource: "configured",
                metadataSource: "configured",
                selectable: true,
            };
            return [descriptor];
        }

        const staticList = this.piAiModels.getModels(config.provider);
        const seenIds = new Set<string>();
        const results: LlmModelDescriptor[] = [];

        for (const sm of staticList) {
            if (seenIds.has(sm.id)) continue;
            seenIds.add(sm.id);

            const { selectable, unavailableReason } = determineSelectability(
                config.provider,
                sm.id,
                sm.contextWindow,
                sm.maxTokens,
                {
                    isTextGeneration: sm.input.includes("text"),
                },
                config,
                requireTokenCapacity,
            );

            results.push({
                provider: config.provider,
                id: sm.id,
                displayName: sm.name || sm.id,
                contextWindowTokens: sm.contextWindow,
                maxOutputTokens: sm.maxTokens,
                reasoning: sm.reasoning,
                vision: sm.input.includes("image"),
                availabilitySource: "catalog",
                metadataSource: "catalog",
                selectable,
                ...(unavailableReason === undefined ? {} : { unavailableReason }),
            });
        }

        return sortModelDescriptors(results, config.model);
    }
}

/**
 * 创建全新的模型目录查询服务实例。
 *
 * @param fetcher - 可选注入的 Provider 在线列表拉取器。
 * @returns 模型目录查询实例。
 *
 * @example
 * ```ts
 * const catalog = createLlmModelCatalog();
 * const models = await catalog.list(config);
 * ```
 */
export function createLlmModelCatalog(fetcher?: ProviderModelFetcher | undefined): LlmModelCatalog {
    return new DefaultLlmModelCatalog(fetcher ?? new DefaultProviderModelFetcher());
}

export { DefaultProviderModelFetcher } from "./provider-fetchers.js";
