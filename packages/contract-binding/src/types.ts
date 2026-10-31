/**
 * 契约运行时绑定的公共类型。
 *
 * @remarks
 * 本模块只描述数据边界的身份、Schema、读取结果与问题定位；不承载权限、审批、
 * 状态转换或持久化规则。JSON 值与 issue 分类的权威定义在 `@lazygoal/contracts`，
 * 本包只按读取边界重新导出，不另立词汇。
 */

import type { ContractIssueCode, JsonScalar, JsonValue } from "../../contracts/src/index";

export type { ContractIssueCode, JsonScalar, JsonValue } from "../../contracts/src/index";

/** JSON Schema 基础类型。 */
export type ContractSchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

/**
 * 绑定读取时使用的未知字段策略。
 *
 * @remarks
 * `strip` 从隔离副本删除未声明字段并返回有界诊断；`reject` 将未声明字段作为失败问题。
 *
 * @example
 * ```ts
 * const policy: UnknownFieldPolicy = "strip";
 * ```
 */
export type UnknownFieldPolicy = "strip" | "reject";

/**
 * 绑定支持的 JSON Schema 节点。
 *
 * @remarks
 * 只描述生成器实际产出的本地 Schema；读取器不维护字段表，也不把该类型当作新的
 * 字段 DSL。`anyOf` 表示联合，`type` 数组表示标量联合或可空字段，
 * `additionalProperties` 为 `true` 或 Schema 时表示开放对象，`minItems`/`maxItems`
 * 表示数组长度边界。模型投影会进一步限制可移植子集。
 *
 * @example
 * ```ts
 * const schema: ContractSchemaNode = {
 *     type: "object",
 *     properties: { id: { type: "string" } },
 *     required: ["id"],
 *     additionalProperties: false,
 * };
 * ```
 */
export interface ContractSchemaNode {
    readonly $schema?: string;
    readonly $id?: string;
    readonly $ref?: string;
    readonly definitions?: Readonly<Record<string, ContractSchemaNode>>;
    readonly type?: ContractSchemaType | readonly ContractSchemaType[];
    readonly properties?: Readonly<Record<string, ContractSchemaNode>>;
    readonly required?: readonly string[];
    readonly additionalProperties?: boolean | ContractSchemaNode;
    readonly items?: ContractSchemaNode;
    readonly minItems?: number;
    readonly maxItems?: number;
    readonly anyOf?: readonly ContractSchemaNode[];
    readonly pattern?: string;
    readonly const?: JsonScalar;
    readonly enum?: readonly JsonScalar[];
    readonly minimum?: number;
    readonly maximum?: number;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly description?: string;
}

/**
 * 单条读取问题。
 *
 * 与 `@lazygoal/contracts` 的 `ContractIssue` 同名但形状不同：绑定用 JSON Pointer
 * 字符串定位、不带消息；共享诊断用路径段数组并携带面向展示的消息。跨边界时必须
 * 转换路径，不得只改类型标注。
 *
 * @example
 * ```ts
 * const issue: ContractIssue = { path: "/nested/count", code: "number_minimum" };
 * ```
 */
export interface ContractIssue {
    readonly path: string;
    readonly code: ContractIssueCode;
}

/**
 * 成功读取时剥离未知字段的安全诊断。
 *
 * @remarks
 * 只包含契约身份、版本和有界 JSON Pointer 路径，不包含字段值、原始载荷或异常消息。
 * 已声明属性名可以出现在路径中；未声明属性名与开放对象键名统一使用 `*` 片段，
 * 因此外部键名不会进入日志。同一层级有多个未知字段时允许出现重复路径。
 *
 * @example
 * ```ts
 * const diagnostic: ContractDiagnostic = {
 *     contractId: "sample.tool", version: 1, paths: ["/*"], truncated: false,
 * };
 * ```
 */
export interface ContractDiagnostic {
    readonly contractId: string;
    readonly version: number;
    readonly paths: readonly string[];
    readonly truncated: boolean;
}

/**
 * 绑定读取结果。
 *
 * @remarks
 * 成功结果的数据与输入隔离；失败结果只含问题列表，不返回部分数据。`truncated`
 * 表示问题或诊断路径被有界截断。
 *
 * @example
 * ```ts
 * const result: ContractReadResult<{ id: string }> = binding.read(value, "strip");
 * if (result.ok) console.log(result.data.id);
 * ```
 */
export type ContractReadResult<T> =
    | {
        readonly ok: true;
        readonly data: T;
        readonly diagnostic?: ContractDiagnostic;
    }
    | {
        readonly ok: false;
        readonly contractId: string;
        readonly version: number;
        readonly issues: readonly ContractIssue[];
        readonly truncated: boolean;
    };
