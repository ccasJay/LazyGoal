import { z } from "zod";

import type {
    AgentDecision,
} from "../../runtime/src/domain";
import type { PreparationResult } from "../../runtime/src/preparation-executor";
import { LLMResponseProtocolError } from "./errors";
import type { PreparationPhase } from "./model-inference-view";

const nonEmptyText = z.string().trim().min(1);

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

/** AgentDecision 的四分支严格联合协议。 */
export const AgentDecisionSchema = z.discriminatedUnion("kind", [
    ToolCallAgentDecisionSchema,
    CompleteAgentDecisionSchema,
    WaitAgentDecisionSchema,
    FailAgentDecisionSchema,
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
 * @returns 一个包含非空 checkpoint 的 Tool 调用或终止决策。
 * @throws LLMResponseProtocolError 文本不是 JSON、包含协议外字段、分支不匹配
 * 或字段为空时抛出。
 */
export function parseAgentDecision(content: string): AgentDecision {
    const parsed = parseJson(content);
    const result = AgentDecisionSchema.safeParse(parsed);

    if (!result.success) {
        throw new LLMResponseProtocolError(
            "响应不符合 AgentDecision 协议",
            {
                cause: result.error,
                issues: result.error.issues,
            },
        );
    }

    return result.data;
}

/**
 * 按 Goal Preparation 阶段解析模型的严格结构化结果。
 *
 * @param content - Adapter 返回的原始文本。
 * @param phase - 当前准备阶段；决定唯一允许的结果分支。
 * @returns 与阶段匹配的 PreparationResult。
 * @throws LLMResponseProtocolError 文本不是 JSON、包含额外字段，或结果分支与
 * 当前阶段不匹配时抛出。
 */
export function parsePreparationResult(
    content: string,
    phase: PreparationPhase,
): PreparationResult {
    const parsed = parseJson(content);
    const schema = phase === "gathering_context"
        ? GatheringContextPreparationResultSchema
        : PlanningPreparationResultSchema;
    const result = schema.safeParse(parsed);

    if (!result.success) {
        throw new LLMResponseProtocolError(
            `响应不符合 ${phase} PreparationResult 协议`,
            {
                cause: result.error,
                issues: result.error.issues,
            },
        );
    }

    return result.data;
}
