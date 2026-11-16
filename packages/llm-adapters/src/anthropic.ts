import type { ExecutionControl } from "../../execution-control/src/index";
import {
    LLMConfigurationError,
    type LLMAdapter,
    type LLMConfig,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";
import type { CatalogSource } from "../../model-catalog/src/index";
import {
    generateAnthropicMessages,
    streamAnthropicMessages,
    type AnthropicMessagesConnection,
} from "../../wire-anthropic-messages/src/index";
import { DefaultProviderModelFetcher } from "./catalog-fetchers";
import { ANTHROPIC_MESSAGES_PROTOCOL } from "./protocols";
import type { ProviderAdapterDefinition } from "./registry";
import { readStaticCatalogModels } from "./static-catalog";

/** Anthropic 官方端点前缀；Messages 请求发往其 `messages` 路径。 */
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

/** Anthropic Messages 协议版本头。 */
export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * 创建 Anthropic 官方目录来源。
 *
 * @remarks
 * 静态模型事实来自锁定静态目录；在线发现由本适配器拥有的 fetcher 提供。
 *
 * @returns 可交给 `model-catalog` 的供应商目录来源。
 *
 * @example
 * ```ts
 * const source = createAnthropicCatalogSource();
 * ```
 */
export function createAnthropicCatalogSource(): CatalogSource {
    const fetcher = new DefaultProviderModelFetcher();
    return {
        provider: "anthropic",
        protocol: ANTHROPIC_MESSAGES_PROTOCOL,
        staticModels: readStaticCatalogModels("anthropic"),
        discover: (config, options) => fetcher.fetchModels(config, options),
    };
}

/**
 * 以 Anthropic Messages 线格式执行的供应商适配器。
 *
 * @remarks
 * 与 {@link ChatCompletionsAdapter} 同构：适配器只携带连接事实，请求构造、SSE 事件
 * 映射、thinking 签名续接与错误分类由 `wire-anthropic-messages` 提供。
 * Anthropic 无原生 JSON Schema 约束；`config.nativeStructuredOutput` 不适用，
 * 正文约束由本地契约与 wire 层文本转 JSON 兜底完成。
 *
 * @example
 * ```ts
 * const adapter = new AnthropicMessagesAdapter(connection);
 * const response = await adapter.generate(request);
 * ```
 */
export class AnthropicMessagesAdapter implements LLMAdapter {
    /** 无凭据的原生回放身份；供 Decide 原生路径与历史重建使用。 */
    readonly nativeConversationIdentity: NativeConversationIdentity;

    /** @param connection - 端点、请求头、身份与输出上限事实。 */
    constructor(readonly connection: AnthropicMessagesConnection) {
        this.nativeConversationIdentity = connection.identity;
    }

    /**
     * @param request - 供应商无关的生成请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 归一化后的完整响应。
     */
    generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        return generateAnthropicMessages(this.connection, request, control);
    }

    /**
     * @param request - 供应商无关的生成请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 归一化流事件。
     */
    async *stream(request: LLMRequest, control?: ExecutionControl): AsyncIterable<LLMStreamEvent> {
        yield* streamAnthropicMessages(this.connection, request, control);
    }
}

/**
 * 创建 Anthropic Messages 执行适配器。
 *
 * @param config - 已校验的 Anthropic 连接配置。
 * @returns 通过原生 Messages 线格式执行的适配器。
 * @throws LLMConfigurationError 连接不属于 Anthropic 时抛出。
 *
 * @example
 * ```ts
 * const adapter = createAnthropicAdapter({ provider: "anthropic", apiKey: "secret", model: "claude-sonnet-4-5" });
 * ```
 */
export function createAnthropicAdapter(config: LLMConfig): LLMAdapter {
    if (config.provider !== "anthropic") {
        throw new LLMConfigurationError([], `Provider "${config.provider}" is not the Anthropic adapter`);
    }
    const endpoint = (config.baseURL ?? DEFAULT_ANTHROPIC_BASE_URL).replace(/\/+$/, "");
    return new AnthropicMessagesAdapter({
        url: `${endpoint}/messages`,
        headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
        },
        model: config.model,
        ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
        identity: {
            provider: "anthropic",
            endpoint,
            model: config.model,
            protocol: "anthropic-messages",
        },
    });
}

/**
 * Anthropic 的注册表声明。
 *
 * @returns 供应商标识、协议、目录来源与适配器工厂。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createAnthropicProviderAdapter()]);
 * ```
 */
export function createAnthropicProviderAdapter(): ProviderAdapterDefinition {
    return {
        id: "anthropic",
        protocol: ANTHROPIC_MESSAGES_PROTOCOL,
        catalog: createAnthropicCatalogSource(),
        createAdapter: createAnthropicAdapter,
    };
}
