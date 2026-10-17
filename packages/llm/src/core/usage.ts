import type { GenerateContentResponseUsageMetadata } from "@google/genai";

import type OpenAI from "openai";

import { toSafeTokenCount, type NormalizedUsage } from "../../../llm-core/src/index";

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
