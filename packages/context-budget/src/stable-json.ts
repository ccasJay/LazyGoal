/**
 * 预算、投影与 Prompt Filter 共用的确定性序列化。
 *
 * @remarks
 * 该模块不依赖 Nunjucks、模板或 Runtime 类型；相同数据始终产生相同文本。
 * 键序按代码单元比较，不受 locale 影响。
 */

/**
 * 按稳定代码单元顺序比较两个字符串。
 *
 * @remarks
 * 不使用受 locale 影响的 `localeCompare`，也不按 UTF-16 符号语言排序，
 * 而是逐字符比较 code unit 数值，保证跨环境结果一致。用于 `stableJson` 的键排序
 * 与 Authorized Tools 的 Tool ID 排序。
 *
 * @param a - 左侧字符串。
 * @param b - 右侧字符串。
 * @returns 负数、零或正数，语义与 `Array.prototype.sort` 的比较器一致。
 * @example
 * ```ts
 * const sorted = ["banana", "apple"].sort(compareCodeUnits);
 * ```
 */
export function compareCodeUnits(a: string, b: string): number {
    const length = Math.min(a.length, b.length);

    for (let i = 0; i < length; i += 1) {
        const left = a.charCodeAt(i);
        const right = b.charCodeAt(i);

        if (left !== right) {
            return left - right;
        }
    }

    return a.length - b.length;
}

/**
 * 递归把对象键按代码单元顺序排序；数组保持原顺序。
 *
 * @remarks
 * 仅重排对象键，不改变数组元素顺序，也不改变任何标量值。等效于 JSON 数据的
 * 规范化副本，调用方不得依赖返回对象与输入的同一性。
 *
 * @param value - 需要规范化的 JSON 数据；非对象值原样返回。
 * @returns 键序稳定、可作为序列化输入的新数据。
 */
function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }

    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};

        for (const key of Object.keys(record).sort(compareCodeUnits)) {
            sorted[key] = sortKeysDeep(record[key]);
        }

        return sorted;
    }

    return value;
}

/**
 * 把 JSON 数据序列化为键序稳定、两空格缩进的文本。
 *
 * @remarks
 * 对象键按稳定代码单元顺序递归排序、数组保持原顺序，再用两空格缩进序列化，
 * 使相同数据始终产生相同 JSON 文本。空数组固定输出 `[]`；`undefined` 输出
 * `null`。该函数同时作为 Prompt 环境的 `stableJson` Filter 与计量表示的基础。
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
    const serialized = JSON.stringify(sortKeysDeep(value), null, 2);

    return serialized === undefined ? "null" : serialized;
}
