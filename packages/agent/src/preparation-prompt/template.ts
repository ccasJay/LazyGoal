import type { PromptTemplateAsset } from "../prompting/types";

/**
 * `gathering_context` 阶段的 PreparationResult 协议模板资产。
 *
 * @remarks
 * 描述模型在收集上下文阶段必须遵守的严格 JSON 输出形状，稳定 ID 为
 * `gathering-context@1`。
 */
export const GATHERING_CONTEXT_TEMPLATE: PromptTemplateAsset = {
    id: "gathering-context@1",
    sourceUrl: new URL("./gathering-context@1.njk", import.meta.url),
};

/**
 * `planning` 阶段的 PreparationResult 协议模板资产。
 *
 * @remarks
 * 描述模型在规划阶段必须遵守的严格 JSON 输出形状，稳定 ID 为 `planning@1`。
 */
export const PLANNING_TEMPLATE: PromptTemplateAsset = {
    id: "planning@1",
    sourceUrl: new URL("./planning@1.njk", import.meta.url),
};
