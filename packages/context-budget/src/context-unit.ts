/**
 * 一段可由上下文策略整体选择或整体丢弃的有序数据。
 *
 * @remarks
 * 单元不感知数据来源与业务阶段。`characterCount` 由 Adapter 按目标模型输入的
 * 计量规则预先计算，Compactor 只读取该值，不拆分或修改 `items`。
 *
 * @example
 * ```ts
 * const unit: ContextUnit<string> = {
 *     items: ["question", "answer"],
 *     characterCount: 14,
 * };
 * ```
 */
export interface ContextUnit<T> {
    /** 按原始语义顺序排列、不可被裁剪器拆分的数据项。 */
    readonly items: readonly T[];
    /** 该单元占用的模型上下文字符数。 */
    readonly characterCount: number;
}

/**
 * 把一种上下文来源映射为与来源无关的完整单元。
 *
 * @remarks
 * Adapter 负责定义单元边界与字符计量，但不得修改输入来源。不同来源可以产出
 * 同一种 `ContextUnit`，使后续裁剪策略无需依赖来源类型。
 *
 * @example
 * ```ts
 * const adapter: ContextUnitAdapter<readonly string[], string> = {
 *     adapt(source) {
 *         return source.map((item) => ({
 *             items: [item],
 *             characterCount: item.length,
 *         }));
 *     },
 * };
 * ```
 */
export interface ContextUnitAdapter<TSource, TItem> {
    /**
     * @param source - 只读的原始上下文来源。
     * @returns 按来源顺序排列的新单元列表；调用方不得假设它与输入共享数组。
     */
    adapt(source: TSource): readonly ContextUnit<TItem>[];
}
