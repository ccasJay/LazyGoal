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
} from "../../execution-control/src/index";
import { TransientToolExecutionFailure } from "../../runtime/src/tool";
import type { DerivedSandboxAccess } from "../../sandbox/src/index";
import { invalidInput } from "./internal/invalid-input";

/** `WebFetchTool` 在 Profile 中使用的稳定标识。 */
export const WEB_FETCH_TOOL_ID = "web_fetch";

/** 默认获取页面内容的最大字符数。 */
export const WEB_FETCH_DEFAULT_MAX_CHARS = 16_000;

/** 单次获取允许的最大字符数上限。 */
export const WEB_FETCH_MAX_CHARS_LIMIT = 50_000;

/** 抓取响应体读取字节上限（2 MiB）。 */
export const WEB_FETCH_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** 抓取请求默认超时时间（30 秒）。 */
export const WEB_FETCH_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 网页内容抓取结构化输出。
 *
 * @example
 * ```ts
 * const output: WebFetchOutput = {
 *   url: "https://example.com",
 *   text: "Page content...",
 *   offset: 0,
 *   nextOffset: 16000,
 *   truncated: true,
 * };
 * ```
 */
export interface WebFetchOutput {
    /** 抓取的来源 URL。 */
    readonly url: string;
    /** 提取并切片后的正文文本。 */
    readonly text: string;
    /** 本次返回切片的起始 UTF-16 偏移。 */
    readonly offset: number;
    /** 若正文被截断，可用于后续续读的下一个偏移位置。 */
    readonly nextOffset?: number;
    /** 本次返回是否发生截断。 */
    readonly truncated: boolean;
}

/**
 * 响应体超过 2 MiB 硬上限的错误。
 */
export class WebResponseTooLargeError extends Error {
    constructor(message = "Web response exceeds 2 MiB limit") {
        super(message);
        this.name = "WebResponseTooLargeError";
    }
}

/**
 * 网页内容获取后端执行函数契约。
 *
 * @param url - 目标网页 URL。
 * @param control - 可选的中止控制信号。
 * @returns 抓取到的原始文本或包含 HTML 标识的对象。
 * @throws 网络异常、超限或请求被中止时抛出异常。
 *
 * @example
 * ```ts
 * const handler: WebFetchHandler = async (url) => "hello world";
 * ```
 */
export type WebFetchHandler = (
    url: string,
    control?: ExecutionControl,
) => Promise<string | { text: string; isHtml?: boolean }>;

/** Web Fetch Tool 的唯一输入 Contract。 */
export const WEB_FETCH_INPUT_CONTRACT = contract.object({
    url: contract.string(),
    maxChars: contract.optional(
        contract.integer({
            minimum: 1,
            maximum: WEB_FETCH_MAX_CHARS_LIMIT,
        }),
    ),
    offset: contract.optional(
        contract.integer({
            minimum: 0,
        }),
    ),
});

/** Web Fetch 输入类型。 */
export type WebFetchInput = InferContract<typeof WEB_FETCH_INPUT_CONTRACT>;

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
): Promise<{ text: string; isHtml: boolean }> {
    throwIfAborted(control);
    const requestInit: RequestInit = {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        ...(control?.signal !== undefined ? { signal: control.signal } : {}),
    };
    let response: Response;
    try {
        response = await fetch(url, requestInit);
    } catch (error) {
        if (control?.signal?.aborted) throw new ExecutionAbortedError();
        if (error instanceof TypeError) {
            throw new TransientToolExecutionFailure("network_request_failed");
        }
        throw error;
    }
    if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
            const retryAfter = response.headers.get("retry-after");
            const seconds = retryAfter === null ? undefined : Number(retryAfter);
            const retryAfterMs = seconds !== undefined && Number.isFinite(seconds) && seconds >= 0
                ? Math.min(30_000, seconds * 1_000)
                : undefined;
            throw new TransientToolExecutionFailure(`http_${response.status}`, retryAfterMs);
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader !== null) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (Number.isFinite(contentLength) && contentLength > WEB_FETCH_MAX_RESPONSE_BYTES) {
            throw new WebResponseTooLargeError(`Response Content-Length (${contentLength} bytes) exceeds 2 MiB limit`);
        }
    }

    const contentType = response.headers.get("content-type") ?? "";
    let rawText = "";

    if (response.body !== null) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        try {
            while (true) {
                throwIfAborted(control);
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.byteLength;
                if (totalBytes > WEB_FETCH_MAX_RESPONSE_BYTES) {
                    await reader.cancel();
                    throw new WebResponseTooLargeError(`Response body exceeded 2 MiB limit (${totalBytes} bytes read)`);
                }
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }
        rawText = Buffer.concat(chunks).toString("utf8");
    } else {
        rawText = await response.text();
        if (Buffer.byteLength(rawText, "utf8") > WEB_FETCH_MAX_RESPONSE_BYTES) {
            throw new WebResponseTooLargeError("Response body exceeded 2 MiB limit");
        }
    }
    throwIfAborted(control);

    const isHtml = contentType.includes("text/html") || rawText.includes("<html") || rawText.includes("<!DOCTYPE");
    return { text: rawText, isHtml };
}

/**
 * 宿主代理网页内容抓取 Tool。
 *
 * @remarks
 * 在宿主执行 HTTP 请求并解析纯文本，派生 `all_outbound` 沙箱网络能力。
 * 执行前严格核验当前沙箱执行计划是否已获准出站网络；若无有效计划则阻断并拒绝调用后端。
 * 限制响应体最多读取 2 MiB，超过返回 `WEB_RESPONSE_TOO_LARGE` 失败，不以残缺 HTML 冒充成功。
 * 提取文本后按 UTF-16 偏移 `offset` 与 `maxChars` 分页返回结构化切片与 `nextOffset`。
 *
 * @example
 * ```ts
 * const tool = new WebFetchTool(async (url) => "Page content");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { url: "https://example.com", maxChars: 1000, offset: 0 },
 *   plan: { workspaceRoot: "/ws", scope: { extraFiles: [], network: "all_outbound" } },
 * });
 * ```
 */
export class WebFetchTool implements Tool<typeof WEB_FETCH_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof WEB_FETCH_INPUT_CONTRACT> = {
        id: WEB_FETCH_TOOL_ID,
        description: "Fetch web page content and return structured plain text with pagination support.",
        inputContract: WEB_FETCH_INPUT_CONTRACT,
        isReadOnly: true,
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
     * 派生执行网页抓取所需的沙箱网络访问申请。
     *
     * @param input - 结构化抓取输入。
     * @returns 派生的出站网络访问申请。
     */
    resolveSandboxAccess(input: WebFetchInput): DerivedSandboxAccess {
        let host = "all_outbound";
        try {
            host = new URL(input.url).hostname || "all_outbound";
        } catch {}
        return {
            network: {
                targets: [host],
                purpose: `Fetch web page content from ${host}`,
            },
        };
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
            return invalidInput("url cannot be empty", ["url"]);
        }
        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return invalidInput("url must use http or https protocol", ["url"]);
            }
        } catch {
            return invalidInput("url is not a valid URL", ["url"]);
        }
        if (input.maxChars !== undefined && (input.maxChars < 1 || input.maxChars > WEB_FETCH_MAX_CHARS_LIMIT)) {
            return invalidInput(`maxChars must be between 1 and ${WEB_FETCH_MAX_CHARS_LIMIT}`, ["maxChars"]);
        }
        if (input.offset !== undefined && input.offset < 0) {
            return invalidInput("offset must be non-negative", ["offset"]);
        }
        return { ok: true };
    }

    /**
     * 执行一次网页内容获取。
     *
     * @param request - 包含 Action ID、抓取参数与可选沙箱执行计划的请求。
     * @param control - 可选的中止控制信号。
     * @returns 结构化内容的成功 Observation 或网络错误失败 Observation。
     */
    async execute(
        request: ToolExecutionRequest<WebFetchInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const isPlanValid = request.plan !== undefined
            && (request.plan.actionId === undefined || request.plan.actionId === request.actionId)
            && request.plan.scope?.network === "all_outbound";

        if (!isPlanValid) {
            return {
                kind: "failure",
                code: "SANDBOX_APPROVAL_REQUIRED",
                message: "Web fetch requires approved outbound network access in sandbox execution plan.",
                retryable: false,
            };
        }

        const url = request.input.url.trim();
        const maxChars = request.input.maxChars ?? WEB_FETCH_DEFAULT_MAX_CHARS;
        const offset = request.input.offset ?? 0;

        const timeoutSignal = AbortSignal.timeout(WEB_FETCH_DEFAULT_TIMEOUT_MS);
        const combinedSignal = control?.signal !== undefined
            ? AbortSignal.any([control.signal, timeoutSignal])
            : timeoutSignal;
        const effectiveControl: ExecutionControl = { signal: combinedSignal };

        let fullExtractedText = "";
        try {
            const raw = await this.fetcher(url, effectiveControl);
            throwIfAborted(control);

            if (typeof raw === "string") {
                if (Buffer.byteLength(raw, "utf8") > WEB_FETCH_MAX_RESPONSE_BYTES) {
                    return {
                        kind: "failure",
                        code: "WEB_RESPONSE_TOO_LARGE",
                        message: "Web response exceeds 2 MiB limit.",
                        retryable: false,
                    };
                }
                const isHtml = raw.includes("<html") || raw.includes("<!DOCTYPE") || raw.includes("<head") || raw.includes("<body");
                fullExtractedText = isHtml ? htmlToPlainText(raw) : raw;
            } else {
                if (Buffer.byteLength(raw.text, "utf8") > WEB_FETCH_MAX_RESPONSE_BYTES) {
                    return {
                        kind: "failure",
                        code: "WEB_RESPONSE_TOO_LARGE",
                        message: "Web response exceeds 2 MiB limit.",
                        retryable: false,
                    };
                }
                fullExtractedText = raw.isHtml ? htmlToPlainText(raw.text) : raw.text;
            }
        } catch (error) {
            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }
            if (timeoutSignal.aborted) {
                return {
                    kind: "failure",
                    code: "WEB_FETCH_TIMEOUT",
                    message: "Web fetch request timed out after 30 seconds.",
                    retryable: false,
                };
            }
            if (error instanceof WebResponseTooLargeError) {
                return {
                    kind: "failure",
                    code: "WEB_RESPONSE_TOO_LARGE",
                    message: error.message,
                    retryable: false,
                };
            }
            if (error instanceof TransientToolExecutionFailure) {
                throw error;
            }
            if (error instanceof Error && /\b(429|5\d\d)\b/.test(error.message)) {
                throw new TransientToolExecutionFailure(error.message);
            }
            return {
                kind: "failure",
                code: "WEB_FETCH_FAILED",
                message: `Failed to fetch web content: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }

        let pageText = "";
        let nextOffset: number | undefined = undefined;
        let truncated = false;

        if (offset < fullExtractedText.length) {
            const end = Math.min(offset + maxChars, fullExtractedText.length);
            pageText = fullExtractedText.slice(offset, end);
            if (end < fullExtractedText.length) {
                truncated = true;
                nextOffset = end;
            }
        }

        const output: WebFetchOutput = {
            url,
            text: pageText,
            offset,
            ...(nextOffset !== undefined ? { nextOffset } : {}),
            truncated,
        };

        const summaryNotice = truncated ? `, next offset ${nextOffset}` : "";
        return {
            kind: "success",
            output: output as any,
            summary: `Fetched ${url} (${pageText.length} chars, offset ${offset}${summaryNotice})`,
        };
    }
}
