import type { BrowserJsonValue } from "../session-input";

/**
 * wire 上允许传输的 JSON 值谓词。
 *
 * @remarks
 * 接受 JSON 标量、数组与普通对象；拒绝 `undefined`、函数、Symbol、BigInt、非有限
 * 数、类实例、符号键对象与循环引用。遍历使用显式栈，不递归到宿主栈上限，也不
 * 消耗 Contract 的结构深度预算；该实现与 `contract.unknown()` 的接受范围一致。
 *
 * @param value - 待检测值。
 * @returns 值可由 JSON 无损表示时为 `true`。
 *
 * @example
 * ```ts
 * if (isJsonValue(payload)) JSON.stringify(payload);
 * ```
 */
export function isJsonValue(value: unknown): value is BrowserJsonValue {
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
        if (current === null
            || typeof current === "string"
            || typeof current === "boolean") {
            continue;
        }
        if (typeof current === "number") {
            if (!Number.isFinite(current)) return false;
            continue;
        }
        if (typeof current !== "object") return false;
        if (ancestors.has(current)) return false;

        if (Array.isArray(current)) {
            ancestors.add(current);
            tasks.push({ kind: "leave", value: current });
            for (const item of current) {
                tasks.push({ kind: "visit", value: item });
            }
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
            tasks.push({
                kind: "visit",
                value: (current as Record<string, unknown>)[key],
            });
        }
    }

    return true;
}
