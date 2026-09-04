/**
 * 基础 Parser 可产生的稳定 issue code。
 *
 * @remarks
 * 调用方应根据 code 和 path 分类错误，不应解析 message。联合、递归和 Contract
 * 定义检查所需的 code 会在对应能力实现时扩展。
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
    | "array_max_items";

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
