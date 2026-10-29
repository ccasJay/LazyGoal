/**
 * 核心 Contract AST、解析器、JSON Schema 编译器与确定性 JSON 原语。
 *
 * @remarks
 * 提供强类型的契约定义 DSL、运行时安全校验器以及确定性的 JSON Schema 2020-12 编译器。
 * 作为全仓无出站依赖的核心契约基础包，它还拥有共享的 canonical JSON、对象守卫与
 * 深冻结实现，不包含具体应用领域的模型交互或业务协议。
 *
 * @example
 * ```ts
 * import { contract, safeParse } from "@lazygoal/contracts";
 *
 * const User = contract.object({
 *     name: contract.string(),
 *     age: contract.optional(contract.integer()),
 * });
 *
 * const result = safeParse(User, { name: "Alice" });
 * ```
 *
 * @packageDocumentation
 */

export {
    canonicalizeJson,
    canonicalJson,
    compareCodeUnits,
    deepFreeze,
    isRecord,
} from "./json";
export type { CanonicalJsonOptions } from "./json";
export {
    contract,
} from "./contract";
export {
    parse,
    safeParse,
} from "./parser";
export {
    compileJsonSchema,
} from "./json-schema";
export {
    inspectContractNode,
    type ContractNodeInspection,
} from "./node-inspection";
export {
    ContractDefinitionError,
    ContractValidationError,
} from "./errors";
export type {
    ContractIssue,
    ContractIssueCode,
    ContractDefinitionReasonCode,
} from "./errors";
export type {
    ArrayOptions,
    Contract,
    ContractBuilders,
    ContractKind,
    InferContract,
    JsonScalar,
    JsonValue,
    LiteralContract,
    NumberOptions,
    ObjectContract,
    ObjectProperty,
    ObjectShape,
    OpenObjectContract,
    OptionalProperty,
    StringOptions,
    UnknownContract,
} from "./types";
export type { SafeParseResult } from "./parser";
export type {
    JsonSchema202012,
    JsonSchemaValue,
} from "./json-schema";
