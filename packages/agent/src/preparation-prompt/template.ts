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

/** v3 structured@1 gathering_context 与 MemoryPatch 协议模板。 */
export const GATHERING_CONTEXT_TEMPLATE_V3: PromptTemplateAsset = {
    id: "gathering-context@3",
    sourceUrl: new URL("./gathering-context@3.njk", import.meta.url),
};

/** v4 trajectory-layered gathering_context 与来源优先级模板。 */
export const GATHERING_CONTEXT_TEMPLATE_V4: PromptTemplateAsset = {
    id: "gathering-context@4",
    sourceUrl: new URL("./gathering-context@4.njk", import.meta.url),
};

/** v5 bm25-lite Context Lookup 与来源路由模板。 */
export const GATHERING_CONTEXT_TEMPLATE_V5: PromptTemplateAsset = {
    id: "gathering-context@5",
    sourceUrl: new URL("./gathering-context@5.njk", import.meta.url),
};

/** v6 实体 Fact proposal 与 durable semantic delta 模板。 */
export const GATHERING_CONTEXT_TEMPLATE_V6: PromptTemplateAsset = {
    id: "gathering-context@6",
    sourceUrl: new URL("./gathering-context@6.njk", import.meta.url),
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
export const PLANNING_TEMPLATE_V1: PromptTemplateAsset = {
    id: "planning@1",
    sourceUrl: new URL("./planning@1.njk", import.meta.url),
};

/** v2 可执行任务契约与严格 task_proposal 协议模板。 */
export const PLANNING_TEMPLATE_V2: PromptTemplateAsset = {
    id: "planning@2",
    sourceUrl: new URL("./planning@2.njk", import.meta.url),
};

/** v3 structured@1 planning 与 MemoryPatch 协议模板。 */
export const PLANNING_TEMPLATE_V3: PromptTemplateAsset = {
    id: "planning@3",
    sourceUrl: new URL("./planning@3.njk", import.meta.url),
};

/** v4 trajectory-layered planning 与来源优先级模板。 */
export const PLANNING_TEMPLATE_V4: PromptTemplateAsset = {
    id: "planning@4",
    sourceUrl: new URL("./planning@4.njk", import.meta.url),
};

/** v5 bm25-lite Context Lookup 与来源路由模板。 */
export const PLANNING_TEMPLATE_V5: PromptTemplateAsset = {
    id: "planning@5",
    sourceUrl: new URL("./planning@5.njk", import.meta.url),
};

/** v6 实体 Fact 与显式 create/update planning Memory 模板。 */
export const PLANNING_TEMPLATE_V6: PromptTemplateAsset = {
    id: "planning@6",
    sourceUrl: new URL("./planning@6.njk", import.meta.url),
};

/**
 * v1 planning 模板的兼容别名。
 *
 * @remarks
 * 已发布调用方继续获得不可变的 v1 资产；版本化 Bundle 应显式选择带版本常量。
 */
export const PLANNING_TEMPLATE = PLANNING_TEMPLATE_V1;
