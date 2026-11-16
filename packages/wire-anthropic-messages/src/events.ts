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
    type ModelContinuation,
    type NativeConversationIdentity,
    type NormalizedUsage,
} from "../../llm-core/src/index";
import { AnthropicMessagesIncompleteError, AnthropicMessagesRefusalError } from "./errors";

/** 一次完成的 Anthropic 工具调用；身份缺失时按策略补齐或拒绝。 */
export interface NormalizedAnthropicToolCall {
    readonly callId: string;
    readonly toolId: string;
    readonly argumentsJson: string;
}

/** 缺失供应商调用身份时的处理策略；与线格式包边界对齐，由适配器声明。 */
export interface AnthropicToolCallIdPolicy {
    /** 非流式响应缺少调用身份时的处理方式。 */
    readonly generateMissing: "reject" | "allocate";
    /** 流式响应缺少调用身份时的处理方式。 */
    readonly streamMissing: "reject" | "allocate";
}

/** 响应归一化所需的请求与供应商事实。 */
export interface AnthropicMessagesResponseOptions {
    /** 本次连接的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
    /** 触发本次响应的请求。 */
    readonly request: LLMRequest;
    /** 正文块来源格式。 */
    readonly textFormat: LLMTextBlockFormat;
    /** 缺失调用身份的处理策略。 */
    readonly toolCallIds: AnthropicToolCallIdPolicy;
}

/** Anthropic 合法终态；其余 stop_reason 属于截断、拒绝或协议失败。 */
const ACCEPTED_STOP_REASONS = new Set(["end_turn", "tool_use", "stop_sequence"]);

/**
 * 把非流式 Anthropic Messages 响应归一化为供应商无关响应。
 *
 * @remarks
 * thinking 块必须携带签名才能进入续接班载；正文在请求声明结构化输出且未挂载工具时
 * 由 llm-core 文本转 JSON 提取与修复收敛为纯 JSON。缺失终态、截断、拒绝、非法块与
 * 缺失调用身份都在此拒绝。
 *
 * @param body - 已反序列化的响应对象。
 * @param options - 请求与供应商事实。
 * @returns 有序内容块、续接载荷与诊断 metadata。
 * @throws AnthropicMessagesIncompleteError 终态或协议内容不可接受时抛出。
 * @throws AnthropicMessagesRefusalError 模型明确拒绝时抛出。
 *
 * @example
 * ```ts
 * const response = toAnthropicMessagesResponse(body, options);
 * ```
 */
export function toAnthropicMessagesResponse(body: unknown, options: AnthropicMessagesResponseOptions): LLMResponse {
    const root = requireRecord(body, "response body");
    const rawContent = readArray(root.content) ?? [];
    const stopReason = readOptionalString(root.stop_reason) ?? null;
    const toolCalls: NormalizedAnthropicToolCall[] = [];
    const nativeBlocks = readNativeBlocks(rawContent, toolCalls, {
        missingIds: options.toolCallIds.generateMissing === "reject",
        message: "non-stream",
    });
    assertAcceptedStopReason(stopReason, options.request, toolCalls.length);
    const usage = extractUsage(root.usage);

    const blocks = toNormalizedBlocks(nativeBlocks, options);
    const requestId = readOptionalString(root.id);
    return {
        blocks,
        continuation: continuationOf(options.identity, nativeBlocks),
        providerMetadata: {
            ...(requestId === undefined ? {} : { requestId }),
            model: readOptionalString(root.model) ?? options.identity.model,
            stopReason,
            ...(usage === undefined ? {} : { usage }),
        },
    };
}

/** Anthropic Messages 流最终响应的原生块缓冲。 */
type NativeBlock =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "thinking"; readonly thinking: string; readonly signature: string }
    | { readonly kind: "redacted_thinking"; readonly data: string }
    | { readonly kind: "tool_use"; readonly id: string; readonly name: string; readonly input: Readonly<Record<string, unknown>> };

/**
 * 增量组装流式 Anthropic Messages 响应。
 *
 * @remarks
 * 每个事件产生块开始/增量/完成事件；thinking 增量与签名增量都到达后才允许块完成，
 * 签名缺失在协议边界拒绝（保真回放的要求）。`message_delta` 携带的 stop_reason 与
 * 用量是唯一终态来源；`message_stop` 后由 {@link finish} 校验并产出唯一完成事件。
 * 已发布分片只用于观察：任何终态失败都不产出 `completed`。
 *
 * @example
 * ```ts
 * const assembler = new AnthropicMessagesStreamAssembler(options);
 * for (const event of events) yield* assembler.push(event);
 * yield* assembler.finish();
 * ```
 */
export class AnthropicMessagesStreamAssembler {
    private readonly nativeBlocks: NativeBlockWithIndex[] = [];
    private readonly openText = new Map<number, { readonly target: NativeBlockWithIndex; signature: string | undefined }>();
    private stopReason: string | null = null;
    private sawEvent = false;
    private requestId: string | undefined;
    private model: string | undefined;
    private usage: NormalizedUsage | undefined;

    /** @param options - 请求与供应商事实。 */
    constructor(private readonly options: AnthropicMessagesResponseOptions) {}

    /**
     * @param event - 一条已反序列化的 SSE 事件对象。
     * @returns 块开始与增量事件。
     * @throws AnthropicMessagesIncompleteError 事件类型未知、块结构非法或终态重复时抛出。
     * @throws AnthropicMessagesRefusalError 模型以 `refusal` 终态拒绝时抛出。
     */
    push(event: unknown): readonly LLMStreamEvent[] {
        const root = requireRecord(event, "stream event");
        const type = readOptionalString(root.type);
        this.sawEvent = true;
        switch (type) {
            case "message_start": {
                const message = asRecord(root.message);
                this.requestId ??= readOptionalString(message?.id);
                this.model ??= readOptionalString(message?.model);
                this.usage = extractUsage(message?.usage) ?? this.usage;
                return [];
            }
            case "content_block_start": {
                const index = readNumber(root.index);
                const block = asRecord(root.content_block);
                if (index === undefined || block === undefined) {
                    throw new AnthropicMessagesIncompleteError("Anthropic stream content_block_start was missing its index or block", "unsupported_content");
                }
                const blockType = readOptionalString(block.type);
                if (blockType === "text") {
                    const target = { index: this.nativeBlocks.length, kind: "text" as const, text: "" };
                    this.nativeBlocks.push(target);
                    this.openText.set(index, { target, signature: undefined });
                    return [{ kind: "content_block_started", index: target.index, blockType: "text", delivery: "incremental", format: this.options.textFormat }];
                }
                if (blockType === "thinking" || blockType === "redacted_thinking") {
                    const data = blockType === "thinking" ? readOptionalString(block.thinking) : readOptionalString(block.data);
                    const target = blockType === "thinking"
                        ? { index: this.nativeBlocks.length, kind: "thinking" as const, thinking: data ?? "", signature: "" }
                        : { index: this.nativeBlocks.length, kind: "redacted_thinking" as const, data: data ?? "" };
                    this.nativeBlocks.push(target);
                    const delivery = target.kind === "redacted_thinking" ? "whole" as const : "incremental" as const;
                    this.openText.set(index, { target, signature: undefined });
                    return [{ kind: "content_block_started", index: target.index, blockType: "reasoning", delivery }];
                }
                if (blockType === "tool_use") {
                    const id = readOptionalString(block.id) ?? "";
                    const name = readOptionalString(block.name) ?? "";
                    const target = { index: this.nativeBlocks.length, kind: "tool_use" as const, id, name, input: "" };
                    this.nativeBlocks.push(target);
                    this.openText.set(index, { target, signature: undefined });
                    return [{ kind: "content_block_started", index: target.index, blockType: "tool_call", delivery: "incremental" }];
                }
                throw new AnthropicMessagesIncompleteError(`Anthropic stream produced an unsupported content block type "${blockType ?? "unknown"}"`, "unsupported_content");
            }
            case "content_block_delta": {
                const index = readNumber(root.index);
                const open = index === undefined ? undefined : this.openText.get(index);
                if (open === undefined) {
                    throw new AnthropicMessagesIncompleteError("Anthropic stream delta arrived for an unknown or sealed block", "unsupported_content");
                }
                const delta = asRecord(root.delta);
                const deltaType = readOptionalString(delta?.type);
                if (open.target.kind === "text") {
                    if (deltaType !== "text_delta") {
                        throw new AnthropicMessagesIncompleteError(`Anthropic text block received a "${deltaType ?? "unknown"}" delta`, "unsupported_content");
                    }
                    const text = readProviderText(delta?.text);
                    open.target.text += text;
                    return text.length === 0 ? [] : [{ kind: "content_block_delta", index: open.target.index, deltaKind: "text", delta: text }];
                }
                if (open.target.kind === "thinking") {
                    if (deltaType === "thinking_delta") {
                        const text = readProviderText(delta?.thinking);
                        open.target.thinking += text;
                        return text.length === 0 ? [] : [{ kind: "content_block_delta", index: open.target.index, deltaKind: "reasoning", delta: text }];
                    }
                    if (deltaType === "signature_delta") {
                        open.signature = (open.signature ?? "") + readProviderText(delta?.signature);
                        return [];
                    }
                    throw new AnthropicMessagesIncompleteError(`Anthropic thinking block received a "${deltaType ?? "unknown"}" delta`, "unsupported_content");
                }
                if (open.target.kind === "redacted_thinking") {
                    throw new AnthropicMessagesIncompleteError("Anthropic redacted thinking block received an incremental delta", "unsupported_content");
                }
                if (deltaType !== "input_json_delta") {
                    throw new AnthropicMessagesIncompleteError(`Anthropic tool_use block received a "${deltaType ?? "unknown"}" delta`, "unsupported_content");
                }
                const argumentsDelta = readProviderText(delta?.partial_json);
                open.target.input += argumentsDelta;
                return argumentsDelta.length === 0
                    ? []
                    : [{ kind: "content_block_delta", index: open.target.index, deltaKind: "tool_arguments", delta: argumentsDelta }];
            }
            case "content_block_stop": {
                const stopIndex = readNumber(root.index);
                const open = stopIndex === undefined ? undefined : this.openText.get(stopIndex);
                if (stopIndex === undefined || open === undefined) return [];
                this.openText.delete(stopIndex);
                if (open.target.kind === "tool_use") {
                    if (open.target.id.length === 0) {
                        if (this.options.toolCallIds.streamMissing === "reject") {
                            throw new AnthropicMessagesIncompleteError("Anthropic tool call ended without a provider tool_use id", "missing_tool_use_id");
                        }
                        open.target.id = `call_${randomUUID()}`;
                    }
                    if (open.target.name.length === 0) {
                        throw new AnthropicMessagesIncompleteError("Anthropic tool call ended without a tool name", "unsupported_content");
                    }
                    return [{
                        kind: "content_block_completed", delivery: "incremental",
                        block: { index: open.target.index, type: "tool_call", callId: open.target.id, toolId: open.target.name, argumentsJson: open.target.input },
                    }];
                }
                if (open.target.kind === "thinking") {
                    if ((open.signature ?? "").length === 0) {
                        throw new AnthropicMessagesIncompleteError("Anthropic thinking block ended without its signature", "missing_thinking_signature");
                    }
                    open.target.signature = open.signature!;
                }
                const block: LLMContentBlock = open.target.kind === "text"
                    ? { index: open.target.index, type: "text", format: this.options.textFormat, text: open.target.text }
                    : open.target.kind === "thinking"
                    ? { index: open.target.index, type: "reasoning", text: open.target.thinking }
                    : { index: open.target.index, type: "reasoning", text: "" };
                return [{ kind: "content_block_completed", delivery: open.target.kind === "redacted_thinking" ? "whole" : "incremental", block }];
            }
            case "message_delta": {
                const delta = asRecord(root.delta);
                const chunkStop = readOptionalString(delta?.stop_reason);
                if (chunkStop !== undefined) {
                    if (this.stopReason !== null) {
                        throw new AnthropicMessagesIncompleteError("Anthropic stream contained multiple stop reasons", "missing_stop_reason");
                    }
                    this.stopReason = chunkStop;
                    if (chunkStop === "refusal") throw new AnthropicMessagesRefusalError();
                }
                this.usage = mergeUsage(this.usage, root.usage);
                return [];
            }
            case "message_stop":
                return [];
            case "ping":
                return [];
            case "error": {
                const error = asRecord(root.error);
                throw new AnthropicMessagesIncompleteError(
                    `Anthropic stream reported an error event (${readOptionalString(error?.type) ?? "unknown"})`,
                    "provider_error",
                );
            }
            default:
                throw new AnthropicMessagesIncompleteError(`Anthropic stream event type "${type ?? "unknown"}" is not supported`, "unsupported_content");
        }
    }

    /**
     * 校验终态并产出已完成块与响应完成事件。
     *
     * @returns 按块索引排序的完成事件与唯一成功完成。
     * @throws AnthropicMessagesIncompleteError 空流或缺少终态时抛出。
     */
    finish(): readonly LLMStreamEvent[] {
        if (!this.sawEvent) {
            throw new AnthropicMessagesIncompleteError("Anthropic Messages stream produced no events", "empty_stream");
        }
        if (this.stopReason === null) {
            throw new AnthropicMessagesIncompleteError("Anthropic Messages stream ended without a stop reason", "missing_stop_reason");
        }
        assertAcceptedStopReason(this.stopReason, this.options.request, this.toolUseCount());

        const blocks = toNormalizedBlocks(this.nativeBlocks, this.options);
        const events: LLMStreamEvent[] = blocks.map(block => ({
            kind: "content_block_completed" as const, delivery: "incremental" as const, block,
        }));
        events.push({
            kind: "completed",
            response: {
                blocks,
                continuation: continuationOf(this.options.identity, this.nativeBlocks),
                providerMetadata: {
                    ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
                    model: this.model ?? this.options.identity.model,
                    stopReason: this.stopReason,
                    ...(this.usage === undefined ? {} : { usage: this.usage }),
                },
            },
        });
        return events;
    }

    private toolUseCount(): number {
        return this.nativeBlocks.filter(block => block.kind === "tool_use").length;
    }
}

type NativeBlockWithIndex =
    | { readonly index: number; readonly kind: "text"; text: string }
    | { readonly index: number; readonly kind: "thinking"; thinking: string; signature: string }
    | { readonly index: number; readonly kind: "redacted_thinking"; data: string }
    | { readonly index: number; readonly kind: "tool_use"; id: string; name: string; input: string };

/** 终态校验：只接受合法终态，且需要工具调用时必须为 `tool_use`。 */
function assertAcceptedStopReason(
    stopReason: string | null,
    request: LLMRequest,
    toolCallCount: number,
): void {
    if (stopReason === null) {
        throw new AnthropicMessagesIncompleteError("Anthropic Messages response ended without a stop reason", "missing_stop_reason");
    }
    if (stopReason === "max_tokens") {
        throw new AnthropicMessagesIncompleteError("Anthropic Messages response hit its output token limit", "max_tokens");
    }
    if (!ACCEPTED_STOP_REASONS.has(stopReason)) {
        throw new AnthropicMessagesIncompleteError(`Anthropic Messages response did not complete normally (${stopReason})`, "refusal" === stopReason ? "refusal" : "provider_error");
    }
    const expectsTool = request.acceptedFinishReasons !== undefined;
    if (expectsTool && toolCallCount === 0 && stopReason !== "tool_use") {
        throw new AnthropicMessagesIncompleteError(`Anthropic Messages response ended with "${stopReason}" but a tool call was required`, "provider_error");
    }
}

/** 把原生块序列映射为供应商无关有序块；正文按文本转 JSON 兜底收敛。 */
function toNormalizedBlocks(
    nativeBlocks: readonly NativeBlockWithIndex[],
    options: AnthropicMessagesResponseOptions,
): LLMContentBlock[] {
    return nativeBlocks.map((nativeBlock, index) => {
        switch (nativeBlock.kind) {
            case "text": return {
                index, type: "text" as const, format: options.textFormat,
                text: normalizeStructuredText(nativeBlock.text, options.request),
            };
            case "thinking": return { index, type: "reasoning" as const, text: nativeBlock.thinking };
            case "redacted_thinking": return { index, type: "reasoning" as const, text: "" };
            case "tool_use": return {
                index, type: "tool_call" as const,
                callId: nativeBlock.id.length > 0
                    ? nativeBlock.id
                    : options.toolCallIds.generateMissing === "allocate" ? `call_${randomUUID()}` : "",
                toolId: nativeBlock.name,
                argumentsJson: normalizeJsonArguments(nativeBlock.input),
            };
        }
    });
}

function continuationOf(
    identity: NativeConversationIdentity,
    nativeBlocks: readonly NativeBlockWithIndex[],
): ModelContinuation {
    return {
        identity,
        blocks: nativeBlocks.map(block => {
            switch (block.kind) {
                case "text": return { type: "text" as const, text: block.text };
                case "thinking": return { type: "thinking" as const, thinking: block.thinking, signature: block.signature };
                case "redacted_thinking": return { type: "redacted_thinking" as const, data: block.data };
                case "tool_use": return {
                    type: "tool_use" as const, id: block.id, name: block.name,
                    input: parseJsonArguments(block.input),
                };
            }
        }),
    };
}

/** 工具参数增量可能为空或缺尾；无输入按空对象序列化，其余原样保留。 */
function normalizeJsonArguments(raw: string): string {
    if (raw.trim().length === 0) return "{}";
    return raw;
}

function parseJsonArguments(raw: string): Record<string, unknown> {
    if (raw.trim().length === 0) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function normalizeStructuredText(text: string, request: LLMRequest): string {
    if (request.structuredOutput === undefined || (request.tools !== undefined && request.tools.length > 0)) return text;
    const payload = extractJsonText(text);
    if (payload === undefined) return text;
    return parseJsonText(text).ok ? repairJsonText(payload) : text;
}

/** 用量从 `usage` 顶层字段提取；核心计数非法时全局缺省，不伪造 0。 */
function extractUsage(value: unknown): NormalizedUsage | undefined {
    const usage = asRecord(value);
    if (usage === undefined) return undefined;
    const inputTokens = toSafeTokenCount(usage.input_tokens);
    const outputTokens = toSafeTokenCount(usage.output_tokens);
    if (inputTokens === undefined || outputTokens === undefined) return undefined;
    const cachedInputTokens = toSafeTokenCount(usage.cache_read_input_tokens);
    return cachedInputTokens === undefined
        ? { inputTokens, outputTokens }
        : { inputTokens, outputTokens, cachedInputTokens };
}

/** 部分上报读取：只读取当前对象里合法的非负计数，供流内合并。 */
function extractPartialUsage(value: unknown): { readonly inputTokens?: number; readonly outputTokens?: number; readonly cachedInputTokens?: number } {
    const usage = asRecord(value);
    if (usage === undefined) return {};
    const inputTokens = toSafeTokenCount(usage.input_tokens);
    const outputTokens = toSafeTokenCount(usage.output_tokens);
    const cachedInputTokens = toSafeTokenCount(usage.cache_read_input_tokens);
    return {
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
        ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    };
}

/** 合并 message_start 与 message_delta 的上报：终态侧携带的非零值优先。 */
function mergeUsage(earlier: NormalizedUsage | undefined, value: unknown): NormalizedUsage | undefined {
    const partial = extractPartialUsage(value);
    if (earlier === undefined) {
        const inputTokens = partial.inputTokens ?? 0;
        const outputTokens = partial.outputTokens ?? 0;
        if (partial.inputTokens === undefined && partial.outputTokens === undefined) return undefined;
        return partial.cachedInputTokens === undefined
            ? { inputTokens, outputTokens }
            : { inputTokens, outputTokens, cachedInputTokens: partial.cachedInputTokens };
    }
    const merged = {
        inputTokens: partial.inputTokens ?? earlier.inputTokens,
        outputTokens: partial.outputTokens ?? earlier.outputTokens,
    };
    const cachedInputTokens = partial.cachedInputTokens ?? earlier.cachedInputTokens;
    return cachedInputTokens === undefined ? merged : { ...merged, cachedInputTokens };
}

function readNativeBlocks(
    rawContent: readonly unknown[],
    toolCalls: NormalizedAnthropicToolCall[],
    policy: { readonly missingIds: boolean; readonly message: string },
): NativeBlockWithIndex[] {
    const blocks: NativeBlockWithIndex[] = [];
    for (const raw of rawContent) {
        const block = requireRecord(raw, "content block");
        const type = readOptionalString(block.type);
        if (type === "text") {
            const text = readProviderText(block.text);
            if (text.length === 0) continue;
            blocks.push({ index: blocks.length, kind: "text", text });
            continue;
        }
        if (type === "thinking") {
            const thinking = readProviderText(block.thinking);
            const signature = readProviderText(block.signature);
            if (thinking.length === 0) continue;
            if (signature.length === 0) {
                throw new AnthropicMessagesIncompleteError("Anthropic thinking block was missing its signature", "missing_thinking_signature");
            }
            blocks.push({ index: blocks.length, kind: "thinking", thinking, signature });
            continue;
        }
        if (type === "redacted_thinking") {
            const data = readProviderText(block.data);
            if (data.length === 0) continue;
            blocks.push({ index: blocks.length, kind: "redacted_thinking", data });
            continue;
        }
        if (type === "tool_use") {
            const id = readOptionalString(block.id) ?? "";
            const name = readOptionalString(block.name) ?? "";
            if (id.length === 0 && policy.missingIds) {
                throw new AnthropicMessagesIncompleteError("Anthropic tool call ended without a provider tool_use id", "missing_tool_use_id");
            }
            if (name.length === 0) {
                throw new AnthropicMessagesIncompleteError("Anthropic tool call ended without a tool name", "unsupported_content");
            }
            const input = block.input;
            const call: NormalizedAnthropicToolCall = {
                callId: id.length > 0 ? id : `call_${randomUUID()}`,
                toolId: name,
                argumentsJson: input === undefined ? "{}" : JSON.stringify(input ?? {}),
            };
            toolCalls.push(call);
            blocks.push({ index: blocks.length, kind: "tool_use", id: call.callId, name, input: call.argumentsJson });
            continue;
        }
        throw new AnthropicMessagesIncompleteError(`Anthropic response content block type "${type ?? "unknown"}" is not supported`, "unsupported_content");
    }
    return blocks;
}

function readProviderText(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    const record = asRecord(value);
    if (record === undefined) {
        throw new AnthropicMessagesIncompleteError(`Anthropic Messages ${label} was not an object`, "unsupported_content");
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

function readOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
