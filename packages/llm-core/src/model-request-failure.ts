import { ContextWindowRejectedError, TransientModelRequestFailure } from "../../execution-control/src/index";

const CONNECTION_CODES = new Set([
    "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH",
    "EHOSTUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
]);

/**
 * 将 Provider SDK 暴露的错误映射为 Runner 唯一认可的暂时故障类型。
 *
 * @remarks
 * 只读取结构化 HTTP 状态、错误代码和底层传输代码；鉴权、请求、协议及未知异常
 * 原样返回，避免基于任意错误文案误触发重放。分类结果的身份与匹配行为沿用
 * `@lazygoal/execution-control` 的既有类型，不做二次包装。
 *
 * @param error - 供应商 SDK 或传输层抛出的原始异常。
 * @returns 可识别的暂时故障；无法结构化识别时返回 `undefined`。
 *
 * @example
 * ```ts
 * const failure = classifyTransientModelFailure(providerError);
 * if (failure !== undefined) throw failure;
 * ```
 */
export function classifyTransientModelFailure(error: unknown): TransientModelRequestFailure | undefined {
    const value = asRecord(error);
    if (value === undefined) return undefined;

    const status = readStatus(value.status)
        ?? readStatus(asRecord(value.response)?.status)
        ?? readStatus(asRecord(value.lastResponse)?.status);
    const providerCode = readString(value.code)
        ?? readString(asRecord(value.error)?.code)
        ?? readString(asRecord(value.error)?.type);
    const normalizedCode = providerCode?.toLowerCase();
    const message = (readString(value.message) ?? readString(value.errorMessage) ?? "").toLowerCase();

    if (normalizedCode === "insufficient_quota" || normalizedCode === "billing_hard_limit_reached"
        || message.includes("insufficient_quota") || message.includes("billing hard limit")) {
        return undefined;
    }

    const embeddedStatus = status ?? readEmbeddedStatus(message);
    if (embeddedStatus === 429) {
        const retryAfter = retryAfterMs(value);
        return new TransientModelRequestFailure("rate_limited", {
            status: embeddedStatus,
            ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
        });
    }
    if (embeddedStatus !== undefined && embeddedStatus >= 500 && embeddedStatus <= 599) {
        return new TransientModelRequestFailure("service_unavailable", { status: embeddedStatus });
    }
    if (embeddedStatus === 408) {
        return new TransientModelRequestFailure("timeout", { status: embeddedStatus });
    }

    for (let current: unknown = error, depth = 0; depth < 4; depth += 1) {
        const item = asRecord(current);
        if (item === undefined) break;
        const code = readString(item.code);
        if (code !== undefined && CONNECTION_CODES.has(code)) {
            return new TransientModelRequestFailure(code.includes("TIMEOUT") || code === "ETIMEDOUT" ? "timeout" : "connection");
        }
        if (item.name === "TimeoutError") return new TransientModelRequestFailure("timeout");
        current = item.cause;
    }

    if (message.includes("model provider request failed") || message.includes("socket hang up")
        || message.includes("fetch failed") || message.includes("econnreset") || message.includes("etimedout")) {
        return new TransientModelRequestFailure("connection");
    }
    return undefined;
}

function readEmbeddedStatus(message: string): number | undefined {
    if (message.includes("insufficient_quota") || message.includes("billing hard limit")) return undefined;
    const match = message.match(/(?:^|\b)(?:http\s*)?(408|429|5\d\d)(?:\b|$)/i);
    return match === null ? undefined : Number(match[1]);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function readStatus(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function retryAfterMs(value: Record<string, unknown>): number | undefined {
    const normalized = value.retryAfterMs;
    if (typeof normalized === "number" && Number.isFinite(normalized)) return Math.max(0, normalized);
    const rawHeaders = value.headers ?? asRecord(value.response)?.headers;
    if (typeof rawHeaders === "object" && rawHeaders !== null && "get" in rawHeaders
        && typeof (rawHeaders as { get?: unknown }).get === "function") {
        return parseRetryAfter((rawHeaders as { get(name: string): string | null }).get("retry-after") ?? undefined);
    }
    const headers = asRecord(rawHeaders);
    if (headers === undefined) return undefined;
    const raw = headers["retry-after"] ?? headers["Retry-After"];
    const header = typeof raw === "string" ? raw : undefined;
    return parseRetryAfter(header);
}

function parseRetryAfter(header: string | undefined): number | undefined {
    if (header === undefined) return undefined;
    const seconds = Number.parseFloat(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** 供应商用于表达“请求超出模型上下文窗口”的稳定错误代码。 */
const CONTEXT_WINDOW_CODES = new Set([
    "context_length_exceeded",
    "context_window_exceeded",
    "contextlength_exceeded",
    "prompt_too_long",
    "prompt_is_too_long",
    "string_above_max_length",
    "request_too_large",
    "tokens_exceeded",
    "too_many_tokens",
]);

/** 供应商窗口拒绝文案；仅在拒绝状态同时成立时才作为判定依据。 */
const CONTEXT_WINDOW_MESSAGE_PATTERNS = [
    /maximum context length/i,
    /prompt is too long/i,
    /input token count[^.]{0,80}exceed/i,
    /too many (?:input )?tokens/i,
    /context (?:length|window)[^.]{0,80}(?:exceed|too (?:long|large)|maximum)/i,
    /(?:exceed|over)[^.]{0,60}context (?:length|window)/i,
    /reduce (?:the )?(?:length|size) of (?:your )?(?:prompt|messages?)/i,
];

/**
 * 识别供应商明确以超出上下文窗口拒绝的请求失败。
 *
 * @remarks
 * 只接受两种结构化信号：已知窗口拒绝错误代码，或拒绝状态（400/413/422）与窗口拒绝文案同时出现。
 * 其它 4xx、鉴权、限流与传输故障不会被归入本类型，避免误触发压缩与重试。
 *
 * @param error - 供应商 SDK 或传输层抛出的原始异常。
 * @returns 可交给 Runtime 处理的窗口拒绝故障；无法结构化识别时返回 `undefined`。
 *
 * @example
 * ```ts
 * const rejection = classifyContextWindowRejection(providerError);
 * if (rejection !== undefined) throw rejection;
 * ```
 */
export function classifyContextWindowRejection(error: unknown): ContextWindowRejectedError | undefined {
    const value = asRecord(error);
    if (value === undefined) return undefined;

    const status = readStatus(value.status)
        ?? readStatus(asRecord(value.response)?.status)
        ?? readStatus(asRecord(value.lastResponse)?.status);
    const providerCode = (
        readString(value.code)
        ?? readString(asRecord(value.error)?.code)
        ?? readString(asRecord(value.error)?.type)
        ?? ""
    ).toLowerCase();
    const message = readString(value.message)
        ?? readString(value.errorMessage)
        ?? readString(asRecord(value.error)?.message)
        ?? "";

    const codeMatches = CONTEXT_WINDOW_CODES.has(providerCode)
        || CONTEXT_WINDOW_CODES.has(providerCode.replace(/-/g, "_"));
    const messageMatches = CONTEXT_WINDOW_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
    if (!codeMatches && !messageMatches) return undefined;
    if (status !== undefined && status !== 400 && status !== 413 && status !== 422) return undefined;
    // 文案命中必须伴随拒绝状态；只有供应商错误代码足够明确。
    if (!codeMatches && status === undefined) return undefined;

    return new ContextWindowRejectedError({
        ...(status === undefined ? {} : { status }),
        ...(providerCode.length === 0 ? {} : { providerCode }),
    });
}
