/**
 * 类型化数据契约的运行时绑定。
 *
 * @remarks
 * 本包只拥有数据边界的身份、版本、本地 Schema、联合分支选择、读取策略与安全诊断；
 * 不拥有 Web、Runtime、Storage、工具实现或旧 Contract AST。生成器负责从 TS 类型
 * 生成 Schema 与校验器，绑定在运行时读取已生成制品。
 *
 * @example
 * ```ts
 * const result = binding.read(value, "strip");
 * ```
 *
 * @packageDocumentation
 */

export {
    createContractBinding,
} from "./binding";
export type {
    ContractBinding,
    ContractBindingDefinition,
    ContractValidator,
} from "./binding";
export { ContractSchemaError } from "./errors";
export {
    ContractProjectionError,
    createModelProjection,
    deriveModelWireSchema,
} from "./projection";
export type {
    ModelLocalConstraint,
    ModelLocalConstraintKeyword,
    ModelProjection,
    ModelWireSchema,
} from "./projection";
export type {
    ContractDiagnostic,
    ContractIssue,
    ContractIssueCode,
    ContractReadResult,
    ContractSchemaNode,
    ContractSchemaType,
    JsonScalar,
    JsonValue,
    UnknownFieldPolicy,
} from "./types";
