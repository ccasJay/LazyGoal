import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import {
    ModelHttpRequestError,
    classifyContextWindowRejection,
    classifyTransientModelFailure,
    parseRetryAfterMs,
    readServerSentEvents,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";
import {
    ChatCompletionsStreamAssembler,
    toChatCompletionsResponse,
    type ChatCompletionsResponseOptions,
    type ChatCompletionsToolCallIdPolicy,
} from "./events";
import { ChatCompletionsIncompleteError } from "./errors";
import {
    buildChatCompletionsRequest,
    buildChatCompletionsStreamRequest,
    chatTextFormat,
} from "./request";

/**
 * 一次 Chat Completions 连接的协议无关事实。
 *
 * @remarks
 * 线格式不持有端点、凭据或供应商分支：`url` 与 `headers` 由适配器提供，
 * 能力开关由模型元数据决定。请求、分帧、事件映射与终态校验共用本连接。
 *
 * @example
 * ```ts
 * const connection: ChatCompletionsConnection = {
 *     url: "https://api.openai.com/v1/chat/completions",
 *     headers: { Authorization: "Bearer secret" },
 *     model: "gpt-4o",
 *     identity: { provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-4o", protocol: "openai-chat" },
 * };
 * ```
 */
export interface ChatCompletionsConnection {
    /** 完整的 Chat Completions 端点。 */
    readonly url: string;
    /** 适配器拥有的请求头，通常包含认证与供应商标识。 */
    readonly headers: Readonly<Record<string, string>>;
    /** 请求使用的模型标识。 */
    readonly model: string;
    /** 请求未声明输出上限时使用的默认值。 */
    readonly maxOutputTokens?: number;
    /** 历史回放的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
    /** 是否发送原生 `response_format.json_schema`；缺省为 `true`。 */
    readonly nativeStructuredOutput?: boolean;
    /** 是否接受 `tool_choice: "required"`；缺省为 `true`。 */
    readonly supportsRequiredToolChoice?: boolean;
    /** 是否在续接载荷中回放 reasoning 扩展；缺省为 `false`。 */
    readonly replayReasoningExtensions?: boolean;
    /** 缺失供应商调用身份的处理策略；缺省为官方 OpenAI 的分配策略。 */
    readonly toolCallIds?: ChatCompletionsToolCallIdPolicy;
}

const DEFAULT_TOOL_CALL_IDS: ChatCompletionsToolCallIdPolicy = {
    generateMissing: "allocate",
    streamMissing: "allocate",
};

/**
 * 发起一次非流式 Chat Completions 请求并归一化响应。
 *
 * @param connection - 端点、请求头与协议能力事实。
 * @param request - 供应商无关的生成请求。
 * @param control - 当前执行调用的中止控制。
 * @returns 归一化后的完整响应。
 * @throws ChatCompletionsIncompleteError 终态或协议内容不可接受时抛出。
 * @throws ChatCompletionsRefusalError 模型明确拒绝时抛出。
 * @throws ModelHttpRequestError 供应商返回非 2xx 状态时抛出，并由通用分类器进一步收窄。
 * @throws ExecutionAbortedError 调用已取消时抛出。
 *
 * @example
 * ```ts
 * const response = await generateChatCompletions(connection, request);
 * ```
 */
export async function generateChatCompletions(
    connection: ChatCompletionsConnection,
    request: LLMRequest,
    control?: ExecutionControl,
): Promise<LLMResponse> {
    throwIfAborted(control);
    try {
        const response = await fetch(connection.url, {
            method: "POST",
            headers: requestHeaders(connection),
            body: JSON.stringify(buildChatCompletionsRequest(request, connection)),
            ...(control?.signal === undefined ? {} : { signal: control.signal }),
        });
        if (!response.ok) throw await toHttpFailure(response);
        throwIfAborted(control);
        const body: unknown = await response.json();
        return toChatCompletionsResponse(body, responseOptions(connection, request));
    } catch (error) {
        throw classifyFailure(error, control);
    }
}

/**
 * 发起一次流式 Chat Completions 请求并交付归一化事件。
 *
 * @remarks
 * 事件顺序与既有实现一致：`started`、块开始与增量、块完成、唯一 `completed`。
 * 正常 EOF 前必须收齐可接受终态；截断、过滤、空流、缺失终态与拒绝都在协议边界失败，
 * 不切换为非流式重发。
 *
 * @param connection - 端点、请求头与协议能力事实。
 * @param request - 供应商无关的生成请求。
 * @param control - 当前执行调用的中止控制。
 * @returns 归一化流事件；最后一次事件是 `completed`。
 * @throws ChatCompletionsIncompleteError 终态或协议内容不可接受时抛出。
 * @throws ChatCompletionsRefusalError 模型明确拒绝时抛出。
 * @throws ModelHttpRequestError 供应商返回非 2xx 状态时抛出。
 * @throws ExecutionAbortedError 调用已取消时抛出。
 *
 * @example
 * ```ts
 * for await (const event of streamChatCompletions(connection, request)) console.log(event.kind);
 * ```
 */
export async function* streamChatCompletions(
    connection: ChatCompletionsConnection,
    request: LLMRequest,
    control?: ExecutionControl,
): AsyncGenerator<LLMStreamEvent> {
    throwIfAborted(control);
    yield { kind: "started" };
    try {
        const response = await fetch(connection.url, {
            method: "POST",
            headers: { ...requestHeaders(connection), Accept: "text/event-stream" },
            body: JSON.stringify(buildChatCompletionsStreamRequest(request, connection)),
            ...(control?.signal === undefined ? {} : { signal: control.signal }),
        });
        if (!response.ok) throw await toHttpFailure(response);
        const assembler = new ChatCompletionsStreamAssembler(responseOptions(connection, request));
        const body = response.body;
        if (body !== null) {
            try {
                for await (const event of readServerSentEvents(readBody(body))) {
                    if (event.data === "[DONE]") break;
                    throwIfAborted(control);
                    let chunk: unknown;
                    try {
                        chunk = JSON.parse(event.data) as unknown;
                    } catch {
                        throw new ChatCompletionsIncompleteError("Chat Completions stream contained a non-JSON event", "unsupported_content");
                    }
                    for (const mapped of assembler.push(chunk)) yield mapped;
                }
            } finally {
                await cancelBody(body);
            }
        }
        throwIfAborted(control);
        for (const completed of assembler.finish()) yield completed;
    } catch (error) {
        throw classifyFailure(error, control);
    }
}

function requestHeaders(connection: ChatCompletionsConnection): Record<string, string> {
    return {
        ...connection.headers,
        "Content-Type": "application/json",
        Accept: "application/json",
    };
}

function responseOptions(
    connection: ChatCompletionsConnection,
    request: LLMRequest,
): ChatCompletionsResponseOptions {
    return {
        identity: connection.identity,
        request,
        textFormat: chatTextFormat(request),
        ...(connection.nativeStructuredOutput === undefined
            ? {}
            : { nativeStructuredOutput: connection.nativeStructuredOutput }),
        ...(connection.replayReasoningExtensions === undefined
            ? {}
            : { replayReasoningExtensions: connection.replayReasoningExtensions }),
        toolCallIds: connection.toolCallIds ?? DEFAULT_TOOL_CALL_IDS,
    };
}

async function toHttpFailure(response: Response): Promise<ModelHttpRequestError> {
    let code: string | undefined;
    try {
        const body: unknown = await response.json();
        const error = asRecord(asRecord(body)?.error);
        const rawCode = error?.code ?? error?.type;
        if (typeof rawCode === "string" && rawCode.length > 0) code = rawCode;
    } catch {
        // 响应体不是可解析的错误对象；只保留 HTTP 状态。
    }
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    return new ModelHttpRequestError(`Chat Completions request failed with HTTP ${response.status}`, {
        status: response.status,
        ...(code === undefined ? {} : { code }),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
}

function classifyFailure(error: unknown, control: ExecutionControl | undefined): unknown {
    if (isExecutionAbortedError(error)) return error;
    if (control?.signal?.aborted) return new ExecutionAbortedError();
    const contextRejection = classifyContextWindowRejection(error);
    if (contextRejection !== undefined) return contextRejection;
    return classifyTransientModelFailure(error) ?? error;
}

async function* readBody(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = body.getReader();
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) return;
            if (next.value !== undefined) yield next.value;
        }
    } finally {
        try {
            await reader.cancel();
        } catch {
            // 释放本次拥有的读取器失败不改变调用方的主错误。
        }
    }
}

async function cancelBody(body: ReadableStream<Uint8Array>): Promise<void> {
    try {
        await body.cancel();
    } catch {
        // 已释放或已结束的流不需要二次清理。
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}
