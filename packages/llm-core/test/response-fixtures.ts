/**
 * 测试与离线示例共享的完整响应块构造。
 *
 * @remarks
 * 只构造当前 `blocks` 契约下的确定性响应；不识别、不兼容任何旧响应字段。
 * 块索引按给定顺序从 0 连续分配，与生产 Adapter 的归一化规则一致。
 */

import type {
    LLMContentBlock,
    LLMResponse,
    LLMTextBlockFormat,
    LLMToolCall,
} from "../src/index";

/** 尚未分配索引的块草稿；构造后由 {@link blockResponse} 填入连续索引。 */
export type ContentBlockDraft =
    | { readonly type: "text"; readonly text: string; readonly format?: LLMTextBlockFormat }
    | { readonly type: "reasoning"; readonly text: string; readonly source?: "reasoning_content" | "thought" }
    | { readonly type: "tool_call"; readonly callId: string; readonly toolId: string; readonly argumentsJson: string };

/** 构造按给定顺序索引的完整内容块。 */
export function contentBlocks(...drafts: readonly ContentBlockDraft[]): readonly LLMContentBlock[] {
    return drafts.map((draft, index): LLMContentBlock => {
        switch (draft.type) {
            case "text":
                return { index, type: "text", format: draft.format ?? "plain", text: draft.text };
            case "reasoning":
                return { index, type: "reasoning", ...(draft.source === undefined ? {} : { source: draft.source }), text: draft.text };
            case "tool_call":
                return {
                    index, type: "tool_call", callId: draft.callId,
                    toolId: draft.toolId, argumentsJson: draft.argumentsJson,
                };
        }
    });
}

/** 构造只含给定正文块的完整响应。 */
export function textResponse(text: string, format: LLMTextBlockFormat = "plain"): LLMResponse {
    return { blocks: contentBlocks({ type: "text", text, format }) };
}

/** 构造按给定顺序索引块的完整响应；空草稿列表产生无内容块响应。 */
export function blockResponse(...drafts: readonly ContentBlockDraft[]): LLMResponse {
    return { blocks: contentBlocks(...drafts) };
}

/** 构造只含单个工具调用块的完整响应。 */
export function toolCallResponse(call: LLMToolCall): LLMResponse {
    return blockResponse({ type: "tool_call", ...call });
}
