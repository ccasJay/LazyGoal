import type { PromptTemplateAsset } from "../prompting/types";

/**
 * `executing` 阶段的 AgentDecision 协议模板资产。
 *
 * @remarks
 * 描述模型在执行阶段必须遵守的严格 JSON 输出形状，稳定 ID 为 `agent-decision@1`。
 */
export const AGENT_DECISION_TEMPLATE_V1: PromptTemplateAsset = {
    id: "agent-decision@1",
    sourceUrl: new URL("./agent-decision@1.njk", import.meta.url),
};

/** v2 证据驱动 Action 闭环与严格 AgentDecision 协议模板。 */
export const AGENT_DECISION_TEMPLATE_V2: PromptTemplateAsset = {
    id: "agent-decision@2",
    sourceUrl: new URL("./agent-decision@2.njk", import.meta.url),
};

/** v3 Tool 优先与 Bash 兜底 AgentDecision 协议模板。 */
export const AGENT_DECISION_TEMPLATE_V3: PromptTemplateAsset = {
    id: "agent-decision@3",
    sourceUrl: new URL("./agent-decision@3.njk", import.meta.url),
};

/** v4 structured@1 MemoryPatch 与 CompletionEvidence 协议模板。 */
export const AGENT_DECISION_TEMPLATE_V4: PromptTemplateAsset = {
    id: "agent-decision@4",
    sourceUrl: new URL("./agent-decision@4.njk", import.meta.url),
};

/** v5 trajectory-layered AgentDecision 与来源优先级模板。 */
export const AGENT_DECISION_TEMPLATE_V5: PromptTemplateAsset = {
    id: "agent-decision@5",
    sourceUrl: new URL("./agent-decision@5.njk", import.meta.url),
};

/**
 * v1 AgentDecision 模板的兼容别名。
 *
 * @remarks
 * 已发布调用方继续获得不可变的 v1 资产；版本化 Bundle 应显式选择带版本常量。
 */
export const AGENT_DECISION_TEMPLATE = AGENT_DECISION_TEMPLATE_V1;
