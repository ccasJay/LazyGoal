/**
 * 模型输出契约定义检查失败时抛出的配置错误。
 *
 * @remarks
 * 用于在网络调用或模型请求构建前拦截不合法、不可逆或不可移植的模型输出契约定义
 * （如 `optional(nullable(...))`、开放 record、递归结构或受限字符串约束）。
 *
 * @example
 * ```ts
 * throw new ModelOutputContractDefinitionError("optional(nullable(...)) is forbidden", ["path", "field"]);
 * ```
 */
export class ModelOutputContractDefinitionError extends Error {
    /** 契约定义错误的稳定顶层分类代码。 */
    readonly code = "INVALID_MODEL_OUTPUT_CONTRACT" as const;
    /** 在契约定义树中定位到错误节点的属性路径。 */
    readonly path: readonly (string | number)[];

    /**
     * @param message - 错误描述信息。
     * @param path - 从根契约节点到出错位置的路径。
     */
    constructor(message: string, path: readonly (string | number)[] = []) {
        super(message);
        this.name = "ModelOutputContractDefinitionError";
        this.path = Object.freeze([...path]);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
