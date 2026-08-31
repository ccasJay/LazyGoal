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

/** v3 Structured Working Memory 与证据边界模板。 */
export const GLOBAL_OVERVIEW_TEMPLATE_V3: PromptTemplateAsset = {
    id: "global-overview@3",
    sourceUrl: new URL("./global-overview@3.njk", import.meta.url),
};

/** v4 分层 Trajectory Context 来源优先级与非猜测边界模板。 */
export const GLOBAL_OVERVIEW_TEMPLATE_V4: PromptTemplateAsset = {
    id: "global-overview@4",
    sourceUrl: new URL("./global-overview@4.njk", import.meta.url),
};

/** v5 Context Source 路由、历史 Lookup 时效与当前观察边界模板。 */
export const GLOBAL_OVERVIEW_TEMPLATE_V5: PromptTemplateAsset = {
    id: "global-overview@5",
    sourceUrl: new URL("./global-overview@5.njk", import.meta.url),
};

/** v6 实体 Fact、持续性语义与 Runtime 控制状态边界模板。 */
export const GLOBAL_OVERVIEW_TEMPLATE_V6: PromptTemplateAsset = {
    id: "global-overview@6",
    sourceUrl: new URL("./global-overview@6.njk", import.meta.url),
};

/**
 * v1 Global Overview 的兼容别名。
 *
 * @remarks
 * 已发布调用方继续通过原名称获得不可变的 v1 资产；新 Bundle 必须显式选择带版本
 * 的常量，避免默认版本切换隐式改写历史 Manifest。
 */
export const GLOBAL_OVERVIEW_TEMPLATE = GLOBAL_OVERVIEW_TEMPLATE_V1;
