/**
 * 模型响应解码的公共入口。
 *
 * @remarks
 * 该入口提供文本与原生工具响应解码、阶段输出/身份检查与既有协议错误；不调用
 * Adapter、不读取 Goal、不分配 Runtime Action 身份、不生成 RuntimeFeedback。
 */

export {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
} from "./errors";
export type {
    FailedToolCallShape,
    LLMResponseProtocolErrorDetails,
    LLMResponseProtocolIssue,
} from "./errors";

export {
    extractJsonPayload,
    parseAgentDecision,
    parseJson,
    parseModelOutput,
} from "./model-output";

export {
    assertNativeResponseIdentity,
    classifyDecideResponse,
    decodeCompletionReviewResponse,
    decodeThinkResponse,
    decodeToolCallOutcome,
    nativeResponseMessage,
    normalizeRequestThinkGoal,
    readPublicTextBlocks,
    requireSingleToolCall,
} from "./stage-response";
export type {
    DecideResponseOutcome,
} from "./stage-response";
