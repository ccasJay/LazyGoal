/**
 * 全仓共享的确定性 JSON 原语、JSON 静态类型与契约校验诊断。
 *
 * @remarks
 * 本包保持零出站依赖，浏览器与 Node 运行时使用同一实现。它拥有 canonical JSON、
 * 对象守卫、深冻结、代码单元比较与共享校验错误，不包含 Contract DSL、解析器、
 * AST、Schema 编译器或具体业务协议。
 *
 * @example
 * ```ts
 * import { canonicalJson, isRecord } from "@lazygoal/contracts";
 *
 * const text = canonicalJson({ b: 1, a: 2 });
 * // '{"a":2,"b":1}'
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
    ContractValidationError,
} from "./errors";
export type {
    ContractIssue,
    ContractIssueCode,
} from "./errors";
export type {
    JsonScalar,
    JsonSchema202012,
    JsonSchemaValue,
    JsonValue,
} from "./types";
