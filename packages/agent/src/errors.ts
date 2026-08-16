import type { z } from "zod";

export const TOOLS_NOT_SUPPORTED_ERROR_CODE = "TOOLS_NOT_SUPPORTED" as const;
export const LLM_RESPONSE_PROTOCOL_ERROR_CODE = "INVALID_LLM_RESPONSE" as const;

/**
 * Profile 请求旧版执行器尚未支持的 Tool Calling。
 * @deprecated LLMStepExecutor 已通过 AgentDecision 接收授权 ToolDefinition；
 * 保留该错误仅供旧调用方识别，不再由当前执行器主动抛出。
 */
export class ToolsNotSupportedError extends Error {
    readonly code = TOOLS_NOT_SUPPORTED_ERROR_CODE;
    readonly toolIds: readonly string[];

    constructor(toolIds: readonly string[]) {
        super(`${TOOLS_NOT_SUPPORTED_ERROR_CODE}: Tool Calling 暂不支持`);
        this.name = "ToolsNotSupportedError";
        this.toolIds = [...toolIds];
    }
}

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
