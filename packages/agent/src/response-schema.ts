import { z } from "zod";

import type { StepResult } from "../../runtime/src/domain";
import type { PreparationResult } from "../../runtime/src/preparation-executor";
import { LLMResponseProtocolError } from "./errors";

const nonEmptyText = z.string().trim().min(1);

export const ContinueStepResultSchema = z.object({
    kind: z.literal("continue"),
    summary: nonEmptyText,
}).strict();

export const WaitStepResultSchema = z.object({
    kind: z.literal("wait"),
    reason: nonEmptyText,
}).strict();

export const CompleteStepResultSchema = z.object({
    kind: z.literal("complete"),
    summary: nonEmptyText,
}).strict();

export const FailStepResultSchema = z.object({
    kind: z.literal("fail"),
    error: nonEmptyText,
}).strict();

export const StepResultSchema = z.discriminatedUnion("kind", [
    ContinueStepResultSchema,
    WaitStepResultSchema,
    CompleteStepResultSchema,
    FailStepResultSchema,
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

export type PreparationPhase = "gathering_context" | "planning";

function parseJson(content: string): unknown {
    try {
        return JSON.parse(content);
    } catch (error) {
        throw new LLMResponseProtocolError("响应不是合法 JSON", {
            cause: error,
        });
    }
}

export function parseStepResult(content: string): StepResult {
    const parsed = parseJson(content);

    const result = StepResultSchema.safeParse(parsed);

    if (!result.success) {
        throw new LLMResponseProtocolError("响应不符合 StepResult 协议", {
            cause: result.error,
            issues: result.error.issues,
        });
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
