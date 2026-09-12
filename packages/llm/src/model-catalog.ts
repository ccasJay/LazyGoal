import { createModels } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";

import type { LlmConfig, LlmProvider } from "./config.js";

/**
 * 结构化模型描述契约。
 *
 * @remarks
 * 包含模型标识、展示名、Token 容量上限、推理与视觉多模态能力，以及可用性与元数据来源标识。
 *
 * @example
 * ```ts
 * const descriptor: LlmModelDescriptor = {
 *   provider: "anthropic",
 *   id: "claude-sonnet-4-5",
 *   displayName: "Claude Sonnet 4.5",
 *   contextWindowTokens: 200000,
 *   maxOutputTokens: 8192,
 *   availabilitySource: "live",
 *   metadataSource: "mixed",
 *   selectable: true,
 * };
 * ```
 */
export interface LlmModelDescriptor {
    /** 归属的语言模型供应商。 */
    readonly provider: LlmProvider;
    /** 稳定唯一的模型 ID（如 gpt-4o、claude-sonnet-4-5）。 */
    readonly id: string;
    /** 面向用户的模型可读名称。 */
    readonly displayName: string;
    /** 上下文窗口容量 Token 数；缺少时无法构建安全上下文预算。 */
    readonly contextWindowTokens?: number | undefined;
    /** 单次补全最大输出 Token 上限。 */
    readonly maxOutputTokens?: number | undefined;
    /** 模型是否具备原生推理思维链能力。 */
    readonly reasoning?: boolean | undefined;
    /** 模型是否支持图像等视觉输入。 */
    readonly vision?: boolean | undefined;
    /** 可用性验证来源：在线列表查询、内置静态目录或当前启动配置。 */
    readonly availabilitySource: "live" | "catalog" | "configured";
    /** 元数据字段来源：完全在线、完全静态目录、当前配置或两者混合补全。 */
    readonly metadataSource: "live" | "catalog" | "configured" | "mixed";
    /** 当前运行链路和结构化模式下是否允许被用户选择。 */
    readonly selectable: boolean;
    /** 当 selectable 为 false 时说明不可选的具体原因。 */
    readonly unavailableReason?: string | undefined;
}

/**
 * 模型目录请求失败分类。
 *
 * @remarks
 * 区分凭据故障、网络超时与非法响应；鉴权、权限与协议错误禁止目录降级。
 */
export type ModelCatalogErrorKind =
    | "cancelled"
    | "authentication"
    | "permission"
    | "timeout"
    | "unavailable"
    | "unsupported"
    | "protocol";

/**
 * 模型目录查询与校验错误。
 *
 * @remarks
 * 封装脱敏错误分类，不包含 API Key、Authorization 头或任意敏感响应正文。
 *
 * @example
 * ```ts
 * throw new ModelCatalogError("authentication", "Authentication failed for provider openai", 401);
 * ```
 */
export class ModelCatalogError extends Error {
    public readonly code = "MODEL_CATALOG_ERROR" as const;

    /**
     * @param kind - 抽象错误类型。
     * @param message - 脱敏错误描述。
     * @param status - 可选的 HTTP 状态码。
     */
    constructor(
        public readonly kind: ModelCatalogErrorKind,
        message: string,
        public readonly status?: number | undefined,
    ) {
        super(message);
        this.name = "ModelCatalogError";
    }
}

/**
 * 在线原始拉取的模型元数据契约。
 *
 * @remarks
 * 由各 Provider Wire Fetcher 从 HTTP 响应提取，待与静态 Catalog 合并。
 *
 * @example
 * ```ts
 * const raw: RawFetchedModel = { id: "gpt-4o", displayName: "GPT-4o" };
 * ```
 */
export interface RawFetchedModel {
    readonly id: string;
    readonly displayName?: string | undefined;
    readonly contextWindowTokens?: number | undefined;
    readonly maxOutputTokens?: number | undefined;
    readonly reasoning?: boolean | undefined;
    readonly vision?: boolean | undefined;
    readonly supportedGenerationMethods?: readonly string[] | undefined;
    readonly isTextGeneration?: boolean | undefined;
    readonly supportsStrictOutput?: boolean | undefined;
}

/**
 * Provider 在线模型拉取器契约。
 *
 * @remarks
 * 仅负责发起 HTTP 请求并反序列化模型列表，不执行业务降级或排序。
 *
 * @example
 * ```ts
 * const models = await fetcher.fetchModels(config, { signal });
 * ```
 */
export interface ProviderModelFetcher {
    fetchModels(
        config: LlmConfig,
        options?: { readonly signal?: AbortSignal | undefined; readonly fetch?: typeof fetch | undefined },
    ): Promise<readonly RawFetchedModel[]>;
}

/**
 * 语言模型目录查询契约。
 *
 * @remarks
 * 获取当前 Provider 可用模型列表，支持在线查询、pi-ai Catalog 补全、排序与不可选过滤。
 *
 * @example
 * ```ts
 * const catalog = createLlmModelCatalog();
 * const models = await catalog.list(config);
 * ```
 */
export interface LlmModelCatalog {
    /**
     * 查询并列出当前配置 Provider 的模型列表。
     *
     * @param config - 当前 LLM 配置。
     * @param options - 包含取消信号与注入 fetch 的可选参数。
     * @returns 排序并补全后的模型描述符列表。
     * @throws ModelCatalogError 鉴权失败、权限被拒、协议格式错误或已取消时抛出。
     */
    list(
        config: LlmConfig,
        options?: { readonly signal?: AbortSignal | undefined; readonly fetch?: typeof fetch | undefined },
    ): Promise<readonly LlmModelDescriptor[]>;
}

const STATIC_FACTORIES = {
    openai: openaiProvider,
    google: googleProvider,
    anthropic: anthropicProvider,
    openrouter: openrouterProvider,
    deepseek: deepseekProvider,
};

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
 * 判定模型在当前配置下是否可选及原因。
 */
export function determineSelectability(
    provider: LlmProvider,
    id: string,
    contextWindowTokens: number | undefined,
    maxOutputTokens: number | undefined,
    rawDetails: {
        readonly supportedGenerationMethods?: readonly string[] | undefined;
        readonly isTextGeneration?: boolean | undefined;
        readonly supportsStrictOutput?: boolean | undefined;
    },
    config: LlmConfig,
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

    // 3. 上下文容量校验（必须存在且合法以构造安全 Binding）
    if (contextWindowTokens === undefined || contextWindowTokens <= 0) {
        return {
            selectable: false,
            unavailableReason: "Missing context window capacity metadata required for safe execution.",
        };
    }

    if (maxOutputTokens !== undefined && maxOutputTokens >= contextWindowTokens) {
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
        config: LlmConfig,
        options?: { readonly signal?: AbortSignal | undefined; readonly fetch?: typeof fetch | undefined },
    ): Promise<readonly LlmModelDescriptor[]> {
        if (options?.signal?.aborted) {
            throw new ModelCatalogError("cancelled", "Model catalog request was cancelled.");
        }

        // 尝试在线获取
        if (this.fetcher !== undefined) {
            try {
                const rawList = await this.fetcher.fetchModels(config, options);
                return this.processLiveModels(rawList, config);
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
                    return this.fallback(config);
                }
                throw error;
            }
        }

        // 若未提供 fetcher，直接降级到静态目录/配置
        return this.fallback(config);
    }

    private processLiveModels(
        rawList: readonly RawFetchedModel[],
        config: LlmConfig,
    ): readonly LlmModelDescriptor[] {
        const seenIds = new Set<string>();
        const results: LlmModelDescriptor[] = [];

        for (const raw of rawList) {
            if (seenIds.has(raw.id)) {
                continue;
            }
            seenIds.add(raw.id);

            // 用 pi-ai 静态目录补全
            const staticModel = config.provider === "openai-compatible"
                ? undefined
                : this.piAiModels.getModel(config.provider, raw.id);

            const hasLiveDisplayName = raw.displayName !== undefined;
            const hasLiveContext = raw.contextWindowTokens !== undefined;
            const hasLiveMaxTokens = raw.maxOutputTokens !== undefined;
            const hasLiveReasoning = raw.reasoning !== undefined;
            const hasLiveVision = raw.vision !== undefined;

            const displayName = raw.displayName ?? staticModel?.name ?? raw.id;
            const contextWindowTokens = raw.contextWindowTokens ?? staticModel?.contextWindow;
            const maxOutputTokens = raw.maxOutputTokens ?? staticModel?.maxTokens;
            const reasoning = raw.reasoning ?? staticModel?.reasoning ?? false;
            const vision = raw.vision ?? (staticModel?.input.includes("image") ?? false);

            let metadataSource: "live" | "catalog" | "configured" | "mixed";
            const liveFieldCount =
                (hasLiveDisplayName ? 1 : 0) +
                (hasLiveContext ? 1 : 0) +
                (hasLiveMaxTokens ? 1 : 0) +
                (hasLiveReasoning ? 1 : 0) +
                (hasLiveVision ? 1 : 0);

            if (liveFieldCount === 5 || (hasLiveDisplayName && hasLiveContext && hasLiveMaxTokens)) {
                metadataSource = "live";
            } else if (liveFieldCount === 0) {
                metadataSource = "catalog";
            } else {
                metadataSource = "mixed";
            }

            const { selectable, unavailableReason } = determineSelectability(
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
            );

            results.push({
                provider: config.provider,
                id: raw.id,
                displayName,
                contextWindowTokens,
                maxOutputTokens,
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

    private fallback(config: LlmConfig): readonly LlmModelDescriptor[] {
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
    return new DefaultLlmModelCatalog(fetcher);
}
