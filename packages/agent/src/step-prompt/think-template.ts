import type { PromptTemplateAsset } from "../prompting/types";

/** `executing` Think 阶段的自由文本分析模板资产。 */
export const AGENT_THINK_TEMPLATE_V1: PromptTemplateAsset = {
    id: "agent-think@1",
    sourceUrl: new URL("./agent-think@1.njk", import.meta.url),
};
