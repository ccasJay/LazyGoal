import type { StructuredOutputMode } from "./core/types";

/** 本期开放的供应商；兼容端点使用独立标识，不推断协议。 */
export type LlmProvider = "openai" | "google" | "anthropic" | "openrouter" | "deepseek" | "openai-compatible";

type CommonConfig = {
    readonly apiKey: string;
    readonly model: string;
    readonly structuredOutputMode: StructuredOutputMode;
    readonly maxOutputTokens?: number;
};

/**
 * 已校验的供应商连接配置；凭据由调用方提供，不查询其它凭据源。
 *
 * @remarks
 * 自定义模型必须声明容量；目录模型只允许覆盖输出上限。
 * 配置不写入 Goal 或 Diagnostic Trace。
 * @example
 * ```ts
 * const config: LlmConfig = {
 *     provider: "anthropic", model: "claude-sonnet-4-5",
 *     apiKey: "secret", structuredOutputMode: "prompt_only",
 * };
 * ```
 */
export type LlmConfig = CommonConfig & (
    | { readonly provider: "openai"; readonly baseURL?: string }
    | { readonly provider: "google" | "anthropic" | "openrouter" | "deepseek" }
    | { readonly provider: "openai-compatible"; readonly baseURL: string; readonly contextWindowTokens: number; readonly maxOutputTokens: number }
);

/** 模型配置错误，在创建 Goal、Store 或发起请求前报告。 */
export class LlmConfigurationError extends Error {
    readonly code = "INVALID_LLM_CONFIG";
    constructor(readonly missing: readonly string[], message?: string) {
        super(message ?? `Missing required environment variable(s): ${missing.join(", ")}`);
        this.name = "LlmConfigurationError";
    }
}

/**
 * 仅从显式环境对象读取供应商配置，不修改环境或解析其它凭据源。
 * @param env - CLI、benchmark 或调用方选定的环境。
 * @returns 可交给 createLlmAdapter 的配置；模型目录检查由工厂完成。
 * @throws LlmConfigurationError 必填值、模式、端点或容量非法。
 * @example
 * ```ts
 * const config = readLlmConfig(process.env);
 * ```
 */
export function readLlmConfig(env: Readonly<Record<string, string | undefined>>): LlmConfig {
    const value = (name: string) => env[name]?.trim() ?? "";
    const required = ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY", "LLM_STRUCTURED_OUTPUT_MODE"];
    if (value("LLM_PROVIDER") === "openai-compatible") {
        required.push("LLM_BASE_URL", "LLM_CONTEXT_WINDOW_TOKENS", "LLM_MAX_OUTPUT_TOKENS");
    }
    const missing = required.filter(name => !value(name));
    if (missing.length) throw new LlmConfigurationError(missing);
    const provider = value("LLM_PROVIDER");
    if (!["openai", "google", "anthropic", "openrouter", "deepseek", "openai-compatible"].includes(provider)) {
        throw new LlmConfigurationError([], `Unsupported LLM_PROVIDER "${provider}"`);
    }
    const mode = value("LLM_STRUCTURED_OUTPUT_MODE");
    if (mode !== "strict" && mode !== "prompt_only") {
        throw new LlmConfigurationError([], `Invalid LLM_STRUCTURED_OUTPUT_MODE "${mode}": must be either "strict" or "prompt_only"`);
    }
    if (mode === "strict" && !["openai", "google", "openai-compatible"].includes(provider)) {
        throw new LlmConfigurationError([], `Provider "${provider}" does not support strict output; select prompt_only`);
    }
    const baseURL = value("LLM_BASE_URL");
    if (baseURL) {
        if (provider !== "openai" && provider !== "openai-compatible") {
            throw new LlmConfigurationError([], `LLM_BASE_URL is not supported for provider "${provider}"`);
        }
        let url: URL;
        try { url = new URL(baseURL); } catch {
            throw new LlmConfigurationError([], "LLM_BASE_URL must be an HTTP(S) URL");
        }
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new LlmConfigurationError([], "LLM_BASE_URL must be an HTTP(S) URL without credentials, query or fragment");
        }
    }
    const positive = (name: string): number => {
        const raw = value(name);
        const n = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n <= 0) {
            throw new LlmConfigurationError([], `${name} must be a positive safe integer`);
        }
        return n;
    };
    const maxOutputTokens = value("LLM_MAX_OUTPUT_TOKENS") ? positive("LLM_MAX_OUTPUT_TOKENS") : undefined;
    const common: CommonConfig = {
        apiKey: value("LLM_API_KEY"), model: value("LLM_MODEL"), structuredOutputMode: mode,
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    };
    if (provider === "openai-compatible") {
        const contextWindowTokens = positive("LLM_CONTEXT_WINDOW_TOKENS");
        if (maxOutputTokens! >= contextWindowTokens) {
            throw new LlmConfigurationError([], "LLM_MAX_OUTPUT_TOKENS must be less than LLM_CONTEXT_WINDOW_TOKENS");
        }
        return { ...common, provider, baseURL, contextWindowTokens, maxOutputTokens: maxOutputTokens! };
    }
    if (provider === "openai") return { ...common, provider, ...(baseURL ? { baseURL } : {}) };
    return { ...common, provider: provider as "google" | "anthropic" | "openrouter" | "deepseek" };
}
