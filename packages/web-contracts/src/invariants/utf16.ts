/**
 * wire 文本的 UTF-16 code unit 长度上限谓词。
 *
 * @remarks
 * Contract 的 `maxLength` 按 Unicode code point 计数，无法表达既有 wire 上限使用的
 * UTF-16 code unit 语义。该谓词是这类上限的唯一实现，由每个拥有字段的 guard 或
 * parser 直接调用；不得为此新增 AST 节点或建立跨字段长度表。
 *
 * @param value - 待检测值。
 * @param max - 允许的最大 UTF-16 code unit 数。
 * @returns 值为字符串且 `value.length` 不超过 `max` 时为 `true`。
 *
 * @example
 * ```ts
 * if (hasUtf16LengthAtMost(title, 4_000)) console.log(title.length);
 * ```
 */
export function hasUtf16LengthAtMost(value: unknown, max: number): value is string {
    return typeof value === "string" && value.length <= max;
}
