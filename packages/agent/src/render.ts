import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import type {
    ModelInferenceView,
    ModelTrajectoryContext,
    ModelWorkingMemory,
    ModelWorkingContext,
} from "./model-inference-view";
import type { PromptBundleRenderer } from "./prompting/types";

/**
 * 只依赖 View DTO 与注入 Renderer 的纯 Prompt 请求组装。
 *
 * @remarks
 * 本模块不读取 Runtime State，不产生 I/O，也不修改任何输入对象。system 消息由
 * 注入的 `PromptBundleRenderer` 依据 `PromptContext` 生成；真实会话与 Working
 * Context 只作为原始消息追加，绝不进入模板环境。分层协议的 Trajectory
 * Context 也作为本轮控制消息的独立字段追加；legacy View 未提供该字段时输出
 * 保持原有结构。
 */

/**
 * 构造 Working Context 控制消息。
 *
 * @param context - 已投影的阶段化 Working Context。
 * @param workingMemory - structured@1 的即时 Memory；legacy 时省略。
 * @param trajectoryContext - trajectory-layered@1 的即时 Hot/Warm；legacy 时省略。
 * @returns 只供本轮请求使用、绝不写入真实消息的 user 消息。
 */
export function renderWorkingContextMessage(
    context: ModelWorkingContext,
    workingMemory?: ModelWorkingMemory,
    trajectoryContext?: ModelTrajectoryContext,
): Extract<LLMMessage, { readonly role: "user" }> {
    const payload = {
        ...context,
        ...(workingMemory === undefined ? {} : { workingMemory }),
        ...(trajectoryContext === undefined ? {} : { trajectoryContext }),
    };

    return {
        role: "user",
        content: JSON.stringify(payload, null, 2),
    };
}

/**
 * 将完整 View 渲染为一轮 LLM 请求。
 *
 * @remarks
 * 使用注入的 `PromptBundleRenderer` 依据 `view.prompt` 中的冻结 Bundle 版本与当前
 * Phase 生成唯一一条 system 消息；随后按原样追加真实 Conversation，最后追加 JSON
 * Working Context 控制消息。Conversation、Working Context 与分层 Trajectory
 * Context 中的任何 Nunjucks 语法都保持原始文本，不会被再次执行。
 *
 * @param view - 已投影好的 ModelInferenceView。
 * @param renderer - 由 Composition Root 创建并与 Executor 共享的 Bundle Renderer。
 * @returns 按 system → 真实会话 → Working Context 顺序组装的消息列表。
 * @throws 渲染失败（未知 Bundle 版本、缺失变量、模板错误等）时抛出，
 *   保证发生在 LLM Adapter 调用之前。
 */
export function renderRequest(
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
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
            renderWorkingContextMessage(
                view.workingContext,
                view.workingMemory,
                view.trajectoryContext,
            ),
        ],
    };
}
