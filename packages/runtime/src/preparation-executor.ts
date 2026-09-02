import type {
    Goal,
    GoalTask,
    WorkingMemory,
    WorkingMemoryPatch,
    ModelContextCheckpointResult,
} from "./domain";
import type { ContextLookupResult } from "./context-retrieval";
import type { ExecutionControl } from "./execution-control";
import type { ToolDefinition } from "./tool";

/**
 * Preparation Executor 单轮返回的结构化决策。
 *
 * @remarks
 * `question`、`context_ready` 与 `context_lookup` 属于准备阶段；
 * `task_proposal` 仅属于 `planning`。`context_lookup` 不携带 Memory Patch，且
 * 不消费 Run Step。该结果不直接包含待持久化消息，阶段推进和消息规范化由
 * Coordinator 负责。
 */
export type PreparationResult =
    | ModelContextCheckpointResult
    | {
        readonly kind: "question";
        readonly question: string;
        /** structured@1 可选的 Memory 增量；由 Coordinator 验证后提交。 */
        readonly memoryPatch?: WorkingMemoryPatch;
    }
    | {
        readonly kind: "context_ready";
        /** structured@1 可选的 Memory 增量；由 Coordinator 验证后提交。 */
        readonly memoryPatch?: WorkingMemoryPatch;
    }
    | {
        readonly kind: "task_proposal";
        readonly task: GoalTask;
        readonly approvalRequest: string;
        /** structured@1 可选的 Memory 增量；由 Coordinator 验证后提交。 */
        readonly memoryPatch?: WorkingMemoryPatch;
    }
    | {
        /** 请求从 committed Trajectory 查询历史信息；该分支不携带 Memory Patch。 */
        readonly kind: "context_lookup";
        readonly need:
            | "historical_execution"
            | "decision_rationale"
            | "conversation_history";
        readonly question: string;
        readonly filters?: import("./context-retrieval").ContextLookupFilters;
    };

/**
 * Preparation Executor 的单轮对象式输入。
 *
 * @remarks
 * `goal` 是只读的完整快照；`authorizedTools` 是 Runtime 已解析的工具描述，
 * 不代表已执行的工具；`workingMemory` 是当前 structured@1 协议的临时投影；
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
