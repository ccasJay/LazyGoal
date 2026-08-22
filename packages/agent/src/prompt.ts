import type { LLMRequest } from "../../llm/src/core/types";
import type { Goal } from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import type { ModelInferenceView } from "./model-inference-view";
import {
    AGENT_DECISION_PROTOCOL,
    PREPARATION_RESULT_PROTOCOL,
} from "./model-inference-view";
import { ModelInferenceProjector } from "./model-inference-projector";
import { renderRequest } from "./render";

export { AGENT_DECISION_PROTOCOL, PREPARATION_RESULT_PROTOCOL };
export {
    GLOBAL_SYSTEM_PROMPT_V1,
    resolveGlobalSystemPrompt,
} from "./global-system-prompt";
export type { ModelInferenceView } from "./model-inference-view";

function project(goal: Goal, tools: readonly ToolDefinition[] = []): ModelInferenceView {
    return new ModelInferenceProjector().project(goal, tools);
}

/**
 * 将一个完整 Goal 快照转换为本轮 LLM 请求。
 * 该函数只读取状态并生成新字符串，不保存状态、不追加历史。
 *
 * @param goal - 当前 running executing Goal。
 * @param tools - 当前 Profile 已授权且由 Runtime 解析出的 Tool 描述。
 */
export function buildStepRequest(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
): LLMRequest {
    const view = project(goal, tools);

    if (view.workingContext.phase !== "executing") {
        throw new Error("Step request requires a running executing Goal");
    }

    return renderRequest(view);
}

/**
 * 构造 active Preparation Goal 的单轮 LLM 请求。
 *
 * @remarks
 * 生成的 Working Context 是最后一条 user 控制消息，只存在于当前请求，
 * 不会写入 Goal.messages。
 *
 * @param goal - active `gathering_context` 或 `planning` Goal。
 * @returns 保持真实消息顺序并附带当前阶段控制消息的请求。
 * @throws Goal 不处于 active Preparation 阶段时抛出 Error。
 */
export function buildPreparationRequest(goal: Goal): LLMRequest {
    const view = project(goal);

    if (view.workingContext.phase === "executing") {
        throw new Error("Preparation request requires an active preparation Goal");
    }

    return renderRequest(view);
}

export type { PreparationPhase } from "./model-inference-view";
