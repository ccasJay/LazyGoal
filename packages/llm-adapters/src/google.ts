import {
    LLMConfigurationError,
    type LLMAdapter,
    type LLMConfig,
} from "../../llm-core/src/index";
import { Gemini } from "../../llm-google/src/index";
import type { CatalogSource } from "../../model-catalog/src/index";
import { DefaultProviderModelFetcher } from "./catalog-fetchers";
import { GOOGLE_GENERATE_CONTENT_PROTOCOL } from "./protocols";
import type { ProviderAdapterDefinition } from "./registry";

/**
 * 创建 Google 官方目录来源。
 *
 * @remarks
 * 静态模型事实来自锁定版本目录；在线发现由本适配器拥有的 fetcher 提供。
 *
 * @returns 可交给 `model-catalog` 的供应商目录来源。
 *
 * @example
 * ```ts
 * const source = createGoogleCatalogSource();
 * ```
 */
export function createGoogleCatalogSource(): CatalogSource {
    const fetcher = new DefaultProviderModelFetcher();
    return {
        provider: "google",
        protocol: GOOGLE_GENERATE_CONTENT_PROTOCOL,
        staticModels: [],
        discover: (config, options) => fetcher.fetchModels(config, options),
    };
}

/**
 * 创建 Gemini 执行适配器。
 *
 * @remarks
 * 原生 GenerateContent 协议：Schema 投影、空值哨兵与流终态校验由
 * `wire-google-generate-content` 提供；适配器只声明端点与认证事实。
 *
 * @param config - 已校验的 Google 连接配置。
 * @returns 通过原生 GenerateContent 线格式执行的适配器。
 * @throws LLMConfigurationError 连接不属于 Google 时抛出。
 *
 * @example
 * ```ts
 * const adapter = createGoogleAdapter({ provider: "google", apiKey: "secret", model: "gemini-2.5-flash" });
 * ```
 */
export function createGoogleAdapter(config: LLMConfig): LLMAdapter {
    if (config.provider !== "google") {
        throw new LLMConfigurationError([], `Provider "${config.provider}" is not the Google adapter`);
    }
    return new Gemini({
        apiKey: config.apiKey,
        model: config.model,
        ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
        ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
    });
}

/**
 * Google 的注册表声明。
 *
 * @returns 供应商标识、协议、目录来源与适配器工厂。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createGoogleProviderAdapter()]);
 * ```
 */
export function createGoogleProviderAdapter(): ProviderAdapterDefinition {
    return {
        id: "google",
        protocol: GOOGLE_GENERATE_CONTENT_PROTOCOL,
        catalog: createGoogleCatalogSource(),
        createAdapter: createGoogleAdapter,
    };
}
