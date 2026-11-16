import {
    LLMConfigurationError,
    type LLMConfig,
} from "../../llm-core/src/index";
import {
    isAcceptableBaseUrl,
    isPositiveSafeInteger,
    supportsBaseUrl,
} from "./provider-rules";

/**
 * 仅从显式环境对象读取供应商配置，不修改环境或解析其它凭据源。
 * @param env - CLI、benchmark 或调用方选定的环境。
 * @returns 共享的 LLMConfig；模型目录检查由模型工厂完成。
 * @throws LLMConfigurationError 必填值、端点或容量非法。
 * @example
 * ```ts
 * const config = readLLMConfig(process.env);
 * ```
 */
export function readLLMConfig(env: Readonly<Record<string, string | undefined>>): LLMConfig {
    const value = (name: string) => env[name]?.trim() ?? "";
    const required = ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY"];
    if (value("LLM_PROVIDER") === "openai-compatible") {
        required.push("LLM_BASE_URL", "LLM_CONTEXT_WINDOW_TOKENS", "LLM_MAX_OUTPUT_TOKENS");
    }
    const missing = required.filter(name => !value(name));
    if (missing.length) throw new LLMConfigurationError(missing);
    const provider = value("LLM_PROVIDER");
    const baseURL = value("LLM_BASE_URL");
    if (baseURL) {
        if (!supportsBaseUrl(provider)) {
            throw new LLMConfigurationError([], `LLM_BASE_URL is not supported for provider "${provider}"`);
        }
        if (!isAcceptableBaseUrl(baseURL)) {
            throw new LLMConfigurationError([], "LLM_BASE_URL must be an HTTP(S) URL without credentials, query or fragment");
        }
    }
    const positive = (name: string): number => {
        const raw = value(name);
        const n = Number(raw);
        if (!/^\d+$/.test(raw) || !isPositiveSafeInteger(n)) {
            throw new LLMConfigurationError([], `${name} must be a positive safe integer`);
        }
        return n;
    };
    const maxOutputTokens = value("LLM_MAX_OUTPUT_TOKENS") ? positive("LLM_MAX_OUTPUT_TOKENS") : undefined;
    const contextWindowTokens = provider === "openai-compatible"
        ? positive("LLM_CONTEXT_WINDOW_TOKENS")
        : undefined;
    if (contextWindowTokens !== undefined && maxOutputTokens !== undefined && maxOutputTokens >= contextWindowTokens) {
        throw new LLMConfigurationError([], "LLM_MAX_OUTPUT_TOKENS must be less than LLM_CONTEXT_WINDOW_TOKENS");
    }
    return {
        provider,
        apiKey: value("LLM_API_KEY"),
        model: value("LLM_MODEL"),
        ...(baseURL ? { baseURL } : {}),
        ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    };
}
