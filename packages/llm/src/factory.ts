import type { LLMAdapter } from "./core/adapter";
import { LlmConfigurationError, type LlmConfig } from "./config";
import { Gemini } from "./gemini";
import { OpenAICompatible } from "./openai-compatible";
import { PiAiAdapter } from "./pi-ai";

/**
 * 离线创建固定供应商及输出模式的 Adapter，不发请求或写入任何存储。
 * @param config - readLlmConfig 产生的显式连接配置。
 * @returns prompt_only 使用 pi-ai；strict 使用现有 OpenAI/Gemini 原生实现。
 * @throws LlmConfigurationError strict 不受支持、目录模型不存在或容量超限。
 * @example
 * ```ts
 * const adapter = createLlmAdapter(readLlmConfig(process.env));
 * ```
 */
export function createLlmAdapter(config: LlmConfig): LLMAdapter {
    if (config.structuredOutputMode === "prompt_only") return new PiAiAdapter(config);
    switch (config.provider) {
        case "openai":
        case "openai-compatible":
            return new OpenAICompatible({ ...config, baseURL: config.baseURL ?? "https://api.openai.com/v1" });
        case "google":
            return new Gemini(config);
        default:
            throw new LlmConfigurationError([], `Provider "${config.provider}" does not support ${config.structuredOutputMode} output; select prompt_only`);
    }
}

/**
 * 为 GEPA 反思等纯文本推理场景创建 Adapter，优先复用原生 Runtime Provider 实现。
 *
 * @remarks
 * Google 与 OpenAI/OpenAI-compatible 优先使用原生驱动，解除 pi-ai 静态目录对私有网关与自定义模型名的限制。
 * 其余供应商（Anthropic、DeepSeek、OpenRouter）在 prompt_only 下使用标准 pi-ai 适配器。
 *
 * @param config - 已经校验的 LLM 运行时配置。
 * @returns 可直接用于纯文本生成的 LLMAdapter。
 * @example
 * ```ts
 * const adapter = createReflectionLlmAdapter({
 *     provider: "google",
 *     apiKey: "secret",
 *     model: "gemini-pro-agent",
 *     structuredOutputMode: "prompt_only",
 * });
 * ```
 */
export function createReflectionLlmAdapter(config: LlmConfig): LLMAdapter {
    switch (config.provider) {
        case "google":
            return new Gemini(config);
        case "openai":
        case "openai-compatible":
            return new OpenAICompatible({ ...config, baseURL: config.baseURL ?? "https://api.openai.com/v1" });
        default:
            return createLlmAdapter(config);
    }
}

