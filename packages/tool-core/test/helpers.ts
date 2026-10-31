import { createToolRegistration, type BoundTool, type ToolRegistration } from "../src/index";

/**
 * 为测试夹具创建注册项。
 *
 * @remarks
 * 测试夹具必须显式提供输入绑定；生产工具使用 Catalog 生成绑定，任意测试输入由
 * `binding-fixtures.ts` 的 JSON Schema 辅助函数构造。
 *
 * @param tool - 带权威输入绑定的测试 Tool。
 * @returns 可放入 Registry 的注册项。
 * @example
 * ```ts
 * const registration = createTestToolRegistration(tool);
 * ```
 */
export function createTestToolRegistration(tool: BoundTool<any>): ToolRegistration {
    return createToolRegistration(tool);
}
