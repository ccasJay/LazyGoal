import { contract } from "../../../contracts/src/index";
import { browserNonEmptyStringContract } from "./common";

/** 模型输入消息的独立 wire 传输结构。 */
export const browserModelInputMessageWireContract = contract.openObject({
    role: contract.enum(["system", "user", "assistant", "tool"] as const),
    content: contract.string(),
    source: contract.enum([
        "system",
        "conversation",
        "section",
        "working_context",
        "stage",
        "request",
        "native_history",
    ] as const),
    reasoning: contract.optional(contract.string()),
    toolCalls: contract.optional(contract.array(contract.openObject({
        callId: browserNonEmptyStringContract,
        toolId: browserNonEmptyStringContract,
        argumentsJson: contract.string(),
    }))),
    continuation: contract.optional(contract.unknown()),
    callId: contract.optional(browserNonEmptyStringContract),
    toolId: contract.optional(browserNonEmptyStringContract),
});

/** 模型输入的调用身份字段。 */
const browserModelInputIdentityShape = {
    goalId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    callId: browserNonEmptyStringContract,
    executionUnitId: contract.optional(browserNonEmptyStringContract),
    stepIndex: contract.integer({ minimum: 1 }),
    stage: contract.enum(["think", "decide", "completion_review"] as const),
    occurredAt: contract.string(),
} as const;

/** 完整模型输入调用的 wire 记录。 */
export const browserModelInputRecordWireContract = contract.openObject({
    ...browserModelInputIdentityShape,
    messages: contract.array(browserModelInputMessageWireContract),
});

/** 模型输入预览消息。 */
export const browserModelInputPreviewMessageContract = contract.openObject({
    role: contract.enum(["system", "user", "assistant", "tool"] as const),
    source: contract.enum([
        "system",
        "conversation",
        "section",
        "working_context",
        "stage",
        "request",
        "native_history",
    ] as const),
    index: contract.integer({ minimum: 0 }),
    preview: contract.string(),
    truncated: contract.boolean(),
});

/** 模型输入摘要传输对象（用于调用列表展示）。 */
export const browserModelInputSummaryContract = contract.openObject({
    ...browserModelInputIdentityShape,
    systemVersion: contract.string(),
    systemChanged: contract.boolean(),
    firstSystem: contract.boolean(),
    previousCallId: contract.nullable(browserNonEmptyStringContract),
    messages: contract.array(browserModelInputPreviewMessageContract),
    omittedMessageCount: contract.integer({ minimum: 0 }),
});

/** 完整模型输入调用详情（用于只读比对）。 */
export const browserModelInputDetailContract = contract.openObject({
    call: browserModelInputRecordWireContract,
    previousSystem: contract.nullable(contract.string()),
    previousCallId: contract.nullable(browserNonEmptyStringContract),
    systemVersion: contract.string(),
});

/** 模型输入列表响应。 */
export const browserModelInputsContract = contract.openObject({
    calls: contract.array(browserModelInputSummaryContract),
    total: contract.integer({ minimum: 0 }),
    nextOffset: contract.nullable(contract.integer({ minimum: 0 })),
});

/** 本模块建立的模型输入合同。 */
export const modelInputWebContracts = [
    browserModelInputMessageWireContract,
    browserModelInputRecordWireContract,
    browserModelInputPreviewMessageContract,
    browserModelInputSummaryContract,
    browserModelInputDetailContract,
    browserModelInputsContract,
] as const;
