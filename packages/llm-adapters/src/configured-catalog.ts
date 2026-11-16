import type { CatalogModel, CatalogSource } from "../../model-catalog/src/index";
import type { ProviderAdapterDefinition } from "./registry";

/**
 * 由配置声明生成目录来源。
 *
 * @remarks
 * 配置实例继承家族适配器的协议与在线发现，并把配置中的 `models[]` 作为静态事实。
 * 发现调用把供应商标识替换为家族标识，端点与认证仍来自实例连接。
 *
 * @param definition - 实例所属家族的适配器声明。
 * @param provider - 配置实例的供应商标识。
 * @param models - 配置声明的模型事实。
 * @returns 可直接注入 `createLlmModelCatalog` 的目录来源。
 *
 * @example
 * ```ts
 * const source = createConfiguredCatalogSource(definition, "mistral", models);
 * ```
 */
export function createConfiguredCatalogSource(
    definition: ProviderAdapterDefinition,
    provider: string,
    models: readonly CatalogModel[],
): CatalogSource {
    const discover = definition.catalog.discover;
    return {
        provider,
        protocol: definition.protocol,
        staticModels: models,
        ...(definition.catalog.requireLiveCapacity === undefined
            ? {}
            : { requireLiveCapacity: definition.catalog.requireLiveCapacity }),
        ...(discover === undefined
            ? {}
            : {
                discover: (config, options) => discover({ ...config, provider: definition.id }, options),
            }),
    };
}
