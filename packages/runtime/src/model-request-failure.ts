import type { TransientModelFailureReason } from "../../execution-control/src/index";

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
        super(
            `Model request failed after ${attempts.length} attempts: ${attempts
                .map((item) => `${item.attempt}:${item.reason}${item.status === undefined ? "" : `(${item.status})`}`)
                .join(", ")}`,
        );
        this.name = "ModelRequestRetriesExhaustedError";
    }
}
