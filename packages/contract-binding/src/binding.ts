import { cloneJsonValue, hasJsonPropertyShape, isJsonValue } from "./json";
import { createModelProjection, type ModelProjection } from "./projection";
import { escapePointerSegment, findUnknownPaths, stripUnknownFields } from "./schema";
import type {
    ContractIssue,
    ContractIssueCode,
    ContractReadResult,
    ContractSchemaNode,
    UnknownFieldPolicy,
} from "./types";

const MAX_ISSUES = 32;
const MAX_PATH_LENGTH = 160;

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
 * `read` 总是返回与输入隔离的结果；未知字段策略由调用边界显式选择。绑定不承载
 * 权限、审批、状态转换或持久化规则。
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
        return failure(definition, [{ path: "", code: "json" }], false);
    }

    const copied = cloneJsonValue(value);
    const unknown = findUnknownPaths(copied, definition.schema);
    if (policy === "strip") stripUnknownFields(copied, definition.schema);

    if (!definition.validate(copied)) {
        const issues = mapValidationErrors(readValidatorErrors(definition.validate));
        const merged = policy === "reject"
            ? mergeIssues(issues, unknown.paths.map(path => ({ path, code: "unknown" as const })))
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

function mapValidationErrors(errors: readonly RawValidationError[]): readonly ContractIssue[] {
    const issues = errors.map(error => {
        const keyword = typeof error.keyword === "string" ? error.keyword : "";
        const basePath = typeof error.instancePath === "string" ? error.instancePath : "";
        const property = keyword === "required"
            ? readPropertyName(error.params, "missingProperty")
            : keyword === "additionalProperties"
                ? readPropertyName(error.params, "additionalProperty")
                : undefined;
        const path = property === undefined
            ? basePath
            : `${basePath}/${escapePointerSegment(property)}`;
        return { path: boundPath(path), code: issueCode(keyword) };
    });
    return boundIssues(issues);
}

function readPropertyName(params: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
    const value = params?.[key];
    return typeof value === "string" ? value : undefined;
}

function issueCode(keyword: string): ContractIssueCode {
    switch (keyword) {
        case "required":
            return "required";
        case "additionalProperties":
            return "unknown";
        case "type":
            return "type";
        case "enum":
            return "enum";
        case "const":
            return "const";
        case "minimum":
        case "maximum":
        case "exclusiveMinimum":
        case "exclusiveMaximum":
        case "multipleOf":
            return "range";
        case "minLength":
        case "maxLength":
            return "length";
        case "pattern":
            return "pattern";
        default:
            return "constraint";
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

function failure<T>(
    definition: ContractBindingDefinition<T>,
    issues: readonly ContractIssue[],
    truncated: boolean,
): ContractReadResult<T> {
    const bounded = boundIssues(issues);
    return {
        ok: false,
        contractId: definition.contractId,
        version: definition.version,
        issues: bounded.length === 0 ? [{ path: "", code: "constraint" }] : bounded,
        truncated: truncated || bounded.length >= MAX_ISSUES,
    };
}
