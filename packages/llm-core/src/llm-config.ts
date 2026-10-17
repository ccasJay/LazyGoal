/**
 * 模型请求支持的输出结构模式。
 *
 * @remarks
 * `two_stage` 表示 Runtime 在 Think/Decide 阶段间绑定输出模式；Adapter 实例实际接收 `strict` 或 `prompt_only`。
 *
 * @example
 * ```ts
 * const mode: StructuredOutputMode = "two_stage";
 * ```
 */
export type StructuredOutputMode = "strict" | "prompt_only" | "two_stage";

/** 本期开放的供应商；兼容端点使用独立标识，不推断协议。 */
export type LLMProvider = "openai" | "google" | "anthropic" | "openrouter" | "deepseek" | "openai-compatible" | "opencode-go";

type CommonConfig = {
    readonly apiKey: string;
    readonly model: string;
    readonly structuredOutputMode: StructuredOutputMode;
    readonly maxOutputTokens?: number;
};

/**
 * 已校验的供应商连接配置；凭据由调用方提供，不查询其它凭据源。
 *
 * @remarks
 * 自定义模型必须声明容量；目录模型只允许覆盖输出上限。
 * OpenAI 与 Google 可覆盖端点；Google baseURL 是包含所需版本路径的完整 API 前缀。
 * 配置不写入 Goal 或 Diagnostic Trace。
 * 本类型是无 I/O 的数据契约；环境与 TOML/Profile 的读取、合并和校验归 `@lazygoal/config` 的 `readLLMConfig` 与加载器。
 * @example
 * ```ts
 * const config: LLMConfig = {
 *     provider: "anthropic", model: "claude-sonnet-4-5",
 *     apiKey: "secret", structuredOutputMode: "prompt_only",
 * };
 * ```
 */
export type LLMConfig = CommonConfig & (
    | { readonly provider: "openai" | "google"; readonly baseURL?: string }
    | { readonly provider: "anthropic" | "openrouter" | "deepseek" | "opencode-go" }
    | { readonly provider: "openai-compatible"; readonly baseURL: string; readonly contextWindowTokens: number; readonly maxOutputTokens: number }
);

/**
 * 共享模型配置错误，在创建 Goal、Store 或发起请求前报告。
 *
 * @remarks
 * 环境解析、TOML/Profile 加载、默认工厂与 pi-ai Adapter 共用本构造器；只有一个类定义，不提供兼容子类。
 *
 * @example
 * ```ts
 * throw new LLMConfigurationError(["LLM_API_KEY"]);
 * ```
 */
export class LLMConfigurationError extends Error {
    /** 稳定的配置错误标识。 */
    readonly code = "INVALID_LLM_CONFIG";

    /**
     * @param missing - 缺失的必填配置项名称；非缺失类错误为空数组。
     * @param message - 覆盖默认消息；省略时按 `missing` 生成。
     */
    constructor(readonly missing: readonly string[], message?: string) {
        super(message ?? `Missing required environment variable(s): ${missing.join(", ")}`);
        this.name = "LLMConfigurationError";
    }
}
