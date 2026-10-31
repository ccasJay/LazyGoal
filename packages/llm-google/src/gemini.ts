import { isRecord } from "../../contracts/src/index";
import {
    isModelAssistantMessage,
    sameNativeIdentity,
    type NativeConversationIdentity,
    type GeminiContinuationPart,
} from "../../model-contracts/src/index";
import { randomUUID } from "node:crypto";
import { 
    GoogleGenAI,
    type Content,
    type GenerateContentParameters
} from "@google/genai";

import type { JsonSchema202012 } from "../../contracts/src/index";
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
    type NormalizedUsage,
    type StructuredOutputMode,
} from "../../llm-core/src/index";
import { extractGeminiUsage } from "./usage";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";

type GeminiInput = Pick<
    GenerateContentParameters,
    "contents" | "config" //选择两个属性
>;

/**
 * 原生 Gemini的显式连接配置。
 * @remarks 请求的 maxOutputTokens 优先于配置默认值；不额外查询环境凭据。
 * @example
 * ```ts
 * const config: GeminiConfig = {
 *     apiKey: "secret", model: "model-id",
 *     structuredOutputMode: "strict", maxOutputTokens: 4096,
 * };
 * ```
 */
export interface GeminiConfig {
    /** Google Gen AI 服务使用的 API Key。 */
    apiKey: string;
    /** 完整 API 前缀（包含所需版本路径）；省略时使用 SDK 官方地址与默认版本。 */
    baseURL?: string;
    /** 每次生成请求使用的 Gemini 模型名称。 */
    model: string;
    /** 固定的结构化输出模式。 */
    structuredOutputMode: StructuredOutputMode;
    /** 请求未指定上限时使用的最大输出 Token。 */
    maxOutputTokens?: number;
}

const GEMINI_NULL_SENTINEL = "__lazygoal_null__";
const GEMINI_ABSENT_SENTINEL = "__lazygoal_absent__";

/**
 * 使用 Google Gen AI SDK 调用 Gemini 的 Adapter。
 *
 * @remarks
 * system 消息合并为 `systemInstruction`，assistant 映射为 Gemini 的 model
 * 角色，其余消息保持顺序。响应按真实 Part 顺序输出正文、公开 reasoning 与工具调用块，
 * 相邻同类型 Part 归并为一个块并按内容直接连接；SDK 异常原样传播。
 * 在 strict 模式下将结构 Schema 转换后映射为 `responseMimeType: "application/json"` 与 `responseSchema`；
 * 枚举补齐类型，nullable 由 SDK 转换；对象联合投影为字段并集与必填交集。
 * 联合分支约束和 additionalProperties 仍由 Agent 本地契约严格校验。
 * 在 prompt_only 模式下不传递任何原生结构 Schema 参数。
 * 若请求的结构化配置与 Adapter 固定模式不匹配，在发起网络请求前抛出 `LLMRequestModeMismatchError`。
 * 响应携带 `usageMetadata` 时将其归一化写入 `providerMetadata.usage`
 * 中；缺失或非标准值写为 `undefined`。
 *
 * @example
 * ```ts
 * const adapter = new Gemini({
 *     apiKey: "secret", model: "model-id", structuredOutputMode: "strict",
 * });
 * const response = await adapter.generate({
 *     messages: [{ role: "user", content: "hello" }],
 * });
 * ```
 */
export class Gemini implements LLMAdapter {
    readonly structuredOutputMode: StructuredOutputMode;
    /** 同一 Gemini 端点和模型的原生回放身份。 */
    readonly nativeConversationIdentity: NativeConversationIdentity;
    private readonly client: GoogleGenAI;
    private readonly model: string;
    private readonly maxOutputTokens: number | undefined;

    constructor(config: GeminiConfig) {
        this.structuredOutputMode = config.structuredOutputMode;
        this.nativeConversationIdentity = {
            provider: "google", endpoint: (config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, ""),
            model: config.model, protocol: "gemini-content",
        };
        this.client = new GoogleGenAI({
            apiKey: config.apiKey,
            httpOptions: { retryOptions: { attempts: 1 } },
            ...(config.baseURL !== undefined ? { httpOptions: { baseUrl: config.baseURL, apiVersion: "", retryOptions: { attempts: 1 } } } : {}),
        });
        this.model = config.model;
        this.maxOutputTokens = config.maxOutputTokens;
    }

    /**
     * @param request - 供应商无关的消息请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Gemini 响应归一化后的有序完整内容块。
     * @throws Google Gen AI SDK 暴露的网络、鉴权、限流或协议异常；中止时抛出
     *   `ExecutionAbortedError`；请求参数模式不匹配时抛出 `LLMRequestModeMismatchError`。
     */
    async generate(
        request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        throwIfAborted(control);
        this.assertRequestMode(request);
        const input = this.buildInput(request, control);

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                ...input,
            });
            throwIfAborted(control);
            const usage = extractGeminiUsage(response.usageMetadata);

            const candidate = response.candidates?.[0];
            assertAcceptedGeminiFinishReason(
                candidate?.finishReason === undefined || candidate.finishReason === null
                    ? undefined
                    : String(candidate.finishReason),
                { requireKnownReason: false },
            );
            assertNotBlocked(response.promptFeedback?.blockReason);
            const parts = candidate?.content?.parts;
            const structuredProjection = (this.structuredOutputMode === "strict" || this.structuredOutputMode === "two_stage")
                && request.structuredOutput !== undefined && !request.tools?.length;
            const textFormat: LLMTextBlockFormat = structuredProjection ? "json" : "plain";
            const blocks: LLMContentBlock[] = [];
            const toolCalls: LLMToolCall[] = [];

            if (parts !== undefined) {
                // 相邻同类型 Part 归并为一个块：正文按 Part 顺序直接连接，块边界由真实 Part 切换表达。
                let textSegment: string[] = [];
                let reasoningSegment: string[] = [];
                const flushText = (): void => {
                    if (textSegment.length === 0) return;
                    const rawText = textSegment.join("");
                    textSegment = [];
                    if (rawText.length === 0) return;
                    blocks.push({
                        index: blocks.length, type: "text", format: textFormat,
                        text: structuredProjection
                            ? restoreGeminiResponseProjection(rawText, request.structuredOutput!.schema)
                            : rawText,
                    });
                };
                const flushReasoning = (): void => {
                    if (reasoningSegment.length === 0) return;
                    const text = reasoningSegment.join("");
                    reasoningSegment = [];
                    if (text.length === 0) return;
                    blocks.push({ index: blocks.length, type: "reasoning", text });
                };
                for (const part of parts) {
                    if (typeof part.text === "string" && part.text.length > 0) {
                        if (part.thought === true) {
                            flushText();
                            reasoningSegment.push(part.text);
                        } else {
                            flushReasoning();
                            textSegment.push(part.text);
                        }
                        continue;
                    }
                    if (part.functionCall !== undefined) {
                        flushText();
                        flushReasoning();
                        const call: LLMToolCall = {
                            callId: (part.functionCall as any).id ?? `call_${randomUUID()}`,
                            toolId: part.functionCall.name ?? "",
                            argumentsJson: JSON.stringify(part.functionCall.args ?? {}),
                        };
                        toolCalls.push(call);
                        blocks.push({ index: blocks.length, type: "tool_call", ...call });
                    }
                }
                flushText();
                flushReasoning();
            } else {
                const rawText = response.text ?? "";
                if (rawText.length > 0) {
                    blocks.push({
                        index: 0, type: "text", format: textFormat,
                        text: structuredProjection
                            ? restoreGeminiResponseProjection(rawText, request.structuredOutput!.schema)
                            : rawText,
                    });
                }
            }

            const continuation = {
                identity: this.nativeConversationIdentity,
                parts: structuredClone(parts ?? []) as readonly GeminiContinuationPart[],
            };
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
                    model: this.model,
                    ...(usage !== undefined ? { usage } : {}),
                },
            };
        } catch (error) {
            throw this.classifyFailure(error, control);
        }
    }

    /**
     * 以 generateContent 流交付有序块事件，并在正常 EOF 后给出最终响应。
     *
     * @remarks
     * 请求配置与 `generate()` 共享，保持 ANY／AUTO／NONE、输出上限与 Schema 不变性。
     * 普通文本按真实 Part 增量交付；相邻同类型 Part 归并为一个块，其它 Part 类型打断块边界。
     * 严格结构化文本缓冲原文，收齐后完成同一逆向投影再以 `whole` 块交付，不先发布哨兵原文。
     * 完整函数参数按整块交付，不开启协议不支持的参数分片；续接 Parts 与签名按到达顺序原样保存。
     * 截断、安全阻断、未知 Part 与无正常结束的 EOF 明确拒绝，且不切换到非流式重发。
     *
     * @param request - 供应商无关的消息请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 带真实 Part 边界的块事件与唯一成功完成。
     */
    async *stream(
        request: LLMRequest,
        control?: ExecutionControl,
    ): AsyncIterable<LLMStreamEvent> {
        throwIfAborted(control);
        this.assertRequestMode(request);
        const input = this.buildInput(request, control);
        const structuredProjection = (this.structuredOutputMode === "strict" || this.structuredOutputMode === "two_stage")
            && request.structuredOutput !== undefined && !request.tools?.length;
        const textFormat: LLMTextBlockFormat = structuredProjection ? "json" : "plain";
        yield { kind: "started" };

        try {
            const sdkStream = await this.client.models.generateContentStream({ model: this.model, ...input });
            let nextIndex = 0;
            let text: { readonly index: number; readonly whole: boolean; raw: string; started: boolean } | undefined;
            let reasoning: { readonly index: number; text: string } | undefined;
            const sealed: LLMContentBlock[] = [];
            const continuationParts: GeminiContinuationPart[] = [];
            let finishReason: string | undefined;
            let blockedReason: string | undefined;
            let usage: NormalizedUsage | undefined;
            let sawChunk = false;

            const sealReasoning = (): readonly LLMStreamEvent[] => {
                if (reasoning === undefined) return [];
                const block: LLMContentBlock = { index: reasoning.index, type: "reasoning", text: reasoning.text };
                reasoning = undefined;
                if (block.text.length === 0) return [];
                sealed.push(block);
                return [{ kind: "content_block_completed", delivery: "incremental", block }];
            };
            const sealText = (): readonly LLMStreamEvent[] => {
                if (text === undefined) return [];
                const current = text;
                text = undefined;
                if (current.raw.length === 0) return [];
                const block: LLMContentBlock = {
                    index: current.index, type: "text", format: textFormat,
                    text: current.whole
                        ? restoreGeminiResponseProjection(current.raw, request.structuredOutput!.schema)
                        : current.raw,
                };
                sealed.push(block);
                return current.whole
                    ? [
                        { kind: "content_block_started", index: current.index, blockType: "text", delivery: "whole", format: textFormat },
                        { kind: "content_block_completed", delivery: "whole", block },
                    ]
                    : [{ kind: "content_block_completed", delivery: "incremental", block }];
            };

            const iterator = sdkStream[Symbol.asyncIterator]();
            let primaryError: unknown;
            try {
            while (true) {
                const next = await iterator.next();
                if (next.done === true) break;
                throwIfAborted(control);
                const chunk = next.value;
                sawChunk = true;
                usage = extractGeminiUsage(chunk.usageMetadata) ?? usage;
                    blockedReason ??= readGeminiBlockedReason(chunk);
                    const candidate = chunk.candidates?.[0];
                    const chunkFinishReason = candidate?.finishReason === undefined || candidate.finishReason === null
                        ? undefined : String(candidate.finishReason);
                    if (chunkFinishReason !== undefined && chunkFinishReason !== "FINISH_REASON_UNSPECIFIED") {
                        finishReason = chunkFinishReason;
                    }
                    const parts = candidate?.content?.parts;
                    if (parts === undefined || parts.length === 0) continue;
                    continuationParts.push(...structuredClone(parts) as readonly GeminiContinuationPart[]);

                    for (const part of parts) {
                        assertSupportedGeminiPart(part);
                        if (typeof part.text === "string" && part.text.length > 0) {
                            if (part.thought === true) {
                                if (!structuredProjection) {
                                    for (const event of sealText()) yield event;
                                }
                                if (reasoning === undefined) {
                                    reasoning = { index: nextIndex++, text: "" };
                                    yield { kind: "content_block_started", index: reasoning.index, blockType: "reasoning", delivery: "incremental" };
                                }
                                reasoning.text += part.text;
                                yield { kind: "content_block_delta", index: reasoning.index, deltaKind: "reasoning", delta: part.text };
                                continue;
                            }
                            for (const event of sealReasoning()) yield event;
                            if (text === undefined) {
                                text = { index: nextIndex++, whole: structuredProjection, raw: "", started: false };
                            }
                            text.raw += part.text;
                            if (!text.whole) {
                                if (!text.started) {
                                    text.started = true;
                                    yield { kind: "content_block_started", index: text.index, blockType: "text", delivery: "incremental", format: textFormat };
                                }
                                yield { kind: "content_block_delta", index: text.index, deltaKind: "text", delta: part.text };
                            }
                            continue;
                        }
                        if (part.functionCall !== undefined) {
                            for (const event of sealText()) yield event;
                            for (const event of sealReasoning()) yield event;
                            const call: LLMToolCall = {
                                callId: (part.functionCall as any).id ?? `call_${randomUUID()}`,
                                toolId: part.functionCall.name ?? "",
                                argumentsJson: JSON.stringify(part.functionCall.args ?? {}),
                            };
                            const block: LLMContentBlock = { index: nextIndex++, type: "tool_call", ...call };
                            sealed.push(block);
                            yield { kind: "content_block_started", index: block.index, blockType: "tool_call", delivery: "whole" };
                            yield { kind: "content_block_completed", delivery: "whole", block };
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
            if (!sawChunk) throw new GeminiIncompleteResponseError("Gemini stream produced no chunks");
            for (const event of sealReasoning()) yield event;
            for (const event of sealText()) yield event;
            assertNotBlocked(blockedReason);
            if (finishReason === undefined) {
                throw new GeminiIncompleteResponseError("Gemini stream ended without a finish reason");
            }
            assertAcceptedGeminiFinishReason(finishReason, { requireKnownReason: true });

            const blocks = [...sealed].sort((left, right) => left.index - right.index);
            const continuation = {
                identity: this.nativeConversationIdentity,
                parts: continuationParts,
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

            yield {
                kind: "completed",
                response: {
                    blocks,
                    continuation,
                    providerMetadata: {
                        model: this.model,
                        ...(usage !== undefined ? { usage } : {}),
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
                    "Gemini adapter is configured with 'strict' mode, but LLMRequest does not provide structuredOutput",
                );
            }
        } else if (this.structuredOutputMode === "prompt_only") {
            if (request.structuredOutput !== undefined) {
                throw new LLMRequestModeMismatchError(
                    "Gemini adapter is configured with 'prompt_only' mode, but LLMRequest provides structuredOutput",
                );
            }
        }
    }

    /** 共享请求配置：消息、输出上限、结构 Schema、工具声明与中止信号。 */
    private buildInput(request: LLMRequest, control?: ExecutionControl): GeminiInput {
        const input = toGeminiInput(request.messages, this.nativeConversationIdentity, request.maxOutputTokens ?? this.maxOutputTokens);

        if ((this.structuredOutputMode === "strict" || this.structuredOutputMode === "two_stage") && request.structuredOutput !== undefined && !request.tools?.length) {
            input.config = {
                ...input.config,
                responseMimeType: "application/json",
                responseSchema: prepareGeminiSchema(request.structuredOutput.schema),
            };
        }

        if (request.tools !== undefined && request.tools.length > 0) {
            input.config = {
                ...input.config,
                tools: [{
                    functionDeclarations: request.tools.map(t => ({
                        name: t.id,
                        description: t.description,
                        parameters: prepareGeminiSchema(t.parametersSchema as unknown as JsonSchema202012),
                    })),
                }],
                toolConfig: {
                    functionCallingConfig: {
                        mode: (request.toolChoice === "required"
                            ? "ANY"
                            : request.toolChoice === "none"
                            ? "NONE"
                            : "AUTO") as any,
                    },
                },
            };
        }

        if (control?.signal !== undefined) {
            input.config = {
                ...input.config,
                abortSignal: control.signal,
            };
        }
        return input;
    }

    private classifyFailure(error: unknown, control: ExecutionControl | undefined): unknown {
        if (isExecutionAbortedError(error)) return error;
        if (control?.signal?.aborted) return new ExecutionAbortedError();
        const transientFailure = classifyTransientModelFailure(error);
        return transientFailure ?? error;
    }
}



/**
 * Gemini 响应未以可接受方式完成。
 *
 * @remarks
 * 长度截断、安全阻断、内容过滤、未知 Part 或无有效结束的 EOF 在供应商边界抛出；
 * 非暂时故障，不触发适配器内部重试、协议迁移或非流式降级。
 *
 * @example
 * ```ts
 * throw new GeminiIncompleteResponseError("Gemini response was blocked (SAFETY)");
 * ```
 */
export class GeminiIncompleteResponseError extends Error {
    readonly code = "GEMINI_INCOMPLETE_RESPONSE";

    constructor(message: string) {
        super(message);
        this.name = "GeminiIncompleteResponseError";
    }
}

const REJECTED_GEMINI_FINISH_REASONS = new Set([
    "MAX_TOKENS", "SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT",
    "SPII", "MALFORMED_FUNCTION_CALL", "IMAGE_SAFETY", "UNEXPECTED_TOOL_CALL",
    "TOO_MANY_TOOL_CALLS", "MISSING_THOUGHT_SIGNATURE", "OTHER",
]);

/** 拒绝供应商明确报告的截断、安全阻断与异常结束；流式路径还要求存在结束原因。 */
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
function assertNotBlocked(blockReason: string | undefined): void {
    if (blockReason === undefined) return;
    throw new GeminiIncompleteResponseError(`Gemini response was blocked (${blockReason})`);
}

function readGeminiBlockedReason(chunk: { readonly promptFeedback?: { readonly blockReason?: string } }): string | undefined {
    const reason = chunk.promptFeedback?.blockReason;
    return typeof reason === "string" && reason.length > 0 ? reason : undefined;
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

/** 未知或空白 Part 在供应商边界拒绝，不静默丢弃后宣称成功。 */
function assertSupportedGeminiPart(part: { readonly text?: string; readonly functionCall?: unknown }): void {
    if (typeof part.text === "string" || part.functionCall !== undefined) return;
    throw new LLMRequestModeMismatchError("Unsupported Gemini response parts for native text/tool history");
}

/** 将统一消息转换为 Gemini contents 与可选 systemInstruction。 */
function toGeminiInput(
    messages: readonly LLMMessage[],
    identity: NativeConversationIdentity,
    maxOutputTokens?: number,
): GeminiInput {
    const systemInstruction: string[] = [];
    const contents: Content[] = [];

    for (const msg of messages) {
        switch (msg.role) {
            case "system": 
                systemInstruction.push(msg.content);
                break;
            case "user":
                contents.push({
                    role: "user",
                    parts: [{text: msg.content}],
                });
                break;
            case "assistant":
                if (msg.continuation !== undefined && !sameNativeIdentity(msg.continuation.identity, identity)) {
                    throw new LLMRequestModeMismatchError("Native history belongs to another provider, endpoint, model or protocol");
                }
                contents.push({
                    role: "model",
                    parts: msg.continuation?.parts !== undefined
                        ? structuredClone(msg.continuation.parts) as NonNullable<Content["parts"]>
                        : [{ text: msg.content }],
                });
                break;
            case "tool": {
                const previous = contents.at(-1)?.parts?.find(part => part.functionCall?.name === msg.toolId)?.functionCall;
                contents.push({ role: "user", parts: [{ functionResponse: {
                    name: msg.toolId, ...(previous?.id === undefined ? {} : { id: previous.id }),
                    response: JSON.parse(msg.content) as Record<string, unknown>,
                } }] });
                break;
            }
        }
    }

    const input: GeminiInput = {
        contents,
    };

    if (systemInstruction.length > 0) {
        input.config = {
            systemInstruction: systemInstruction.join("\n"),
        };
    }
    if (maxOutputTokens !== undefined) {
        input.config = {
            ...input.config,
            maxOutputTokens,
        };
    }
    return input;
}

/** 投影为 Gemini 支持的结构约束；SDK 完成原生类型序列化，本地契约保持不变。 */
function prepareGeminiSchema(
    schema: JsonSchema202012,
    path: readonly string[] = [],
): JsonSchema202012 {
    const result = { ...schema };
    if (Array.isArray(schema.enum)) {
        const values = schema.enum;
        if (values.every(value => typeof value === "string")) {
            result.type = "string";
        } else if (values.every(value => typeof value === "number")) {
            // 数值 literal 保持数值语义，不转成字符串枚举。
            const branches = values.map(value => ({
                type: Number.isInteger(value) ? "integer" : "number",
                minimum: value, maximum: value,
            }));
            delete result.enum;
            if (branches.length === 1) Object.assign(result, branches[0]);
            else result.anyOf = branches;
        } else {
            throw new Error("Gemini responseSchema only supports string or numeric enums");
        }
    }
    if (schema.properties !== undefined) {
        result.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, JsonSchema202012>).map(([key, value]) =>
            [key, prepareGeminiSchema(value as JsonSchema202012, [...path, "properties", key])]));
    }
    if (schema.items !== undefined) {
        result.items = prepareGeminiSchema(schema.items as JsonSchema202012, [...path, "items"]);
    }
    if (Array.isArray(schema.anyOf)) {
        delete result.anyOf;
        Object.assign(result, mergeGeminiUnion(
            schema.anyOf.map(value => prepareGeminiSchema(value as JsonSchema202012, path)),
            path,
        ));
    }
    return result;
}

/** 将 Google provider projection 的省略字段和占位值逆向归一为 Wire 结构。 */
function restoreGeminiResponseProjection(content: string, schema: JsonSchema202012): string {
    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch {
        return content;
    }

    if (isRecord(value) && isRecord(value.result)) {
        const result = value.result;

        // 1. 若具有有效的 action 对象，确认为 tool_call；否则按摘要恢复 complete。
        // 2. 依据同源生成分支 Schema 删除跨分支字段，不再维护 kind 字段表。
        if (isRecord(result.action)) {
            result.kind = "tool_call";
            delete result.type;
        } else if (result.action === null || result.action === undefined) {
            delete result.action;
            if (result.kind === "tool_call" && typeof result.summary === "string") {
                result.kind = "complete";
            }
        }
        const branch = selectResponseBranch(schema, result);
        if (branch !== undefined) stripCrossBranchFields(result, branch);
    }

    restoreGeminiProjectedValue(value, schema);
    return JSON.stringify(value);
}

/** 从显示 Schema 中按判别值和工具身份选择当前响应分支。 */
function selectResponseBranch(
    schema: JsonSchema202012,
    result: Record<string, unknown>,
): JsonSchema202012 | undefined {
    const resultSchema = isRecord(schema.properties)
        ? schema.properties.result as JsonSchema202012 | undefined
        : undefined;
    if (resultSchema === undefined) return undefined;
    if (!Array.isArray(resultSchema.anyOf)) return resultSchema;

    const kind = typeof result.kind === "string" ? result.kind : undefined;
    const action = isRecord(result.action) ? result.action : undefined;
    const toolId = typeof action?.toolId === "string" ? action.toolId : undefined;
    const branches = resultSchema.anyOf as readonly JsonSchema202012[];
    const sameKind = branches.filter(branch => branchKind(branch) === kind);
    if (sameKind.length <= 1) return sameKind[0];
    if (toolId !== undefined) {
        const matchedTool = sameKind.find(branch => branchToolId(branch) === toolId);
        if (matchedTool !== undefined) return matchedTool;
    }
    return sameKind[0];
}

function branchKind(branch: JsonSchema202012): string | undefined {
    const kind = isRecord(branch.properties)
        ? branch.properties.kind as JsonSchema202012 | undefined
        : undefined;
    return Array.isArray(kind?.enum) && typeof kind.enum[0] === "string" ? kind.enum[0] : undefined;
}

function branchToolId(branch: JsonSchema202012): string | undefined {
    if (!isRecord(branch.properties) || !isRecord(branch.properties.action)) return undefined;
    const properties = branch.properties.action.properties;
    if (!isRecord(properties) || !isRecord(properties.toolId)) return undefined;
    const toolId = properties.toolId as JsonSchema202012;
    return Array.isArray(toolId.enum) && typeof toolId.enum[0] === "string" ? toolId.enum[0] : undefined;
}

function stripCrossBranchFields(
    result: Record<string, unknown>,
    branch: JsonSchema202012,
): void {
    if (!isRecord(branch.properties)) return;
    const allowed = new Set(Object.keys(branch.properties));
    for (const key of Object.keys(result)) {
        if (allowed.has(key)) continue;
        if (key === "completionEvidence"
            && result[key] !== GEMINI_ABSENT_SENTINEL
            && result[key] !== null) continue;
        delete result[key];
    }
}

/** 只沿唯一匹配的 Wire 联合分支恢复 nullable 字段和紧凑 completion evidence。 */
function restoreGeminiProjectedValue(value: unknown, schema: JsonSchema202012): boolean {
    if (Array.isArray(schema.anyOf)) {
        const matches = schema.anyOf.filter(branch => matchesKnownSchemaShape(value, branch as JsonSchema202012));
        return matches.length === 1
            ? restoreGeminiProjectedValue(value, matches[0] as JsonSchema202012)
            : false;
    }
    if (schema.type === "array" && Array.isArray(value) && schema.items !== undefined) {
        return value.reduce((changed, item) =>
            restoreGeminiProjectedValue(item, schema.items as JsonSchema202012) || changed, false);
    }
    if (schema.type !== "object" || !isRecord(value) || schema.properties === undefined) return false;

    const properties = schema.properties as Record<string, JsonSchema202012>;
    const required = new Set(Array.isArray(schema.required) ? schema.required as readonly string[] : []);
    let changed = false;
    for (const key of Object.keys(value)) {
        if (!(key in properties) && key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL) {
            delete value[key];
            changed = true;
        }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
        if (!(key in value)) {
            if (required.has(key) && schemaAllowsNull(propertySchema)) {
                value[key] = null;
                changed = true;
            }
            continue;
        }
        if (value[key] === GEMINI_NULL_SENTINEL && schemaAllowsNull(propertySchema)) {
            value[key] = null;
            changed = true;
            continue;
        }
        if (key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL) {
            delete value[key];
            changed = true;
            continue;
        }
        if (key === "completionEvidence" && propertySchema.type === "array" && typeof value[key] === "string") {
            const parsed = parseGeminiCompletionEvidence(value[key]);
            if (parsed !== undefined) {
                value[key] = parsed;
                changed = true;
                continue;
            }
        }
        changed = restoreGeminiProjectedValue(value[key], propertySchema) || changed;
    }
    return changed;
}

/** 用响应中已存在的字段选择联合分支，不把缺失必填字段视为匹配失败。 */
function matchesKnownSchemaShape(value: unknown, schema: JsonSchema202012): boolean {
    if (value === GEMINI_NULL_SENTINEL && schemaAllowsNull(schema)) return true;
    if (schema.nullable === true && value === null) return true;
    if (Array.isArray(schema.anyOf)) {
        return schema.anyOf.some(branch => matchesKnownSchemaShape(value, branch as JsonSchema202012));
    }
    if (Array.isArray(schema.enum) && !schema.enum.some(candidate => Object.is(candidate, value))) return false;
    switch (schema.type) {
        case "null": return value === null;
        case "string": return typeof value === "string";
        case "boolean": return typeof value === "boolean";
        case "integer": return typeof value === "number" && Number.isInteger(value);
        case "number": return typeof value === "number" && Number.isFinite(value);
        case "array":
            return Array.isArray(value) && (schema.items === undefined
                || value.every(item => matchesKnownSchemaShape(item, schema.items as JsonSchema202012)));
        case "object": {
            if (!isRecord(value) || schema.properties === undefined) return false;
            const properties = schema.properties as Record<string, JsonSchema202012>;
            if (schema.additionalProperties === false && Object.keys(value).some(key =>
                !(key in properties) && !(key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL))) return false;
            return Object.entries(value).every(([key, propertyValue]) =>
                properties[key] === undefined
                    || (key === "completionEvidence"
                        && properties[key]!.type === "array"
                        && (propertyValue === GEMINI_ABSENT_SENTINEL
                            || parseGeminiCompletionEvidence(propertyValue) !== undefined))
                    || matchesKnownSchemaShape(propertyValue, properties[key]!));
        }
        default:
            return true;
    }
}

function parseGeminiCompletionEvidence(
    value: unknown,
): readonly { criterionIndex: number; evidenceSequences: readonly number[] }[] | undefined {
    if (typeof value !== "string" || value.length === 0 || value === GEMINI_ABSENT_SENTINEL) return undefined;

    const seenCriteria = new Set<number>();
    const evidence: { criterionIndex: number; evidenceSequences: readonly number[] }[] = [];
    for (const segment of value.split(";")) {
        const fields = segment.split(":");
        if (fields.length !== 2) return undefined;
        const criterionIndex = parseGeminiSafeInteger(fields[0]!);
        if (criterionIndex === undefined || seenCriteria.has(criterionIndex)) return undefined;

        const sequenceValues = fields[1]!.split(",");
        if (sequenceValues.length === 0 || sequenceValues.some(sequence => sequence.length === 0)) return undefined;
        const evidenceSequences: number[] = [];
        for (const sequence of sequenceValues) {
            const parsed = parseGeminiSafeInteger(sequence);
            if (parsed === undefined) return undefined;
            evidenceSequences.push(parsed);
        }

        seenCriteria.add(criterionIndex);
        evidence.push({ criterionIndex, evidenceSequences });
    }
    return evidence.length === 0 ? undefined : evidence;
}

function parseGeminiSafeInteger(value: string): number | undefined {
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function schemaAllowsNull(schema: JsonSchema202012): boolean {
    return schema.type === "null"
        || schema.nullable === true
        || (Array.isArray(schema.anyOf)
            && schema.anyOf.some(branch => schemaAllowsNull(branch as JsonSchema202012)));
}

/** 合并决策判别联合，转换 nullable，并保持内部对象联合的独立分支。 */
function mergeGeminiUnion(
    branches: readonly JsonSchema202012[],
    path: readonly string[],
): JsonSchema202012 {
    const nullable = branches.some(branch => branch.type === "null" || branch.nullable === true);
    const values = [...new Map(branches.filter(branch => branch.type !== "null")
        .map(branch => [JSON.stringify(branch), branch])).values()];
    if (values.length === 0) return { type: "null" };
    const withNullability = (schema: JsonSchema202012): JsonSchema202012 =>
        nullable ? { ...schema, nullable: true } : schema;
    if (values.length === 1) return withNullability(values[0]!);

    if (values.every(branch => branch.type === "object")) {
        const properties = values.map(branch => branch.properties as Record<string, JsonSchema202012>);
        const requiredByBranch = values.map(branch => branch.required as readonly string[]);
        const required = requiredByBranch[0]!.filter(key =>
            requiredByBranch.every(branchRequired => branchRequired.includes(key)));
        const discriminator = required.find(key => properties.every(shape =>
            Array.isArray(shape[key]?.enum) && shape[key]!.enum!.length === 1));
        const mayFlatten = path.join(".") === "properties.result"
            || path.join(".") === "properties.result.properties.action";

        if (mayFlatten && discriminator !== undefined) {
            const keys = [...new Set(properties.flatMap(Object.keys))];
            const discriminatorValues = properties.map(shape =>
                (shape[discriminator]!.enum as readonly unknown[])[0]);
            const description = "Return one selected variant. Branch-specific properties are required only for the discriminator values listed below. "
                + values.map((branch, index) =>
                    `${discriminator}=${JSON.stringify(discriminatorValues[index])}: ${JSON.stringify(branch.required)}`,
                ).join("; ");
            return withNullability({
                type: "object",
                description,
                properties: Object.fromEntries(keys.map(key => {
                    let merged = mergeGeminiUnion(
                        properties.flatMap(shape => shape[key] === undefined ? [] : [shape[key]!]),
                        [...path, "properties", key],
                    );
                    const requiredWhen = [...new Set(values.flatMap((_, index) =>
                        requiredByBranch[index]!.includes(key) ? [discriminatorValues[index]] : []))];
                    if (
                        path.join(".") === "properties.result"
                        && ["summary", "reason", "question", "error"].includes(key)
                        && merged.type === "string"
                    ) {
                        merged = { ...merged, maxLength: "2000" };
                    }
                    if (path.join(".") === "properties.result" && key === "summary") {
                        merged = {
                            ...merged,
                            type: "string",
                            maxLength: "2000",
                            nullable: true,
                            description: 'Required. If kind="complete", provide the task completion summary. For any other kind, return null.',
                        };
                        delete (merged as any).enum;
                    }
                    if (path.join(".") === "properties.result" && key === "action") {
                        merged = {
                            ...merged,
                            nullable: true,
                            description: 'Required. If kind="tool_call", provide the tool action object. For any other kind, return null.',
                        };
                    }
                    if (path.join(".") === "properties.result" && ["reason", "error", "need", "question", "filters"].includes(key)) {
                        merged = {
                            ...merged,
                            nullable: true,
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "kind" && discriminatorValues.includes("tool_call")) {
                        merged = {
                            ...merged,
                            description: "Select exactly one result shape: kind=\"tool_call\" requires action and completionEvidence=\"__lazygoal_absent__\" and forbids summary, reason, and error; kind=\"complete\" requires summary and compact completionEvidence and forbids action; kind=\"wait\" requires reason and completionEvidence=\"__lazygoal_absent__\" and forbids action, summary, and error; kind=\"fail\" requires error and completionEvidence=\"__lazygoal_absent__\" and forbids action, summary, and reason; kind=\"context_lookup\" requires need, question, filters, and completionEvidence=\"__lazygoal_absent__\".",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "memoryPatch") {
                        merged = {
                            type: "string",
                            enum: [GEMINI_NULL_SENTINEL],
                            nullable: true,
                            description: "Required. Return null. Google strict output does not emit Working Memory updates.",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "completionEvidence") {
                        merged = {
                            type: "string",
                            description: "For kind=\"complete\", use <criterionIndex>:<sequence>[,<sequence>][;<criterionIndex>:...] (for example, 0:96), with at least one committed observation sequence for every criterion. For every other kind, return __lazygoal_absent__.",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "completionEvidence") {
                        return [key, merged];
                    }
                    if (requiredWhen.length === 0 || required.includes(key)) return [key, merged];
                    return [key, {
                        ...merged,
                        description: `Required when ${discriminator} is ${requiredWhen.map(value => JSON.stringify(value)).join(" or ")}.`
                            + (schemaAllowsNull(merged) ? " Return null when no value is needed." : "")
                            + (key === "memoryPatch" ? " Google strict output does not emit Working Memory updates." : ""),
                    }];
                })),
                required: path.join(".") === "properties.result"
                    ? [...new Set([...required, "action", "summary", "completionEvidence", "memoryPatch"].filter(k => keys.includes(k)))]
                    : required,
            });
        }

        // 通用对象联合扁平化：Gemini 严格不支持 anyOf，将所有分支 properties 归并为单一 object
        const keys = [...new Set(properties.flatMap(Object.keys))];
        return withNullability({
            type: "object",
            properties: Object.fromEntries(keys.map(key => {
                const merged = mergeGeminiUnion(
                    properties.flatMap(shape => shape[key] === undefined ? [] : [shape[key]!]),
                    [...path, "properties", key],
                );
                return [key, merged];
            })),
            required,
        });
    }

    if (values.every(branch => branch.type === "string")) {
        return withNullability({
            type: "string",
            ...(values.every(branch => Array.isArray(branch.enum))
                ? { enum: [...new Set(values.flatMap(branch => branch.enum as readonly string[]))] }
                : {}),
        });
    }

    if (values.every(branch => branch.type === "number" || branch.type === "integer")) {
        return withNullability({ type: "number" });
    }

    // Gemini 严格不支持 anyOf；多基础类型联合收敛为单一主类型，避免 HTTP 400
    const primaryType = values.find(b => b.type && b.type !== "null")?.type ?? "string";
    return withNullability({ type: primaryType });
}
