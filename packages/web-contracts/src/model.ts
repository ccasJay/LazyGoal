/**
 * Web 模型目录与模型选项数据传输对象 (DTO)。
 */

/**
 * 模型元数据来源分类。
 *
 * @example
 * ```ts
 * const source: BrowserModelMetadataSource = "catalog";
 * ```
 */
export type BrowserModelMetadataSource = "live" | "catalog" | "configured" | "mixed";

/**
 * 候选模型项的展示属性。
 *
 * @example
 * ```ts
 * const option: BrowserModelOption = {
 *     id: "claude-3-5-sonnet",
 *     displayName: "Claude 3.5 Sonnet",
 *     availabilitySource: "catalog",
 *     metadataSource: "catalog",
 *     selectable: true,
 *     contextWindowTokens: 200_000,
 *     maxOutputTokens: 8_192,
 *     reasoning: false,
 *     vision: true,
 * };
 * ```
 */
export interface BrowserModelOption {
    /** 模型唯一标识。 */
    readonly id: string;
    /** 用户友好展示名称。 */
    readonly displayName: string;
    /** 可用性来源。 */
    readonly availabilitySource: "live" | "catalog" | "configured";
    /** 元数据来源。 */
    readonly metadataSource: BrowserModelMetadataSource;
    /** 当前是否可选。 */
    readonly selectable: boolean;
    /** 上下文窗口 Token 上限。 */
    readonly contextWindowTokens?: number | undefined;
    /** 最大输出 Token 上限。 */
    readonly maxOutputTokens?: number | undefined;
    /** 是否支持思维链/思考推理。 */
    readonly reasoning?: boolean | undefined;
    /** 是否支持多模态视觉。 */
    readonly vision?: boolean | undefined;
    /** 不可选时的提示原因。 */
    readonly unavailableReason?: string | undefined;
}

/**
 * 默认模型提示告警分类。
 *
 * @example
 * ```ts
 * const error: BrowserModelCatalogNotice = "provider_changed";
 * ```
 */
export type BrowserModelCatalogNotice = "provider_changed" | "model_unavailable";

/**
 * 浏览器模型目录读取的稳定失败分类。
 *
 * @example
 * ```ts
 * const err: BrowserModelCatalogError = "model_catalog_unavailable";
 * ```
 */
export type BrowserModelCatalogError =
    | "goal_not_found"
    | "stale_run"
    | "model_catalog_authentication"
    | "model_catalog_permission"
    | "model_catalog_protocol"
    | "model_catalog_unavailable";

/**
 * 完整模型目录投影。
 *
 * @example
 * ```ts
 * const catalog: BrowserModelCatalog = {
 *     provider: "anthropic",
 *     currentModelId: "claude-3-5-sonnet",
 *     models: [],
 * };
 * ```
 */
export interface BrowserModelCatalog {
    /** 当前生效的 Provider 名称。 */
    readonly provider: string;
    /** 当前选中的模型标识。 */
    readonly currentModelId: string;
    /** 默认模型告警提示。 */
    readonly defaultModelNotice?: BrowserModelCatalogNotice;
    /** 可用模型列表。 */
    readonly models: readonly BrowserModelOption[];
}

/**
 * 供投影目录的最小模型元数据来源。
 *
 * @example
 * ```ts
 * const source: BrowserModelSource = {
 *     provider: "openai",
 *     id: "gpt-4o",
 *     displayName: "GPT-4o",
 *     availabilitySource: "live",
 *     metadataSource: "catalog",
 *     selectable: true,
 * };
 * ```
 */
export interface BrowserModelSource extends BrowserModelOption {
    /** 供应商标识。 */
    readonly provider: string;
}

/**
 * 读取模型目录结果。
 *
 * @example
 * ```ts
 * const res: BrowserModelCatalogReadResult = {
 *     ok: true,
 *     catalog: { provider: "openai", currentModelId: "gpt-4o", models: [] },
 * };
 * ```
 */
export type BrowserModelCatalogReadResult =
    | { readonly ok: true; readonly catalog: BrowserModelCatalog }
    | { readonly ok: false; readonly error: BrowserModelCatalogError };
