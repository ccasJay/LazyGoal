import type { PromptTemplateAsset } from "../prompting/types";

/**
 * 当前 `gathering_context` 阶段的 PreparationResult 模板资产。
 *
 * @remarks
 * 该资产使用 `gathering-context@1`，内容对应当前结构化 Memory、分层上下文、
 * Context Epoch 和联合检索协议。
 */
export const GATHERING_CONTEXT_TEMPLATE_V1: PromptTemplateAsset = {
    id: "gathering-context@1",
    sourceUrl: new URL("./gathering-context@1.njk", import.meta.url),
};

/** 当前 `planning` 阶段的 PreparationResult 模板资产。 */
export const PLANNING_TEMPLATE_V1: PromptTemplateAsset = {
    id: "planning@1",
    sourceUrl: new URL("./planning@1.njk", import.meta.url),
};
