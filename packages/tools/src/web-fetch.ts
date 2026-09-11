import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../runtime/src/index";
import {
    contract,
    type InferContract,
} from "../../contracts/src/index";
import {
    ExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import { invalidInput } from "./internal/invalid-input";

/** `WebFetchTool` 在 Profile 中使用的稳定标识。 */
export const WEB_FETCH_TOOL_ID = "web_fetch";

/** 默认获取页面内容的最大字符数。 */
export const WEB_FETCH_DEFAULT_MAX_CHARS = 50_000;

/** 单次获取允许的最大字符数上限。 */
export const WEB_FETCH_MAX_CHARS_LIMIT = 500_000;

/**
 * 网页内容获取后端执行函数契约。
 *
 * @param url - 目标网页 URL。
 * @param control - 可选的中止控制信号。
 * @returns 抓取到的原始文本或 HTML。
 * @throws 网络异常或请求被中止时抛出异常。
 *
 * @example
 * ```ts
 * const handler: WebFetchHandler = async (url) => "hello world";
 * ```
 */
export type WebFetchHandler = (
    url: string,
    control?: ExecutionControl,
) => Promise<string>;

/** Web Fetch Tool 的唯一输入 Contract。 */
export const WEB_FETCH_INPUT_CONTRACT = contract.object({
    url: contract.string(),
    maxChars: contract.optional(
        contract.integer({
            minimum: 1,
            maximum: WEB_FETCH_MAX_CHARS_LIMIT,
        }),
    ),
});

type WebFetchInput = InferContract<typeof WEB_FETCH_INPUT_CONTRACT>;

/**
 * 将 HTML 文本粗略转换为纯文本。
 */
export function htmlToPlainText(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 默认宿主网页抓取实现。
 */
async function defaultWebFetch(
    url: string,
    control?: ExecutionControl,
): Promise<string> {
    throwIfAborted(control);
    const requestInit: RequestInit = {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        ...(control?.signal !== undefined ? { signal: control.signal } : {}),
    };
    const response = await fetch(url, requestInit);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    throwIfAborted(control);

    if (contentType.includes("text/html") || raw.includes("<html") || raw.includes("<!DOCTYPE")) {
        return htmlToPlainText(raw);
    }
    return raw;
}

/**
 * 宿主代理网页内容抓取 Tool。
 *
 * @remarks
 * 在宿主执行 HTTP 请求并解析返回纯文本，对输出字符数做有界截断。
 * 容器内 Agent 无需开放网络即可获取外部参考网页。
 *
 * @example
 * ```ts
 * const tool = new WebFetchTool(async (url) => "Page content");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { url: "https://example.com" },
 * });
 * ```
 */
export class WebFetchTool implements Tool<typeof WEB_FETCH_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof WEB_FETCH_INPUT_CONTRACT> = {
        id: WEB_FETCH_TOOL_ID,
        description: "获取指定 URL 的网页纯文本内容，支持字符数截断",
        inputContract: WEB_FETCH_INPUT_CONTRACT,
    };

    readonly replayPolicy = "safe" as const;

    private readonly fetcher: WebFetchHandler;

    /**
     * @param fetcher - 可选的网页抓取实现；若未指定则使用内置 fetch。
     */
    constructor(fetcher?: WebFetchHandler) {
        this.fetcher = fetcher ?? defaultWebFetch;
    }

    /**
     * 校验 URL 的格式与合法性。
     *
     * @param input - 结构化输入。
     * @returns 语义校验结果。
     */
    validate(input: WebFetchInput): ToolValidationResult {
        const trimmed = input.url.trim();
        if (trimmed.length === 0) {
            return invalidInput("web_fetch.url 不能为空");
        }
        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return invalidInput("web_fetch.url 必须是 http 或 https 协议");
            }
        } catch {
            return invalidInput("web_fetch.url 不是有效的 URL");
        }
        return { ok: true };
    }

    /**
     * 执行一次网页内容获取。
     *
     * @param request - 包含 Action ID 与抓取参数的执行请求。
     * @param control - 可选的中止控制信号。
     * @returns 纯文本内容的成功 Observation 或网络错误失败 Observation。
     */
    async execute(
        request: ToolExecutionRequest<WebFetchInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const url = request.input.url.trim();
        const maxChars = request.input.maxChars ?? WEB_FETCH_DEFAULT_MAX_CHARS;

        try {
            const content = await this.fetcher(url, control);
            throwIfAborted(control);

            const isTruncated = content.length > maxChars;
            const output = isTruncated ? content.slice(0, maxChars) : content;

            return {
                kind: "success",
                output,
                summary: `已获取 ${url} (${output.length} 字符${isTruncated ? "，已截断" : ""})`,
            };
        } catch (error) {
            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }
            return {
                kind: "failure",
                code: "WEB_FETCH_FAILED",
                message: `获取网页内容失败: ${error instanceof Error ? error.message : String(error)}`,
                retryable: true,
            };
        }
    }
}
