import type {
    LLMAdapter,
    LLMRequest,
    LLMResponse,
    LLMStreamEvent,
    NativeConversationIdentity,
} from "../../llm-core/src/index";
import type { ExecutionControl } from "../../execution-control/src/index";
import {
    generateChatCompletions,
    streamChatCompletions,
    type ChatCompletionsConnection,
} from "../../wire-chat-completions/src/index";

/**
 * 以 Chat Completions 线格式执行的供应商适配器。
 *
 * @remarks
 * 适配器只提供端点、认证与能力事实；请求构造、SSE 事件映射与协议错误分类由
 * `wire-chat-completions` 提供。不同供应商复用本类，差异留在各自的适配器文件。
 *
 * @example
 * ```ts
 * const adapter = new ChatCompletionsAdapter(connection);
 * const response = await adapter.generate(request);
 * ```
 */
export class ChatCompletionsAdapter implements LLMAdapter {
    /** 无凭据的原生回放身份；供 Decide 原生路径与历史重建使用。 */
    readonly nativeConversationIdentity: NativeConversationIdentity;

    /** @param connection - 端点、请求头、身份与协议能力事实。 */
    constructor(readonly connection: ChatCompletionsConnection) {
        this.nativeConversationIdentity = connection.identity;
    }

    /**
     * @param request - 供应商无关的生成请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 归一化后的完整响应。
     */
    generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        return generateChatCompletions(this.connection, request, control);
    }

    /**
     * @param request - 供应商无关的生成请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 归一化流事件。
     */
    async *stream(request: LLMRequest, control?: ExecutionControl): AsyncIterable<LLMStreamEvent> {
        yield* streamChatCompletions(this.connection, request, control);
    }
}
