import type { z } from "zod";

export const TOOLS_NOT_SUPPORTED_ERROR_CODE = "TOOLS_NOT_SUPPORTED" as const;
export const LLM_RESPONSE_PROTOCOL_ERROR_CODE = "INVALID_LLM_RESPONSE" as const;

export class ToolsNotSupportedError extends Error {
    readonly code = TOOLS_NOT_SUPPORTED_ERROR_CODE;
    readonly toolIds: readonly string[];

    constructor(toolIds: readonly string[]) {
        super(`${TOOLS_NOT_SUPPORTED_ERROR_CODE}: Tool Calling 暂不支持`);
        this.name = "ToolsNotSupportedError";
        this.toolIds = [...toolIds];
    }
}

export interface LLMResponseProtocolErrorDetails {
    readonly cause?: unknown;
    readonly issues?: readonly z.ZodIssue[];
}

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
