import { randomUUID } from "node:crypto";
import { contract } from "../contract";
import type { Contract, InferContract, JsonValue } from "../types";

/**
 * 递归 JSON 值契约。
 *
 * @remarks
 * 用于 Tool Action 的 canonical `input` 等允许任意合法 JSON 数据的场景。
 * 运行时校验保证有限深度与非循环引用。
 *
 * @example
 * ```ts
 * const parsed = safeParse(JsonValueContract, { key: [1, "two", null] });
 * ```
 */
export const JsonValueContract: Contract<JsonValue> = contract.recursive("JsonValue", (self) =>
    contract.union([
        contract.string(),
        contract.number(),
        contract.boolean(),
        contract.null(),
        contract.array(self),
        contract.record(self),
    ]),
);

/**
 * 验收结果的可取值契约。
 *
 * @example
 * ```ts
 * const outcome: CompletionExpectOutcome = "success";
 * ```
 */
export const CompletionExpectOutcomeContract = contract.enum([
    "success",
    "failure",
] as const);

/** 验收声明的预期结果。 */
export type CompletionExpectOutcome = InferContract<typeof CompletionExpectOutcomeContract>;

/**
 * 完成条件的验收声明契约。
 *
 * @remarks
 * 声明该条件引用的证据中至少一条必须是指预期工具与预期结果的可信
 * Observation；声明由任务创建方提供，模型自述不能覆盖验收结果。
 *
 * @example
 * ```ts
 * const acceptance: CompletionAcceptance = {
 *     expectToolId: "bash",
 *     expectOutcome: "success",
 * };
 * ```
 */
export const CompletionAcceptanceContract = contract.object({
    expectToolId: contract.string(),
    expectOutcome: CompletionExpectOutcomeContract,
});

/** 完成条件的验收声明公开类型。 */
export type CompletionAcceptance = InferContract<typeof CompletionAcceptanceContract>;

/**
 * 单条完成条件契约。
 *
 * @remarks
 * `text` 是面向模型与用户的条件描述；`acceptance` 是可选的验收声明，
 * Runner 在 complete 校验时验证引用证据满足声明。
 *
 * @example
 * ```ts
 * const criterion: CompletionCriterion = {
 *     text: "测试全部通过",
 *     acceptance: { expectToolId: "bash", expectOutcome: "success" },
 * };
 * ```
 */
export const CompletionCriterionContract = contract.object({
    text: contract.string(),
    acceptance: contract.optional(CompletionAcceptanceContract),
});

/** 单条完成条件公开类型。 */
export type CompletionCriterion = InferContract<typeof CompletionCriterionContract>;

/**
 * Goal 任务定义契约。
 *
 * @remarks
 * 规定模型在规划阶段提出的目标与完成条件列表；每条条件是结构化的
 * `CompletionCriterion`，可携带可选验收声明。
 *
 * @example
 * ```ts
 * const task: GoalTask = {
 *     objective: "实现功能 X",
 *     completionCriteria: [
 *         { text: "标准 1" },
 *         { text: "标准 2", acceptance: { expectToolId: "bash", expectOutcome: "success" } },
 *     ],
 * };
 * ```
 */
export const GoalTaskContract = contract.object({
    objective: contract.string(),
    completionCriteria: contract.array(CompletionCriterionContract),
});

/** Goal 任务公开类型。 */
export type GoalTask = InferContract<typeof GoalTaskContract>;

/** GoalPlan Todo 的生命周期状态契约。 */
export const GoalPlanStatusContract = contract.enum([
    "pending",
    "in_progress",
    "completed",
    "cancelled",
] as const);

/** GoalPlan Todo 的生命周期状态。 */
export type GoalPlanStatus = InferContract<typeof GoalPlanStatusContract>;

/** 新增 GoalPlan Todo 操作契约；Todo ID 与位置由 Runtime 最终分配和规范化。 */
export const GoalPlanAddOperationContract = contract.object({
    type: contract.literal("add"),
    content: contract.string(),
    position: contract.optional(contract.integer({ minimum: 0 })),
});

/** 更新 GoalPlan Todo 内容或状态的契约；完成状态必须引用当前 Run 证据。 */
export const GoalPlanUpdateOperationContract = contract.object({
    type: contract.literal("update"),
    id: contract.string(),
    content: contract.optional(contract.string()),
    status: contract.optional(GoalPlanStatusContract),
    evidenceSequences: contract.optional(contract.array(contract.integer({ minimum: 0 }))),
});

/** 重排 GoalPlan Todo 操作契约。 */
export const GoalPlanReorderOperationContract = contract.object({
    type: contract.literal("reorder"),
    id: contract.string(),
    position: contract.integer({ minimum: 0 }),
});

/** 取消 GoalPlan Todo 操作契约。 */
export const GoalPlanCancelOperationContract = contract.object({
    type: contract.literal("cancel"),
    id: contract.string(),
});

/** GoalPlan Patch 的单项操作契约。 */
export const GoalPlanPatchOperationContract = contract.discriminatedUnion("type", [
    GoalPlanAddOperationContract,
    GoalPlanUpdateOperationContract,
    GoalPlanReorderOperationContract,
    GoalPlanCancelOperationContract,
]);

/** GoalPlan Patch 单项操作公开类型。 */
export type GoalPlanPatchOperation = InferContract<typeof GoalPlanPatchOperationContract>;

/**
 * Context Lookup 支持的历史需求类别契约。
 *
 * @example
 * ```ts
 * const need: ContextLookupNeed = "historical_execution";
 * ```
 */
export const ContextLookupNeedContract = contract.enum([
    "conversation_history",
    "historical_execution",
    "decision_rationale",
] as const);

/** Context Lookup 历史需求类别。 */
export type ContextLookupNeed = InferContract<typeof ContextLookupNeedContract>;

/**
 * Context Lookup 的 sequence 闭区间过滤契约。
 *
 * @example
 * ```ts
 * const range = { from: 1, to: 10 };
 * ```
 */
export const ContextLookupSequenceRangeContract = contract.object({
    from: contract.integer(),
    to: contract.integer(),
});

/** Context Lookup sequence 闭区间过滤类型。 */
export type ContextLookupSequenceRange = InferContract<typeof ContextLookupSequenceRangeContract>;

/**
 * Context Lookup 结构化过滤器契约。
 *
 * @remarks
 * 各数组过滤器最多包含 16 项，防止不受限的候选集扫描。
 *
 * @example
 * ```ts
 * const filters: ContextLookupFilters = { toolIds: ["read_file"] };
 * ```
 */
export const ContextLookupFiltersContract = contract.object({
    eventTypes: contract.optional(contract.array(contract.string(), { maxItems: 16 })),
    toolIds: contract.optional(contract.array(contract.string(), { maxItems: 16 })),
    actionIds: contract.optional(contract.array(contract.string(), { maxItems: 16 })),
    stepIndexes: contract.optional(contract.array(contract.integer({ minimum: 0 }), { maxItems: 16 })),
    paths: contract.optional(contract.array(contract.string(), { maxItems: 16 })),
    errorCodes: contract.optional(contract.array(contract.string(), { maxItems: 16 })),
    objectIds: contract.optional(contract.array(contract.string(), { maxItems: 16 })),
    sequenceRange: contract.optional(ContextLookupSequenceRangeContract),
});

/** Context Lookup 过滤器公开类型。 */
export type ContextLookupFilters = InferContract<typeof ContextLookupFiltersContract>;

/**
 * Context Lookup 请求契约。
 *
 * @remarks
 * Agent 统一执行请求从已提交 Trajectory 查询上下文的独占结果分支。
 *
 * @example
 * ```ts
 * const request: ContextLookupRequest = {
 *     kind: "context_lookup",
 *     need: "historical_execution",
 *     question: "之前读取了哪个文件？",
 * };
 * ```
 */
export const ContextLookupRequestContract = contract.object({
    kind: contract.literal("context_lookup"),
    need: ContextLookupNeedContract,
    question: contract.string(),
    filters: contract.optional(ContextLookupFiltersContract),
});

/** Context Lookup 请求公开类型。 */
export type ContextLookupRequest = InferContract<typeof ContextLookupRequestContract>;

/**
 * Decide 阶段请求 Runtime 进入 Think 阶段的控制结果契约。
 *
 * @remarks
 * `goal` 必须说明本次 Think 要解决的具体问题。该结果由 Runtime 阶段循环消费，
 * 不属于 AgentDecision，也不授予任何业务 Tool 权限。
 *
 * @example
 * ```ts
 * const request: RequestThink = {
 *     kind: "request_think",
 *     goal: "比较两种恢复方案的状态一致性风险",
 * };
 * ```
 */
export const RequestThinkContract = contract.object({
    kind: contract.literal("request_think"),
    goal: contract.string(),
});

/** Decide 阶段的 Think 控制请求。 */
export type RequestThink = InferContract<typeof RequestThinkContract>;

/** Decide 阶段可返回业务决策或 Think 控制请求。 */
export type DecideOutput = AgentDecision | RequestThink;

/**
 * 完成标准的事实证据引用契约。
 *
 * @remarks
 * 包含 Task 的标准索引及支撑该标准的已提交 Trajectory sequence 数组。
 *
 * @example
 * ```ts
 * const evidence: CompletionEvidence = {
 *     criterionIndex: 0,
 *     evidenceSequences: [12, 15],
 * };
 * ```
 */
export const CompletionEvidenceContract = contract.object({
    criterionIndex: contract.integer({ minimum: 0 }),
    evidenceSequences: contract.array(contract.integer({ minimum: 0 })),
});

/** 完成证明公开类型。 */
export type CompletionEvidence = InferContract<typeof CompletionEvidenceContract>;

/**
 * Tool 调用 Action 契约。
 *
 * @remarks
 * 模型在 executing 阶段请求执行特定工具的 Action 结构。
 *
 * @example
 * ```ts
 * const action: ToolCallAction = {
 *     actionId: "act-1",
 *     toolId: "bash",
 *     input: { command: "ls" },
 * };
 * ```
 */
export const ToolCallActionContract = contract.object({
    actionId: contract.string(),
    toolId: contract.string(),
    input: JsonValueContract,
});

/** Tool 调用 Action 公开类型。 */
export type ToolCallAction = InferContract<typeof ToolCallActionContract>;

/**
 * Fact 持续性稳定性契约。
 *
 * @example
 * ```ts
 * const stability: FactStability = "stable";
 * ```
 */
export const FactStabilityContract = contract.enum([
    "stable",
    "last_observed",
] as const);

/** Fact 稳定性类型。 */
export type FactStability = InferContract<typeof FactStabilityContract>;

/**
 * Working Memory 条目作用域契约。
 *
 * @example
 * ```ts
 * const scope: MemoryEntryScope = "goal";
 * ```
 */
export const MemoryEntryScopeContract = contract.enum([
    "goal",
    "phase",
] as const);

/** Working Memory 条目作用域类型。 */
export type MemoryEntryScope = InferContract<typeof MemoryEntryScopeContract>;

/**
 * Fact 标量值契约。
 *
 * @remarks
 * 仅允许字符串、有限数字、布尔值与 null。
 *
 * @example
 * ```ts
 * const scalar: FactScalar = "active";
 * ```
 */
export const FactScalarContract = contract.union([
    contract.string(),
    contract.number(),
    contract.boolean(),
    contract.null(),
]);

/** Fact 标量值公开类型。 */
export type FactScalar = InferContract<typeof FactScalarContract>;

/**
 * 受限 Fact 值契约。
 *
 * @remarks
 * 满足 Requirement 2.5：模型提交 Fact 值时，必须是字符串、数字、布尔值、null
 * 或由这些标量组成的一维数组；对象与嵌套数组在此层被拒绝。
 *
 * @example
 * ```ts
 * const val: FactValue = ["src/index.ts", "package.json"];
 * ```
 */
export const FactValueContract = contract.union([
    contract.string(),
    contract.number(),
    contract.boolean(),
    contract.null(),
    contract.array(FactScalarContract),
]);

/** 受限 Fact 值公开类型。 */
export type FactValue = InferContract<typeof FactValueContract>;

/**
 * 模型提议新增或更新 Fact 的契约。
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
export const FactProposalContract = contract.object({
    subject: contract.string(),
    predicate: contract.string(),
    value: FactValueContract,
    stability: FactStabilityContract,
    evidenceSequences: contract.array(contract.integer({ minimum: 0 })),
    scope: contract.optional(MemoryEntryScopeContract),
});

/** Fact 提议公开类型。 */
export type FactProposal = InferContract<typeof FactProposalContract>;

/**
 * 模型提议注销 Fact 的契约。
 *
 * @example
 * ```ts
 * const retire: RetireFactProposal = { id: "fact-1", evidenceSequences: [11] };
 * ```
 */
export const RetireFactProposalContract = contract.object({
    id: contract.string(),
    evidenceSequences: contract.array(contract.integer({ minimum: 0 })),
});

/** Fact 注销提议公开类型。 */
export type RetireFactProposal = InferContract<typeof RetireFactProposalContract>;

/**
 * Working Memory 条目状态契约。
 *
 * @example
 * ```ts
 * const status: MemoryEntryStatus = "active";
 * ```
 */
export const MemoryEntryStatusContract = contract.enum([
    "active",
    "resolved",
    "superseded",
] as const);

/** Working Memory 条目状态类型。 */
export type MemoryEntryStatus = InferContract<typeof MemoryEntryStatusContract>;

/**
 * 创建 Hypothesis 提议契约。
 *
 * @example
 * ```ts
 * const create: HypothesisCreate = { statement: "配置可能缺少环境变量" };
 * ```
 */
export const HypothesisCreateContract = contract.object({
    statement: contract.string(),
    scope: contract.optional(MemoryEntryScopeContract),
});

/** 创建 Hypothesis 公开类型。 */
export type HypothesisCreate = InferContract<typeof HypothesisCreateContract>;

/**
 * 更新 Hypothesis 提议契约。
 *
 * @example
 * ```ts
 * const update: HypothesisUpdate = { id: "hypo-1", status: "resolved" };
 * ```
 */
export const HypothesisUpdateContract = contract.object({
    id: contract.string(),
    statement: contract.optional(contract.string()),
    status: contract.optional(MemoryEntryStatusContract),
});

/** 更新 Hypothesis 公开类型。 */
export type HypothesisUpdate = InferContract<typeof HypothesisUpdateContract>;

/**
 * 创建 Blocker 提议契约。
 *
 * @example
 * ```ts
 * const create: BlockerCreate = { description: "等待用户输入" };
 * ```
 */
export const BlockerCreateContract = contract.object({
    description: contract.string(),
    scope: contract.optional(MemoryEntryScopeContract),
});

/** 创建 Blocker 公开类型。 */
export type BlockerCreate = InferContract<typeof BlockerCreateContract>;

/**
 * 更新 Blocker 提议契约。
 *
 * @example
 * ```ts
 * const update: BlockerUpdate = { id: "blocker-1", status: "resolved" };
 * ```
 */
export const BlockerUpdateContract = contract.object({
    id: contract.string(),
    description: contract.optional(contract.string()),
    status: contract.optional(MemoryEntryStatusContract),
});

/** 更新 Blocker 公开类型。 */
export type BlockerUpdate = InferContract<typeof BlockerUpdateContract>;

/**
 * Memory Patch 单项操作契约。
 *
 * @remarks
 * 使用 discriminatedUnion 区分 8 种具体操作。
 *
 * @example
 * ```ts
 * const op: MemoryPatchOperation = { type: "create_blocker", blocker: { description: "blocked" } };
 * ```
 */
export const MemoryPatchOperationContract = contract.discriminatedUnion("type", [
    contract.object({ type: contract.literal("upsert_fact"), fact: FactProposalContract }),
    contract.object({ type: contract.literal("retire_fact"), fact: RetireFactProposalContract }),
    contract.object({ type: contract.literal("create_hypothesis"), hypothesis: HypothesisCreateContract }),
    contract.object({ type: contract.literal("update_hypothesis"), hypothesis: HypothesisUpdateContract }),
    contract.object({ type: contract.literal("create_blocker"), blocker: BlockerCreateContract }),
    contract.object({ type: contract.literal("update_blocker"), blocker: BlockerUpdateContract }),
]);

/** Memory Patch 单项操作公开类型。 */
export type MemoryPatchOperation = InferContract<typeof MemoryPatchOperationContract>;

/**
 * Working Memory 增量 Patch 契约。
 *
 * @remarks
 * 模型响应携带的 Working Memory 提议载荷，固定版本为 1。
 *
 * @example
 * ```ts
 * const patch: WorkingMemoryPatch = { protocolVersion: 1, operations: [] };
 * ```
 */
export const WorkingMemoryPatchContract = contract.object({
    protocolVersion: contract.literal(1),
    operations: contract.array(MemoryPatchOperationContract),
});

/** Working Memory 增量 Patch 公开类型。 */
export type WorkingMemoryPatch = InferContract<typeof WorkingMemoryPatchContract>;

/** Executing 阶段 Memory Patch 单项操作契约（与 MemoryPatchOperationContract 统一）。 */
export const ExecutingMemoryPatchOperationContract = MemoryPatchOperationContract;

/** Executing 阶段 Memory Patch 单项操作公开类型。 */
export type ExecutingMemoryPatchOperation = MemoryPatchOperation;

/** Executing 阶段 Working Memory 增量 Patch 契约（与 WorkingMemoryPatchContract 统一）。 */
export const ExecutingWorkingMemoryPatchContract = WorkingMemoryPatchContract;

/** Executing 阶段 Working Memory 增量 Patch 公开类型。 */
export type ExecutingWorkingMemoryPatch = WorkingMemoryPatch;

/**
 * 获授权模式更新 GoalPlan 的模型决策契约。
 *
 * @remarks
 * `baseRevision` 与操作列表由 Runtime 的 GoalPlan reducer 原子校验；模型只能引用
 * 已投影的 Todo ID。将 Todo 置为 completed 时必须引用当前 Run 的 Observation，引用
 * 由 Runtime Evidence Gate 校验。可选 Working Memory Patch 仍属于当前 Run。
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
export const GoalPlanUpdateAgentDecisionContract = contract.object({
    kind: contract.literal("goal_plan_update"),
    baseRevision: contract.integer({ minimum: 0 }),
    operations: contract.array(GoalPlanPatchOperationContract),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** Plan Mode 更新 GoalPlan 的模型决策公开类型。 */
export type GoalPlanUpdateAgentDecision = InferContract<typeof GoalPlanUpdateAgentDecisionContract>;

/**
 * Model Context Checkpoint 检查点结果契约。
 *
 * @example
 * ```ts
 * const res: ModelContextCheckpointResult = { kind: "context_checkpoint" };
 * ```
 */
export const ModelContextCheckpointResultContract = contract.object({
    kind: contract.literal("context_checkpoint"),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** Context Checkpoint 结果公开类型。 */
export type ModelContextCheckpointResult = InferContract<typeof ModelContextCheckpointResultContract>;

/**
 * Tool 调用决策契约。
 *
 * @example
 * ```ts
 * const call = {
 *     kind: "tool_call",
 *     action: { actionId: "a1", toolId: "bash", input: {} },
 * };
 * ```
 */
export const ToolCallAgentDecisionContract = contract.object({
    kind: contract.literal("tool_call"),
    action: ToolCallActionContract,
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** 普通 Run 的完成决策契约。 */
export const NormalCompleteAgentDecisionContract = contract.object({
    kind: contract.literal("complete"),
    summary: contract.string(),
    evidenceSequences: contract.array(contract.integer({ minimum: 0 })),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/**
 * 等待用户输入决策契约。
 *
 * @example
 * ```ts
 * const wait = { kind: "wait", reason: "需要用户授权" };
 * ```
 */
export const WaitAgentDecisionContract = contract.object({
    kind: contract.literal("wait"),
    reason: contract.string(),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/**
 * 任务失败决策契约。
 *
 * @example
 * ```ts
 * const fail = { kind: "fail", error: "无法找到依赖" };
 * ```
 */
export const FailAgentDecisionContract = contract.object({
    kind: contract.literal("fail"),
    error: contract.string(),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/**
 * Executing 阶段 Tool 调用决策契约（与 ToolCallAgentDecisionContract 统一）。
 */
export const ExecutingToolCallAgentDecisionContract = ToolCallAgentDecisionContract;

/** Plan Run 获批后的逐条件完成决策契约。 */
export const ExecutingCompleteAgentDecisionContract = contract.object({
    kind: contract.literal("complete"),
    summary: contract.string(),
    completionEvidence: contract.array(CompletionEvidenceContract),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/**
 * 通用 Agent 完成决策契约，接受普通 Run 与已批准 Plan Run 的证据形状。
 *
 * @example
 * ```ts
 * const complete = {
 *     kind: "complete",
 *     summary: "已完成",
 *     evidenceSequences: [12],
 * };
 * ```
 */
export const CompleteAgentDecisionContract = contract.union([
    NormalCompleteAgentDecisionContract,
    ExecutingCompleteAgentDecisionContract,
]);

/** Executing 阶段等待决策契约（与 WaitAgentDecisionContract 统一）。 */
export const ExecutingWaitAgentDecisionContract = WaitAgentDecisionContract;

/** Executing 阶段失败决策契约（与 FailAgentDecisionContract 统一）。 */
export const ExecutingFailAgentDecisionContract = FailAgentDecisionContract;

/**
 * AskUser 问题选项输入契约。
 *
 * @remarks
 * 模型在 ask_user 决策中提交的单个选项，包含显示标签与可选说明。
 *
 * @example
 * ```ts
 * const option: AskUserOptionInput = {
 *     label: "选项 A",
 *     description: "方案 A 说明",
 * };
 * ```
 */
export const AskUserOptionInputContract = contract.object({
    label: contract.string(),
    description: contract.optional(contract.string()),
});
export type AskUserOptionInput = InferContract<typeof AskUserOptionInputContract>;

/**
 * AskUser 单个问题输入契约。
 *
 * @remarks
 * 包含简短标题、具体问题描述、2 至 3 个候选选项，以及是否允许多选的标记。
 *
 * @example
 * ```ts
 * const question: AskUserQuestionInput = {
 *     header: "确认方案",
 *     question: "请选择架构实现方式：",
 *     options: [
 *         { label: "方案 A" },
 *         { label: "方案 B" },
 *     ],
 *     multiSelect: false,
 * };
 * ```
 */
export const AskUserQuestionInputContract = contract.object({
    header: contract.string(),
    question: contract.string(),
    options: contract.array(AskUserOptionInputContract, { minItems: 2, maxItems: 3 }),
    multiSelect: contract.boolean(),
});
export type AskUserQuestionInput = InferContract<typeof AskUserQuestionInputContract>;

/**
 * AskUser 用户提问决策契约。
 *
 * @remarks
 * 模型向用户提出 1 至 3 个结构化问题，等待用户交互选择或填写 Other 答案。
 *
 * @example
 * ```ts
 * const decision: AskUserAgentDecision = {
 *     kind: "ask_user",
 *     questions: [
 *         {
 *             header: "确认依赖",
 *             question: "使用哪种包管理器？",
 *             options: [{ label: "pnpm" }, { label: "npm" }],
 *             multiSelect: false,
 *         },
 *     ],
 * };
 * ```
 */
export const AskUserAgentDecisionContract = contract.object({
    kind: contract.literal("ask_user"),
    questions: contract.array(AskUserQuestionInputContract, { minItems: 1, maxItems: 3 }),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});
export type AskUserAgentDecision = InferContract<typeof AskUserAgentDecisionContract>;

/**
 * 任务提案决策契约。
 *
 * @remarks
 * 模型提出目标与完成验收标准，请求用户审查并批准。在批准前只允许只读 Tool。
 *
 * @example
 * ```ts
 * const proposal: TaskProposalAgentDecision = {
 *     kind: "task_proposal",
 *     task: { objective: "修复问题", completionCriteria: [{ text: "测试通过" }] },
 *     approvalRequest: "请批准任务计划",
 * };
 * ```
 */
export const TaskProposalAgentDecisionContract = contract.object({
    kind: contract.literal("task_proposal"),
    task: GoalTaskContract,
    approvalRequest: contract.string(),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});
export type TaskProposalAgentDecision = InferContract<typeof TaskProposalAgentDecisionContract>;

/**
 * 规范化后的 AskUser 问题选项。
 *
 * @remarks
 * 由 Runtime 分配局部唯一标识 `id`（如 `o-1`, `o-2`）。
 *
 * @example
 * ```ts
 * const option: AskUserOption = {
 *     id: "o-1",
 *     label: "选项 A",
 * };
 * ```
 */
export interface AskUserOption {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}

/**
 * 规范化后的 AskUser 问题。
 *
 * @remarks
 * 由 Runtime 为问题分配局部唯一标识 `id`（如 `q-1`, `q-2`），并为选项分配 `id`。
 *
 * @example
 * ```ts
 * const question: AskUserQuestion = {
 *     id: "q-1",
 *     header: "模式选择",
 *     question: "请选择执行模式",
 *     options: [{ id: "o-1", label: "模式 1" }, { id: "o-2", label: "模式 2" }],
 *     multiSelect: false,
 * };
 * ```
 */
export interface AskUserQuestion {
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly options: readonly AskUserOption[];
    readonly multiSelect: boolean;
}

/**
 * 用户对单个 AskUser 问题的回答契约。
 *
 * @remarks
 * 记录用户选择的选项标识数组或自由填写的 Other 文本。
 *
 * @example
 * ```ts
 * const answer: AskUserAnswer = {
 *     questionId: "q-1",
 *     optionIds: ["o-1"],
 * };
 * ```
 */
export const AskUserAnswerContract = contract.object({
    questionId: contract.string(),
    optionIds: contract.array(contract.string()),
    otherText: contract.optional(contract.string()),
});
export type AskUserAnswer = InferContract<typeof AskUserAnswerContract>;

/**
 * 将模型提交的 AskUser 问题列表规范化，分配稳定局部标识与全局请求标识。
 *
 * @param input - 包含 1-3 个问题的原始模型输入。
 * @param requestId - 可选的指定请求标识，未提供时自动生成。
 * @returns 规范化后的请求对象，包含 requestId 与分配了 id 的问题数组。
 *
 * @example
 * ```ts
 * const normalized = normalizeAskUserRequest({ questions });
 * ```
 */
export function normalizeAskUserRequest(
    input: { readonly questions: readonly AskUserQuestionInput[] } | readonly AskUserQuestionInput[],
    requestId?: string,
): { readonly requestId: string; readonly questions: readonly AskUserQuestion[] } {
    const effectiveRequestId = requestId ?? `ask-${randomUUID()}`;
    const rawQuestions: readonly AskUserQuestionInput[] = "questions" in input
        ? input.questions
        : input;
    const questions = rawQuestions.map((q, qIndex) => {
        const questionId = `q-${qIndex + 1}`;
        const options = q.options.map((opt, optIndex) => ({
            id: `o-${optIndex + 1}`,
            label: opt.label,
            ...(opt.description !== undefined ? { description: opt.description } : {}),
        }));
        return {
            id: questionId,
            header: q.header,
            question: q.question,
            options: Object.freeze(options),
            multiSelect: q.multiSelect,
        };
    });
    return {
        requestId: effectiveRequestId,
        questions: Object.freeze(questions),
    };
}

/**
 * 校验用户提交的 AskUser 答案是否合法。
 *
 * @param questions - 原始规范化问题列表。
 * @param answers - 用户提交的答案列表。
 * @throws 答案数量不匹配、问题 ID 不对应、选项 ID 非法或单/多选规则违反时抛出异常。
 *
 * @example
 * ```ts
 * validateAskUserAnswers(questions, answers);
 * ```
 */
export function validateAskUserAnswers(
    questions: readonly AskUserQuestion[],
    answers: readonly AskUserAnswer[],
): void {
    if (answers.length !== questions.length) {
        throw new Error(`Answer count mismatch: expected ${questions.length}, received ${answers.length}`);
    }
    const questionMap = new Map<string, AskUserQuestion>();
    for (const q of questions) {
        questionMap.set(q.id, q);
    }

    const seenQuestionIds = new Set<string>();
    for (const answer of answers) {
        if (seenQuestionIds.has(answer.questionId)) {
            throw new Error(`Duplicate answer for question "${answer.questionId}"`);
        }
        seenQuestionIds.add(answer.questionId);

        const question = questionMap.get(answer.questionId);
        if (question === undefined) {
            throw new Error(`Answer references unknown question "${answer.questionId}"`);
        }

        const validOptionIds = new Set(question.options.map((o) => o.id));
        const selectedOptions = new Set<string>();
        for (const optId of answer.optionIds) {
            if (!validOptionIds.has(optId)) {
                throw new Error(`Option "${optId}" is not valid for question "${question.id}"`);
            }
            if (selectedOptions.has(optId)) {
                throw new Error(`Duplicate option "${optId}" selected in question "${question.id}"`);
            }
            selectedOptions.add(optId);
        }

        const hasOtherText = answer.otherText !== undefined && answer.otherText.trim().length > 0;
        if (answer.otherText !== undefined && !hasOtherText) {
            throw new Error(`otherText for question "${question.id}" must not be blank if provided`);
        }

        if (!question.multiSelect) {
            const selectedCount = answer.optionIds.length + (hasOtherText ? 1 : 0);
            if (selectedCount !== 1) {
                throw new Error(`Single-choice question "${question.id}" requires exactly one selection or otherText, got ${selectedCount}`);
            }
        } else {
            const totalSelections = answer.optionIds.length + (hasOtherText ? 1 : 0);
            if (totalSelections < 1) {
                throw new Error(`Multi-choice question "${question.id}" requires at least one selection or otherText`);
            }
        }
    }
}

/**
 * 结构化 Agent 决策契约（不含 checkpoint）。
 *
 * @remarks
 * 覆盖跨模式 executing 决策分支：tool_call、普通与 Plan complete、wait、fail、context_lookup、ask_user 和 task_proposal。
 *
 * @example
 * ```ts
 * const parsed = safeParse(StructuredAgentDecisionContract, decision);
 * ```
 */
export const StructuredAgentDecisionContract = contract.union([
    ExecutingToolCallAgentDecisionContract,
    NormalCompleteAgentDecisionContract,
    ExecutingCompleteAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingFailAgentDecisionContract,
    ContextLookupRequestContract,
    AskUserAgentDecisionContract,
    TaskProposalAgentDecisionContract,
]);

/** 结构化 Agent 决策公开类型。 */
export type StructuredAgentDecision = InferContract<typeof StructuredAgentDecisionContract>;

/**
 * 普通模式可提交的 Executing 决策契约。
 *
 * @example
 * ```ts
 * const normalComplete = {
 *     kind: "complete",
 *     summary: "请求已完成",
 *     evidenceSequences: [12],
 * };
 * ```
 */
export const OrdinaryExecutingDecisionContract = contract.union([
    ExecutingToolCallAgentDecisionContract,
    NormalCompleteAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingFailAgentDecisionContract,
    ContextLookupRequestContract,
    AskUserAgentDecisionContract,
]);

/**
 * 未授权任何 Tool 时的 Executing 决策契约。
 *
 * @remarks
 * 省略 tool_call 分支，接受普通与 Plan 的无 Tool 决策形状；具体 Run 可用分支由请求级契约包限定。
 *
 * @example
 * ```ts
 * const parsed = safeParse(NonToolExecutingDecisionContract, decision);
 * ```
 */
export const NonToolExecutingDecisionContract = contract.union([
    NormalCompleteAgentDecisionContract,
    ExecutingCompleteAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingFailAgentDecisionContract,
    ContextLookupRequestContract,
    AskUserAgentDecisionContract,
    TaskProposalAgentDecisionContract,
]);

/**
 * Plan Mode Executing 决策契约。
 *
 * @remarks
 * 仅包含 Plan Run 的执行分支，并允许 `goal_plan_update`；普通模式的契约包不会引用
 * 此分支，因此不能通过普通模型输出修改 GoalPlan。
 *
 * @example
 * ```ts
 * const parsed = safeParse(PlanModeExecutingDecisionContract, {
 *     kind: "goal_plan_update",
 *     baseRevision: 0,
 *     operations: [{ type: "add", content: "实现接口" }],
 * });
 * ```
 */
export const PlanModeExecutingDecisionContract = contract.discriminatedUnion("kind", [
    ExecutingToolCallAgentDecisionContract,
    ExecutingCompleteAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingFailAgentDecisionContract,
    ContextLookupRequestContract,
    AskUserAgentDecisionContract,
    TaskProposalAgentDecisionContract,
    GoalPlanUpdateAgentDecisionContract,
]);

/** Plan Mode Executing 决策公开类型。 */
export type PlanModeExecutingDecision = InferContract<typeof PlanModeExecutingDecisionContract>;

/**
 * 完整 Agent 决策契约。
 *
 * @remarks
 * 包含 structured 决策与 context_checkpoint 检查点结果。
 * Runtime Runner 校验 StepExecutor 返回值的统一顶层契约。
 *
 * @example
 * ```ts
 * const parsed = safeParse(AgentDecisionContract, raw);
 * ```
 */
export const AgentDecisionContract = contract.union([
    ModelContextCheckpointResultContract,
    ToolCallAgentDecisionContract,
    NormalCompleteAgentDecisionContract,
    ExecutingCompleteAgentDecisionContract,
    WaitAgentDecisionContract,
    FailAgentDecisionContract,
    ContextLookupRequestContract,
    AskUserAgentDecisionContract,
    TaskProposalAgentDecisionContract,
    GoalPlanUpdateAgentDecisionContract,
]);

/** Agent 决策公开类型。 */
export type AgentDecision = InferContract<typeof AgentDecisionContract>;

/** 基础语义校验问题的稳定分类码。 */
export type ModelOutputSemanticIssueCode =
    | "blank_string"
    | "invalid_sequence_range"
    | "invalid_evidence_reference"
    | "empty_update"
    | "invalid_tool_id"
    | "duplicate_option";

/**
 * 定位到结构字段的基础语义问题。
 *
 * @remarks
 * 用于表示非空白字符串、非反转 sequence range 或更新操作无字段等不满足业务协议语义的问题。
 *
 * @example
 * ```ts
 * const issue: ModelOutputSemanticIssue = {
 *     code: "blank_string",
 *     path: ["question"],
 *     message: "String must not be blank",
 * };
 * ```
 */
export interface ModelOutputSemanticIssue {
    /** 问题的稳定分类码。 */
    readonly code: ModelOutputSemanticIssueCode;
    /** 问题所在的访问路径。 */
    readonly path: readonly (string | number)[];
    /** 面向诊断的英文消息。 */
    readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkNonBlank(
    value: unknown,
    path: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
    fieldName: string,
): void {
    if (typeof value === "string" && value.trim().length === 0) {
        issues.push({
            code: "blank_string",
            path,
            message: `${fieldName} must not be blank`,
        });
    }
}

function checkCriterionSemantics(
    criterion: unknown,
    path: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (!isRecord(criterion)) return;
    checkNonBlank(criterion.text, [...path, "text"], issues, "completion criterion text");
    if (isRecord(criterion.acceptance)) {
        checkNonBlank(
            criterion.acceptance.expectToolId,
            [...path, "acceptance", "expectToolId"],
            issues,
            "expectToolId",
        );
        if (typeof criterion.acceptance.expectToolId === "string" && criterion.acceptance.expectToolId.startsWith("system_")) {
            issues.push({
                code: "invalid_tool_id",
                path: [...path, "acceptance", "expectToolId"],
                message: `expectToolId "${criterion.acceptance.expectToolId}" must not be a system function`,
            });
        }
    }
}

function validateFiltersSemantics(
    filters: unknown,
    parentPath: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (!isRecord(filters)) return;
    const stringArrayFields = [
        "eventTypes",
        "toolIds",
        "actionIds",
        "paths",
        "errorCodes",
        "objectIds",
    ] as const;

    for (const field of stringArrayFields) {
        const arr = filters[field];
        if (Array.isArray(arr)) {
            arr.forEach((item, index) => {
                checkNonBlank(item, [...parentPath, field, index], issues, `${field}[${index}]`);
            });
        }
    }

    if (isRecord(filters.sequenceRange)) {
        const range = filters.sequenceRange;
        if (
            typeof range.from === "number"
            && typeof range.to === "number"
            && range.from > range.to
        ) {
            issues.push({
                code: "invalid_sequence_range",
                path: [...parentPath, "sequenceRange"],
                message: "sequenceRange.from must be less than or equal to sequenceRange.to",
            });
        }
    }
}

function validateMemoryPatchSemantics(
    patch: unknown,
    parentPath: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (!isRecord(patch) || !Array.isArray(patch.operations)) return;

    patch.operations.forEach((op, index) => {
        if (!isRecord(op) || typeof op.type !== "string") return;
        const opPath = [...parentPath, "operations", index];

        switch (op.type) {
            case "upsert_fact": {
                if (isRecord(op.fact)) {
                    checkNonBlank(op.fact.subject, [...opPath, "fact", "subject"], issues, "subject");
                    checkNonBlank(op.fact.predicate, [...opPath, "fact", "predicate"], issues, "predicate");
                }
                break;
            }
            case "retire_fact": {
                if (isRecord(op.fact)) {
                    checkNonBlank(op.fact.id, [...opPath, "fact", "id"], issues, "id");
                }
                break;
            }
            case "create_hypothesis": {
                if (isRecord(op.hypothesis)) {
                    checkNonBlank(op.hypothesis.statement, [...opPath, "hypothesis", "statement"], issues, "statement");
                }
                break;
            }
            case "update_hypothesis": {
                if (isRecord(op.hypothesis)) {
                    checkNonBlank(op.hypothesis.id, [...opPath, "hypothesis", "id"], issues, "id");
                    if (op.hypothesis.statement !== undefined) {
                        checkNonBlank(op.hypothesis.statement, [...opPath, "hypothesis", "statement"], issues, "statement");
                    }
                    if (op.hypothesis.statement === undefined && op.hypothesis.status === undefined) {
                        issues.push({
                            code: "empty_update",
                            path: [...opPath, "hypothesis"],
                            message: "update_hypothesis must update at least one field",
                        });
                    }
                }
                break;
            }
            case "create_blocker": {
                if (isRecord(op.blocker)) {
                    checkNonBlank(op.blocker.description, [...opPath, "blocker", "description"], issues, "description");
                }
                break;
            }
            case "update_blocker": {
                if (isRecord(op.blocker)) {
                    checkNonBlank(op.blocker.id, [...opPath, "blocker", "id"], issues, "id");
                    if (op.blocker.description !== undefined) {
                        checkNonBlank(op.blocker.description, [...opPath, "blocker", "description"], issues, "description");
                    }
                    if (op.blocker.description === undefined && op.blocker.status === undefined) {
                        issues.push({
                            code: "empty_update",
                            path: [...opPath, "blocker"],
                            message: "update_blocker must update at least one field",
                        });
                    }
                }
                break;
            }
        }
    });
}

function validateGoalPlanPatchSemantics(
    value: Record<string, unknown>,
    parentPath: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (typeof value.baseRevision === "number" && value.baseRevision < 0) {
        issues.push({
            code: "invalid_sequence_range",
            path: [...parentPath, "baseRevision"],
            message: "baseRevision must be non-negative",
        });
    }
    if (!Array.isArray(value.operations)) return;

    if (value.operations.length === 0) {
        issues.push({
            code: "empty_update",
            path: [...parentPath, "operations"],
            message: "goal_plan_update must contain at least one operation",
        });
    }

    value.operations.forEach((operation, index) => {
        if (!isRecord(operation) || typeof operation.type !== "string") return;
        const path = [...parentPath, "operations", index];
        switch (operation.type) {
            case "add":
                checkNonBlank(operation.content, [...path, "content"], issues, "Todo content");
                break;
            case "update":
                checkNonBlank(operation.id, [...path, "id"], issues, "Todo id");
                if (operation.content !== undefined) {
                    checkNonBlank(operation.content, [...path, "content"], issues, "Todo content");
                }
                if (operation.content === undefined && operation.status === undefined) {
                    issues.push({
                        code: "empty_update",
                        path,
                        message: "GoalPlan update must change content or status",
                    });
                }
                if (operation.status === "completed") {
                    if (!Array.isArray(operation.evidenceSequences) || operation.evidenceSequences.length === 0) {
                        issues.push({
                            code: "invalid_evidence_reference",
                            path: [...path, "evidenceSequences"],
                            message: "completed Todo update must cite current Run evidence",
                        });
                    }
                } else if (operation.evidenceSequences !== undefined) {
                    issues.push({
                        code: "invalid_evidence_reference",
                        path: [...path, "evidenceSequences"],
                        message: "evidenceSequences is only valid when completing a Todo",
                    });
                }
                break;
            case "reorder":
            case "cancel":
                checkNonBlank(operation.id, [...path, "id"], issues, "Todo id");
                break;
        }
    });
}

/**
 * 校验模型输出的协议基础语义。
 *
 * @remarks
 * 纯函数，不修改输入、不进行 trim、不补充默认值。
 * 针对 AgentDecision、ContextLookupRequest、GoalTask 或 MemoryPatch
 * 检查非空白字符串、非反转 sequenceRange 及 update 操作非空变更。
 *
 * @param value - 待校验的模型输出对象或子对象。
 * @param basePath - 可选的基础路径前缀，默认空数组。
 * @returns 语义问题列表；无问题时返回空数组。
 * @example
 * ```ts
 * const issues = validateModelOutputSemantics(result);
 * if (issues.length > 0) {
 *     console.error(issues[0].message);
 * }
 * ```
 */
export function validateModelOutputSemantics(
    value: unknown,
    basePath: readonly (string | number)[] = [],
): readonly ModelOutputSemanticIssue[] {
    const issues: ModelOutputSemanticIssue[] = [];

    if (!isRecord(value)) {
        return issues;
    }

    if (isRecord(value.memoryPatch)) {
        validateMemoryPatchSemantics(value.memoryPatch, [...basePath, "memoryPatch"], issues);
    } else if (value.protocolVersion === 1 && Array.isArray(value.operations)) {
        validateMemoryPatchSemantics(value, basePath, issues);
    }

    if (typeof value.kind === "string") {
        switch (value.kind) {
            case "request_think": {
                checkNonBlank(value.goal, [...basePath, "goal"], issues, "goal");
                break;
            }
            case "question": {
                checkNonBlank(value.question, [...basePath, "question"], issues, "question");
                break;
            }
            case "ask_user": {
                if (Array.isArray(value.questions)) {
                    value.questions.forEach((q, qIndex) => {
                        if (!isRecord(q)) return;
                        const qPath = [...basePath, "questions", qIndex];
                        checkNonBlank(q.header, [...qPath, "header"], issues, "header");
                        checkNonBlank(q.question, [...qPath, "question"], issues, "question");
                        if (Array.isArray(q.options)) {
                            const seenLabels = new Set<string>();
                            q.options.forEach((opt, optIndex) => {
                                if (!isRecord(opt)) return;
                                const optPath = [...qPath, "options", optIndex];
                                checkNonBlank(opt.label, [...optPath, "label"], issues, "label");
                                if (opt.description !== undefined) {
                                    checkNonBlank(opt.description, [...optPath, "description"], issues, "description");
                                }
                                if (typeof opt.label === "string" && opt.label.trim().length > 0) {
                                    const normalizedLabel = opt.label.trim();
                                    if (seenLabels.has(normalizedLabel)) {
                                        issues.push({
                                            code: "duplicate_option",
                                            path: [...optPath, "label"],
                                            message: `Duplicate option label "${opt.label}" in question`,
                                        });
                                    }
                                    seenLabels.add(normalizedLabel);
                                }
                            });
                        }
                    });
                }
                break;
            }
            case "task_proposal": {
                checkNonBlank(value.approvalRequest, [...basePath, "approvalRequest"], issues, "approvalRequest");
                if (isRecord(value.task)) {
                    checkNonBlank(value.task.objective, [...basePath, "task", "objective"], issues, "objective");
                    if (Array.isArray(value.task.completionCriteria)) {
                        value.task.completionCriteria.forEach((item, index) => {
                            checkCriterionSemantics(
                                item,
                                [...basePath, "task", "completionCriteria", index],
                                issues,
                            );
                        });
                    }
                }
                break;
            }
            case "context_lookup": {
                checkNonBlank(value.question, [...basePath, "question"], issues, "question");
                if (isRecord(value.filters)) {
                    validateFiltersSemantics(value.filters, [...basePath, "filters"], issues);
                }
                break;
            }
            case "tool_call": {
                if (isRecord(value.action)) {
                    checkNonBlank(value.action.actionId, [...basePath, "action", "actionId"], issues, "actionId");
                    checkNonBlank(value.action.toolId, [...basePath, "action", "toolId"], issues, "toolId");
                }
                break;
            }
            case "complete": {
                checkNonBlank(value.summary, [...basePath, "summary"], issues, "summary");
                break;
            }
            case "wait": {
                checkNonBlank(value.reason, [...basePath, "reason"], issues, "reason");
                break;
            }
            case "fail": {
                checkNonBlank(value.error, [...basePath, "error"], issues, "error");
                break;
            }
            case "goal_plan_update": {
                validateGoalPlanPatchSemantics(value, basePath, issues);
                break;
            }
        }
    } else {
        if (typeof value.objective === "string") {
            checkNonBlank(value.objective, [...basePath, "objective"], issues, "objective");
            if (Array.isArray(value.completionCriteria)) {
                value.completionCriteria.forEach((item, index) => {
                    checkCriterionSemantics(item, [...basePath, "completionCriteria", index], issues);
                });
            }
        }
        if (typeof value.actionId === "string" && typeof value.toolId === "string") {
            checkNonBlank(value.actionId, [...basePath, "actionId"], issues, "actionId");
            checkNonBlank(value.toolId, [...basePath, "toolId"], issues, "toolId");
        }
    }

    return Object.freeze(issues);
}
