import type { LLMConfig } from "../../llm-core/src/index.js";

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
        config: LLMConfig,
        options?: { readonly signal?: AbortSignal | undefined; readonly fetch?: typeof fetch | undefined },
    ): Promise<readonly RawFetchedModel[]>;
}
