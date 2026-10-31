import type { JsonValue } from "./types";

export { isJsonValue } from "../../contracts/src/index";

/**
 * 检查对象、数组及嵌套值只由可枚举数据属性组成。
 *
 * @remarks
 * 该检查在 JSON 值判定之前执行，避免访问器或额外数组属性在复制时被静默执行或丢弃。
 *
 * @param value - 待检测值。
 * @returns 所有对象节点都是普通数据对象或规范数组时为 `true`。
 *
 * @example
 * ```ts
 * if (hasJsonPropertyShape(value)) console.log("plain data");
 * ```
 */
export function hasJsonPropertyShape(value: unknown): boolean {
    const pending: unknown[] = [value];
    const visited = new WeakSet<object>();

    while (pending.length > 0) {
        const current = pending.pop();
        if (current === null || typeof current !== "object" || visited.has(current)) continue;
        visited.add(current);
        const prototype = Object.getPrototypeOf(current);
        if (Array.isArray(current) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
            return false;
        }

        for (const key of Reflect.ownKeys(current)) {
            if (Array.isArray(current) && key === "length") continue;
            if (typeof key !== "string") return false;
            if (Array.isArray(current) && !isArrayIndex(key)) return false;
            const descriptor = Object.getOwnPropertyDescriptor(current, key);
            if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return false;
            pending.push(descriptor.value);
        }
    }

    return true;
}

/**
 * 创建与输入完全隔离的 JSON 副本。
 *
 * @param value - 已通过 JSON 判定的值。
 * @returns 不共享对象或数组引用的 JSON 副本。
 *
 * @example
 * ```ts
 * const copy = cloneJsonValue(value);
 * ```
 */
export function cloneJsonValue(value: JsonValue): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isArrayIndex(key: string): boolean {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === key;
}
