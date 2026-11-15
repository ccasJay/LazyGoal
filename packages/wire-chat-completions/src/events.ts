import { randomUUID } from "node:crypto";

import {
    extractJsonText,
    parseJsonText,
    repairJsonText,
    toSafeTokenCount,
    type LLMContentBlock,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type LLMTextBlockFormat,
    type NativeConversationIdentity,
    type NormalizedUsage,
} from "../../llm-core/src/index";
import { ChatCompletionsIncompleteError, ChatCompletionsRefusalError } from "./errors";

/**
 * 缺失供应商调用身份时的处理策略。
 *
 * @remarks
 * `generateMissing` 与 `streamMissing` 分开声明：既有 OpenAI-compatible 非流式路径保留空身份，
 * 流式路径则拒绝；官方 OpenAI 两条路径都分配本地身份。差异属于供应商事实，由适配器选择。
 *
 * @example
 * ```ts
 * const policy: ChatCompletionsToolCallIdPolicy = { generateMissing: "allocate", streamMissing: "allocate" };
 * ```
 */
export interface ChatCompletionsToolCallIdPolicy {
    /** 非流式响应缺少调用身份时的处理方式。 */
    readonly generateMissing: "keep" | "allocate";
    /** 流式响应缺少调用身份时的处理方式。 */
    readonly streamMissing: "reject" | "allocate";
}

/** 响应归一化所需的请求与供应商事实。 */
export interface ChatCompletionsResponseOptions {
    /** 本次连接的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
    /** 触发本次响应的请求。 */
    readonly request: LLMRequest;
    /** 正文块来源格式。 */
    readonly textFormat: LLMTextBlockFormat;
    /** 供应商是否原生约束结构化输出；缺省为 `true`。 */
    readonly nativeStructuredOutput?: boolean;
    /** 是否在续接载荷中回放 reasoning 扩展；缺省为 `false`。 */
    readonly replayReasoningExtensions?: boolean;
    /** 缺失调用身份的处理策略。 */
    readonly toolCallIds: ChatCompletionsToolCallIdPolicy;
}

/**
 * 把非流式 Chat Completions 响应归一化为供应商无关响应。
 *
 * @remarks
 * 只读取首个候选；拒绝、截断、内容过滤、非法结束原因与缺少调用身份都在此拒绝。
 * 供应商未原生约束结构化输出时，正文在可提取时被修复为纯 JSON 文本。
 *
 * @param body - 已反序列化的响应对象。
 * @param options - 请求与供应商事实。
 * @returns 有序内容块、续接载荷与诊断 metadata。
 * @throws ChatCompletionsIncompleteError 终态或协议内容不可接受时抛出。
 * @throws ChatCompletionsRefusalError 模型明确拒绝时抛出。
 *
 * @example
 * ```ts
 * const response = toChatCompletionsResponse(body, options);
 * ```
 */
export function toChatCompletionsResponse(body: unknown, options: ChatCompletionsResponseOptions): LLMResponse {
    const root = requireRecord(body, "response body");
    const choice = readFirstChoice(root);
    const message = asRecord(choice?.message);
    const refusal = message?.refusal;
    if (typeof refusal === "string" && refusal.length > 0) throw new ChatCompletionsRefusalError();
    const reasoningContent = readOptionalString(message?.reasoning_content);
    const thought = readOptionalString(message?.thought);
    const finishReason = readOptionalString(choice?.finish_reason) ?? null;
    const toolCalls = (readArray(message?.tool_calls) ?? []).map(raw => {
        const call = requireRecord(raw, "tool call");
        const func = asRecord(call.function);
        const id = readOptionalString(call.id) ?? "";
        return {
            callId: id.length > 0
                ? id
                : options.toolCallIds.generateMissing === "keep" ? "" : `call_${randomUUID()}`,
            toolId: readOptionalString(func?.name) ?? "",
            argumentsJson: readOptionalString(func?.arguments) ?? "{}",
        };
    });
    if (options.request.acceptedFinishReasons !== undefined && toolCalls.some(call => call.callId.length === 0)) {
        throw new ChatCompletionsIncompleteError("Chat Completions tool call ended without a provider call ID", "missing_tool_call_id");
    }
    assertAcceptedFinishReason(finishReason, options.request.acceptedFinishReasons, toolCalls.length);
    const usage = extractUsage(root.usage);
    const text = normalizeStructuredText(readProviderText(message?.content, "message content"), options);

    const blocks: LLMContentBlock[] = [];
    if (text.length > 0) blocks.push({ index: blocks.length, type: "text", format: options.textFormat, text });
    if (reasoningContent !== undefined && reasoningContent.length > 0) {
        blocks.push({ index: blocks.length, type: "reasoning", source: "reasoning_content", text: reasoningContent });
    }
    if (thought !== undefined && thought.length > 0) {
        blocks.push({ index: blocks.length, type: "reasoning", source: "thought", text: thought });
    }
    for (const call of toolCalls) blocks.push({ index: blocks.length, type: "tool_call", ...call });

    const requestId = readOptionalString(root.id);
    const responseModel = readOptionalString(root.model);
    const created = readOptionalNumber(root.created);
    return {
        blocks,
        continuation: {
            identity: options.identity,
            ...(options.replayReasoningExtensions === true && reasoningContent !== undefined ? { reasoningContent } : {}),
            ...(options.replayReasoningExtensions === true && thought !== undefined ? { thought } : {}),
        },
        providerMetadata: {
            ...(requestId === undefined ? {} : { requestId }),
            ...(responseModel === undefined ? {} : { model: responseModel }),
            ...(created === undefined ? {} : { created }),
            finishReason,
            ...(usage === undefined ? {} : { usage }),
        },
    };
}

/**
 * 增量组装流式 Chat Completions 响应。
 *
 * @remarks
 * 每个分片产生块开始与增量事件；只有收齐合法终态后才在 {@link finish} 产生块完成与响应完成事件。
 * 已发布分片只用于观察：任何终态或协议失败都在 finish 阶段拒绝，不产出 `completed`。
 *
 * @example
 * ```ts
 * const assembler = new ChatCompletionsStreamAssembler(options);
 * for (const chunk of chunks) yield* assembler.push(chunk);
 * yield* assembler.finish();
 * ```
 */
export class ChatCompletionsStreamAssembler {
    private nextIndex = 0;
    private text: { readonly index: number; text: string } | undefined;
    private reasoningContent: { readonly index: number; text: string } | undefined;
    private thought: { readonly index: number; text: string } | undefined;
    private readonly toolBlocks = new Map<number, { readonly index: number; callId: string; toolId: string; argumentsJson: string }>();
    private finishReason: string | null = null;
    private sawChunk = false;
    private requestId: string | undefined;
    private model: string | undefined;
    private created: number | undefined;
    private usage: NormalizedUsage | undefined;

    /** @param options - 请求与供应商事实。 */
    constructor(private readonly options: ChatCompletionsResponseOptions) {}

    /**
     * @param chunk - 一条已反序列化的流分片。
     * @returns 块开始与增量事件，按分片内字段顺序排列。
     * @throws ChatCompletionsIncompleteError 分片在终态后继续携带内容或结构非法时抛出。
     * @throws ChatCompletionsRefusalError 模型明确拒绝时抛出。
     */
    push(chunk: unknown): readonly LLMStreamEvent[] {
        const root = requireRecord(chunk, "stream chunk");
        this.sawChunk = true;
        const choices = readArray(root.choices) ?? [];
        if (this.options.request.acceptedFinishReasons !== undefined && this.finishReason !== null && choices.length > 0) {
            throw new ChatCompletionsIncompleteError("Chat Completions stream emitted content after its finish reason", "duplicate_finish_reason");
        }
        this.requestId ??= readOptionalString(root.id);
        this.model ??= readOptionalString(root.model);
        this.created ??= readOptionalNumber(root.created);
        this.usage = extractUsage(root.usage) ?? this.usage;

        const events: LLMStreamEvent[] = [];
        const choice = asRecord(choices[0]);
        const delta = asRecord(choice?.delta);
        const chunkFinishReason = readOptionalString(choice?.finish_reason);
        if (chunkFinishReason !== undefined) {
            if (this.finishReason !== null && this.options.request.acceptedFinishReasons !== undefined) {
                throw new ChatCompletionsIncompleteError("Chat Completions stream contained multiple finish reasons", "duplicate_finish_reason");
            }
            this.finishReason = chunkFinishReason;
        }

        const deltaText = readProviderText(delta?.content, "stream content delta");
        if (deltaText.length > 0) {
            if (this.text === undefined) {
                this.text = { index: this.nextIndex++, text: "" };
                events.push({
                    kind: "content_block_started", index: this.text.index, blockType: "text",
                    delivery: "incremental", format: this.options.textFormat,
                });
            }
            this.text.text += deltaText;
            events.push({ kind: "content_block_delta", index: this.text.index, deltaKind: "text", delta: deltaText });
        }

        const refusal = delta?.refusal;
        if (typeof refusal === "string" && refusal.length > 0) throw new ChatCompletionsRefusalError();
        const reasoningDelta = readProviderText(delta?.reasoning_content, "stream reasoning delta");
        if (reasoningDelta.length > 0) {
            if (this.reasoningContent === undefined) {
                this.reasoningContent = { index: this.nextIndex++, text: "" };
                events.push({
                    kind: "content_block_started", index: this.reasoningContent.index,
                    blockType: "reasoning", delivery: "incremental",
                });
            }
            this.reasoningContent.text += reasoningDelta;
            events.push({
                kind: "content_block_delta", index: this.reasoningContent.index,
                deltaKind: "reasoning", delta: reasoningDelta,
            });
        }
        const thoughtDelta = readProviderText(delta?.thought, "stream thought delta");
        if (thoughtDelta.length > 0) {
            if (this.thought === undefined) {
                this.thought = { index: this.nextIndex++, text: "" };
                events.push({
                    kind: "content_block_started", index: this.thought.index,
                    blockType: "reasoning", delivery: "incremental",
                });
            }
            this.thought.text += thoughtDelta;
            events.push({ kind: "content_block_delta", index: this.thought.index, deltaKind: "reasoning", delta: thoughtDelta });
        }

        for (const rawCall of readArray(delta?.tool_calls) ?? []) {
            const call = requireRecord(rawCall, "stream tool call");
            const callIndex = readOptionalNumber(call.index);
            if (callIndex === undefined) {
                throw new ChatCompletionsIncompleteError("Chat Completions stream tool call was missing its index", "unsupported_content");
            }
            let block = this.toolBlocks.get(callIndex);
            if (block === undefined) {
                block = { index: this.nextIndex++, callId: "", toolId: "", argumentsJson: "" };
                this.toolBlocks.set(callIndex, block);
                events.push({ kind: "content_block_started", index: block.index, blockType: "tool_call", delivery: "incremental" });
            }
            const id = readOptionalString(call.id);
            if (id !== undefined && id.length > 0) block.callId = id;
            const func = asRecord(call.function);
            const name = readOptionalString(func?.name);
            if (name !== undefined && name.length > 0) block.toolId = name;
            const argumentsDelta = readProviderText(func?.arguments, "stream tool arguments");
            if (argumentsDelta.length > 0) {
                block.argumentsJson += argumentsDelta;
                events.push({ kind: "content_block_delta", index: block.index, deltaKind: "tool_arguments", delta: argumentsDelta });
            }
        }
        return events;
    }

    /**
     * 校验终态并产出块完成与响应完成事件。
     *
     * @returns 按块索引排序的完成事件与唯一成功完成。
     * @throws ChatCompletionsIncompleteError 空流、缺少终态、非法结束原因或缺少调用身份时抛出。
     */
    finish(): readonly LLMStreamEvent[] {
        if (!this.sawChunk) throw new ChatCompletionsIncompleteError("Chat Completions stream produced no chunks", "empty_stream");
        if (this.finishReason === null) {
            throw new ChatCompletionsIncompleteError("Chat Completions stream ended without a valid finish reason", "missing_finish_reason");
        }
        assertAcceptedFinishReason(this.finishReason, this.options.request.acceptedFinishReasons, this.toolBlocks.size);
        if (this.options.request.acceptedFinishReasons !== undefined
            && [...this.toolBlocks.values()].some(block => block.callId.length === 0)) {
            throw new ChatCompletionsIncompleteError("Chat Completions tool call ended without a provider call ID", "missing_tool_call_id");
        }

        const orderedBlocks: LLMContentBlock[] = [];
        if (this.text !== undefined && this.text.text.length > 0) {
            orderedBlocks.push({
                index: this.text.index, type: "text", format: this.options.textFormat,
                text: normalizeStructuredText(this.text.text, this.options),
            });
        }
        if (this.reasoningContent !== undefined && this.reasoningContent.text.length > 0) {
            orderedBlocks.push({
                index: this.reasoningContent.index, type: "reasoning",
                source: "reasoning_content", text: this.reasoningContent.text,
            });
        }
        if (this.thought !== undefined && this.thought.text.length > 0) {
            orderedBlocks.push({ index: this.thought.index, type: "reasoning", source: "thought", text: this.thought.text });
        }
        for (const block of this.toolBlocks.values()) {
            if (block.callId.length === 0 && this.options.toolCallIds.streamMissing === "reject") {
                throw new ChatCompletionsIncompleteError("Chat Completions tool call ended without a provider call ID", "missing_tool_call_id");
            }
            orderedBlocks.push({
                index: block.index, type: "tool_call",
                callId: block.callId.length > 0 ? block.callId : `call_${randomUUID()}`,
                toolId: block.toolId,
                argumentsJson: block.argumentsJson,
            });
        }
        orderedBlocks.sort((left, right) => left.index - right.index);

        const events: LLMStreamEvent[] = orderedBlocks.map(block => ({
            kind: "content_block_completed" as const, delivery: "incremental" as const, block,
        }));
        events.push({
            kind: "completed",
            response: {
                blocks: orderedBlocks,
                continuation: {
                    identity: this.options.identity,
                    ...(this.options.replayReasoningExtensions === true && this.reasoningContent !== undefined
                        ? { reasoningContent: this.reasoningContent.text }
                        : {}),
                    ...(this.options.replayReasoningExtensions === true && this.thought !== undefined
                        ? { thought: this.thought.text }
                        : {}),
                },
                providerMetadata: {
                    ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
                    ...(this.model === undefined ? {} : { model: this.model }),
                    ...(this.created === undefined ? {} : { created: this.created }),
                    finishReason: this.finishReason,
                    ...(this.usage === undefined ? {} : { usage: this.usage }),
                },
            },
        });
        return events;
    }
}

/** 归一化终态；只接受请求声明的 `stop` 与 `tool_calls`。 */
function assertAcceptedFinishReason(
    finishReason: string | null,
    acceptedFinishReasons: LLMRequest["acceptedFinishReasons"],
    toolCallCount: number,
): void {
    if (finishReason === "length" || finishReason === "content_filter" || finishReason === "error") {
        throw new ChatCompletionsIncompleteError(
            `Chat Completions response did not complete normally (${finishReason})`,
            finishReason === "length" ? "length" : finishReason === "content_filter" ? "content_filter" : "provider_error",
        );
    }
    if (acceptedFinishReasons === undefined) return;
    if (finishReason === "tool_calls" && acceptedFinishReasons.includes("tool_calls")) {
        if (toolCallCount > 0) return;
        throw new ChatCompletionsIncompleteError("Chat Completions ended with tool_calls but returned no tool call", "tool_calls_without_call");
    }
    if (acceptedFinishReasons.includes(finishReason as "stop" | "tool_calls")) return;
    throw new ChatCompletionsIncompleteError(
        `Chat Completions returned an unsupported finish reason (${finishReason ?? "missing"})`,
        "unsupported_finish_reason",
    );
}

/**
 * 在供应商未原生约束结构化输出时，把可提取的正文修复为纯 JSON 文本。
 *
 * @remarks
 * 只在请求声明结构化输出、未挂载工具且提取与解析都成功时替换；无法提取时保留原文，
 * 让下游以明确的协议错误暴露出模型偏离，而不是静默猜测。
 */
function normalizeStructuredText(text: string, options: ChatCompletionsResponseOptions): string {
    const hasTools = options.request.tools !== undefined && options.request.tools.length > 0;
    if (options.nativeStructuredOutput !== false || options.request.structuredOutput === undefined || hasTools) return text;
    const payload = extractJsonText(text);
    if (payload === undefined) return text;
    return parseJsonText(text).ok ? repairJsonText(payload) : text;
}

/** 在供应商边界读取文本字段；非字符串内容明确拒绝。 */
function readProviderText(value: unknown, label: string): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    throw new ChatCompletionsIncompleteError(`Chat Completions ${label} contained an unsupported part`, "unsupported_content");
}

/** 从响应用量提取归一化计数；核心字段缺失或非法时整体缺省。 */
function extractUsage(value: unknown): NormalizedUsage | undefined {
    const usage = asRecord(value);
    if (usage === undefined) return undefined;
    const inputTokens = toSafeTokenCount(readNumber(usage.prompt_tokens));
    const outputTokens = toSafeTokenCount(readNumber(usage.completion_tokens));
    if (inputTokens === undefined || outputTokens === undefined) return undefined;
    const cachedInputTokens = toSafeTokenCount(readNumber(asRecord(usage.prompt_tokens_details)?.cached_tokens));
    return cachedInputTokens === undefined
        ? { inputTokens, outputTokens }
        : { inputTokens, outputTokens, cachedInputTokens };
}

function readFirstChoice(root: Record<string, unknown>): Record<string, unknown> | undefined {
    return asRecord((readArray(root.choices) ?? [])[0]);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    const record = asRecord(value);
    if (record === undefined) {
        throw new ChatCompletionsIncompleteError(`Chat Completions ${label} was not an object`, "unsupported_content");
    }
    return record;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function readArray(value: unknown): readonly unknown[] | undefined {
    return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function readOptionalString(value: unknown): string | undefined {
    return readString(value);
}

function readNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
    return readNumber(value);
}
