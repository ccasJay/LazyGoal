/**
 * Context Retrieval 两种既有分数舍入语义的唯一实现。
 *
 * @remarks
 * 两种公式在 6 位小数网格上等价，但在距半微单位约 2e-10 的边界上会相差 1e-6；
 * 已持久化的排序分数与协议分数不能改变，因此保留两个明确命名的函数。两者都是
 * 无副作用纯函数，不做有限性或非负校验，领域断言仍由各调用点负责。
 */

/**
 * 把协议分数舍入到 6 位小数，不含 `Number.EPSILON` 修正。
 *
 * @remarks
 * 用于 Context Lookup 协议与 Runtime 复用的分数路径；不抛错、不校验范围。
 *
 * @param value - 待舍入的数值。
 * @returns 按 `Math.round(value * 1_000_000) / 1_000_000` 计算的舍入结果。
 *
 * @example
 * ```ts
 * const score = roundScore(0.1234565);
 * ```
 */
export function roundScore(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * 把排序分数舍入到 6 位小数，含 `Number.EPSILON` 修正。
 *
 * @remarks
 * 用于 Context Ranking 与 Lookup Result 的 BM25 分数路径；该修正使部分半微单位
 * 边界向上取整。不抛错、不校验范围。
 *
 * @param value - 待舍入的数值。
 * @returns 按 `Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000` 计算的舍入结果。
 *
 * @example
 * ```ts
 * const score = roundRankedScore(0.1234565);
 * ```
 */
export function roundRankedScore(value: number): number {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
