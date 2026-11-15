/**
 * 供应商 HTTP 响应失败的结构化异常。
 *
 * @remarks
 * 线格式层在收到非 2xx 响应时构造本错误，只保留可分类字段：状态码、供应商错误代码与重试提示。
 * 不携带响应正文、请求头或凭据。`classifyTransientModelFailure` 与
 * `classifyContextWindowRejection` 依赖这些字段完成通用传输分类。
 *
 * @example
 * ```ts
 * throw new ModelHttpRequestError("Provider rejected the request", { status: 429, code: "rate_limit_exceeded" });
 * ```
 */
export class ModelHttpRequestError extends Error {
    /** 稳定的错误标识。 */
    readonly code: string;
    /** HTTP 状态码。 */
    readonly status: number;
    /** 供应商建议的重试等待毫秒数；无提示时省略。 */
    readonly retryAfterMs?: number;

    /**
     * @param message - 不含响应正文与凭据的诊断信息。
     * @param options - HTTP 状态码、可选的供应商错误代码与重试等待。
     */
    constructor(
        message: string,
        options: { readonly status: number; readonly code?: string; readonly retryAfterMs?: number },
    ) {
        super(message);
        this.name = "ModelHttpRequestError";
        this.code = options.code ?? `HTTP_${options.status}`;
        this.status = options.status;
        if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
    }
}

/**
 * 解析供应商的 `Retry-After` 响应头。
 *
 * @param header - 原始头值；支持秒数与 HTTP 日期。
 * @returns 非负等待毫秒数；无法解析时返回 `undefined`。
 *
 * @example
 * ```ts
 * const delay = parseRetryAfterMs("2");
 * ```
 */
export function parseRetryAfterMs(header: string | null | undefined): number | undefined {
    if (header === null || header === undefined) return undefined;
    const seconds = Number.parseFloat(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
