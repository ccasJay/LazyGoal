import type { Goal, StepResult } from "./domain";

/**
 * 一次 Step 的结构化领域结果。
 *
 * @remarks
 * Executor 不拥有会话消息。Runner 使用 `result` 推进 Run，并按结果类型决定
 * 是否生成规范化 assistant 消息，再将状态和消息作为一个快照保存。
 *
 * @example
 * ```ts
 * const execution: StepExecutionResult = {
 *   result: { kind: "continue", summary: "已完成检查" },
 * };
 * ```
 */
export interface StepExecutionResult {
    readonly result: StepResult;
}

/**
 * Runner 可替换的单步执行边界。
 *
 * @remarks
 * 实现只应读取传入 Goal，不应自行持久化或修改它。Runner 负责状态转换、
 * 规范化消息和保存。抛出的异常会被 Runner 转换为一个无 assistant 消息的
 * `fail` StepResult。
 *
 * @example
 * ```ts
 * const executor: StepExecutor = {
 *   async execute() {
 *     return { result: { kind: "complete", summary: "目标完成" } };
 *   },
 * };
 * ```
 */
export interface StepExecutor {
    /**
     * @param goal - 当前已恢复并处于 `running` 的完整 Goal 快照。
     * @returns 本轮唯一的结构化 StepResult。
     * @throws 执行失败时抛出异常；Runner 会将其转换为 fail Step。
     */
    execute(goal: Goal): Promise<StepExecutionResult>;
}
