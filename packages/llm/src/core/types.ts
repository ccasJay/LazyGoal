import type { JsonValue } from "../../../runtime/src/domain";

/** 当前统一 LLM 消息协议支持的角色。 */
export type LLMRole = "system" | "user" | "assistant";

/**
 * 与具体供应商无关的单条 LLM 消息。
 *
 * @remarks
 * Adapter 负责将这些角色映射到供应商协议；当前不包含 Tool 消息。
 */
export type LLMMessage = 
    | {role: "system"; content: string}
    | {role: "user"; content: string}
    | {role: "assistant"; content:string};

/** 一次 LLM 生成请求；消息顺序必须按原样传递给 Adapter。 */
export interface LLMRequest {
    readonly messages: readonly LLMMessage[];
    /** 供应商生成阶段允许的最大输出 Token；配置模型能力时由 Executor 传递。 */
    readonly maxOutputTokens?: number;
}

/** 供应商无关的 LLM 响应；content 保存模型返回的原始文本。 */
/**
 * 供应商无关的模型响应。
 *
 * @remarks
 * `content` 是 Agent 协议解析所使用的原始文本；可选的
 * `providerMetadata` 只供 Diagnostic Trace 使用，不进入 Domain Event、Goal
 * Snapshot 或模型上下文。调用方应避免把凭据放入 metadata。
 *
 * @example
 * ```ts
 * const response: LLMResponse = {
 *     content: '{"kind":"complete"}',
 *     providerMetadata: { requestId: "req-1" },
 * };
 * ```
 */
export interface LLMResponse {
    /** Agent 协议解析使用的原始模型文本。 */
    content: string;
    /** 可选供应商诊断字段；不会参与 Runtime 状态转换。 */
    providerMetadata?: JsonValue;
}
