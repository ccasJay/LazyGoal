/**
 * Anthropic Messages 响应无法以可接受的方式完成。
 *
 * @remarks
 * 输出上限截断、内容过滤、缺少终态、空流、无法归一化的内容与协议违规都在协议边界
 * 以本错误拒绝；适配器不做内部重试，也不降级到其它协议。
 *
 * @example
 * ```ts
 * throw new AnthropicMessagesIncompleteError("Stream ended without a message_delta stop_reason", "missing_stop_reason");
 * ```
 */
export class AnthropicMessagesIncompleteError extends Error {
    /** 稳定的错误标识。 */
    readonly code = "ANTHROPIC_MESSAGES_INCOMPLETE_RESPONSE";

    /** 导致响应无法提交的稳定分类。 */
    readonly reason: AnthropicMessagesIncompleteReason;

    /**
     * @param message - 不含响应正文的诊断信息。
     * @param reason - 终态或响应协议失败类别。
     */
    constructor(message: string, reason: AnthropicMessagesIncompleteReason) {
        super(message);
        this.name = "AnthropicMessagesIncompleteError";
        this.reason = reason;
    }
}

/** Anthropic Messages 响应无法提交的稳定分类。 */
export type AnthropicMessagesIncompleteReason =
    | "max_tokens"
    | "refusal"
    | "provider_error"
    | "empty_stream"
    | "missing_stop_reason"
    | "unsupported_content"
    | "missing_tool_use_id"
    | "missing_thinking_signature";

/**
 * Anthropic 模型明确拒绝当前请求。
 *
 * @remarks
 * 拒绝由 `stop_reason: "refusal"` 表达；拒绝正文不进入可执行响应，已发布的分片只用于观察。
 *
 * @example
 * ```ts
 * throw new AnthropicMessagesRefusalError();
 * ```
 */
export class AnthropicMessagesRefusalError extends Error {
    /** 稳定的 refusal 分类码。 */
    readonly code = "ANTHROPIC_MESSAGES_REFUSAL";

    constructor() {
        super("Anthropic Messages model refused the request");
        this.name = "AnthropicMessagesRefusalError";
    }
}
