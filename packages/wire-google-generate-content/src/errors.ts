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
