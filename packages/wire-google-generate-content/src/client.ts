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
import { GeminiIncompleteResponseError } from "./errors";
import { GenerateContentStreamAssembler, toGenerateContentResponse, type GenerateContentResponseOptions } from "./events";
import { buildGenerateContentRequest, type GenerateContentRequestOptions } from "./request";

/** Google Generative Language 官方端点前缀；请求发往其 `models/` 路径。 */
export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * 一次 GenerateContent 连接的协议无关事实。
 *
 * @remarks
 * 线格式不持有端点、凭据或供应商分支：`urlPrefix` 与 `headers` 由适配器提供。
 * 请求构造、SSE 分帧、chunk 映射、逆向投影与终态校验由本包实现。
 *
 * @example
 * ```ts
 * const connection: GenerateContentConnection = {
 *     urlPrefix: "https://generativelanguage.googleapis.com/v1beta",
 *     headers: { "x-goog-api-key": "secret" },
 *     model: "gemini-2.5-flash",
 *     identity: { provider: "google", endpoint: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", protocol: "gemini-content" },
 * };
 * ```
 */
export interface GenerateContentConnection {
    /** 端点前缀；请求路径为 `{urlPrefix}/models/{model}:generateContent`。 */
    readonly urlPrefix: string;
    /** 适配器拥有的请求头，通常包含认证。 */
    readonly headers: Readonly<Record<string, string>>;
    /** 请求使用的模型标识。 */
    readonly model: string;
    /** 请求未声明输出上限时使用的默认值。 */
    readonly maxOutputTokens?: number;
    /** 历史回放的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
}

/**
 * 发起一次非流式 GenerateContent 请求并归一化响应。
 *
 * @param connection - 端点、请求头与模型事实。
 * @param request - 供应商无关的生成请求。
 * @param control - 当前执行调用的中止控制。
 * @returns 归一化后的完整响应。
 * @throws GeminiIncompleteResponseError 终态或协议内容不可接受时抛出。
 * @throws ModelHttpRequestError 供应商返回非 2xx 状态时抛出，并由通用分类器进一步收窄。
 * @throws ExecutionAbortedError 调用已取消时抛出。
 *
 * @example
 * ```ts
 * const response = await generateGenerateContent(connection, request);
 * ```
 */
export async function generateGenerateContent(
    connection: GenerateContentConnection,
    request: LLMRequest,
    control?: ExecutionControl,
): Promise<LLMResponse> {
    throwIfAborted(control);
    try {
        const response = await fetch(`${connection.urlPrefix.replace(/\/+$/, "")}/models/${connection.model}:generateContent`, {
            method: "POST",
            headers: requestHeaders(connection),
            body: JSON.stringify(buildGenerateContentRequest(request, requestOptions(connection))),
            ...(control?.signal === undefined ? {} : { signal: control.signal }),
        });
        if (!response.ok) throw await toHttpFailure(response);
        throwIfAborted(control);
        const body: unknown = await response.json();
        return toGenerateContentResponse(body, responseOptions(connection, request));
    } catch (error) {
        throw classifyFailure(error, control);
    }
}

/**
 * 发起一次流式 GenerateContent 请求并交付归一化事件。
 *
 * @remarks
 * 每条 `data:` SSE 帧反序列化后交给装配器；正常 EOF 后由装配器校验终态并产出唯一完成。
 * 空流、缺少结束原因、截断与安全阻断都在协议边界失败，不切换为非流式重发。
 *
 * @param connection - 端点、请求头与模型事实。
 * @param request - 供应商无关的生成请求。
 * @param control - 当前执行调用的中止控制。
 * @returns 归一化流事件；最后一次事件是 `completed`。
 * @throws GeminiIncompleteResponseError 终态或协议内容不可接受时抛出。
 * @throws ModelHttpRequestError 供应商返回非 2xx 状态时抛出。
 * @throws ExecutionAbortedError 调用已取消时抛出。
 *
 * @example
 * ```ts
 * for await (const event of streamGenerateContent(connection, request)) console.log(event.kind);
 * ```
 */
export async function* streamGenerateContent(
    connection: GenerateContentConnection,
    request: LLMRequest,
    control?: ExecutionControl,
): AsyncGenerator<LLMStreamEvent> {
    throwIfAborted(control);
    yield { kind: "started" };
    try {
        const response = await fetch(`${connection.urlPrefix.replace(/\/+$/, "")}/models/${connection.model}:streamGenerateContent?alt=sse`, {
            method: "POST",
            headers: { ...requestHeaders(connection), Accept: "text/event-stream" },
            body: JSON.stringify(buildGenerateContentRequest(request, requestOptions(connection))),
            ...(control?.signal === undefined ? {} : { signal: control.signal }),
        });
        if (!response.ok) throw await toHttpFailure(response);
        const assembler = new GenerateContentStreamAssembler(responseOptions(connection, request));
        const body = response.body;
        if (body !== null) {
            try {
                for await (const sse of readServerSentEvents(readBody(body))) {
                    throwIfAborted(control);
                    let chunk: unknown;
                    try {
                        chunk = JSON.parse(sse.data) as unknown;
                    } catch {
                        throw new GeminiIncompleteResponseError("GenerateContent stream contained a non-JSON event");
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

function requestOptions(connection: GenerateContentConnection): GenerateContentRequestOptions {
    return {
        model: connection.model,
        ...(connection.maxOutputTokens === undefined ? {} : { maxOutputTokens: connection.maxOutputTokens }),
        identity: connection.identity,
    };
}

function responseOptions(
    connection: GenerateContentConnection,
    request: LLMRequest,
): GenerateContentResponseOptions {
    return {
        identity: connection.identity,
        request,
        textFormat: request.structuredOutput !== undefined && request.tools !== undefined && request.tools.length > 0 ? "plain"
            : request.structuredOutput !== undefined ? "json" : "plain",
    };
}

function requestHeaders(connection: GenerateContentConnection): Record<string, string> {
    return {
        ...connection.headers,
        "Content-Type": "application/json",
        Accept: "application/json",
    };
}

async function toHttpFailure(response: Response): Promise<ModelHttpRequestError> {
    let message: string | undefined;
    try {
        const body: unknown = await response.json();
        const error = asRecord(asRecord(body)?.error);
        const raw = error?.message ?? error?.status;
        if (typeof raw === "string" && raw.length > 0) message = raw;
    } catch {
        // 响应体不是可解析的错误对象；只保留 HTTP 状态。
    }
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    return new ModelHttpRequestError(
        `GenerateContent request failed with HTTP ${response.status}${message === undefined ? "" : `: ${message}`}`,
        {
            status: response.status,
            ...(message === undefined ? {} : { code: message }),
            ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
        },
    );
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
