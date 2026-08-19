import type {
    AgentDecision,
    Goal,
} from "./domain";
import type { ToolDefinition } from "./tool";
import type { ExecutionControl } from "./execution-control";

/**
 * AgentDecision 版本的单步执行边界。
 *
 * @remarks
 * 实现必须接收当前 Profile 已授权的 ToolDefinition，只返回一个
 * `AgentDecision`。实现只应读取传入 Goal，不应自行持久化、执行 Tool 或修改它；
 * Runner 负责状态转换、授权、Tool 编排和保存。
 *
 * @example
 * ```ts
 * const executor: StepExecutor = {
 *   async execute(goal, tools) {
 *     return {
 *       kind: "complete",
 *       checkpoint: "已完成目标",
 *       summary: "目标完成",
 *     };
 *   },
 * };
 * ```
 */
export interface StepExecutor {
    /**
     * @param goal - 当前已恢复并处于 `running` 的完整 Goal 快照。
     * @param tools - 当前 Profile 授权且由 Registry 解析出的 Tool 描述。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 新协议的 AgentDecision。
     * @throws 执行失败时抛出异常；中止时抛出 `ExecutionAbortedError`，Runner
     *   会按执行边界处理其余异常。
     */
    execute(
        goal: Goal,
        tools: readonly ToolDefinition[],
        control?: ExecutionControl,
    ): Promise<AgentDecision>;
}
