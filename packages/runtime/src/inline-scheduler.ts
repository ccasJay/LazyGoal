import type { Runner, RunnerResult } from "./runner";
import type { RunRef } from "./domain";
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

    /** 将 RunRef 原样交给 Runner，并透传结果或异常。 */
    schedule(ref: RunRef): Promise<RunnerResult> {
        return this.runner.runUntilBlocked(ref);
    }
}
