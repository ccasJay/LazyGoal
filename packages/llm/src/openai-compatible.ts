import { sameNativeIdentity, type NativeConversationIdentity } from "../../model-contracts/src/index";
import OpenAI from "openai";
import type { LLMAdapter } from "./core/adapter";
import {
    LLMRequestModeMismatchError,
    type LLMMessage,
    type LLMRequest,
    type LLMResponse,
    type LLMToolCall,
} from "./core/types";
import type { StructuredOutputMode } from "../../config/src/index";
import { extractOpenAIUsage } from "./core/usage";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import { classifyTransientModelFailure } from "./core/model-request-failure";

/**
 * 原生 OpenAI Chat Completions 兼容服务的显式连接配置。
 * @remarks 请求的 maxOutputTokens 优先于配置默认值；不额外查询环境凭据。
 * @example
 * ```ts
 * const config: OpenAICompatibleConfig = {
 *     apiKey: "secret", baseURL: "https://api.openai.com/v1", model: "model-id",
 *     structuredOutputMode: "strict", maxOutputTokens: 4096,
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
    /** 固定的结构化输出模式。 */
    structuredOutputMode: StructuredOutputMode;
    /** 请求未指定上限时使用的最大输出 Token。 */
    maxOutputTokens?: number;
}

/**
 * 使用 OpenAI SDK 调用 Chat Completions 兼容端点的 Adapter。
 *
 * @remarks
 * `baseURL` 可指向 OpenAI 或实现兼容协议的第三方服务。消息角色和顺序会
 * 原样映射；响应没有文本内容时返回空字符串，SDK 异常原样传播。
 * 在 strict 模式下将结构 Schema 原样映射为 `response_format.json_schema` 且 `strict: true`；
 * 在 prompt_only 模式下不传递任何原生结构 Schema 参数。
 * 若请求的结构化配置与 Adapter 固定模式不匹配，在发起网络请求前抛出 `LLMRequestModeMismatchError`。
 * 响应携带 `usage` 时将其归一化写入 `providerMetadata.usage`
 * （`{ inputTokens, outputTokens, cachedInputTokens? }`），缺失时该字段缺省。
 */
export class OpenAICompatible implements LLMAdapter {
    readonly structuredOutputMode: StructuredOutputMode;
    /** 无凭据的原生回放身份。 */
    readonly nativeConversationIdentity: NativeConversationIdentity;
    private readonly client: OpenAI;
    private readonly model: string;
    private readonly maxOutputTokens: number | undefined;

    /** @param config - API Key、兼容端点地址、模型名称与固定的结构化输出模式。 */
    constructor (config: OpenAICompatibleConfig){
        this.structuredOutputMode = config.structuredOutputMode;
        this.nativeConversationIdentity = {
            provider: config.provider ?? "openai-compatible", endpoint: config.baseURL.replace(/\/+$/, ""),
            model: config.model, protocol: "openai-chat",
        };
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            maxRetries: 0,
        });
        this.model = config.model;
        this.maxOutputTokens = config.maxOutputTokens;
    }

    /**
     * @param _request - 供应商无关的消息请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Chat Completions 首个候选的文本内容。
     * @throws OpenAI SDK 暴露的网络、鉴权、限流或协议异常；中止时抛出
     *   `ExecutionAbortedError`；请求参数模式不匹配时抛出 `LLMRequestModeMismatchError`。
     */
    async generate(
        _request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        throwIfAborted(control);

        if (_request.tools === undefined && this.structuredOutputMode === "strict") {
            if (_request.structuredOutput === undefined) {
                throw new LLMRequestModeMismatchError(
                    "OpenAICompatible adapter is configured with 'strict' mode, but LLMRequest does not provide structuredOutput",
                );
            }
        } else if (this.structuredOutputMode === "prompt_only") {
            if (_request.structuredOutput !== undefined) {
                throw new LLMRequestModeMismatchError(
                    "OpenAICompatible adapter is configured with 'prompt_only' mode, but LLMRequest provides structuredOutput",
                );
            }
        }

        const messages = toOpenAIMessages(_request.messages, this.nativeConversationIdentity);
        const maxOutputTokens = _request.maxOutputTokens ?? this.maxOutputTokens;

        try {
            const hasTools = _request.tools !== undefined && _request.tools.length > 0;
            const request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
                model: this.model,
                messages,
                ...(maxOutputTokens !== undefined
                    ? { max_tokens: maxOutputTokens }
                    : {}),
                ...((this.structuredOutputMode === "strict" || this.structuredOutputMode === "two_stage") && _request.structuredOutput !== undefined && !hasTools
                    ? {
                        response_format: {
                            type: "json_schema" as const,
                            json_schema: {
                                name: _request.structuredOutput.name,
                                schema: _request.structuredOutput.schema as Record<string, unknown>,
                                strict: true,
                            },
                        },
                    }
                    : {}),
                ...(hasTools
                    ? {
                        tools: _request.tools!.map(tool => ({
                            type: "function" as const,
                            function: {
                                name: tool.id,
                                description: tool.description,
                                parameters: tool.parametersSchema,
                                strict: true,
                            },
                        })),
                        tool_choice: _request.toolChoice ?? "required",
                        parallel_tool_calls: false,
                    }
                    : {}),
            };
            const response = control?.signal === undefined
                ? await this.client.chat.completions.create(request)
                : await this.client.chat.completions.create(
                    request,
                    { signal: control.signal },
                );
            throwIfAborted(control);
            const choice = response.choices[0];
            const message = choice?.message;
            const usage = extractOpenAIUsage(response.usage);

            const textContent = message?.content ?? "";
            const extended = message as typeof message & { reasoning_content?: string; thought?: string };
            const reasoningContent = extended?.reasoning_content;
            const reasoning = reasoningContent ?? extended?.thought;

            const toolCalls: LLMToolCall[] | undefined = message?.tool_calls?.map(tc => {
                const func = "function" in tc ? tc.function : (tc as any).function;
                return {
                    callId: tc.id,
                    toolId: func?.name ?? "",
                    argumentsJson: func?.arguments ?? "{}",
                };
            });

            return {
                content: textContent,
                ...(reasoning === undefined ? {} : { reasoning }),
                continuation: {
                    identity: this.nativeConversationIdentity,
                    ...(reasoningContent === undefined ? {} : { reasoningContent }),
                },
                ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
                providerMetadata: {
                    requestId: response.id,
                    model: response.model,
                    created: response.created,
                    finishReason: choice?.finish_reason ?? null,
                    ...(usage !== undefined ? { usage } : {}),
                },
            };
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            const transientFailure = classifyTransientModelFailure(error);
            if (transientFailure !== undefined) throw transientFailure;

            throw error;
        }
    }
}
/** 将统一消息按原顺序转换为 OpenAI Chat Completions 消息。 */
function toOpenAIMessages(
    messages: readonly LLMMessage[],
    identity: NativeConversationIdentity,
): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(message => {
        if (message.role === "tool") return {
            role: "tool", tool_call_id: message.callId, content: message.content,
        };
        if (message.role !== "assistant") return { role: message.role, content: message.content };
        if (message.continuation !== undefined && !sameNativeIdentity(message.continuation.identity, identity)) {
            throw new LLMRequestModeMismatchError("Native history belongs to another provider, endpoint, model or protocol");
        }
        return {
            role: "assistant", content: message.content,
            ...(message.toolCalls === undefined ? {} : { tool_calls: message.toolCalls.map(call => ({
                id: call.callId, type: "function" as const, function: { name: call.toolId, arguments: call.argumentsJson },
            })) }),
            ...(message.continuation?.reasoningContent === undefined ? {} : {
                reasoning_content: message.continuation.reasoningContent,
            }),
        };
    });
}
