import type { ToolDefinition } from "./tool";

/** Decide 阶段可见的工具发现结果。 */
export interface ToolDiscoveryResult {
    /** 本次查询命中的工具；按相关度排序，最多五项。 */
    readonly tools: readonly Pick<ToolDefinition, "id" | "description">[];
}

/**
 * 在当前 Run 获准的工具集合中执行稳定的子串搜索。
 *
 * @remarks
 * 查询按空白拆分为小写词项；每个词项在工具 ID 或描述中命中即计一分。
 * 并列时保留授权 Profile 顺序，结果最多五项。
 *
 * @example
 * ```ts
 * const result = findTools("read file", authorizedTools);
 * ```
 * @param query - Agent 请求搜索的非空文本。
 * @param tools - 当前 Profile 与 Registry 授权交集。
 * @returns 命中的工具 ID 与描述，按稳定相关度排序。
 */
export function findTools(
    query: string,
    tools: readonly ToolDefinition[],
): ToolDiscoveryResult {
    const terms = [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))];
    if (terms.length === 0) return { tools: [] };

    return {
        tools: tools
            .map((tool, index) => {
                const searchable = `${tool.id}\n${tool.description}`.toLowerCase();
                const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
                return { tool, index, score };
            })
            .filter((candidate) => candidate.score > 0)
            .sort((left, right) => right.score - left.score || left.index - right.index)
            .slice(0, 5)
            .map(({ tool }) => ({ id: tool.id, description: tool.description })),
    };
}
