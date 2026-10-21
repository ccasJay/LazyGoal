import { sameNativeIdentity, type NativeConversationIdentity } from "../../model-contracts/src/index";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";

import {
    LLMRequestModeMismatchError,
    classifyTransientModelFailure,
    type LLMAdapter,
    type LLMContentBlock,
    type LLMMessage,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type LLMTextBlockFormat,
    type LLMToolCall,
    type StructuredOutputMode,
} from "../../llm-core/src/index";
import { extractOpenAIUsage } from "./usage";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";

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
 * 原样映射；响应按真实字段与分片归一化为有序完整内容块，SDK 异常原样传播。
 * 在 strict 模式下将结构 Schema 原样映射为 `response_format.json_schema` 且 `strict: true`；
 * 在 prompt_only 模式下不传递任何原生结构 Schema 参数。
 * 若请求的结构化配置与 Adapter 固定模式不匹配，在发起网络请求前抛出 `LLMRequestModeMismatchError`。
 * 响应携带 `usage` 时将其归一化写入 `providerMetadata.usage`
 * （`{ inputTokens, outputTokens, cachedInputTokens? }`），缺失时该字段缺省。
 * 长度截断、内容过滤、错误结束与无法归一化的内容抛出 `OpenAIIncompleteResponseError`，
 * 既不重发请求也不切换到其它协议或非流式路径。
 *
 * @example
 * ```ts
 * const adapter = new OpenAICompatible({
 *     apiKey: "secret", baseURL: "https://api.openai.com/v1",
 *     model: "gpt-4o", structuredOutputMode: "prompt_only",
 * });
 * const response = await adapter.generate({ messages: [{ role: "user", content: "你好" }] });
 * ```
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
     * @returns Chat Completions 首个候选归一化后的有序完整内容块。
     * @throws OpenAI SDK 暴露的网络、鉴权、限流或协议异常；截断或内容过滤响应抛出
     *   `OpenAIIncompleteResponseError`；中止时抛出 `ExecutionAbortedError`；
     *   请求参数模式不匹配时抛出 `LLMRequestModeMismatchError`。
     */
    async generate(
        _request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        throwIfAborted(control);
        this.assertRequestMode(_request);
        const payload = this.buildPayload(_request, toOpenAIMessages(_request.messages, this.nativeConversationIdentity));

        try {
            const response = control?.signal === undefined
                ? await this.client.chat.completions.create(payload)
                : await this.client.chat.completions.create(payload, { signal: control.signal });
            throwIfAborted(control);
            const choice = response.choices[0];
            const message = choice?.message;
            const extended = message as typeof message & { reasoning_content?: string; thought?: string } | undefined;
            const reasoningContent = extended?.reasoning_content;
            const reasoning = reasoningContent ?? extended?.thought;
            const finishReason = choice?.finish_reason ?? null;
            assertAcceptedFinishReason(finishReason);
            const usage = extractOpenAIUsage(response.usage);

            return {
                blocks: toCompletionBlocks({
                    text: readProviderText(message?.content, "message content"),
                    ...(reasoning === undefined ? {} : { reasoning }),
                    toolCalls: (message?.tool_calls ?? []).map(tc => {
                        const func = "function" in tc ? tc.function : (tc as any).function;
                        return {
                            callId: tc.id.length > 0 ? tc.id : `call_${randomUUID()}`,
                            toolId: func?.name ?? "",
                            argumentsJson: func?.arguments ?? "{}",
                        };
                    }),
                    textFormat: this.textFormat(_request),
                }),
                continuation: {
                    identity: this.nativeConversationIdentity,
                    ...(reasoningContent === undefined ? {} : { reasoningContent }),
                },
                providerMetadata: {
                    requestId: response.id,
                    model: response.model,
                    created: response.created,
                    finishReason,
                    ...(usage !== undefined ? { usage } : {}),
                },
            };
        } catch (error) {
            throw this.classifyFailure(error, control);
        }
    }

    /**
     * 以真实 Chat Completions 流交付有序块事件，并在正常 EOF 后给出最终响应。
     *
     * @remarks
     * 请求构造与 `generate()` 共享；正文与 reasoning 按首次出现累积为独立块，工具调用按供应商
     * 索引累计原始参数分片。流只有在收齐合法结束原因（并请求用量尾部）后才产生 `completed`；
     * 截断、内容过滤、异常 EOF 或无法归一化的内容在供应商边界拒绝，不切换到非流式重发。
     *
     * @param request - 供应商无关的消息请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 带真实分片边界的块事件与唯一成功完成。
     */
    async *stream(
        request: LLMRequest,
        control?: ExecutionControl,
    ): AsyncIterable<LLMStreamEvent> {
        throwIfAborted(control);
        this.assertRequestMode(request);
        const payload = this.buildPayload(request, toOpenAIMessages(request.messages, this.nativeConversationIdentity));
        const textFormat = this.textFormat(request);
        yield { kind: "started" };

        try {
            const sdkStream = control?.signal === undefined
                ? await this.client.chat.completions.create({ ...payload, stream: true, stream_options: { include_usage: true } })
                : await this.client.chat.completions.create(
                    { ...payload, stream: true, stream_options: { include_usage: true } },
                    { signal: control.signal },
                );

            let nextIndex = 0;
            let text: { readonly index: number; text: string } | undefined;
            let reasoning: { readonly index: number; text: string } | undefined;
            const toolBlocks = new Map<number, { readonly index: number; callId: string; toolId: string; argumentsJson: string }>();
            let finishReason: string | null = null;
            let sawChunk = false;
            let requestId: string | undefined;
            let model: string | undefined;
            let created: number | undefined;
            let usage: ReturnType<typeof extractOpenAIUsage>;

            const iterator = sdkStream[Symbol.asyncIterator]();
            let primaryError: unknown;
            try {
                while (true) {
                    const next = await iterator.next();
                    if (next.done === true) break;
                    throwIfAborted(control);
                    const chunk = next.value;
                    sawChunk = true;
                    requestId ??= chunk.id;
                    model ??= chunk.model;
                    created ??= chunk.created;
                    usage = extractOpenAIUsage(chunk.usage) ?? usage;
                    const choice = chunk.choices[0];
                    const delta = choice?.delta;
                    if (choice?.finish_reason !== undefined && choice.finish_reason !== null) finishReason = choice.finish_reason;

                    const deltaText = readProviderText(delta?.content, "stream content delta");
                    if (deltaText.length > 0) {
                        if (text === undefined) {
                            text = { index: nextIndex++, text: "" };
                            yield { kind: "content_block_started", index: text.index, blockType: "text", delivery: "incremental", format: textFormat };
                        }
                        text.text += deltaText;
                        yield { kind: "content_block_delta", index: text.index, deltaKind: "text", delta: deltaText };
                    }

                    const extended = delta as typeof delta & { reasoning_content?: unknown; thought?: unknown } | undefined;
                    const reasoningDelta = readProviderText(extended?.reasoning_content ?? extended?.thought, "stream reasoning delta");
                    if (reasoningDelta.length > 0) {
                        if (reasoning === undefined) {
                            reasoning = { index: nextIndex++, text: "" };
                            yield { kind: "content_block_started", index: reasoning.index, blockType: "reasoning", delivery: "incremental" };
                        }
                        reasoning.text += reasoningDelta;
                        yield { kind: "content_block_delta", index: reasoning.index, deltaKind: "reasoning", delta: reasoningDelta };
                    }

                    for (const call of delta?.tool_calls ?? []) {
                        let block = toolBlocks.get(call.index);
                        if (block === undefined) {
                            block = { index: nextIndex++, callId: "", toolId: "", argumentsJson: "" };
                            toolBlocks.set(call.index, block);
                            yield { kind: "content_block_started", index: block.index, blockType: "tool_call", delivery: "incremental" };
                        }
                        const func = "function" in call ? call.function : (call as any).function;
                        if (typeof call.id === "string" && call.id.length > 0) block.callId = call.id;
                        if (typeof func?.name === "string" && func.name.length > 0) block.toolId = func.name;
                        const argumentsDelta = readProviderText(func?.arguments, "stream tool arguments");
                        if (argumentsDelta.length > 0) {
                            block.argumentsJson += argumentsDelta;
                            yield { kind: "content_block_delta", index: block.index, deltaKind: "tool_arguments", delta: argumentsDelta };
                        }
                    }
                }

            } catch (error) {
                primaryError = error;
            } finally {
                // 释放本次拥有的迭代器；清理异常不覆盖主失败原因。
                await releaseSdkIterator(iterator);
            }
            if (primaryError !== undefined) throw primaryError;

            throwIfAborted(control);
            if (!sawChunk) throw new OpenAIIncompleteResponseError("Chat Completions stream produced no chunks");
            if (finishReason === null) {
                throw new OpenAIIncompleteResponseError("Chat Completions stream ended without a valid finish reason");
            }
            assertAcceptedFinishReason(finishReason);

            const orderedBlocks: LLMContentBlock[] = [];
            if (text !== undefined && text.text.length > 0) {
                orderedBlocks.push({ index: text.index, type: "text", format: textFormat, text: text.text });
            }
            if (reasoning !== undefined && reasoning.text.length > 0) {
                orderedBlocks.push({ index: reasoning.index, type: "reasoning", text: reasoning.text });
            }
            for (const block of toolBlocks.values()) {
                orderedBlocks.push({
                    index: block.index, type: "tool_call",
                    callId: block.callId.length > 0 ? block.callId : `call_${randomUUID()}`,
                    toolId: block.toolId,
                    argumentsJson: block.argumentsJson,
                });
            }
            orderedBlocks.sort((left, right) => left.index - right.index);

            for (const block of orderedBlocks) {
                yield { kind: "content_block_completed", delivery: "incremental", block };
            }
            yield {
                kind: "completed",
                response: {
                    blocks: orderedBlocks,
                    continuation: {
                        identity: this.nativeConversationIdentity,
                        ...(reasoning === undefined ? {} : { reasoningContent: reasoning.text }),
                    },
                    providerMetadata: {
                        ...(requestId === undefined ? {} : { requestId }),
                        ...(model === undefined ? {} : { model }),
                        ...(created === undefined ? {} : { created }),
                        finishReason,
                        ...(usage === undefined ? {} : { usage }),
                    },
                },
            };
        } catch (error) {
            throw this.classifyFailure(error, control);
        }
    }

    private assertRequestMode(request: LLMRequest): void {
        if (request.tools === undefined && this.structuredOutputMode === "strict") {
            if (request.structuredOutput === undefined) {
                throw new LLMRequestModeMismatchError(
                    "OpenAICompatible adapter is configured with 'strict' mode, but LLMRequest does not provide structuredOutput",
                );
            }
        } else if (this.structuredOutputMode === "prompt_only") {
            if (request.structuredOutput !== undefined) {
                throw new LLMRequestModeMismatchError(
                    "OpenAICompatible adapter is configured with 'prompt_only' mode, but LLMRequest provides structuredOutput",
                );
            }
        }
    }

    private textFormat(request: LLMRequest): LLMTextBlockFormat {
        const hasTools = request.tools !== undefined && request.tools.length > 0;
        return request.structuredOutput !== undefined && !hasTools ? "json" : "plain";
    }

    /** 共享请求构造：流式与非流式只差 stream 与用量尾部参数。 */
    private buildPayload(
        request: LLMRequest,
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
    ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
        const hasTools = request.tools !== undefined && request.tools.length > 0;
        const maxOutputTokens = request.maxOutputTokens ?? this.maxOutputTokens;
        return {
            model: this.model,
            messages,
            ...(maxOutputTokens !== undefined
                ? { max_tokens: maxOutputTokens }
                : {}),
            ...((this.structuredOutputMode === "strict" || this.structuredOutputMode === "two_stage") && request.structuredOutput !== undefined && !hasTools
                ? {
                    response_format: {
                        type: "json_schema" as const,
                        json_schema: {
                            name: request.structuredOutput.name,
                            schema: request.structuredOutput.schema as Record<string, unknown>,
                            strict: true,
                        },
                    },
                }
                : {}),
            ...(hasTools
                ? {
                    tools: request.tools!.map(tool => ({
                        type: "function" as const,
                        function: {
                            name: tool.id,
                            description: tool.description,
                            parameters: tool.parametersSchema,
                            strict: true,
                        },
                    })),
                    tool_choice: request.toolChoice ?? "required",
                    parallel_tool_calls: false,
                }
                : {}),
        };
    }

    private classifyFailure(error: unknown, control: ExecutionControl | undefined): unknown {
        if (isExecutionAbortedError(error)) return error;
        if (control?.signal?.aborted) return new ExecutionAbortedError();
        const transientFailure = classifyTransientModelFailure(error);
        return transientFailure ?? error;
    }
}

/**
 * Chat Completions 响应未以可接受方式完成。
 *
 * @remarks
 * 长度截断、内容过滤、无有效结束的 EOF 或无法归一化的内容在供应商边界抛出；
 * 非暂时故障，不触发适配器内部重试或协议降级。
 *
 * @example
 * ```ts
 * throw new OpenAIIncompleteResponseError("Chat Completions response was truncated (length)");
 * ```
 */
export class OpenAIIncompleteResponseError extends Error {
    readonly code = "OPENAI_INCOMPLETE_RESPONSE";

    constructor(message: string) {
        super(message);
        this.name = "OpenAIIncompleteResponseError";
    }
}

/** 拒绝供应商明确报告的截断、安全过滤与错误结束；其余结束原因由调用方判定。 */
function assertAcceptedFinishReason(finishReason: string | null): void {
    if (finishReason !== "length" && finishReason !== "content_filter" && finishReason !== "error") return;
    throw new OpenAIIncompleteResponseError(
        `Chat Completions response did not complete normally (${finishReason})`,
    );
}

/** 尽力释放供应商流迭代器；清理异常按观察通道隔离。 */
async function releaseSdkIterator(iterator: AsyncIterator<unknown>): Promise<void> {
    if (iterator.return === undefined) return;
    try {
        await iterator.return();
    } catch {
        // 迭代清理失败不改变调用方的主错误。
    }
}

/** 在供应商边界读取文本字段；非字符串内容（多模态或其他 Part）明确拒绝。 */
function readProviderText(value: unknown, label: string): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    throw new OpenAIIncompleteResponseError(`Chat Completions ${label} contained an unsupported part`);
}

/** 按正文、公开 reasoning、工具数组的固定顺序映射非流式完整响应块。 */
function toCompletionBlocks(input: {
    readonly text: string;
    readonly reasoning?: string;
    readonly toolCalls: readonly LLMToolCall[];
    readonly textFormat: LLMTextBlockFormat;
}): LLMContentBlock[] {
    const blocks: LLMContentBlock[] = [];
    if (input.text.length > 0) blocks.push({ index: blocks.length, type: "text", format: input.textFormat, text: input.text });
    if (input.reasoning !== undefined && input.reasoning.length > 0) blocks.push({ index: blocks.length, type: "reasoning", text: input.reasoning });
    for (const call of input.toolCalls) blocks.push({ index: blocks.length, type: "tool_call", ...call });
    return blocks;
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
