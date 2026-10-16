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
export interface BrowserProviderProfile {
    /** 稳定唯一且不可变的档案标识。 */
    readonly id: string;
    /** 面向用户的展示名。 */
    readonly label: string;
    /** 供应商标识。 */
    readonly kind: string;
    /** 默认模型。 */
    readonly defaultModel: string;
    /** 端点覆盖；仅部分供应商有值。 */
    readonly baseURL?: string | undefined;
    /** 自定义模型的上下文窗口上限。 */
    readonly contextWindowTokens?: number | undefined;
    /** 输出 Token 上限。 */
    readonly maxOutputTokens?: number | undefined;
    /** 结构化输出模式；省略时由运行时派生。 */
    readonly structuredOutputMode?: "strict" | "prompt_only" | "two_stage" | undefined;
    /** 是否已保存凭据。 */
    readonly hasApiKey: boolean;
    /** 凭据掩码；未保存凭据时为空串。 */
    readonly apiKeyMask: string;
}

/**
 * 只读的 `config.toml` 回退来源投影。
 *
 * @example
 * ```ts
 * const fallback: BrowserProviderFallback = { source: "config", provider: "google", model: "gemini-2.5-pro" };
 * ```
 */
export interface BrowserProviderFallback {
    readonly source: "config";
    readonly provider: string;
    readonly model: string;
}

/**
 * 设置页读取结果。
 *
 * @example
 * ```ts
 * const settings: BrowserProviderSettings = { profiles: [], fallback: { source: "config", provider: "openai", model: "gpt-4o" } };
 * ```
 */
export interface BrowserProviderSettings {
    /** 当前受管激活档案标识；未设置时省略。 */
    readonly activeProfileId?: string | undefined;
    /** 已保存的受管档案。 */
    readonly profiles: readonly BrowserProviderProfile[];
    /** `config.toml` 回退来源；进程无回退配置时省略。 */
    readonly fallback?: BrowserProviderFallback | undefined;
}

/**
 * 设置操作的稳定失败分类。
 *
 * @example
 * ```ts
 * const error: BrowserProviderSettingsError = "provider_profile_not_found";
 * ```
 */
export type BrowserProviderSettingsError =
    | "provider_profile_not_found"
    | "provider_profile_conflict"
    | "provider_profile_active"
    | "provider_profile_invalid"
    | "provider_profile_unavailable";

/**
 * 设置页读取结果。
 *
 * @example
 * ```ts
 * const result: BrowserProviderSettingsReadResult = { ok: false, error: "provider_profile_unavailable" };
 * ```
 */
export type BrowserProviderSettingsReadResult =
    | { readonly ok: true; readonly settings: BrowserProviderSettings }
    | { readonly ok: false; readonly error: BrowserProviderSettingsError };

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
export interface BrowserProviderProfileInput {
    readonly label: string;
    readonly kind: string;
    readonly defaultModel: string;
    /** 凭据；省略表示保留原值。 */
    readonly apiKey?: string | undefined;
    /** 端点覆盖；`null` 表示清空。 */
    readonly baseURL?: string | null | undefined;
    /** 上下文窗口上限；`null` 表示清空。 */
    readonly contextWindowTokens?: number | null | undefined;
    /** 输出上限；`null` 表示清空。 */
    readonly maxOutputTokens?: number | null | undefined;
    /** 结构化输出模式；`null` 表示清空。 */
    readonly structuredOutputMode?: "strict" | "prompt_only" | "two_stage" | null | undefined;
}

/**
 * 创建或更新结果。
 *
 * @example
 * ```ts
 * const result: BrowserProviderProfileWriteResult = { ok: false, error: "provider_profile_invalid", fields: ["base_url"] };
 * ```
 */
export type BrowserProviderProfileWriteResult =
    | { readonly ok: true; readonly profile: BrowserProviderProfile }
    | { readonly ok: false; readonly error: BrowserProviderSettingsError; readonly fields?: readonly string[] | undefined };

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
    | { readonly ok: true; readonly profile: BrowserProviderProfile; readonly mayBeReferencedByGoals: boolean }
    | { readonly ok: false; readonly error: BrowserProviderSettingsError };

/**
 * 激活结果。
 *
 * @example
 * ```ts
 * const result: BrowserProviderProfileActivationResult = { ok: true, activeProfileId: "6f1c..." };
 * ```
 */
export type BrowserProviderProfileActivationResult =
    | { readonly ok: true; readonly activeProfileId: string }
    | { readonly ok: false; readonly error: BrowserProviderSettingsError };

/**
 * 连接测试的稳定失败分类。
 *
 * @example
 * ```ts
 * const error: BrowserProviderProfileTestError = "model_catalog_authentication";
 * ```
 */
export type BrowserProviderProfileTestError =
    | "provider_profile_not_found"
    | "model_catalog_authentication"
    | "model_catalog_permission"
    | "model_catalog_protocol"
    | "model_catalog_unavailable";

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
    | { readonly ok: true; readonly modelCount: number }
    | { readonly ok: false; readonly error: BrowserProviderProfileTestError };

/**
 * 未保存表单的在线模型查询；省略密钥时仅允许复用指定档案的同类供应商凭据。
 * @remarks 不保存输入，不改变激活来源，不要求先选择默认模型。
 * @example
 * ```ts
 * const query: BrowserProviderModelQuery = { kind: "google", apiKey: "secret" };
 * ```
 */
export interface BrowserProviderModelQuery {
    /** 表单选择的供应商。 */
    readonly kind: string;
    /** 新输入的密钥；不出现在响应中。 */
    readonly apiKey?: string;
    /** 表单当前端点；省略表示使用供应商默认端点。 */
    readonly baseURL?: string;
    /** 编辑中的已保存档案；仅用于密钥留空时读取凭据。 */
    readonly profileId?: string;
}

/**
 * 在线查询的非敏感模型列表，不代表模型生成能力已经验证。
 * @example
 * ```ts
 * const result: BrowserProviderModels = { ok: true, models: [{ id: "model-1", name: "Model 1" }] };
 * ```
 */
export interface BrowserProviderModels {
    readonly ok: true;
    /** 仅本次端点实际返回的模型，不补静态回退目录。 */
    readonly models: readonly { readonly id: string; readonly name: string }[];
}
