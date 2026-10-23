/**
 * 阶段响应的解码与检查。
 *
 * @remarks
 * 本模块只消费 Adapter 返回的最终响应与本次请求提供的契约/声明约束，不读取 Goal
 * 或 Store、不调用 Adapter、不分配 Runtime Action 身份、不生成 RuntimeFeedback。
 * 解码失败的记录由调用方使用同一 callId 完成。
 */

import {
    SystemCompletionReviewDeclaration,
    decodePhaseToolCall,
    isModelAssistantMessage,
    sameNativeIdentity,
    type CompletionReviewResult,
    type DecideOutput,
    type ModelAssistantMessage,
    type NativeConversationIdentity,
    type SystemToolDeclaration,
} from "../../model-contracts/src/index";
import { ContractValidationError } from "../../contracts/src/errors";
import {
    readAssistantText,
    readReasoningText,
    readTextBlocksWithIndex,
    readToolCalls,
    type LLMResponse,
    type LLMToolCall,
} from "../../llm-core/src/index";
import { LLMResponseProtocolError } from "./errors";

/** Decide 响应的形状分级结果：单调用进入既有决策路径，多调用成为顺序批次，零调用且有正文归为 Assistant 消息。 */
export type DecideResponseOutcome =
    | { readonly kind: "call"; readonly call: LLMToolCall }
    | { readonly kind: "batch"; readonly calls: readonly LLMToolCall[] }
    | { readonly kind: "assistant_message"; readonly text: string };

/**
 * 对 Decide 响应做形状分级：单调用、多调用批次、零调用正文或不可用结果。
 *
 * @param response - Adapter 返回的原始响应。
 * @returns 单调用返回唯一 call，多调用返回顺序批次，零调用且有正文返回 Assistant 消息。
 * @throws LLMResponseProtocolError 零调用且无可用正文时抛 `no_usable_result`。
 * @example
 * ```ts
 * const outcome = classifyDecideResponse(response);
 * ```
 */
export function classifyDecideResponse(response: LLMResponse): DecideResponseOutcome {
    const calls = readToolCalls(response);
    if (calls.length === 1) return { kind: "call", call: calls[0]! };
    if (calls.length > 1) return { kind: "batch", calls };
    const content = readAssistantText(response);
    const text = content.trim();
    if (text.length === 0) {
        throw new LLMResponseProtocolError("Model response contains no usable decision", {
            issues: [{
                code: "no_usable_result",
                path: ["toolCalls"],
                message: "Return one declared tool call, or a non-empty text answer.",
            }],
        });
    }
    return { kind: "assistant_message", text: content };
}

/**
 * 要求响应恰好包含一个声明工具调用。
 *
 * @param response - Adapter 返回的原始响应。
 * @returns 唯一调用。
 * @throws LLMResponseProtocolError 缺失或多调用时抛出对应稳定错误码。
 * @example
 * ```ts
 * const call = requireSingleToolCall(response);
 * ```
 */
export function requireSingleToolCall(response: LLMResponse): LLMToolCall {
    const calls = readToolCalls(response);
    if (calls.length !== 1) {
        const code = calls.length === 0 ? "missing_tool_call" : "multiple_tool_calls";
        throw new LLMResponseProtocolError("Model response requires exactly one declared tool call", {
            issues: [{ code, path: ["toolCalls"], message: calls.length === 0
                ? "Call one declared tool; do not return a text JSON decision."
                : "Return exactly one tool call, not multiple calls." }],
        });
    }
    return calls[0]!;
}

/**
 * 把一个声明的工具调用解码为阶段输出。
 *
 * @param toolCall - 模型返回的单个调用。
 * @param declarations - 本次请求暴露的声明集合。
 * @param authorizedToolIds - 本次请求已授权的业务工具 ID；只用于判定参数错误的业务路径。
 * @returns 解码后的阶段输出；业务 `tool_call` 保留契约分配的原始 actionId。
 * @throws LLMResponseProtocolError 参数不是合法 JSON 或不符合声明契约时抛出，
 * 校验失败时附带只含字段名的 `toolCallShape`。
 * @example
 * ```ts
 * const output = decodeToolCallOutcome(call, declarations, ["read_file"]);
 * ```
 */
export function decodeToolCallOutcome(
    toolCall: LLMToolCall,
    declarations: readonly SystemToolDeclaration<unknown>[],
    authorizedToolIds: readonly string[],
): DecideOutput {
    let rawArgs: unknown;
    try {
        rawArgs = JSON.parse(toolCall.argumentsJson);
    } catch (err) {
        throw new LLMResponseProtocolError(
            `Failed to parse arguments JSON for tool call "${toolCall.toolId}": ${(err as Error).message}`,
            {
                cause: err,
                issues: [{
                    code: "invalid_tool_arguments",
                    path: ["arguments"],
                    message: "Tool arguments must contain valid JSON.",
                }],
            },
        );
    }
    const declaration = declarations.find(tool => tool.id === toolCall.toolId);
    try {
        return decodePhaseToolCall(declarations, toolCall.toolId, rawArgs) as DecideOutput;
    } catch (error) {
        throw error instanceof ContractValidationError
            ? new LLMResponseProtocolError(
                `Tool call "${toolCall.toolId}" validation failed: ${error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
                {
                    issues: error.issues.map(i => ({
                        code: i.code,
                        path: authorizedToolIds.includes(toolCall.toolId)
                            ? ["action", "input", ...i.path]
                            : i.path,
                        message: i.message,
                        ...schemaLiteralHint(declaration?.parametersSchema, i.path),
                    })),
                    cause: error,
                    ...(declaration === undefined || rawArgs === null || typeof rawArgs !== "object" || Array.isArray(rawArgs) ? {} : {
                        toolCallShape: {
                            toolId: declaration.id,
                            providedFields: Object.keys(rawArgs),
                            allowedFields: Object.keys(declaration.parametersSchema.properties ?? {}),
                            requiredFields: (declaration.parametersSchema.required ?? []) as readonly string[],
                        },
                    }),
                },
            )
            : error;
    }
}

function schemaLiteralHint(schema: unknown, path: readonly (string | number)[]): { expectedValues?: readonly (string | number | boolean | null)[] } {
    const expectedValues = schemaLiteralsAtPath(schema, path);
    return expectedValues.length === 0 ? {} : { expectedValues };
}

function schemaLiteralsAtPath(schema: unknown, path: readonly (string | number)[]): readonly (string | number | boolean | null)[] {
    if (typeof schema !== "object" || schema === null) return [];
    const node = schema as { anyOf?: unknown[]; enum?: unknown[]; properties?: Record<string, unknown>; items?: unknown };
    if (node.anyOf !== undefined) return node.anyOf.flatMap(branch => schemaLiteralsAtPath(branch, path)).slice(0, 8);
    if (path.length > 0) {
        const [head, ...tail] = path;
        return schemaLiteralsAtPath(typeof head === "number" ? node.items : node.properties?.[head!], tail);
    }
    return (node.enum ?? []).filter((value): value is string | number | boolean | null =>
        value === null || typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.length <= 80)).slice(0, 8);
}

/**
 * 校验原生响应身份与续接数据。
 *
 * @param response - Adapter 返回的原始响应。
 * @param identity - 本次请求期望的原生会话身份。
 * @throws LLMResponseProtocolError 续接缺失、身份不匹配或响应不是合法 Assistant 消息时抛出。
 * @example
 * ```ts
 * assertNativeResponseIdentity(response, adapter.nativeConversationIdentity);
 * ```
 */
export function assertNativeResponseIdentity(
    response: LLMResponse,
    identity: NativeConversationIdentity,
): void {
    if (response.continuation === undefined
        || !sameNativeIdentity(response.continuation.identity, identity)
        || !isModelAssistantMessage(nativeResponseMessage(response))) {
        throw new LLMResponseProtocolError("Invalid native response identity or continuation data");
    }
}

/**
 * 把原生响应投影为可续接的 Assistant 消息。
 *
 * @param response - Adapter 返回的原始响应。
 * @returns 由完整内容块派生、保留续接数据的 Assistant 消息；无工具块时省略 `toolCalls`。
 * @example
 * ```ts
 * const message = nativeResponseMessage(response);
 * ```
 */
/**
 * 读取一次响应中的公开正文块。
 *
 * @remarks
 * 只返回 `plain` 格式的文本块：结构化输出模式的 `json` 文本是协议载荷，不属于
 * 公开过程正文。公开 reasoning 与工具参数分别由 reasoning 块和工具调用块承载，
 * 也不在此返回。
 *
 * @param response - Adapter 返回的原始响应。
 * @returns 按块顺序排列的公开正文块与块下标；没有公开正文时为空数组。
 *
 * @example
 * ```ts
 * const blocks = readPublicTextBlocks(response);
 * ```
 */
export function readPublicTextBlocks(
    response: LLMResponse,
): readonly { readonly index: number; readonly text: string }[] {
    return readTextBlocksWithIndex(response, "plain");
}

/**
 * 把原生响应投影为可续接的 Assistant 消息。
 *
 * @param response - Adapter 返回的原始响应。
 * @returns 由完整内容块派生、保留续接数据的 Assistant 消息；无工具块时省略 `toolCalls`。
 *
 * @example
 * ```ts
 * const message = nativeResponseMessage(response);
 * ```
 */
export function nativeResponseMessage(response: LLMResponse): ModelAssistantMessage {
    const reasoning = readReasoningText(response);
    const toolCalls = readToolCalls(response);
    return {
        role: "assistant", content: readAssistantText(response),
        ...(reasoning === undefined ? {} : { reasoning }),
        ...(toolCalls.length === 0 ? {} : { toolCalls }),
        ...(response.continuation === undefined ? {} : { continuation: response.continuation }),
    };
}

/**
 * 解码并校验 Think 阶段的自由文本输出。
 *
 * @param response - Adapter 返回的原始响应。
 * @returns 去除首尾空白的 Think 文本。
 * @throws LLMResponseProtocolError 包含工具调用或文本为空时抛出。
 * @example
 * ```ts
 * const thought = decodeThinkResponse(response);
 * ```
 */
export function decodeThinkResponse(response: LLMResponse): string {
    if (readToolCalls(response).length > 0) {
        throw new LLMResponseProtocolError("Think stage must not return tool calls");
    }
    const output = readAssistantText(response).trim();
    if (output.length === 0) {
        throw new LLMResponseProtocolError("Think stage returned empty text");
    }
    return output;
}

/**
 * 规范化 `request_think` 控制分支的目标文本。
 *
 * @param output - 已解码的 `request_think` 输出。
 * @returns 去除首尾空白的 Think 目标。
 * @throws LLMResponseProtocolError 目标为空时抛 `blank_think_goal`。
 * @example
 * ```ts
 * const goal = normalizeRequestThinkGoal(output);
 * ```
 */
export function normalizeRequestThinkGoal(output: { readonly goal: string }): string {
    const goal = output.goal.trim();
    if (goal.length === 0) {
        throw new LLMResponseProtocolError("request_think.goal must contain non-whitespace text", {
            issues: [{
                code: "blank_think_goal",
                path: ["goal"],
                message: "Think goal must contain non-whitespace text.",
            }],
        });
    }
    return goal;
}

/**
 * 解码完成审查的最终响应。
 *
 * @param response - Adapter 返回的原始响应。
 * @returns 唯一 `system_review_completion` 调用的接受或拒绝结果。
 * @throws LLMResponseProtocolError 调用数量错误或调用了未声明工具时抛出；
 * JSON 语法与参数契约错误保留原始 `SyntaxError`/`ContractValidationError`。
 * @example
 * ```ts
 * const review = decodeCompletionReviewResponse(response);
 * ```
 */
export function decodeCompletionReviewResponse(response: LLMResponse): CompletionReviewResult {
    const call = requireSingleToolCall(response);
    if (call.toolId !== SystemCompletionReviewDeclaration.id) {
        throw new LLMResponseProtocolError("Completion review returned an undeclared result call");
    }
    try {
        return decodePhaseToolCall([SystemCompletionReviewDeclaration], call.toolId,
            JSON.parse(call.argumentsJson));
    } catch (error) {
        throw error instanceof SyntaxError || error instanceof ContractValidationError
            ? new LLMResponseProtocolError("Completion review response does not match its contract", { cause: error })
            : error;
    }
}
