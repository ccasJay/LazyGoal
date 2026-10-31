import type { ContractBinding } from "./binding";
import { cloneJsonValue, hasJsonPropertyShape, isJsonValue } from "./json";
import { escapePointerSegment, resolveSchema, resolveSchemaForValue } from "./schema";
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
    "anyOf",
    "enum",
    "const",
    "minimum",
    "maximum",
    "pattern",
    "minLength",
    "maxLength",
    "description",
    "title",
]);
const metadataKeywords = new Set(["$schema", "$id", "$ref", "definitions", "description", "title"]);

/**
 * 模型 wire Schema 无法表达、改由 canonical 解码强制验证的本地约束关键字。
 *
 * @remarks
 * 这些约束从 wire Schema 中省略以避免 Provider 静默丢弃；{@link ModelProjection.decode}
 * 仍使用同源本地 Schema 校验，违反约束的值不会成为成功结果。
 *
 * @example
 * ```ts
 * const keyword: ModelLocalConstraintKeyword = "pattern";
 * ```
 */
export type ModelLocalConstraintKeyword = "pattern" | "minLength" | "maxLength";

/**
 * 单个本地 Schema 位置被放宽的模型投影约束。
 *
 * @remarks
 * `path` 是本地 Schema 的 JSON Pointer；`keywords` 按固定顺序列出由解码强制验证的
 * 关键字。该信息供模型装配明确标识 wire 与 canonical 的差异，不包含字段值。
 *
 * @example
 * ```ts
 * const local: ModelLocalConstraint = {
 *     path: "#/properties/providerId",
 *     keywords: ["pattern"],
 * };
 * ```
 */
export interface ModelLocalConstraint {
    readonly path: string;
    readonly keywords: readonly ModelLocalConstraintKeyword[];
}

/**
 * 模型可用的 wire JSON Schema。
 *
 * @remarks
 * 该 Schema 由本地绑定 Schema 派生，已内联 `$ref`、关闭对象并采用 required-nullable
 * 可选字段表示；不包含本地专属的字符串模式或长度约束，这些约束记录在
 * {@link ModelProjection.localConstraints} 并由解码强制验证。
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
 * 未知字段策略；失败不返回部分数据。联合按唯一合法分支解码，无法唯一确定时失败。
 * 本地字符串约束被明确记录在 `localConstraints`，不会从 wire 中静默消失。
 *
 * @example
 * ```ts
 * const decoded = projection.decode(providerValue);
 * if (decoded.ok) consume(decoded.data);
 * ```
 */
export interface ModelProjection<T> {
    readonly schema: ModelWireSchema;
    readonly localConstraints: readonly ModelLocalConstraint[];
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
 * @returns 已成对验证的投影能力，并列出由解码强制验证的本地约束。
 * @throws 本地 Schema 包含 Provider 无法安全表达或无法解码的结构时抛出 {@link ContractProjectionError}。
 *
 * @example
 * ```ts
 * const projection = createModelProjection(binding);
 * ```
 */
export function createModelProjection<T>(binding: ContractBinding<T>): ModelProjection<T> {
    const derived = deriveModelArtifacts(binding.schema);
    return {
        schema: derived.schema,
        localConstraints: derived.localConstraints,
        decode(value: unknown): ContractReadResult<T> {
            return decodeModelValue(value, binding);
        },
    };
}

/**
 * 将本地 Schema 转换为模型可移植的 wire Schema。
 *
 * @param schema - Catalog 生成器产出的本地 Schema。
 * @returns 内联、封闭、所有属性必填的 draft-07 Schema；联合保留为 `anyOf`。
 * @throws 递归引用、开放对象、元组或无法安全转换的结构时抛出 {@link ContractProjectionError}。
 *
 * @example
 * ```ts
 * const wire = deriveModelWireSchema(binding.schema);
 * ```
 */
export function deriveModelWireSchema(schema: ContractSchemaNode): ModelWireSchema {
    return deriveModelArtifacts(schema).schema;
}

interface DerivedModelArtifacts {
    readonly schema: ModelWireSchema;
    readonly localConstraints: readonly ModelLocalConstraint[];
}

function deriveModelArtifacts(schema: ContractSchemaNode): DerivedModelArtifacts {
    const root = resolveRoot(schema);
    if (root.type !== "object" && root.anyOf === undefined) {
        throw new ContractProjectionError("Model wire root must be an object or union", "#");
    }
    const localConstraints: ModelLocalConstraint[] = [];
    const wire = buildWireNode(schema, schema, "#", new Set(), localConstraints);
    return {
        schema: { $schema: WIRE_DIALECT, ...wire },
        localConstraints,
    };
}

function buildWireNode(
    schema: ContractSchemaNode,
    root: ContractSchemaNode,
    path: string,
    refStack: Set<string>,
    localConstraints: ModelLocalConstraint[],
): Record<string, unknown> {
    if (schema.$ref !== undefined) {
        if (refStack.has(schema.$ref)) {
            throw new ContractProjectionError("Recursive $ref is not portable for model output", path);
        }
        refStack.add(schema.$ref);
        const built = buildWireNode(resolveSchema(schema, root), root, path, refStack, localConstraints);
        refStack.delete(schema.$ref);
        return built;
    }

    for (const key of Object.keys(schema)) {
        if (!localSchemaKeywords.has(key)) {
            throw new ContractProjectionError(`Unsupported local schema keyword "${key}" for model projection`, path);
        }
    }

    if (schema.anyOf !== undefined) {
        assertOnlyMetadata(schema, path, "anyOf");
        if (schema.anyOf.length === 0) {
            throw new ContractProjectionError("Union branches must be non-empty for model projection", path);
        }
        return {
            anyOf: schema.anyOf.map((branch, index) =>
                buildWireNode(branch, root, `${path}/anyOf/${index}`, refStack, localConstraints)),
        };
    }

    if (Array.isArray(schema.type)) {
        const types = schema.type;
        const nonNull = types.filter(type => type !== "null");
        if (nonNull.length === 0) {
            throw new ContractProjectionError("Union must contain a non-null type for model projection", path);
        }
        if (nonNull.length === 1) {
            const base = buildWireNode({ ...schema, type: nonNull[0] }, root, path, refStack, localConstraints);
            return types.includes("null") ? makeNullable(base, path) : base;
        }
        for (const key of Object.keys(schema)) {
            if (!metadataKeywords.has(key) && key !== "type") {
                throw new ContractProjectionError(
                    `Union type array with shared keyword "${key}" is not portable for model output`,
                    path,
                );
            }
        }
        return {
            anyOf: types.map((type, index) =>
                buildWireNode({ type }, root, `${path}/anyOf/${index}`, refStack, localConstraints)),
        };
    }

    if (schema.type === "object") {
        if (schema.additionalProperties !== false) {
            throw new ContractProjectionError("Open objects are not portable for model output", path);
        }
        const localRequired = new Set(schema.required ?? []);
        const properties: Record<string, Record<string, unknown>> = {};
        for (const [name, property] of Object.entries(schema.properties ?? {})) {
            const propertyPath = `${path}/properties/${escapePointerSegment(name)}`;
            if (!localRequired.has(name) && schemaAllowsNull(property, root, new Set())) {
                throw new ContractProjectionError(
                    "Optional nullable properties are ambiguous for required-nullable model output",
                    propertyPath,
                );
            }
            const wireProperty = buildWireNode(property, root, propertyPath, refStack, localConstraints);
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
            items: buildWireNode(schema.items, root, `${path}/items`, refStack, localConstraints),
        };
    }

    if (schema.enum !== undefined || schema.const !== undefined) {
        return {
            ...(schema.type === undefined ? {} : { type: schema.type }),
            ...(schema.enum === undefined ? { const: schema.const } : { enum: [...schema.enum] }),
        };
    }

    if (schema.type === "string") {
        const keywords: ModelLocalConstraintKeyword[] = [];
        if (schema.pattern !== undefined) keywords.push("pattern");
        if (schema.minLength !== undefined) keywords.push("minLength");
        if (schema.maxLength !== undefined) keywords.push("maxLength");
        if (keywords.length > 0) localConstraints.push({ path, keywords });
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

    if (Object.keys(schema).length === 0) {
        throw new ContractProjectionError("Any JSON schema is not portable for model output", path);
    }
    throw new ContractProjectionError("Unsupported local schema node for model projection", path);
}

function assertOnlyMetadata(
    schema: ContractSchemaNode,
    path: string,
    allowed: string,
): void {
    for (const key of Object.keys(schema)) {
        if (key === allowed || metadataKeywords.has(key)) continue;
        throw new ContractProjectionError(
            `"${allowed}" must not combine with "${key}" for model projection`,
            path,
        );
    }
}

function makeNullable(schema: Record<string, unknown>, path: string): Record<string, unknown> {
    if (Array.isArray(schema.anyOf)) {
        if (schema.anyOf.some(branch => isNullBranch(branch))) return schema;
        return { anyOf: [...schema.anyOf, { type: "null" }] };
    }

    const nullable: Record<string, unknown> = { ...schema };
    if ("const" in nullable) {
        nullable.enum = [nullable.const, null];
        delete nullable.const;
    } else if (Array.isArray(nullable.enum) && !nullable.enum.includes(null)) {
        nullable.enum = [...nullable.enum, null];
    }

    if (typeof nullable.type === "string") {
        nullable.type = nullable.type === "null" ? "null" : [nullable.type, "null"];
        return nullable;
    }
    if (Array.isArray(nullable.type)) {
        if (!nullable.type.includes("null")) nullable.type = [...nullable.type, "null"];
        return nullable;
    }
    if (nullable.enum !== undefined) return nullable;
    throw new ContractProjectionError("Optional schema cannot be made nullable", path);
}

function isNullBranch(branch: unknown): boolean {
    return branch !== null
        && typeof branch === "object"
        && !Array.isArray(branch)
        && (branch as { readonly type?: unknown }).type === "null";
}

function schemaAllowsNull(
    schema: ContractSchemaNode,
    root: ContractSchemaNode,
    seen: Set<ContractSchemaNode>,
): boolean {
    let current = schema;
    const refs = new Set<string>();
    while (current.$ref !== undefined) {
        if (refs.has(current.$ref)) return false;
        refs.add(current.$ref);
        current = resolveSchema(current, root);
    }
    if (seen.has(current)) return false;
    seen.add(current);

    if (current.type === "null") return true;
    if (Array.isArray(current.type) && current.type.includes("null")) return true;
    if (current.const === null) return true;
    if (current.enum?.includes(null) === true) return true;
    if (current.anyOf?.some(branch => schemaAllowsNull(branch, root, seen)) === true) return true;
    return false;
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
    const resolution = resolveSchemaForValue(value, schema, root, path, { allowOptionalNull: true });
    if (!resolution.ok) return [...resolution.issues];
    const resolved = resolution.schema;
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
