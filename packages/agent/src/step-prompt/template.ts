import type { PromptTemplateAsset } from "../prompting/types";

/**
 * `executing` 阶段的 AgentDecision 协议模板资产。
 *
 * @remarks
 * 描述模型在执行阶段必须遵守的严格 JSON 输出形状，稳定 ID 为 `agent-decision@1`。
 */
export const AGENT_DECISION_TEMPLATE: PromptTemplateAsset = {
    id: "agent-decision@1",
    sourceUrl: new URL("./agent-decision@1.njk", import.meta.url),
};
