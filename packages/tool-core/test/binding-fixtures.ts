import Ajv from "ajv";
import {
    createContractBinding,
    type ContractBinding,
    type ContractSchemaNode,
} from "../../contract-binding/src/index";
import type { JsonValue } from "../../contracts/src/index";
import type { BoundToolDefinition } from "../src/index";

/**
 * 为测试夹具创建只含 JSON Schema 的输入绑定。
 *
 * @remarks
 * 生产工具必须使用 Catalog 生成的 `typescript-binding`；本辅助函数只用于构造
 * Runtime、模型投影或 Worker 测试所需的任意输入边界，不读取旧 Contract AST。
 *
 * @param contractId - 测试绑定的稳定身份。
 * @param schema - 已闭合的本地 JSON Schema。
 * @returns 与生成绑定结构一致的运行时绑定。
 * @example
 * ```ts
 * const binding = createTestBinding("test.read", {
 *     type: "object",
 *     properties: { path: { type: "string" } },
 *     required: ["path"],
 *     additionalProperties: false,
 * });
 * ```
 */
export function createTestBinding<T>(contractId: string, schema: Record<string, unknown>): ContractBinding<T> {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    return createContractBinding<T>({
        contractId,
        version: 1,
        schema: schema as ContractSchemaNode,
        validate,
    });
}

/** 构造测试工具描述选项。 */
export interface TestToolOptions {
    /** 面向模型的工具说明。 */
    readonly description?: string;
    /** 是否声明为只读。 */
    readonly isReadOnly?: boolean;
    /** 可选的输入绑定身份。 */
    readonly contractId?: string;
}

/**
 * 构造带 JSON Schema 输入绑定的测试 Tool 定义。
 *
 * @param id - 工具稳定标识。
 * @param schema - 已闭合的本地 JSON Schema。
 * @param options - 说明、只读声明和绑定身份覆盖。
 * @returns 可直接传入模型请求、Runtime 或 Worker 的绑定工具定义。
 * @example
 * ```ts
 * const tool = createTestToolDefinition("echo", {
 *     type: "object",
 *     properties: { message: { type: "string" } },
 *     required: ["message"],
 *     additionalProperties: false,
 * });
 * ```
 */
export function createTestToolDefinition<T = JsonValue>(
    id: string,
    schema: Record<string, unknown>,
    options: TestToolOptions = {},
): BoundToolDefinition<T> {
    return {
        id,
        description: options.description ?? `Test tool ${id}`,
        inputBinding: createTestBinding<T>(options.contractId ?? `test.${id}.input`, schema),
        isReadOnly: options.isReadOnly ?? false,
    };
}

/**
 * 构造闭合对象 Schema。
 *
 * @param properties - 属性 Schema 表。
 * @param required - 必填属性；省略时要求全部属性。
 * @returns Provider 可移植的闭合对象 Schema。
 * @example
 * ```ts
 * const schema = objectInputSchema({ path: { type: "string" } });
 * ```
 */
export function objectInputSchema(
    properties: Record<string, unknown> = {},
    required: readonly string[] = Object.keys(properties),
): Record<string, unknown> {
    return {
        type: "object",
        properties,
        required: [...required],
        additionalProperties: false,
    };
}
