import type { LLMConfig, ProtocolId, ProviderId } from "../../llm-core/src/index";

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
 * 由供应商适配器的发现函数提取，待与静态目录合并。
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
    /** 模型是否支持 LazyGoal 执行所需的工具调用。 */
    readonly supportsTools?: boolean | undefined;
    /** 协议是否支持强制工具选择。 */
    readonly supportsRequiredToolChoice?: boolean | undefined;
    readonly isTextGeneration?: boolean | undefined;
}

/**
 * 适配器静态登记的模型元数据。
 *
 * @remarks
 * 只描述目录所需事实；供应商端点、认证与分页由同一适配器的 `discover` 负责。
 *
 * @example
 * ```ts
 * const model: CatalogModel = { id: "gpt-4o", displayName: "GPT-4o", contextWindowTokens: 128_000 };
 * ```
 */
export interface CatalogModel {
    readonly id: string;
    readonly displayName?: string | undefined;
    readonly contextWindowTokens?: number | undefined;
    readonly maxOutputTokens?: number | undefined;
    readonly reasoning?: boolean | undefined;
    readonly vision?: boolean | undefined;
    readonly supportsRequiredToolChoice?: boolean | undefined;
    readonly isTextGeneration?: boolean | undefined;
}

/** 目录发现调用的可选控制与注入参数。 */
export interface CatalogDiscoverOptions {
    readonly signal?: AbortSignal | undefined;
    readonly fetch?: typeof fetch | undefined;
}

/**
 * 一个供应商的目录来源。
 *
 * @remarks
 * 由适配器声明，`model-catalog` 只负责合并、排序、可选性与降级判定。
 * `protocol` 是执行该供应商模型所需的线格式协议；是否已实现由组合根注入。
 * `requireLiveCapacity` 表示在线模型即使未被 Token 预算要求，也必须具备容量元数据。
 *
 * @example
 * ```ts
 * const source: CatalogSource = {
 *     provider: "openai", protocol: "chat-completions",
 *     staticModels: [{ id: "gpt-4o" }],
 *     discover: async () => [],
 * };
 * ```
 */
export interface CatalogSource {
    readonly provider: ProviderId;
    readonly protocol: ProtocolId;
    readonly staticModels: readonly CatalogModel[];
    readonly requireLiveCapacity?: boolean | undefined;
    discover?(
        config: LLMConfig,
        options?: CatalogDiscoverOptions,
    ): Promise<readonly RawFetchedModel[]>;
}
