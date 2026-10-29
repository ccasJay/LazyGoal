/**
 * 非数组对象的通用类型守卫。
 *
 * @remarks
 * 该谓词只判断对象身份，不排除类实例或原型污染；wire JSON 的结构校验由合同与
 * `isJsonValue` 承担。实现由 `specs/shared-json-primitives` 接管后此处转发。
 *
 * @param value - 待检测值。
 * @returns 非 null 且不是数组的对象时为 `true`。
 *
 * @example
 * ```ts
 * if (isRecord(value)) console.log(Object.keys(value));
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
