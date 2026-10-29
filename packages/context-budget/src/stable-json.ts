/**
 * 预算、投影与 Prompt Filter 共用的确定性序列化入口。
 *
 * @remarks
 * 该模块不依赖 Nunjucks、模板或 Runtime 类型；相同数据始终产生相同文本。算法归属
 * `@lazygoal/contracts` 的 canonical JSON，本模块只保留公开入口与两空格缩进形态。
 */

import { canonicalJson } from "../../contracts/src/index";

export { compareCodeUnits } from "../../contracts/src/index";

/**
 * 把 JSON 数据序列化为键序稳定、两空格缩进的文本。
 *
 * @remarks
 * 委托 `@lazygoal/contracts` 的 `canonicalJson(value, { indent: 2 })`：对象键按稳定
 * 代码单元顺序递归排序、数组保持原顺序，再用两空格缩进序列化。空数组固定输出
 * `[]`；`undefined` 输出 `null`。该函数同时作为 Prompt 环境的 `stableJson` Filter
 * 与计量表示的基础。
 *
 * @param value - 需要序列化的运行时数据（如 ToolDefinition 或 inputSchema）。
 * @returns 两空格缩进、键序稳定的 JSON 字符串。
 * @example
 * ```ts
 * const text = stableJson({ b: 1, a: [2, 1] });
 * // '{\n  "a": [\n    2,\n    1\n  ],\n  "b": 1\n}'
 * ```
 */
export function stableJson(value: unknown): string {
    return canonicalJson(value, { indent: 2 });
}
