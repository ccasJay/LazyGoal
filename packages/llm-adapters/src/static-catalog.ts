import type { CatalogModel } from "../../model-catalog/src/index";
import staticCatalogData from "./static-catalog-data.json" with { type: "json" };

/** 可读取静态目录的供应商标识。 */
export type StaticCatalogProvider = keyof typeof staticCatalogData;

/**
 * 读取锁定的静态模型目录事实。
 *
 * @remarks
 * 数据是迁移前锁定版本目录（pi-ai 1.3.0）的逐项固化，字段语义保持不变：
 * `maxOutputTokens` 收紧到严格小于上下文窗口，`vision` 与 `isTextGeneration`
 * 由输入模态推导，`reasoning` 沿用目录声明。在线发现只补充字段，不改变本集合。
 *
 * @param provider - 目标供应商。
 * @returns 目录算法可直接消费的静态模型元数据。
 *
 * @example
 * ```ts
 * const models = readStaticCatalogModels("openai");
 * ```
 */
export function readStaticCatalogModels(provider: StaticCatalogProvider): CatalogModel[] {
    return staticCatalogData[provider].map(model => ({ ...model }));
}
