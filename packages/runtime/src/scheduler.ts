/**
 * Scheduler 的当前边界：接收一个已经保存的 Run，交给未来的调度机制。
 *
 * 本阶段不实现队列、Worker、重试或自动 loop。
 */
export interface RunScheduler {
    // TODO-1: 声明单 Run 调度方法。
    // 要求：它只能接收一个 string 类型的 runId。
    // HINT-1：Launcher 需要等待调度完成，并把调度失败交给调用方。
    // HINT-2：不要接收 Goal、AgentProfile、Tool 或多个 Run ID。
    schedule(runId: string): Promise<void>;
}
