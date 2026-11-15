import {
    readModelAssistantReasoning,
    readModelAssistantText,
    readModelToolCalls,
    sameNativeIdentity,
    type NativeConversationIdentity,
} from "../../model-contracts/src/index";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";

import {
    LLMRequestModeMismatchError,
    classifyContextWindowRejection,
    classifyTransientModelFailure,
    type LLMAdapter,
    type LLMContentBlock,
    type LLMMessage,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type LLMTextBlockFormat,
    type LLMToolCall,
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
 * 使用 OpenAI SDK 调用 Chat Completions 兼容端点的 Adapter。
 *
 * @remarks
 * `baseURL` 可指向 OpenAI 或实现兼容协议的第三方服务。消息角色和顺序会
 * 原样映射；响应按真实字段与分片归一化为有序完整内容块，SDK 异常原样传播。
 * 结构化输出、工具调用策略、工具参数约束和流尾用量均由本次 {@link LLMRequest} 声明；未声明时遵循 Chat Completions 默认行为。
 * 响应携带 `usage` 时将其归一化写入 `providerMetadata.usage`
 * （`{ inputTokens, outputTokens, cachedInputTokens? }`），缺失时该字段缺省。
 * 长度截断、内容过滤、错误结束与无法归一化的内容抛出 `OpenAIIncompleteResponseError`，
 * 既不重发请求也不切换到其它协议或非流式路径。
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
    private readonly client: OpenAI;
    private readonly model: string;
    private readonly maxOutputTokens: number | undefined;

    /** @param config - API Key、兼容端点地址与模型名称。 */
    constructor (config: OpenAICompatibleConfig){
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
     *   原生历史 provider、端点、模型或协议身份不匹配时抛出 `LLMRequestModeMismatchError`。
     */
    async generate(
        _request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        throwIfAborted(control);
        const payload = this.buildPayload(_request, toOpenAIMessages(_request.messages, this.nativeConversationIdentity));

        try {
            const response = control?.signal === undefined
                ? await this.client.chat.completions.create(payload)
                : await this.client.chat.completions.create(payload, { signal: control.signal });
            throwIfAborted(control);
            const choice = response.choices[0];
            const message = choice?.message;
            const extended = message as typeof message & { reasoning_content?: string; thought?: string; refusal?: string | null } | undefined;
            if (typeof extended?.refusal === "string" && extended.refusal.length > 0) throw new OpenAIRefusalError();
            const reasoningContent = extended?.reasoning_content;
            const thought = extended?.thought;
            const finishReason = choice?.finish_reason ?? null;
            const toolCalls = (message?.tool_calls ?? []).map(tc => {
                const func = "function" in tc ? tc.function : (tc as any).function;
                return {
                    callId: this.nativeConversationIdentity.provider === "openai-compatible" && tc.id.length === 0
                        ? ""
                        : tc.id.length > 0 ? tc.id : `call_${randomUUID()}`,
                    toolId: func?.name ?? "",
                    argumentsJson: func?.arguments ?? "{}",
                };
            });
            if (_request.acceptedFinishReasons !== undefined && toolCalls.some(call => call.callId.length === 0)) {
                throw new OpenAIIncompleteResponseError("Chat Completions tool call ended without a provider call ID", "missing_tool_call_id");
            }
            assertAcceptedFinishReason(finishReason, _request.acceptedFinishReasons, toolCalls.length);
            const usage = extractOpenAIUsage(response.usage);

            return {
                blocks: toCompletionBlocks({
                    text: readProviderText(message?.content, "message content"),
                    ...(reasoningContent === undefined && thought === undefined ? {} : {
                        reasoning: [
                            ...(reasoningContent === undefined ? [] : [{ source: "reasoning_content" as const, text: reasoningContent }]),
                            ...(thought === undefined ? [] : [{ source: "thought" as const, text: thought }]),
                        ],
                    }),
                    toolCalls,
                    textFormat: this.textFormat(_request),
                }),
                continuation: {
                    identity: this.nativeConversationIdentity,
                    ...(this.nativeConversationIdentity.provider === "openai" && reasoningContent !== undefined ? { reasoningContent } : {}),
                    ...(this.nativeConversationIdentity.provider === "openai" && thought !== undefined ? { thought } : {}),
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
        const payload = this.buildPayload(request, toOpenAIMessages(request.messages, this.nativeConversationIdentity));
        const textFormat = this.textFormat(request);
        yield { kind: "started" };

        try {
            const sdkStream = control?.signal === undefined
                ? await this.client.chat.completions.create({
                    ...payload,
                    stream: true,
                    ...(request.includeUsage === true ? { stream_options: { include_usage: true } } : {}),
                })
                : await this.client.chat.completions.create(
                    {
                        ...payload,
                        stream: true,
                        ...(request.includeUsage === true ? { stream_options: { include_usage: true } } : {}),
                    },
                    { signal: control.signal },
                );

            let nextIndex = 0;
            let text: { readonly index: number; text: string } | undefined;
            let reasoningContent: { readonly index: number; text: string } | undefined;
            let thought: { readonly index: number; text: string } | undefined;
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
                    if (request.acceptedFinishReasons !== undefined && finishReason !== null && chunk.choices.length > 0) {
                        throw new OpenAIIncompleteResponseError("Chat Completions stream emitted content after its finish reason", "duplicate_finish_reason");
                    }
                    requestId ??= chunk.id;
                    model ??= chunk.model;
                    created ??= chunk.created;
                    usage = extractOpenAIUsage(chunk.usage) ?? usage;
                    const choice = chunk.choices[0];
                    const delta = choice?.delta;
                    if (choice?.finish_reason !== undefined && choice.finish_reason !== null) {
                        if (finishReason !== null && request.acceptedFinishReasons !== undefined) {
                            throw new OpenAIIncompleteResponseError("Chat Completions stream contained multiple finish reasons", "duplicate_finish_reason");
                        }
                        finishReason = choice.finish_reason;
                    }

                    const deltaText = readProviderText(delta?.content, "stream content delta");
                    if (deltaText.length > 0) {
                        if (text === undefined) {
                            text = { index: nextIndex++, text: "" };
                            yield { kind: "content_block_started", index: text.index, blockType: "text", delivery: "incremental", format: textFormat };
                        }
                        text.text += deltaText;
                        yield { kind: "content_block_delta", index: text.index, deltaKind: "text", delta: deltaText };
                    }

                    const extended = delta as typeof delta & { reasoning_content?: unknown; thought?: unknown; refusal?: unknown } | undefined;
                    if (typeof extended?.refusal === "string" && extended.refusal.length > 0) throw new OpenAIRefusalError();
                    const reasoningDelta = readProviderText(extended?.reasoning_content, "stream reasoning delta");
                    if (reasoningDelta.length > 0) {
                        if (reasoningContent === undefined) {
                            reasoningContent = { index: nextIndex++, text: "" };
                            yield { kind: "content_block_started", index: reasoningContent.index, blockType: "reasoning", delivery: "incremental" };
                        }
                        reasoningContent.text += reasoningDelta;
                        yield { kind: "content_block_delta", index: reasoningContent.index, deltaKind: "reasoning", delta: reasoningDelta };
                    }
                    const thoughtDelta = readProviderText(extended?.thought, "stream thought delta");
                    if (thoughtDelta.length > 0) {
                        if (thought === undefined) {
                            thought = { index: nextIndex++, text: "" };
                            yield { kind: "content_block_started", index: thought.index, blockType: "reasoning", delivery: "incremental" };
                        }
                        thought.text += thoughtDelta;
                        yield { kind: "content_block_delta", index: thought.index, deltaKind: "reasoning", delta: thoughtDelta };
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
            if (!sawChunk) throw new OpenAIIncompleteResponseError("Chat Completions stream produced no chunks", "empty_stream");
            if (finishReason === null) {
                throw new OpenAIIncompleteResponseError("Chat Completions stream ended without a valid finish reason", "missing_finish_reason");
            }
            assertAcceptedFinishReason(finishReason, request.acceptedFinishReasons, toolBlocks.size);
            if (request.acceptedFinishReasons !== undefined
                && [...toolBlocks.values()].some(block => block.callId.length === 0)) {
                throw new OpenAIIncompleteResponseError("Chat Completions tool call ended without a provider call ID", "missing_tool_call_id");
            }

            const orderedBlocks: LLMContentBlock[] = [];
            if (text !== undefined && text.text.length > 0) {
                orderedBlocks.push({ index: text.index, type: "text", format: textFormat, text: text.text });
            }
            if (reasoningContent !== undefined && reasoningContent.text.length > 0) {
                orderedBlocks.push({ index: reasoningContent.index, type: "reasoning", source: "reasoning_content", text: reasoningContent.text });
            }
            if (thought !== undefined && thought.text.length > 0) {
                orderedBlocks.push({ index: thought.index, type: "reasoning", source: "thought", text: thought.text });
            }
            for (const block of toolBlocks.values()) {
                if (this.nativeConversationIdentity.provider === "openai-compatible" && block.callId.length === 0) {
                    throw new OpenAIIncompleteResponseError("Chat Completions tool call ended without a provider call ID", "missing_tool_call_id");
                }
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
                        ...(this.nativeConversationIdentity.provider === "openai" && reasoningContent !== undefined
                            ? { reasoningContent: reasoningContent.text }
                            : {}),
                        ...(this.nativeConversationIdentity.provider === "openai" && thought !== undefined
                            ? { thought: thought.text }
                            : {}),
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
            ...(request.structuredOutput !== undefined && !hasTools
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
                            ...(request.toolArgumentConstraint === "strict" ? { strict: true } : {}),
                        },
                    })),
                    tool_choice: request.toolChoice ?? "auto",
                    ...(request.parallelToolCalls === undefined ? {} : { parallel_tool_calls: request.parallelToolCalls }),
                }
                : {}),
        };
    }

    private classifyFailure(error: unknown, control: ExecutionControl | undefined): unknown {
        if (isExecutionAbortedError(error)) return error;
        if (control?.signal?.aborted) return new ExecutionAbortedError();
        const contextRejection = classifyContextWindowRejection(error);
        if (contextRejection !== undefined) return contextRejection;
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
export type OpenAIIncompleteResponseReason =
    | "length"
    | "content_filter"
    | "provider_error"
    | "empty_stream"
    | "missing_finish_reason"
    | "duplicate_finish_reason"
    | "unsupported_finish_reason"
    | "tool_calls_without_call"
    | "missing_tool_call_id"
    | "unsupported_content";

/**
 * Chat Completions 响应未以目标协议可接受的状态完成。
 *
 * @example
 * ```ts
 * if (error instanceof OpenAIIncompleteResponseError) console.log(error.reason);
 * ```
 */
export class OpenAIIncompleteResponseError extends Error {
    readonly code = "OPENAI_INCOMPLETE_RESPONSE";

    /** 导致响应无法提交的稳定分类。 */
    readonly reason: OpenAIIncompleteResponseReason;

    /**
     * @param message - 不包含响应正文的诊断信息。
     * @param reason - 终态或响应协议失败类别。
     */
    constructor(message: string, reason: OpenAIIncompleteResponseReason = "unsupported_content") {
        super(message);
        this.name = "OpenAIIncompleteResponseError";
        this.reason = reason;
    }
}

/** 模型明确拒绝当前请求；拒绝正文不进入可执行响应。 */
export class OpenAIRefusalError extends Error {
    /** 稳定的 refusal 分类码。 */
    readonly code = "OPENAI_REFUSAL";

    constructor() {
        super("Chat Completions model refused the request");
        this.name = "OpenAIRefusalError";
    }
}

/** 归一化终态；兼容端点只接受已约定的 `stop` 和 `tool_calls` 完成原因。 */
function assertAcceptedFinishReason(
    finishReason: string | null,
    acceptedFinishReasons: LLMRequest["acceptedFinishReasons"],
    toolCallCount: number,
): void {
    if (finishReason === "length" || finishReason === "content_filter" || finishReason === "error") {
        throw new OpenAIIncompleteResponseError(
            `Chat Completions response did not complete normally (${finishReason})`,
            finishReason === "length" ? "length" : finishReason === "content_filter" ? "content_filter" : "provider_error",
        );
    }
    if (acceptedFinishReasons === undefined) return;
    if (finishReason === "tool_calls" && acceptedFinishReasons.includes("tool_calls")) {
        if (toolCallCount > 0) return;
        throw new OpenAIIncompleteResponseError("Chat Completions ended with tool_calls but returned no tool call", "tool_calls_without_call");
    }
    if (acceptedFinishReasons.includes(finishReason as "stop" | "tool_calls")) return;
    throw new OpenAIIncompleteResponseError(
        `Chat Completions returned an unsupported finish reason (${finishReason ?? "missing"})`,
        "unsupported_finish_reason",
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
    readonly reasoning?: readonly { readonly source: "reasoning_content" | "thought"; readonly text: string }[];
    readonly toolCalls: readonly LLMToolCall[];
    readonly textFormat: LLMTextBlockFormat;
}): LLMContentBlock[] {
    const blocks: LLMContentBlock[] = [];
    if (input.text.length > 0) blocks.push({ index: blocks.length, type: "text", format: input.textFormat, text: input.text });
    for (const reasoning of input.reasoning ?? []) {
        if (reasoning.text.length > 0) {
            blocks.push({ index: blocks.length, type: "reasoning", source: reasoning.source, text: reasoning.text });
        }
    }
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
        const reasoningContent = readModelAssistantReasoning(message, "reasoning_content");
        const toolCalls = readModelToolCalls(message);
        return {
            role: "assistant", content: readModelAssistantText(message),
            ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls.map(call => ({
                id: call.callId, type: "function" as const, function: { name: call.toolId, arguments: call.argumentsJson },
            })) }),
            ...(reasoningContent === undefined ? {} : {
                reasoning_content: reasoningContent,
            }),
        };
    });
}
