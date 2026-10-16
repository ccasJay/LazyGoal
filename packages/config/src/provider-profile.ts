import type { LLMConfig, LLMProvider, StructuredOutputMode } from "./llm-config";
import {
    isAcceptableBaseUrl,
    isPositiveSafeInteger,
    isSupportedLlmProvider,
    supportsBaseUrl,
    supportsStrictOutput,
    SUPPORTED_LLM_PROVIDERS,
} from "./provider-rules";

/**
 * Provider 档案校验错误。
 *
 * @remarks
 * `fields` 列出违规字段（使用配置风格的下划线命名），供调用方构造字段级错误提示；
 * 抛出发生在任何落盘之前。
 */
export class ProviderProfileValidationError extends Error {
    readonly code = "INVALID_PROVIDER_PROFILE";

    constructor(readonly fields: readonly string[], message: string) {
        super(message);
        this.name = "ProviderProfileValidationError";
    }
}

/**
 * 运行时无法解析目标 Provider 档案。
 *
 * @remarks
 * 选择引用的档案已被删除或不属于当前档案集合时抛出；调用方必须据此阻断推进并要求重新选择，
 * 不得回退到其它档案、其它供应商或进程启动配置。
 */
export class ProviderProfileResolutionError extends Error {
    readonly code = "PROVIDER_PROFILE_UNRESOLVED";

    constructor(readonly profileId: string) {
        super(`无法解析 Provider 档案 "${profileId}"；请重新选择 Provider`);
        this.name = "ProviderProfileResolutionError";
    }
}

/**
 * 新建 Provider 档案的未校验输入。
 *
 * @remarks
 * `kind` 与 `structuredOutputMode` 保持字符串形态，由校验函数按当前供应商规则收窄；
 * `label` 与 `id` 属非敏感标识，不得携带明文凭据。
 *
 * @example
 * ```ts
 * const draft: ProviderProfileDraft = {
 *     label: "OpenAI 主账号", kind: "openai", apiKey: "sk-...", defaultModel: "gpt-4o",
 * };
 * ```
 */
export interface ProviderProfileDraft {
    /** 面向用户的展示名，非敏感。 */
    readonly label: string;
    /** 供应商标识（未校验）。 */
    readonly kind: string;
    /** API 访问凭据明文；只允许存在于本机 0600 文件与进程内配置。 */
    readonly apiKey: string;
    /** 供模型选择器使用的默认模型。 */
    readonly defaultModel: string;
    /** 端点覆盖；仅 `openai`、`google` 与 `openai-compatible` 允许。 */
    readonly baseURL?: string | undefined;
    /** 自定义模型的上下文窗口上限。 */
    readonly contextWindowTokens?: number | undefined;
    /** 输出 Token 上限，必须小于上下文窗口上限。 */
    readonly maxOutputTokens?: number | undefined;
    /** 结构化输出模式（未校验）；省略时由解析方按既有默认派生。 */
    readonly structuredOutputMode?: string | undefined;
}

/**
 * 已校验的 Provider 档案。
 *
 * @remarks
 * 由 `validateProviderProfileDraft` 产出或由 Store 读取时校验；除 `apiKey` 外均可安全投影到 HTTP 响应。
 *
 * @example
 * ```ts
 * const profile: ProviderProfile = {
 *     id: "6f1c...", label: "OpenAI 主账号", kind: "openai",
 *     apiKey: "sk-...", defaultModel: "gpt-4o",
 * };
 * ```
 */
export interface ProviderProfile {
    /** 稳定唯一且不可变的档案标识，非敏感。 */
    readonly id: string;
    /** 面向用户的展示名，非敏感。 */
    readonly label: string;
    /** 已校验的供应商标识。 */
    readonly kind: LLMProvider;
    /** API 访问凭据明文。 */
    readonly apiKey: string;
    /** 默认模型。 */
    readonly defaultModel: string;
    /** 端点覆盖；仅部分供应商允许。 */
    readonly baseURL?: string;
    /** 自定义模型的上下文窗口上限。 */
    readonly contextWindowTokens?: number;
    /** 输出 Token 上限。 */
    readonly maxOutputTokens?: number;
    /** 结构化输出模式；省略时由解析方派生。 */
    readonly structuredOutputMode?: StructuredOutputMode;
}

/** 通过校验的档案字段（不含 Store 分配的 `id`）。 */
export type ValidatedProviderProfile = Omit<ProviderProfile, "id">;

/**
 * 按当前供应商规则校验 Provider 档案输入。
 *
 * @remarks
 * 复用环境变量与 TOML 路径相同的供应商规则：`strict` 仅允许原生 strict 供应商，
 * `baseURL` 仅允许 `openai`/`google`/`openai-compatible`（后者必填且容量必填），
 * `maxOutputTokens` 必须小于 `contextWindowTokens`。校验失败只报告错误，不产生任何副作用。
 *
 * @param draft - 未校验的档案输入。
 * @returns 归一化（trim）后的已校验字段。
 * @throws ProviderProfileValidationError 任一字段违规时抛出，`fields` 列出全部违规字段。
 * @example
 * ```ts
 * const validated = validateProviderProfileDraft({ label: "OpenAI", kind: "openai", apiKey: "sk-...", defaultModel: "gpt-4o" });
 * ```
 */
export function validateProviderProfileDraft(draft: ProviderProfileDraft): ValidatedProviderProfile {
    const fields: string[] = [];
    const problems: string[] = [];

    const label = draft.label.trim();
    const apiKey = draft.apiKey.trim();
    const defaultModel = draft.defaultModel.trim();
    if (!label) {
        fields.push("label");
        problems.push("label 不能为空");
    }
    if (!apiKey) {
        fields.push("api_key");
        problems.push("api_key 不能为空");
    }
    if (!defaultModel) {
        fields.push("default_model");
        problems.push("default_model 不能为空");
    }
    if (label && apiKey && label.includes(apiKey)) {
        fields.push("label");
        problems.push("label 不得包含明文凭据");
    }

    let kind: LLMProvider | undefined;
    const kindValue = draft.kind.trim();
    if (!isSupportedLlmProvider(kindValue)) {
        fields.push("kind");
        problems.push(`不支持的 provider kind "${draft.kind}"；可选：${SUPPORTED_LLM_PROVIDERS.join(", ")}`);
    } else {
        kind = kindValue;
    }

    let structuredOutputMode: StructuredOutputMode | undefined;
    const rawMode = draft.structuredOutputMode?.trim();
    if (rawMode !== undefined && rawMode.length > 0) {
        if (rawMode !== "strict" && rawMode !== "prompt_only" && rawMode !== "two_stage") {
            fields.push("structured_output_mode");
            problems.push(`无效的 structured_output_mode "${rawMode}"`);
        } else if (kind !== undefined && rawMode === "strict" && !supportsStrictOutput(kind)) {
            fields.push("structured_output_mode");
            problems.push(`供应商 "${kind}" 不支持 strict 输出`);
        } else {
            structuredOutputMode = rawMode;
        }
    }

    let baseURL: string | undefined;
    const rawBaseUrl = draft.baseURL?.trim();
    if (rawBaseUrl !== undefined && rawBaseUrl.length > 0) {
        if (kind !== undefined && !supportsBaseUrl(kind)) {
            fields.push("base_url");
            problems.push(`供应商 "${kind}" 不支持 base_url`);
        } else if (!isAcceptableBaseUrl(rawBaseUrl)) {
            fields.push("base_url");
            problems.push("base_url 必须是不含凭据、查询与片段的 HTTP(S) URL");
        } else {
            baseURL = rawBaseUrl;
        }
    }

    const readCapacity = (field: string, value: number | undefined): number | undefined => {
        if (value === undefined) return undefined;
        if (!isPositiveSafeInteger(value)) {
            fields.push(field);
            problems.push(`${field} 必须是正的安全整数`);
            return undefined;
        }
        return value;
    };
    const contextWindowTokens = readCapacity("context_window_tokens", draft.contextWindowTokens);
    const maxOutputTokens = readCapacity("max_output_tokens", draft.maxOutputTokens);

    if (kind === "openai-compatible") {
        if (contextWindowTokens === undefined) {
            fields.push("context_window_tokens");
            problems.push("openai-compatible 必须声明 context_window_tokens");
        }
        if (maxOutputTokens === undefined) {
            fields.push("max_output_tokens");
            problems.push("openai-compatible 必须声明 max_output_tokens");
        }
    }
    if (contextWindowTokens !== undefined && maxOutputTokens !== undefined && maxOutputTokens >= contextWindowTokens) {
        fields.push("max_output_tokens");
        problems.push("max_output_tokens 必须小于 context_window_tokens");
    }

    if (fields.length > 0) {
        throw new ProviderProfileValidationError(fields, `Provider 档案校验失败：${problems.join("；")}`);
    }

    return {
        label,
        kind: kind as LLMProvider,
        apiKey,
        defaultModel,
        ...(baseURL === undefined ? {} : { baseURL }),
        ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
        ...(structuredOutputMode === undefined ? {} : { structuredOutputMode }),
    };
}

/**
 * 把已校验的 Provider 档案解析为 `LLMConfig`。
 *
 * @remarks
 * 输出模式优先取调用方覆盖值，其次取档案声明，最后回退 `prompt_only`；其余字段按档案的供应商分支投影，
 * 端点与容量只在对应供应商允许或必需时出现。档案已通过校验，缺失必需字段时抛出解析错误而非静默补齐。
 *
 * @param profile - 已校验的 Provider 档案。
 * @param options - 本次解析使用的模型与可选输出模式覆盖。
 * @returns 可直接交给 `createLlmAdapter`/`createLlmStageAdapters` 的连接配置。
 * @throws ProviderProfileValidationError 供应商分支缺少必需端点或容量时抛出。
 * @example
 * ```ts
 * const config = toLlmConfig(profile, { model: "gpt-4o" });
 * ```
 */
export function toLlmConfig(
    profile: ProviderProfile,
    options: { readonly model: string; readonly structuredOutputMode?: StructuredOutputMode | undefined },
): LLMConfig {
    const common = {
        apiKey: profile.apiKey,
        model: options.model,
        structuredOutputMode: options.structuredOutputMode ?? profile.structuredOutputMode ?? "prompt_only",
        ...(profile.maxOutputTokens === undefined ? {} : { maxOutputTokens: profile.maxOutputTokens }),
    };
    if (profile.kind === "openai" || profile.kind === "google") {
        return {
            ...common,
            provider: profile.kind,
            ...(profile.baseURL === undefined ? {} : { baseURL: profile.baseURL }),
        };
    }
    if (profile.kind === "openai-compatible") {
        if (profile.baseURL === undefined || profile.contextWindowTokens === undefined || profile.maxOutputTokens === undefined) {
            throw new ProviderProfileValidationError(
                ["base_url", "context_window_tokens", "max_output_tokens"],
                `Provider 档案 "${profile.id}" 缺少 openai-compatible 必需的端点或容量`,
            );
        }
        return {
            ...common,
            provider: "openai-compatible",
            baseURL: profile.baseURL,
            contextWindowTokens: profile.contextWindowTokens,
            maxOutputTokens: profile.maxOutputTokens,
        };
    }
    return { ...common, provider: profile.kind };
}

/**
 * 生成可安全展示的凭据掩码。
 *
 * @param apiKey - 明文凭据。
 * @returns 空凭据返回空串；长度不超过 8 时返回纯占位符，否则附上末四位。
 * @example
 * ```ts
 * const masked = maskProviderApiKey("sk-canary-openai-abc123"); // "****c123"
 * ```
 */
export function maskProviderApiKey(apiKey: string): string {
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) return "";
    if (trimmed.length <= 8) return "****";
    return `****${trimmed.slice(-4)}`;
}
