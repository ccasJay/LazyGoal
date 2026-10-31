/** JSON 协议允许的标量值。 */
export type JsonScalar = null | boolean | number | string;

/**
 * 数据边界可见的 JSON 值。
 *
 * @remarks
 * 数组与对象均以只读形式表示；该类型只描述静态形状，不承诺运行时已校验有限数字、
 * 普通对象原型或无循环引用。需要这些保证的边界仍须执行各自的读取规则。
 *
 * @example
 * ```ts
 * const value: JsonValue = { id: "goal-1", tags: ["active"] };
 * ```
 */
export type JsonValue =
    | JsonScalar
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };

/**
 * JSON Schema 文档中的 JSON 兼容值。
 *
 * @remarks
 * 用于表达 Schema 节点自身可为字符串、数组或对象；它不是业务数据的类型约束。
 *
 * @example
 * ```ts
 * const keyword: JsonSchemaValue = { type: "string" };
 * ```
 */
export type JsonSchemaValue =
    | JsonScalar
    | readonly JsonSchemaValue[]
    | { readonly [key: string]: JsonSchemaValue };

/**
 * 生成绑定与模型投影共享的 JSON Schema 根对象。
 *
 * @remarks
 * 该类型只描述只读的 JSON-compatible 视图，不承诺具体方言关键字、可移植性或已经
 * 通过生成器校验；调用方按所属边界的 Schema 规则解释内容。
 *
 * @example
 * ```ts
 * const schema: JsonSchema202012 = { type: "object", additionalProperties: false };
 * ```
 */
export type JsonSchema202012 = Readonly<Record<string, JsonSchemaValue>>;
