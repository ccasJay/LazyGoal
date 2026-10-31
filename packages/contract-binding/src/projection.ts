import type { ContractBinding } from "./binding";
import { cloneJsonValue, hasJsonPropertyShape, isJsonValue } from "./json";
import { escapePointerSegment, resolveSchema } from "./schema";
import type {
    ContractIssue,
    ContractReadResult,
    ContractSchemaNode,
    JsonValue,
} from "./types";

const MAX_ISSUES = 32;
const MAX_PATH_LENGTH = 160;
const WIRE_DIALECT = "http://json-schema.org/draft-07/schema#";
const localSchemaKeywords = new Set([
    "$schema",
    "$id",
    "$ref",
    "definitions",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "enum",
    "const",
    "minimum",
    "maximum",
    "description",
]);

/**
 * 模型可用的 wire JSON Schema。
 *
 * @remarks
 * 该 Schema 由本地绑定 Schema 派生，已内联 `$ref`、关闭对象并采用 required-nullable
 * 可选字段表示；不包含本地专属的字符串模式或长度约束。
 *
 * @example
 * ```ts
 * const schema: ModelWireSchema = projection.schema;
 * ```
 */
export type ModelWireSchema = Readonly<Record<string, unknown>>;

/**
 * 同一份绑定的模型 wire Schema 与 canonical 解码能力。
 *
 * @remarks
 * `decode` 先执行 wire required-nullable 到 canonical 的转换，再复用绑定的本地校验与
 * 未知字段策略；失败不返回部分数据。
 *
 * @example
 * ```ts
 * const decoded = projection.decode(providerValue);
 * if (decoded.ok) consume(decoded.data);
 * ```
 */
export interface ModelProjection<T> {
    readonly schema: ModelWireSchema;
    /**
     * @param value - 尚未信任的 Provider wire 值。
     * @returns canonical 类型化数据或可定位失败。
     */
    decode(value: unknown): ContractReadResult<T>;
}

/**
 * 无法无损派生模型 wire Schema 或解码能力。
 *
 * @remarks
 * `path` 指向本地 Schema 中无法表达的位置；错误不包含字段值或 Provider 载荷。
 *
 * @example
 * ```ts
 * try {
 *     binding.modelProjection();
 * } catch (error) {
 *     if (error instanceof ContractProjectionError) console.error(error.path);
 * }
 * ```
 */
export class ContractProjectionError extends Error {
    readonly path: string;

    /**
     * @param reason - 不支持的投影原因。
     * @param path - 本地 Schema 的 JSON Pointer 位置。
     */
    constructor(reason: string, path: string) {
        super(`${reason} at ${path}`);
        this.name = "ContractProjectionError";
        this.path = path;
    }
}

/**
 * 从绑定派生模型 wire Schema 与 canonical 解码器。
 *
 * @param binding - 已生成的本地绑定。
 * @returns 已成对验证的投影能力。
 * @throws 本地 Schema 包含 Provider 无法无损表达或无法解码的结构时抛出 {@link ContractProjectionError}。
 *
 * @example
 * ```ts
 * const projection = createModelProjection(binding);
 * ```
 */
export function createModelProjection<T>(binding: ContractBinding<T>): ModelProjection<T> {
    const schema = deriveModelWireSchema(binding.schema);
    return {
        schema,
        decode(value: unknown): ContractReadResult<T> {
            return decodeModelValue(value, binding);
        },
    };
}

/**
 * 将本地 Schema 转换为模型可移植的 wire Schema。
 *
 * @param schema - Catalog 生成器产出的本地 Schema。
 * @returns 内联、封闭、所有属性必填的 draft-07 Schema。
 * @throws 递归引用、开放对象、联合、元组或不可移植字符串约束时抛出 {@link ContractProjectionError}。
 *
 * @example
 * ```ts
 * const wire = deriveModelWireSchema(binding.schema);
 * ```
 */
export function deriveModelWireSchema(schema: ContractSchemaNode): ModelWireSchema {
    const root = resolveRoot(schema);
    if (root.type !== "object") {
        throw new ContractProjectionError("Model wire root must be an object", "#");
    }
    const wire = buildWireNode(schema, schema, "#", new Set());
    return { $schema: WIRE_DIALECT, ...wire };
}

function buildWireNode(
    schema: ContractSchemaNode,
    root: ContractSchemaNode,
    path: string,
    refStack: Set<string>,
): Record<string, unknown> {
    if (schema.$ref !== undefined) {
        if (refStack.has(schema.$ref)) {
            throw new ContractProjectionError("Recursive $ref is not portable for model output", path);
        }
        refStack.add(schema.$ref);
        const built = buildWireNode(resolveSchema(schema, root), root, path, refStack);
        refStack.delete(schema.$ref);
        return built;
    }

    for (const key of Object.keys(schema)) {
        if (!localSchemaKeywords.has(key)) {
            throw new ContractProjectionError(`Unsupported local schema keyword "${key}" for model projection`, path);
        }
    }

    if (schema.type === "object") {
        if (schema.additionalProperties !== false) {
            throw new ContractProjectionError("Open objects are not portable for model output", path);
        }
        const localRequired = new Set(schema.required ?? []);
        const properties: Record<string, Record<string, unknown>> = {};
        for (const [name, property] of Object.entries(schema.properties ?? {})) {
            const propertyPath = `${path}/properties/${escapePointerSegment(name)}`;
            const wireProperty = buildWireNode(property, root, propertyPath, refStack);
            properties[name] = localRequired.has(name)
                ? wireProperty
                : makeNullable(wireProperty, propertyPath);
        }
        return {
            type: "object",
            properties,
            required: Object.keys(properties),
            additionalProperties: false,
        };
    }

    if (schema.type === "array") {
        if (schema.items === undefined || Array.isArray(schema.items)) {
            throw new ContractProjectionError("Tuple or missing array items are not portable for model output", path);
        }
        return {
            type: "array",
            items: buildWireNode(schema.items, root, `${path}/items`, refStack),
        };
    }

    if (schema.enum !== undefined || schema.const !== undefined) {
        return {
            ...(schema.type === undefined ? {} : { type: schema.type }),
            ...(schema.enum === undefined ? { const: schema.const } : { enum: [...schema.enum] }),
        };
    }

    if (schema.type === "string") {
        return { type: "string" };
    }

    if (schema.type === "number" || schema.type === "integer") {
        return {
            type: schema.type,
            ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
            ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
        };
    }

    if (schema.type === "boolean" || schema.type === "null") {
        return { type: schema.type };
    }

    throw new ContractProjectionError("Unsupported local schema node for model projection", path);
}

function makeNullable(schema: Record<string, unknown>, path: string): Record<string, unknown> {
    const nullable: Record<string, unknown> = { ...schema };
    if (typeof nullable.type === "string") {
        nullable.type = [nullable.type, "null"];
    } else if (nullable.type !== undefined) {
        throw new ContractProjectionError("Union type is not portable for model output", path);
    }

    if ("const" in nullable) {
        nullable.enum = [nullable.const, null];
        delete nullable.const;
    } else if (Array.isArray(nullable.enum)) {
        nullable.enum = [...nullable.enum, null];
    } else if (nullable.type === undefined) {
        throw new ContractProjectionError("Optional schema cannot be made nullable", path);
    }
    return nullable;
}

function resolveRoot(schema: ContractSchemaNode): ContractSchemaNode {
    let current = schema;
    const seen = new Set();
    while (current.$ref !== undefined) {
        if (seen.has(current.$ref)) {
            throw new ContractProjectionError("Recursive root schema is not portable for model output", "#");
        }
        seen.add(current.$ref);
        current = resolveSchema(current, schema);
    }
    return current;
}

function decodeModelValue<T>(value: unknown, binding: ContractBinding<T>): ContractReadResult<T> {
    if (!hasJsonPropertyShape(value) || !isJsonValue(value)) {
        return {
            ok: false,
            contractId: binding.contractId,
            version: binding.version,
            issues: [{ path: "", code: "json" }],
            truncated: false,
        };
    }

    const copied = cloneJsonValue(value);
    const issues = decodeNode(copied, binding.schema, binding.schema, "");
    if (issues.length > 0) {
        return {
            ok: false,
            contractId: binding.contractId,
            version: binding.version,
            issues,
            truncated: issues.length >= MAX_ISSUES,
        };
    }
    return binding.read(copied, "strip");
}

function decodeNode(
    value: JsonValue,
    schema: ContractSchemaNode,
    root: ContractSchemaNode,
    path: string,
): ContractIssue[] {
    const resolved = resolveSchema(schema, root);
    const issues: ContractIssue[] = [];

    if (resolved.type === "object" && isPlainRecord(value)) {
        const record = value as Record<string, JsonValue>;
        const required = new Set(resolved.required ?? []);
        for (const [name, property] of Object.entries(resolved.properties ?? {})) {
            const propertyPath = `${path}/${escapePointerSegment(name)}`;
            if (!Object.hasOwn(record, name)) {
                issues.push({ path: boundPath(propertyPath), code: "required" });
                continue;
            }
            if (!required.has(name) && record[name] === null) {
                delete record[name];
                continue;
            }
            issues.push(...decodeNode(record[name]!, property, root, propertyPath));
            if (issues.length >= MAX_ISSUES) break;
        }
    } else if (resolved.type === "array" && Array.isArray(value) && resolved.items !== undefined) {
        for (let index = 0; index < value.length; index += 1) {
            issues.push(...decodeNode(value[index]!, resolved.items, root, `${path}/${index}`));
            if (issues.length >= MAX_ISSUES) break;
        }
    }

    return boundIssues(issues);
}

function isPlainRecord(value: JsonValue): boolean {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundIssues(issues: ContractIssue[]): ContractIssue[] {
    const seen = new Set<string>();
    const result: ContractIssue[] = [];
    for (const issue of issues) {
        const key = `${issue.code}:${issue.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ path: boundPath(issue.path), code: issue.code });
        if (result.length >= MAX_ISSUES) break;
    }
    return result;
}

function boundPath(path: string): string {
    return path.length <= MAX_PATH_LENGTH ? path : `${path.slice(0, MAX_PATH_LENGTH - 1)}…`;
}
