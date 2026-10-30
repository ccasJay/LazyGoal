import type { InferContract } from "../../contracts/src/index";
import {
    browserProviderFallbackContract,
    browserProviderModelQueryContract,
    browserProviderProfileActivationResultContract,
    browserProviderProfileContract,
    browserProviderProfileDeleteResultContract,
    browserProviderProfileInputContract,
    browserProviderProfileTestErrorContract,
    browserProviderProfileTestResultContract,
    browserProviderProfileWriteResultContract,
    browserProviderSettingsContract,
    browserProviderSettingsErrorContract,
    browserProviderSettingsReadResultContract,
} from "./contracts/provider";

/**
 * 受管 Provider 档案与设置页的数据传输对象 (DTO)。
 *
 * @remarks
 * 本模块的所有投影都不含明文凭据：凭据只以 `hasApiKey` 与 `apiKeyMask` 表示。
 */

/**
 * 受管 Provider 档案的非敏感投影。
 *
 * @example
 * ```ts
 * const profile: BrowserProviderProfile = {
 *     id: "6f1c...", label: "OpenAI 主账号", kind: "openai", defaultModel: "gpt-4o",
 *     hasApiKey: true, apiKeyMask: "****c123",
 * };
 * ```
 */
export type BrowserProviderProfile = InferContract<typeof browserProviderProfileContract>;

/**
 * 只读的 `config.toml` 回退来源投影。
 *
 * @example
 * ```ts
 * const fallback: BrowserProviderFallback = { source: "config", provider: "google", model: "gemini-2.5-pro" };
 * ```
 */
export type BrowserProviderFallback = InferContract<typeof browserProviderFallbackContract>;

/**
 * 设置页读取结果。
 *
 * @example
 * ```ts
 * const settings: BrowserProviderSettings = { profiles: [], fallback: { source: "config", provider: "openai", model: "gpt-4o" } };
 * ```
 */
export type BrowserProviderSettings = InferContract<typeof browserProviderSettingsContract>;

/**
 * 设置操作的稳定失败分类。
 *
 * @example
 * ```ts
 * const error: BrowserProviderSettingsError = "provider_profile_not_found";
 * ```
 */
export type BrowserProviderSettingsError =
    InferContract<typeof browserProviderSettingsErrorContract>;

/**
 * 设置页读取结果。
 *
 * @example
 * ```ts
 * const result: BrowserProviderSettingsReadResult = { ok: false, error: "provider_profile_unavailable" };
 * ```
 */
export type BrowserProviderSettingsReadResult =
    InferContract<typeof browserProviderSettingsReadResultContract>;

/**
 * 创建或部分更新档案的输入。
 *
 * @remarks
 * `label`、`kind`、`defaultModel` 在创建与更新时都必须提供；可选字段省略表示保留原值，
 * 显式传 `null` 表示清空该字段。`apiKey` 省略表示保留原凭据（创建时省略则校验失败）。
 *
 * @example
 * ```ts
 * const input: BrowserProviderProfileInput = { label: "OpenAI", kind: "openai", defaultModel: "gpt-4o", apiKey: "sk-..." };
 * ```
 */
export type BrowserProviderProfileInput =
    InferContract<typeof browserProviderProfileInputContract>;

/**
 * 创建或更新结果。
 *
 * @example
 * ```ts
 * const result: BrowserProviderProfileWriteResult = { ok: false, error: "provider_profile_invalid", fields: ["base_url"] };
 * ```
 */
export type BrowserProviderProfileWriteResult =
    InferContract<typeof browserProviderProfileWriteResultContract>;

/**
 * 删除结果。
 *
 * @remarks
 * `mayBeReferencedByGoals` 为 `true` 表示可能存在引用该档案的 Goal；删除后这些 Goal 恢复时会要求重新选择。
 *
 * @example
 * ```ts
 * const result: BrowserProviderProfileDeleteResult = { ok: false, error: "provider_profile_active" };
 * ```
 */
export type BrowserProviderProfileDeleteResult =
    InferContract<typeof browserProviderProfileDeleteResultContract>;

/**
 * 激活结果。
 *
 * @example
 * ```ts
 * const result: BrowserProviderProfileActivationResult = { ok: true, activeProfileId: "6f1c..." };
 * ```
 */
export type BrowserProviderProfileActivationResult =
    InferContract<typeof browserProviderProfileActivationResultContract>;

/**
 * 连接测试的稳定失败分类。
 *
 * @example
 * ```ts
 * const error: BrowserProviderProfileTestError = "model_catalog_authentication";
 * ```
 */
export type BrowserProviderProfileTestError =
    InferContract<typeof browserProviderProfileTestErrorContract>;

/**
 * 连接测试结果。
 *
 * @remarks
 * 仅执行在线模型列表拉取，不发起生成请求。
 *
 * @example
 * ```ts
 * const result: BrowserProviderProfileTestResult = { ok: true, modelCount: 29 };
 * ```
 */
export type BrowserProviderProfileTestResult =
    InferContract<typeof browserProviderProfileTestResultContract>;

/**
 * 未保存表单的在线模型查询；省略密钥时仅允许复用指定档案的同类供应商凭据。
 * @remarks 不保存输入，不改变激活来源，不要求先选择默认模型。
 * @example
 * ```ts
 * const query: BrowserProviderModelQuery = { kind: "google", apiKey: "secret" };
 * ```
 */
export type BrowserProviderModelQuery =
    InferContract<typeof browserProviderModelQueryContract>;

/**
 * Provider 在线目录返回的单个模型标识与展示名称。
 *
 * @example
 * ```ts
 * const model: BrowserProviderModel = { id: "model-1", name: "Model 1" };
 * ```
 */
export interface BrowserProviderModel {
    /** @pattern \S */
    id: string;
    name: string;
}

/**
 * Provider 在线目录的成功响应；只确认模型标识可供展示和选择，不代表生成能力已经验证。
 *
 * @example
 * ```ts
 * const result: BrowserProviderModels = { ok: true, models: [{ id: "model-1", name: "Model 1" }] };
 * ```
 */
export interface BrowserProviderModels {
    ok: true;
    models: BrowserProviderModel[];
}
