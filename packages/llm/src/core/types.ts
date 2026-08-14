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
    messages: LLMMessage[];
}

/** 供应商无关的 LLM 响应；content 保存模型返回的原始文本。 */
export interface LLMResponse {
    content: string;
}
