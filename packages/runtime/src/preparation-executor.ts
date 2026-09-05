import type {
    Goal,
    WorkingMemory,
} from "./domain";
import type { ContextLookupResult } from "./context-retrieval";
import type { ExecutionControl } from "./execution-control";
import type { ToolDefinition } from "./tool";
import type { PreparationInputEvidence } from "./trajectory";
import type { PreparationResult } from "../../contracts/src/index";

export type {
    PreparationResult,
};


/**
 * Preparation Executor 的单轮对象式输入。
 *
 * @remarks
 * `goal` 是只读的完整快照；`authorizedTools` 是 Runtime 已解析的工具描述，
 * 不代表已执行的工具；`workingMemory` 是当前 structured@1 协议的临时投影；
 * `preparationInputEvidence` 是 committed Preparation 用户输入的 hash-only 投影，
 * 只在 Preparation 调用中可见，不包含消息正文，也不属于 Goal State；
 * `control` 只属于当前调用，不得写入 Goal。Executor 不得通过本对象修改 Runtime
 * 状态或自行持久化。
 *
 * @example
 * ```ts
 * const input: PreparationExecutionInput = {
 *     goal,
 *     authorizedTools: [],
 *     workingMemory,
 * };
 * ```
 */
export interface PreparationExecutionInput {
    /** 当前处于 active Preparation 的完整 Goal 快照。 */
    readonly goal: Goal;
    /** 当前 Profile 白名单与 Registry 的交集 Tool 描述。 */
    readonly authorizedTools: readonly ToolDefinition[];
    /** 当前 structured@1 协议的临时 Working Memory。 */
    readonly workingMemory?: WorkingMemory;
    /** 已提交 Preparation 用户输入的来源投影；Executing 调用不得传入该字段。 */
    readonly preparationInputEvidence?: readonly PreparationInputEvidence[];
    /** 当前 Goal 推进调用的瞬时中止控制。 */
    readonly control?: ExecutionControl;
    /** 上一轮 lookup 的瞬时结果；只在本次模型调用中可见，不写入 Goal。 */
    readonly contextLookupResult?: ContextLookupResult;
}

/**
 * Goal 准备阶段可替换的单轮执行边界。
 *
 * @remarks
 * 实现只应读取处于 active `gathering_context` 或 `planning` 的 Goal，不应修改
 * Goal、推进工作流或自行持久化。调用方负责校验结果与阶段的匹配关系，并在
 * 保存成功后决定是否继续下一轮。
 *
 * @example
 * ```ts
 * const executor: PreparationExecutor = {
 *   async execute({ goal }) {
 *     return goal.state.workflow.phase === "gathering_context"
 *       ? { kind: "context_ready" }
 *       : {
 *           kind: "task_proposal",
 *           task: { objective: goal.definition.intent, completionCriteria: [] },
 *           approvalRequest: "是否批准执行？",
 *         };
 *   },
 * };
 * ```
 */
export interface PreparationExecutor {
    /**
     * @param input - 当前处于 active Preparation 阶段的 Goal、授权 Tool 描述、
     *   可选 Working Memory 与瞬时中止控制。
     * @returns 本轮结构化准备决策；不会产生或消费 Step。
     * @throws 底层模型、协议或扩展实现失败时传播对应异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    execute(input: PreparationExecutionInput): Promise<PreparationResult>;
}
