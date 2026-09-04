/**
 * Parser 可产生的稳定 issue code。
 *
 * @remarks
 * 调用方应根据 code 和 path 分类错误，不应解析 message。递归输入使用对应的 issue code；
 * Contract 定义错误使用独立的 `reasonCode`，不混入输入校验 issue。
 */
export type ContractIssueCode =
    | "invalid_type"
    | "invalid_literal"
    | "invalid_enum_value"
    | "missing_field"
    | "extra_field"
    | "string_min_length"
    | "string_max_length"
    | "string_pattern"
    | "number_minimum"
    | "number_maximum"
    | "not_integer"
    | "not_safe_integer"
    | "array_min_items"
    | "array_max_items"
    | "union_no_match"
    | "unknown_discriminator"
    | "cyclic_value"
    | "max_depth_exceeded";

/** Contract AST 图检查失败时用于稳定分类的原因。 */
export type ContractDefinitionReasonCode =
    | "INVALID_NODE"
    | "INVALID_OPTIONAL_POSITION"
    | "INVALID_RECURSIVE_NAME"
    | "DUPLICATE_RECURSIVE_NAME"
    | "DANGLING_RECURSIVE_REFERENCE"
    | "UNGUARDED_RECURSION";

/**
 * 一条定位到输入路径的 Contract 校验诊断。
 *
 * @remarks
 * `path` 从根输入的空数组开始，对象字段使用字符串、数组元素使用数字。实例及其
 * path 均由 Parser 独立创建，调用方修改原始输入不会改变诊断内容。
 *
 * @example
 * ```ts
 * const issue: ContractIssue = {
 *     code: "missing_field",
 *     path: ["name"],
 *     message: "Required field is missing",
 * };
 * ```
 */
export interface ContractIssue {
    /** 不依赖 message 的稳定分类标识。 */
    readonly code: ContractIssueCode;
    /** 从根输入到失败位置的字段或数组索引。 */
    readonly path: readonly (string | number)[];
    /** 面向诊断展示的稳定英文消息。 */
    readonly message: string;
}

/**
 * `parse` 在输入不符合 Contract 时抛出的校验错误。
 *
 * @remarks
 * `issues` 与 `safeParse` 的失败结果使用相同的 code、path、message 和顺序；Contract
 * 配置错误不使用此错误类型。
 *
 * @example
 * ```ts
 * try {
 *     parse(contract.object({ name: contract.string() }), {});
 * } catch (error) {
 *     if (error instanceof ContractValidationError) {
 *         console.log(error.issues[0]?.path);
 *     }
 * }
 * ```
 */
export class ContractValidationError extends Error {
    /** 校验失败的顶层错误标识。 */
    readonly code = "CONTRACT_VALIDATION_FAILED" as const;
    /** 输入中的全部校验诊断。 */
    readonly issues: readonly ContractIssue[];
    /** 是否因达到单次诊断上限而停止遍历。 */
    readonly truncated: boolean;

    /**
     * @param issues - 已收集的不可变校验诊断。
     * @param truncated - 是否因诊断上限截断了后续遍历。
     */
    constructor(issues: readonly ContractIssue[], truncated: boolean) {
        super("Contract validation failed");
        this.name = "ContractValidationError";
        this.issues = Object.freeze([...issues]);
        this.truncated = truncated;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Contract AST 在消费前未通过完整定义检查时抛出的配置错误。
 *
 * @remarks
 * `code` 用于识别错误类别，`reasonCode` 用于区分节点、递归引用和递归保护问题；此错误
 * 不代表某个输入值校验失败。
 *
 * @example
 * ```ts
 * try {
 *     safeParse(contract.recursive("Node", (self) => self), null);
 * } catch (error) {
 *     if (error instanceof ContractDefinitionError) {
 *         console.log(error.reasonCode);
 *     }
 * }
 * ```
 */
export class ContractDefinitionError extends Error {
    /** Contract 定义错误的顶层标识。 */
    readonly code = "INVALID_CONTRACT_DEFINITION" as const;
    /** 用于稳定分类的定义错误原因。 */
    readonly reasonCode: ContractDefinitionReasonCode;
    /** 定义图中检测到问题的路径。 */
    readonly path: readonly (string | number)[];

    /**
     * @param reasonCode - 稳定的定义错误原因。
     * @param message - 面向诊断展示的英文消息。
     * @param path - 从根 Contract 到问题节点的路径。
     */
    constructor(
        reasonCode: ContractDefinitionReasonCode,
        message: string,
        path: readonly (string | number)[] = [],
    ) {
        super(message);
        this.name = "ContractDefinitionError";
        this.reasonCode = reasonCode;
        this.path = Object.freeze([...path]);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
