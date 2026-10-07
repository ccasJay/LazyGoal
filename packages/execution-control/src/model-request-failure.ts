/** 跨层可识别的暂时性模型请求故障类型。 */
export type TransientModelFailureReason =
    | "rate_limited"
    | "service_unavailable"
    | "connection"
    | "timeout";

/**
 * 适配器确认可由上层执行器安全重试的暂时模型请求故障。
 *
 * @remarks
 * 只有适配边界明确识别的限流、暂时性服务、连接或超时故障才应构造此类型；
 * 执行器不根据任意 Error 文本推断重试资格。
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
        super(
            `Transient model request failure: ${reason}${
                options.status === undefined ? "" : ` (HTTP ${options.status})`
            }`,
        );
        this.name = "TransientModelRequestFailure";
        this.status = options.status;
        this.retryAfterMs = options.retryAfterMs;
    }
}
