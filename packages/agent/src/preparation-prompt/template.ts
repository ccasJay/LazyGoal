import type { PromptTemplateAsset } from "../prompting/types";

/**
 * `gathering_context` 阶段的 PreparationResult 协议模板资产。
 *
 * @remarks
 * 描述模型在收集上下文阶段必须遵守的严格 JSON 输出形状，稳定 ID 为
 * `gathering-context@1`。
 */
export const GATHERING_CONTEXT_TEMPLATE_V1: PromptTemplateAsset = {
    id: "gathering-context@1",
    sourceUrl: new URL("./gathering-context@1.njk", import.meta.url),
};

/** v2 最小必要上下文收集与严格响应协议模板。 */
export const GATHERING_CONTEXT_TEMPLATE_V2: PromptTemplateAsset = {
    id: "gathering-context@2",
    sourceUrl: new URL("./gathering-context@2.njk", import.meta.url),
};

/**
 * v1 gathering_context 模板的兼容别名。
 *
 * @remarks
 * 已发布调用方继续获得不可变的 v1 资产；版本化 Bundle 应显式选择带版本常量。
 */
export const GATHERING_CONTEXT_TEMPLATE = GATHERING_CONTEXT_TEMPLATE_V1;

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
