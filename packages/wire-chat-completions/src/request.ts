import {
    LLMRequestModeMismatchError,
    readModelAssistantReasoning,
    readModelAssistantText,
    readModelToolCalls,
    sameNativeIdentity,
    type LLMMessage,
    type LLMRequest,
    type LLMStructuredOutput,
    type LLMTextBlockFormat,
    type LLMToolDefinition,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";

/** Chat Completions 历史回放中的函数调用。 */
export interface ChatCompletionsToolCall {
    readonly id: string;
    readonly type: "function";
    readonly function: {
        readonly name: string;
        readonly arguments: string;
    };
}

/** 按 Chat Completions 角色编码的请求消息。 */
export type ChatCompletionsMessage =
    | { readonly role: "system" | "user"; readonly content: string }
    | {
        readonly role: "assistant";
        readonly content: string;
        readonly tool_calls?: readonly ChatCompletionsToolCall[];
        readonly reasoning_content?: string;
    }
    | { readonly role: "tool"; readonly tool_call_id: string; readonly content: string };

/** 构造 Chat Completions 请求所需的供应商无关事实。 */
export interface ChatCompletionsRequestOptions {
    /** 请求使用的模型标识。 */
    readonly model: string;
    /** 请求未声明输出上限时使用的默认值。 */
    readonly maxOutputTokens?: number;
    /** 历史回放的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
    /** 是否发送原生 `response_format.json_schema`；缺省为 `true`。 */
    readonly nativeStructuredOutput?: boolean;
    /** 是否接受 `tool_choice: "required"`；缺省为 `true`，不支持时降级为 `"auto"`。 */
    readonly supportsRequiredToolChoice?: boolean;
}

/** Chat Completions 请求体；只包含本次请求实际声明的字段。 */
export interface ChatCompletionsRequestBody {
    readonly model: string;
    readonly messages: readonly ChatCompletionsMessage[];
    readonly max_tokens?: number;
    readonly response_format?: {
        readonly type: "json_schema";
        readonly json_schema: {
            readonly name: string;
            readonly schema: Readonly<Record<string, unknown>>;
            readonly strict: true;
        };
    };
    readonly tools?: readonly {
        readonly type: "function";
        readonly function: {
            readonly name: string;
            readonly description: string;
            readonly parameters: Readonly<Record<string, unknown>>;
            readonly strict?: true;
        };
    }[];
    readonly tool_choice?: "auto" | "required" | "none";
    readonly parallel_tool_calls?: boolean;
}

/** 流式请求体在非流式形状上追加的字段。 */
export interface ChatCompletionsStreamRequestBody extends ChatCompletionsRequestBody {
    readonly stream: true;
    readonly stream_options?: { readonly include_usage: true };
}

/**
 * 构造非流式 Chat Completions 请求体。
 *
 * @remarks
 * 消息顺序与角色原样保留；只有请求显式声明的输出上限、结构化输出、工具与并行策略会进入请求体。
 * 携带工具时省略原生结构约束，与既有实现一致。
 *
 * @param request - 供应商无关的生成请求。
 * @param options - 模型、历史身份与协议能力事实。
 * @returns 可直接序列化的请求体。
 * @throws LLMRequestModeMismatchError 历史消息携带其它供应商、端点、模型或协议的原生身份时抛出。
 *
 * @example
 * ```ts
 * const body = buildChatCompletionsRequest(request, { model: "gpt-4o", identity });
 * ```
 */
export function buildChatCompletionsRequest(
    request: LLMRequest,
    options: ChatCompletionsRequestOptions,
): ChatCompletionsRequestBody {
    const hasTools = request.tools !== undefined && request.tools.length > 0;
    const maxOutputTokens = request.maxOutputTokens ?? options.maxOutputTokens;
    return {
        model: options.model,
        messages: toChatCompletionsMessages(request.messages, options.identity),
        ...(maxOutputTokens === undefined ? {} : { max_tokens: maxOutputTokens }),
        ...(request.structuredOutput !== undefined && !hasTools && options.nativeStructuredOutput !== false
            ? { response_format: toResponseFormat(request.structuredOutput) }
            : {}),
        ...(hasTools ? toToolFields(request, options.supportsRequiredToolChoice !== false) : {}),
    };
}

/**
 * 构造流式 Chat Completions 请求体。
 *
 * @param request - 供应商无关的生成请求。
 * @param options - 模型、历史身份与协议能力事实。
 * @returns 在非流式请求体上追加 `stream` 与可选用量尾部的请求体。
 * @throws LLMRequestModeMismatchError 历史消息原生身份不匹配时抛出。
 *
 * @example
 * ```ts
 * const body = buildChatCompletionsStreamRequest(request, options);
 * ```
 */
export function buildChatCompletionsStreamRequest(
    request: LLMRequest,
    options: ChatCompletionsRequestOptions,
): ChatCompletionsStreamRequestBody {
    const base = buildChatCompletionsRequest(request, options);
    return {
        ...base,
        stream: true,
        ...(request.includeUsage === true ? { stream_options: { include_usage: true } } : {}),
    };
}

/**
 * 判定本次请求正文块的来源格式。
 *
 * @param request - 供应商无关的生成请求。
 * @returns 携带原生结构 Schema 且未挂载工具时为 `json`，否则为 `plain`。
 *
 * @example
 * ```ts
 * const format = chatTextFormat(request);
 * ```
 */
export function chatTextFormat(request: LLMRequest): LLMTextBlockFormat {
    const hasTools = request.tools !== undefined && request.tools.length > 0;
    return request.structuredOutput !== undefined && !hasTools ? "json" : "plain";
}

/**
 * 将统一消息按原顺序转换为 Chat Completions 消息。
 *
 * @param messages - 按消费顺序排列的模型消息。
 * @param identity - 本次连接的原生对话身份。
 * @returns Chat Completions 角色消息。
 * @throws LLMRequestModeMismatchError 助手消息的续接身份与本次连接不一致时抛出。
 *
 * @example
 * ```ts
 * const messages = toChatCompletionsMessages(request.messages, identity);
 * ```
 */
export function toChatCompletionsMessages(
    messages: readonly LLMMessage[],
    identity: NativeConversationIdentity,
): ChatCompletionsMessage[] {
    return messages.map(message => {
        if (message.role === "tool") {
            return { role: "tool" as const, tool_call_id: message.callId, content: message.content };
        }
        if (message.role !== "assistant") return { role: message.role, content: message.content };
        if (message.continuation !== undefined && !sameNativeIdentity(message.continuation.identity, identity)) {
            throw new LLMRequestModeMismatchError("Native history belongs to another provider, endpoint, model or protocol");
        }
        const reasoningContent = readModelAssistantReasoning(message, "reasoning_content");
        const toolCalls = readModelToolCalls(message);
        return {
            role: "assistant" as const,
            content: readModelAssistantText(message),
            ...(toolCalls.length === 0 ? {} : {
                tool_calls: toolCalls.map(call => ({
                    id: call.callId,
                    type: "function" as const,
                    function: { name: call.toolId, arguments: call.argumentsJson },
                })),
            }),
            ...(reasoningContent === undefined ? {} : { reasoning_content: reasoningContent }),
        };
    });
}

function toResponseFormat(
    structuredOutput: LLMStructuredOutput,
): NonNullable<ChatCompletionsRequestBody["response_format"]> {
    return {
        type: "json_schema",
        json_schema: {
            name: structuredOutput.name,
            schema: structuredOutput.schema as Readonly<Record<string, unknown>>,
            strict: true,
        },
    };
}

function toToolFields(
    request: LLMRequest,
    supportsRequiredToolChoice: boolean,
): Pick<ChatCompletionsRequestBody, "tools" | "tool_choice" | "parallel_tool_calls"> {
    const declared = request.toolChoice ?? "auto";
    return {
        tools: (request.tools ?? []).map((tool: LLMToolDefinition) => ({
            type: "function" as const,
            function: {
                name: tool.id,
                description: tool.description,
                parameters: tool.parametersSchema,
                ...(request.toolArgumentConstraint === "strict" ? { strict: true as const } : {}),
            },
        })),
        tool_choice: declared === "required" && !supportsRequiredToolChoice ? "auto" : declared,
        ...(request.parallelToolCalls === undefined ? {} : { parallel_tool_calls: request.parallelToolCalls }),
    };
}
