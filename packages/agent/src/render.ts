import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import type {
    ModelInferenceView,
    ModelToolDefinition,
    ModelWorkingContext,
} from "./model-inference-view";
import {
    AGENT_DECISION_PROTOCOL,
    PREPARATION_RESULT_PROTOCOL,
} from "./model-inference-view";
import { resolveGlobalSystemPrompt } from "./global-system-prompt";

/**
 * 只依赖 View DTO 的纯 Prompt Renderer。
 *
 * @remarks
 * 本模块不读取 Runtime State，不产生 I/O，也不修改任何输入对象。它按固定顺序
 * 组装 system → 真实会话 → Working Context 消息；协议文本只按 `PromptContext.phase`
 * 选择，最终消息内容与顺序由 Projector + Renderer 组合保证。
 */

function buildProfileSystemContent(view: ModelInferenceView): string {
    const profile = view.prompt.profile;
    const instructions = profile.instructions.length === 0
        ? "(No additional instructions.)"
        : profile.instructions
            .map((instruction, index) => `${index + 1}. ${instruction}`)
            .join("\n");

    return [
        `Profile System Prompt:\n${profile.systemPrompt}`,
        `Profile Instructions:\n${instructions}`,
    ].join("\n\n");
}

function buildAuthorizedToolsContent(
    tools: readonly ModelToolDefinition[],
): string {
    return [
        "Authorized Tool definitions (only these Tool IDs may be requested):",
        JSON.stringify(tools, null, 2),
    ].join("\n");
}

function protocolFor(view: ModelInferenceView): string {
    return view.prompt.phase === "executing"
        ? AGENT_DECISION_PROTOCOL
        : PREPARATION_RESULT_PROTOCOL[view.prompt.phase];
}

/**
 * 构造 Working Context 控制消息。
 *
 * @param context - 已投影的阶段化 Working Context。
 * @returns 只供本轮请求使用、绝不写入真实消息的 user 消息。
 */
export function renderWorkingContextMessage(
    context: ModelWorkingContext,
): Extract<LLMMessage, { readonly role: "user" }> {
    return {
        role: "user",
        content: JSON.stringify(context, null, 2),
    };
}

/**
 * 将完整 View 渲染为一轮 LLM 请求。
 *
 * @param view - 已投影好的 ModelInferenceView。
 * @returns 按 system → 真实会话 → Working Context 顺序组装的消息列表。
 */
export function renderRequest(view: ModelInferenceView): LLMRequest {
    const protocol = protocolFor(view);
    const globalSystemPrompt = resolveGlobalSystemPrompt(
        view.prompt.promptBundleVersion,
    );

    return {
        messages: [
            {
                role: "system",
                content: [
                    `Global Overview:\n${globalSystemPrompt}`,
                    buildProfileSystemContent(view),
                    `Active Phase Protocol:\n${protocol}`,
                    buildAuthorizedToolsContent(view.prompt.authorizedTools),
                ].join("\n\n"),
            },
            ...view.conversation.map((message) => ({
                role: message.role,
                content: message.content,
            })),
            renderWorkingContextMessage(view.workingContext),
        ],
    };
}
