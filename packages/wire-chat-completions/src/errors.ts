/**
 * Chat Completions 响应无法以可接受的方式完成。
 *
 * @remarks
 * 长度截断、内容过滤、缺少终态、重复终态、空流、无法归一化的内容与缺少调用身份
 * 都在协议边界以本错误拒绝；适配器不做内部重试，也不降级到其它协议。
 *
 * @example
 * ```ts
 * throw new ChatCompletionsIncompleteError("Stream ended without a finish reason", "missing_finish_reason");
 * ```
 */
export class ChatCompletionsIncompleteError extends Error {
    /** 稳定的错误标识。 */
    readonly code = "CHAT_COMPLETIONS_INCOMPLETE_RESPONSE";

    /** 导致响应无法提交的稳定分类。 */
    readonly reason: ChatCompletionsIncompleteReason;

    /**
     * @param message - 不含响应正文的诊断信息。
     * @param reason - 终态或响应协议失败类别。
     */
    constructor(message: string, reason: ChatCompletionsIncompleteReason) {
        super(message);
        this.name = "ChatCompletionsIncompleteError";
        this.reason = reason;
    }
}

/** Chat Completions 响应无法提交的稳定分类。 */
export type ChatCompletionsIncompleteReason =
    | "length"
    | "content_filter"
    | "provider_error"
    | "empty_stream"
    | "missing_finish_reason"
    | "duplicate_finish_reason"
    | "unsupported_finish_reason"
    | "tool_calls_without_call"
    | "missing_tool_call_id"
    | "unsupported_content";

/**
 * 模型明确拒绝当前请求。
 *
 * @remarks
 * 拒绝正文不进入可执行响应；已发布的分片只用于观察，不产生工具调用。
 *
 * @example
 * ```ts
 * throw new ChatCompletionsRefusalError();
 * ```
 */
export class ChatCompletionsRefusalError extends Error {
    /** 稳定的 refusal 分类码。 */
    readonly code = "CHAT_COMPLETIONS_REFUSAL";

    constructor() {
        super("Chat Completions model refused the request");
        this.name = "ChatCompletionsRefusalError";
    }
}
