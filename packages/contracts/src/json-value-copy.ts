/**
 * `unknown` 与 `openObject` 共享的 JSON 载荷深复制。
 *
 * @remarks
 * 遍历使用显式任务栈，不受合同结构的深度预算约束，也不会递归到宿主栈上限。
 * 只接受 JSON 标量、数组与普通对象；拒绝 `undefined`、函数、Symbol、BigInt、
 * 非有限数、类实例、符号键对象与循环引用。
 */

/** 载荷复制失败的位置，从被复制值自身开始计数。 */
export type JsonValueFailurePath = readonly (string | number)[];

/** JSON 载荷深复制结果。 */
export type JsonValueCopyResult =
    | {
        readonly success: true;
        readonly value: unknown;
    }
    | {
        readonly success: false;
        readonly path: JsonValueFailurePath;
        readonly code: "invalid_type" | "cyclic_value";
        readonly message: string;
    };

type Task =
    | {
        readonly kind: "visit";
        readonly source: unknown;
        readonly assign: (value: unknown) => void;
        readonly path: JsonValueFailurePath;
    }
    | {
        readonly kind: "leave";
        readonly source: object;
    };

function isPlainObject(value: object): boolean {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function setOwn(output: Record<string, unknown>, key: string, value: unknown): void {
    Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
    });
}

function invalid(path: JsonValueFailurePath, message: string): JsonValueCopyResult {
    return {
        success: false,
        path,
        code: "invalid_type",
        message,
    };
}

/**
 * 校验并深复制任意 JSON 值。
 *
 * @param input - 待复制的载荷。
 * @returns 成功时返回与输入引用隔离的深复制；失败时返回相对路径、稳定 code 与英文消息。
 *
 * @example
 * ```ts
 * const copied = copyJsonValue({ nested: [1, true] });
 * ```
 */
export function copyJsonValue(input: unknown): JsonValueCopyResult {
    let root: unknown = undefined;
    const ancestors = new WeakSet<object>();
    const tasks: Task[] = [
        {
            kind: "visit",
            source: input,
            assign: (value) => {
                root = value;
            },
            path: [],
        },
    ];

    while (tasks.length > 0) {
        const task = tasks.pop()!;
        if (task.kind === "leave") {
            ancestors.delete(task.source);
            continue;
        }

        const { source, assign, path } = task;
        if (source === null || typeof source === "string" || typeof source === "boolean") {
            assign(source);
            continue;
        }
        if (typeof source === "number") {
            if (!Number.isFinite(source)) {
                return invalid(path, "Expected a finite JSON number");
            }
            assign(source);
            continue;
        }
        if (typeof source !== "object") {
            return invalid(path, "Expected a JSON value");
        }
        if (ancestors.has(source)) {
            return {
                success: false,
                path,
                code: "cyclic_value",
                message: "Input contains a cyclic reference",
            };
        }
        if (Array.isArray(source)) {
            const output: unknown[] = new Array(source.length);
            assign(output);
            ancestors.add(source);
            tasks.push({ kind: "leave", source });
            for (let index = source.length - 1; index >= 0; index -= 1) {
                tasks.push({
                    kind: "visit",
                    source: source[index],
                    assign: (value) => {
                        output[index] = value;
                    },
                    path: [...path, index],
                });
            }
            continue;
        }
        if (!isPlainObject(source)) {
            return invalid(path, "Expected a plain JSON object");
        }
        for (const key of Reflect.ownKeys(source)) {
            if (typeof key !== "string") {
                return invalid(path, "Expected a JSON object with string keys");
            }
        }

        const output: Record<string, unknown> = {};
        assign(output);
        ancestors.add(source);
        tasks.push({ kind: "leave", source });
        const record = source as Record<string, unknown>;
        const keys = Object.keys(record);
        for (let index = keys.length - 1; index >= 0; index -= 1) {
            const key = keys[index]!;
            tasks.push({
                kind: "visit",
                source: record[key],
                assign: (value) => {
                    setOwn(output, key, value);
                },
                path: [...path, key],
            });
        }
    }

    return { success: true, value: root };
}
