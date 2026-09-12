import type {
    AgentDecision,
    Goal,
    WorkingMemory,
} from "./domain";
import type { ContextLookupResult } from "./context-retrieval";
import type { ToolDefinition } from "./tool";
import type { ExecutionControl } from "./execution-control";

/**
 * Step Executor 的单轮对象式输入。
 *
 * @remarks
 * `goal` 是已恢复的完整快照；`authorizedTools` 是 Runtime 解析出的授权工具
 * 描述；`workingMemory` 是当前 structured@1 协议的临时投影；`control` 是
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
    /** 当前 structured@1 协议的临时 Working Memory。 */
    readonly workingMemory?: WorkingMemory;
    /** 当前 Run 推进调用的瞬时中止控制。 */
    readonly control?: ExecutionControl;
    /** 上一轮已提交 lookup 的瞬时结果；调用结束后由 Runtime 丢弃。 */
    readonly contextLookupResult?: ContextLookupResult;
}

/**
 * 携带可选思考链的单步执行结果。
 *
 * @remarks
 * 在两阶段决策流或支持推理链的模型下，StepExecutor 可在输出标准 AgentDecision 的同时
 * 附带第一阶段推演产出的思考链（CoT）文本，供 Trajectory 持久化与 TUI 复盘。
 *
 * @example
 * ```ts
 * const result: StepExecutionResult = {
 *   decision: { kind: "complete", summary: "完成", completionEvidence: [] },
 *   thought: "已根据文件内容完成审查，可以安全结束。",
 * };
 * ```
 */
export type StepExecutionResult = AgentDecision & {
    /** 当前 structured@1 的决策动作。 */
    readonly decision: AgentDecision;
    /** 模型自由推演产出的思考链纯文本（如果有）。 */
    readonly thought?: string;
};

/**
 * AgentDecision 版本的单步执行边界。
 *
 * @remarks
 * 实现必须接收当前 Profile 已授权的 ToolDefinition，返回一个
 * `AgentDecision` 或携带思考链的 `StepExecutionResult`。实现只应读取传入 Goal，不应自行持久化、执行 Tool 或修改它；
 * Runner 负责状态转换、授权、Tool 编排和保存。
 *
 * @example
 * ```ts
 * const executor: StepExecutor = {
 *   async execute({ goal }) {
 *     return {
 *       kind: "complete",
 *       summary: "目标完成",
 *       completionEvidence: [],
 *     };
 *   },
 * };
 * ```
 */
export interface StepExecutor {
    /**
     * @param input - 当前已恢复并处于 `running` 的 Goal、授权 Tool 描述、当前
     *   Working Memory 与瞬时中止控制。
     * @returns 当前 structured@1 的 AgentDecision 或携带思考链的 StepExecutionResult。
     * @throws 执行失败时抛出异常；中止时抛出 `ExecutionAbortedError`，Runner
     *   会按执行边界处理其余异常。
     */
    execute(input: StepExecutionInput): Promise<AgentDecision | StepExecutionResult>;
}
