/**
 * 适配边界已确认、不可由协议纠错解决的模型请求失败。
 *
 * @remarks
 * 消息必须是可公开的诊断，不包含供应商响应正文、凭据或请求内容；不授予重试资格。
 * Runtime 将其归为请求失败，不作为模型决策格式错误反馈。
 *
 * @example
 * ```ts
 * throw new ModelRequestFailure("Provider rejected the model request (HTTP 403)");
 * ```
 */
export class ModelRequestFailure extends Error {
    /** @param message - 适配器生成的安全诊断摘要。 */
    constructor(message: string) {
        super(message);
        this.name = "ModelRequestFailure";
    }
}

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

/**
 * 供应商明确以超出上下文窗口拒绝请求的故障。
 *
 * @remarks
 * 只有适配边界从结构化状态、错误代码或供应商明确的窗口拒绝文案识别出来时才构造此类型；
 * 普通请求错误与协议错误不得归入本类型。Runtime 依据该类型执行一次工作窗口整理，
 * 并在整理成功后只重试一次同一逻辑请求。消息不得包含供应商响应正文、凭据或请求内容。
 *
 * @example
 * ```ts
 * throw new ContextWindowRejectedError({ status: 400, providerCode: "context_length_exceeded" });
 * ```
 */
export class ContextWindowRejectedError extends ModelRequestFailure {
    readonly kind = "context_window_rejected" as const;
    readonly status: number | undefined;
    readonly providerCode: string | undefined;

    /**
     * @param options - 可选的 HTTP 拒绝状态与供应商错误代码，仅用于诊断。
     */
    constructor(options: { readonly status?: number; readonly providerCode?: string } = {}) {
        super(
            `Provider rejected the model request because it exceeds the model context window${
                options.status === undefined ? "" : ` (HTTP ${options.status})`
            }`,
        );
        this.name = "ContextWindowRejectedError";
        this.status = options.status;
        this.providerCode = options.providerCode;
    }
}
