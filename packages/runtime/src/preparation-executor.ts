import type { Goal, GoalTask } from "./domain";
import type { ExecutionControl } from "./execution-control";

/**
 * Preparation Executor 单轮返回的结构化决策。
 *
 * @remarks
 * `question` 与 `context_ready` 仅属于 `gathering_context`；
 * `task_proposal` 仅属于 `planning`。该结果不会消费 Run Step，也不直接包含
 * 待持久化消息，阶段推进和消息规范化由 Coordinator 负责。
 */
export type PreparationResult =
    | { readonly kind: "question"; readonly question: string }
    | { readonly kind: "context_ready" }
    | {
        readonly kind: "task_proposal";
        readonly task: GoalTask;
        readonly approvalRequest: string;
    };

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
 *   async execute(goal) {
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
     * @param goal - 当前处于 active Preparation 阶段的完整 Goal 快照。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 本轮结构化准备决策；不会产生或消费 Step。
     * @throws 底层模型、协议或扩展实现失败时传播对应异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    execute(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<PreparationResult>;
}
