import OpenAI from "openai";
import type { LLMAdapter } from "./core/adapter";
import type { LLMMessage, LLMRequest, LLMResponse } from "./core/types";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";

/** OpenAI Chat Completions 兼容服务的连接配置。 */
export interface OpenAICompatibleConfig {
    /** 服务端使用的 API Key。 */
    apiKey: string;
    /** OpenAI API 或兼容服务的基础 URL。 */
    baseURL: string;
    /** 每次生成请求使用的模型名称。 */
    model: string;
}

/**
 * 使用 OpenAI SDK 调用 Chat Completions 兼容端点的 Adapter。
 *
 * @remarks
 * `baseURL` 可指向 OpenAI 或实现兼容协议的第三方服务。消息角色和顺序会
 * 原样映射；响应没有文本内容时返回空字符串，SDK 异常原样传播。
 */
export class OpenAICompatible implements LLMAdapter {
    private readonly client: OpenAI;
    private readonly model: string;

    /** @param config - API Key、兼容端点地址与模型名称。 */
    constructor (config: OpenAICompatibleConfig){
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
        });
        this.model = config.model;
    }

    /**
     * @param _request - 供应商无关的消息请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Chat Completions 首个候选的文本内容。
     * @throws OpenAI SDK 暴露的网络、鉴权、限流或协议异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    async generate(
        _request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        throwIfAborted(control);
        const messages = toOpenAIMessages(_request.messages);

        try {
            const request = { model: this.model, messages };
            const response = control?.signal === undefined
                ? await this.client.chat.completions.create(request)
                : await this.client.chat.completions.create(
                    request,
                    { signal: control.signal },
                );
            throwIfAborted(control);
            const choice = response.choices[0];

            return {
                content: choice?.message.content ?? "",
                providerMetadata: {
                    requestId: response.id,
                    model: response.model,
                    created: response.created,
                    finishReason: choice?.finish_reason ?? null,
                },
            };
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            throw error;
        }
    }
}
/** 将统一消息按原顺序转换为 OpenAI Chat Completions 消息。 */
function toOpenAIMessages(
    messages: LLMMessage[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
        switch (msg.role) {
            case "system":
                return {
                    role: "system",
                    content: msg.content,
                };
            case "user":
                return {
                    role: "user",
                    content: msg.content,
                };
            case "assistant":
                return {
                    role: "assistant",
                    content: msg.content,
                };
            // case for tool todo
        }
    });
    
}
