import type { LLMProvider } from "../../llm-core/src/index.js";
import {
    ModelCatalogError,
    type ProviderModelFetcher,
    type RawFetchedModel,
} from "./model-catalog.js";

/**
 * 仅用于在线列表查询的连接参数，不要求模型标识或 Token 容量。
 * @example
 * ```ts
 * const connection: ProviderModelConnection = { provider: "google", apiKey: "secret" };
 * ```
 */
export interface ProviderModelConnection {
    readonly provider: LLMProvider;
    readonly apiKey: string;
    /** 已由调用边界按供应商规则验证的端点。 */
    readonly baseURL?: string;
}

/**
 * 七类 Provider 在线模型列表拉取器的默认实现。
 *
 * @remarks
 * 支持 OpenAI、Google、Anthropic、OpenRouter、DeepSeek、openai-compatible 和 opencode-go。
 * 负责各 Provider 的端点 URL 适配、认证头拼装、Google/Anthropic 分页遍历、
 * 共享超时（默认 5000ms）与外部取消控制，并将网络、HTTP 状态与协议异常分类映射为脱敏的 `ModelCatalogError`。
 *
 * @example
 * ```ts
 * const fetcher = new DefaultProviderModelFetcher();
 * const models = await fetcher.fetchModels(config);
 * ```
 */
export class DefaultProviderModelFetcher implements ProviderModelFetcher {
    /**
     * @param defaultTimeoutMs - 单次查询总操作超时（毫秒），多页分页共享此超时预算。
     */
    constructor(
        private readonly defaultTimeoutMs: number = 5000,
    ) {}

    /**
     * 拉取指定 Provider 在线模型原始列表。
     *
     * @param config - 当前 LLM 配置，包含 provider、apiKey 及可能的 baseURL。
     * @param options - 包含可选外部取消信号与用于测试的 fetch 实现。
     * @returns 原始模型信息数组。
     * @throws ModelCatalogError 当认证失败、权限不足、端点不支持、服务不可用、超时、取消或协议非法时抛出。
     *
     * @example
     * ```ts
     * const fetcher = new DefaultProviderModelFetcher();
     * const rawList = await fetcher.fetchModels(config, { signal: AbortSignal.timeout(3000) });
     * ```
     */
    public async fetchModels<Connection extends ProviderModelConnection>(
        config: Connection,
        options?: { readonly signal?: AbortSignal | undefined; readonly fetch?: typeof fetch | undefined },
    ): Promise<readonly RawFetchedModel[]> {
        const timeoutMs = this.defaultTimeoutMs;
        const internalController = new AbortController();
        let didTimeout = false;
        const timer = setTimeout(() => {
            didTimeout = true;
            internalController.abort();
        }, timeoutMs);

        const externalSignal = options?.signal;
        if (externalSignal?.aborted) {
            clearTimeout(timer);
            throw new ModelCatalogError("cancelled", "Model catalog request was cancelled.");
        }

        const onExternalAbort = () => {
            internalController.abort();
        };
        externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

        const executeRequest = async (url: string, headers: Record<string, string>): Promise<unknown> => {
            if (externalSignal?.aborted) {
                throw new ModelCatalogError("cancelled", "Model catalog request was cancelled.");
            }
            if (didTimeout) {
                throw new ModelCatalogError("timeout", `Provider "${config.provider}" request timed out after ${timeoutMs}ms.`);
            }

            const fetchImpl = options?.fetch ?? fetch;
            let res: Response;
            try {
                res = await fetchImpl(url, {
                    method: "GET",
                    headers,
                    signal: internalController.signal,
                });
            } catch (err: unknown) {
                if (err instanceof ModelCatalogError) {
                    throw err;
                }
                if (externalSignal?.aborted) {
                    throw new ModelCatalogError("cancelled", "Model catalog request was cancelled.");
                }
                if (didTimeout) {
                    throw new ModelCatalogError("timeout", `Provider "${config.provider}" request timed out after ${timeoutMs}ms.`);
                }
                if (internalController.signal.aborted) {
                    throw new ModelCatalogError("cancelled", "Model catalog request was cancelled.");
                }
                throw new ModelCatalogError("unavailable", `Provider "${config.provider}" network request failed.`);
            }

            if (!res.ok) {
                const status = res.status;
                if (status === 401) {
                    throw new ModelCatalogError("authentication", `Provider "${config.provider}" authentication failed.`, 401);
                }
                if (status === 403) {
                    throw new ModelCatalogError("permission", `Provider "${config.provider}" permission denied.`, 403);
                }
                if (status === 404 || status === 405 || status === 501) {
                    throw new ModelCatalogError("unsupported", `Provider "${config.provider}" models endpoint is unsupported.`, status);
                }
                if (status >= 500 && status <= 599) {
                    throw new ModelCatalogError("unavailable", `Provider "${config.provider}" service is temporarily unavailable.`, status);
                }
                throw new ModelCatalogError("protocol", `Provider "${config.provider}" returned HTTP status ${status}.`, status);
            }

            try {
                return await res.json();
            } catch {
                throw new ModelCatalogError("protocol", `Provider "${config.provider}" returned invalid JSON.`);
            }
        };

        try {
            switch (config.provider) {
                case "openai":
                    return await this.fetchOpenAi(config, executeRequest);
                case "google":
                    return await this.fetchGoogle(config, executeRequest);
                case "anthropic":
                    return await this.fetchAnthropic(config, executeRequest);
                case "openrouter":
                    return await this.fetchOpenRouter(config, executeRequest);
                case "deepseek":
                    return await this.fetchDeepSeek(config, executeRequest);
                case "openai-compatible":
                    return await this.fetchOpenAiCompatible(config, executeRequest);
                case "opencode-go":
                    return await this.fetchOpenCodeGo(config, executeRequest);
                default: {
                    const exhaustive: never = config.provider;
                    throw new ModelCatalogError("unsupported", `Unsupported provider: ${exhaustive}`);
                }
            }
        } finally {
            clearTimeout(timer);
            externalSignal?.removeEventListener("abort", onExternalAbort);
        }
    }

    private async fetchOpenAi(
        config: ProviderModelConnection,
        executeRequest: (url: string, headers: Record<string, string>) => Promise<unknown>,
    ): Promise<readonly RawFetchedModel[]> {
        const rawBase = (config.provider === "openai" && config.baseURL) ? config.baseURL : "https://api.openai.com/v1";
        const baseURL = rawBase.replace(/\/$/, "");
        const url = `${baseURL}/models`;
        const headers: Record<string, string> = {
            Authorization: `Bearer ${config.apiKey}`,
        };
        return this.parseIdOnlyModelList(await executeRequest(url, headers), { provider: "openai" });
    }

    private async fetchGoogle(
        config: ProviderModelConnection,
        executeRequest: (url: string, headers: Record<string, string>) => Promise<unknown>,
    ): Promise<readonly RawFetchedModel[]> {
        const rawBase = (config.provider === "google" && config.baseURL) ? config.baseURL : "https://generativelanguage.googleapis.com/v1beta";
        const baseURL = rawBase.replace(/\/$/, "");
        const headers: Record<string, string> = {
            "x-goog-api-key": config.apiKey,
        };
        const models: RawFetchedModel[] = [];
        const seenPageTokens = new Set<string>();
        let currentPageToken: string | undefined = undefined;

        while (true) {
            const url = new URL(`${baseURL}/models`);
            if (currentPageToken !== undefined) {
                url.searchParams.set("pageToken", currentPageToken);
            }
            const json = await executeRequest(url.toString(), headers);
            if (!json || typeof json !== "object" || !Array.isArray((json as { models?: unknown }).models)) {
                throw new ModelCatalogError("protocol", 'Provider "google" returned malformed models response.');
            }
            const list = (json as { models: readonly unknown[] }).models;
            for (const item of list) {
                if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string" || !(item as { name: string }).name.trim()) {
                    throw new ModelCatalogError("protocol", 'Provider "google" returned malformed model item.');
                }
                const typed = item as {
                    name: string;
                    displayName?: unknown;
                    inputTokenLimit?: unknown;
                    outputTokenLimit?: unknown;
                    supportedGenerationMethods?: unknown;
                };
                const rawName = typed.name.trim();
                const id = rawName.startsWith("models/") ? rawName.slice(7) : rawName;
                const displayName = typeof typed.displayName === "string" && typed.displayName.trim()
                    ? typed.displayName.trim()
                    : undefined;
                const contextWindowTokens = typeof typed.inputTokenLimit === "number" && Number.isSafeInteger(typed.inputTokenLimit) && typed.inputTokenLimit > 0
                    ? typed.inputTokenLimit
                    : undefined;
                const maxOutputTokens = typeof typed.outputTokenLimit === "number" && Number.isSafeInteger(typed.outputTokenLimit) && typed.outputTokenLimit > 0
                    ? typed.outputTokenLimit
                    : undefined;
                const supportedGenerationMethods = Array.isArray(typed.supportedGenerationMethods)
                    ? typed.supportedGenerationMethods.filter((m): m is string => typeof m === "string")
                    : undefined;
                const isTextGeneration = supportedGenerationMethods !== undefined
                    ? supportedGenerationMethods.includes("generateContent")
                    : undefined;

                models.push({
                    id,
                    ...(displayName !== undefined ? { displayName } : {}),
                    ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
                    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
                    ...(supportedGenerationMethods !== undefined ? { supportedGenerationMethods } : {}),
                    ...(isTextGeneration !== undefined ? { isTextGeneration } : {}),
                });
            }

            const nextToken = (json as { nextPageToken?: unknown }).nextPageToken;
            if (nextToken === undefined || nextToken === null || nextToken === "") {
                break;
            }
            if (typeof nextToken !== "string" || seenPageTokens.has(nextToken) || nextToken === currentPageToken) {
                throw new ModelCatalogError("protocol", 'Provider "google" returned non-advancing page token.');
            }
            seenPageTokens.add(nextToken);
            currentPageToken = nextToken;
        }

        return models;
    }

    private async fetchAnthropic(
        config: ProviderModelConnection,
        executeRequest: (url: string, headers: Record<string, string>) => Promise<unknown>,
    ): Promise<readonly RawFetchedModel[]> {
        const headers: Record<string, string> = {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
        };
        const models: RawFetchedModel[] = [];
        const seenCursors = new Set<string>();
        let currentCursor: string | undefined = undefined;

        while (true) {
            const url = new URL("https://api.anthropic.com/v1/models");
            if (currentCursor !== undefined) {
                url.searchParams.set("after_id", currentCursor);
            }
            const json = await executeRequest(url.toString(), headers);
            if (!json || typeof json !== "object" || !Array.isArray((json as { data?: unknown }).data)) {
                throw new ModelCatalogError("protocol", 'Provider "anthropic" returned malformed models response.');
            }
            const data = (json as { data: readonly unknown[] }).data;
            for (const item of data) {
                if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string" || !(item as { id: string }).id.trim()) {
                    throw new ModelCatalogError("protocol", 'Provider "anthropic" returned malformed model item.');
                }
                const typed = item as { id: string; display_name?: unknown };
                const id = typed.id.trim();
                const displayName = typeof typed.display_name === "string" && typed.display_name.trim()
                    ? typed.display_name.trim()
                    : undefined;
                models.push({
                    id,
                    ...(displayName !== undefined ? { displayName } : {}),
                });
            }

            const hasMore = (json as { has_more?: unknown }).has_more === true;
            if (!hasMore) {
                break;
            }
            const lastId = (json as { last_id?: unknown }).last_id;
            if (typeof lastId !== "string" || !lastId.trim() || seenCursors.has(lastId) || lastId === currentCursor) {
                throw new ModelCatalogError("protocol", 'Provider "anthropic" returned non-advancing cursor.');
            }
            seenCursors.add(lastId);
            currentCursor = lastId;
        }

        return models;
    }

    private async fetchOpenRouter(
        config: ProviderModelConnection,
        executeRequest: (url: string, headers: Record<string, string>) => Promise<unknown>,
    ): Promise<readonly RawFetchedModel[]> {
        const url = "https://openrouter.ai/api/v1/models";
        const headers: Record<string, string> = {
            Authorization: `Bearer ${config.apiKey}`,
        };
        const json = await executeRequest(url, headers);
        if (!json || typeof json !== "object" || !Array.isArray((json as { data?: unknown }).data)) {
            throw new ModelCatalogError("protocol", 'Provider "openrouter" returned malformed models response.');
        }
        const data = (json as { data: readonly unknown[] }).data;
        const models: RawFetchedModel[] = [];
        for (const item of data) {
            if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string" || !(item as { id: string }).id.trim()) {
                throw new ModelCatalogError("protocol", 'Provider "openrouter" returned malformed model item.');
            }
            const typed = item as {
                id: string;
                name?: unknown;
                context_length?: unknown;
                top_provider?: { max_completion_tokens?: unknown } | null;
                architecture?: { modality?: unknown; instruct_type?: unknown } | null;
            };
            const id = typed.id.trim();
            const displayName = typeof typed.name === "string" && typed.name.trim() ? typed.name.trim() : undefined;
            const contextWindowTokens = typeof typed.context_length === "number" && Number.isSafeInteger(typed.context_length) && typed.context_length > 0
                ? typed.context_length
                : undefined;
            const maxTokens = typed.top_provider?.max_completion_tokens;
            const maxOutputTokens = typeof maxTokens === "number" && Number.isSafeInteger(maxTokens) && maxTokens > 0
                ? maxTokens
                : undefined;

            let vision: boolean | undefined = undefined;
            let isTextGeneration: boolean | undefined = undefined;
            if (typed.architecture && typeof typed.architecture === "object") {
                const modality = typeof typed.architecture.modality === "string" ? typed.architecture.modality : "";
                if (modality) {
                    const inputModality = modality.includes("->") ? modality.split("->")[0]! : modality;
                    vision = inputModality.includes("image");
                    if (modality.includes("->")) {
                        const outputModality = modality.split("->")[1]!;
                        isTextGeneration = outputModality.includes("text");
                    }
                }
            }

            models.push({
                id,
                ...(displayName !== undefined ? { displayName } : {}),
                ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
                ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
                ...(vision !== undefined ? { vision } : {}),
                ...(isTextGeneration !== undefined ? { isTextGeneration } : {}),
            });
        }
        return models;
    }

    private async fetchDeepSeek(
        config: ProviderModelConnection,
        executeRequest: (url: string, headers: Record<string, string>) => Promise<unknown>,
    ): Promise<readonly RawFetchedModel[]> {
        const url = "https://api.deepseek.com/models";
        const headers: Record<string, string> = {
            Authorization: `Bearer ${config.apiKey}`,
        };
        return this.parseIdOnlyModelList(await executeRequest(url, headers), { provider: "deepseek" });
    }

    private async fetchOpenCodeGo(
        config: ProviderModelConnection,
        executeRequest: (url: string, headers: Record<string, string>) => Promise<unknown>,
    ): Promise<readonly RawFetchedModel[]> {
        const url = "https://opencode.ai/inference/go/v1/models";
        const headers: Record<string, string> = {
            Authorization: `Bearer ${config.apiKey}`,
        };
        return this.parseIdOnlyModelList(await executeRequest(url, headers), { provider: "opencode-go" });
    }

    private async fetchOpenAiCompatible(
        config: ProviderModelConnection,
        executeRequest: (url: string, headers: Record<string, string>) => Promise<unknown>,
    ): Promise<readonly RawFetchedModel[]> {
        const baseURL = (config as { baseURL: string }).baseURL.replace(/\/$/, "");
        const url = `${baseURL}/models`;
        const headers: Record<string, string> = {};
        if (config.apiKey && config.apiKey.trim()) {
            headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
        }
        return this.parseIdOnlyModelList(await executeRequest(url, headers), {
            provider: "openai-compatible",
            acceptModelsKey: true,
            allowStringItems: true,
        });
    }

    /**
     * 解析 OpenAI 风格的 id-only 模型列表。
     *
     * @remarks
     * 供 `openai`、`deepseek`、`openai-compatible` 与 `opencode-go` 四个同形端点共用；
     * 仅负责校验形状、提取并 trim `id`，并按 Provider 名称抛出脱敏的 `protocol` 错误。
     * @param json - 已反序列化的响应体。
     * @param options - Provider 名称与形状开关：`acceptModelsKey` 允许顶层 `models` 数组，
     *   `allowStringItems` 允许数组元素本身为字符串。Google/Anthropic/OpenRouter 的形状与分页不同，不适用此解析。
     * @returns 已提取 id 的原始模型列表。
     * @throws ModelCatalogError 响应或元素形状不合法时抛出 `protocol` 错误。
     */
    private parseIdOnlyModelList(
        json: unknown,
        options: { readonly provider: string; readonly acceptModelsKey?: boolean | undefined; readonly allowStringItems?: boolean | undefined },
    ): readonly RawFetchedModel[] {
        const record = json !== null && typeof json === "object" ? json as { data?: unknown; models?: unknown } : undefined;
        const rawList = Array.isArray(record?.data)
            ? record.data
            : options.acceptModelsKey === true && Array.isArray(record?.models)
                ? record.models
                : null;
        if (rawList === null) {
            throw new ModelCatalogError("protocol", `Provider "${options.provider}" returned malformed models response.`);
        }
        const models: RawFetchedModel[] = [];
        for (const item of rawList) {
            const id = options.allowStringItems === true && typeof item === "string"
                ? item.trim()
                : item !== null && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
                    ? (item as { id: string }).id.trim()
                    : "";
            if (!id) {
                throw new ModelCatalogError("protocol", `Provider "${options.provider}" returned malformed model item.`);
            }
            models.push({ id });
        }
        return models;
    }
}
