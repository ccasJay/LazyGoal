import type { z } from "zod";

export const LLM_RESPONSE_PROTOCOL_ERROR_CODE = "INVALID_LLM_RESPONSE" as const;

/** 解析失败时保留的原始原因与可选 Zod 校验问题。 */
export interface LLMResponseProtocolErrorDetails {
    readonly cause?: unknown;
    readonly issues?: readonly z.ZodIssue[];
}

/** 模型原始文本不是合法 JSON，或不符合当前严格领域结果 Schema。 */
export class LLMResponseProtocolError extends Error {
    readonly code = LLM_RESPONSE_PROTOCOL_ERROR_CODE;
    readonly cause?: unknown;
    readonly issues?: readonly z.ZodIssue[];

    constructor(
        message: string,
        details: LLMResponseProtocolErrorDetails = {},
    ) {
        super(`${LLM_RESPONSE_PROTOCOL_ERROR_CODE}: ${message}`);
        this.name = "LLMResponseProtocolError";

        if (details.cause !== undefined) {
            this.cause = details.cause;
        }

        if (details.issues !== undefined) {
            this.issues = details.issues;
        }
    }
}
