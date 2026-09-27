import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import type {
    ModelInferenceView,
    ModelTrajectoryContext,
    ModelWorkingContext,
    ModelContextLookupResult,
    ModelContextEpochView,
} from "./model-inference-view";
import type { PromptBundleRenderer } from "./prompting/types";
import type { DynamicSectionUpdateMessage } from "./prompting/dynamic-section-diff";

/**
 * 只依赖 View DTO 与注入 Renderer 的纯 Prompt 请求组装。
 *
 * @remarks
 * 本模块不读取 Runtime State，不产生 I/O，也不修改任何输入对象。固定 system 消息由
 * 注入的 `PromptBundleRenderer` 依据 `PromptContext` 生成；动态状态按 section 独立
 * 渲染；真实会话与 Working Context 不进入模板环境。Trajectory Context 作为本轮
 * 控制消息的独立字段追加。
 */

/**
 * 构造 Working Context 控制消息。
 *
 * @param context - 已投影的阶段化 Working Context。
 * @param trajectoryContext - trajectory-layered@1 的即时 Hot/Warm。
 * @param contextLookupResult - 上一轮已提交的历史 Lookup 结果；没有结果时省略。
 * @param contextEpoch - 可选的 Context Epoch 视图。
 * @param responseShapeGuide - 可选的 prompt-only 结构指引文本；strict 模式时完全省略。
 * @returns 只供本轮请求使用、绝不写入真实消息的 user 消息。
 */
export function renderWorkingContextMessage(
    context: ModelWorkingContext,
    trajectoryContext?: ModelTrajectoryContext,
    contextLookupResult?: ModelContextLookupResult,
    contextEpoch?: ModelContextEpochView,
    responseShapeGuide?: string,
): Extract<LLMMessage, { readonly role: "user" }> {
    return {
        role: "user",
        content: JSON.stringify(createWorkingContextPayload(
            context,
            trajectoryContext,
            contextLookupResult,
            contextEpoch,
            responseShapeGuide,
        ), null, 2),
    };
}

function createWorkingContextPayload(
    context: ModelWorkingContext,
    trajectoryContext?: ModelTrajectoryContext,
    contextLookupResult?: ModelContextLookupResult,
    contextEpoch?: ModelContextEpochView,
    responseShapeGuide?: string,
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        phase: "executing",
        execution: context.execution,
    };

    if (trajectoryContext !== undefined) {
        payload.trajectoryContext = {
            hot: trajectoryContext.hot,
            ...(trajectoryContext.warm.length > 0 ? { warm: trajectoryContext.warm } : {}),
        };
    }

    if (contextLookupResult !== undefined) {
        payload.contextLookupResult = contextLookupResult;
    }

    if (contextEpoch?.control.status === "checkpoint_required") {
        payload.checkpointRequired = true;
        payload.checkpointReason = contextEpoch.control.reason ?? "input_threshold";
    }

    if (responseShapeGuide !== undefined) {
        payload.responseShapeGuide = responseShapeGuide;
    }

    return payload;
}

function renderViewWorkingContextMessage(
    view: ModelInferenceView,
    responseShapeGuide?: string,
): Extract<LLMMessage, { readonly role: "user" }> {
    return {
        role: "user",
        content: JSON.stringify(createWorkingContextPayload(
            view.workingContext,
            view.trajectoryContext,
            view.contextLookupResult,
            view.contextEpoch,
            responseShapeGuide,
        ), null, 2),
    };
}

/**
 * 将完整 View 渲染为一轮 LLM 请求。
 *
 * @remarks
 * 使用注入的 `PromptBundleRenderer` 生成固定 system 消息；随后按原样追加真实
 * Conversation、带身份/来源的动态 section，以及 JSON Working Context 控制消息。
 *
 * @param view - 已投影好的 ModelInferenceView。
 * @param renderer - 由 Composition Root 创建并与 Executor 共享的 Bundle Renderer。
 * @param responseShapeGuide - 可选的 prompt-only 结构指引文本；strict 模式时省略。
 * @returns 按固定 system → 真实会话 → 动态 section → Working Context 顺序组装的消息列表。
 * @throws 渲染失败时抛出。
 */
export function renderRequest(
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
    responseShapeGuide?: string,
    dynamicSections?: readonly DynamicSectionUpdateMessage[],
    stageMessages: readonly LLMMessage[] = [],
): LLMRequest {
    return {
        messages: [
            {
                role: "system",
                content: renderer.render(view.prompt),
            },
            ...view.conversation.map((message) => ({
                role: message.role,
                content: message.content,
            })),
            ...stageMessages,
            ...(dynamicSections ?? renderer.renderDynamicSections(view)).map((section) => ({
                role: section.role,
                content: section.content,
            })),
            renderViewWorkingContextMessage(view, responseShapeGuide),
        ],
    };
}
