import { createAnthropicProviderAdapter } from "./anthropic";
import { createDeepSeekProviderAdapter } from "./deepseek";
import { createGoogleProviderAdapter } from "./google";
import { createOpenAICompatibleProviderAdapter } from "./openai-compatible";
import { createOpenAIProviderAdapter } from "./openai";
import { createOpenCodeGoProviderAdapter } from "./opencode-go";
import { createOpenRouterProviderAdapter } from "./openrouter";
import { createProviderRegistry, type ProviderRegistry } from "./registry";

/**
 * 创建内置供应商注册表。
 *
 * @remarks
 * 注册表是供应商清单的唯一来源；配置与组合根通过它校验并解析供应商标识。
 *
 * @returns 包含 OpenAI、DeepSeek、OpenRouter 与 OpenCode Go 的注册表。
 *
 * @example
 * ```ts
 * const registry = createDefaultProviderRegistry();
 * const adapter = registry.require(config.provider).createAdapter(config);
 * ```
 */
export function createDefaultProviderRegistry(): ProviderRegistry {
    return createProviderRegistry([
        createOpenAIProviderAdapter(),
        createAnthropicProviderAdapter(),
        createGoogleProviderAdapter(),
        createDeepSeekProviderAdapter(),
        createOpenRouterProviderAdapter(),
        createOpenCodeGoProviderAdapter(),
        createOpenAICompatibleProviderAdapter(),
    ]);
}
