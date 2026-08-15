import type { Goal, GoalMessage, StepResult } from "./domain";

/**
 * 一次 Step 的领域结果及需要原子追加到 Goal 的消息。
 *
 * @remarks
 * Runner 会先用 `result` 推进 Run，再把 `appendedMessages` 按原顺序追加到
 * Goal，并将两部分作为一个完整快照保存。
 */
export interface StepExecutionResult {
    readonly result: StepResult;
    readonly appendedMessages: readonly GoalMessage[];
}

/**
 * Runner 可替换的单步执行边界。
 *
 * @remarks
 * 实现只应读取传入 Goal，不应自行持久化或修改它。Runner 负责状态转换、
 * 消息追加和保存。抛出的异常会被 Runner 转换为一个 `fail` StepResult。
 */
export interface StepExecutor {
    /**
     * @param goal - 当前已恢复并处于 `running` 的完整 Goal 快照。
     * @returns 单步结果及本轮需要追加的消息。
     */
    execute(goal: Goal): Promise<StepExecutionResult>;
}
