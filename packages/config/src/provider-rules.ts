import type { LLMProvider } from "../../llm-core/src/index";

/**
 * 受支持的供应商标识集合。
 *
 * @remarks
 * 环境变量、TOML 与受管 Provider 档案共用同一集合，避免出现第二份供应商白名单。
 */
export const SUPPORTED_LLM_PROVIDERS: readonly LLMProvider[] = [
    "openai",
    "google",
    "anthropic",
    "openrouter",
    "deepseek",
    "openai-compatible",
    "opencode-go",
];

/**
 * 判定字符串是否为受支持的供应商标识。
 *
 * @param value - 待判定的供应商标识。
 * @returns 是受支持供应商时为 `true`，并据此收窄类型。
 * @example
 * ```ts
 * if (isSupportedLlmProvider(configured)) { /* configured 收窄为 LLMProvider *\/ }
 * ```
 */
export function isSupportedLlmProvider(value: string): value is LLMProvider {
    return (SUPPORTED_LLM_PROVIDERS as readonly string[]).includes(value);
}

/**
 * 判定供应商是否支持原生 strict 结构化输出。
 *
 * @param provider - 已校验的供应商标识。
 * @returns 仅 `openai`、`google` 与 `openai-compatible` 返回 `true`。
 * @example
 * ```ts
 * const allowed = supportsStrictOutput("google");
 * ```
 */
export function supportsStrictOutput(provider: LLMProvider): boolean {
    return provider === "openai" || provider === "google" || provider === "openai-compatible";
}

/**
 * 判定供应商是否允许覆盖端点。
 *
 * @param provider - 已校验的供应商标识。
 * @returns 仅 `openai`、`google` 与 `openai-compatible` 返回 `true`。
 * @example
 * ```ts
 * const overridable = supportsBaseUrl("openai");
 * ```
 */
export function supportsBaseUrl(provider: LLMProvider): boolean {
    return provider === "openai" || provider === "google" || provider === "openai-compatible";
}

/**
 * 判定端点是否为可接受的 HTTP(S) URL。
 *
 * @remarks
 * 拒绝非 HTTP(S) 协议、内嵌凭据、查询参数与片段；空字符串视为不可接受。
 *
 * @param baseURL - 待校验的端点。
 * @returns 形状合法时为 `true`。
 * @example
 * ```ts
 * const ok = isAcceptableBaseUrl("https://gateway.example/v1");
 * ```
 */
export function isAcceptableBaseUrl(baseURL: string): boolean {
    let url: URL;
    try {
        url = new URL(baseURL);
    } catch {
        return false;
    }
    return (url.protocol === "https:" || url.protocol === "http:")
        && !url.username
        && !url.password
        && !url.search
        && !url.hash;
}

/**
 * 判定数值是否为正的安全整数。
 *
 * @param value - 待判定的数值。
 * @returns 有限、安全且大于零时为 `true`。
 * @example
 * ```ts
 * const isValid = isPositiveSafeInteger(4096);
 * ```
 */
export function isPositiveSafeInteger(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
}
