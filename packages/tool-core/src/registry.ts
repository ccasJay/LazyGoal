import type { ToolRegistration, ToolRegistry } from "./types";

/**
 * 单进程内的不可变 Tool 注册表。
 *
 * @remarks
 * 构造时复制注册项引用并拒绝空 ID 与重复 ID；Registry 不复制或包装 Tool 实现，
 * 因而具体 Tool 的生命周期由调用方管理。
 *
 * @example
 * ```ts
 * const registry = new InMemoryToolRegistry([registration]);
 * ```
 */
export class InMemoryToolRegistry implements ToolRegistry {
    private readonly tools: ReadonlyMap<string, ToolRegistration>;

    /**
     * @param tools - 要注册的 ToolRegistration 集合。
     * @throws Tool ID 为空或重复时抛出 Error。
     */
    constructor(tools: readonly ToolRegistration[] = []) {
        const registered = new Map<string, ToolRegistration>();

        for (const tool of tools) {
            const toolId = tool.definition.id;

            if (toolId.trim() === "") {
                throw new Error("Tool definition id must be non-empty");
            }

            if (registered.has(toolId)) {
                throw new Error(`Duplicate Tool definition id: ${toolId}`);
            }

            registered.set(toolId, tool);
        }

        this.tools = registered;
    }

    /**
     * @param toolId - Agent 请求的 Tool 标识。
     * @returns 构造时注册的 ToolRegistration；不存在时返回 `undefined`。
     */
    get(toolId: string): ToolRegistration | undefined {
        return this.tools.get(toolId);
    }
}
