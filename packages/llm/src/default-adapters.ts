import { LLMConfigurationError, type LLMAdapter, type LLMConfig } from "../../llm-core/src/index";
import { createDefaultProviderRegistry, type ProviderRegistry } from "../../llm-adapters/src/index";

/**
 * 同一供应商与模型下供 Runtime 两阶段执行使用的 Adapter 对。
 *
 * @remarks
 * 所有供应商的两侧共用同一请求驱动 Adapter；生成约束由单次请求声明。
 *
 * @example
 * ```ts
 * const adapters = createLlmStageAdapters(config);
 * await adapters.decideAdapter.generate(decideRequest);
 * ```
 */
export interface LlmStageAdapters {
    /** Think 阶段使用的 Adapter。 */
    readonly thinkAdapter: LLMAdapter;
    /** Decide 阶段使用的 Adapter。 */
    readonly decideAdapter: LLMAdapter;
}

/** 适配器选择可选注入的供应商注册表。 */
export interface LlmAdapterOptions {
    /** 已注册供应商；省略时使用内置注册表。 */
    readonly registry?: ProviderRegistry;
}

function registryFor(options: LlmAdapterOptions): ProviderRegistry {
    return options.registry ?? createDefaultProviderRegistry();
}

/**
 * 按供应商注册表创建 Adapter，不发请求或写入任何存储。
 *
 * @param config - 已校验的连接配置。
 * @param options - 可选注入的供应商注册表。
 * @returns 已注册供应商的适配器工厂产物。
 * @throws LLMConfigurationError 供应商未注册时抛出，指明未知供应商与已注册清单。
 *
 * @example
 * ```ts
 * const adapter = createLlmAdapter(readLLMConfig(process.env));
 * ```
 */
export function createLlmAdapter(config: LLMConfig, options: LlmAdapterOptions = {}): LLMAdapter {
    const registry = registryFor(options);
    if (registry.has(config.provider)) {
        return registry.require(config.provider).createAdapter(config);
    }
    const known = registry.ids();
    throw new LLMConfigurationError(
        [],
        `Unknown provider "${config.provider}"; registered providers: ${known.length === 0 ? "none" : known.join(", ")}`,
    );
}

/**
 * 为同一供应商与模型构造 Think/Decide Adapter；两侧共用同一实例。
 *
 * @param config - 已校验的同一模型连接配置。
 * @param options - 可选注入的供应商注册表。
 * @returns 不可变 Adapter 对。
 *
 * @example
 * ```ts
 * const { thinkAdapter, decideAdapter } = createLlmStageAdapters(config);
 * ```
 */
export function createLlmStageAdapters(
    config: LLMConfig,
    options: LlmAdapterOptions = {},
): Readonly<LlmStageAdapters> {
    const adapter = createLlmAdapter(config, options);
    return Object.freeze({ thinkAdapter: adapter, decideAdapter: adapter });
}

/**
 * 为 GEPA 反思等纯文本推理场景创建 Adapter。
 *
 * @param config - 已经校验的 LLM 运行时配置。
 * @param options - 可选注入的供应商注册表。
 * @returns 可直接用于纯文本生成的 LLMAdapter。
 *
 * @example
 * ```ts
 * const adapter = createReflectionLlmAdapter(config);
 * ```
 */
export function createReflectionLlmAdapter(
    config: LLMConfig,
    options: LlmAdapterOptions = {},
): LLMAdapter {
    return createLlmAdapter(config, options);
}
