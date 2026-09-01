import { z } from "zod";
import type { LLMRequest } from "../../llm/src/core/types";

import type {
    AgentDecision,
    MemoryProtocol,
    ModelContextProtocol,
} from "../../runtime/src/domain";
import {
    CONTEXT_LOOKUP_MAX_FILTER_ITEMS,
    CONTEXT_LOOKUP_MAX_QUESTION_LENGTH,
} from "../../runtime/src/context-retrieval";
import type { PreparationResult } from "../../runtime/src/preparation-executor";
import { LLMResponseProtocolError } from "./errors";
import type { PreparationPhase } from "./model-inference-view";

const nonEmptyText = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();

const contextLookupStringList = z.array(nonEmptyText).max(CONTEXT_LOOKUP_MAX_FILTER_ITEMS);
const contextLookupIntegerList = z.array(nonNegativeInteger).max(CONTEXT_LOOKUP_MAX_FILTER_ITEMS);
const ContextLookupFiltersSchema = z.object({
    eventTypes: contextLookupStringList.optional(),
    toolIds: contextLookupStringList.optional(),
    actionIds: contextLookupStringList.optional(),
    stepIndexes: contextLookupIntegerList.optional(),
    paths: contextLookupStringList.optional(),
    errorCodes: contextLookupStringList.optional(),
    objectIds: contextLookupStringList.optional(),
    sequenceRange: z.object({
        from: nonNegativeInteger,
        to: nonNegativeInteger,
    }).strict().optional(),
}).strict().superRefine((filters, context) => {
    if (
        filters.sequenceRange !== undefined
        && filters.sequenceRange.to < filters.sequenceRange.from
    ) {
        context.addIssue({ code: "custom", message: "sequenceRange must not be inverted" });
    }
});

/** Agent 请求查询 committed Trajectory 历史的严格 Schema。 */
export const ContextLookupRequestSchema = z.object({
    kind: z.literal("context_lookup"),
    need: z.enum(["conversation_history", "historical_execution", "decision_rationale"]),
    question: z.string().trim().min(1).max(CONTEXT_LOOKUP_MAX_QUESTION_LENGTH),
    filters: ContextLookupFiltersSchema.optional(),
}).strict();

const memoryEntryStatus = z.enum(["active", "resolved", "superseded"]);
const memoryEntryScope = z.enum(["goal", "phase"]);
const planItemStatus = z.enum(["pending", "active", "completed", "blocked", "superseded"]);
const stringIds = z.array(nonEmptyText);

const UpsertFactOperationSchema = z.object({
    type: z.literal("upsert_fact"),
    fact: z.object({
        subject: nonEmptyText,
        predicate: nonEmptyText,
        value: z.json(),
        stability: z.enum(["stable", "last_observed"]),
        evidenceSequences: z.array(positiveInteger),
        scope: memoryEntryScope.optional(),
    }).strict(),
}).strict();

const RetireFactOperationSchema = z.object({
    type: z.literal("retire_fact"),
    fact: z.object({
        id: nonEmptyText,
        evidenceSequences: z.array(positiveInteger),
    }).strict(),
}).strict();

const CreateHypothesisOperationSchema = z.object({
    type: z.literal("create_hypothesis"),
    hypothesis: z.object({
        statement: nonEmptyText,
        scope: memoryEntryScope.optional(),
    }).strict(),
}).strict();

const UpdateHypothesisOperationSchema = z.object({
    type: z.literal("update_hypothesis"),
    hypothesis: z.object({
        id: nonEmptyText,
        statement: nonEmptyText.optional(),
        status: memoryEntryStatus.optional(),
    }).strict().refine(
        (value) => value.statement !== undefined || value.status !== undefined,
        "update_hypothesis must change at least one field",
    ),
}).strict();

const CreatePlanItemOperationSchema = z.object({
    type: z.literal("create_plan_item"),
    planItem: z.object({
        description: nonEmptyText,
        status: z.enum(["pending", "active", "blocked"]).optional(),
        dependsOnFactIds: stringIds.optional(),
        dependsOnPlanItemIds: stringIds.optional(),
    }).strict(),
}).strict();

const UpdatePlanItemOperationSchema = z.object({
    type: z.literal("update_plan_item"),
    planItem: z.object({
        id: nonEmptyText,
        description: nonEmptyText.optional(),
        status: planItemStatus.optional(),
        dependsOnFactIds: stringIds.optional(),
        dependsOnPlanItemIds: stringIds.optional(),
        completionEvidenceSequences: z.array(positiveInteger).optional(),
    }).strict().refine(
        (value) => Object.keys(value).some((key) => key !== "id"),
        "update_plan_item must change at least one field",
    ),
}).strict();

const CreateBlockerOperationSchema = z.object({
    type: z.literal("create_blocker"),
    blocker: z.object({
        description: nonEmptyText,
        scope: memoryEntryScope.optional(),
    }).strict(),
}).strict();

const UpdateBlockerOperationSchema = z.object({
    type: z.literal("update_blocker"),
    blocker: z.object({
        id: nonEmptyText,
        description: nonEmptyText.optional(),
        status: memoryEntryStatus.optional(),
    }).strict().refine(
        (value) => value.description !== undefined || value.status !== undefined,
        "update_blocker must change at least one field",
    ),
}).strict();

/** Structured Agent/Preparation 响应可携带的严格 Memory Patch Schema。 */
export const MemoryPatchSchema = z.object({
    protocolVersion: z.literal(1),
    operations: z.array(z.discriminatedUnion("type", [
        UpsertFactOperationSchema,
        RetireFactOperationSchema,
        CreateHypothesisOperationSchema,
        UpdateHypothesisOperationSchema,
        CreatePlanItemOperationSchema,
        UpdatePlanItemOperationSchema,
        CreateBlockerOperationSchema,
        UpdateBlockerOperationSchema,
    ])),
}).strict();

/** Structured complete Decision 的完成标准证据引用 Schema。 */
export const CompletionEvidenceSchema = z.object({
    criterionIndex: nonNegativeInteger,
    evidenceSequences: z.array(positiveInteger),
}).strict();

/** Agent 请求 Runtime 执行 Tool 时使用的严格 Action Schema。 */
export const ToolCallActionSchema = z.object({
    actionId: nonEmptyText,
    toolId: nonEmptyText,
    input: z.json(),
}).strict();

/** Agent 的 Tool 调用决策分支。 */
export const ToolCallAgentDecisionSchema = z.object({
    kind: z.literal("tool_call"),
    checkpoint: nonEmptyText,
    action: ToolCallActionSchema,
}).strict();

/** Agent 的完成决策分支。 */
export const CompleteAgentDecisionSchema = z.object({
    kind: z.literal("complete"),
    checkpoint: nonEmptyText,
    summary: nonEmptyText,
}).strict();

/** Agent 的等待决策分支。 */
export const WaitAgentDecisionSchema = z.object({
    kind: z.literal("wait"),
    checkpoint: nonEmptyText,
    reason: nonEmptyText,
}).strict();

/** Agent 的主动失败决策分支。 */
export const FailAgentDecisionSchema = z.object({
    kind: z.literal("fail"),
    checkpoint: nonEmptyText,
    error: nonEmptyText,
}).strict();

/** legacy AgentDecision 的四分支严格联合协议。 */
export const AgentDecisionSchema = z.discriminatedUnion("kind", [
    ToolCallAgentDecisionSchema,
    CompleteAgentDecisionSchema,
    WaitAgentDecisionSchema,
    FailAgentDecisionSchema,
]);

/** Structured Agent 的 Tool 调用决策 Schema，不再携带 checkpoint。 */
export const StructuredToolCallAgentDecisionSchema = z.object({
    kind: z.literal("tool_call"),
    action: ToolCallActionSchema,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** Structured Agent 的完成决策 Schema。 */
export const StructuredCompleteAgentDecisionSchema = z.object({
    kind: z.literal("complete"),
    summary: nonEmptyText,
    completionEvidence: z.array(CompletionEvidenceSchema),
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** Structured Agent 的等待决策 Schema。 */
export const StructuredWaitAgentDecisionSchema = z.object({
    kind: z.literal("wait"),
    reason: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** Structured Agent 的失败决策 Schema。 */
export const StructuredFailAgentDecisionSchema = z.object({
    kind: z.literal("fail"),
    error: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** v2 Context Epoch 检查点结果；禁止携带 Epoch 编号或边界。 */
export const ModelContextCheckpointResultSchema = z.object({
    kind: z.literal("context_checkpoint"),
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** 判断最终控制消息是否要求模型仅返回 Context Epoch 检查点。 */
export function requestRequiresContextCheckpoint(
    request: Pick<LLMRequest, "messages">,
): boolean {
    const message = request.messages.at(-1);
    if (message === undefined || message.role !== "user") return false;
    try {
        const payload = JSON.parse(message.content) as {
            readonly contextEpoch?: {
                readonly control?: { readonly status?: unknown };
            };
        };
        return payload.contextEpoch?.control?.status === "checkpoint_required";
    } catch {
        return false;
    }
}

/** Structured Context Lookup 的独占 AgentDecision 分支。 */
export const StructuredContextLookupAgentDecisionSchema = ContextLookupRequestSchema;

/** Structured `structured@1` AgentDecision 的严格联合 Schema。 */
export const StructuredAgentDecisionSchema = z.discriminatedUnion("kind", [
    StructuredToolCallAgentDecisionSchema,
    StructuredCompleteAgentDecisionSchema,
    StructuredWaitAgentDecisionSchema,
    StructuredFailAgentDecisionSchema,
    StructuredContextLookupAgentDecisionSchema,
    ModelContextCheckpointResultSchema,
]);

export const QuestionPreparationResultSchema = z.object({
    kind: z.literal("question"),
    question: nonEmptyText,
}).strict();

export const ContextReadyPreparationResultSchema = z.object({
    kind: z.literal("context_ready"),
}).strict();

export const TaskProposalPreparationResultSchema = z.object({
    kind: z.literal("task_proposal"),
    task: z.object({
        objective: nonEmptyText,
        completionCriteria: z.array(nonEmptyText),
    }).strict(),
    approvalRequest: nonEmptyText,
}).strict();

export const GatheringContextPreparationResultSchema = z.discriminatedUnion(
    "kind",
    [
        QuestionPreparationResultSchema,
        ContextReadyPreparationResultSchema,
    ],
);

export const PlanningPreparationResultSchema =
    TaskProposalPreparationResultSchema;

/** Structured gathering_context 结果 Schema，允许同轮 Memory Patch。 */
export const StructuredQuestionPreparationResultSchema = z.object({
    kind: z.literal("question"),
    question: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** Structured context_ready 结果 Schema，允许同轮 Memory Patch。 */
export const StructuredContextReadyPreparationResultSchema = z.object({
    kind: z.literal("context_ready"),
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** Structured gathering_context/planning 的独占 Context Lookup 分支。 */
export const StructuredContextLookupPreparationResultSchema = ContextLookupRequestSchema;

/** Structured gathering_context 结果联合 Schema。 */
export const StructuredGatheringContextPreparationResultSchema = z.discriminatedUnion(
    "kind",
    [
        StructuredQuestionPreparationResultSchema,
        StructuredContextReadyPreparationResultSchema,
        StructuredContextLookupPreparationResultSchema,
        ModelContextCheckpointResultSchema,
    ],
);

/** Structured planning 结果 Schema，允许同轮 Memory Patch。 */
export const StructuredTaskProposalPreparationResultSchema = z.object({
    kind: z.literal("task_proposal"),
    task: z.object({
        objective: nonEmptyText,
        completionCriteria: z.array(nonEmptyText),
    }).strict(),
    approvalRequest: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** Structured planning 结果联合 Schema。 */
export const StructuredPlanningPreparationResultSchema =
    z.union([
        StructuredTaskProposalPreparationResultSchema,
        StructuredContextLookupPreparationResultSchema,
        ModelContextCheckpointResultSchema,
    ]);

export type { PreparationPhase } from "./model-inference-view";

function parseJson(content: string): unknown {
    try {
        return JSON.parse(content);
    } catch (error) {
        throw new LLMResponseProtocolError("响应不是合法 JSON", {
            cause: error,
        });
    }
}

/**
 * 解析 LLM 返回的严格 AgentDecision。
 *
 * @param content - Adapter 返回的原始文本。
 * @param protocol - Goal 创建时冻结的 Memory 协议；省略时按 legacy checkpoint@1 解析。
 * @returns 与冻结协议匹配的 Tool 调用或终止决策。
 * @throws LLMResponseProtocolError 文本不是 JSON、包含协议外字段、分支不匹配
 * 或字段为空时抛出。
 */
export function parseAgentDecision(
    content: string,
    protocol: MemoryProtocol = { kind: "checkpoint", version: 1 },
    modelContextProtocol: ModelContextProtocol = { kind: "conversation", version: 1 },
): AgentDecision {
    const parsed = parseJson(content);
    const schema = protocol.kind === "structured"
        ? StructuredAgentDecisionSchema
        : AgentDecisionSchema;
    const result = schema.safeParse(parsed);

    if (!result.success) {
        throw new LLMResponseProtocolError(
            `响应不符合 ${protocol.kind} AgentDecision 协议`,
            {
                cause: result.error,
                issues: result.error.issues,
            },
        );
    }

    if (
        (result.data as { kind?: unknown }).kind === "context_checkpoint"
        && (modelContextProtocol.kind !== "trajectory-layered" || modelContextProtocol.version !== 2)
    ) {
        throw new LLMResponseProtocolError(
            "响应包含仅允许 trajectory-layered@2 的 context_checkpoint",
        );
    }

    return result.data as AgentDecision;
}

/**
 * 按 Goal Preparation 阶段解析模型的严格结构化结果。
 *
 * @param content - Adapter 返回的原始文本。
 * @param phase - 当前准备阶段；决定唯一允许的结果分支。
 * @param protocol - Goal 创建时冻结的 Memory 协议；省略时按 legacy checkpoint@1 解析。
 * @returns 与阶段匹配的 PreparationResult。
 * @throws LLMResponseProtocolError 文本不是 JSON、包含额外字段，或结果分支与
 * 当前阶段不匹配时抛出。
 */
export function parsePreparationResult(
    content: string,
    phase: PreparationPhase,
    protocol: MemoryProtocol = { kind: "checkpoint", version: 1 },
    modelContextProtocol: ModelContextProtocol = { kind: "conversation", version: 1 },
): PreparationResult {
    const parsed = parseJson(content);
    const schema = protocol.kind === "structured"
        ? phase === "gathering_context"
            ? StructuredGatheringContextPreparationResultSchema
            : StructuredPlanningPreparationResultSchema
        : phase === "gathering_context"
            ? GatheringContextPreparationResultSchema
            : PlanningPreparationResultSchema;
    const result = schema.safeParse(parsed);

    if (!result.success) {
        throw new LLMResponseProtocolError(
            `响应不符合 ${protocol.kind} ${phase} PreparationResult 协议`,
            {
                cause: result.error,
                issues: result.error.issues,
            },
        );
    }

    if (
        (result.data as { kind?: unknown }).kind === "context_checkpoint"
        && (modelContextProtocol.kind !== "trajectory-layered" || modelContextProtocol.version !== 2)
    ) {
        throw new LLMResponseProtocolError(
            "响应包含仅允许 trajectory-layered@2 的 context_checkpoint",
        );
    }

    return result.data as PreparationResult;
}
