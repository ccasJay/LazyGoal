import {
    ExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../../execution-control/src/index";
import { TransientToolExecutionFailure } from "../../../tool-core/src/index";
import type { WebSearchBackend, WebSearchResult } from "../web-search";

/** DuckDuckGo HTML 搜索端点。 */
const DUCKDUCKGO_SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";

/** DuckDuckGo 结果文本中需要解码的常见命名实体。 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
});

/** 默认后端单次请求允许返回的最大结果数。 */
const DUCKDUCKGO_MAX_RESULTS = 20;

/**
 * 成功响应既没有可解析结果也没有明确零结果标记时抛出的错误。
 *
 * @remarks
 * 该错误只供 `WebSearchTool` 映射为 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`，
 * 不携带响应正文或解析细节。
 *
 * @example
 * ```ts
 * throw new WebSearchUnrecognizedResponseError();
 * ```
 */
export class WebSearchUnrecognizedResponseError extends Error {
    constructor() {
        super("DuckDuckGo search response could not be recognized.");
        this.name = "WebSearchUnrecognizedResponseError";
    }
}

/**
 * 可注入确定性传输的 DuckDuckGo 后端选项。
 *
 * @remarks
 * 仅用于隔离测试；生产默认构造不传入任何选项。
 */
export interface DuckDuckGoSearchBackendOptions {
    /** 替换网络传输的 fetch 实现。 */
    readonly fetch?: typeof fetch;
    /** 替换搜索端点。 */
    readonly endpoint?: string;
}

function decodeNumericEntity(entity: string): string | undefined {
    const codePoint = entity.startsWith("#x") || entity.startsWith("#X")
        ? Number.parseInt(entity.slice(2), 16)
        : entity.startsWith("#")
            ? Number.parseInt(entity.slice(1), 10)
            : Number.NaN;
    if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return undefined;
    try {
        return String.fromCodePoint(codePoint);
    } catch {
        return undefined;
    }
}

function decodeEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
        if (entity.startsWith("#")) return decodeNumericEntity(entity) ?? match;
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

function htmlFragmentToText(fragment: string): string {
    return decodeEntities(fragment.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeHref(rawHref: string): string | undefined {
    const href = decodeEntities(rawHref).trim();
    if (href.length === 0) return undefined;
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    let parsed: URL;
    try {
        parsed = new URL(absolute);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    const redirected = parsed.hostname === "duckduckgo.com" || parsed.hostname.endsWith(".duckduckgo.com")
        ? parsed.searchParams.get("uddg")
        : null;
    if (redirected !== null) {
        try {
            const target = new URL(redirected);
            return target.protocol === "http:" || target.protocol === "https:" ? target.toString() : undefined;
        } catch {
            return undefined;
        }
    }
    return parsed.toString();
}

function hasExplicitZeroResults(html: string): boolean {
    return /class="[^"]*\b(?:no-results|result--no-result)\b[^"]*"/i.test(html);
}

/**
 * 从 DuckDuckGo HTML 结果页解析结构化搜索结果。
 *
 * @remarks
 * 返回空数组只表示页面包含明确的零结果标记；结构无法识别时抛出
 * `WebSearchUnrecognizedResponseError`，避免把页面改版伪装成零结果。
 *
 * @param html - DuckDuckGo HTML 结果页正文。
 * @param maxResults - 最多返回的结果数。
 * @returns 按页面顺序排列的 title、url 与 snippet。
 * @throws `WebSearchUnrecognizedResponseError` - 成功页面既无结果也无零结果标记时抛出。
 *
 * @example
 * ```ts
 * const results = parseDuckDuckGoSearchHtml(fixtureHtml, 10);
 * ```
 */
export function parseDuckDuckGoSearchHtml(html: string, maxResults: number): readonly WebSearchResult[] {
    const limit = Math.min(Math.max(0, Math.trunc(maxResults)), DUCKDUCKGO_MAX_RESULTS);
    if (limit === 0) return [];

    const results: WebSearchResult[] = [];
    const linkRegex = /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a\b[^>]*class="[^"]*\bresult__a\b|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
        const url = normalizeHref(match[1] ?? "");
        const title = htmlFragmentToText(match[2] ?? "");
        if (url === undefined || title.length === 0) continue;
        const snippetMatch = /<a\b[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(match[3] ?? "");
        const snippet = snippetMatch === null ? "" : htmlFragmentToText(snippetMatch[1] ?? "");
        results.push({ title, url, snippet });
    }

    if (results.length === 0 && hasExplicitZeroResults(html)) return [];
    if (results.length === 0) throw new WebSearchUnrecognizedResponseError();
    return results;
}

function parseRetryAfterMs(header: string | null): number | undefined {
    if (header === null) return undefined;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0
        ? Math.min(30_000, seconds * 1_000)
        : undefined;
}

/**
 * 创建默认 DuckDuckGo HTML 搜索后端。
 *
 * @param options - 可选的确定性传输注入，仅用于隔离测试。
 * @returns 符合 `WebSearchBackend` 契约的搜索后端。
 *
 * @example
 * ```ts
 * const backend = createDuckDuckGoSearchBackend();
 * const results = await backend("LazyGoal", 5);
 * ```
 */
export function createDuckDuckGoSearchBackend(
    options: DuckDuckGoSearchBackendOptions = {},
): WebSearchBackend {
    const fetchImpl = options.fetch ?? fetch;
    const endpoint = new URL(options.endpoint ?? DUCKDUCKGO_SEARCH_ENDPOINT);

    return async (query, maxResults, control?: ExecutionControl) => {
        throwIfAborted(control);
        endpoint.searchParams.set("q", query);
        const requestInit: RequestInit = {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
            ...(control?.signal !== undefined ? { signal: control.signal } : {}),
        };
        let response: Response;
        try {
            response = await fetchImpl(endpoint.toString(), requestInit);
        } catch (error) {
            if (control?.signal?.aborted) throw new ExecutionAbortedError();
            if (error instanceof TypeError) {
                throw new TransientToolExecutionFailure("network_request_failed");
            }
            throw error;
        }
        if (!response.ok) {
            if (response.status === 429 || response.status >= 500) {
                const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
                throw new TransientToolExecutionFailure(`http_${response.status}`, retryAfterMs);
            }
            throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
        }
        const html = await response.text();
        throwIfAborted(control);
        return parseDuckDuckGoSearchHtml(html, maxResults);
    };
}
