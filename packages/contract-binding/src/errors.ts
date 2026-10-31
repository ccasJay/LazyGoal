/**
 * 契约 Schema 无法被绑定安全解释时抛出的进程内错误。
 *
 * @remarks
 * 只表示生成制品与绑定能力不匹配，例如无法消费值的 `$ref` 别名环、生成校验器给出的
 * 无法分类的关键字，或 Schema 中的正则表达式无效。调用方输入永远不会触发该错误，
 * 因此它不携带 issue 列表，也不会进入模型可见的纠错反馈：读取时抛出说明该契约在当前
 * 构建下不可用，而不是输入不合法。
 *
 * @example
 * ```ts
 * try {
 *     binding.read(value, "strip");
 * } catch (error) {
 *     if (error instanceof ContractSchemaError) console.error(error.detail, error.path);
 * }
 * ```
 */
export class ContractSchemaError extends Error {
    /** 调用方可稳定判断的错误标识。 */
    readonly code = "CONTRACT_SCHEMA_INVALID" as const;

    /**
     * @param path - 检出问题的值路径 JSON Pointer；与具体值无关时为 `""`。
     * @param detail - 不符合要求的 Schema 结构或关键字。
     */
    constructor(
        /** 检出问题的值路径 JSON Pointer。 */
        readonly path: string,
        /** 无法解释的 Schema 结构或关键字。 */
        readonly detail: string,
    ) {
        super(`Contract schema is not usable by the binding: ${detail}${path === "" ? "" : ` at ${path}`}`);
        this.name = "ContractSchemaError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
