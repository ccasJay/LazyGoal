import type { GenerateContentResponseUsageMetadata } from "@google/genai";

import type OpenAI from "openai";

/**
 * 单次模型调用归一化后的 token 用量形态,写入 `providerMetadata.usage`。
 *
 * @remarks
 * 两个 Adapter 把各自供应商的用量字段搬运为该统一形态,字段名为 camelCase。
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
 * 不做估算、不做四舍五入。
 *
 * @param value - 供应商响应中的原始 token 计数字段。
 * @returns 可安全搬运的计数;非法时返回 `undefined`。
 */
function toSafeTokenCount(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}

/**
 * 从 OpenAI Chat Completions 响应的 `usage` 提取归一化用量。
 *
 * @remarks
 * `prompt_tokens` 与 `completion_tokens` 是核心字段,任一非法即整体缺省;
 * `prompt_tokens_details.cached_tokens` 可用才写入 `cachedInputTokens`。
 * `total_tokens` 不记录(可由两侧求和,避免冗余)。
 *
 * @param usage - OpenAI 响应中的原始用量对象;可能缺失或为 null。
 * @returns 归一化用量;核心字段缺失或非法时返回 `undefined`。
 */
export function extractOpenAIUsage(
    usage: OpenAI.Chat.Completions.ChatCompletion["usage"] | null,
): NormalizedUsage | undefined {
    if (usage === undefined || usage === null) {
        return undefined;
    }
    const inputTokens = toSafeTokenCount(usage.prompt_tokens);
    const outputTokens = toSafeTokenCount(usage.completion_tokens);
    if (inputTokens === undefined || outputTokens === undefined) {
        return undefined;
    }
    const cachedInputTokens = toSafeTokenCount(
        usage.prompt_tokens_details?.cached_tokens,
    );
    return cachedInputTokens === undefined
        ? { inputTokens, outputTokens }
        : { inputTokens, outputTokens, cachedInputTokens };
}

/**
 * 从 Gemini 响应的 `usageMetadata` 提取归一化用量。
 *
 * @remarks
 * `promptTokenCount` 与 `candidatesTokenCount` 是核心字段,任一非法即整体
 * 缺省;`cachedContentTokenCount` 可用才写入 `cachedInputTokens`。
 * `totalTokenCount` 不记录(可由各侧求和,避免冗余)。
 *
 * @param usageMetadata - Gemini 响应中的原始用量对象;可能缺失或为 null。
 * @returns 归一化用量;核心字段缺失或非法时返回 `undefined`。
 */
export function extractGeminiUsage(
    usageMetadata: GenerateContentResponseUsageMetadata | null | undefined,
): NormalizedUsage | undefined {
    if (usageMetadata === undefined || usageMetadata === null) {
        return undefined;
    }
    const inputTokens = toSafeTokenCount(usageMetadata.promptTokenCount);
    const outputTokens = toSafeTokenCount(usageMetadata.candidatesTokenCount);
    if (inputTokens === undefined || outputTokens === undefined) {
        return undefined;
    }
    const cachedInputTokens = toSafeTokenCount(
        usageMetadata.cachedContentTokenCount,
    );
    return cachedInputTokens === undefined
        ? { inputTokens, outputTokens }
        : { inputTokens, outputTokens, cachedInputTokens };
}
