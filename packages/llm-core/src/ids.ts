/**
 * 语言模型供应商的稳定标识。
 *
 * @remarks
 * 开放字符串：供应商由组合根按适配器注册表解析，`llm-core` 不维护闭合清单。
 * 该标识只用于选择适配器与隔离同名模型，不携带端点或凭据。
 *
 * @example
 * ```ts
 * const providerId: ProviderId = "deepseek";
 * ```
 */
export type ProviderId = string;

/**
 * 模型线格式协议标识。
 *
 * @remarks
 * 开放字符串，由具体 `wire-*` 包声明并实现（如 `chat-completions`）。
 * 供应商适配器按模型声明所用协议；协议缺失时调用方必须失败，不得降级到其它协议。
 *
 * @example
 * ```ts
 * const protocol: ProtocolId = "chat-completions";
 * ```
 */
export type ProtocolId = string;
