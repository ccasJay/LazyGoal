import {
    compileJsonSchema,
    safeParse,
    type ContractIssue as AstContractIssue,
} from "../../contracts/src/index";
import {
    createContractBinding,
    type ContractBinding,
    type ContractIssue as BindingContractIssue,
    type ContractIssueCode,
    type ContractSchemaNode,
} from "../../contract-binding/src/index";
import type { ToolInputContract } from "../src/types";

/**
 * 从测试夹具的 Tool 输入 AST 创建 `ContractBinding` 替身。
 *
 * @remarks
 * 只供测试中的任意契约夹具构造隔离绑定；生产工具必须消费 Catalog 生成的
 * `typescript-binding`。本函数把夹具 AST 编译为本地 Schema 并复用共享绑定完成
 * 隔离复制、未知字段剥离和有界诊断，已知字段校验继续调用原 AST Parser。
 *
 * @param options - 契约身份、版本与测试夹具输入 AST。
 * @returns 与生成绑定结构相同的运行时绑定。
 * @throws 输入 AST 定义非法或共享绑定无法处理编译 Schema 时抛出异常。
 *
 * @example
 * ```ts
 * const binding = createTransitionalToolInputBinding<{ value: string }>({
 *     contractId: "test.sample",
 *     version: 1,
 *     contract: contract.object({ value: contract.string() }),
 * });
 * ```
 */
export function createTransitionalToolInputBinding<Input>(options: {
    readonly contractId: string;
    readonly version: number;
    readonly contract: ToolInputContract;
}): ContractBinding<Input> {
    const schema = compileJsonSchema(options.contract) as unknown as ContractSchemaNode;
    const base = createContractBinding<Input>({
        contractId: options.contractId,
        version: options.version,
        schema,
        validate: () => true,
    });

    const openSchema = containsOpenObject(schema);

    return {
        contractId: options.contractId,
        version: options.version,
        schema,
        read(value, policy) {
            if (openSchema) {
                const parsed = safeParse(options.contract, value);
                return parsed.success
                    ? { ok: true, data: parsed.data as Input }
                    : failure(options.contractId, options.version, parsed.issues, parsed.truncated);
            }

            const stripped = base.read(value, policy);
            if (!stripped.ok) return stripped;

            const parsed = safeParse(options.contract, stripped.data);
            if (parsed.success) return stripped;

            return failure(options.contractId, options.version, parsed.issues, parsed.truncated);
        },
        modelProjection() {
            return base.modelProjection();
        },
    };
}

function containsOpenObject(schema: ContractSchemaNode): boolean {
    if (schema.type === "object" && schema.additionalProperties !== false) return true;
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) return true;
    if (
        schema.type === undefined
        && schema.$ref === undefined
        && schema.properties === undefined
        && schema.items === undefined
        && schema.enum === undefined
        && schema.const === undefined
        && schema.additionalProperties === undefined
    ) {
        return true;
    }
    if (schema.items !== undefined && containsOpenObject(schema.items)) return true;
    return Object.values(schema.properties ?? {}).some(containsOpenObject);
}

function failure(
    contractId: string,
    version: number,
    issues: readonly AstContractIssue[],
    truncated: boolean,
): { readonly ok: false; readonly contractId: string; readonly version: number; readonly issues: readonly BindingContractIssue[]; readonly truncated: boolean } {
    return {
        ok: false,
        contractId,
        version,
        issues: issues.map(issue => ({
            path: toJsonPointer(issue.path),
            code: toBindingIssueCode(issue.code),
        })),
        truncated,
    };
}

function toBindingIssueCode(code: AstContractIssue["code"]): ContractIssueCode {
    switch (code) {
        case "missing_field":
            return "required";
        case "invalid_type":
        case "not_integer":
        case "not_safe_integer":
            return "type";
        case "invalid_literal":
            return "const";
        case "invalid_enum_value":
            return "enum";
        case "extra_field":
            return "unknown";
        case "string_min_length":
        case "string_max_length":
            return "length";
        case "string_pattern":
            return "pattern";
        case "number_minimum":
        case "number_maximum":
        case "array_min_items":
        case "array_max_items":
            return "range";
        case "union_no_match":
        case "unknown_discriminator":
        case "cyclic_value":
        case "max_depth_exceeded":
        default:
            return "constraint";
    }
}

function toJsonPointer(path: AstContractIssue["path"]): string {
    if (path.length === 0) return "";
    return "/" + path
        .map(segment => typeof segment === "number"
            ? String(segment)
            : segment.replaceAll("~", "~0").replaceAll("/", "~1"))
        .join("/");
}
