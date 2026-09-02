import { z } from "zod";
import type { LLMRequest } from "../../llm/src/core/types";

import type {
    AgentDecision,
} from "../../runtime/src/domain";
import type { PreparationResult } from "../../runtime/src/preparation-executor";
import {
    CONTEXT_LOOKUP_MAX_FILTER_ITEMS,
    CONTEXT_LOOKUP_MAX_QUESTION_LENGTH,
} from "../../runtime/src/context-retrieval";
import { LLMResponseProtocolError } from "./errors";
import type { PreparationPhase } from "./model-inference-view";

export type { PreparationPhase } from "./model-inference-view";

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

/** Agent 请求 Runtime 查询 committed Trajectory 历史的严格 Schema。 */
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

/** 当前 Agent 的 Tool 调用决策分支。 */
export const ToolCallAgentDecisionSchema = z.object({
    kind: z.literal("tool_call"),
    action: ToolCallActionSchema,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** 当前 Agent 的完成决策分支。 */
export const CompleteAgentDecisionSchema = z.object({
    kind: z.literal("complete"),
    summary: nonEmptyText,
    completionEvidence: z.array(CompletionEvidenceSchema),
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** 当前 Agent 的等待决策分支。 */
export const WaitAgentDecisionSchema = z.object({
    kind: z.literal("wait"),
    reason: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** 当前 Agent 的主动失败决策分支。 */
export const FailAgentDecisionSchema = z.object({
    kind: z.literal("fail"),
    error: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** Context Epoch 到达边界时的独占检查点结果。 */
export const ModelContextCheckpointResultSchema = z.object({
    kind: z.literal("context_checkpoint"),
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** 当前唯一 AgentDecision 协议的严格联合 Schema。 */
export const AgentDecisionSchema = z.discriminatedUnion("kind", [
    ToolCallAgentDecisionSchema,
    CompleteAgentDecisionSchema,
    WaitAgentDecisionSchema,
    FailAgentDecisionSchema,
    ContextLookupRequestSchema,
    ModelContextCheckpointResultSchema,
]);

/** gathering_context 阶段的提问结果。 */
export const QuestionPreparationResultSchema = z.object({
    kind: z.literal("question"),
    question: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** gathering_context 阶段的上下文完成结果。 */
export const ContextReadyPreparationResultSchema = z.object({
    kind: z.literal("context_ready"),
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** planning 阶段的任务提案结果。 */
export const TaskProposalPreparationResultSchema = z.object({
    kind: z.literal("task_proposal"),
    task: z.object({
        objective: nonEmptyText,
        completionCriteria: z.array(nonEmptyText),
    }).strict(),
    approvalRequest: nonEmptyText,
    memoryPatch: MemoryPatchSchema.optional(),
}).strict();

/** 当前 gathering_context 阶段允许的 PreparationResult 联合 Schema。 */
export const GatheringContextPreparationResultSchema = z.discriminatedUnion(
    "kind",
    [
        QuestionPreparationResultSchema,
        ContextReadyPreparationResultSchema,
        ContextLookupRequestSchema,
        ModelContextCheckpointResultSchema,
    ],
);

/** 当前 planning 阶段允许的 PreparationResult 联合 Schema。 */
export const PlanningPreparationResultSchema = z.union([
    TaskProposalPreparationResultSchema,
    ContextLookupRequestSchema,
    ModelContextCheckpointResultSchema,
]);

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

function parseJson(content: string): unknown {
    const normalizedContent = normalizeJsonContent(content);
    try {
        return JSON.parse(normalizedContent);
    } catch (error) {
        throw new LLMResponseProtocolError("响应不是合法 JSON", {
            cause: error,
        });
    }
}

/** 只移除完整 JSON fenced code block 的 Markdown 包裹，不提取任意文本中的 JSON。 */
function normalizeJsonContent(content: string): string {
    const trimmed = content.trim();
    const match = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/iu.exec(trimmed);
    return match?.[1]?.trim() ?? trimmed;
}

/**
 * 解析当前唯一 AgentDecision 协议。
 *
 * @param content - Adapter 返回的原始文本；支持原始 JSON 或完整 JSON fenced code block。
 * @returns 与当前结构化协议匹配的 AgentDecision。
 * @throws LLMResponseProtocolError 文本不是合法 JSON 或包含协议外字段时抛出。
 */
export function parseAgentDecision(content: string): AgentDecision {
    const result = AgentDecisionSchema.safeParse(parseJson(content));

    if (!result.success) {
        throw new LLMResponseProtocolError(
            "响应不符合 structured AgentDecision 协议",
            {
                cause: result.error,
                issues: result.error.issues,
            },
        );
    }

    return result.data as AgentDecision;
}

/**
 * 按 Preparation 阶段解析当前唯一结构化结果。
 *
 * @param content - Adapter 返回的原始文本；支持原始 JSON 或完整 JSON fenced code block。
 * @param phase - 当前准备阶段；决定唯一允许的结果分支。
 * @returns 与阶段匹配的 PreparationResult。
 * @throws LLMResponseProtocolError 文本不是合法 JSON 或结果分支与阶段不匹配时抛出。
 */
export function parsePreparationResult(
    content: string,
    phase: PreparationPhase,
): PreparationResult {
    const schema = phase === "gathering_context"
        ? GatheringContextPreparationResultSchema
        : PlanningPreparationResultSchema;
    const result = schema.safeParse(parseJson(content));

    if (!result.success) {
        throw new LLMResponseProtocolError(
            `响应不符合 structured ${phase} PreparationResult 协议`,
            {
                cause: result.error,
                issues: result.error.issues,
            },
        );
    }

    return result.data as PreparationResult;
}
