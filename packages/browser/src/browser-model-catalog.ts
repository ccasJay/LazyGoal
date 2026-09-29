/**
 * 浏览器可见的单个模型选项。
 *
 * @remarks
 * 只承载选择界面需要的非敏感字段；不包含 Provider 凭据或原始响应。
 *
 * @example
 * ```ts
 * const option: BrowserModelOption = {
 *     id: "gpt-4o", displayName: "GPT-4o", availabilitySource: "live",
 *     metadataSource: "catalog", selectable: true,
 * };
 * ```
 */
export interface BrowserModelOption {
    readonly id: string;
    readonly displayName: string;
    readonly contextWindowTokens?: number | undefined;
    readonly maxOutputTokens?: number | undefined;
    readonly reasoning?: boolean | undefined;
    readonly vision?: boolean | undefined;
    readonly availabilitySource: "live" | "catalog" | "configured";
    readonly metadataSource: "live" | "catalog" | "configured" | "mixed";
    readonly selectable: boolean;
    readonly unavailableReason?: string | undefined;
}

/**
 * 浏览器模型目录响应的非敏感内容。
 *
 * @example
 * ```ts
 * const catalog: BrowserModelCatalog = {
 *     provider: "openai", currentModelId: "gpt-4o", models: [],
 * };
 * ```
 */
export interface BrowserModelCatalog {
    readonly provider: string;
    readonly currentModelId: string;
    readonly models: readonly BrowserModelOption[];
}

/** 浏览器模型目录读取的稳定失败分类。 */
export type BrowserModelCatalogError =
    | "goal_not_found"
    | "stale_run"
    | "model_catalog_authentication"
    | "model_catalog_permission"
    | "model_catalog_protocol"
    | "model_catalog_unavailable";

/** 浏览器模型目录读取结果；失败时不包含 Provider 原始响应。 */
export type BrowserModelCatalogReadResult =
    | { readonly ok: true; readonly catalog: BrowserModelCatalog }
    | { readonly ok: false; readonly error: BrowserModelCatalogError };

/**
 * 供组合根投影目录的最小模型元数据来源。
 *
 * @remarks
 * 来源可含额外字段，但投影只复制此契约列出的字段。
 *
 * @example
 * ```ts
 * const source: BrowserModelSource = {
 *     provider: "openai", id: "gpt-4o", displayName: "GPT-4o",
 *     availabilitySource: "live", metadataSource: "catalog", selectable: true,
 * };
 * ```
 */
export interface BrowserModelSource extends BrowserModelOption {
    readonly provider: string;
}

/**
 * 将当前 Provider 模型目录裁剪为浏览器白名单。
 *
 * @param provider - 当前进程配置的 Provider。
 * @param currentModelId - 草稿默认或 Goal 已保存的模型 ID。
 * @param source - 已由本机模型目录完成兼容性判定的模型。
 * @returns 仅含当前 Provider 模型与明确列出的非敏感字段。
 */
export function projectBrowserModelCatalog(
    provider: string,
    currentModelId: string,
    source: readonly BrowserModelSource[],
): BrowserModelCatalog {
    return {
        provider,
        currentModelId,
        models: source.filter((model) => model.provider === provider).map((model) => ({
            id: model.id,
            displayName: model.displayName,
            ...(model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens }),
            ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
            ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
            ...(model.vision === undefined ? {} : { vision: model.vision }),
            availabilitySource: model.availabilitySource,
            metadataSource: model.metadataSource,
            selectable: model.selectable,
            ...(model.unavailableReason === undefined ? {} : { unavailableReason: model.unavailableReason }),
        })),
    };
}
