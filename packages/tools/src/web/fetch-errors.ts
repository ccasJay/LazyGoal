/**
 * 默认网页抓取被 URL 策略阻止时抛出的错误。
 *
 * @remarks
 * `reason` 只提供稳定的分类码，不包含解析后的地址、凭据或 DNS 细节。
 *
 * @example
 * ```ts
 * throw new WebFetchBlockedUrlError("blocked_address");
 * ```
 */
export class WebFetchBlockedUrlError extends Error {
    /** 稳定的阻止原因分类。 */
    readonly reason:
        | "invalid_url"
        | "unsupported_protocol"
        | "credentials_not_allowed"
        | "local_hostname"
        | "blocked_address"
        | "no_addresses";

    /**
     * @param reason - 稳定的阻止原因分类。
     */
    constructor(reason: WebFetchBlockedUrlError["reason"]) {
        super("Web fetch URL is blocked by policy.");
        this.name = "WebFetchBlockedUrlError";
        this.reason = reason;
    }
}

/**
 * 重定向次数超过允许上限时抛出的错误。
 *
 * @example
 * ```ts
 * throw new WebFetchRedirectLimitError();
 * ```
 */
export class WebFetchRedirectLimitError extends Error {
    constructor() {
        super("Web fetch exceeded the redirect limit.");
        this.name = "WebFetchRedirectLimitError";
    }
}

/**
 * HTTP 响应状态不可接受时抛出的错误。
 *
 * @remarks
 * 429 与 5xx 通过 `retryAfterMs` 保留可安全重试的退避建议，由 Tool 映射为瞬态失败。
 *
 * @example
 * ```ts
 * throw new WebFetchHttpError(404);
 * ```
 */
export class WebFetchHttpError extends Error {
    /** 非 2xx 响应的 HTTP 状态码。 */
    readonly status: number;
    /** 服务端建议的重试等待毫秒数。 */
    readonly retryAfterMs: number | undefined;

    /**
     * @param status - 非 2xx 响应的 HTTP 状态码。
     * @param retryAfterMs - 可选的重试等待毫秒数。
     */
    constructor(status: number, retryAfterMs?: number) {
        super(`Web fetch failed with HTTP status ${status}.`);
        this.name = "WebFetchHttpError";
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

/**
 * 响应内容类型不在允许读取的白名单内时抛出的错误。
 *
 * @example
 * ```ts
 * throw new WebFetchUnsupportedContentTypeError();
 * ```
 */
export class WebFetchUnsupportedContentTypeError extends Error {
    constructor() {
        super("Web fetch response content type is not supported.");
        this.name = "WebFetchUnsupportedContentTypeError";
    }
}

/**
 * 默认网页抓取的 DNS、连接或 TLS 传输失败。
 *
 * @remarks
 * `reason` 是有界的稳定分类码；错误消息不包含底层网络异常文本、地址或证书细节。
 *
 * @example
 * ```ts
 * throw new WebFetchNetworkError("network_request_failed");
 * ```
 */
export class WebFetchNetworkError extends Error {
    /** 稳定的传输失败分类。 */
    readonly reason: "dns_resolution_failed" | "network_request_failed" | "tls_verification_failed";

    /**
     * @param reason - 稳定的传输失败分类。
     */
    constructor(reason: WebFetchNetworkError["reason"]) {
        super("Web fetch network request failed.");
        this.name = "WebFetchNetworkError";
        this.reason = reason;
    }
}

/**
 * 响应声明了无法识别的字符集时抛出的错误。
 *
 * @remarks
 * 该错误由 Tool 映射为安全的 `WEB_FETCH_FAILED`，不会把二进制字节静默当作 UTF-8。
 *
 * @example
 * ```ts
 * throw new WebFetchUnsupportedCharsetError();
 * ```
 */
export class WebFetchUnsupportedCharsetError extends Error {
    constructor() {
        super("Web fetch response declared an unsupported character set.");
        this.name = "WebFetchUnsupportedCharsetError";
    }
}

/**
 * 响应体超过 2 MiB 硬上限的错误。
 *
 * @example
 * ```ts
 * throw new WebResponseTooLargeError();
 * ```
 */
export class WebResponseTooLargeError extends Error {
    constructor(message = "Web response exceeds 2 MiB limit") {
        super(message);
        this.name = "WebResponseTooLargeError";
    }
}
