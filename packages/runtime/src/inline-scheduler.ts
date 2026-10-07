import type { InterruptRunResult, Runner, RunnerResult, SteerInputResult } from "./runner";
import type { RunExecutionOptions, RunRef } from "./domain";
import {
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type { RunScheduler } from "./scheduler";

/**
 * 在当前调用栈内直接执行 Runner 的 Scheduler。
 *
 * @remarks
 * `schedule` 会等待 Run 到达 waiting 或终态后才返回。该实现没有队列、
 * 重试、并发隔离或进程重启恢复能力，适合测试与单进程同步运行。
 */
export class InlineScheduler implements RunScheduler {
    constructor(
        private readonly runner: Pick<Runner, "runUntilBlocked"> & Partial<Pick<Runner, "steer" | "interrupt">>,
    ) {}

    /**
     * 将 RunRef 与瞬时授权原样交给 Runner，并透传结果或异常。
     *
     * @param ref - 已持久化 Goal 与当前 Run 的关联键。
     * @param options - 可选的本次调用 Action 授权，不会由 Scheduler 持久化。
     * @param control - 当前调度调用共享的中止控制。
     * @returns Runner 的业务结果。
     * @throws Runner 或其依赖抛出的原始异常；中止时抛出 `ExecutionAbortedError`。
     */
    async schedule(
        ref: RunRef,
        options?: RunExecutionOptions,
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        const effectiveControl = control?.signal !== undefined
            ? control
            : options?.signal === undefined
                ? control
                : options.authorizedActionId === undefined
                    ? options
                    : { signal: options.signal };
        throwIfAborted(effectiveControl);
        const result = await this.runner.runUntilBlocked(ref, options, effectiveControl);
        throwIfAborted(effectiveControl);
        return result;
    }

    /**
     * 通过同一 Runner 执行所有者持久化受理 Steer。
     *
     * @param ref - 当前 Goal 与 Run 身份。
     * @param messageId - 稳定幂等消息身份。
     * @param content - 非空消息正文。
     * @returns 持久化受理或 Runner 返回的稳定拒绝。
     * @throws Snapshot 或 Trajectory 保存失败时传播原始错误。
     */
    steer(ref: RunRef, messageId: string, content: string): Promise<SteerInputResult> {
        return this.runner.steer === undefined
            ? Promise.resolve({ ok: false, error: "RUN_CONTROL_UNAVAILABLE" })
            : this.runner.steer(ref, messageId, content);
    }

    interrupt(ref: RunRef, requestId: string): Promise<InterruptRunResult> {
        return this.runner.interrupt === undefined
            ? Promise.resolve({ ok: false, error: "INTERRUPT_CONFLICT" })
            : this.runner.interrupt(ref, requestId);
    }
}
