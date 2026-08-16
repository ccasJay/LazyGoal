import type {
    AgentDecision,
    Goal,
    StepResult,
} from "./domain";
import type { ToolDefinition } from "./tool";

/**
 * 旧版一次 Step 的结构化领域结果。
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
 *
 * @deprecated 新的 StepExecutor 应返回 AgentDecision；该包装仅供
 * LegacyStepExecutor 实现兼容。
 */
export interface StepExecutionResult {
    readonly result: StepResult;
}

/**
 * 旧 StepResult 版本的单步执行边界。
 *
 * @remarks
 * 仅供当前 Runner 的迁移兼容使用；新实现应使用 StepExecutor 返回
 * AgentDecision。
 *
 * @example
 * ```ts
 * const executor: LegacyStepExecutor = {
 *   async execute() {
 *     return { result: { kind: "complete", summary: "目标完成" } };
 *   },
 * };
 * ```
 *
 * @deprecated 使用 StepExecutor。
 */
export interface LegacyStepExecutor {
    /**
     * @param goal - 当前已恢复并处于 `running` 的完整 Goal 快照。
     * @returns 旧版 StepExecutionResult。
     * @throws 执行失败时抛出异常；Runner 会按旧执行边界处理。
     */
    execute(goal: Goal, tools?: readonly ToolDefinition[]): Promise<StepExecutionResult>;
}

/**
 * AgentDecision 版本的单步执行边界。
 *
 * @remarks
 * 新实现必须接收当前 Profile 已授权的 ToolDefinition，只返回一个
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
     * @returns 新协议的 AgentDecision。
     * @throws 执行失败时抛出异常；Runner 会按执行边界处理。
     */
    execute(
        goal: Goal,
        tools: readonly ToolDefinition[],
    ): Promise<AgentDecision>;
}
