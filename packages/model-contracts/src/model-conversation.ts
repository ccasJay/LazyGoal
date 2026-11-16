import { isRecord } from "../../contracts/src/index";

/**
 * 原生对话续接的供应商身份；端点必须是不含凭据的规范化地址。
 * @remarks 只有身份完全相同的响应才能原生回放；切换身份结束续接段。
 * @example
 * ```ts
 * const identity: NativeConversationIdentity = {
 *   provider: "openai", endpoint: "https://api.openai.com/v1", model: "model", protocol: "openai-chat",
 * };
 * ```
 */
export interface NativeConversationIdentity {
    readonly provider: "openai" | "openai-compatible" | "google" | "anthropic";
    readonly endpoint: string;
    readonly model: string;
    readonly protocol: "openai-chat" | "gemini-content" | "anthropic-messages";
}

/**
 * 原生函数调用；参数保持模型返回的 JSON 文本，校验由动作消费方负责。
 * @example
 * ```ts
 * const call: ModelToolCall = { callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"README.md"}' };
 * ```
 */
export interface ModelToolCall {
    readonly callId: string;
    readonly toolId: string;
    readonly argumentsJson: string;
}

/**
 * 一次响应中的正文块；块索引保留供应商输出顺序。
 * @example
 * ```ts
 * const block: ModelTextBlock = { index: 0, type: "text", format: "plain", text: "检查完成" };
 * ```
 */
export interface ModelTextBlock {
    readonly index: number;
    readonly type: "text";
    readonly format: "plain" | "json";
    readonly text: string;
}

/**
 * 一次响应中的 reasoning 块；来源标记决定 OpenAI 续接时是否原样回传。
 * @example
 * ```ts
 * const block: ModelReasoningBlock = { index: 1, type: "reasoning", source: "reasoning_content", text: "检查实现" };
 * ```
 */
export interface ModelReasoningBlock {
    readonly index: number;
    readonly type: "reasoning";
    readonly source?: "reasoning_content" | "thought";
    readonly text: string;
}

/**
 * 一次响应中的原生工具调用块；参数保持生成时的 JSON 文本。
 * @example
 * ```ts
 * const block: ModelToolCallBlock = { index: 2, type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: "{}" };
 * ```
 */
export interface ModelToolCallBlock extends ModelToolCall {
    readonly index: number;
    readonly type: "tool_call";
}

/**
 * 供应商无关的有序模型内容词表；模型响应和 OpenAI-compatible 原生历史共用该表示。
 * @example
 * ```ts
 * const block: ModelContentBlock = { index: 0, type: "text", format: "plain", text: "Done" };
 * ```
 */
export type ModelContentBlock = ModelTextBlock | ModelReasoningBlock | ModelToolCallBlock;

/**
 * Gemini 文本与函数调用的原始 Part；顺序和签名不得修改。
 * @remarks 不支持图像、内置工具或其他多模态 Part；供应商边界拒绝这些形状。
 * @example
 * ```ts
 * const part: GeminiContinuationPart = { text: "Summary", thought: true, thoughtSignature: "opaque" };
 * ```
 */
export interface GeminiContinuationPart {
    readonly text?: string;
    readonly thought?: boolean;
    readonly thoughtSignature?: string;
    readonly functionCall?: { readonly name: string; readonly id?: string; readonly args?: Record<string, unknown> };
}

/**
 * Anthropic Messages 原生续接块；顺序与签名不得修改。
 * @remarks 只包含文本、thinking（含签名）与 tool_use；上游要求 thinking 签名原样回放，
 * 请求时把这些块作为 assistant content 回传。不支持图像与检索引用等其它块。
 * @example
 * ```ts
 * const block: AnthropicContinuationBlock = { type: "thinking", thinking: "检查中", signature: "sig" };
 * ```
 */
export type AnthropicContinuationBlock =
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "thinking"; readonly thinking: string; readonly signature: string }
    | { readonly type: "redacted_thinking"; readonly data: string }
    | { readonly type: "tool_use"; readonly id: string; readonly name: string; readonly input: Record<string, unknown> };

/**
 * 可持久化的供应商续接字段，与诊断 metadata 分离。
 * @remarks OpenAI-compatible 的新历史把可回放正文、推理和工具调用保存在 `ModelBlockAssistantMessage.blocks`；其他 Provider 继续使用对应的既有字段。Gemini 原始 Parts 是维持签名续接所需的协议状态。
 * @example
 * ```ts
 * const continuation: ModelContinuation = { identity, parts: [{ functionCall: { name: "read_file", args: {} }, thoughtSignature: "opaque" }] };
 * ```
 */
export interface ModelContinuation {
    readonly identity: NativeConversationIdentity;
    readonly parts?: readonly GeminiContinuationPart[];
    /** Anthropic Messages 的原生续接块；与 `parts` 互斥，由身份协议选择。 */
    readonly blocks?: readonly AnthropicContinuationBlock[];
    /** 既有 OpenAI 原生历史中的可续接 reasoning 字段。 */
    readonly reasoningContent?: string;
    /** 既有 OpenAI 原生历史中记录但不回放的扩展字段。 */
    readonly thought?: string;
}

/**
 * 其他供应商既有原生历史形态；兼容已使用的 OpenAI 与 Gemini 持久化投影。
 * @remarks 新的 OpenAI-compatible Goal 使用 {@link ModelBlockAssistantMessage}，正文、reasoning 和调用不重复存储。
 * @example
 * ```ts
 * const message: ModelLegacyAssistantMessage = { role: "assistant", content: "Checking", toolCalls: [call], continuation };
 * ```
 */
export interface ModelLegacyAssistantMessage {
    readonly role: "assistant";
    readonly content: string;
    readonly reasoning?: string;
    readonly toolCalls?: readonly ModelToolCall[];
    readonly continuation?: ModelContinuation;
}

/**
 * OpenAI-compatible 的无损原生回放消息；有序块是内容、reasoning 和工具调用的唯一权威。
 * @remarks 只有被 Runtime 接受并提交的响应可进入历史；reasoning_content 与 thought 保留来源差异。
 * @example
 * ```ts
 * const message: ModelBlockAssistantMessage = {
 *   role: "assistant",
 *   blocks: [
 *     { index: 0, type: "text", format: "plain", text: "Checking" },
 *     { index: 1, type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: "{}" },
 *   ],
 *   continuation: { identity },
 * };
 * ```
 */
export interface ModelBlockAssistantMessage {
    readonly role: "assistant";
    readonly blocks: readonly ModelContentBlock[];
    readonly continuation?: Pick<ModelContinuation, "identity" | "parts" | "blocks">;
}

/**
 * 通用 assistant 消息由现有扁平投影或 OpenAI-compatible 共享块构成。
 * @example
 * ```ts
 * const message: ModelAssistantMessage = { role: "assistant", blocks: [] };
 * ```
 */
export type ModelAssistantMessage = ModelLegacyAssistantMessage | ModelBlockAssistantMessage;

/**
 * 从共享块派生 assistant 正文；不插入分隔符或裁剪。
 * @example
 * ```ts
 * const text = readModelAssistantText({ role: "assistant", blocks: [{ index: 0, type: "text", format: "plain", text: "Done" }] });
 * ```
 */
export function readModelAssistantText(message: ModelAssistantMessage): string {
    return "blocks" in message
        ? message.blocks.flatMap(block => block.type === "text" ? [block.text] : []).join("")
        : message.content;
}

/**
 * 从共享块按指定供应商来源派生 reasoning；省略来源时返回所有 reasoning 文本。
 * @example
 * ```ts
 * const reasoning = readModelAssistantReasoning(message, "reasoning_content");
 * ```
 */
export function readModelAssistantReasoning(
    message: ModelAssistantMessage,
    source?: ModelReasoningBlock["source"],
): string | undefined {
    if (!("blocks" in message)) {
        if (source === "reasoning_content") return message.continuation?.reasoningContent;
        if (source === "thought") return message.continuation?.thought;
        return message.reasoning ?? ([message.continuation?.reasoningContent, message.continuation?.thought]
            .filter((text): text is string => text !== undefined).join("") || undefined);
    }
    const texts = message.blocks.flatMap(block => block.type === "reasoning"
        && (source === undefined || block.source === source) ? [block.text] : []);
    return texts.length === 0 ? undefined : texts.join("");
}

/**
 * 从共享块派生原生工具调用，保留响应顺序与参数原文。
 * @example
 * ```ts
 * const calls = readModelToolCalls(message);
 * ```
 */
export function readModelToolCalls(message: ModelAssistantMessage): readonly ModelToolCall[] {
    return "blocks" in message
        ? message.blocks.flatMap(block => block.type === "tool_call"
            ? [{ callId: block.callId, toolId: block.toolId, argumentsJson: block.argumentsJson }]
            : [])
        : message.toolCalls ?? [];
}

/**
 * 供应商无关的模型消息；tool 必须紧随其配对的 assistant 调用。
 * @remarks tool content 是由已提交 Runtime 结果派生的 JSON 文本，不表示 assistant 输出。
 * @example
 * ```ts
 * const message: ModelConversationMessage = { role: "tool", callId: "call-1", toolId: "read_file", content: '{"kind":"success"}' };
 * ```
 */
export type ModelLegacyConversationMessage =
    | { readonly role: "system"; readonly content: string }
    | { readonly role: "user"; readonly content: string }
    | ModelLegacyAssistantMessage
    | { readonly role: "tool"; readonly callId: string; readonly toolId: string; readonly content: string };

/**
 * 请求历史可使用 OpenAI-compatible 共享块或其他 Provider 的既有消息形态。
 * @example
 * ```ts
 * const requestMessage: ModelConversationMessage = { role: "assistant", blocks: [] };
 * ```
 */
export type ModelConversationMessage = ModelLegacyConversationMessage | ModelBlockAssistantMessage;

/**
 * 返回任意模型消息的可读正文；assistant blocks 按原顺序直接连接。
 * @example
 * ```ts
 * const text = readModelMessageText(message);
 * ```
 */
export function readModelMessageText(message: ModelConversationMessage): string {
    return message.role === "assistant" ? readModelAssistantText(message) : message.content;
}

/**
 * 按供应商身份比较原生续接边界，不比较凭据。
 * @example
 * ```ts
 * if (sameNativeIdentity(saved, current)) replay(savedMessage);
 * ```
 */
export function sameNativeIdentity(a: NativeConversationIdentity, b: NativeConversationIdentity): boolean {
    return a.provider === b.provider && a.endpoint === b.endpoint && a.model === b.model && a.protocol === b.protocol;
}

const keys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * 校验文件和供应商边界的 assistant 消息及不透明续接字段。
 * @returns 不修改输入；合法时返回 true。
 * @example
 * ```ts
 * if (!isModelAssistantMessage(JSON.parse(line))) throw new Error("Invalid model response");
 * ```
 */
export function isModelAssistantMessage(value: unknown): value is ModelAssistantMessage {
    if (!isRecord(value) || value.role !== "assistant") return false;
    const blockMessage = Object.hasOwn(value, "blocks");
    if (blockMessage) {
        if (!keys(value, ["role", "blocks", "continuation"]) || !Array.isArray(value.blocks)) return false;
        let toolCallCount = 0;
        for (let index = 0; index < value.blocks.length; index += 1) {
            const block = value.blocks[index];
            if (!isRecord(block) || block.index !== index) return false;
            if (block.type === "text") {
                if (!keys(block, ["index", "type", "format", "text"])
                    || (block.format !== "plain" && block.format !== "json") || typeof block.text !== "string") return false;
            } else if (block.type === "reasoning") {
                if (!keys(block, ["index", "type", "source", "text"])
                    || block.source !== undefined && block.source !== "reasoning_content" && block.source !== "thought"
                    || typeof block.text !== "string") return false;
            } else if (block.type === "tool_call") {
                if (!keys(block, ["index", "type", "callId", "toolId", "argumentsJson"])
                    || !nonempty(block.callId) || !nonempty(block.toolId) || typeof block.argumentsJson !== "string") return false;
                toolCallCount += 1;
            } else return false;
        }
        if (toolCallCount > 1) return false;
        if (!isModelContinuation(value.continuation, true)) return false;
        return continuationCallsMatch(value.continuation, readModelToolCalls(value as unknown as ModelBlockAssistantMessage));
    }

    if (!keys(value, ["role", "content", "reasoning", "toolCalls", "continuation"])
        || typeof value.content !== "string"
        || value.reasoning !== undefined && typeof value.reasoning !== "string") return false;
    if (value.toolCalls !== undefined && (!Array.isArray(value.toolCalls) || value.toolCalls.length > 1
        || !value.toolCalls.every(call => isRecord(call) && keys(call, ["callId", "toolId", "argumentsJson"])
            && nonempty(call.callId) && nonempty(call.toolId) && typeof call.argumentsJson === "string"))) return false;
    if (!isModelContinuation(value.continuation, false)) return false;
    const normalized = value.toolCalls as readonly ModelToolCall[] | undefined;
    return continuationCallsMatch(value.continuation, normalized ?? []);
}

/** 校验原生 Provider 续接载荷；blocks 形态禁止复制 OpenAI reasoning 字段。 */
function isModelContinuation(value: unknown, blockMessage: boolean): value is ModelContinuation | undefined {
    if (value === undefined) return true;
    if (!isRecord(value) || !keys(value, ["identity", "parts", "blocks", "reasoningContent", "thought"]) || !isRecord(value.identity)) return false;
    const identity = value.identity;
    if (!keys(identity, ["provider", "endpoint", "model", "protocol"]) || !nonempty(identity.model) || !nonempty(identity.endpoint)
        || !["openai", "openai-compatible", "google", "anthropic"].includes(String(identity.provider))) return false;
    try {
        const url = new URL(identity.endpoint);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false;
    } catch { return false; }
    if (identity.protocol === "openai-chat") {
        return identity.provider !== "google" && identity.provider !== "anthropic" && value.parts === undefined && value.blocks === undefined
            && (value.reasoningContent === undefined || typeof value.reasoningContent === "string")
            && (value.thought === undefined || typeof value.thought === "string")
            && (!blockMessage || value.reasoningContent === undefined && value.thought === undefined);
    }
    if (identity.protocol === "anthropic-messages") {
        return identity.provider === "anthropic" && value.parts === undefined
            && value.reasoningContent === undefined && value.thought === undefined
            && Array.isArray(value.blocks) && value.blocks.length > 0
            && value.blocks.every(block => isAnthropicContinuationBlock(block));
    }
    if (identity.protocol !== "gemini-content" || identity.provider !== "google"
        || value.reasoningContent !== undefined || value.thought !== undefined || !Array.isArray(value.parts)) return false;
    for (const part of value.parts) {
        if (!isRecord(part) || !keys(part, ["text", "thought", "thoughtSignature", "functionCall"])
            || part.text !== undefined && typeof part.text !== "string"
            || part.thought !== undefined && typeof part.thought !== "boolean"
            || part.thoughtSignature !== undefined && typeof part.thoughtSignature !== "string"
            || part.text === undefined && part.functionCall === undefined) return false;
        if (part.functionCall !== undefined) {
            const call = part.functionCall;
            if (!isRecord(call) || !keys(call, ["name", "id", "args"]) || !nonempty(call.name)
                || call.id !== undefined && !nonempty(call.id) || call.args !== undefined && !isRecord(call.args)) return false;
        }
    }
    return true;
}

/** 校验 Anthropic 原生续接块的四种受支持形状。 */
function isAnthropicContinuationBlock(value: unknown): boolean {
    if (!isRecord(value) || !nonempty(value.type)) return false;
    switch (value.type) {
        case "text":
            return keys(value, ["type", "text"]) && typeof value.text === "string" && value.text.length > 0;
        case "thinking":
            return keys(value, ["type", "thinking", "signature"])
                && typeof value.thinking === "string" && value.thinking.length > 0
                && typeof value.signature === "string" && value.signature.length > 0;
        case "redacted_thinking":
            return keys(value, ["type", "data"]) && typeof value.data === "string" && value.data.length > 0;
        case "tool_use":
            return keys(value, ["type", "id", "name", "input"]) && nonempty(value.id) && nonempty(value.name)
                && isRecord(value.input);
        default:
            return false;
    }
}

function continuationCallsMatch(
    continuation: unknown,
    normalized: readonly ModelToolCall[],
): boolean {
    if (!isRecord(continuation) || !isRecord(continuation.identity)) return true;
    if (continuation.identity.protocol === "gemini-content" && Array.isArray(continuation.parts)) {
        const calls = continuation.parts.flatMap((part): Record<string, unknown>[] =>
            isRecord(part) && isRecord(part.functionCall) ? [part.functionCall] : []);
        if (calls.length === 0) return normalized.length === 0;
        if (calls.length !== 1 || normalized.length !== 1) return false;
        const call = calls[0]!, expected = normalized[0]!;
        return call.name === expected.toolId && (call.id === undefined || call.id === expected.callId)
            && JSON.stringify(call.args ?? {}) === expected.argumentsJson;
    }
    if (continuation.identity.protocol === "anthropic-messages" && Array.isArray(continuation.blocks)) {
        const calls = continuation.blocks.filter((block): block is Record<string, unknown> =>
            isRecord(block) && block.type === "tool_use");
        if (calls.length === 0) return normalized.length === 0;
        if (calls.length !== 1 || normalized.length !== 1) return false;
        const call = calls[0]!, expected = normalized[0]!;
        return call.name === expected.toolId && call.id === expected.callId
            && JSON.stringify(call.input ?? {}) === expected.argumentsJson;
    }
    return true;
}

/**
 * 校验持久化或 wire 边界的统一模型消息，不推测缺失的工具身份。
 * @example
 * ```ts
 * if (!isModelConversationMessage(value)) throw new Error("Invalid model message");
 * ```
 */
export function isModelConversationMessage(value: unknown): value is ModelConversationMessage {
    if (!isRecord(value)) return false;
    if (value.role === "assistant") return isModelAssistantMessage(value);
    if (value.role === "tool") return keys(value, ["role", "content", "callId", "toolId"])
        && typeof value.content === "string" && nonempty(value.callId) && nonempty(value.toolId);
    return (value.role === "system" || value.role === "user") && keys(value, ["role", "content"]) && typeof value.content === "string";
}

/**
 * 校验旧版诊断输入消息，不接受 OpenAI-compatible 原生回放块。
 * @example
 * ```ts
 * if (!isModelLegacyConversationMessage(value)) throw new Error("Invalid model input projection");
 * ```
 */
export function isModelLegacyConversationMessage(value: unknown): value is ModelLegacyConversationMessage {
    if (!isRecord(value)) return false;
    if (value.role === "assistant") return !Object.hasOwn(value, "blocks") && isModelAssistantMessage(value);
    if (value.role === "tool") return keys(value, ["role", "content", "callId", "toolId"])
        && typeof value.content === "string" && nonempty(value.callId) && nonempty(value.toolId);
    return (value.role === "system" || value.role === "user")
        && keys(value, ["role", "content"]) && typeof value.content === "string";
}
