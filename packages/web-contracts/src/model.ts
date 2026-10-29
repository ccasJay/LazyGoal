import type { InferContract } from "../../contracts/src/index";
import {
    browserModelCatalogContract,
    browserModelCatalogErrorContract,
    browserModelCatalogNoticeContract,
    browserModelCatalogReadResultContract,
    browserModelMetadataSourceContract,
    browserModelOptionContract,
    browserModelSourceContract,
    browserModelSourceRefContract,
} from "./contracts/model";

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
export type BrowserModelMetadataSource =
    InferContract<typeof browserModelMetadataSourceContract>;

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
export type BrowserModelOption = InferContract<typeof browserModelOptionContract>;

/**
 * 默认模型提示告警分类。
 *
 * @example
 * ```ts
 * const error: BrowserModelCatalogNotice = "provider_changed";
 * ```
 */
export type BrowserModelCatalogNotice =
    InferContract<typeof browserModelCatalogNoticeContract>;

/**
 * 浏览器模型目录读取的稳定失败分类。
 *
 * @example
 * ```ts
 * const err: BrowserModelCatalogError = "model_catalog_unavailable";
 * ```
 */
export type BrowserModelCatalogError =
    InferContract<typeof browserModelCatalogErrorContract>;

/**
 * 可供选择的模型来源：受管 Provider 档案或 `config.toml` 回退。
 *
 * @example
 * ```ts
 * const source: BrowserModelSourceRef = { profileId: "6f1c...", kind: "openai", label: "OpenAI 主账号", active: true };
 * ```
 */
export type BrowserModelSourceRef =
    InferContract<typeof browserModelSourceRefContract>;

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
export type BrowserModelCatalog = InferContract<typeof browserModelCatalogContract>;

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
export type BrowserModelSource = InferContract<typeof browserModelSourceContract>;

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
    InferContract<typeof browserModelCatalogReadResultContract>;
