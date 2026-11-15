import type { LLMConfig, LlmModelDescriptor, ProtocolId } from "../../llm-core/src/index";
import {
    ModelCatalogError,
    type CatalogModel,
    type CatalogSource,
    type RawFetchedModel,
} from "./contracts";

/**
 * 语言模型目录查询契约。
 *
 * @remarks
 * 目录只消费组合根注入的协议可用性与适配器目录来源，执行合并、排序、可选性与降级判定。
 *
 * @example
 * ```ts
 * const catalog = createLlmModelCatalog({ sources, isProtocolImplemented });
 * const models = await catalog.list(config);
 * ```
 */
export interface LlmModelCatalog {
    /**
     * @param config - 当前 LLM 配置。
     * @param options - 取消信号、注入 fetch 与是否要求 Token 容量。
     * @returns 排序并补全后的模型描述符。
     * @throws ModelCatalogError 鉴权、权限、协议错误或已取消时抛出。
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

/** 目录构造所需的注入事实。 */
export interface LlmModelCatalogOptions {
    /** 各供应商的目录来源；同一供应商只应登记一个来源。 */
    readonly sources: readonly CatalogSource[];
    /** 组合根判定的协议实现可用性。 */
    readonly isProtocolImplemented: (protocol: ProtocolId) => boolean;
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
 * 判定模型在当前协议与预算条件下是否可选。
 *
 * @param input - 模型事实、协议可用性与 Token 预算要求。
 * @returns 可选性与不可选原因。
 *
 * @example
 * ```ts
 * const { selectable } = determineSelectability({ id: "gpt-4o", protocolImplemented: true, requireTokenCapacity: false });
 * ```
 */
export function determineSelectability(input: {
    readonly id: string;
    readonly protocolImplemented: boolean;
    readonly isTextGeneration?: boolean | undefined;
    readonly supportsTools?: boolean | undefined;
    readonly contextWindowTokens?: number | undefined;
    readonly maxOutputTokens?: number | undefined;
    readonly requireTokenCapacity: boolean;
}): { readonly selectable: boolean; readonly unavailableReason?: string | undefined } {
    if (!input.protocolImplemented) {
        return { selectable: false, unavailableReason: "Model protocol is not implemented." };
    }
    if (input.isTextGeneration === false || isKnownNonTextModel(input.id)) {
        return { selectable: false, unavailableReason: "Model does not support text generation." };
    }
    if (input.supportsTools === false) {
        return { selectable: false, unavailableReason: "Model does not support tool calls." };
    }
    if (input.requireTokenCapacity && (input.contextWindowTokens === undefined || input.contextWindowTokens <= 0)) {
        return { selectable: false, unavailableReason: "Token budgeting requires context window capacity metadata." };
    }
    if (input.requireTokenCapacity && (input.maxOutputTokens === undefined || input.maxOutputTokens <= 0)) {
        return { selectable: false, unavailableReason: "Token budgeting requires max output token metadata." };
    }
    if (input.contextWindowTokens !== undefined && input.maxOutputTokens !== undefined
        && input.maxOutputTokens >= input.contextWindowTokens) {
        return { selectable: false, unavailableReason: "Max output tokens must be strictly less than context window." };
    }
    return { selectable: true };
}

/**
 * 对模型描述列表进行稳定排序：
 * 1. 当前模型优先；
 * 2. 可选择项优先；
 * 3. displayName 升序；
 * 4. id 升序。
 *
 * @param models - 待排序描述符。
 * @param currentModelId - 当前选择的模型标识。
 * @returns 新排序数组，不修改输入。
 *
 * @example
 * ```ts
 * const sorted = sortModelDescriptors(models, config.model);
 * ```
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
 * 默认模型目录实现。
 *
 * @remarks
 * 在线列表成功时以其模型集合为准，并用同供应商静态元数据补全缺失字段；
 * 超时、不可用与不支持发现时降级到静态目录；鉴权、权限、协议错误与取消不降级。
 */
export class DefaultLlmModelCatalog implements LlmModelCatalog {
    private readonly sources: ReadonlyMap<string, CatalogSource>;

    /** @param options - 供应商来源与协议可用性注入。 */
    constructor(private readonly options: LlmModelCatalogOptions) {
        this.sources = new Map(options.sources.map(source => [source.provider, source]));
    }

    async list(
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
        const source = this.sources.get(config.provider);
        if (source === undefined) {
            throw new ModelCatalogError("unsupported", `No model catalog source is registered for provider "${config.provider}".`);
        }
        const requireTokenCapacity = options?.requireTokenCapacity ?? false;

        if (source.discover !== undefined) {
            try {
                const rawList = await source.discover(config, options);
                return this.processLiveModels(rawList, config, source, requireTokenCapacity);
            } catch (error) {
                if (error instanceof ModelCatalogError) {
                    if (error.kind === "authentication" || error.kind === "permission"
                        || error.kind === "protocol" || error.kind === "cancelled") {
                        throw error;
                    }
                    return this.fallback(config, source, requireTokenCapacity);
                }
                throw error;
            }
        }
        return this.fallback(config, source, requireTokenCapacity);
    }

    private processLiveModels(
        rawList: readonly RawFetchedModel[],
        config: LLMConfig,
        source: CatalogSource,
        requireTokenCapacity: boolean,
    ): readonly LlmModelDescriptor[] {
        const seenIds = new Set<string>();
        const results: LlmModelDescriptor[] = [];
        for (const raw of rawList) {
            if (seenIds.has(raw.id)) continue;
            seenIds.add(raw.id);
            const staticModel = source.staticModels.find(model => model.id === raw.id);
            const displayName = raw.displayName ?? staticModel?.displayName ?? raw.id;
            const contextWindowTokens = raw.contextWindowTokens ?? staticModel?.contextWindowTokens;
            const rawMaxOutputTokens = raw.maxOutputTokens ?? staticModel?.maxOutputTokens;
            const maxOutputTokens = contextWindowTokens !== undefined && rawMaxOutputTokens !== undefined
                ? Math.min(rawMaxOutputTokens, Math.max(0, contextWindowTokens - 1))
                : rawMaxOutputTokens;
            const reasoning = raw.reasoning ?? staticModel?.reasoning ?? false;
            const vision = raw.vision ?? staticModel?.vision ?? false;
            const supportsRequiredToolChoice = raw.supportsRequiredToolChoice ?? staticModel?.supportsRequiredToolChoice;
            const isTextGeneration = raw.isTextGeneration ?? staticModel?.isTextGeneration;

            let metadataSource: LlmModelDescriptor["metadataSource"];
            const liveFieldCount = (raw.displayName === undefined ? 0 : 1)
                + (raw.contextWindowTokens === undefined ? 0 : 1)
                + (raw.maxOutputTokens === undefined ? 0 : 1)
                + (raw.reasoning === undefined ? 0 : 1)
                + (raw.vision === undefined ? 0 : 1)
                + (raw.supportsTools === undefined ? 0 : 1)
                + (raw.supportsRequiredToolChoice === undefined ? 0 : 1);
            const hasCompleteCapacity = raw.displayName !== undefined
                && raw.contextWindowTokens !== undefined && raw.maxOutputTokens !== undefined;
            metadataSource = liveFieldCount >= 5 || hasCompleteCapacity
                ? "live"
                : liveFieldCount === 0 ? (staticModel === undefined ? "live" : "catalog") : "mixed";

            const { selectable, unavailableReason } = determineSelectability({
                id: raw.id,
                protocolImplemented: this.options.isProtocolImplemented(source.protocol),
                ...(isTextGeneration === undefined ? {} : { isTextGeneration }),
                ...(raw.supportsTools === undefined ? {} : { supportsTools: raw.supportsTools }),
                ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
                ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
                requireTokenCapacity: requireTokenCapacity || source.requireLiveCapacity === true,
            });

            results.push({
                provider: config.provider,
                id: raw.id,
                displayName,
                protocol: source.protocol,
                ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
                ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
                reasoning,
                vision,
                ...(supportsRequiredToolChoice === undefined ? {} : { supportsRequiredToolChoice }),
                availabilitySource: "live",
                metadataSource,
                selectable,
                ...(unavailableReason === undefined ? {} : { unavailableReason }),
            });
        }
        return sortModelDescriptors(results, config.model);
    }

    private fallback(
        config: LLMConfig,
        source: CatalogSource,
        requireTokenCapacity: boolean,
    ): readonly LlmModelDescriptor[] {
        if (source.staticModels.length === 0) {
            const descriptor = this.configuredDescriptor(config, source, requireTokenCapacity);
            return [descriptor];
        }
        const results: LlmModelDescriptor[] = [];
        for (const staticModel of source.staticModels) {
            results.push(this.staticDescriptor(config, source, staticModel, requireTokenCapacity));
        }
        return sortModelDescriptors(results, config.model);
    }

    private configuredDescriptor(
        config: LLMConfig,
        source: CatalogSource,
        requireTokenCapacity: boolean,
    ): LlmModelDescriptor {
        const contextWindowTokens = "contextWindowTokens" in config ? readPositive(config.contextWindowTokens) : undefined;
        const maxOutputTokens = readPositive(config.maxOutputTokens);
        const { selectable, unavailableReason } = determineSelectability({
            id: config.model,
            protocolImplemented: this.options.isProtocolImplemented(source.protocol),
            ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            requireTokenCapacity,
        });
        return {
            provider: config.provider,
            id: config.model,
            displayName: config.model,
            protocol: source.protocol,
            ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            availabilitySource: "configured",
            metadataSource: "configured",
            selectable,
            ...(unavailableReason === undefined ? {} : { unavailableReason }),
        };
    }

    private staticDescriptor(
        config: LLMConfig,
        source: CatalogSource,
        model: CatalogModel,
        requireTokenCapacity: boolean,
    ): LlmModelDescriptor {
        const contextWindowTokens = readPositive(model.contextWindowTokens);
        const maxOutputTokens = contextWindowTokens !== undefined && model.maxOutputTokens !== undefined
            ? Math.min(model.maxOutputTokens, Math.max(0, contextWindowTokens - 1))
            : readPositive(model.maxOutputTokens);
        const { selectable, unavailableReason } = determineSelectability({
            id: model.id,
            protocolImplemented: this.options.isProtocolImplemented(source.protocol),
            ...(model.isTextGeneration === undefined ? {} : { isTextGeneration: model.isTextGeneration }),
            ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            requireTokenCapacity,
        });
        return {
            provider: config.provider,
            id: model.id,
            displayName: model.displayName ?? model.id,
            protocol: source.protocol,
            ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            reasoning: model.reasoning ?? false,
            vision: model.vision ?? false,
            ...(model.supportsRequiredToolChoice === undefined
                ? {}
                : { supportsRequiredToolChoice: model.supportsRequiredToolChoice }),
            availabilitySource: "catalog",
            metadataSource: "catalog",
            selectable,
            ...(unavailableReason === undefined ? {} : { unavailableReason }),
        };
    }
}

function readPositive(value: number | undefined): number | undefined {
    return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * 创建模型目录查询实例。
 *
 * @param options - 供应商来源与协议可用性注入。
 * @returns 目录实例。
 *
 * @example
 * ```ts
 * const catalog = createLlmModelCatalog({ sources, isProtocolImplemented: () => true });
 * ```
 */
export function createLlmModelCatalog(options: LlmModelCatalogOptions): LlmModelCatalog {
    return new DefaultLlmModelCatalog(options);
}
