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
    readonly provider: "openai" | "openai-compatible" | "google";
    readonly endpoint: string;
    readonly model: string;
    readonly protocol: "openai-chat" | "gemini-content";
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
 * 可持久化的供应商续接字段，与诊断 metadata 分离。
 * @remarks 仅保留协议所需字段；reasoningContent 只用于 OpenAI 兼容协议明确返回的 reasoning_content。
 * @example
 * ```ts
 * const continuation: ModelContinuation = { identity, parts: [{ functionCall: { name: "read_file", args: {} }, thoughtSignature: "opaque" }] };
 * ```
 */
export interface ModelContinuation {
    readonly identity: NativeConversationIdentity;
    readonly parts?: readonly GeminiContinuationPart[];
    readonly reasoningContent?: string;
}

/**
 * 已完整接收的 assistant 响应；正文和 reasoning 摘要相互独立。
 * @remarks 只有被 Runtime 接受并提交的响应可进入原生历史。
 * @example
 * ```ts
 * const message: ModelAssistantMessage = { role: "assistant", content: "Checking files", toolCalls: [call], continuation };
 * ```
 */
export interface ModelAssistantMessage {
    readonly role: "assistant";
    readonly content: string;
    readonly reasoning?: string;
    readonly toolCalls?: readonly ModelToolCall[];
    readonly continuation?: ModelContinuation;
}

/**
 * 供应商无关的模型消息；tool 必须紧随其配对的 assistant 调用。
 * @remarks tool content 是由已提交 Runtime 结果派生的 JSON 文本，不表示 assistant 输出。
 * @example
 * ```ts
 * const message: ModelConversationMessage = { role: "tool", callId: "call-1", toolId: "read_file", content: '{"kind":"success"}' };
 * ```
 */
export type ModelConversationMessage =
    | { readonly role: "system"; readonly content: string }
    | { readonly role: "user"; readonly content: string }
    | ModelAssistantMessage
    | { readonly role: "tool"; readonly callId: string; readonly toolId: string; readonly content: string };

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

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
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
    if (!object(value) || !keys(value, ["role", "content", "reasoning", "toolCalls", "continuation"])
        || value.role !== "assistant" || typeof value.content !== "string"
        || value.reasoning !== undefined && typeof value.reasoning !== "string") return false;
    if (value.toolCalls !== undefined && (!Array.isArray(value.toolCalls) || value.toolCalls.length > 1
        || !value.toolCalls.every(call => object(call) && keys(call, ["callId", "toolId", "argumentsJson"])
            && nonempty(call.callId) && nonempty(call.toolId) && typeof call.argumentsJson === "string"))) return false;
    if (value.continuation === undefined) return true;
    const continuation = value.continuation;
    if (!object(continuation) || !keys(continuation, ["identity", "parts", "reasoningContent"]) || !object(continuation.identity)) return false;
    const identity = continuation.identity;
    if (!keys(identity, ["provider", "endpoint", "model", "protocol"]) || !nonempty(identity.model) || !nonempty(identity.endpoint)
        || !["openai", "openai-compatible", "google"].includes(String(identity.provider))) return false;
    try {
        const url = new URL(identity.endpoint);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false;
    } catch { return false; }
    if (identity.protocol === "openai-chat") {
        return identity.provider !== "google" && continuation.parts === undefined
            && (continuation.reasoningContent === undefined || typeof continuation.reasoningContent === "string");
    }
    if (identity.protocol !== "gemini-content" || identity.provider !== "google" || continuation.reasoningContent !== undefined
        || !Array.isArray(continuation.parts)) return false;
    const calls: Record<string, unknown>[] = [];
    for (const part of continuation.parts) {
        if (!object(part) || !keys(part, ["text", "thought", "thoughtSignature", "functionCall"])
            || part.text !== undefined && typeof part.text !== "string"
            || part.thought !== undefined && typeof part.thought !== "boolean"
            || part.thoughtSignature !== undefined && typeof part.thoughtSignature !== "string"
            || part.text === undefined && part.functionCall === undefined) return false;
        if (part.functionCall !== undefined) {
            const call = part.functionCall;
            if (!object(call) || !keys(call, ["name", "id", "args"]) || !nonempty(call.name)
                || call.id !== undefined && !nonempty(call.id) || call.args !== undefined && !object(call.args)) return false;
            calls.push(call);
        }
    }
    const normalized = value.toolCalls as readonly ModelToolCall[] | undefined;
    if (calls.length === 0) return normalized === undefined || normalized.length === 0;
    if (calls.length !== 1 || normalized?.length !== 1) return false;
    const call = calls[0]!, expected = normalized[0]!;
    return call.name === expected.toolId && (call.id === undefined || call.id === expected.callId)
        && JSON.stringify(call.args ?? {}) === expected.argumentsJson;
}

/**
 * 校验持久化或 wire 边界的统一模型消息，不推测缺失的工具身份。
 * @example
 * ```ts
 * if (!isModelConversationMessage(value)) throw new Error("Invalid model message");
 * ```
 */
export function isModelConversationMessage(value: unknown): value is ModelConversationMessage {
    if (!object(value)) return false;
    if (value.role === "assistant") return isModelAssistantMessage(value);
    if (value.role === "tool") return keys(value, ["role", "content", "callId", "toolId"])
        && typeof value.content === "string" && nonempty(value.callId) && nonempty(value.toolId);
    return (value.role === "system" || value.role === "user") && keys(value, ["role", "content"]) && typeof value.content === "string";
}
