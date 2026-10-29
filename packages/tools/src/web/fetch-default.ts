import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, buildConnector, request, type Dispatcher } from "undici";
import { throwIfAborted, type ExecutionControl } from "../../../execution-control/src/index";
import type { WebFetchHandler } from "../web-fetch";
import {
    WebFetchBlockedUrlError,
    WebFetchHttpError,
    WebFetchNetworkError,
    WebFetchRedirectLimitError,
    WebResponseTooLargeError,
} from "./fetch-errors";
import {
    assertSafeWebFetchUrl,
    validateResolvedAddresses,
    webFetchHostname,
    type WebFetchResolvedAddress,
} from "./fetch-url-policy";
import { WEB_FETCH_MAX_RESPONSE_BYTES } from "./limits";

/** 默认抓取请求的最大重定向跳数。 */
const MAX_REDIRECTS = 5;

/** 默认抓取请求的 User-Agent。 */
const WEB_FETCH_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/**
 * 连接层实际可用的已验证地址。
 *
 * @remarks
 * 该结构只由 URL 策略产生，测试接缝可观察但不能扩大地址集合。
 */
export interface WebFetchTransportAddress extends WebFetchResolvedAddress {}

/**
 * 默认网页抓取 handler 的可注入接缝。
 *
 * @remarks
 * `resolveHostname` 与 `createConnector` 只用于确定性测试和内部传输隔离；
 * 它们不会通过 `WebFetchTool` 构造器、Profile 或配置暴露，不能用于生产环境放行私网地址。
 */
export interface DefaultWebFetchHandlerOptions {
    /** 替换主机名解析的确定性解析函数。 */
    readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
    /** 用已验证地址构造请求专属连接器，用于隔离本地传输 fixture。 */
    readonly createConnector?: (
        addresses: readonly WebFetchTransportAddress[],
    ) => buildConnector.connector;
}

type BoundLookup = (
    hostname: string,
    options: LookupOptions,
    callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) => void;

type FetchHopOutcome =
    | { readonly kind: "redirect"; readonly location: string }
    | { readonly kind: "response"; readonly text: string; readonly isHtml: boolean };

function parseRetryAfterMs(header: string | undefined): number | undefined {
    if (header === undefined) return undefined;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0
        ? Math.min(30_000, seconds * 1_000)
        : undefined;
}

function headerValue(
    headers: Readonly<Record<string, string | string[] | undefined>>,
    name: string,
): string | undefined {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
}

function discardBody(body: Dispatcher.ResponseData["body"]): void {
    body.on("error", () => {});
    if (!body.destroyed) body.destroy();
}

function isTlsVerificationError(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code !== "string") return false;
    return code.startsWith("ERR_TLS_")
        || code.includes("CERT")
        || code.includes("SELF_SIGNED")
        || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
        || code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY";
}

async function defaultResolveHostname(hostname: string): Promise<readonly string[]> {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
}

function normalizedFamily(options: LookupOptions): 4 | 6 | 0 {
    if (options.family === 4 || options.family === "IPv4") return 4;
    if (options.family === 6 || options.family === "IPv6") return 6;
    return 0;
}

/**
 * 构造只返回该跳已验证地址的 DNS lookup。
 *
 * @remarks
 * 连接层重试只会在 `addresses` 内选择地址，不会再次解析或扩大到集合外。
 *
 * @param addresses - 该跳已验证的地址集合。
 * @returns 供 `net`/`tls` 连接使用的受控 lookup。
 *
 * @example
 * ```ts
 * const lookup = createBoundLookup([{ address: "8.8.8.8", family: 4 }]);
 * ```
 */
export function createBoundLookup(addresses: readonly WebFetchTransportAddress[]): BoundLookup {
    return (_hostname, options, callback) => {
        const family = normalizedFamily(options);
        const candidates = family === 0
            ? addresses
            : addresses.filter((candidate) => candidate.family === family);
        if (candidates.length === 0) {
            const error: NodeJS.ErrnoException = new Error("No validated address is available.");
            error.code = "ENOTFOUND";
            callback(error, "", 0);
            return;
        }
        if (options.all === true) {
            callback(null, candidates.map((candidate) => ({
                address: candidate.address,
                family: candidate.family,
            })));
            return;
        }
        const [first] = candidates;
        if (first === undefined) {
            callback(new Error("No validated address is available."), "", 0);
            return;
        }
        callback(null, first.address, first.family);
    };
}

function defaultConnectorFactory(
    addresses: readonly WebFetchTransportAddress[],
): buildConnector.connector {
    return buildConnector({
        lookup: createBoundLookup(addresses),
    });
}

async function readResponseBody(
    body: Dispatcher.ResponseData["body"],
    control: ExecutionControl | undefined,
): Promise<string> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    try {
        for await (const chunk of body) {
            throwIfAborted(control);
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes += buffer.byteLength;
            if (totalBytes > WEB_FETCH_MAX_RESPONSE_BYTES) {
                throw new WebResponseTooLargeError(
                    `Response body exceeded 2 MiB limit (${totalBytes} bytes read)`,
                );
            }
            chunks.push(buffer);
        }
    } catch (error) {
        discardBody(body);
        throw error;
    }
    return Buffer.concat(chunks).toString("utf8");
}

function isHtmlResponse(contentType: string | undefined, text: string): boolean {
    const normalized = contentType?.toLowerCase() ?? "";
    return normalized.includes("text/html")
        || normalized.includes("application/xhtml+xml")
        || /^\s*<(?:!doctype|html)\b/i.test(text);
}

/**
 * 创建带有 URL、DNS、重定向和连接地址绑定的默认网页抓取 handler。
 *
 * @remarks
 * 每一跳先校验 URL 并解析全部 A/AAAA，任一地址受限即拒绝；随后为该跳创建专属
 * `undici` dispatcher，把实际连接限制到已验证地址。重定向逐跳重新校验并重新绑定，
 * 最多 5 跳。连接保留原 URL 的 Host 与 TLS SNI，成功消费正文后关闭 dispatcher，
 * 失败、取消、超时或正文超限时销毁连接。
 *
 * @param options - 可选的确定性主机解析与连接器测试接缝。
 * @returns 符合 `WebFetchHandler` 契约的默认抓取实现。
 *
 * @example
 * ```ts
 * const handler = createDefaultWebFetchHandler();
 * const content = await handler("https://example.com");
 * ```
 */
export function createDefaultWebFetchHandler(
    options: DefaultWebFetchHandlerOptions = {},
): WebFetchHandler {
    const resolveHostname = options.resolveHostname ?? defaultResolveHostname;
    const connectorFactory = options.createConnector ?? defaultConnectorFactory;

    async function resolveHop(url: URL): Promise<readonly WebFetchTransportAddress[]> {
        const hostname = webFetchHostname(url);
        if (isIP(hostname) !== 0) {
            return validateResolvedAddresses([hostname]);
        }
        let addresses: readonly string[];
        try {
            addresses = await resolveHostname(hostname);
        } catch {
            throw new WebFetchNetworkError("dns_resolution_failed");
        }
        return validateResolvedAddresses(addresses);
    }

    async function fetchHop(
        url: URL,
        addresses: readonly WebFetchTransportAddress[],
        control: ExecutionControl | undefined,
    ): Promise<FetchHopOutcome> {
        const dispatcher = new Agent({ connect: connectorFactory(addresses) });
        let consumedResponse = false;
        try {
            const response = await request(url, {
                dispatcher,
                method: "GET",
                headers: {
                    "user-agent": WEB_FETCH_USER_AGENT,
                    accept: "*/*",
                },
                ...(control?.signal !== undefined ? { signal: control.signal } : {}),
            });

            if (response.statusCode >= 300 && response.statusCode < 400) {
                const location = headerValue(response.headers, "location");
                discardBody(response.body);
                if (location === undefined || location.trim().length === 0) {
                    throw new WebFetchHttpError(response.statusCode);
                }
                return { kind: "redirect", location };
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                const retryAfterMs = parseRetryAfterMs(headerValue(response.headers, "retry-after"));
                discardBody(response.body);
                throw new WebFetchHttpError(response.statusCode, retryAfterMs);
            }

            const contentLengthHeader = headerValue(response.headers, "content-length");
            if (contentLengthHeader !== undefined) {
                const contentLength = Number.parseInt(contentLengthHeader, 10);
                if (Number.isFinite(contentLength) && contentLength > WEB_FETCH_MAX_RESPONSE_BYTES) {
                    discardBody(response.body);
                    throw new WebResponseTooLargeError(
                        `Response Content-Length (${contentLength} bytes) exceeds 2 MiB limit`,
                    );
                }
            }

            const text = await readResponseBody(response.body, control);
            consumedResponse = true;
            const contentType = headerValue(response.headers, "content-type");
            return {
                kind: "response",
                text,
                isHtml: isHtmlResponse(contentType, text),
            };
        } catch (error) {
            if (control?.signal?.aborted) throw error;
            if (error instanceof WebResponseTooLargeError
                || error instanceof WebFetchBlockedUrlError
                || error instanceof WebFetchHttpError
                || error instanceof WebFetchRedirectLimitError) {
                throw error;
            }
            throw new WebFetchNetworkError(
                isTlsVerificationError(error) ? "tls_verification_failed" : "network_request_failed",
            );
        } finally {
            try {
                if (consumedResponse) await dispatcher.close();
                else await dispatcher.destroy();
            } catch {
                // 资源释放失败不覆盖已确定的抓取结果或失败分类。
            }
        }
    }

    return async (rawUrl, control) => {
        throwIfAborted(control);
        let currentUrl = assertSafeWebFetchUrl(rawUrl);
        let redirects = 0;

        while (true) {
            const addresses = await resolveHop(currentUrl);
            throwIfAborted(control);
            const outcome = await fetchHop(currentUrl, addresses, control);
            if (outcome.kind === "response") {
                return { text: outcome.text, isHtml: outcome.isHtml };
            }

            if (redirects >= MAX_REDIRECTS) throw new WebFetchRedirectLimitError();
            redirects += 1;
            currentUrl = assertSafeWebFetchUrl(new URL(outcome.location, currentUrl));
        }
    };
}
