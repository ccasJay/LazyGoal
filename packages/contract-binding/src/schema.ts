import type {
    ContractIssue,
    ContractSchemaNode,
    ContractSchemaType,
    JsonScalar,
    JsonValue,
} from "./types";

const MAX_UNKNOWN_PATHS = 32;
const MAX_PATH_LENGTH = 160;

/**
 * 读取联合与可空字段时使用的值判定选项。
 *
 * @remarks
 * `allowOptionalNull` 只用于模型 wire 解码：wire 把本地可选字段表示为必填可空字段，
 * 因此可选属性上的 `null` 应视为缺席而不是本地值。普通绑定读取不使用该选项。
 *
 * @example
 * ```ts
 * const options: SchemaValueOptions = { allowOptionalNull: true };
 * ```
 */
export interface SchemaValueOptions {
    readonly allowOptionalNull?: boolean;
}

/**
 * 按值解析联合、可空类型与本地 `$ref` 的结果。
 *
 * @remarks
 * 成功时返回可继续遍历的具体 Schema 节点；失败只包含有界问题，不返回部分值。
 *
 * @example
 * ```ts
 * const resolved = resolveSchemaForValue(value, schema, schema, "/union");
 * if (resolved.ok) consume(resolved.schema);
 * ```
 */
export type SchemaValueResolution =
    | { readonly ok: true; readonly schema: ContractSchemaNode }
    | { readonly ok: false; readonly issues: readonly ContractIssue[] };

/**
 * 未知字段扫描结果。
 *
 * @remarks
 * `issues` 存在表示联合无法唯一确定分支或值不符合任何分支；此时 `paths` 不完整，
 * 调用方必须把读取作为失败处理。
 *
 * @example
 * ```ts
 * const scan = findUnknownPaths(value, schema);
 * if (scan.issues === undefined) consume(scan.paths);
 * ```
 */
export interface UnknownFieldScan {
    readonly paths: readonly string[];
    readonly truncated: boolean;
    readonly issues?: readonly ContractIssue[];
}

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
 * 按待读取值解析联合分支、可空类型和本地引用。
 *
 * @param value - 已通过 JSON 判定的值。
 * @param schemaNode - 当前 Schema 节点。
 * @param rootSchema - 契约根 Schema。
 * @param path - 当前值的 JSON Pointer。
 * @param options - 模型 wire 解码选项。
 * @returns 具体 Schema 节点，或无法唯一确定/不匹配时的问题。
 *
 * @example
 * ```ts
 * const resolved = resolveSchemaForValue(value, schema, root, "/items/0");
 * ```
 */
export function resolveSchemaForValue(
    value: JsonValue,
    schemaNode: ContractSchemaNode,
    rootSchema: ContractSchemaNode,
    path: string,
    options: SchemaValueOptions = {},
    seen: ReadonlySet<ContractSchemaNode> = new Set(),
): SchemaValueResolution {
    const resolved = resolveReferenceChain(schemaNode, rootSchema, path);
    if (!resolved.ok) return resolved;
    const node = resolved.schema;
    if (seen.has(node)) {
        return { ok: false, issues: [{ path: boundPath(path), code: "constraint" }] };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(node);

    if (node.anyOf !== undefined) {
        const selection = selectUnionBranch(value, node.anyOf, rootSchema, path, options, nextSeen);
        if (!selection.ok) return selection;
        return resolveSchemaForValue(value, selection.schema, rootSchema, path, options, nextSeen);
    }

    if (Array.isArray(node.type)) {
        const matching = node.type.filter(type => matchesJsonType(value, type));
        if (matching.length === 0) {
            return { ok: false, issues: [{ path: boundPath(path), code: "type" }] };
        }
        return { ok: true, schema: { ...node, type: matching[0] } };
    }

    return { ok: true, schema: node };
}

/**
 * 在忽略未知字段的前提下检查值是否满足 Schema。
 *
 * @remarks
 * 该检查用于联合分支选择和模型 wire 解码；它不删除未知字段，也不把未知字段当作
 * 分支不匹配的理由。完整校验仍由生成校验器在清理后执行。
 *
 * @param value - 待检查值。
 * @param schemaNode - 当前 Schema 节点。
 * @param rootSchema - 契约根 Schema。
 * @param path - 当前值的 JSON Pointer。
 * @param options - 模型 wire 解码选项。
 * @returns 有界问题列表；空数组表示匹配。
 *
 * @example
 * ```ts
 * const issues = checkValueAgainstSchema(value, branch, root, "/union");
 * ```
 */
export function checkValueAgainstSchema(
    value: JsonValue,
    schemaNode: ContractSchemaNode,
    rootSchema: ContractSchemaNode,
    path: string,
    options: SchemaValueOptions = {},
    seen: ReadonlySet<ContractSchemaNode> = new Set(),
): readonly ContractIssue[] {
    const resolved = resolveReferenceChain(schemaNode, rootSchema, path);
    if (!resolved.ok) return resolved.issues;
    const node = resolved.schema;
    if (seen.has(node)) return [{ path: boundPath(path), code: "constraint" }];
    const nextSeen = new Set(seen);
    nextSeen.add(node);

    if (node.anyOf !== undefined) {
        const selection = selectUnionBranch(value, node.anyOf, rootSchema, path, options, nextSeen);
        return selection.ok ? [] : selection.issues;
    }

    if (!matchesSchemaType(value, node.type)) {
        return [{ path: boundPath(path), code: "type" }];
    }

    const issues: ContractIssue[] = [];
    if (node.const !== undefined && !jsonScalarEqual(value, node.const)) {
        issues.push({ path: boundPath(path), code: "const" });
    }
    if (node.enum !== undefined && !node.enum.some(item => jsonScalarEqual(value, item))) {
        issues.push({ path: boundPath(path), code: "enum" });
    }

    if (node.properties === undefined
        && node.items === undefined
        && node.additionalProperties === undefined
        && node.type === undefined) {
        return issues;
    }

    if (isPlainRecord(value) && isObjectSchema(node)) {
        const record = value as Readonly<Record<string, JsonValue>>;
        const required = new Set(node.required ?? []);
        for (const name of required) {
            if (!Object.hasOwn(record, name)) {
                issues.push({ path: boundPath(joinPath(path, name)), code: "required" });
            }
        }
        for (const [name, property] of Object.entries(node.properties ?? {})) {
            if (!Object.hasOwn(record, name)) continue;
            const propertyValue = record[name]!;
            if (!required.has(name) && propertyValue === null && options.allowOptionalNull === true) continue;
            issues.push(...checkValueAgainstSchema(
                propertyValue,
                property,
                rootSchema,
                joinPath(path, name),
                options,
            ));
        }
        if (node.additionalProperties !== undefined
            && node.additionalProperties !== false
            && node.additionalProperties !== true) {
            for (const [name, propertyValue] of Object.entries(record)) {
                if (Object.hasOwn(node.properties ?? {}, name)) continue;
                issues.push(...checkValueAgainstSchema(
                    propertyValue,
                    node.additionalProperties,
                    rootSchema,
                    joinPath(path, name),
                    options,
                ));
            }
        }
        return issues;
    }

    if (Array.isArray(value) && isArraySchema(node) && node.items !== undefined) {
        for (let index = 0; index < value.length; index += 1) {
            issues.push(...checkValueAgainstSchema(
                value[index]!,
                node.items,
                rootSchema,
                joinPath(path, String(index)),
                options,
            ));
        }
        return issues;
    }

    if (typeof value === "string" && hasSchemaType(node, "string")) {
        if (node.pattern !== undefined) {
            try {
                if (!new RegExp(node.pattern).test(value)) {
                    issues.push({ path: boundPath(path), code: "pattern" });
                }
            } catch {
                issues.push({ path: boundPath(path), code: "constraint" });
            }
        }
        if (node.minLength !== undefined && value.length < node.minLength) {
            issues.push({ path: boundPath(path), code: "length" });
        }
        if (node.maxLength !== undefined && value.length > node.maxLength) {
            issues.push({ path: boundPath(path), code: "length" });
        }
        return issues;
    }

    if (typeof value === "number" && (hasSchemaType(node, "number") || hasSchemaType(node, "integer"))) {
        if (node.minimum !== undefined && value < node.minimum) {
            issues.push({ path: boundPath(path), code: "range" });
        }
        if (node.maximum !== undefined && value > node.maximum) {
            issues.push({ path: boundPath(path), code: "range" });
        }
    }

    return issues;
}

/**
 * 收集对象树中未声明字段的有界 JSON Pointer 路径。
 *
 * @param value - 已复制的 JSON 值。
 * @param rootSchema - 契约根 Schema。
 * @returns 路径列表、截断状态，或联合解析失败问题。
 *
 * @example
 * ```ts
 * const { paths } = findUnknownPaths(value, schema);
 * ```
 */
export function findUnknownPaths(value: JsonValue, rootSchema: ContractSchemaNode): UnknownFieldScan {
    const pending: Array<{ readonly value: JsonValue; readonly schema: ContractSchemaNode; readonly path: string }> = [
        { value, schema: rootSchema, path: "" },
    ];
    const paths: string[] = [];
    let truncated = false;

    while (pending.length > 0 && !truncated) {
        const current = pending.pop()!;
        const resolved = resolveSchemaForValue(current.value, current.schema, rootSchema, current.path);
        if (!resolved.ok) {
            return { paths, truncated, issues: resolved.issues };
        }
        const schema = resolved.schema;

        if (Array.isArray(current.value)) {
            if (!isArraySchema(schema) || schema.items === undefined) continue;
            for (let index = current.value.length - 1; index >= 0; index -= 1) {
                pending.push({
                    value: current.value[index]!,
                    schema: schema.items,
                    path: joinPath(current.path, String(index)),
                });
            }
            continue;
        }
        if (!isPlainRecord(current.value) || !isObjectSchema(schema)) continue;

        const record = current.value as Readonly<Record<string, JsonValue>>;
        const properties = schema.properties ?? {};
        const open = isOpenObjectSchema(schema);
        for (const key of Object.keys(record)) {
            const path = joinPath(current.path, key);
            if (Object.hasOwn(properties, key)) {
                pending.push({ value: record[key]!, schema: properties[key]!, path });
                continue;
            }
            if (open) {
                if (typeof schema.additionalProperties === "object") {
                    pending.push({ value: record[key]!, schema: schema.additionalProperties, path });
                }
                continue;
            }
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
        }
    }

    return { paths, truncated };
}

/**
 * 从隔离副本删除契约未声明字段。
 *
 * @param value - 已复制的 JSON 值，会被原地修改。
 * @param rootSchema - 契约根 Schema。
 * @returns 所有联合分支均成功解析时为 `true`；联合失败时不保证副本完整，调用方应丢弃它。
 *
 * @remarks
 * 删除范围不受诊断上限限制；数组、嵌套对象和开放对象中值 Schema 的嵌套未知字段按
 * Schema 递归处理。开放对象自身允许的键不会被删除。
 *
 * @example
 * ```ts
 * const copy = cloneJsonValue(value);
 * stripUnknownFields(copy, schema);
 * ```
 */
export function stripUnknownFields(value: JsonValue, rootSchema: ContractSchemaNode): boolean {
    const pending: Array<{ readonly value: JsonValue; readonly schema: ContractSchemaNode; readonly path: string }> = [
        { value, schema: rootSchema, path: "" },
    ];

    while (pending.length > 0) {
        const current = pending.pop()!;
        const resolved = resolveSchemaForValue(current.value, current.schema, rootSchema, current.path);
        if (!resolved.ok) return false;
        const schema = resolved.schema;

        if (Array.isArray(current.value)) {
            if (!isArraySchema(schema) || schema.items === undefined) continue;
            for (const item of current.value) {
                pending.push({ value: item, schema: schema.items, path: current.path });
            }
            continue;
        }
        if (!isPlainRecord(current.value) || !isObjectSchema(schema)) continue;

        const record = current.value as Record<string, JsonValue>;
        const properties = schema.properties ?? {};
        const open = isOpenObjectSchema(schema);
        for (const key of Object.keys(record)) {
            const path = joinPath(current.path, key);
            if (Object.hasOwn(properties, key)) {
                pending.push({ value: record[key]!, schema: properties[key]!, path });
                continue;
            }
            if (open) {
                if (typeof schema.additionalProperties === "object") {
                    pending.push({ value: record[key]!, schema: schema.additionalProperties, path });
                }
                continue;
            }
            delete record[key];
        }
    }

    return true;
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

function selectUnionBranch(
    value: JsonValue,
    branches: readonly ContractSchemaNode[],
    rootSchema: ContractSchemaNode,
    path: string,
    options: SchemaValueOptions,
    seen: ReadonlySet<ContractSchemaNode>,
): SchemaValueResolution {
    if (branches.length === 0) {
        return { ok: false, issues: [{ path: boundPath(path), code: "union" }] };
    }

    const candidates: ContractSchemaNode[] = [];
    const failures: ContractIssue[][] = [];
    for (const branch of branches) {
        const issues = checkValueAgainstSchema(value, branch, rootSchema, path, options, seen);
        if (issues.length === 0) candidates.push(branch);
        else failures.push([...issues]);
    }

    if (candidates.length === 1) {
        return { ok: true, schema: candidates[0]! };
    }
    if (candidates.length > 1) {
        return { ok: false, issues: [{ path: boundPath(path), code: "union" }] };
    }

    const best = failures.reduce<readonly ContractIssue[]>(
        (current, candidate) => candidate.length < current.length ? candidate : current,
        failures[0] ?? [],
    );
    return {
        ok: false,
        issues: best.length === 0 ? [{ path: boundPath(path), code: "union" }] : best,
    };
}

function resolveReferenceChain(
    schemaNode: ContractSchemaNode,
    rootSchema: ContractSchemaNode,
    path: string,
): SchemaValueResolution {
    let current = schemaNode;
    const seen = new Set<string>();
    while (current.$ref !== undefined) {
        if (seen.has(current.$ref)) {
            return { ok: false, issues: [{ path: boundPath(path), code: "constraint" }] };
        }
        seen.add(current.$ref);
        current = resolveSchema(current, rootSchema);
    }
    return { ok: true, schema: current };
}

function matchesSchemaType(value: JsonValue, type: ContractSchemaNode["type"]): boolean {
    if (type === undefined) return true;
    const types = Array.isArray(type) ? type : [type];
    return types.some(candidate => matchesJsonType(value, candidate));
}

function matchesJsonType(value: JsonValue, type: ContractSchemaType): boolean {
    switch (type) {
        case "object":
            return isPlainRecord(value);
        case "array":
            return Array.isArray(value);
        case "string":
            return typeof value === "string";
        case "number":
            return typeof value === "number";
        case "integer":
            return typeof value === "number" && Number.isInteger(value);
        case "boolean":
            return typeof value === "boolean";
        case "null":
            return value === null;
        default:
            return false;
    }
}

function hasSchemaType(schema: ContractSchemaNode, type: "object" | "array" | "string" | "number" | "integer"): boolean {
    if (schema.type === undefined) return false;
    return Array.isArray(schema.type) ? schema.type.includes(type) : schema.type === type;
}

function isObjectSchema(schema: ContractSchemaNode): boolean {
    return hasSchemaType(schema, "object") || (schema.type === undefined && schema.properties !== undefined);
}

function isArraySchema(schema: ContractSchemaNode): boolean {
    return hasSchemaType(schema, "array") || (schema.type === undefined && schema.items !== undefined);
}

function isOpenObjectSchema(schema: ContractSchemaNode): boolean {
    if (schema.additionalProperties === true) return true;
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) return true;
    if (schema.properties !== undefined) return false;
    return schema.type === undefined;
}

function isPlainRecord(value: JsonValue): boolean {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonScalarEqual(value: JsonValue, expected: JsonScalar): boolean {
    return value === expected;
}

function joinPath(path: string, segment: string): string {
    return `${path}/${escapePointerSegment(segment)}`;
}

function boundPath(path: string): string {
    return path.length <= MAX_PATH_LENGTH ? path : `${path.slice(0, MAX_PATH_LENGTH - 1)}…`;
}
