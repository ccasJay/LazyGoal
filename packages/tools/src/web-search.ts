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

/** `WebSearchTool` 在 Profile 中使用的稳定标识。 */
export const WEB_SEARCH_TOOL_ID = "web_search";

/** 默认搜索返回条数上限。 */
export const WEB_SEARCH_DEFAULT_MAX_RESULTS = 10;

/** 单次搜索允许的最大条数。 */
export const WEB_SEARCH_MAX_RESULTS_LIMIT = 20;

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

type WebSearchInput = InferContract<typeof WEB_SEARCH_INPUT_CONTRACT>;

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
    const response = await fetch(endpoint, requestInit);
    if (!response.ok) {
        throw new Error(`DuckDuckGo 搜索失败: HTTP ${response.status}`);
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
            results.push({ title, url: rawUrl, snippet });
        }
    }
    return results;
}

/**
 * 宿主代理网页搜索 Tool。
 *
 * @remarks
 * 在宿主执行网络搜索请求，避免容器直接获取外网访问权限。
 * 支持注入自定义搜索后端以进行离线测试或切换不同搜索引擎。
 *
 * @example
 * ```ts
 * const tool = new WebSearchTool(async (q) => [
 *   { title: "Example", url: "https://example.com", snippet: "text" },
 * ]);
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { query: "LazyGoal" },
 * });
 * ```
 */
export class WebSearchTool implements Tool<typeof WEB_SEARCH_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof WEB_SEARCH_INPUT_CONTRACT> = {
        id: WEB_SEARCH_TOOL_ID,
        description: "在互联网上搜索信息并返回有界的标题、URL 和摘要列表",
        inputContract: WEB_SEARCH_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly isReadOnly = true as const;
    readonly replayPolicy = "safe" as const;

    private readonly backend: WebSearchBackend;

    /**
     * @param backend - 可选的搜索后端提供方；若未提供则使用默认抓取后端。
     */
    constructor(backend?: WebSearchBackend) {
        this.backend = backend ?? defaultDuckDuckGoSearch;
    }

    /**
     * 校验搜索查询的语义合法性。
     *
     * @param input - 结构化输入。
     * @returns 语义校验结果。
     */
    validate(input: WebSearchInput): ToolValidationResult {
        if (input.query.trim().length === 0) {
            return invalidInput("web_search.query 不能为空");
        }
        return { ok: true };
    }

    /**
     * 执行一次网页搜索。
     *
     * @param request - 包含 Action ID 与查询参数的执行请求。
     * @param control - 可选的中止控制信号。
     * @returns 搜索结果的成功 Observation 或网络错误失败 Observation。
     */
    async execute(
        request: ToolExecutionRequest<WebSearchInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const query = request.input.query.trim();
        const maxResults = request.input.maxResults ?? WEB_SEARCH_DEFAULT_MAX_RESULTS;

        try {
            const results = await this.backend(query, maxResults, control);
            throwIfAborted(control);

            return {
                kind: "success",
                output: results,
                summary: `搜索 "${query}" 返回 ${results.length} 条结果`,
            };
        } catch (error) {
            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }
            return {
                kind: "failure",
                code: "WEB_SEARCH_FAILED",
                message: `网页搜索失败: ${error instanceof Error ? error.message : String(error)}`,
                retryable: true,
            };
        }
    }
}
