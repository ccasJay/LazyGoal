import { TransientModelRequestFailure } from "../../../execution-control/src/index";

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
 * 原样返回，避免基于任意错误文案误触发重放。
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
