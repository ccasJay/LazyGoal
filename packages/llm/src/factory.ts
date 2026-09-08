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
            throw new LlmConfigurationError([], `Provider "${config.provider}" does not support strict output; select prompt_only`);
    }
}
