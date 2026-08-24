import type { PromptTemplateAsset } from "../prompting/types";

/**
 * Global Overview 模板资产：为所有阶段提供 LazyGoal 产品导览与 Prompt 分工。
 *
 * @remarks
 * 稳定 ID 含组件版本 `global-overview@1`；该模板一旦被受支持 Bundle 引用即视为
 * 不可变，后续修改必须创建新模板 ID 与新 Bundle 版本。
 */
export const GLOBAL_OVERVIEW_TEMPLATE_V1: PromptTemplateAsset = {
    id: "global-overview@1",
    sourceUrl: new URL("./global-overview@1.njk", import.meta.url),
};

/** v2 跨阶段行为边界与事实输入契约模板。 */
export const GLOBAL_OVERVIEW_TEMPLATE_V2: PromptTemplateAsset = {
    id: "global-overview@2",
    sourceUrl: new URL("./global-overview@2.njk", import.meta.url),
};

/**
 * v1 Global Overview 的兼容别名。
 *
 * @remarks
 * 已发布调用方继续通过原名称获得不可变的 v1 资产；新 Bundle 必须显式选择带版本
 * 的常量，避免默认版本切换隐式改写历史 Manifest。
 */
export const GLOBAL_OVERVIEW_TEMPLATE = GLOBAL_OVERVIEW_TEMPLATE_V1;
