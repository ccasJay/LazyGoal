import type { RunnerResult } from "./runner";
import type { RunRef } from "./domain";

/**
 * 对已保存 Goal 发起执行的调度边界。
 *
 * @remarks
 * Launcher 保证调用前已经保存初始 Goal。Scheduler 只转发明确的 RunRef，
 * 不拥有 Goal 内容，也不负责生成身份标识。
 */
export interface RunScheduler {
    /**
     * @param ref - 已持久化 Goal 与当前 Run 的关联键。
     * @returns Runner 的业务结果。
     * @throws 调度基础设施或 Runner 依赖抛出的异常。
     */
    schedule(ref: RunRef): Promise<RunnerResult>;
}
