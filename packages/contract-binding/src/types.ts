/**
 * 契约运行时绑定的公共类型。
 *
 * @remarks
 * 本模块只描述数据边界的身份、Schema、读取结果与问题定位；不承载权限、审批、
 * 状态转换或持久化规则。
 */

/** JSON 标量。 */
export type JsonScalar = null | boolean | number | string;

/** JSON 值。 */
export type JsonValue = JsonScalar | readonly JsonValue[] | { readonly [key: string]: JsonValue };

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
 * 读取失败或未知字段问题的稳定分类。
 *
 * @remarks
 * 分类不包含字段值；路径指向 JSON Pointer 位置，已声明的属性名可以出现在路径中。
 */
export type ContractIssueCode =
    | "json"
    | "required"
    | "type"
    | "enum"
    | "const"
    | "range"
    | "length"
    | "pattern"
    | "union"
    | "constraint"
    | "unknown";

/**
 * 单条读取问题。
 *
 * @example
 * ```ts
 * const issue: ContractIssue = { path: "/nested/count", code: "type" };
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
 *
 * @example
 * ```ts
 * const diagnostic: ContractDiagnostic = {
 *     contractId: "sample.tool", version: 1, paths: ["/debug"], truncated: false,
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
