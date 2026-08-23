import type { PromptTemplateAsset } from "../prompting/types";

/**
 * Global Overview 模板资产：为所有阶段提供 LazyGoal 产品导览与 Prompt 分工。
 *
 * @remarks
 * 稳定 ID 含组件版本 `global-overview@1`；该模板一旦被受支持 Bundle 引用即视为
 * 不可变，后续修改必须创建新模板 ID 与新 Bundle 版本。
 */
export const GLOBAL_OVERVIEW_TEMPLATE: PromptTemplateAsset = {
    id: "global-overview@1",
    sourceUrl: new URL("./global-overview@1.njk", import.meta.url),
};
