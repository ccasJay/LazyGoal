import type { LLMAdapter, LLMRequest, LLMResponse, LLMStreamEvent, NativeConversationIdentity } from "../../llm-core/src/index";
import type { ExecutionControl } from "../../execution-control/src/index";
import {
    generateChatCompletions,
    streamChatCompletions,
    type ChatCompletionsConnection,
} from "../../wire-chat-completions/src/index";

/**
 * 原生 OpenAI Chat Completions 兼容服务的显式连接配置。
 * @remarks 请求的 maxOutputTokens 优先于配置默认值；不额外查询环境凭据。
 * @example
 * ```ts
 * const config: OpenAICompatibleConfig = {
 *     apiKey: "secret", baseURL: "https://api.openai.com/v1", model: "model-id",
 *     maxOutputTokens: 4096,
 * };
 * ```
 */
export interface OpenAICompatibleConfig {
    /** 服务端使用的 API Key。 */
    apiKey: string;
    /** 连接的供应商身份；兼容端点默认为 openai-compatible。 */
    provider?: "openai" | "openai-compatible";
    /** OpenAI API 或兼容服务的基础 URL。 */
    baseURL: string;
    /** 每次生成请求使用的模型名称。 */
    model: string;
    /** 请求未指定上限时使用的最大输出 Token。 */
    maxOutputTokens?: number;
}

/**
 * 使用 Chat Completions 线格式调用兼容端点的 Adapter。
 *
 * @remarks
 * 请求构造、SSE 分帧与协议错误分类由 `wire-chat-completions` 提供，本类只声明端点、认证与
 * 回放策略。`baseURL` 可指向 OpenAI 或实现兼容协议的第三方服务；消息角色和顺序原样映射。
 * 结构化输出、工具调用策略、工具参数约束和流尾用量均由本次 {@link LLMRequest} 声明。
 * 长度截断、内容过滤、错误结束与无法归一化的内容由线格式层拒绝，本类不重发请求或切换协议。
 *
 * @example
 * ```ts
 * const adapter = new OpenAICompatible({
 *     apiKey: "secret", baseURL: "https://api.openai.com/v1",
 *     model: "gpt-4o",
 * });
 * const response = await adapter.generate({ messages: [{ role: "user", content: "你好" }] });
 * ```
 */
export class OpenAICompatible implements LLMAdapter {
    /** 无凭据的原生回放身份。 */
    readonly nativeConversationIdentity: NativeConversationIdentity;
    private readonly connection: ChatCompletionsConnection;

    /** @param config - API Key、兼容端点地址与模型名称。 */
    constructor(config: OpenAICompatibleConfig) {
        const endpoint = config.baseURL.replace(/\/+$/, "");
        const provider = config.provider ?? "openai-compatible";
        this.nativeConversationIdentity = {
            provider,
            endpoint,
            model: config.model,
            protocol: "openai-chat",
        };
        this.connection = {
            url: `${endpoint}/chat/completions`,
            headers: { Authorization: `Bearer ${config.apiKey}` },
            model: config.model,
            ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
            identity: this.nativeConversationIdentity,
            nativeStructuredOutput: true,
            supportsRequiredToolChoice: true,
            replayReasoningExtensions: provider === "openai",
            toolCallIds: provider === "openai"
                ? { generateMissing: "allocate", streamMissing: "allocate" }
                : { generateMissing: "keep", streamMissing: "reject" },
        };
    }

    /**
     * @param request - 供应商无关的消息请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Chat Completions 首个候选归一化后的有序完整内容块。
     * @throws 线格式错误、HTTP 失败或中止异常。
     */
    async generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        return generateChatCompletions(this.connection, request, control);
    }

    /**
     * @param request - 供应商无关的消息请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 与 `generate()` 等价的归一化流事件。
     */
    async *stream(request: LLMRequest, control?: ExecutionControl): AsyncIterable<LLMStreamEvent> {
        yield* streamChatCompletions(this.connection, request, control);
    }
}

/** 响应未以目标协议可接受状态完成的兼容别名。 */
export {
    ChatCompletionsIncompleteError as OpenAIIncompleteResponseError,
    ChatCompletionsRefusalError as OpenAIRefusalError,
} from "../../wire-chat-completions/src/index";
export type {
    ChatCompletionsIncompleteReason as OpenAIIncompleteResponseReason,
} from "../../wire-chat-completions/src/index";
