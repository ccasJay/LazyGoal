/**
 * Tool 明确确认本次调用遇到可安全重放的暂时性基础设施故障。
 *
 * @remarks
 * Runner 仍只会在注册声明 `replayPolicy: "safe"` 且 Action 保持获准时重试；任意
 * 异常和 `failure.retryable` Observation 都不会隐式触发重放。进程内等待期间可用
 * `retryAfterMs` 提示退避，恢复计数保存在 pending Action 中。
 *
 * @example
 * ```ts
 * throw new TransientToolExecutionFailure("network_unavailable", 500);
 * ```
 */
export class TransientToolExecutionFailure extends Error {
    readonly retryAfterMs: number | undefined;
    readonly reason: string;

    /**
     * @param reason - 可记录的稳定、非敏感失败原因。
     * @param retryAfterMs - 可选的建议等待毫秒数。
     */
    constructor(reason: string, retryAfterMs?: number) {
        const boundedReason = reason.trim().length > 0 ? reason.slice(0, 120) : "transient_tool_failure";
        super(boundedReason);
        this.name = "TransientToolExecutionFailure";
        this.reason = boundedReason;
        this.retryAfterMs = retryAfterMs === undefined || !Number.isFinite(retryAfterMs)
            ? undefined
            : Math.min(30_000, Math.max(0, Math.trunc(retryAfterMs)));
    }
}
