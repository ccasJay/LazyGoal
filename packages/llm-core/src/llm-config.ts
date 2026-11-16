import type { ProviderId } from "./ids";

/**
 * 供应商标识；开放字符串，由组合根按适配器注册表校验。
 *
 * @example
 * ```ts
 * const provider: LLMProvider = "mistral-gateway";
 * ```
 */
export type LLMProvider = ProviderId;

/**
 * 服务端为动态模型解析的线格式协议。
 *
 * @remarks
 * 协议标识由具体 `wire-*` 包声明；配置只携带该事实，不做可用性判断。
 *
 * @example
 * ```ts
 * const protocol: LLMRecordedProtocol = "chat-completions";
 * ```
 */
export type LLMRecordedProtocol = string;

/**
 * 已校验的供应商连接配置；凭据由调用方提供，不查询其它凭据源。
 *
 * @remarks
 * 供应商标识为开放字符串，适配器由组合根注册表解析；配置只携带连接与模型事实，不携带供应商分支。
 * 端点、容量与能力字段可选，缺省时由适配器或目录决定；配置不写入 Goal 或 Diagnostic Trace。
 * 本类型是无 I/O 的数据契约；环境、TOML/Profile 与受管档案的读取、合并和校验归 `@lazygoal/config`。
 * @example
 * ```ts
 * const config: LLMConfig = {
 *     provider: "mistral-gateway", model: "mistral-large-latest",
 *     apiKey: "secret",
 *     baseURL: "https://gateway.example.test/v1",
 *     contextWindowTokens: 131_072, maxOutputTokens: 8_192,
 * };
 * ```
 */
export interface LLMConfig {
    /** 供应商标识；由组合根按注册表解析。 */
    readonly provider: ProviderId;
    /** API 访问凭据。 */
    readonly apiKey: string;
    /** 请求使用的模型标识；只在供应商内唯一。 */
    readonly model: string;
    /** 端点覆盖；适配器声明是否接受。 */
    readonly baseURL?: string | undefined;
    /** 上下文窗口 Token 容量；未知时省略。 */
    readonly contextWindowTokens?: number | undefined;
    /** 单次补全最大输出 Token。 */
    readonly maxOutputTokens?: number | undefined;
    /** 服务端目录解析的线格式协议；仅用于动态模型。 */
    readonly protocol?: LLMRecordedProtocol | undefined;
    /** 模型是否具备原生推理能力。 */
    readonly reasoning?: boolean | undefined;
    /** 模型是否接受图像等视觉输入。 */
    readonly vision?: boolean | undefined;
    /** 供应商是否接受强制工具选择；未知时按适配器默认处理。 */
    readonly supportsRequiredToolChoice?: boolean | undefined;
    /** 供应商是否原生约束结构化输出；false 时使用文本转 JSON 兜底。 */
    readonly nativeStructuredOutput?: boolean | undefined;
}

/**
 * 共享模型配置错误，在创建 Goal、Store 或发起请求前报告。
 *
 * @remarks
 * 环境解析、TOML/Profile 加载与默认工厂共用本构造器；只有一个类定义，不提供兼容子类。
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
