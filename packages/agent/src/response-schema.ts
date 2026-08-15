import { z } from "zod";

import type { StepResult } from "../../runtime/src/domain";
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

export function parseStepResult(content: string): StepResult {
    let parsed: unknown;

    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new LLMResponseProtocolError("响应不是合法 JSON", {
            cause: error,
        });
    }

    const result = StepResultSchema.safeParse(parsed);

    if (!result.success) {
        throw new LLMResponseProtocolError("响应不符合 StepResult 协议", {
            cause: result.error,
            issues: result.error.issues,
        });
    }

    return result.data;
}
