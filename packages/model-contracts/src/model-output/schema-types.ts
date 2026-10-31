import type { JsonValue } from "../../../contracts/src/index";

/**
 * 无边界 JSON 整数。
 *
 * @remarks
 * 用于 Context Lookup sequence 两端等只要求整数、不声明范围的字段。
 *
 * @asType integer
 *
 * @example
 * ```ts
 * const value: JsonInteger = 3;
 * ```
 */
export type JsonInteger = number;

/**
 * 非负 JSON 整数。
 *
 * @remarks
 * 用于索引、位置、序列和 revision 等以 0 为下界的字段或数组元素。
 *
 * @asType integer
 * @minimum 0
 *
 * @example
 * ```ts
 * const index: NonNegativeInteger = 0;
 * ```
 */
export type NonNegativeInteger = number;

/**
 * 正 JSON 整数。
 *
 * @remarks
 * 用于基础修订号等从 1 开始的字段或数组元素。
 *
 * @asType integer
 * @minimum 1
 *
 * @example
 * ```ts
 * const revision: PositiveInteger = 1;
 * ```
 */
export type PositiveInteger = number;

/**
 * 上下文查询的返回数量上限。
 *
 * @remarks
 * 限制在 1 到 50 之间，避免目录查询扫描无界候选集。
 *
 * @asType integer
 * @minimum 1
 * @maximum 50
 *
 * @example
 * ```ts
 * const limit: ContextLookupPageSize = 10;
 * ```
 */
export type ContextLookupPageSize = number;

/**
 * 完成条件声明的预期结果。
 *
 * @remarks
 * 只允许成功或失败两种证据结果；具体证据由 Runtime 校验，模型自述不构成证据。
 *
 * @example
 * ```ts
 * const outcome: CompletionExpectOutcome = "success";
 * ```
 */
export type CompletionExpectOutcome = "success" | "failure";

/**
 * 完成条件的验收声明。
 *
 * @remarks
 * 声明该条件至少需要一条指定工具与结果的可信 Observation；由任务创建方提供。
 *
 * @example
 * ```ts
 * const acceptance: CompletionAcceptance = {
 *     expectToolId: "bash",
 *     expectOutcome: "success",
 * };
 * ```
 */
export interface CompletionAcceptance {
    /** 预期产生证据的业务工具 ID。 */
    readonly expectToolId: string;
    /** 预期证据结果。 */
    readonly expectOutcome: CompletionExpectOutcome;
}

/**
 * 单条完成条件。
 *
 * @remarks
 * `acceptance` 可选；提供时由 Runtime 在完成校验阶段验证引用证据。
 *
 * @example
 * ```ts
 * const criterion: CompletionCriterion = { text: "测试全部通过" };
 * ```
 */
export interface CompletionCriterion {
    /** 面向模型与用户的条件描述。 */
    readonly text: string;
    /** 可选的证据验收声明。 */
    readonly acceptance?: CompletionAcceptance;
}

/**
 * Goal 任务定义。
 *
 * @remarks
 * 包含目标描述与完成条件列表；完成条件可携带可选验收声明。
 *
 * @example
 * ```ts
 * const task: GoalTask = {
 *     objective: "实现功能 X",
 *     completionCriteria: [{ text: "测试通过" }],
 * };
 * ```
 */
export interface GoalTask {
    /** 任务目标描述。 */
    readonly objective: string;
    /** 完成条件列表。 */
    readonly completionCriteria: readonly CompletionCriterion[];
}

/**
 * Plan Run 阶段路线中的单个候选阶段。
 *
 * @remarks
 * 候选只携带目标与验收条件，不包含阶段身份、状态或恢复游标。
 *
 * @example
 * ```ts
 * const stage: RunPlanRouteStageCandidate = {
 *     target: "调查入口",
 *     acceptanceCriteria: ["定位现有实现"],
 * };
 * ```
 */
export interface RunPlanRouteStageCandidate {
    /** 阶段目标。 */
    readonly target: string;
    /**
     * 阶段验收条件；至少包含一项。
     *
     * @minItems 1
     */
    readonly acceptanceCriteria: readonly string[];
}

/**
 * Plan Run 的有序阶段路线候选。
 *
 * @remarks
 * 阶段身份、状态和游标由 Runtime 在任务提案批准后分配和持久化；路线至少包含一个阶段。
 *
 * @example
 * ```ts
 * const route: RunPlanRouteCandidate = {
 *     stages: [{ target: "实现修复", acceptanceCriteria: ["回归通过"] }],
 * };
 * ```
 */
export interface RunPlanRouteCandidate {
    /**
     * 有序候选阶段；至少包含一个阶段。
     *
     * @minItems 1
     */
    readonly stages: readonly RunPlanRouteStageCandidate[];
}

/**
 * GoalPlan Todo 的生命周期状态。
 *
 * @example
 * ```ts
 * const status: GoalPlanStatus = "pending";
 * ```
 */
export type GoalPlanStatus = "pending" | "in_progress" | "completed" | "cancelled";

/**
 * 新增 GoalPlan Todo 的操作。
 *
 * @remarks
 * Todo ID 与最终位置由 Runtime 分配；`position` 只是期望位置。
 *
 * @example
 * ```ts
 * const operation: GoalPlanAddOperation = { type: "add", content: "检查现有实现" };
 * ```
 */
export interface GoalPlanAddOperation {
    /** 操作判别值。 */
    readonly type: "add";
    /** Todo 内容。 */
    readonly content: string;
    /**
     * 期望插入位置，从 0 开始。
     */
    readonly position?: NonNegativeInteger;
}

/**
 * 更新 GoalPlan Todo 内容或状态的操作。
 *
 * @remarks
 * 至少需要修改内容或状态之一；置为完成时必须引用当前 Run 证据。
 *
 * @example
 * ```ts
 * const operation: GoalPlanUpdateOperation = { type: "update", id: "todo-1", status: "completed", evidenceSequences: [12] };
 * ```
 */
export interface GoalPlanUpdateOperation {
    /** 操作判别值。 */
    readonly type: "update";
    /** 目标 Todo ID。 */
    readonly id: string;
    /** 新内容。 */
    readonly content?: string;
    /** 新状态。 */
    readonly status?: GoalPlanStatus;
    /** 完成时引用的当前 Run 证据序列。 */
    readonly evidenceSequences?: readonly NonNegativeInteger[];
}

/**
 * 重排 GoalPlan Todo 的操作。
 *
 * @example
 * ```ts
 * const operation: GoalPlanReorderOperation = { type: "reorder", id: "todo-1", position: 0 };
 * ```
 */
export interface GoalPlanReorderOperation {
    /** 操作判别值。 */
    readonly type: "reorder";
    /** 目标 Todo ID。 */
    readonly id: string;
    /**
     * 目标位置，从 0 开始。
     */
    readonly position: NonNegativeInteger;
}

/**
 * 取消 GoalPlan Todo 的操作。
 *
 * @example
 * ```ts
 * const operation: GoalPlanCancelOperation = { type: "cancel", id: "todo-1" };
 * ```
 */
export interface GoalPlanCancelOperation {
    /** 操作判别值。 */
    readonly type: "cancel";
    /** 目标 Todo ID。 */
    readonly id: string;
}

/**
 * GoalPlan Patch 的单项操作。
 *
 * @remarks
 * 由 `type` 判别四种互斥操作；Runtime 负责 ID、revision、证据和状态转换校验。
 *
 * @example
 * ```ts
 * const operation: GoalPlanPatchOperation = { type: "add", content: "检查依赖" };
 * ```
 */
export type GoalPlanPatchOperation =
    | GoalPlanAddOperation
    | GoalPlanUpdateOperation
    | GoalPlanReorderOperation
    | GoalPlanCancelOperation;

/**
 * Context Lookup 支持的历史需求类别。
 *
 * @example
 * ```ts
 * const need: ContextLookupNeed = "historical_execution";
 * ```
 */
export type ContextLookupNeed = "conversation_history" | "historical_execution" | "decision_rationale";

/**
 * Context Lookup 的 sequence 闭区间过滤。
 *
 * @example
 * ```ts
 * const range: ContextLookupSequenceRange = { from: 1, to: 10 };
 * ```
 */
export interface ContextLookupSequenceRange {
    /** 区间起点。 */
    readonly from: JsonInteger;
    /** 区间终点。 */
    readonly to: JsonInteger;
}

/**
 * Context Lookup 结构化过滤器。
 *
 * @remarks
 * 各数组过滤器最多包含 16 项；`sequenceRange` 的起点不得大于终点。
 *
 * @example
 * ```ts
 * const filters: ContextLookupFilters = { toolIds: ["read_file"] };
 * ```
 */
export interface ContextLookupFilters {
    /**
     * 事件类型过滤；最多 16 项。
     *
     * @maxItems 16
     */
    readonly eventTypes?: readonly string[];
    /**
     * 工具 ID 过滤；最多 16 项。
     *
     * @maxItems 16
     */
    readonly toolIds?: readonly string[];
    /**
     * Action ID 过滤；最多 16 项。
     *
     * @maxItems 16
     */
    readonly actionIds?: readonly string[];
    /**
     * Step 索引过滤；最多 16 项。
     *
     * @maxItems 16
     */
    readonly stepIndexes?: readonly NonNegativeInteger[];
    /**
     * 路径过滤；最多 16 项。
     *
     * @maxItems 16
     */
    readonly paths?: readonly string[];
    /**
     * 错误码过滤；最多 16 项。
     *
     * @maxItems 16
     */
    readonly errorCodes?: readonly string[];
    /**
     * 对象 ID 过滤；最多 16 项。
     *
     * @maxItems 16
     */
    readonly objectIds?: readonly string[];
    /** Sequence 区间过滤。 */
    readonly sequenceRange?: ContextLookupSequenceRange;
}

/**
 * Context Lookup 操作类别。
 *
 * @example
 * ```ts
 * const operation: ContextLookupOperation = "directory_browse";
 * ```
 */
export type ContextLookupOperation = "history_search" | "directory_browse" | "directory_search" | "source_expand";

/**
 * Context Lookup 请求。
 *
 * @remarks
 * 从已提交 Trajectory 与派生索引查询上下文；不同操作使用各自互斥字段。
 *
 * @example
 * ```ts
 * const request: ContextLookupRequest = { kind: "context_lookup", operation: "directory_browse", limit: 10 };
 * ```
 */
export interface ContextLookupRequest {
    /** 决策判别值。 */
    readonly kind: "context_lookup";
    /** 操作类别。 */
    readonly operation?: ContextLookupOperation;
    /** 历史查询需求类别。 */
    readonly need?: ContextLookupNeed;
    /** 历史查询问题。 */
    readonly question?: string;
    /** 结构化过滤器。 */
    readonly filters?: ContextLookupFilters;
    /** 目录搜索查询。 */
    readonly query?: string;
    /** 目录游标。 */
    readonly cursor?: string;
    /**
     * 返回数量上限。
     */
    readonly limit?: ContextLookupPageSize;
    /** 目录类别。 */
    readonly category?: string;
    /** 直接展开的来源引用。 */
    readonly sourceRef?: string;
    /**
     * 展开偏移。
     */
    readonly offset?: NonNegativeInteger;
}

/**
 * Decide 阶段请求 Runtime 搜索可用工具目录的决策。
 *
 * @remarks
 * 只请求搜索当前 Profile 授权且已注册的工具，不授予执行权限。
 *
 * @example
 * ```ts
 * const decision: ToolDiscoveryDecision = { kind: "tool_discovery", query: "read repository files" };
 * ```
 */
export interface ToolDiscoveryDecision {
    /** 决策判别值。 */
    readonly kind: "tool_discovery";
    /** 工具搜索查询。 */
    readonly query: string;
}

/**
 * Decide 阶段请求进入 Think 阶段的控制结果。
 *
 * @remarks
 * 不属于 AgentDecision，也不授予业务工具权限；`goal` 必须说明要解决的具体问题。
 *
 * @example
 * ```ts
 * const request: RequestThink = { kind: "request_think", goal: "比较两种恢复方案" };
 * ```
 */
export interface RequestThink {
    /** 控制结果判别值。 */
    readonly kind: "request_think";
    /** Think 阶段要解决的明确目标。 */
    readonly goal: string;
}

/**
 * 完成标准的事实证据引用。
 *
 * @example
 * ```ts
 * const evidence: CompletionEvidence = { criterionIndex: 0, evidenceSequences: [12, 15] };
 * ```
 */
export interface CompletionEvidence {
    /**
     * Task 完成条件索引。
     */
    readonly criterionIndex: NonNegativeInteger;
    /** 支撑该条件的已提交 Trajectory sequence。 */
    readonly evidenceSequences: readonly NonNegativeInteger[];
}

/**
 * Tool 调用 Action。
 *
 * @remarks
 * `input` 是动态业务工具绑定负责校验的 JSON 载荷；Runtime 另行分配 `actionId` 与授权校验。
 *
 * @example
 * ```ts
 * const action: ToolCallAction = { actionId: "act-1", toolId: "bash", input: { command: "ls" } };
 * ```
 */
export interface ToolCallAction {
    /** Action 的稳定标识。 */
    readonly actionId: string;
    /** 被调用的工具 ID。 */
    readonly toolId: string;
    /** 工具输入 JSON 载荷。 */
    readonly input: JsonValue;
}

/**
 * Fact 的持续性稳定性。
 *
 * @example
 * ```ts
 * const stability: FactStability = "stable";
 * ```
 */
export type FactStability = "stable" | "last_observed";

/**
 * Working Memory 条目作用域。
 *
 * @example
 * ```ts
 * const scope: MemoryEntryScope = "goal";
 * ```
 */
export type MemoryEntryScope = "goal" | "phase";

/**
 * Fact 标量值。
 *
 * @remarks
 * 只允许字符串、有限数字、布尔值与 null。
 *
 * @example
 * ```ts
 * const scalar: FactScalar = "active";
 * ```
 */
export type FactScalar = string | number | boolean | null;

/**
 * 受限 Fact 值。
 *
 * @remarks
 * 允许标量或由标量组成的一维数组；对象与嵌套数组在此层拒绝。
 *
 * @example
 * ```ts
 * const value: FactValue = ["src/index.ts", "package.json"];
 * ```
 */
export type FactValue = FactScalar | readonly FactScalar[];

/**
 * 模型提议新增或更新 Fact。
 *
 * @example
 * ```ts
 * const proposal: FactProposal = {
 *     subject: "file:main.ts",
 *     predicate: "exists",
 *     value: true,
 *     stability: "stable",
 *     evidenceSequences: [10],
 * };
 * ```
 */
export interface FactProposal {
    /** Fact 主体。 */
    readonly subject: string;
    /** Fact 谓词。 */
    readonly predicate: string;
    /** Fact 值。 */
    readonly value: FactValue;
    /** 持续性稳定性。 */
    readonly stability: FactStability;
    /**
     * 支撑证据序列；至少包含一项。
     *
     * @minItems 1
     */
    readonly evidenceSequences: readonly NonNegativeInteger[];
    /** 可选作用域。 */
    readonly scope?: MemoryEntryScope;
}

/**
 * 模型提议注销 Fact。
 *
 * @example
 * ```ts
 * const proposal: RetireFactProposal = { id: "fact-1", evidenceSequences: [11] };
 * ```
 */
export interface RetireFactProposal {
    /** 目标 Fact ID。 */
    readonly id: string;
    /**
     * 支撑证据序列；至少包含一项。
     *
     * @minItems 1
     */
    readonly evidenceSequences: readonly NonNegativeInteger[];
}

/**
 * Working Memory 条目状态。
 *
 * @example
 * ```ts
 * const status: MemoryEntryStatus = "active";
 * ```
 */
export type MemoryEntryStatus = "active" | "resolved" | "superseded";

/**
 * 创建 Hypothesis 提议。
 *
 * @example
 * ```ts
 * const proposal: HypothesisCreate = { statement: "配置可能缺少环境变量" };
 * ```
 */
export interface HypothesisCreate {
    /** Hypothesis 陈述。 */
    readonly statement: string;
    /** 可选作用域。 */
    readonly scope?: MemoryEntryScope;
}

/**
 * 更新 Hypothesis 提议。
 *
 * @remarks
 * 至少需要修改陈述或状态之一。
 *
 * @example
 * ```ts
 * const proposal: HypothesisUpdate = { id: "hypo-1", status: "resolved" };
 * ```
 */
export interface HypothesisUpdate {
    /** 目标 Hypothesis ID。 */
    readonly id: string;
    /** 新陈述。 */
    readonly statement?: string;
    /** 新状态。 */
    readonly status?: MemoryEntryStatus;
}

/**
 * 创建 Blocker 提议。
 *
 * @example
 * ```ts
 * const proposal: BlockerCreate = { description: "等待用户输入" };
 * ```
 */
export interface BlockerCreate {
    /** Blocker 描述。 */
    readonly description: string;
    /** 可选作用域。 */
    readonly scope?: MemoryEntryScope;
}

/**
 * 更新 Blocker 提议。
 *
 * @remarks
 * 至少需要修改描述或状态之一。
 *
 * @example
 * ```ts
 * const proposal: BlockerUpdate = { id: "blocker-1", status: "resolved" };
 * ```
 */
export interface BlockerUpdate {
    /** 目标 Blocker ID。 */
    readonly id: string;
    /** 新描述。 */
    readonly description?: string;
    /** 新状态。 */
    readonly status?: MemoryEntryStatus;
}

/**
 * Working Memory Patch 的单项操作。
 *
 * @remarks
 * 由 `type` 判别六种互斥操作。
 *
 * @example
 * ```ts
 * const operation: MemoryPatchOperation = {
 *     type: "create_blocker",
 *     blocker: { description: "blocked" },
 * };
 * ```
 */
export type MemoryPatchOperation =
    | { readonly type: "upsert_fact"; readonly fact: FactProposal }
    | { readonly type: "retire_fact"; readonly fact: RetireFactProposal }
    | { readonly type: "create_hypothesis"; readonly hypothesis: HypothesisCreate }
    | { readonly type: "update_hypothesis"; readonly hypothesis: HypothesisUpdate }
    | { readonly type: "create_blocker"; readonly blocker: BlockerCreate }
    | { readonly type: "update_blocker"; readonly blocker: BlockerUpdate };

/**
 * Working Memory 增量 Patch。
 *
 * @remarks
 * 模型响应携带的 Working Memory 提议载荷，协议版本固定为 1。
 *
 * @example
 * ```ts
 * const patch: WorkingMemoryPatch = { protocolVersion: 1, operations: [] };
 * ```
 */
export interface WorkingMemoryPatch {
    /** 固定协议版本。 */
    readonly protocolVersion: 1;
    /** 操作列表。 */
    readonly operations: readonly MemoryPatchOperation[];
}

/**
 * 重要信息提议来源。
 *
 * @remarks
 * 标识真实出处；`user_message` 必须携带 messageId、原文片段与提取简述。
 *
 * @example
 * ```ts
 * const source: ContextNoteSource = {
 *     kind: "user_message",
 *     messageId: "msg-1",
 *     verbatimSnippet: "必须保证向后兼容",
 *     summary: "兼容性要求",
 * };
 * ```
 */
export type ContextNoteSource =
    | {
        readonly kind: "user_message";
        readonly messageId: string;
        readonly verbatimSnippet: string;
        readonly summary?: string;
    }
    | {
        readonly kind: "user_decision";
        readonly messageId?: string;
        readonly summary?: string;
    }
    | {
        readonly kind: "agent_decision";
        readonly actionId?: string;
        readonly summary?: string;
    };

/**
 * 重要信息记录类别。
 *
 * @example
 * ```ts
 * const category: ContextNoteCategory = "decision";
 * ```
 */
export type ContextNoteCategory = "decision" | "user_emphasis";

/**
 * 重要信息提议。
 *
 * @remarks
 * 可创建新记录、修订既有记录（noteId 与 baseRevision）或显式替代旧记录（supersedesNoteId）。
 *
 * @example
 * ```ts
 * const proposal: ContextNoteProposal = {
 *     category: "decision",
 *     content: "选择方案 A",
 *     source: { kind: "user_decision", messageId: "msg-1" },
 * };
 * ```
 */
export interface ContextNoteProposal {
    /** 记录类别。 */
    readonly category: ContextNoteCategory;
    /** 记录内容。 */
    readonly content: string;
    /** 记录理由。 */
    readonly reason?: string;
    /** 关联阶段 ID。 */
    readonly stageId?: string;
    /** 被修订记录 ID。 */
    readonly noteId?: string;
    /**
     * 被修订记录的基础修订号。
     */
    readonly baseRevision?: PositiveInteger;
    /** 被替代记录 ID。 */
    readonly supersedesNoteId?: string;
    /** 记录来源。 */
    readonly source: ContextNoteSource;
}

/**
 * 获授权模式更新 GoalPlan 的模型决策。
 *
 * @remarks
 * `baseRevision` 与操作列表由 Runtime 原子校验；模型只能引用已投影的 Todo ID。
 *
 * @example
 * ```ts
 * const decision: GoalPlanUpdateAgentDecision = {
 *     kind: "goal_plan_update",
 *     baseRevision: 0,
 *     operations: [{ type: "add", content: "检查现有实现" }],
 * };
 * ```
 */
export interface GoalPlanUpdateAgentDecision {
    /** 决策判别值。 */
    readonly kind: "goal_plan_update";
    /**
     * 当前 GoalPlan 修订号。
     */
    readonly baseRevision: NonNegativeInteger;
    /** 原子操作列表。 */
    readonly operations: readonly GoalPlanPatchOperation[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * Model Context Checkpoint 检查点结果。
 *
 * @example
 * ```ts
 * const result: ModelContextCheckpointResult = { kind: "context_checkpoint" };
 * ```
 */
export interface ModelContextCheckpointResult {
    /** 结果判别值。 */
    readonly kind: "context_checkpoint";
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * Tool 调用决策的固定外壳 Action 字段。
 *
 * @remarks
 * 动态 `input` 由当前授权工具绑定提供，不属于固定外壳；Provider Schema 组合时再插入。
 *
 * @example
 * ```ts
 * const action: ToolCallActionEnvelope = { actionId: "a1", toolId: "read_file" };
 * ```
 */
export interface ToolCallActionEnvelope {
    /** Action 的稳定标识。 */
    readonly actionId: string;
    /** 被调用的工具 ID。 */
    readonly toolId: string;
}

/**
 * Tool 调用决策的生成绑定外壳。
 *
 * @remarks
 * 该类型只覆盖模型线固定的 envelope 字段；`action.input` 由工具线绑定在组合时插入并
 * 单独校验，避免把开放 JSON 放入生成投影。最终 canonical 结果仍使用
 * `ToolCallAgentDecision`。
 *
 * @example
 * ```ts
 * const envelope: ToolCallDecisionEnvelope = {
 *     kind: "tool_call",
 *     action: { actionId: "a1", toolId: "read_file" },
 * };
 * ```
 */
export interface ToolCallDecisionEnvelope {
    /** 决策判别值。 */
    readonly kind: "tool_call";
    /** 固定 Action 字段；不含动态输入。 */
    readonly action: ToolCallActionEnvelope;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * Tool 调用决策。
 *
 * @example
 * ```ts
 * const decision: ToolCallAgentDecision = {
 *     kind: "tool_call",
 *     action: { actionId: "a1", toolId: "bash", input: { command: "ls" } },
 * };
 * ```
 */
export interface ToolCallAgentDecision {
    /** 决策判别值。 */
    readonly kind: "tool_call";
    /** 工具调用 Action。 */
    readonly action: ToolCallAction;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * 普通 Run 的完成决策。
 *
 * @example
 * ```ts
 * const decision: NormalCompleteAgentDecision = {
 *     kind: "complete",
 *     summary: "已完成",
 *     evidenceSequences: [12],
 * };
 * ```
 */
export interface NormalCompleteAgentDecision {
    /** 决策判别值。 */
    readonly kind: "complete";
    /** 面向用户的完整交付内容。 */
    readonly summary: string;
    /** 当前 Run 证据序列。 */
    readonly evidenceSequences: readonly NonNegativeInteger[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * 等待用户输入的决策。
 *
 * @example
 * ```ts
 * const decision: WaitAgentDecision = { kind: "wait", reason: "需要用户授权" };
 * ```
 */
export interface WaitAgentDecision {
    /** 决策判别值。 */
    readonly kind: "wait";
    /** 等待原因。 */
    readonly reason: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * 任务失败决策。
 *
 * @example
 * ```ts
 * const decision: FailAgentDecision = { kind: "fail", error: "无法找到依赖" };
 * ```
 */
export interface FailAgentDecision {
    /** 决策判别值。 */
    readonly kind: "fail";
    /** 失败原因。 */
    readonly error: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * Plan Run 获批后的逐条件完成决策。
 *
 * @example
 * ```ts
 * const decision: ExecutingCompleteAgentDecision = {
 *     kind: "complete",
 *     summary: "已完成",
 *     completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
 * };
 * ```
 */
export interface ExecutingCompleteAgentDecision {
    /** 决策判别值。 */
    readonly kind: "complete";
    /** 面向用户的完整交付内容。 */
    readonly summary: string;
    /** 逐条件完成证据。 */
    readonly completionEvidence: readonly CompletionEvidence[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * Run 阶段更新决策。
 *
 * @remarks
 * 声明新阶段或修订当前阶段；阶段身份与版本由 Runtime 校验和分配。
 *
 * @example
 * ```ts
 * const decision: RunStageUpdateAgentDecision = {
 *     kind: "run_stage_update",
 *     target: "探索代码库",
 *     acceptanceCriteria: ["阅读关键入口"],
 * };
 * ```
 */
export interface RunStageUpdateAgentDecision {
    /** 决策判别值。 */
    readonly kind: "run_stage_update";
    /** 被修订阶段 ID。 */
    readonly stageId?: string;
    /**
     * 被修订阶段基础修订号。
     */
    readonly baseRevision?: PositiveInteger;
    /** 修订原因。 */
    readonly reason?: string;
    /** 阶段目标。 */
    readonly target: string;
    /** 阶段验收条件。 */
    readonly acceptanceCriteria: readonly string[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * Run 中间阶段完成候选决策。
 *
 * @example
 * ```ts
 * const decision: RunStageCompleteAgentDecision = {
 *     kind: "run_stage_complete",
 *     stageId: "stage-1",
 *     summary: "已完成第一阶段",
 *     evidenceSequences: [10, 11],
 * };
 * ```
 */
export interface RunStageCompleteAgentDecision {
    /** 决策判别值。 */
    readonly kind: "run_stage_complete";
    /** 当前阶段 ID。 */
    readonly stageId: string;
    /** 阶段完成摘要。 */
    readonly summary: string;
    /** 当前 Run 证据序列。 */
    readonly evidenceSequences?: readonly NonNegativeInteger[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
    /** 可选的重要信息提议。 */
    readonly contextNotes?: readonly ContextNoteProposal[];
}

/**
 * AskUser 问题选项输入。
 *
 * @example
 * ```ts
 * const option: AskUserOptionInput = { label: "选项 A", description: "方案 A 说明" };
 * ```
 */
export interface AskUserOptionInput {
    /** 选项显示标签。 */
    readonly label: string;
    /** 选项说明。 */
    readonly description?: string;
}

/**
 * AskUser 单个问题输入。
 *
 * @remarks
 * 包含简短标题、具体问题、2 至 3 个候选选项以及是否允许多选。
 *
 * @example
 * ```ts
 * const question: AskUserQuestionInput = {
 *     header: "确认方案",
 *     question: "请选择实现方式：",
 *     options: [{ label: "方案 A" }, { label: "方案 B" }],
 *     multiSelect: false,
 * };
 * ```
 */
export interface AskUserQuestionInput {
    /** 简短标题。 */
    readonly header: string;
    /** 具体问题描述。 */
    readonly question: string;
    /**
     * 候选选项；2 至 3 项。
     *
     * @minItems 2
     * @maxItems 3
     */
    readonly options: readonly AskUserOptionInput[];
    /** 是否允许多选。 */
    readonly multiSelect: boolean;
}

/**
 * AskUser 用户提问决策。
 *
 * @remarks
 * 提出 1 至 3 个结构化问题；等待、回答与恢复由现有交互流程负责。
 *
 * @example
 * ```ts
 * const decision: AskUserAgentDecision = {
 *     kind: "ask_user",
 *     questions: [{
 *         header: "确认依赖",
 *         question: "使用哪种包管理器？",
 *         options: [{ label: "pnpm" }, { label: "npm" }],
 *         multiSelect: false,
 *     }],
 * };
 * ```
 */
export interface AskUserAgentDecision {
    /** 决策判别值。 */
    readonly kind: "ask_user";
    /**
     * 问题列表；1 至 3 项。
     *
     * @minItems 1
     * @maxItems 3
     */
    readonly questions: readonly AskUserQuestionInput[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 任务提案决策。
 *
 * @remarks
 * 提出目标、完成验收标准与完整有序路线，请求用户审查批准；批准前只允许只读工具。
 *
 * @example
 * ```ts
 * const decision: TaskProposalAgentDecision = {
 *     kind: "task_proposal",
 *     task: { objective: "修复问题", completionCriteria: [{ text: "测试通过" }] },
 *     planRoute: { stages: [{ target: "实现修复", acceptanceCriteria: ["测试通过"] }] },
 *     approvalRequest: "请批准任务计划",
 * };
 * ```
 */
export interface TaskProposalAgentDecision {
    /** 决策判别值。 */
    readonly kind: "task_proposal";
    /** 任务定义。 */
    readonly task: GoalTask;
    /** 完整阶段路线候选。 */
    readonly planRoute: RunPlanRouteCandidate;
    /** 面向用户的审批请求。 */
    readonly approvalRequest: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 获批 Plan Run 完整路线修订决策。
 *
 * @remarks
 * 必须给出理由和完整路线；超出已批准范围时提供 `approvalRequest`。
 *
 * @example
 * ```ts
 * const decision: RunPlanRouteUpdateAgentDecision = {
 *     kind: "run_plan_route_update",
 *     baseRevision: 1,
 *     reason: "验证关口已由现有 CI 覆盖",
 *     route: { stages: [{ target: "实现修复", acceptanceCriteria: ["回归通过"] }] },
 * };
 * ```
 */
export interface RunPlanRouteUpdateAgentDecision {
    /** 决策判别值。 */
    readonly kind: "run_plan_route_update";
    /**
     * 当前路线基础修订号。
     */
    readonly baseRevision: PositiveInteger;
    /** 修订理由。 */
    readonly reason: string;
    /** 完整候选路线。 */
    readonly route: RunPlanRouteCandidate;
    /** 超出已批准范围时的审批请求。 */
    readonly approvalRequest?: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 完整 Agent 决策。
 *
 * @remarks
 * 包含 Context Checkpoint 结果与全部执行决策分支；Runtime Runner 校验 StepExecutor 返回值的顶层类型。
 *
 * @example
 * ```ts
 * const decision: AgentDecision = { kind: "wait", reason: "需要用户授权" };
 * ```
 */
export type AgentDecision =
    | ModelContextCheckpointResult
    | ToolCallAgentDecision
    | NormalCompleteAgentDecision
    | ExecutingCompleteAgentDecision
    | WaitAgentDecision
    | FailAgentDecision
    | ContextLookupRequest
    | ToolDiscoveryDecision
    | AskUserAgentDecision
    | TaskProposalAgentDecision
    | GoalPlanUpdateAgentDecision
    | RunStageUpdateAgentDecision
    | RunStageCompleteAgentDecision
    | RunPlanRouteUpdateAgentDecision;

/**
 * Decide 阶段可返回业务决策或 Think 控制请求。
 *
 * @example
 * ```ts
 * const output: DecideOutput = { kind: "request_think", goal: "比较恢复方案" };
 * ```
 */
export type DecideOutput = AgentDecision | RequestThink;

/**
 * 无 checkpoint 的结构化 Agent 决策。
 *
 * @example
 * ```ts
 * const decision: StructuredAgentDecision = { kind: "fail", error: "无法继续" };
 * ```
 */
export type StructuredAgentDecision =
    | ToolCallAgentDecision
    | NormalCompleteAgentDecision
    | ExecutingCompleteAgentDecision
    | WaitAgentDecision
    | FailAgentDecision
    | ContextLookupRequest
    | ToolDiscoveryDecision
    | AskUserAgentDecision
    | TaskProposalAgentDecision;

/**
 * 普通模式可提交的 Executing 决策。
 *
 * @example
 * ```ts
 * const decision: OrdinaryExecutingDecision = { kind: "wait", reason: "等待确认" };
 * ```
 */
export type OrdinaryExecutingDecision =
    | ToolCallAgentDecision
    | NormalCompleteAgentDecision
    | WaitAgentDecision
    | FailAgentDecision
    | ContextLookupRequest
    | ToolDiscoveryDecision
    | AskUserAgentDecision;

/**
 * 未授权任何 Tool 时的 Executing 决策。
 *
 * @remarks
 * 省略 tool_call 分支；具体 Run 可用分支仍由请求级契约包限定。
 *
 * @example
 * ```ts
 * const decision: NonToolExecutingDecision = { kind: "tool_discovery", query: "inspect files" };
 * ```
 */
export type NonToolExecutingDecision =
    | NormalCompleteAgentDecision
    | ExecutingCompleteAgentDecision
    | WaitAgentDecision
    | FailAgentDecision
    | ContextLookupRequest
    | ToolDiscoveryDecision
    | AskUserAgentDecision
    | TaskProposalAgentDecision
    | RunStageUpdateAgentDecision
    | RunStageCompleteAgentDecision;

/**
 * Plan Mode Executing 决策。
 *
 * @remarks
 * 仅包含 Plan Run 执行分支，并允许 `goal_plan_update` 与完整路线修订。
 *
 * @example
 * ```ts
 * const decision: PlanModeExecutingDecision = {
 *     kind: "goal_plan_update",
 *     baseRevision: 0,
 *     operations: [{ type: "add", content: "实现接口" }],
 * };
 * ```
 */
export type PlanModeExecutingDecision =
    | ToolCallAgentDecision
    | ExecutingCompleteAgentDecision
    | WaitAgentDecision
    | FailAgentDecision
    | ContextLookupRequest
    | ToolDiscoveryDecision
    | AskUserAgentDecision
    | TaskProposalAgentDecision
    | GoalPlanUpdateAgentDecision
    | RunStageUpdateAgentDecision
    | RunStageCompleteAgentDecision
    | RunPlanRouteUpdateAgentDecision;

/**
 * 完成审查接受结果。
 *
 * @remarks
 * 接受不代表完成候选已提交；Runtime 仍负责证据与状态校验。
 *
 * @example
 * ```ts
 * const result: CompletionReviewAccept = { kind: "accept" };
 * ```
 */
export interface CompletionReviewAccept {
    /** 结果判别值。 */
    readonly kind: "accept";
}

/**
 * 完成审查拒绝结果。
 *
 * @remarks
 * 反馈必须指出具体缺口，不能作为完成证据，也不能改写候选。
 *
 * @example
 * ```ts
 * const result: CompletionReviewReject = { kind: "reject", feedback: "先阅读实现再判断行为。" };
 * ```
 */
export interface CompletionReviewReject {
    /** 结果判别值。 */
    readonly kind: "reject";
    /** 具体缺口与需要修正的内容。 */
    readonly feedback: string;
}

/**
 * 完成审查结果。
 *
 * @remarks
 * 接受不代表提交成功；拒绝反馈必须指出具体缺口，不能作为完成证据。
 *
 * @example
 * ```ts
 * const result: CompletionReviewResult = { kind: "reject", feedback: "先阅读实现再判断行为。" };
 * ```
 */
export type CompletionReviewResult = CompletionReviewAccept | CompletionReviewReject;

/**
 * 完成审查系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemCompletionReviewInput = { result: { kind: "accept" } };
 * ```
 */
export interface SystemCompletionReviewInput {
    /** 完成审查结果。 */
    readonly result: CompletionReviewResult;
}

/**
 * 任务完成系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemCompleteTaskInput = {
 *     summary: "已完成",
 *     completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1] }],
 * };
 * ```
 */
export interface SystemCompleteTaskInput {
    /** 面向用户的完整交付内容。 */
    readonly summary: string;
    /** 逐条件完成证据。 */
    readonly completionEvidence: readonly CompletionEvidence[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 普通 Run 完成系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemCompleteRunInput = {
 *     summary: "已完成",
 *     evidenceSequences: [4],
 * };
 * ```
 */
export interface SystemCompleteRunInput {
    /** 面向用户的完整交付内容。 */
    readonly summary: string;
    /** 当前 Run 证据序列。 */
    readonly evidenceSequences: readonly NonNegativeInteger[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 等待用户输入系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemWaitForInputInput = { reason: "需要用户授权" };
 * ```
 */
export interface SystemWaitForInputInput {
    /** 等待原因。 */
    readonly reason: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 任务失败系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemFailGoalInput = { error: "无法找到依赖" };
 * ```
 */
export interface SystemFailGoalInput {
    /** 失败原因。 */
    readonly error: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * history_search 上下文查询输入。
 *
 * @example
 * ```ts
 * const input: ContextLookupHistorySearchInput = {
 *     operation: "history_search",
 *     need: "historical_execution",
 *     question: "查找错误日志",
 * };
 * ```
 */
export interface ContextLookupHistorySearchInput {
    /** 操作判别值。 */
    readonly operation: "history_search";
    /** 历史需求类别。 */
    readonly need: ContextLookupNeed;
    /** 查询问题。 */
    readonly question: string;
    /** 可选过滤器。 */
    readonly filters?: ContextLookupFilters;
}

/**
 * directory_browse 上下文查询输入。
 *
 * @example
 * ```ts
 * const input: ContextLookupDirectoryBrowseInput = { operation: "directory_browse", limit: 10 };
 * ```
 */
export interface ContextLookupDirectoryBrowseInput {
    /** 操作判别值。 */
    readonly operation: "directory_browse";
    /** 目录游标。 */
    readonly cursor?: string;
    /**
     * 返回数量上限。
     */
    readonly limit?: ContextLookupPageSize;
    /** 目录类别。 */
    readonly category?: string;
}

/**
 * directory_search 上下文查询输入。
 *
 * @example
 * ```ts
 * const input: ContextLookupDirectorySearchInput = { operation: "directory_search", query: "recovery" };
 * ```
 */
export interface ContextLookupDirectorySearchInput {
    /** 操作判别值。 */
    readonly operation: "directory_search";
    /** 搜索查询。 */
    readonly query: string;
    /** 目录游标。 */
    readonly cursor?: string;
    /**
     * 返回数量上限。
     */
    readonly limit?: ContextLookupPageSize;
    /** 目录类别。 */
    readonly category?: string;
}

/**
 * source_expand 上下文查询输入。
 *
 * @example
 * ```ts
 * const input: ContextLookupSourceExpandInput = { operation: "source_expand", sourceRef: "trajectory:12" };
 * ```
 */
export interface ContextLookupSourceExpandInput {
    /** 操作判别值。 */
    readonly operation: "source_expand";
    /** 来源引用。 */
    readonly sourceRef: string;
    /**
     * 展开偏移。
     */
    readonly offset?: NonNegativeInteger;
    /**
     * 返回数量上限。
     */
    readonly limit?: PositiveInteger;
}

/**
 * Context Lookup 互斥操作输入。
 *
 * @example
 * ```ts
 * const input: ContextLookupOperationInput = { operation: "directory_browse" };
 * ```
 */
export type ContextLookupOperationInput =
    | ContextLookupHistorySearchInput
    | ContextLookupDirectoryBrowseInput
    | ContextLookupDirectorySearchInput
    | ContextLookupSourceExpandInput;

/**
 * Context Lookup 系统工具输入。
 *
 * @remarks
 * `request` 内只能出现一个操作及其对应字段。
 *
 * @example
 * ```ts
 * const input: SystemContextLookupInput = {
 *     request: { operation: "directory_search", query: "恢复" },
 * };
 * ```
 */
export interface SystemContextLookupInput {
    /** 单一操作请求。 */
    readonly request: ContextLookupOperationInput;
}

/**
 * 任务提案系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemProposeTaskPlanInput = {
 *     task: { objective: "修复问题", completionCriteria: [{ text: "测试通过" }] },
 *     planRoute: { stages: [{ target: "实现修复", acceptanceCriteria: ["测试通过"] }] },
 *     approvalRequest: "请批准任务计划",
 * };
 * ```
 */
export interface SystemProposeTaskPlanInput {
    /** 任务定义。 */
    readonly task: GoalTask;
    /** 完整阶段路线候选。 */
    readonly planRoute: RunPlanRouteCandidate;
    /** 面向用户的审批请求。 */
    readonly approvalRequest: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 上下文检查点系统工具输入。
 *
 * @remarks
 * `checkpointSummary` 只作为模型说明；检查点元数据由 Runtime 拥有。
 *
 * @example
 * ```ts
 * const input: SystemContextCheckpointInput = { checkpointSummary: "上下文过长归档" };
 * ```
 */
export interface SystemContextCheckpointInput {
    /** 可选的检查点摘要。 */
    readonly checkpointSummary?: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 请求 Think 阶段系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemRequestThinkInput = { goal: "比较两种恢复方案" };
 * ```
 */
export interface SystemRequestThinkInput {
    /** Think 阶段要解决的明确目标。 */
    readonly goal: string;
}

/**
 * AskUser 系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemAskUserInput = {
 *     questions: [{
 *         header: "确认依赖",
 *         question: "使用哪种包管理器？",
 *         options: [{ label: "pnpm" }, { label: "npm" }],
 *         multiSelect: false,
 *     }],
 * };
 * ```
 */
export interface SystemAskUserInput {
    /**
     * 问题列表；1 至 3 项。
     *
     * @minItems 1
     * @maxItems 3
     */
    readonly questions: readonly AskUserQuestionInput[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * GoalPlan 更新系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemUpdateGoalPlanInput = {
 *     baseRevision: 0,
 *     operations: [{ type: "add", content: "检查实现" }],
 * };
 * ```
 */
export interface SystemUpdateGoalPlanInput {
    /**
     * 当前 GoalPlan 修订号。
     */
    readonly baseRevision: NonNegativeInteger;
    /** 原子操作列表。 */
    readonly operations: readonly GoalPlanPatchOperation[];
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 开始新阶段系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemStartRunStageInput = {
 *     target: "探索代码库",
 *     acceptanceCriteria: ["阅读关键入口"],
 * };
 * ```
 */
export interface SystemStartRunStageInput {
    /** 阶段目标。 */
    readonly target: string;
    /**
     * 阶段验收条件；至少包含一项。
     *
     * @minItems 1
     */
    readonly acceptanceCriteria: readonly string[];
}

/**
 * 修订当前阶段系统工具输入。
 *
 * @remarks
 * 阶段身份与版本由请求绑定，不由模型提供。
 *
 * @example
 * ```ts
 * const input: SystemReviseRunStageInput = {
 *     target: "探索代码库",
 *     acceptanceCriteria: ["阅读关键入口"],
 *     reason: "补充关键入口",
 * };
 * ```
 */
export interface SystemReviseRunStageInput {
    /** 阶段目标。 */
    readonly target: string;
    /**
     * 阶段验收条件；至少包含一项。
     *
     * @minItems 1
     */
    readonly acceptanceCriteria: readonly string[];
    /** 修订原因。 */
    readonly reason: string;
}

/**
 * 当前阶段完成候选系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemCompleteRunStageInput = {
 *     summary: "已完成第一阶段",
 *     evidenceSequences: [10, 11],
 * };
 * ```
 */
export interface SystemCompleteRunStageInput {
    /** 阶段完成摘要。 */
    readonly summary: string;
    /** 当前 Run 证据序列。 */
    readonly evidenceSequences: readonly NonNegativeInteger[];
}

/**
 * 完整路线修订系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemUpdatePlanRouteInput = {
 *     baseRevision: 1,
 *     reason: "验证关口已由现有 CI 覆盖",
 *     route: { stages: [{ target: "实现修复", acceptanceCriteria: ["回归通过"] }] },
 * };
 * ```
 */
export interface SystemUpdatePlanRouteInput {
    /**
     * 当前路线基础修订号。
     */
    readonly baseRevision: PositiveInteger;
    /** 修订理由。 */
    readonly reason: string;
    /** 完整候选路线。 */
    readonly route: RunPlanRouteCandidate;
    /** 超出已批准范围时的审批请求。 */
    readonly approvalRequest?: string;
    /** 可选的 Working Memory Patch。 */
    readonly memoryPatch?: WorkingMemoryPatch;
}

/**
 * 工具目录查询系统工具输入。
 *
 * @example
 * ```ts
 * const input: SystemFindToolsInput = { query: "read repository files" };
 * ```
 */
export interface SystemFindToolsInput {
    /** 工具搜索查询。 */
    readonly query: string;
}

/**
 * 获批 Plan 路线自动开始下一阶段的空输入。
 *
 * @remarks
 * Runtime 从获批路线提供目标、验收条件、身份与版本；模型不得补充字段。
 *
 * @example
 * ```ts
 * const input: SystemStartNextRunStageInput = {};
 * ```
 */
export interface SystemStartNextRunStageInput {}
