import {
    LLMRequestModeMismatchError,
    sameNativeIdentity,
    type AnthropicContinuationBlock,
    type LLMMessage,
    type LLMRequest,
    type LLMToolDefinition,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";

/**
 * Anthropic Messages 历史回放中的助手消息原始块；顺序与 thinking 签名不得修改。
 *
 * @remarks
 * 与 `model-contracts` 的 `AnthropicContinuationBlock` 保持同一形状；本包内重述以保持
 * 线格式包不依赖 model-contracts 之外的私有类型细节。
 *
 * @example
 * ```ts
 * const block: AnthropicRequestContentBlock = { type: "text", text: "检查完成" };
 * ```
 */
export type AnthropicRequestContentBlock =
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "thinking"; readonly thinking: string; readonly signature: string }
    | { readonly type: "redacted_thinking"; readonly data: string }
    | { readonly type: "tool_use"; readonly id: string; readonly name: string; readonly input: Readonly<Record<string, unknown>> }
    | { readonly type: "tool_result"; readonly tool_use_id: string; readonly content: string };

/** 按 Anthropic Messages 角色编码的请求消息。 */
export type AnthropicMessagesRequestMessage =
    | { readonly role: "user"; readonly content: AnthropicRequestContentBlock[] }
    | { readonly role: "assistant"; readonly content: AnthropicRequestContentBlock[] };

/** Anthropic Messages 请求体；只包含本次请求实际声明的字段。 */
export interface AnthropicMessagesRequestBody {
    readonly model: string;
    readonly max_tokens: number;
    readonly messages: readonly AnthropicMessagesRequestMessage[];
    readonly system?: string;
    readonly tools?: readonly {
        readonly name: string;
        readonly description: string;
        readonly input_schema: Readonly<Record<string, unknown>>;
    }[];
    readonly tool_choice?: { readonly type: "auto" | "any" | "none" };
}

/** 构造 Anthropic Messages 请求所需的供应商无关事实。 */
export interface AnthropicMessagesRequestOptions {
    /** 请求使用的模型标识。 */
    readonly model: string;
    /** 输出 Token 上限；请求与连接均未声明时使用该缺省值。 */
    readonly defaultMaxOutputTokens?: number;
    /** 上游接受的输出上限；超过时请求构造失败。 */
    readonly modelMaxTokens?: number;
    /** 历史回放的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
}

/** Anthropic Messages 对输出上限的缺省值。 */
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192;

/**
 * 构造非流式与流式共用的 Anthropic Messages 请求体。
 *
 * @remarks
 * `max_tokens` 是协议必填项：请求值优先，其次连接配置，最后使用缺省值；超过模型
 * 登记上限时构造失败。system 消息合并为顶层 `system` 字段且必须位于最前；assistant
 * 历史只在身份一致时通过原生续接块回放（thinking 签名原样保留），没有续接载荷时回放
 * 纯文本；tool 结果映射为 `tool_result` 块并与所属工具调用同置于一个 user 消息。
 * 结构化输出不进入协议：Anthropic 无原生 JSON Schema 约束，正文由本地契约校验。
 *
 * @param request - 供应商无关的生成请求。
 * @param options - 模型、历史身份与输出上限事实。
 * @returns 可直接序列化的请求体。
 * @throws LLMRequestModeMismatchError 历史续接身份不一致、system 消息不在最前或输出上限非法时抛出。
 *
 * @example
 * ```ts
 * const body = buildAnthropicMessagesRequest(request, { model: "claude-sonnet-4-5", identity });
 * ```
 */
export function buildAnthropicMessagesRequest(
    request: LLMRequest,
    options: AnthropicMessagesRequestOptions,
): AnthropicMessagesRequestBody {
    const system: string[] = [];
    const messages = toAnthropicMessages(request.messages, options.identity, system);
    const maxTokens = request.maxOutputTokens ?? options.defaultMaxOutputTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS;
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) {
        throw new LLMRequestModeMismatchError(`Anthropic Messages requires a positive max_tokens, got ${maxTokens}`);
    }
    if (options.modelMaxTokens !== undefined && maxTokens > options.modelMaxTokens) {
        throw new LLMRequestModeMismatchError(
            `Anthropic max_tokens ${maxTokens} exceeds model "${options.model}" limit (${options.modelMaxTokens})`,
        );
    }
    return {
        model: options.model,
        max_tokens: maxTokens,
        messages,
        ...(system.length === 0 ? {} : { system: system.join("\n") }),
        ...(request.tools !== undefined && request.tools.length > 0 ? toToolFields(request) : {}),
    };
}

/**
 * 将统一消息按原顺序转换为 Anthropic Messages 内容块。
 *
 * @remarks
 * 相邻 tool 结果与前置普通内容合并为同一个 user 消息，与既有实现的上下文形态一致；
 * assistant 消息优先回放原生续接块，无续接载荷时回放纯文本并丢弃私有 reasoning。
 *
 * @param messages - 按消费顺序排列的模型消息。
 * @param identity - 本次连接的原生对话身份。
 * @param system - 输出参数；收集按序出现的 system 文本。
 * @returns Anthropic 角色消息。
 * @throws LLMRequestModeMismatchError 续接身份不一致或消息顺序不合法时抛出。
 *
 * @example
 * ```ts
 * const system: string[] = [];
 * const messages = toAnthropicMessages(request.messages, identity, system);
 * ```
 */
export function toAnthropicMessages(
    messages: readonly LLMMessage[],
    identity: NativeConversationIdentity,
    system: string[] = [],
): AnthropicMessagesRequestMessage[] {
    const out: AnthropicMessagesRequestMessage[] = [];
    for (const message of messages) {
        if (message.role === "system") {
            if (out.length > 0) {
                throw new LLMRequestModeMismatchError("System messages must precede conversation messages");
            }
            system.push(message.content);
            continue;
        }
        if (message.role === "user") {
            pushUserContent(out, [{ type: "text", text: message.content }]);
            continue;
        }
        if (message.role === "tool") {
            pushUserContent(out, [{ type: "tool_result", tool_use_id: message.callId, content: message.content }]);
            continue;
        }
        out.push(assistantMessage(message, identity));
    }
    return out;
}

function pushUserContent(
    out: AnthropicMessagesRequestMessage[],
    blocks: readonly AnthropicRequestContentBlock[],
): void {
    const previous = out.at(-1);
    if (previous !== undefined && previous.role === "user") {
        previous.content.push(...blocks);
        return;
    }
    out.push({ role: "user", content: [...blocks] });
}

function assistantMessage(
    message: Extract<LLMMessage, { readonly role: "assistant" }>,
    identity: NativeConversationIdentity,
): AnthropicMessagesRequestMessage {
    if (message.continuation !== undefined) {
        if (!sameNativeIdentity(message.continuation.identity, identity)) {
            throw new LLMRequestModeMismatchError("Native history belongs to another provider, endpoint, model or protocol");
        }
        const blocks = "blocks" in message.continuation ? message.continuation.blocks : undefined;
        if (blocks === undefined || blocks.length === 0) {
            throw new LLMRequestModeMismatchError("Anthropic native history requires its continuation blocks for replay");
        }
        return { role: "assistant", content: blocks.map(toRequestBlock) };
    }
    return { role: "assistant", content: [{ type: "text", text: readAssistantText(message) }] };
}

function toRequestBlock(block: AnthropicContinuationBlock): AnthropicRequestContentBlock {
    switch (block.type) {
        case "text": return { type: "text", text: block.text };
        case "thinking": return { type: "thinking", thinking: block.thinking, signature: block.signature };
        case "redacted_thinking": return { type: "redacted_thinking", data: block.data };
        case "tool_use": return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    }
}

function readAssistantText(message: Extract<LLMMessage, { readonly role: "assistant" }>): string {
    if ("blocks" in message) {
        return message.blocks.flatMap(block => block.type === "text" ? [block.text] : []).join("");
    }
    return message.content;
}

function toToolFields(request: LLMRequest): Pick<AnthropicMessagesRequestBody, "tools" | "tool_choice"> {
    const declared = request.toolChoice ?? "auto";
    const mapped = declared === "required" ? "any" as const
        : declared === "none" ? "none" as const
        : "auto" as const;
    return {
        tools: (request.tools ?? []).map((tool: LLMToolDefinition) => ({
            name: tool.id,
            description: tool.description,
            input_schema: tool.parametersSchema,
        })),
        tool_choice: { type: mapped },
    };
}
