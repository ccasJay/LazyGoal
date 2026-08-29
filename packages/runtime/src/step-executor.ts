import type {
    AgentDecision,
    Goal,
    WorkingMemory,
} from "./domain";
import type { ToolDefinition } from "./tool";
import type { ExecutionControl } from "./execution-control";

/**
 * Step Executor 的单轮对象式输入。
 *
 * @remarks
 * `goal` 是已恢复的完整快照；`authorizedTools` 是 Runtime 解析出的授权工具
 * 描述；`workingMemory` 仅在结构化协议下提供，旧协议必须省略；`control` 是
 * 当前调用的瞬时中止控制。Executor 不得通过该对象修改 Goal、执行 Tool 或持久化。
 *
 * @example
 * ```ts
 * const input: StepExecutionInput = {
 *     goal,
 *     authorizedTools: [],
 *     workingMemory,
 * };
 * ```
 */
export interface StepExecutionInput {
    /** 当前处于 executing 的完整 Goal 快照。 */
    readonly goal: Goal;
    /** 当前 Profile 白名单与 Registry 的交集 Tool 描述。 */
    readonly authorizedTools: readonly ToolDefinition[];
    /** 结构化协议的临时 Working Memory；legacy 协议必须省略。 */
    readonly workingMemory?: WorkingMemory;
    /** 当前 Run 推进调用的瞬时中止控制。 */
    readonly control?: ExecutionControl;
}

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
 *   async execute({ goal }) {
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
     * @param input - 当前已恢复并处于 `running` 的 Goal、授权 Tool 描述、可选
     *   Working Memory 与瞬时中止控制。
     * @returns 新协议的 AgentDecision。
     * @throws 执行失败时抛出异常；中止时抛出 `ExecutionAbortedError`，Runner
     *   会按执行边界处理其余异常。
     */
    execute(input: StepExecutionInput): Promise<AgentDecision>;
}
