import type { LLMAdapter } from "./core/adapter";
import { LLMConfigurationError, type LLMConfig } from "../../config/src/index";
import { Gemini } from "./gemini";
import { OpenAICompatible } from "./openai-compatible";
import { PiAiAdapter } from "./pi-ai";

/**
 * 同一供应商与模型下供 Runtime 两阶段执行使用的 Adapter 对。
 *
 * @remarks
 * Think Adapter 固定为 prompt_only；Decide Adapter 根据供应商固定为 strict 或 prompt_only。
 *
 * @example
 * ```ts
 * const adapters = createLlmStageAdapters(config);
 * await adapters.decideAdapter.generate(decideRequest);
 * ```
 */
export interface LlmStageAdapters {
    /** Think 使用不携带原生结构 Schema 的自由文本 prompt_only Adapter。 */
    readonly thinkAdapter: LLMAdapter;
    /** Decide 按供应商能力使用 strict 或 prompt_only 的 Adapter。 */
    readonly decideAdapter: LLMAdapter;
}

function decideModeForProvider(provider: LLMConfig["provider"]): "strict" | "prompt_only" {
    return provider === "openai" || provider === "google" || provider === "openai-compatible"
        ? "strict"
        : "prompt_only";
}

/**
 * 离线创建固定供应商及单一实际输出模式的 Adapter，不发请求或写入任何存储。
 * @param config - readLLMConfig 产生的显式连接配置。
 * @returns prompt_only 使用 pi-ai；strict 使用现有 OpenAI/Gemini 原生实现；two_stage 返回 provider 对应的 Decide Adapter。
 * @throws LLMConfigurationError strict 不受支持、目录模型不存在或容量超限。
 * @example
 * ```ts
 * const adapter = createLlmAdapter(readLLMConfig(process.env));
 * ```
 */
export function createLlmAdapter(config: LLMConfig): LLMAdapter {
    const structuredOutputMode = config.structuredOutputMode === "two_stage"
        ? decideModeForProvider(config.provider)
        : config.structuredOutputMode;
    const stageConfig = structuredOutputMode === config.structuredOutputMode
        ? config
        : { ...config, structuredOutputMode };
    if (stageConfig.structuredOutputMode === "prompt_only") return new PiAiAdapter(stageConfig);
    switch (stageConfig.provider) {
        case "openai":
        case "openai-compatible":
            return new OpenAICompatible({ ...stageConfig, provider: stageConfig.provider, baseURL: stageConfig.baseURL ?? "https://api.openai.com/v1" });
        case "google":
            return new Gemini(stageConfig);
        default:
            throw new LLMConfigurationError([], `Provider "${stageConfig.provider}" does not support ${stageConfig.structuredOutputMode} output; select prompt_only`);
    }
}

/**
 * 为同一供应商与模型构造 Think/Decide Adapter。Think 始终为 prompt_only；Decide
 * 在原生 strict 供应商上为 strict，其余现有供应商为 prompt_only。
 *
 * @param config - 已校验的同一模型连接配置；Think 始终使用 prompt_only，Decide 实际模式由供应商能力决定。
 * @returns 按推理阶段固定输出模式的不可变 Adapter 对。
 * @example
 * ```ts
 * const { thinkAdapter, decideAdapter } = createLlmStageAdapters(config);
 * ```
 */
export function createLlmStageAdapters(config: LLMConfig): Readonly<LlmStageAdapters> {
    return Object.freeze({
        thinkAdapter: config.structuredOutputMode === "prompt_only"
            ? createLlmAdapter(config)
            : createReflectionLlmAdapter({ ...config, structuredOutputMode: "prompt_only" }),
        decideAdapter: createLlmAdapter({
            ...config,
            structuredOutputMode: decideModeForProvider(config.provider),
        }),
    });
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
export function createReflectionLlmAdapter(config: LLMConfig): LLMAdapter {
    switch (config.provider) {
        case "google":
            return new Gemini(config);
        case "openai":
        case "openai-compatible":
            return new OpenAICompatible({ ...config, provider: config.provider, baseURL: config.baseURL ?? "https://api.openai.com/v1" });
        default:
            return createLlmAdapter(config);
    }
}
