import { randomUUID } from "node:crypto";

import {
    isModelAssistantMessage,
    readModelAssistantText,
    sameNativeIdentity,
    toSafeTokenCount,
    type GeminiContinuationPart,
    type LLMContentBlock,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type LLMTextBlockFormat,
    type LLMToolCall,
    type ModelContinuation,
    type NativeConversationIdentity,
    type NormalizedUsage,
} from "../../llm-core/src/index";
import { LLMRequestModeMismatchError } from "../../llm-core/src/index";
import type { GenerateContentContent, GenerateContentPart } from "./request";
import { restoreGeminiResponseProjection } from "./schema";
import { GeminiIncompleteResponseError } from "./errors";

/** 一次流式 chunk 的候选内容。 */
interface StreamCandidate {
    readonly content: { readonly parts?: GeminiContinuationPart[] } | undefined;
    readonly finishReason: string | undefined;
}

/** GenerateContent 响应归一化所需的请求与身份事实。 */
export interface GenerateContentResponseOptions {
    /** 本次连接的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
    /** 触发本次响应的请求。 */
    readonly request: LLMRequest;
    /** 正文块来源格式。 */
    readonly textFormat: LLMTextBlockFormat;
}

/** 拒绝的 Google finish reason；属于截断、安全阻断或异常结束。 */
const REJECTED_GEMINI_FINISH_REASONS = new Set([
    "MAX_TOKENS", "SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT",
    "SPII", "MALFORMED_FUNCTION_CALL", "IMAGE_SAFETY", "UNEXPECTED_TOOL_CALL",
    "TOO_MANY_TOOL_CALLS", "MISSING_THOUGHT_SIGNATURE", "OTHER",
]);

/**
 * 把非流式 GenerateContent 响应归一化为供应商无关响应。
 *
 * @remarks
 * 响应按真实 Part 顺序输出正文、公开 reasoning 与工具调用块；相邻同类型 Part 归并为
 * 一个块并按内容直接连接。严格结构化正文在归一前完成逆向投影（哨兵与联合分支还原）。
 * 续接 Parts 与签名按到达顺序原样保存。截断、安全阻断与未知 Part 在此拒绝。
 *
 * @param body - 已反序列化的响应对象。
 * @param options - 请求与身份事实。
 * @returns 有序内容块、续接载荷与诊断 metadata。
 * @throws GeminiIncompleteResponseError 终态或协议内容不可接受时抛出。
 * @throws LLMRequestModeMismatchError 响应 Parts 无法支撑原生历史时抛出。
 *
 * @example
 * ```ts
 * const response = toGenerateContentResponse(body, options);
 * ```
 */
export function toGenerateContentResponse(body: unknown, options: GenerateContentResponseOptions): LLMResponse {
    const root = requireRecord(body, "response body");
    const candidate = asRecord((readArray(root.candidates) ?? [])[0]);
    const finishReason = candidate?.finishReason === undefined || candidate?.finishReason === null
        ? undefined
        : String(candidate.finishReason);
    assertAcceptedGeminiFinishReason(finishReason, { requireKnownReason: false });
    assertNotBlocked(asRecord(root.promptFeedback)?.blockReason);
    const parts = asRecord(candidate?.content)?.parts;
    const rawParts = readArray(parts) ?? [];

    const blocks: LLMContentBlock[] = [];
    const toolCalls: LLMToolCall[] = [];
    normalizeParts(rawParts, options, {
        onTextSegment: segments => {
            const rawText = segments.join("");
            if (rawText.length === 0) return;
            blocks.push({
                index: blocks.length, type: "text", format: options.textFormat,
                text: options.textFormat === "json"
                    ? restoreGeminiResponseProjection(rawText, options.request.structuredOutput!.schema)
                    : rawText,
            });
        },
        onReasoningSegment: segments => {
            const text = segments.join("");
            if (text.length === 0) return;
            blocks.push({ index: blocks.length, type: "reasoning", text });
        },
        onToolCall: call => {
            toolCalls.push(call);
            blocks.push({ index: blocks.length, type: "tool_call", ...call });
        },
    });

    const usage = extractUsage(root.usageMetadata);
    const continuation = continuationOf(options.identity, rawParts);
    const message = {
        role: "assistant" as const,
        content: blocks.flatMap(block => block.type === "text" ? [block.text] : []).join(""),
        ...(blocks.some(block => block.type === "reasoning") ? {
            reasoning: blocks.flatMap(block => block.type === "reasoning" ? [block.text] : []).join(""),
        } : {}),
        ...(toolCalls.length > 0 ? { toolCalls } : {}), continuation,
    };
    if (toolCalls.length <= 1 && !isModelAssistantMessage(message)) {
        throw new LLMRequestModeMismatchError("Unsupported Gemini response parts for native text/tool history");
    }
    return {
        blocks,
        continuation,
        providerMetadata: {
            model: readOptionalString(root.model) ?? options.identity.model,
            ...(usage === undefined ? {} : { usage }),
        },
    };
}

/**
 * 增量归一化流式 GenerateContent 响应。
 *
 * @remarks
 * 普通 Part 按到达顺序发布块开始与增量事件；相邻同类型 Part 归并为一个块。
 * 严格结构化正文缓冲原文，终态后完成同一逆向投影再以 whole 块交付，不先发布哨兵原文。
 * 函数参数按整块交付不开启分片。截断、安全阻断、未知 Part 与无结束原因的 EOF 在
 * {@link finish} 阶段拒绝；已发布的块事件只用于观察，绝不产出 `completed`。
 *
 * @example
 * ```ts
 * const assembler = new GenerateContentStreamAssembler(options);
 * for (const chunk of chunks) yield* assembler.push(chunk);
 * yield* assembler.finish();
 * ```
 */
export class GenerateContentStreamAssembler {
    private nextIndex = 0;
    private text: { readonly index: number; readonly whole: boolean; raw: string; started: boolean } | undefined;
    private reasoning: { readonly index: number; text: string } | undefined;
    private readonly sealed: LLMContentBlock[] = [];
    private readonly continuationParts: GeminiContinuationPart[] = [];
    private finishReason: string | undefined;
    private blockedReason: string | undefined;
    private usage: NormalizedUsage | undefined;
    private sawChunk = false;
    private model: string | undefined;

    /** @param options - 请求与身份事实。 */
    constructor(private readonly options: GenerateContentResponseOptions) {}

    private structuredProjection(): boolean {
        const tools = this.options.request.tools;
        return this.options.request.structuredOutput !== undefined && (tools === undefined || tools.length === 0);
    }

    /**
     * @param chunk - 一条已反序列化的流 chunk。
     * @returns 块开始与增量事件。
     * @throws GeminiIncompleteResponseError chunk 结构不可归一或未知 Part 时抛出。
     */
    push(chunk: unknown): readonly LLMStreamEvent[] {
        const root = requireRecord(chunk, "stream chunk");
        this.sawChunk = true;
        this.model ??= readOptionalString(root.model);
        this.usage = extractUsage(root.usageMetadata) ?? this.usage;
        this.blockedReason ??= readBlockedReason(root);
        const candidate = asRecord((readArray(root.candidates) ?? [])[0]);
        const chunkFinishReason = candidate?.finishReason === undefined || candidate?.finishReason === null
            ? undefined : String(candidate.finishReason);
        if (chunkFinishReason !== undefined && chunkFinishReason !== "FINISH_REASON_UNSPECIFIED") {
            this.finishReason = chunkFinishReason;
        }
        const parts = asRecord(candidate?.content)?.parts;
        const rawParts = (readArray(parts) ?? []) as readonly GeminiContinuationPart[];
        if (rawParts.length === 0) return [];

        this.continuationParts.push(...structuredClone(rawParts) as GeminiContinuationPart[]);
        const events: LLMStreamEvent[] = [];
        for (const part of rawParts) {
            assertSupportedGeminiPart(part);
            if (typeof part.text === "string" && part.text.length > 0) {
                if (part.thought === true) {
                    if (!this.structuredProjection()) {
                        events.push(...this.sealText());
                    }
                    if (this.reasoning === undefined) {
                        this.reasoning = { index: this.nextIndex++, text: "" };
                        events.push({ kind: "content_block_started", index: this.reasoning.index, blockType: "reasoning", delivery: "incremental" });
                    }
                    this.reasoning.text += part.text;
                    events.push({ kind: "content_block_delta", index: this.reasoning.index, deltaKind: "reasoning", delta: part.text });
                    continue;
                }
                events.push(...this.sealReasoning());
                if (this.text === undefined) {
                    this.text = {
                        index: this.nextIndex++,
                        whole: this.structuredProjection(),
                        raw: "", started: false,
                    };
                }
                this.text.raw += part.text;
                if (!this.text.whole) {
                    if (!this.text.started) {
                        this.text.started = true;
                        events.push({ kind: "content_block_started", index: this.text.index, blockType: "text", delivery: "incremental", format: this.options.textFormat });
                    }
                    events.push({ kind: "content_block_delta", index: this.text.index, deltaKind: "text", delta: part.text });
                }
                continue;
            }
            if (part.functionCall !== undefined) {
                events.push(...this.sealText());
                events.push(...this.sealReasoning());
                const call: LLMToolCall = {
                    callId: part.functionCall.id ?? `call_${randomUUID()}`,
                    toolId: part.functionCall.name ?? "",
                    argumentsJson: JSON.stringify(part.functionCall.args ?? {}),
                };
                const block: LLMContentBlock = { index: this.nextIndex++, type: "tool_call", ...call };
                this.sealed.push(block);
                events.push({ kind: "content_block_started", index: block.index, blockType: "tool_call", delivery: "whole" });
                events.push({ kind: "content_block_completed", delivery: "whole", block });
            }
        }
        return events;
    }

    /**
     * 校验终态并产出块完成与响应完成事件。
     *
     * @returns 排序后的完成事件与唯一成功完成。
     * @throws GeminiIncompleteResponseError 空流、安全阻断、缺少结束原因或非法结束原因时抛出。
     * @throws LLMRequestModeMismatchError 响应 Parts 无法支撑原生历史时抛出。
     */
    finish(): readonly LLMStreamEvent[] {
        if (!this.sawChunk) throw new GeminiIncompleteResponseError("Gemini stream produced no chunks");
        const events: LLMStreamEvent[] = [];
        for (const event of this.sealReasoning()) events.push(event);
        for (const event of this.sealText()) events.push(event);
        assertNotBlocked(this.blockedReason);
        assertAcceptedGeminiFinishReason(this.finishReason, { requireKnownReason: true });

        const blocks = [...this.sealed].sort((left, right) => left.index - right.index);
        const continuation: ModelContinuation = {
            identity: this.options.identity,
            parts: this.continuationParts,
        };
        const message = {
            role: "assistant" as const,
            content: blocks.flatMap(block => block.type === "text" ? [block.text] : []).join(""),
            ...(blocks.some(block => block.type === "reasoning") ? {
                reasoning: blocks.flatMap(block => block.type === "reasoning" ? [block.text] : []).join(""),
            } : {}),
            ...(blocks.some(block => block.type === "tool_call") ? {
                toolCalls: blocks.flatMap(block => block.type === "tool_call"
                    ? [{ callId: block.callId, toolId: block.toolId, argumentsJson: block.argumentsJson }] : []),
            } : {}),
            continuation,
        };
        if (blocks.filter(block => block.type === "tool_call").length <= 1 && !isModelAssistantMessage(message)) {
            throw new LLMRequestModeMismatchError("Unsupported Gemini response parts for native text/tool history");
        }
        events.push({
            kind: "completed",
            response: {
                blocks,
                continuation,
                providerMetadata: {
                    model: this.model ?? this.options.identity.model,
                    ...(this.usage === undefined ? {} : { usage: this.usage }),
                },
            },
        });
        return events;
    }

    private sealReasoning(): readonly LLMStreamEvent[] {
        if (this.reasoning === undefined) return [];
        const block: LLMContentBlock = { index: this.reasoning.index, type: "reasoning", text: this.reasoning.text };
        this.reasoning = undefined;
        if (block.text.length === 0) return [];
        this.sealed.push(block);
        return [{ kind: "content_block_completed", delivery: "incremental", block }];
    }

    private sealText(): readonly LLMStreamEvent[] {
        if (this.text === undefined) return [];
        const current = this.text;
        this.text = undefined;
        if (current.raw.length === 0) return [];
        const block: LLMContentBlock = {
            index: current.index, type: "text", format: this.options.textFormat,
            text: current.whole
                ? restoreGeminiResponseProjection(current.raw, this.options.request.structuredOutput!.schema)
                : current.raw,
        };
        this.sealed.push(block);
        return current.whole
            ? [
                { kind: "content_block_started", index: current.index, blockType: "text", delivery: "whole", format: this.options.textFormat },
                { kind: "content_block_completed", delivery: "whole", block },
            ]
            : [{ kind: "content_block_completed", delivery: "incremental", block }];
    }
}

function assertAcceptedGeminiFinishReason(
    finishReason: string | undefined,
    options: { readonly requireKnownReason: boolean },
): void {
    if (finishReason === undefined) {
        if (!options.requireKnownReason) return;
        throw new GeminiIncompleteResponseError("Gemini response ended without a finish reason");
    }
    if (finishReason === "STOP") return;
    throw new GeminiIncompleteResponseError(`Gemini response did not complete normally (${finishReason})`);
}

/** 被安全策略阻断的提示词不属于成功响应。 */
function assertNotBlocked(blockReason: unknown): void {
    const reason = typeof blockReason === "string" && blockReason.length > 0 ? blockReason : undefined;
    if (reason === undefined) return;
    throw new GeminiIncompleteResponseError(`Gemini response was blocked (${reason})`);
}

function readBlockedReason(chunk: Record<string, unknown>): string | undefined {
    const reason = asRecord(chunk.promptFeedback)?.blockReason;
    return typeof reason === "string" && reason.length > 0 ? reason : undefined;
}

/** 未知或空白 Part 在供应商边界拒绝，不静默丢弃后宣称成功。 */
function assertSupportedGeminiPart(part: GeminiContinuationPart): void {
    if (typeof part.text === "string" || part.functionCall !== undefined) return;
    throw new LLMRequestModeMismatchError("Unsupported Gemini response parts for native text/tool history");
}

function normalizeParts(
    parts: readonly unknown[],
    options: GenerateContentResponseOptions,
    sink: {
        onTextSegment(segments: string[]): void;
        onReasoningSegment(segments: string[]): void;
        onToolCall(call: LLMToolCall): void;
    },
): void {
    let textSegment: string[] = [];
    let reasoningSegment: string[] = [];
    const flushText = (): void => {
        if (textSegment.length === 0) return;
        const segments = textSegment;
        textSegment = [];
        sink.onTextSegment(segments);
    };
    const flushReasoning = (): void => {
        if (reasoningSegment.length === 0) return;
        const segments = reasoningSegment;
        reasoningSegment = [];
        sink.onReasoningSegment(segments);
    };
    for (const part of parts) {
        const typed = part as GeminiContinuationPart;
        assertSupportedGeminiPart(typed);
        if (typeof typed.text === "string" && typed.text.length > 0) {
            if (typed.thought === true) {
                flushText();
                reasoningSegment.push(typed.text);
            } else {
                flushReasoning();
                textSegment.push(typed.text);
            }
            continue;
        }
        if (typed.functionCall !== undefined) {
            flushText();
            flushReasoning();
            sink.onToolCall({
                callId: typed.functionCall.id ?? `call_${randomUUID()}`,
                toolId: typed.functionCall.name ?? "",
                argumentsJson: JSON.stringify(typed.functionCall.args ?? {}),
            });
        }
    }
    flushText();
    flushReasoning();
}

function continuationOf(
    identity: NativeConversationIdentity,
    parts: readonly unknown[],
): ModelContinuation {
    return {
        identity,
        parts: structuredClone(parts) as GeminiContinuationPart[],
    };
}

/** 从 Gemini 响应的 `usageMetadata` 提取归一化用量；核心字段非法时整体缺省。 */
function extractUsage(value: unknown): NormalizedUsage | undefined {
    const usage = asRecord(value);
    if (usage === undefined) return undefined;
    const inputTokens = toSafeTokenCount(usage.promptTokenCount);
    const outputTokens = toSafeTokenCount(usage.candidatesTokenCount);
    if (inputTokens === undefined || outputTokens === undefined) {
        return undefined;
    }
    const cachedInputTokens = toSafeTokenCount(usage.cachedContentTokenCount);
    return cachedInputTokens === undefined
        ? { inputTokens, outputTokens }
        : { inputTokens, outputTokens, cachedInputTokens };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    const record = asRecord(value);
    if (record === undefined) {
        throw new GeminiIncompleteResponseError(`GenerateContent ${label} was not an object`);
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
