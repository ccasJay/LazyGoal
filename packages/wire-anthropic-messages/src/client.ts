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
    AnthropicMessagesStreamAssembler,
    toAnthropicMessagesResponse,
    type AnthropicMessagesResponseOptions,
    type AnthropicToolCallIdPolicy,
} from "./events";
import { AnthropicMessagesIncompleteError } from "./errors";
import {
    buildAnthropicMessagesRequest,
    type AnthropicMessagesRequestOptions,
} from "./request";

/**
 * 一次 Anthropic Messages 连接的协议无关事实。
 *
 * @remarks
 * 线格式不持有端点、凭据或供应商分支：`url` 与 `headers` 由适配器提供，输出上限
 * 与身份属于模型事实。请求构造、SSE 分帧、事件映射与终态校验共用本连接。
 *
 * @example
 * ```ts
 * const connection: AnthropicMessagesConnection = {
 *     url: "https://api.anthropic.com/v1/messages",
 *     headers: { "x-api-key": "secret", "anthropic-version": "2023-06-01" },
 *     model: "claude-sonnet-4-5",
 *     maxOutputTokens: 8192,
 *     identity: { provider: "anthropic", endpoint: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5", protocol: "anthropic-messages" },
 * };
 * ```
 */
export interface AnthropicMessagesConnection {
    /** 完整的 Messages 端点。 */
    readonly url: string;
    /** 适配器拥有的请求头，通常包含认证与协议版本。 */
    readonly headers: Readonly<Record<string, string>>;
    /** 请求使用的模型标识。 */
    readonly model: string;
    /** 请求未声明输出上限时使用的默认值。 */
    readonly maxOutputTokens?: number;
    /** 模型登记的输出上限；请求值超过时构造失败。 */
    readonly modelMaxTokens?: number;
    /** 历史回放的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
    /** 缺失供应商调用身份的处理策略；缺省为拒绝。 */
    readonly toolCallIds?: AnthropicToolCallIdPolicy;
}

const DEFAULT_TOOL_CALL_IDS: AnthropicToolCallIdPolicy = {
    generateMissing: "reject",
    streamMissing: "reject",
};

/**
 * 发起一次非流式 Anthropic Messages 请求并归一化响应。
 *
 * @param connection - 端点、请求头与模型事实。
 * @param request - 供应商无关的生成请求。
 * @param control - 当前执行调用的中止控制。
 * @returns 归一化后的完整响应。
 * @throws AnthropicMessagesIncompleteError 终态或协议内容不可接受时抛出。
 * @throws AnthropicMessagesRefusalError 模型明确拒绝时抛出。
 * @throws ModelHttpRequestError 供应商返回非 2xx 状态时抛出，并由通用分类器进一步收窄。
 * @throws ExecutionAbortedError 调用已取消时抛出。
 *
 * @example
 * ```ts
 * const response = await generateAnthropicMessages(connection, request);
 * ```
 */
export async function generateAnthropicMessages(
    connection: AnthropicMessagesConnection,
    request: LLMRequest,
    control?: ExecutionControl,
): Promise<LLMResponse> {
    throwIfAborted(control);
    try {
        const response = await fetch(connection.url, {
            method: "POST",
            headers: requestHeaders(connection),
            body: JSON.stringify(buildAnthropicMessagesRequest(request, requestOptions(connection))),
            ...(control?.signal === undefined ? {} : { signal: control.signal }),
        });
        if (!response.ok) throw await toHttpFailure(response);
        throwIfAborted(control);
        const body: unknown = await response.json();
        return toAnthropicMessagesResponse(body, responseOptions(connection, request));
    } catch (error) {
        throw classifyFailure(error, control);
    }
}

/**
 * 发起一次流式 Anthropic Messages 请求并交付归一化事件。
 *
 * @remarks
 * 每条 SSE 事件反序列化后交给装配器；正常 EOF 后由装配器校验终态并产出唯一完成。
 * 空流、缺失终态、截断与拒绝都在协议边界失败，不切换为非流式重发。
 *
 * @param connection - 端点、请求头与模型事实。
 * @param request - 供应商无关的生成请求。
 * @param control - 当前执行调用的中止控制。
 * @returns 归一化流事件；最后一次事件是 `completed`。
 * @throws AnthropicMessagesIncompleteError 终态或协议内容不可接受时抛出。
 * @throws AnthropicMessagesRefusalError 模型明确拒绝时抛出。
 * @throws ModelHttpRequestError 供应商返回非 2xx 状态时抛出。
 * @throws ExecutionAbortedError 调用已取消时抛出。
 *
 * @example
 * ```ts
 * for await (const event of streamAnthropicMessages(connection, request)) console.log(event.kind);
 * ```
 */
export async function* streamAnthropicMessages(
    connection: AnthropicMessagesConnection,
    request: LLMRequest,
    control?: ExecutionControl,
): AsyncGenerator<LLMStreamEvent> {
    throwIfAborted(control);
    yield { kind: "started" };
    try {
        const response = await fetch(connection.url, {
            method: "POST",
            headers: { ...requestHeaders(connection), Accept: "text/event-stream" },
            body: JSON.stringify(buildAnthropicMessagesRequest(request, requestOptions(connection))),
            ...(control?.signal === undefined ? {} : { signal: control.signal }),
        });
        if (!response.ok) throw await toHttpFailure(response);
        const assembler = new AnthropicMessagesStreamAssembler(responseOptions(connection, request));
        const body = response.body;
        if (body !== null) {
            try {
                for await (const sse of readServerSentEvents(readBody(body))) {
                    throwIfAborted(control);
                    let event: unknown;
                    try {
                        event = JSON.parse(sse.data) as unknown;
                    } catch {
                        throw new AnthropicMessagesIncompleteError("Anthropic Messages stream contained a non-JSON event", "unsupported_content");
                    }
                    for (const mapped of assembler.push(event)) yield mapped;
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

function requestOptions(connection: AnthropicMessagesConnection): AnthropicMessagesRequestOptions {
    return {
        model: connection.model,
        ...(connection.maxOutputTokens === undefined ? {} : { defaultMaxOutputTokens: connection.maxOutputTokens }),
        ...(connection.modelMaxTokens === undefined ? {} : { modelMaxTokens: connection.modelMaxTokens }),
        identity: connection.identity,
    };
}

function responseOptions(
    connection: AnthropicMessagesConnection,
    request: LLMRequest,
): AnthropicMessagesResponseOptions {
    return {
        identity: connection.identity,
        request,
        textFormat: request.structuredOutput !== undefined && request.tools !== undefined && request.tools.length > 0 ? "plain"
            : request.structuredOutput !== undefined ? "json" : "plain",
        toolCallIds: connection.toolCallIds ?? DEFAULT_TOOL_CALL_IDS,
    };
}

function requestHeaders(connection: AnthropicMessagesConnection): Record<string, string> {
    return {
        ...connection.headers,
        "Content-Type": "application/json",
        Accept: "application/json",
    };
}

async function toHttpFailure(response: Response): Promise<ModelHttpRequestError> {
    let code: string | undefined;
    try {
        const body: unknown = await response.json();
        const error = asRecord(asRecord(body)?.error);
        const rawCode = error?.type;
        if (typeof rawCode === "string" && rawCode.length > 0) code = rawCode;
    } catch {
        // 响应体不是可解析的错误对象；只保留 HTTP 状态。
    }
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    return new ModelHttpRequestError(`Anthropic Messages request failed with HTTP ${response.status}`, {
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
