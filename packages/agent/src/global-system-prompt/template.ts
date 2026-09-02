import type { PromptTemplateAsset } from "../prompting/types";

/**
 * 当前 Global Overview 模板资产。
 *
 * @remarks
 * 资产 ID 与当前唯一 Prompt Bundle 共同使用 `global-overview@1`。模板内容由
 * 同目录 `.njk` 文件维护，Bundle Registry 会在启动时读取并编译它。
 */
export const GLOBAL_OVERVIEW_TEMPLATE_V1: PromptTemplateAsset = {
    id: "global-overview@1",
    sourceUrl: new URL("./global-overview@1.njk", import.meta.url),
};
