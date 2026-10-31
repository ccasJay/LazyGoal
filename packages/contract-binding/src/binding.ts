import { ContractSchemaError } from "./errors";
import { cloneJsonValue, hasJsonPropertyShape, isJsonValue } from "./json";
import { createModelProjection, type ModelProjection } from "./projection";
import {
    escapePointerSegment,
    findUnknownPaths,
    resolveSchema,
    stripUnknownFields,
} from "./schema";
import type {
    ContractIssue,
    ContractIssueCode,
    ContractReadResult,
    ContractSchemaNode,
    UnknownFieldPolicy,
} from "./types";

const MAX_ISSUES = 32;
const MAX_PATH_LENGTH = 160;
const UNKNOWN_FIELD_PATH_SEGMENT = "*";

/**
 * 生成器提供的运行时校验函数。
 *
 * @remarks
 * 返回值只表示整体是否通过；失败时 Ajv 风格实现可以在 `errors` 上提供原始问题，
 * 绑定只读取 `instancePath`、`keyword` 与已声明属性名，不读取字段值。
 *
 * @example
 * ```ts
 * const validate: ContractValidator = value => typeof value === "object";
 * ```
 */
export interface ContractValidator {
    (value: unknown): boolean;
    readonly errors?: readonly unknown[] | null;
}

/**
 * 创建绑定所需的生成制品。
 *
 * @remarks
 * 身份、版本、Schema 与校验器都由生成器提供；业务模块不在此重复字段表。
 *
 * @example
 * ```ts
 * const definition: ContractBindingDefinition<Sample> = {
 *     contractId: "sample.tool", version: 1, schema, validate,
 * };
 * ```
 */
export interface ContractBindingDefinition<T> {
    readonly contractId: string;
    readonly version: number;
    readonly schema: ContractSchemaNode;
    readonly validate: ContractValidator;
}

/**
 * 类型化的数据契约运行时绑定。
 *
 * @remarks
 * `read` 总是返回与输入隔离的结果；未知字段策略由调用边界显式选择。联合在未清理
 * 输入上先确定唯一合法分支，再按该分支处理未知字段；无法唯一确定时失败。失败问题使用
 * `@lazygoal/contracts` 的共享 issue 分类，路径仍为 JSON Pointer。绑定不承载权限、
 * 审批、状态转换或持久化规则。
 *
 * @example
 * ```ts
 * const result = binding.read(value, "strip");
 * if (result.ok) consume(result.data);
 * ```
 */
export interface ContractBinding<T> {
    readonly contractId: string;
    readonly version: number;
    readonly schema: ContractSchemaNode;
    /**
     * @param value - 尚未信任的 JSON 值。
     * @param policy - `strip` 删除未知字段并返回诊断；`reject` 将其作为失败问题。
     * @returns 隔离后的类型化数据，或不含部分数据的失败问题。
     * @throws {@link ContractSchemaError} 契约 Schema 或生成校验器无法被绑定安全解释时抛出；
     * 调用方输入不会触发该错误。
     */
    read(value: unknown, policy: UnknownFieldPolicy): ContractReadResult<T>;
    /**
     * 从同源本地 Schema 派生模型 wire Schema 与 canonical 解码器。
     *
     * @returns 已成对验证的模型投影能力。
     * @throws 本地 Schema 无法无损转换为 Provider wire 形式时抛出 `ContractProjectionError`。
     */
    modelProjection(): ModelProjection<T>;
}

/**
 * 由生成制品创建类型化绑定。
 *
 * @param definition - 契约身份、版本、Schema 与校验器。
 * @returns 可复用的绑定实例。
 *
 * @example
 * ```ts
 * const binding = createContractBinding<Sample>({ contractId: "sample.tool", version: 1, schema, validate });
 * ```
 */
export function createContractBinding<T>(definition: ContractBindingDefinition<T>): ContractBinding<T> {
    let projection: ModelProjection<T> | undefined;
    const binding: ContractBinding<T> = {
        contractId: definition.contractId,
        version: definition.version,
        schema: definition.schema,
        read(value: unknown, policy: UnknownFieldPolicy): ContractReadResult<T> {
            return readContractValue(value, definition, policy);
        },
        modelProjection(): ModelProjection<T> {
            projection ??= createModelProjection(binding);
            return projection;
        },
    };
    return binding;
}

function readContractValue<T>(
    value: unknown,
    definition: ContractBindingDefinition<T>,
    policy: UnknownFieldPolicy,
): ContractReadResult<T> {
    if (!hasJsonPropertyShape(value) || !isJsonValue(value)) {
        return failure(definition, [{ path: "", code: "not_json" }], false);
    }

    const copied = cloneJsonValue(value);
    const unknown = findUnknownPaths(copied, definition.schema);
    if (unknown.issues !== undefined) {
        return failure(definition, unknown.issues, unknown.truncated);
    }
    if (policy === "strip" && !stripUnknownFields(copied, definition.schema)) {
        return failure(definition, [{ path: "", code: "union_no_match" }], false);
    }

    if (!definition.validate(copied)) {
        const issues = mapValidationErrors(readValidatorErrors(definition.validate), definition.schema);
        const merged = policy === "reject"
            ? mergeIssues(issues, unknown.paths.map(path => ({ path, code: "extra_field" as const })))
            : issues;
        return failure(definition, merged, unknown.truncated);
    }

    return {
        ok: true,
        data: copied as unknown as T,
        ...(unknown.paths.length === 0 ? {} : {
            diagnostic: {
                contractId: definition.contractId,
                version: definition.version,
                paths: unknown.paths,
                truncated: unknown.truncated,
            },
        }),
    };
}

interface RawValidationError {
    readonly instancePath?: unknown;
    readonly keyword?: unknown;
    readonly params?: Readonly<Record<string, unknown>>;
}

function readValidatorErrors(validate: ContractValidator): readonly RawValidationError[] {
    const errors = (validate as { readonly errors?: unknown }).errors;
    return Array.isArray(errors) ? errors as readonly RawValidationError[] : [];
}

function mapValidationErrors(
    errors: readonly RawValidationError[],
    rootSchema: ContractSchemaNode,
): readonly ContractIssue[] {
    const issues: ContractIssue[] = [];
    for (const error of errors) {
        const keyword = typeof error.keyword === "string" ? error.keyword : "";
        if (keyword === "additionalProperties") {
            // 未知字段路径由 findUnknownPaths 统一生成，避免 Ajv 回显外部键名。
            continue;
        }
        const basePath = typeof error.instancePath === "string"
            ? sanitizeInstancePath(error.instancePath, rootSchema)
            : "";
        const property = keyword === "required"
            ? readPropertyName(error.params, "missingProperty")
            : undefined;
        const path = property === undefined
            ? basePath
            : `${basePath}/${escapePointerSegment(property)}`;
        issues.push({ path: boundPath(path), code: issueCode(keyword, path) });
    }
    return boundIssues(issues);
}

/**
 * 把校验器位置映射为不含外部键名的有界路径。
 *
 * @remarks
 * 已声明属性名和数组下标保留；开放字典键及无法由 Schema 证明为声明的片段统一
 * 替换为 `*`。只使用 Schema 结构，不读取字段值。
 */
function sanitizeInstancePath(instancePath: string, rootSchema: ContractSchemaNode): string {
    if (instancePath === "") return "";
    if (!instancePath.startsWith("/")) return "";

    const segments: string[] = [];
    let schemas: readonly ContractSchemaNode[] = [rootSchema];
    for (const rawSegment of instancePath.slice(1).split("/")) {
        const segment = decodePointerSegment(rawSegment);
        const resolved = resolveSchemaSet(schemas, rootSchema);
        const declared = resolved.flatMap((schema) => {
            const properties = schema.properties;
            if (properties === undefined || !Object.hasOwn(properties, segment)) return [];
            return [properties[segment]!];
        });
        if (declared.length > 0) {
            segments.push(escapePointerSegment(segment));
            schemas = declared;
            continue;
        }

        if (isArrayIndex(segment)) {
            const items = resolved.flatMap(schema => schema.items === undefined ? [] : [schema.items]);
            if (items.length > 0) {
                segments.push(segment);
                schemas = items;
                continue;
            }
        }

        segments.push(UNKNOWN_FIELD_PATH_SEGMENT);
        schemas = resolved.flatMap(schema =>
            typeof schema.additionalProperties === "object"
                ? [schema.additionalProperties]
                : []
        );
    }
    return `/${segments.join("/")}`;
}

function resolveSchemaSet(
    schemas: readonly ContractSchemaNode[],
    rootSchema: ContractSchemaNode,
): readonly ContractSchemaNode[] {
    const resolved: ContractSchemaNode[] = [];
    const pending = [...schemas];
    while (pending.length > 0) {
        let node = pending.pop()!;
        const seenRefs = new Set<string>();
        while (node.$ref !== undefined) {
            if (seenRefs.has(node.$ref)) {
                node = {};
                break;
            }
            seenRefs.add(node.$ref);
            node = resolveSchema(node, rootSchema);
        }
        if (node.anyOf !== undefined) {
            pending.push(...node.anyOf);
            continue;
        }
        resolved.push(node);
    }
    return resolved;
}

function decodePointerSegment(segment: string): string {
    return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function isArrayIndex(segment: string): boolean {
    return /^(0|[1-9][0-9]*)$/.test(segment);
}

function readPropertyName(params: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
    const value = params?.[key];
    return typeof value === "string" ? value : undefined;
}

function issueCode(keyword: string, path: string): ContractIssueCode {
    switch (keyword) {
        case "required":
            return "missing_field";
        case "type":
            return "invalid_type";
        case "enum":
            return "invalid_enum_value";
        case "const":
            return "invalid_literal";
        case "minimum":
        case "exclusiveMinimum":
            return "number_minimum";
        case "maximum":
        case "exclusiveMaximum":
            return "number_maximum";
        case "minLength":
            return "string_min_length";
        case "maxLength":
            return "string_max_length";
        case "minItems":
            return "array_min_items";
        case "maxItems":
            return "array_max_items";
        case "pattern":
            return "string_pattern";
        case "anyOf":
            return "union_no_match";
        default:
            throw new ContractSchemaError(boundPath(path), `generated validator reported unclassified keyword "${keyword}"`);
    }
}

function mergeIssues(left: readonly ContractIssue[], right: readonly ContractIssue[]): readonly ContractIssue[] {
    return boundIssues([...left, ...right]);
}

function boundIssues(issues: readonly ContractIssue[]): readonly ContractIssue[] {
    const seen = new Set<string>();
    const result: ContractIssue[] = [];
    for (const issue of issues) {
        const key = `${issue.code}:${issue.path}`;
        if (issue.code !== "extra_field" && seen.has(key)) continue;
        seen.add(key);
        result.push({ path: boundPath(issue.path), code: issue.code });
        if (result.length >= MAX_ISSUES) break;
    }
    return result;
}

function boundPath(path: string): string {
    return path.length <= MAX_PATH_LENGTH ? path : `${path.slice(0, MAX_PATH_LENGTH - 1)}…`;
}

function failure<T>(
    definition: ContractBindingDefinition<T>,
    issues: readonly ContractIssue[],
    truncated: boolean,
): ContractReadResult<T> {
    const bounded = boundIssues(issues);
    if (bounded.length === 0) {
        throw new ContractSchemaError("", `${definition.contractId} validator reported a failure without a classified issue`);
    }
    return {
        ok: false,
        contractId: definition.contractId,
        version: definition.version,
        issues: bounded,
        truncated: truncated || bounded.length >= MAX_ISSUES,
    };
}
