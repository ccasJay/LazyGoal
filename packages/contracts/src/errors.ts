/**
 * 生成绑定与模型输出契约共享的校验诊断。
 *
 * @remarks
 * 本模块只定义稳定的失败分类、路径与错误容器；它不执行结构解析，也不拥有具体
 * 边界的接受范围。调用方应根据 `code` 与 `path` 分类错误，不应解析 `message`。
 */

/**
 * 契约校验可产生的稳定 issue code。
 *
 * @remarks
 * 该词汇由本包拥有，生成绑定的读取结果与模型输出语义校验都直接产生其中的分类，
 * 不再由各消费边界自行翻译。数值与长度约束区分上下界和容器类型，因此消费方可以把
 * 分类直接映射为纠错方向，而不必解析消息。面向展示的消息由各产生边界自行提供。
 *
 * 未由任何边界产生的分类保留为共享词汇：删减它们会让已发布分类的稳定性依赖当前
 * 实现细节。
 */
export type ContractIssueCode =
    | "not_json"
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

/**
 * 一条定位到输入路径的契约校验诊断。
 *
 * @remarks
 * `path` 从根输入的空数组开始，对象字段使用字符串、数组元素使用数字。实例及其
 * path 由产生诊断的边界独立创建，调用方修改原始输入不会改变诊断内容。
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
 * 契约校验失败时抛出的共享错误。
 *
 * @remarks
 * 模型输出生成绑定解码、语义校验与工具参数校验使用该错误携带全部诊断；`issues`
 * 的顺序与产生边界一致，`truncated` 表示诊断被有界截断。契约配置错误不使用此类型。
 *
 * @example
 * ```ts
 * try {
 *     decode(value);
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
