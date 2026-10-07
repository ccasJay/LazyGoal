import type { RunnerResult, SteerInputResult } from "./runner";
import type { RunExecutionOptions, RunRef } from "./domain";
import type { ExecutionControl } from "../../execution-control/src/index";

/**
 * 对已保存 Goal 发起执行的调度边界。
 *
 * @remarks
 * Coordinator 保证调用前已经保存 executing Goal。Scheduler 只转发明确的
 * RunRef 与可选瞬时授权，不拥有 Goal 内容，也不负责生成身份标识。
 *
 * @example
 * ```ts
 * const scheduler: RunScheduler = {
 *   schedule: (ref) => runner.runUntilBlocked(ref),
 * };
 * ```
 */
export interface RunScheduler {
    /**
     * @param ref - 已持久化 Goal 与当前 Run 的关联键。
     * @param options - 可选的本次调用瞬时 Action 授权，不会持久化。
     * @param control - 当前调度调用共享的中止控制。
     * @returns Runner 的业务结果。
     * @throws 调度基础设施或 Runner 依赖抛出的异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    schedule(
        ref: RunRef,
        options?: RunExecutionOptions,
        control?: ExecutionControl,
    ): Promise<RunnerResult>;

    /**
     * 持久化受理当前活动 Run 的 Steer 消息。
     *
     * @remarks
     * Steer 不启动新 Run、不取消现有调用；执行器在下一模型边界应用。
     * 实现需通过当前 Run 执行所有者转发，不能直接修改 Snapshot。
     *
     * @param ref - 目标 Goal 与 Run 的关联身份。
     * @param messageId - 客户端分配的幂等消息身份。
     * @param content - 非空消息正文。
     * @returns 已受理或稳定拒绝结果。
     */
    steer?(ref: RunRef, messageId: string, content: string): Promise<SteerInputResult>;
}
