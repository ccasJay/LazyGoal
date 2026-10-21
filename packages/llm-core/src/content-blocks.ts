/**
 * 完整响应内容块的共享纯读投影。
 *
 * @remarks
 * 本模块只从 {@link LLMResponse.blocks} 派生现有消费者需要的正文、推理与工具视图，
 * 不持有第二份可变状态、不读取 Goal 或 Store、不发起供应商调用。投影保持块顺序，
 * 不隐式 trim、不插入换行，也不把 reasoning 混入正文。
 */

import type { LLMResponse, LLMTextBlockFormat, LLMToolCall } from "./types";

/**
 * 按块顺序读取指定格式的文本块正文。
 *
 * @param response - Adapter 返回的完整响应。
 * @param format - 目标正文格式；`json` 为请求要求的结构化输出。
 * @returns 该格式全部文本块的正文，按块顺序返回；无匹配块时为空数组。
 *
 * @example
 * ```ts
 * const payloads = readTextBlocks(response, "json");
 * ```
 */
export function readTextBlocks(response: LLMResponse, format: LLMTextBlockFormat): readonly string[] {
    return response.blocks.flatMap(block =>
        block.type === "text" && block.format === format ? [block.text] : []);
}

/**
 * 按块顺序连接全部文本块，作为既有正文读视图。
 *
 * @param response - Adapter 返回的完整响应。
 * @returns 正文文本；不包含 reasoning 与工具参数，也不隐式 trim 或插入换行。
 *
 * @example
 * ```ts
 * const content = readAssistantText(response);
 * ```
 */
export function readAssistantText(response: LLMResponse): string {
    return response.blocks.flatMap(block => block.type === "text" ? [block.text] : []).join("");
}

/**
 * 按块顺序连接公开 reasoning 块，作为既有推理读视图。
 *
 * @param response - Adapter 返回的完整响应。
 * @returns reasoning 文本；不隐式插入分隔符；供应商未返回 reasoning 块时返回 `undefined`。
 *
 * @example
 * ```ts
 * const reasoning = readReasoningText(response);
 * ```
 */
export function readReasoningText(response: LLMResponse): string | undefined {
    const texts = response.blocks.flatMap(block => block.type === "reasoning" ? [block.text] : []);
    return texts.length === 0 ? undefined : texts.join("");
}

/**
 * 按块顺序读取工具调用视图。
 *
 * @param response - Adapter 返回的完整响应。
 * @returns 与块顺序一致的工具调用列表；无工具块时为空数组。
 *
 * @example
 * ```ts
 * const [call] = readToolCalls(response);
 * ```
 */
export function readToolCalls(response: LLMResponse): readonly LLMToolCall[] {
    return response.blocks.flatMap(block => block.type === "tool_call"
        ? [{ callId: block.callId, toolId: block.toolId, argumentsJson: block.argumentsJson }]
        : []);
}
