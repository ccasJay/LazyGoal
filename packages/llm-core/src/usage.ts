/**
 * 单次模型调用归一化后的 token 用量形态,写入 `providerMetadata.usage`。
 *
 * @remarks
 * 供应商 Adapter 把各自供应商的用量字段搬运为该统一形态,字段名为 camelCase。
 * 供应商未携带用量、或核心字段不是有限非负数时整个 `usage` 缺省,不以 0
 * 或估算值代替;`cachedInputTokens` 仅在供应商报告缓存命中时存在。
 * 该对象只随 Diagnostic Trace 落盘与执行事实累计,不进入 Domain Event、
 * Goal Snapshot 或模型上下文。
 *
 * @example
 * ```ts
 * const usage: NormalizedUsage = { inputTokens: 12, outputTokens: 34, cachedInputTokens: 5 };
 * ```
 */
export type NormalizedUsage = {
    /** 输入侧(OpenAI prompt / Gemini prompt)token 数。 */
    readonly inputTokens: number;
    /** 输出侧(OpenAI completion / Gemini candidates)token 数。 */
    readonly outputTokens: number;
    /** 输入中被缓存命中的 token 数;供应商未报告时缺省。 */
    readonly cachedInputTokens?: number;
};

/**
 * 供应商原始 token 计数的搬运守卫。
 *
 * @remarks
 * 仅接受有限非负数;缺失、NaN、Infinity、负数或非数字一律视为缺失。
 * 不做估算、不做四舍五入。供应商 Adapter 的原始用量提取与通用读取复用同一规则。
 *
 * @param value - 供应商响应中的原始 token 计数字段。
 * @returns 可安全搬运的计数;非法时返回 `undefined`。
 * @example
 * ```ts
 * const count = toSafeTokenCount(promptTokens);
 * ```
 */
export function toSafeTokenCount(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}

/**
 * 从 `providerMetadata`(JsonValue)安全读取 Adapter 写入的归一化用量。
 *
 * @remarks
 * 该函数在无类型的 JSON 边界上重新应用与提取侧相同的数字守卫,供执行路径
 * 累计使用;核心字段非法时与缺省同义,`cachedInputTokens` 缺失时省略。
 *
 * @param providerMetadata - 响应携带的供应商诊断 metadata。
 * @returns 归一化用量;不存在或形态非法时返回 `undefined`。
 *
 * @example
 * ```ts
 * const usage = readNormalizedUsage(response.providerMetadata);
 * ```
 */
export function readNormalizedUsage(
    providerMetadata: unknown,
): NormalizedUsage | undefined {
    if (
        providerMetadata === undefined
        || providerMetadata === null
        || typeof providerMetadata !== "object"
        || Array.isArray(providerMetadata)
    ) {
        return undefined;
    }
    const usage = (providerMetadata as { usage?: unknown }).usage;
    if (
        usage === undefined
        || usage === null
        || typeof usage !== "object"
        || Array.isArray(usage)
    ) {
        return undefined;
    }
    const record = usage as { inputTokens?: unknown; outputTokens?: unknown; cachedInputTokens?: unknown };
    const inputTokens = toSafeTokenCount(record.inputTokens);
    const outputTokens = toSafeTokenCount(record.outputTokens);
    if (inputTokens === undefined || outputTokens === undefined) {
        return undefined;
    }
    const cachedInputTokens = toSafeTokenCount(record.cachedInputTokens);
    return cachedInputTokens === undefined
        ? { inputTokens, outputTokens }
        : { inputTokens, outputTokens, cachedInputTokens };
}
