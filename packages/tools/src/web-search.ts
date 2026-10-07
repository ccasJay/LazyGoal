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

/** `WebSearchTool` 在 Profile 中使用的稳定标识。 */
export const WEB_SEARCH_TOOL_ID = "web_search";

/** 默认搜索返回条数上限。 */
export const WEB_SEARCH_DEFAULT_MAX_RESULTS = 10;

/** 单次搜索允许的最大条数。 */
export const WEB_SEARCH_MAX_RESULTS_LIMIT = 20;

/** 搜索单项文本最大长度。 */
export const WEB_SEARCH_MAX_SNIPPET_CHARS = 2000;

/** 搜索标题最大长度。 */
export const WEB_SEARCH_MAX_TITLE_CHARS = 500;

/** 搜索 URL 最大长度。 */
export const WEB_SEARCH_MAX_URL_CHARS = 2000;

/** 搜索默认超时时间（30 秒）。 */
export const WEB_SEARCH_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 网页搜索结果单项结构。
 *
 * @example
 * ```ts
 * const item: WebSearchResult = {
 *   title: "LazyGoal 文档",
 *   url: "https://example.com",
 *   snippet: "LazyGoal 是一个目标驱动的 agent runtime...",
 * };
 * ```
 */
export interface WebSearchResult {
    readonly [key: string]: string;
    /** 搜索结果标题。 */
    readonly title: string;
    /** 目标页面 URL。 */
    readonly url: string;
    /** 结果文本摘要。 */
    readonly snippet: string;
}

/**
 * 网页搜索后端执行函数契约。
 *
 * @param query - 查询字符串。
 * @param maxResults - 返回的最大结果数。
 * @param control - 可选的中止控制信号。
 * @returns 搜索结果列表。
 * @throws 搜索后端网络异常或被中止时抛出异常。
 *
 * @example
 * ```ts
 * const backend: WebSearchBackend = async (query, maxResults) => [
 *   { title: "Result", url: "https://example.com", snippet: "Snippet" },
 * ];
 * ```
 */
export type WebSearchBackend = (
    query: string,
    maxResults: number,
    control?: ExecutionControl,
) => Promise<readonly WebSearchResult[]>;

/** Web Search Tool 的唯一输入 Contract。 */
export const WEB_SEARCH_INPUT_CONTRACT = contract.object({
    query: contract.string(),
    maxResults: contract.optional(
        contract.integer({
            minimum: 1,
            maximum: WEB_SEARCH_MAX_RESULTS_LIMIT,
        }),
    ),
});

/** Web Search 输入类型。 */
export type WebSearchInput = InferContract<typeof WEB_SEARCH_INPUT_CONTRACT>;

/**
 * 默认宿主 DuckDuckGo HTML 网页搜索抓取实现。
 */
async function defaultDuckDuckGoSearch(
    query: string,
    maxResults: number,
    control?: ExecutionControl,
): Promise<readonly WebSearchResult[]> {
    throwIfAborted(control);
    const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const requestInit: RequestInit = {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        ...(control?.signal !== undefined ? { signal: control.signal } : {}),
    };
    let response: Response;
    try {
        response = await fetch(endpoint, requestInit);
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
        throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
    }
    const html = await response.text();
    throwIfAborted(control);

    const results: WebSearchResult[] = [];
    const linkRegex = /<a\s+class="result__url"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
        const rawUrl = match[1]?.trim() ?? "";
        const title = (match[2] ?? "").replace(/<[^>]+>/g, "").trim();
        const snippet = (match[3] ?? "").replace(/<[^>]+>/g, "").trim();
        if (rawUrl && title) {
            results.push({
                title: title.slice(0, WEB_SEARCH_MAX_TITLE_CHARS),
                url: rawUrl.slice(0, WEB_SEARCH_MAX_URL_CHARS),
                snippet: snippet.slice(0, WEB_SEARCH_MAX_SNIPPET_CHARS),
            });
        }
    }
    return results;
}

/**
 * 宿主代理网页搜索 Tool。
 *
 * @remarks
 * 在宿主执行网络搜索请求，派生 `all_outbound` 沙箱网络能力。
 * 执行前严格核验当前沙箱执行计划是否已获准出站网络；若无有效计划则阻断并拒绝调用后端。
 * 支持注入自定义搜索后端以进行离线测试或切换不同搜索引擎。
 * 针对 429 与 5xx 故障抛出 `TransientToolExecutionFailure`，由 Runner 执行安全重试。
 *
 * @example
 * ```ts
 * const tool = new WebSearchTool(async (q) => [
 *   { title: "Example", url: "https://example.com", snippet: "text" },
 * ]);
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { query: "LazyGoal" },
 *   plan: { workspaceRoot: "/ws", scope: { extraFiles: [], network: "all_outbound" } },
 * });
 * ```
 */
export class WebSearchTool implements Tool<typeof WEB_SEARCH_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof WEB_SEARCH_INPUT_CONTRACT> = {
        id: WEB_SEARCH_TOOL_ID,
        description: "Search information online and return bounded title, URL, and snippet lists.",
        inputContract: WEB_SEARCH_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly backend: WebSearchBackend;

    /**
     * @param backend - 可选的搜索后端提供方；若未提供则使用默认抓取后端。
     */
    constructor(backend?: WebSearchBackend) {
        this.backend = backend ?? defaultDuckDuckGoSearch;
    }

    /**
     * 派生执行网页搜索所需的沙箱网络访问申请。
     *
     * @param _input - 结构化搜索输入。
     * @returns 派生的出站网络访问申请。
     */
    resolveSandboxAccess(_input: WebSearchInput): DerivedSandboxAccess {
        return {
            network: {
                targets: ["all_outbound"],
                purpose: "Perform outbound web search",
            },
        };
    }

    /**
     * 校验搜索查询的语义合法性。
     *
     * @param input - 结构化输入。
     * @returns 语义校验结果。
     */
    validate(input: WebSearchInput): ToolValidationResult {
        if (input.query.trim().length === 0) {
            return invalidInput("query cannot be empty", ["query"]);
        }
        if (input.maxResults !== undefined && (input.maxResults < 1 || input.maxResults > WEB_SEARCH_MAX_RESULTS_LIMIT)) {
            return invalidInput(`maxResults must be between 1 and ${WEB_SEARCH_MAX_RESULTS_LIMIT}`, ["maxResults"]);
        }
        return { ok: true };
    }

    /**
     * 执行一次网页搜索。
     *
     * @param request - 包含 Action ID、查询参数与可选沙箱执行计划的请求。
     * @param control - 可选的中止控制信号。
     * @returns 搜索结果的成功 Observation 或失败 Observation。
     */
    async execute(
        request: ToolExecutionRequest<WebSearchInput>,
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
                message: "Web search requires approved outbound network access in sandbox execution plan.",
                retryable: false,
            };
        }

        const query = request.input.query.trim();
        const maxResults = request.input.maxResults ?? WEB_SEARCH_DEFAULT_MAX_RESULTS;

        const timeoutSignal = AbortSignal.timeout(WEB_SEARCH_DEFAULT_TIMEOUT_MS);
        const combinedSignal = control?.signal !== undefined
            ? AbortSignal.any([control.signal, timeoutSignal])
            : timeoutSignal;
        const effectiveControl: ExecutionControl = { signal: combinedSignal };

        try {
            const rawResults = await this.backend(query, maxResults, effectiveControl);
            throwIfAborted(control);

            const boundedResults: WebSearchResult[] = rawResults.slice(0, maxResults).map((r) => ({
                title: r.title.slice(0, WEB_SEARCH_MAX_TITLE_CHARS),
                url: r.url.slice(0, WEB_SEARCH_MAX_URL_CHARS),
                snippet: r.snippet.slice(0, WEB_SEARCH_MAX_SNIPPET_CHARS),
            }));

            return {
                kind: "success",
                output: boundedResults,
                summary: `Web search for "${query}" returned ${boundedResults.length} result(s).`,
            };
        } catch (error) {
            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }
            if (timeoutSignal.aborted) {
                return {
                    kind: "failure",
                    code: "WEB_SEARCH_TIMEOUT",
                    message: "Web search request timed out after 30 seconds.",
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
                code: "WEB_SEARCH_FAILED",
                message: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }
    }
}
