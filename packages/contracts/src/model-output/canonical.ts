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
 * Goal 任务定义契约。
 *
 * @remarks
 * 规定模型在规划阶段提出的目标与验收标准列表。
 *
 * @example
 * ```ts
 * const task: GoalTask = {
 *     objective: "实现功能 X",
 *     completionCriteria: ["标准 1", "标准 2"],
 * };
 * ```
 */
export const GoalTaskContract = contract.object({
    objective: contract.string(),
    completionCriteria: contract.array(contract.string()),
});

/** Goal 任务公开类型。 */
export type GoalTask = InferContract<typeof GoalTaskContract>;

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
 * Agent 或 Preparation 请求从已提交 Trajectory 查询上下文的独占结果分支。
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
 * PlanItem 创建状态枚举契约。
 *
 * @remarks
 * 新建计划项仅允许 pending、active 或 blocked。
 *
 * @example
 * ```ts
 * const status: PlanItemCreateStatus = "pending";
 * ```
 */
export const PlanItemCreateStatusContract = contract.enum([
    "pending",
    "active",
    "blocked",
] as const);

/** PlanItem 创建状态枚举类型。 */
export type PlanItemCreateStatus = InferContract<typeof PlanItemCreateStatusContract>;

/**
 * PlanItem 完整状态枚举契约。
 *
 * @example
 * ```ts
 * const status: PlanItemStatus = "completed";
 * ```
 */
export const PlanItemStatusContract = contract.enum([
    "pending",
    "active",
    "completed",
    "blocked",
    "superseded",
] as const);

/** PlanItem 状态公开类型。 */
export type PlanItemStatus = InferContract<typeof PlanItemStatusContract>;

/**
 * 创建 PlanItem 提议契约。
 *
 * @example
 * ```ts
 * const create: PlanItemCreate = { description: "实现接口" };
 * ```
 */
export const PlanItemCreateContract = contract.object({
    description: contract.string(),
    status: contract.optional(PlanItemCreateStatusContract),
    dependsOnFactIds: contract.optional(contract.array(contract.string())),
    dependsOnPlanItemIds: contract.optional(contract.array(contract.string())),
});

/** 创建 PlanItem 公开类型。 */
export type PlanItemCreate = InferContract<typeof PlanItemCreateContract>;

/**
 * 更新 PlanItem 提议契约。
 *
 * @example
 * ```ts
 * const update: PlanItemUpdate = { id: "plan-1", status: "completed" };
 * ```
 */
export const PlanItemUpdateContract = contract.object({
    id: contract.string(),
    description: contract.optional(contract.string()),
    status: contract.optional(PlanItemStatusContract),
    dependsOnFactIds: contract.optional(contract.array(contract.string())),
    dependsOnPlanItemIds: contract.optional(contract.array(contract.string())),
    completionEvidenceSequences: contract.optional(contract.array(contract.integer({ minimum: 0 }))),
});

/** 更新 PlanItem 公开类型。 */
export type PlanItemUpdate = InferContract<typeof PlanItemUpdateContract>;

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
    contract.object({ type: contract.literal("create_plan_item"), planItem: PlanItemCreateContract }),
    contract.object({ type: contract.literal("update_plan_item"), planItem: PlanItemUpdateContract }),
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

/**
 * Preparation Question 结果契约。
 *
 * @example
 * ```ts
 * const res = { kind: "question", question: "需要支持哪些工具？" };
 * ```
 */
export const QuestionPreparationResultContract = contract.object({
    kind: contract.literal("question"),
    question: contract.string(),
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/**
 * Preparation Context Ready 结果契约。
 *
 * @example
 * ```ts
 * const res = { kind: "context_ready" };
 * ```
 */
export const ContextReadyPreparationResultContract = contract.object({
    kind: contract.literal("context_ready"),
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/**
 * Preparation Task Proposal 结果契约。
 *
 * @example
 * ```ts
 * const res = {
 *     kind: "task_proposal",
 *     task: { objective: "目标", completionCriteria: [] },
 *     approvalRequest: "是否批准？",
 * };
 * ```
 */
export const TaskProposalPreparationResultContract = contract.object({
    kind: contract.literal("task_proposal"),
    task: GoalTaskContract,
    approvalRequest: contract.string(),
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

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
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/** Context Checkpoint 结果公开类型。 */
export type ModelContextCheckpointResult = InferContract<typeof ModelContextCheckpointResultContract>;

/**
 * Gathering 阶段专属 Preparation 结果契约。
 *
 * @remarks
 * 仅允许 question、context_ready 或 context_lookup。
 */
export const GatheringPreparationResultContract = contract.discriminatedUnion("kind", [
    QuestionPreparationResultContract,
    ContextReadyPreparationResultContract,
    ContextLookupRequestContract,
]);

/** Gathering 阶段结果公开类型。 */
export type GatheringPreparationResult = InferContract<typeof GatheringPreparationResultContract>;

/**
 * Planning 阶段专属 Preparation 结果契约。
 *
 * @remarks
 * 仅允许 task_proposal 或 context_lookup。
 */
export const PlanningPreparationResultContract = contract.discriminatedUnion("kind", [
    TaskProposalPreparationResultContract,
    ContextLookupRequestContract,
]);

/** Planning 阶段结果公开类型。 */
export type PlanningPreparationResult = InferContract<typeof PlanningPreparationResultContract>;

/**
 * 完整 Preparation 结果契约。
 *
 * @remarks
 * Runtime Coordinator 校验 Preparation Executor 返回值的统一顶层契约。
 *
 * @example
 * ```ts
 * const parsed = safeParse(PreparationResultContract, raw);
 * ```
 */
export const PreparationResultContract = contract.discriminatedUnion("kind", [
    ModelContextCheckpointResultContract,
    QuestionPreparationResultContract,
    ContextReadyPreparationResultContract,
    TaskProposalPreparationResultContract,
    ContextLookupRequestContract,
]);

/** Preparation 结果公开类型。 */
export type PreparationResult = InferContract<typeof PreparationResultContract>;

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
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/**
 * 任务完成决策契约。
 *
 * @example
 * ```ts
 * const complete = {
 *     kind: "complete",
 *     summary: "全部完成",
 *     completionEvidence: [],
 * };
 * ```
 */
export const CompleteAgentDecisionContract = contract.object({
    kind: contract.literal("complete"),
    summary: contract.string(),
    completionEvidence: contract.array(CompletionEvidenceContract),
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
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
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
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
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/**
 * 结构化 Agent 决策契约（不含 checkpoint）。
 *
 * @remarks
 * 覆盖普通 executing 轮次允许的全部分支：tool_call、complete、wait、fail、context_lookup。
 *
 * @example
 * ```ts
 * const parsed = safeParse(StructuredAgentDecisionContract, decision);
 * ```
 */
export const StructuredAgentDecisionContract = contract.discriminatedUnion("kind", [
    ToolCallAgentDecisionContract,
    CompleteAgentDecisionContract,
    WaitAgentDecisionContract,
    FailAgentDecisionContract,
    ContextLookupRequestContract,
]);

/** 结构化 Agent 决策公开类型。 */
export type StructuredAgentDecision = InferContract<typeof StructuredAgentDecisionContract>;

/**
 * 普通 Executing 决策契约（与 StructuredAgentDecisionContract 等价）。
 */
export const OrdinaryExecutingDecisionContract = StructuredAgentDecisionContract;

/**
 * 未授权任何 Tool 时的 Executing 决策契约。
 *
 * @remarks
 * 省略 tool_call 分支，仅允许 complete、wait、fail 与 context_lookup。
 *
 * @example
 * ```ts
 * const parsed = safeParse(NonToolExecutingDecisionContract, decision);
 * ```
 */
export const NonToolExecutingDecisionContract = contract.discriminatedUnion("kind", [
    CompleteAgentDecisionContract,
    WaitAgentDecisionContract,
    FailAgentDecisionContract,
    ContextLookupRequestContract,
]);

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
export const AgentDecisionContract = contract.discriminatedUnion("kind", [
    ModelContextCheckpointResultContract,
    ToolCallAgentDecisionContract,
    CompleteAgentDecisionContract,
    WaitAgentDecisionContract,
    FailAgentDecisionContract,
    ContextLookupRequestContract,
]);

/** Agent 决策公开类型。 */
export type AgentDecision = InferContract<typeof AgentDecisionContract>;

/** 基础语义校验问题的稳定分类码。 */
export type ModelOutputSemanticIssueCode =
    | "blank_string"
    | "invalid_sequence_range"
    | "empty_update";

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
            case "create_plan_item": {
                if (isRecord(op.planItem)) {
                    checkNonBlank(op.planItem.description, [...opPath, "planItem", "description"], issues, "description");
                    if (Array.isArray(op.planItem.dependsOnFactIds)) {
                        op.planItem.dependsOnFactIds.forEach((id, idIndex) => {
                            checkNonBlank(id, [...opPath, "planItem", "dependsOnFactIds", idIndex], issues, "dependsOnFactId");
                        });
                    }
                    if (Array.isArray(op.planItem.dependsOnPlanItemIds)) {
                        op.planItem.dependsOnPlanItemIds.forEach((id, idIndex) => {
                            checkNonBlank(id, [...opPath, "planItem", "dependsOnPlanItemIds", idIndex], issues, "dependsOnPlanItemId");
                        });
                    }
                }
                break;
            }
            case "update_plan_item": {
                if (isRecord(op.planItem)) {
                    checkNonBlank(op.planItem.id, [...opPath, "planItem", "id"], issues, "id");
                    if (op.planItem.description !== undefined) {
                        checkNonBlank(op.planItem.description, [...opPath, "planItem", "description"], issues, "description");
                    }
                    if (Array.isArray(op.planItem.dependsOnFactIds)) {
                        op.planItem.dependsOnFactIds.forEach((id, idIndex) => {
                            checkNonBlank(id, [...opPath, "planItem", "dependsOnFactIds", idIndex], issues, "dependsOnFactId");
                        });
                    }
                    if (Array.isArray(op.planItem.dependsOnPlanItemIds)) {
                        op.planItem.dependsOnPlanItemIds.forEach((id, idIndex) => {
                            checkNonBlank(id, [...opPath, "planItem", "dependsOnPlanItemIds", idIndex], issues, "dependsOnPlanItemId");
                        });
                    }
                    if (
                        op.planItem.description === undefined
                        && op.planItem.status === undefined
                        && op.planItem.dependsOnFactIds === undefined
                        && op.planItem.dependsOnPlanItemIds === undefined
                        && op.planItem.completionEvidenceSequences === undefined
                    ) {
                        issues.push({
                            code: "empty_update",
                            path: [...opPath, "planItem"],
                            message: "update_plan_item must update at least one field",
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

/**
 * 校验模型输出的协议基础语义。
 *
 * @remarks
 * 纯函数，不修改输入、不进行 trim、不补充默认值。
 * 针对 PreparationResult、AgentDecision、ContextLookupRequest、GoalTask 或 MemoryPatch
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
            case "question": {
                checkNonBlank(value.question, [...basePath, "question"], issues, "question");
                break;
            }
            case "task_proposal": {
                checkNonBlank(value.approvalRequest, [...basePath, "approvalRequest"], issues, "approvalRequest");
                if (isRecord(value.task)) {
                    checkNonBlank(value.task.objective, [...basePath, "task", "objective"], issues, "objective");
                    if (Array.isArray(value.task.completionCriteria)) {
                        value.task.completionCriteria.forEach((item, index) => {
                            checkNonBlank(item, [...basePath, "task", "completionCriteria", index], issues, `completionCriteria[${index}]`);
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
        }
    } else {
        if (typeof value.objective === "string") {
            checkNonBlank(value.objective, [...basePath, "objective"], issues, "objective");
            if (Array.isArray(value.completionCriteria)) {
                value.completionCriteria.forEach((item, index) => {
                    checkNonBlank(item, [...basePath, "completionCriteria", index], issues, `completionCriteria[${index}]`);
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
