/** Runtime 可识别的暂时性模型请求故障类型。 */
export type TransientModelFailureReason = "rate_limited" | "service_unavailable" | "connection" | "timeout";

/**
 * 单次模型请求的稳定失败摘要。
 *
 * @example
 * ```ts
 * const attempt: ModelRequestAttemptFailure = { attempt: 1, reason: "service_unavailable", status: 503 };
 * ```
 */
export interface ModelRequestAttemptFailure {
    readonly attempt: number;
    readonly reason: TransientModelFailureReason;
    readonly status?: number;
}

/**
 * Provider 适配器确认可由 Runner 安全重试的暂时模型请求故障。
 *
 * @remarks
 * 只有适配边界明确识别的限流、暂时性服务、连接或超时故障才应构造此类型；
 * Runner 不根据任意 Error 文本推断重试资格。
 *
 * @example
 * ```ts
 * throw new TransientModelRequestFailure("rate_limited", { status: 429 });
 * ```
 */
export class TransientModelRequestFailure extends Error {
    readonly kind = "transient_model_request" as const;
    readonly status: number | undefined;
    readonly retryAfterMs: number | undefined;

    /**
     * @param reason - 适配器识别出的暂时故障类别。
     * @param options - 可选 HTTP 状态码与服务端建议退避时间。
     */
    constructor(
        readonly reason: TransientModelFailureReason,
        options: { readonly status?: number; readonly retryAfterMs?: number } = {},
    ) {
        super(`Transient model request failure: ${reason}${options.status === undefined ? "" : ` (HTTP ${options.status})`}`);
        this.name = "TransientModelRequestFailure";
        this.status = options.status;
        this.retryAfterMs = options.retryAfterMs;
    }
}

/**
 * 同一模型请求达到 Runtime 调用上限后携带各次稳定失败摘要的终态错误。
 *
 * @example
 * ```ts
 * const failure = new ModelRequestRetriesExhaustedError([
 *     { attempt: 1, reason: "service_unavailable", status: 503 },
 * ]);
 * ```
 */
export class ModelRequestRetriesExhaustedError extends Error {
    /** @param attempts - 已发生的每次模型请求失败摘要，顺序与实际调用一致。 */
    constructor(readonly attempts: readonly ModelRequestAttemptFailure[]) {
        super(`Model request failed after ${attempts.length} attempts: ${attempts.map((item) => `${item.attempt}:${item.reason}${item.status === undefined ? "" : `(${item.status})`}`).join(", ")}`);
        this.name = "ModelRequestRetriesExhaustedError";
    }
}
