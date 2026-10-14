import type { ToolDefinition } from "../../tool-core/src/index";

/** Decide 阶段可见的工具发现结果。 */
export interface ToolDiscoveryResult {
    /** 本次查询命中的工具；按相关度排序，最多五项。 */
    readonly tools: readonly Pick<ToolDefinition, "id" | "description">[];
}

/**
 * 在当前 Run 获准的工具集合中执行稳定的名称与描述搜索。
 *
 * @remarks
 * 精确提及工具 ID 或发现别名的结果优先；其余按小写词项在 ID 或描述中的
 * 命中数排序。并列时保留授权 Profile 顺序，结果最多五项。发现别名只参与
 * 排序，不进入返回值，也不授予执行权限。
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
    const normalizedQuery = query.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, " ").trim();
    const paddedQuery = " " + normalizedQuery + " ";
    const mentionsName = (name: string): boolean => {
        const normalizedName = name.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, " ").trim();
        return normalizedName.length > 0 && (
            paddedQuery.includes(" " + normalizedName + " ")
            || (/[\u3400-\u9fff]/u.test(normalizedName)
                && query.toLowerCase().includes(normalizedName))
        );
    };

    return {
        tools: tools
            .map((tool, index) => {
                const searchable = `${tool.id}\n${tool.description}`.toLowerCase();
                const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
                const exactMatch = mentionsName(tool.id)
                    || tool.discoveryAliases?.some(mentionsName) === true;
                return { tool, index, score, exactMatch };
            })
            .filter((candidate) => candidate.score > 0 || candidate.exactMatch)
            .sort((left, right) =>
                Number(right.exactMatch) - Number(left.exactMatch)
                || right.score - left.score
                || left.index - right.index)
            .slice(0, 5)
            .map(({ tool }) => ({ id: tool.id, description: tool.description })),
    };
}
