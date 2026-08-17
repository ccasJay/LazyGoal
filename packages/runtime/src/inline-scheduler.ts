import type { Runner, RunnerResult } from "./runner";
import type { RunExecutionOptions, RunRef } from "./domain";
import {
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
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
        private readonly runner: Pick<Runner, "runUntilBlocked">,
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
}
