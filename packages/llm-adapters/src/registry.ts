import {
    LLMConfigurationError,
    type LLMAdapter,
    type LLMConfig,
    type ProtocolId,
    type ProviderId,
} from "../../llm-core/src/index";
import type { CatalogSource } from "../../model-catalog/src/index";

/**
 * 供应商适配器的注册声明。
 *
 * @remarks
 * 每个供应商只声明一次：标识、所用协议、目录来源与执行工厂。
 * 新增供应商只需新增声明并注册，不修改 `llm-core` 或配置解析。
 *
 * @example
 * ```ts
 * const definition: ProviderAdapterDefinition = {
 *     id: "openai", protocol: "chat-completions",
 *     catalog: createOpenAICatalogSource(), createAdapter: createOpenAIAdapter,
 * };
 * ```
 */
export interface ProviderAdapterDefinition {
    /** 开放的供应商标识；不要求 `llm-core` 维护闭合清单。 */
    readonly id: ProviderId;
    /** 该供应商模型使用的线格式协议。 */
    readonly protocol: ProtocolId;
    /** 该供应商的目录来源。 */
    readonly catalog: CatalogSource;
    /** 按已校验连接配置创建执行适配器。 */
    createAdapter(config: LLMConfig): LLMAdapter;
}

/** 开放供应商注册表。 */
export interface ProviderRegistry {
    /** 当前已注册的供应商标识，按注册顺序。 */
    ids(): readonly ProviderId[];
    /** 当前已注册的适配器声明。 */
    definitions(): readonly ProviderAdapterDefinition[];
    /** 判定供应商标识是否已注册。 */
    has(id: ProviderId): boolean;
    /**
     * 取得已注册的适配器声明。
     *
     * @throws LLMConfigurationError 标识未注册时抛出，并列出已注册供应商。
     */
    require(id: ProviderId): ProviderAdapterDefinition;
    /** 供模型目录使用的全部目录来源。 */
    sources(): readonly CatalogSource[];
}

/**
 * 创建开放供应商注册表。
 *
 * @param definitions - 适配器声明；标识必须唯一。
 * @returns 只读注册表。
 * @throws LLMConfigurationError 标识重复或为空时抛出。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createOpenAIProviderAdapter()]);
 * const adapter = registry.require("openai").createAdapter(config);
 * ```
 */
export function createProviderRegistry(
    definitions: readonly ProviderAdapterDefinition[],
): ProviderRegistry {
    const byId = new Map<ProviderId, ProviderAdapterDefinition>();
    for (const definition of definitions) {
        if (definition.id.trim().length === 0) {
            throw new LLMConfigurationError([], "Provider adapter id must not be empty");
        }
        if (byId.has(definition.id)) {
            throw new LLMConfigurationError([], `Duplicate provider adapter id "${definition.id}"`);
        }
        byId.set(definition.id, definition);
    }
    return {
        ids: () => definitions.map(definition => definition.id),
        definitions: () => definitions,
        has: id => byId.has(id),
        require: (id) => {
            const definition = byId.get(id);
            if (definition === undefined) {
                const known = definitions.length === 0 ? "none" : definitions.map(entry => entry.id).join(", ");
                throw new LLMConfigurationError([], `Unknown provider "${id}"; registered providers: ${known}`);
            }
            return definition;
        },
        sources: () => definitions.map(definition => definition.catalog),
    };
}
