import type { JsonValue } from "./types";

/**
 * 判断值是否可以无损表示为 JSON 数据。
 *
 * @remarks
 * 接受 JSON 标量、数组和普通对象；拒绝 `undefined`、函数、Symbol、BigInt、非有限数、
 * 类实例、Symbol 键对象、访问器和循环引用。遍历使用显式栈，不消耗宿主调用栈。
 *
 * @param value - 待检测值。
 * @returns 值可由 JSON 无损表示时为 `true`。
 *
 * @example
 * ```ts
 * if (isJsonValue(payload)) console.log("json");
 * ```
 */
export function isJsonValue(value: unknown): value is JsonValue {
    const ancestors = new WeakSet<object>();
    const tasks: Array<
        | { readonly kind: "visit"; readonly value: unknown }
        | { readonly kind: "leave"; readonly value: object }
    > = [{ kind: "visit", value }];

    while (tasks.length > 0) {
        const task = tasks.pop()!;
        if (task.kind === "leave") {
            ancestors.delete(task.value);
            continue;
        }

        const current = task.value;
        if (current === null || typeof current === "string" || typeof current === "boolean") continue;
        if (typeof current === "number") {
            if (!Number.isFinite(current)) return false;
            continue;
        }
        if (typeof current !== "object") return false;
        if (ancestors.has(current)) return false;

        if (Array.isArray(current)) {
            ancestors.add(current);
            tasks.push({ kind: "leave", value: current });
            for (const item of current) tasks.push({ kind: "visit", value: item });
            continue;
        }

        const prototype = Object.getPrototypeOf(current);
        if (prototype !== Object.prototype && prototype !== null) return false;
        for (const key of Reflect.ownKeys(current)) {
            if (typeof key !== "string") return false;
        }

        ancestors.add(current);
        tasks.push({ kind: "leave", value: current });
        for (const key of Object.keys(current)) {
            tasks.push({ kind: "visit", value: (current as Record<string, unknown>)[key] });
        }
    }

    return true;
}

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
