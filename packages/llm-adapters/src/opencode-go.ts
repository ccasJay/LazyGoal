import {
    LLMConfigurationError,
    type LLMAdapter,
    type LLMConfig,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";
import type { CatalogSource } from "../../model-catalog/src/index";
import { ChatCompletionsAdapter } from "./chat-completions-adapter";
import { DefaultProviderModelFetcher } from "./catalog-fetchers";
import { CHAT_COMPLETIONS_PROTOCOL } from "./protocols";
import type { ProviderAdapterDefinition } from "./registry";
import { readStaticCatalogModels } from "./static-catalog";

/** LazyGoal 自有 User-Agent；替代供应商默认标识。 */
export const LAZYGOAL_USER_AGENT = "lazygoal";

/** OpenCode Go 的 OpenAI Chat Completions 端点前缀。 */
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go/openai/v1";

/** OpenCode Go 的稳定会话头。 */
export const OPENCODE_GO_SESSION_HEADER = "x-opencode-session";

/**
 * 创建 OpenCode Go 目录来源。
 *
 * @remarks
 * 在线模型必须提供容量与工具能力才可选；端点与认证归本适配器。
 *
 * @returns 静态模型事实与在线发现。
 *
 * @example
 * ```ts
 * const source = createOpenCodeGoCatalogSource();
 * ```
 */
export function createOpenCodeGoCatalogSource(): CatalogSource {
    const fetcher = new DefaultProviderModelFetcher();
    return {
        provider: "opencode-go",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        staticModels: readStaticCatalogModels("opencode-go"),
        requireLiveCapacity: true,
        discover: (config, options) => fetcher.fetchModels(config, options),
    };
}

/**
 * 创建 OpenCode Go 执行适配器。
 *
 * @remarks
 * 端点固定由适配器拥有，不接受调用方覆盖。请求始终携带 LazyGoal User-Agent；
 * 提供 `sessionId` 时写入稳定会话头。本期所有模型统一通过 Chat Completions 端点执行。
 *
 * @param config - 已校验的 OpenCode Go 连接配置。
 * @returns 通过 Chat Completions 线格式执行的适配器。
 * @throws LLMConfigurationError 连接不属于 OpenCode Go 时抛出。
 *
 * @example
 * ```ts
 * const adapter = createOpenCodeGoAdapter({ provider: "opencode-go", apiKey: "secret", model: "beam-free" });
 * ```
 */
export function createOpenCodeGoAdapter(config: LLMConfig): LLMAdapter {
    if (config.provider !== "opencode-go") {
        throw new LLMConfigurationError([], `Provider "${config.provider}" is not the OpenCode Go adapter`);
    }
    const identity: NativeConversationIdentity = {
        provider: "openai-compatible",
        endpoint: OPENCODE_GO_BASE_URL,
        model: config.model,
        protocol: "openai-chat",
    };
    const supportsRequiredToolChoice = "supportsRequiredToolChoice" in config
        ? config.supportsRequiredToolChoice !== false
        : true;
    return new ChatCompletionsAdapter({
        url: `${OPENCODE_GO_BASE_URL}/chat/completions`,
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "User-Agent": LAZYGOAL_USER_AGENT,
        },
        model: config.model,
        ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
        identity,
        nativeStructuredOutput: false,
        supportsRequiredToolChoice,
        sessionHeader: OPENCODE_GO_SESSION_HEADER,
    });
}

/**
 * OpenCode Go 的注册表声明。
 *
 * @returns 供应商标识、协议、目录来源与适配器工厂。
 *
 * @example
 * ```ts
 * const registry = createProviderRegistry([createOpenCodeGoProviderAdapter()]);
 * ```
 */
export function createOpenCodeGoProviderAdapter(): ProviderAdapterDefinition {
    return {
        id: "opencode-go",
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        catalog: createOpenCodeGoCatalogSource(),
        createAdapter: createOpenCodeGoAdapter,
    };
}
