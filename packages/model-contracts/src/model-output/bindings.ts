import type { ContractBinding } from "../../../contract-binding/src/index";
import type {
    AskUserAgentDecision,
    CompletionReviewAccept,
    CompletionReviewReject,
    ContextLookupRequest,
    ExecutingCompleteAgentDecision,
    FailAgentDecision,
    GoalPlanUpdateAgentDecision,
    ModelContextCheckpointResult,
    NormalCompleteAgentDecision,
    RequestThink,
    RunPlanRouteUpdateAgentDecision,
    RunStageCompleteAgentDecision,
    RunStageUpdateAgentDecision,
    SystemAskUserInput,
    SystemCompleteRunInput,
    SystemCompleteRunStageInput,
    SystemCompleteTaskInput,
    SystemCompletionReviewInput,
    SystemContextCheckpointInput,
    SystemContextLookupInput,
    SystemFailGoalInput,
    SystemFindToolsInput,
    SystemProposeTaskPlanInput,
    SystemRequestThinkInput,
    SystemReviseRunStageInput,
    SystemStartNextRunStageInput,
    SystemStartRunStageInput,
    SystemUpdateGoalPlanInput,
    SystemUpdatePlanRouteInput,
    SystemWaitForInputInput,
    TaskProposalAgentDecision,
    ToolCallDecisionEnvelope,
    ToolDiscoveryDecision,
    WaitAgentDecision,
} from "./schema-types";

/**
 * 工具线交给模型线的单个授权工具绑定。
 *
 * @remarks
 * `id`、`description` 与 `isReadOnly` 对应工具注册定义的模型可见元数据；
 * `inputBinding` 是该工具输入类型的生成绑定。模型线只消费其 wire 投影、读取和未知字段
 * 策略，不拥有工具权限或执行语义。同一请求中的 `id` 必须非空且唯一。
 *
 * @example
 * ```ts
 * const tool: AuthorizedToolBinding = {
 *     id: "read_file",
 *     description: "Read a workspace file",
 *     inputBinding: readFileInputBinding,
 *     isReadOnly: true,
 * };
 * ```
 */
export interface AuthorizedToolBinding {
    /** 工具的稳定唯一标识。 */
    readonly id: string;
    /** 面向模型的工具用途说明。 */
    readonly description: string;
    /** 工具输入类型的生成绑定。 */
    readonly inputBinding: ContractBinding<unknown>;
    /** 工具是否为只读；不决定模型暴露或 Runtime 授权。 */
    readonly isReadOnly?: boolean;
}

/**
 * Executing 阶段按模式可用的决策分支绑定集合。
 *
 * @remarks
 * 每个绑定对应一个 canonical 决策分支；组合器按 Run 模式、任务批准状态和授权工具集合
 * 选择分支，不把全部绑定一次性暴露。`toolCall` 只绑定固定 envelope 字段；具体工具输入
 * 由 `AuthorizedToolBinding` 提供并在组合时插入。
 *
 * @example
 * ```ts
 * const bindings: ExecutingDecisionBindings = generatedExecutingBindings;
 * ```
 */
export interface ExecutingDecisionBindings {
    /** tool_call 决策固定外壳绑定；不包含动态 `action.input`。 */
    readonly toolCall: ContractBinding<ToolCallDecisionEnvelope>;
    /** 普通 Run 完成决策。 */
    readonly normalComplete: ContractBinding<NormalCompleteAgentDecision>;
    /** 获批 Plan Run 逐条件完成决策。 */
    readonly executingComplete: ContractBinding<ExecutingCompleteAgentDecision>;
    /** 等待决策。 */
    readonly wait: ContractBinding<WaitAgentDecision>;
    /** 失败决策。 */
    readonly fail: ContractBinding<FailAgentDecision>;
    /** 上下文查询决策。 */
    readonly contextLookup: ContractBinding<ContextLookupRequest>;
    /** 工具目录发现决策。 */
    readonly toolDiscovery: ContractBinding<ToolDiscoveryDecision>;
    /** 结构化提问决策。 */
    readonly askUser: ContractBinding<AskUserAgentDecision>;
    /** 任务提案决策。 */
    readonly taskProposal: ContractBinding<TaskProposalAgentDecision>;
    /** GoalPlan 更新决策。 */
    readonly goalPlanUpdate: ContractBinding<GoalPlanUpdateAgentDecision>;
    /** 阶段更新决策。 */
    readonly runStageUpdate: ContractBinding<RunStageUpdateAgentDecision>;
    /** 阶段完成候选决策。 */
    readonly runStageComplete: ContractBinding<RunStageCompleteAgentDecision>;
    /** 完整路线修订决策。 */
    readonly runPlanRouteUpdate: ContractBinding<RunPlanRouteUpdateAgentDecision>;
    /** Think 控制请求。 */
    readonly requestThink: ContractBinding<RequestThink>;
}

/**
 * 全部 system tools 的生成绑定集合。
 *
 * @remarks
 * 键是模型线稳定语义名，不是模型可见工具 ID；两个完成工具共享
 * `system_complete_task` 身份但绑定不同输入。阶段工具的绑定不携带阶段身份或版本，
 * 组合器从请求快照注入。
 *
 * @example
 * ```ts
 * const systemTools: SystemToolBindingSet = generatedSystemToolBindings;
 * ```
 */
export interface SystemToolBindingSet {
    /** 完成审查输入。 */
    readonly completionReview: ContractBinding<SystemCompletionReviewInput>;
    /** 逐条件完成任务输入。 */
    readonly completeTask: ContractBinding<SystemCompleteTaskInput>;
    /** 普通 Run 完成任务输入。 */
    readonly completeRun: ContractBinding<SystemCompleteRunInput>;
    /** 等待输入。 */
    readonly waitForInput: ContractBinding<SystemWaitForInputInput>;
    /** 失败输入。 */
    readonly failGoal: ContractBinding<SystemFailGoalInput>;
    /** 上下文查询输入。 */
    readonly contextLookup: ContractBinding<SystemContextLookupInput>;
    /** 工具目录查询输入。 */
    readonly findTools: ContractBinding<SystemFindToolsInput>;
    /** AskUser 输入。 */
    readonly askUser: ContractBinding<SystemAskUserInput>;
    /** 任务提案输入。 */
    readonly proposeTaskPlan: ContractBinding<SystemProposeTaskPlanInput>;
    /** 完整路线修订输入。 */
    readonly updatePlanRoute: ContractBinding<SystemUpdatePlanRouteInput>;
    /** 上下文检查点输入。 */
    readonly contextCheckpoint: ContractBinding<SystemContextCheckpointInput>;
    /** GoalPlan 更新输入。 */
    readonly updateGoalPlan: ContractBinding<SystemUpdateGoalPlanInput>;
    /** 开始新阶段输入。 */
    readonly startRunStage: ContractBinding<SystemStartRunStageInput>;
    /** 修订当前阶段输入。 */
    readonly reviseRunStage: ContractBinding<SystemReviseRunStageInput>;
    /** 当前阶段完成候选输入。 */
    readonly completeRunStage: ContractBinding<SystemCompleteRunStageInput>;
    /** 获批路线下一阶段的空输入。 */
    readonly startNextRunStage: ContractBinding<SystemStartNextRunStageInput>;
    /** Think 控制输入。 */
    readonly requestThink: ContractBinding<SystemRequestThinkInput>;
}

/**
 * 模型输出契约包和 system tools 的组合绑定集合。
 *
 * @remarks
 * 由生成制品装配后注入模型线组合器；生成器、绑定实现和模型投影由生成能力线拥有，
 * 本接口只固定模型线消费的字段与能力边界。
 *
 * @example
 * ```ts
 * const bindings: ModelOutputBindingSet = generatedModelOutputBindings;
 * ```
 */
export interface ModelOutputBindingSet {
    /** Executing 决策分支绑定。 */
    readonly executing: ExecutingDecisionBindings;
    /** Context Checkpoint 结果绑定。 */
    readonly checkpoint: ContractBinding<ModelContextCheckpointResult>;
    /** 完成审查按判别值分支的绑定。 */
    readonly completionReview: {
        /** 接受结果。 */
        readonly accept: ContractBinding<CompletionReviewAccept>;
        /** 拒绝结果。 */
        readonly reject: ContractBinding<CompletionReviewReject>;
    };
    /** 全部 system tools 输入绑定。 */
    readonly systemTools: SystemToolBindingSet;
}
