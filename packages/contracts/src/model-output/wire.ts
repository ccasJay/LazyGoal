import { contract } from "../contract";
import { safeParse } from "../parser";
import { ContractValidationError } from "../errors";
import { isContractNode, isOptionalPropertyNode } from "../internal";
import type {
    ArrayOptions,
    Contract,
    ContractKind,
    JsonScalar,
    NumberOptions,
    ObjectContract,
    ObjectShape,
    StringOptions,
} from "../types";
import { ModelOutputContractDefinitionError } from "./errors";

type RuntimeContract = Omit<Contract<unknown>, "kind"> & Readonly<Record<PropertyKey, unknown>> & {
    readonly kind: ContractKind;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 将 Canonical Contract 节点递归转换为 required-nullable Wire Contract 节点。
 *
 * @param node - 待转换的 Canonical Contract AST 节点。
 * @param path - 当前节点在契约定义树中的路径。
 * @returns 派生出的 Wire Contract 节点。
 * @throws 遇到不可逆或不可移植定义（如 `optional(nullable(...))`、开放 record 或不可移植字符串约束）时抛出异常。
 */
function deriveWireNode(
    node: unknown,
    path: readonly (string | number)[],
): Contract<unknown> {
    if (!isContractNode(node)) {
        throw new ModelOutputContractDefinitionError("Invalid Contract node", path);
    }

    const runtimeNode = node as unknown as RuntimeContract;

    switch (runtimeNode.kind) {
        case "string": {
            const options = runtimeNode.options as StringOptions | undefined;
            if (
                options?.pattern !== undefined
                || options?.minLength !== undefined
                || options?.maxLength !== undefined
            ) {
                throw new ModelOutputContractDefinitionError(
                    "String length constraints and patterns are not portable for model output contracts",
                    path,
                );
            }
            return contract.string();
        }
        case "number":
            return contract.number(runtimeNode.options as NumberOptions | undefined);
        case "integer":
            return contract.integer(runtimeNode.options as NumberOptions | undefined);
        case "boolean":
            return contract.boolean();
        case "null":
            return contract.null();
        case "literal":
            return contract.enum([runtimeNode.value as JsonScalar]);
        case "enum": {
            const values = runtimeNode.values as readonly [JsonScalar, ...JsonScalar[]];
            return contract.enum(values);
        }
        case "array": {
            const wireItems = deriveWireNode(runtimeNode.items, [...path, "items"]);
            return contract.array(wireItems, runtimeNode.options as ArrayOptions | undefined);
        }
        case "nullable": {
            const wireInner = deriveWireNode(runtimeNode.inner, [...path, "inner"]);
            return contract.nullable(wireInner);
        }
        case "record":
            throw new ModelOutputContractDefinitionError(
                "Dynamic record is not supported in model output contracts",
                path,
            );
        case "recursive":
        case "recursiveRef":
            throw new ModelOutputContractDefinitionError(
                "Recursive contracts are not supported in model output contracts",
                path,
            );
        case "union": {
            const branches = runtimeNode.branches as readonly Contract<unknown>[];
            if (branches.length === 0) {
                throw new ModelOutputContractDefinitionError("Union branches must be non-empty", path);
            }
            const wireBranches = branches.map((b, i) =>
                deriveWireNode(b, [...path, "branches", i]),
            );
            return contract.union(wireBranches as unknown as readonly [Contract<unknown>, ...Contract<unknown>[]]);
        }
        case "discriminatedUnion": {
            const branches = runtimeNode.branches as readonly ObjectContract<ObjectShape>[];
            if (branches.length === 0) {
                throw new ModelOutputContractDefinitionError("Discriminated union branches must be non-empty", path);
            }
            const wireBranches = branches.map((branch, i) =>
                deriveWireObject(branch, [...path, "branches", i]),
            );
            return contract.union(wireBranches as unknown as readonly [Contract<unknown>, ...Contract<unknown>[]]);
        }
        case "object":
            return deriveWireObject(node as unknown as ObjectContract<ObjectShape>, path);
        default:
            throw new ModelOutputContractDefinitionError(
                `Unsupported contract node kind "${String(runtimeNode.kind)}"`,
                path,
            );
    }
}

/**
 * 将 Canonical Object Contract 转换为每个属性都必填的 Wire Object Contract。
 *
 * @remarks
 * 原本为 `optional(T)` 的属性会转换为必填的 `nullable(wireT)`，
 * 若发现 `optional(nullable(...))` 则拒绝。
 */
function deriveWireObject(
    objectNode: ObjectContract<ObjectShape>,
    path: readonly (string | number)[],
): ObjectContract<ObjectShape> {
    const wireShape: Record<string, Contract<unknown>> = {};

    for (const [key, prop] of Object.entries(objectNode.shape)) {
        const propPath = [...path, key];
        if (isOptionalPropertyNode(prop)) {
            const inner = prop.inner;
            if (isContractNode(inner) && (inner as unknown as RuntimeContract).kind === "nullable") {
                throw new ModelOutputContractDefinitionError(
                    "optional(nullable(...)) is ambiguous and forbidden in wire contract",
                    propPath,
                );
            }
            const wireInner = deriveWireNode(inner, propPath);
            wireShape[key] = contract.nullable(wireInner);
        } else if (isContractNode(prop)) {
            wireShape[key] = deriveWireNode(prop, propPath);
        } else {
            throw new ModelOutputContractDefinitionError("Invalid object property node", propPath);
        }
    }

    return contract.object(wireShape);
}

/**
 * 从 Canonical Contract 派生出递归 required-nullable 的 Wire Contract。
 *
 * @param canonicalContract - 领域的 Canonical Contract。
 * @returns 对应的 Wire Contract，其中所有 optional 属性均已转为 required-nullable。
 * @throws 遇到不可逆（如 `optional(nullable(...))`）或不可移植定义时抛出 `ModelOutputContractDefinitionError`。
 *
 * @example
 * ```ts
 * const wireContract = deriveWireContract(GoalTaskContract);
 * ```
 */
export function deriveWireContract<Result>(
    canonicalContract: Contract<Result>,
): Contract<unknown> {
    return deriveWireNode(canonicalContract, []);
}

/**
 * 从 Canonical Contract 派生出严格包裹在 `{"result": ...}` envelope 中的 Wire Contract。
 *
 * @param canonicalContract - 领域的 Canonical Contract。
 * @returns 仅包含必填 `result` 字段的 strict object Wire Contract。
 * @throws 遇到不可逆或不可移植定义时抛出 `ModelOutputContractDefinitionError`。
 *
 * @example
 * ```ts
 * const envelopeContract = deriveWireEnvelopeContract(PreparationResultContract);
 * ```
 */
export function deriveWireEnvelopeContract<Result>(
    canonicalContract: Contract<Result>,
): ObjectContract<{ readonly result: Contract<unknown> }> {
    const wireResult = deriveWireNode(canonicalContract, ["result"]);
    return contract.object({
        result: wireResult,
    });
}

/**
 * 检查某个 object contract 分支是否与当前的 input 对象相匹配。
 */
function isMatchingBranch(branch: RuntimeContract, value: Record<string, unknown>): boolean {
    if (branch.kind !== "object" || !isObjectRecord(branch.shape)) {
        return false;
    }
    const shape = branch.shape as Record<string, unknown>;

    // 检查是否有字面量判别字段（例如 kind）
    if ("kind" in shape && "kind" in value) {
        const kindProp = shape.kind as RuntimeContract;
        if (kindProp.kind === "literal" && kindProp.value !== value.kind) {
            return false;
        }
    }

    // 针对 tool_call 特殊匹配：检查 action.toolId
    if (value.kind === "tool_call" && "action" in shape && isObjectRecord(value.action)) {
        const actionProp = shape.action as RuntimeContract;
        if (actionProp.kind === "object" && isObjectRecord(actionProp.shape)) {
            const actionShape = actionProp.shape as Record<string, unknown>;
            if ("toolId" in actionShape && "toolId" in value.action) {
                const toolIdProp = actionShape.toolId as RuntimeContract;
                if (toolIdProp.kind === "literal" && toolIdProp.value !== value.action.toolId) {
                    return false;
                }
            }
        }
    }

    return true;
}

/**
 * 递归沿 Canonical 契约树遍历以消除 Wire 数据中由 optional 派生的占位 null，保留合法业务 null。
 */
function decodeNode(
    canonicalNode: unknown,
    value: unknown,
    path: readonly (string | number)[],
): unknown {
    if (!isContractNode(canonicalNode)) {
        return value;
    }

    const runtimeNode = canonicalNode as unknown as RuntimeContract;

    switch (runtimeNode.kind) {
        case "object": {
            if (!isObjectRecord(value)) {
                return value;
            }
            const decoded: Record<string, unknown> = {};
            const shape = (canonicalNode as unknown as ObjectContract<ObjectShape>).shape;

            for (const [key, prop] of Object.entries(shape)) {
                if (isOptionalPropertyNode(prop)) {
                    if (key in value) {
                        const propVal = value[key];
                        if (propVal === null) {
                            // 消除由 optional 派生引入的占位 null，在结果对象中省略该属性
                            continue;
                        }
                        if (propVal !== undefined) {
                            decoded[key] = decodeNode(prop.inner, propVal, [...path, key]);
                        }
                    }
                } else if (isContractNode(prop)) {
                    if (key in value) {
                        const propVal = value[key];
                        // 必选字段即使为 null（如 Fact value: null 或 nullable），原样解码保留
                        decoded[key] = decodeNode(prop, propVal, [...path, key]);
                    }
                }
            }

            // 保留额外的未声明属性，以便后续 canonical safeParse 能产生规范的 extra_field 诊断
            for (const key of Object.keys(value)) {
                if (!(key in shape)) {
                    decoded[key] = value[key];
                }
            }

            return decoded;
        }
        case "discriminatedUnion": {
            if (!isObjectRecord(value)) {
                return value;
            }
            const discriminator = runtimeNode.discriminator as string;
            const tag = value[discriminator];
            const branches = runtimeNode.branches as readonly ObjectContract<ObjectShape>[];
            const matchingBranch = branches.find((branch) => {
                const tagProp = branch.shape[discriminator] as unknown as RuntimeContract | undefined;
                return tagProp !== undefined && tagProp.kind === "literal" && tagProp.value === tag;
            });
            if (matchingBranch !== undefined) {
                return decodeNode(matchingBranch, value, path);
            }
            return value;
        }
        case "union": {
            if (Array.isArray(value)) {
                const branches = runtimeNode.branches as readonly Contract<unknown>[];
                const arrayBranch = branches.find((b) => (b as unknown as RuntimeContract).kind === "array");
                if (arrayBranch !== undefined) {
                    return decodeNode(arrayBranch, value, path);
                }
            }
            if (isObjectRecord(value)) {
                const branches = runtimeNode.branches as readonly Contract<unknown>[];
                const matchingBranch = branches.find((b) => isMatchingBranch(b as unknown as RuntimeContract, value));
                if (matchingBranch !== undefined) {
                    return decodeNode(matchingBranch, value, path);
                }
            }
            return value;
        }
        case "array": {
            if (!Array.isArray(value)) {
                return value;
            }
            const itemNode = runtimeNode.items;
            return value.map((item, index) => decodeNode(itemNode, item, [...path, index]));
        }
        case "nullable": {
            if (value === null) {
                return null;
            }
            return decodeNode(runtimeNode.inner, value, path);
        }
        default:
            return value;
    }
}

/**
 * 将包含 `result` envelope 的 Wire 结构解码为 Canonical 领域结果。
 *
 * @remarks
 * 1. 严格校验外层 envelope（拒绝无 envelope、缺少 `result` 或存在额外顶层属性的响应）；
 * 2. 递归消除由 optional 派生的占位 `null`，严格保留业务合法 `null`；
 * 3. 解码完成后以请求专用 Canonical Contract 执行复验和深复制，彻底切断模型输入引用。
 *
 * @param wireValue - 包含 `{"result": ...}` 的模型原始响应数据。
 * @param canonicalContract - 当前请求对应的目标 Canonical Contract。
 * @returns 解码并通过 Canonical 验证的深复制只读领域对象。
 * @throws 结构不符合 envelope 或 Canonical 校验失败时抛出 `ContractValidationError`。
 *
 * @example
 * ```ts
 * const result = decodeWireResult(wireJson, PreparationResultContract);
 * ```
 */
export function decodeWireResult<Result>(
    wireValue: unknown,
    canonicalContract: Contract<Result>,
): Result {
    if (!isObjectRecord(wireValue) || !("result" in wireValue)) {
        throw new ContractValidationError(
            [
                {
                    code: "missing_field",
                    path: ["result"],
                    message: "Required envelope field 'result' is missing",
                },
            ],
            false,
        );
    }

    const extraKeys = Object.keys(wireValue).filter((key) => key !== "result");
    if (extraKeys.length > 0) {
        throw new ContractValidationError(
            extraKeys.map((key) => ({
                code: "extra_field",
                path: [key],
                message: `Unexpected extra field "${key}" in envelope`,
            })),
            false,
        );
    }

    const rawResult = wireValue.result;
    const decodedInner = decodeNode(canonicalContract, rawResult, ["result"]);
    const parsed = safeParse(canonicalContract, decodedInner);

    if (!parsed.success) {
        throw new ContractValidationError(parsed.issues, parsed.truncated);
    }

    return parsed.data;
}
