/**
 * 全仓共享的确定性 JSON 原语。
 *
 * @remarks
 * 该模块只依赖 ECMAScript 内建对象，不导入 `node:` 模块，因此浏览器构建与 Node
 * 运行时使用同一实现。它拥有四类算法：按代码单元顺序的 canonical JSON、通用对象
 * 守卫、JSON 值判定与环安全深冻结；消费包不得保留第二份实现。
 *
 * @example
 * ```ts
 * const text = canonicalJson({ b: 1, a: 2 });
 * // '{"a":2,"b":1}'
 * ```
 */

import type { JsonValue } from "./types";

/**
 * `canonicalJson` 的输出选项。
 *
 * @remarks
 * 只支持紧凑（省略 `indent`）与两空格缩进两种既有输出形态；不提供自定义分隔符
 * 或行尾控制，避免调用点产生新的持久化或 Prompt 字节形态。
 *
 * @example
 * ```ts
 * const pretty = canonicalJson({ b: 1, a: 2 }, { indent: 2 });
 * ```
 */
export interface CanonicalJsonOptions {
    /** 为 `2` 时使用两空格缩进；省略时输出紧凑 JSON。 */
    readonly indent?: 2;
}

/**
 * 按稳定代码单元顺序比较两个字符串。
 *
 * @remarks
 * 不使用受 locale 影响的 `localeCompare`，而是逐字符比较 UTF-16 code unit 数值，
 * 保证跨环境结果一致。用于 canonical JSON 的键排序与需要稳定文本序的调用点。
 *
 * @param a - 左侧字符串。
 * @param b - 右侧字符串。
 * @returns 负数、零或正数，语义与 `Array.prototype.sort` 的比较器一致。
 *
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
 * 判断值是否为通用 JSON 对象。
 *
 * @remarks
 * 当且仅当值是非 `null`、非数组的对象时返回 `true`。`Date`、`Map`、`Set` 与类实例
 * 仍返回 `true`，因为该守卫只区分“可按键读取的对象”与数组/空值，不做 JSON 值
 * 合法性判断。需要更窄领域类型时，调用点必须自行校验字段。
 *
 * @param value - 待判断的运行时值。
 * @returns 值是否为可按键读取的非数组对象。
 *
 * @example
 * ```ts
 * if (isRecord(payload)) {
 *     const id = payload.id;
 * }
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 判断值是否可以无损表示为 JSON 数据。
 *
 * @remarks
 * 接受 JSON 标量、数组与普通对象；拒绝 `undefined`、函数、`Symbol`、`BigInt`、
 * 非有限数、类实例、符号键对象与循环引用。对象只按自有可枚举字符串键遍历，访问器
 * 属性会被读取，因此需要排除访问器或额外数组属性的调用点还须自行检查自有属性描述符。
 * 遍历使用显式栈，不消耗宿主调用栈；该判定不做结构深度预算或 Schema 校验。
 *
 * @param value - 待判断的运行时值。
 * @returns 值可由 JSON 无损表示时为 `true`。
 *
 * @example
 * ```ts
 * if (isJsonValue(payload)) console.log(canonicalJson(payload));
 * ```
 */
export function isJsonValue(value: unknown): value is JsonValue {
    const ancestors = new WeakSet<object>();
    const pending: Array<
        | { readonly kind: "visit"; readonly value: unknown }
        | { readonly kind: "leave"; readonly value: object }
    > = [{ kind: "visit", value }];

    while (pending.length > 0) {
        const task = pending.pop()!;
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
            pending.push({ kind: "leave", value: current });
            for (const item of current) {
                pending.push({ kind: "visit", value: item });
            }
            continue;
        }

        const prototype = Object.getPrototypeOf(current);
        if (prototype !== Object.prototype && prototype !== null) return false;
        for (const key of Reflect.ownKeys(current)) {
            if (typeof key !== "string") return false;
        }

        ancestors.add(current);
        pending.push({ kind: "leave", value: current });
        for (const key of Object.keys(current)) {
            pending.push({
                kind: "visit",
                value: (current as Record<string, unknown>)[key],
            });
        }
    }

    return true;
}

/**
 * 递归复制 JSON 值并按代码单元顺序重排对象键。
 *
 * @remarks
 * 只复制自有可枚举字符串键，数组保持原顺序且保留空洞，标量原样返回。实现不调用
 * `toJSON`，因此 `Date`、`Map`、`Set` 等对象会退化为空对象；其最终文本形态由
 * `canonicalJson` 的 `JSON.stringify` 决定。返回值是独立副本，输入不会被修改；
 * 自有 `"__proto__"` 键作为普通自有键保留，不会改写任何对象的原型。循环引用不在
 * 支持范围内。
 *
 * @param value - 需要规范化的值。
 * @returns 键序稳定且与输入不共享对象容器的副本。
 *
 * @example
 * ```ts
 * const normalized = canonicalizeJson({ b: { d: 1, c: 2 }, a: [1] });
 * // { a: [1], b: { c: 2, d: 1 } }
 * ```
 */
export function canonicalizeJson(value: JsonValue): JsonValue;
export function canonicalizeJson(value: unknown): unknown;
export function canonicalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalizeJson);
    }

    if (value === null || typeof value !== "object") {
        return value;
    }

    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareCodeUnits)) {
        defineOwnValue(
            sorted,
            key,
            canonicalizeJson((value as Record<string, unknown>)[key]),
        );
    }

    return sorted;
}

/**
 * 把任意值序列化为键序稳定的 JSON 文本。
 *
 * @remarks
 * 输出固定为 `JSON.stringify(canonicalizeJson(value), undefined, options?.indent)`
 * 的结果，因此继承 `JSON.stringify` 的标量、`toJSON` 与错误语义：顶层
 * `undefined`、函数或 Symbol 输出字符串 `"null"`，对象中的此类属性被省略，数组
 * 元素输出 `null`，`BigInt` 抛出 `TypeError`。空白符固定使用 `JSON.stringify`
 * 的形状，不引入自定义序列化器。
 *
 * @param value - 需要序列化的运行时值。
 * @param options - 输出缩进选项；省略时输出紧凑 JSON。
 * @returns 键序稳定的 JSON 文本；不可序列化的顶层值返回 `"null"`。
 * @throws `JSON.stringify` 对 `BigInt` 等不支持的值抛出 `TypeError`。
 *
 * @example
 * ```ts
 * canonicalJson({ b: 1, a: 2 }); // '{"a":2,"b":1}'
 * canonicalJson({ b: 1, a: 2 }, { indent: 2 });
 * // '{\n  "a": 2,\n  "b": 1\n}'
 * ```
 */
export function canonicalJson(value: unknown, options?: CanonicalJsonOptions): string {
    const serialized = JSON.stringify(canonicalizeJson(value), undefined, options?.indent);

    return serialized === undefined ? "null" : serialized;
}

/**
 * 递归冻结对象与数组，使值在运行时不可变。
 *
 * @remarks
 * 返回与输入相同的引用；先冻结子值再冻结父值，只处理自有可枚举属性值。遇到循环
 * 引用时通过已访问集合终止，不会无限递归。冻结后任何写入尝试在严格模式下抛出
 * `TypeError`，非严格模式静默失败。
 *
 * @param value - 需要冻结的值；标量原样返回。
 * @returns 与输入相同引用的冻结值。
 *
 * @example
 * ```ts
 * const frozen = deepFreeze({ nested: { value: 1 } });
 * ```
 */
export function deepFreeze<T>(value: T): T {
    return freezeValue(value, new WeakSet<object>()) as T;
}

/**
 * 以 `defineProperty` 写入自有数据属性。
 *
 * @remarks
 * 赋值写法在键为 `"__proto__"` 时会触发原型 setter 而不是创建自有属性；这里固定
 * 使用数据属性定义，保证规范化副本与 `JSON.stringify` 看到同一组自有键。
 */
function defineOwnValue(target: Record<string, unknown>, key: string, value: unknown): void {
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
    });
}

/** 深度冻结的内部递归；`seen` 记录已访问对象以终止循环引用。 */
function freezeValue(value: unknown, seen: WeakSet<object>): unknown {
    if (value === null || typeof value !== "object" || seen.has(value)) {
        return value;
    }

    seen.add(value);

    if (Array.isArray(value)) {
        for (const child of value) {
            freezeValue(child, seen);
        }
    } else {
        for (const key of Object.keys(value)) {
            freezeValue((value as Record<string, unknown>)[key], seen);
        }
    }

    return Object.freeze(value);
}
