import type { ContractSchemaNode, JsonValue } from "./types";

const MAX_UNKNOWN_PATHS = 32;
const MAX_PATH_LENGTH = 160;

/**
 * 解析本地 Schema 中的 `$ref`。
 *
 * @param schema - 当前节点。
 * @param root - Schema 根节点。
 * @returns 解析后的节点；引用无法解析时返回空节点。
 *
 * @example
 * ```ts
 * const node = resolveSchema({ $ref: "#/definitions/Item" }, root);
 * ```
 */
export function resolveSchema(schema: ContractSchemaNode, root: ContractSchemaNode): ContractSchemaNode {
    if (schema.$ref === undefined) return schema;
    let resolved: unknown = root;
    for (const segment of schema.$ref.replace(/^#\//, "").split("/")) {
        if (resolved === null || typeof resolved !== "object") return {};
        resolved = (resolved as Record<string, unknown>)[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    return resolved !== null && typeof resolved === "object" ? resolved as ContractSchemaNode : {};
}

/**
 * 收集对象树中未声明字段的有界 JSON Pointer 路径。
 *
 * @param value - 已复制的 JSON 值。
 * @param rootSchema - 契约根 Schema。
 * @returns 路径列表及是否因数量或长度截断。
 *
 * @example
 * ```ts
 * const { paths } = findUnknownPaths(value, schema);
 * ```
 */
export function findUnknownPaths(value: JsonValue, rootSchema: ContractSchemaNode): {
    readonly paths: string[];
    readonly truncated: boolean;
} {
    const pending: Array<{ readonly value: JsonValue; readonly schema: ContractSchemaNode; readonly path: string }> = [
        { value, schema: rootSchema, path: "" },
    ];
    const paths: string[] = [];
    let truncated = false;

    while (pending.length > 0 && !truncated) {
        const current = pending.pop()!;
        const schema = resolveSchema(current.schema, rootSchema);
        if (Array.isArray(current.value) && schema.items !== undefined) {
            for (let index = current.value.length - 1; index >= 0; index -= 1) {
                pending.push({
                    value: current.value[index]!,
                    schema: schema.items,
                    path: `${current.path}/${index}`,
                });
            }
            continue;
        }
        if (current.value === null || Array.isArray(current.value) || typeof current.value !== "object") continue;

        const record = current.value as Readonly<Record<string, JsonValue>>;
        const properties = schema.properties ?? {};
        for (const key of Object.keys(record)) {
            const path = `${current.path}/${escapePointerSegment(key)}`;
            if (!Object.hasOwn(properties, key)) {
                if (paths.length >= MAX_UNKNOWN_PATHS) {
                    truncated = true;
                    break;
                }
                if (path.length > MAX_PATH_LENGTH) {
                    paths.push(`${path.slice(0, MAX_PATH_LENGTH - 1)}…`);
                    truncated = true;
                    break;
                }
                paths.push(path);
                continue;
            }
            pending.push({ value: record[key]!, schema: properties[key]!, path });
        }
    }

    return { paths, truncated };
}

/**
 * 从隔离副本删除契约未声明字段。
 *
 * @param value - 已复制的 JSON 值，会被原地修改。
 * @param rootSchema - 契约根 Schema。
 *
 * @remarks
 * 删除范围不受诊断上限限制；数组和嵌套对象按 Schema 递归处理。
 *
 * @example
 * ```ts
 * const copy = cloneJsonValue(value);
 * stripUnknownFields(copy, schema);
 * ```
 */
export function stripUnknownFields(value: JsonValue, rootSchema: ContractSchemaNode): void {
    stripNode(value, rootSchema, rootSchema);
}

/**
 * 转义 JSON Pointer 路径片段。
 *
 * @param value - 原始属性名。
 * @returns 转义后的路径片段。
 *
 * @example
 * ```ts
 * const segment = escapePointerSegment("a/b");
 * ```
 */
export function escapePointerSegment(value: string): string {
    return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function stripNode(value: JsonValue, schemaNode: ContractSchemaNode, rootSchema: ContractSchemaNode): void {
    const schema = resolveSchema(schemaNode, rootSchema);
    if (Array.isArray(value)) {
        if (schema.items === undefined) return;
        for (const item of value) stripNode(item, schema.items, rootSchema);
        return;
    }
    if (value === null || typeof value !== "object") return;

    const record = value as Record<string, JsonValue>;
    const properties = schema.properties ?? {};
    for (const key of Object.keys(record)) {
        if (!Object.hasOwn(properties, key)) {
            delete record[key];
            continue;
        }
        stripNode(record[key]!, properties[key]!, rootSchema);
    }
}
