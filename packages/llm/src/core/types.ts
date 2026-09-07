import type { JsonSchema202012 } from "../../../contracts/src/index";
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
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | { role: "assistant"; content: string };

/**
 * 模型供应商的结构化输出模式。
 *
 * @remarks
 * - `strict`: 要求 Provider 原生通过严格 JSON Schema 参数约束输出结构；
 * - `prompt_only`: 不发送原生结构参数，由 Prompt 注入 Shape Guide 进行结构指引并依赖本地统一校验。
 *
 * @example
 * ```ts
 * const mode: StructuredOutputMode = "strict";
 * ```
 */
export type StructuredOutputMode = "strict" | "prompt_only";

/**
 * 请求携带的模型输出结构化契约定义。
 *
 * @remarks
 * 仅用于 strict 模式下原样映射为具体供应商的原生结构化输出参数（如 OpenAI response_format 或 Gemini responseJsonSchema）。
 *
 * @example
 * ```ts
 * const structuredOutput: LLMStructuredOutput = {
 *     name: "executing_agent_decision",
 *     schema: { type: "object", properties: {}, required: [], additionalProperties: false },
 * };
 * ```
 */
export interface LLMStructuredOutput {
    /** 结构 Schema 唯一名称。 */
    readonly name: string;
    /** 符合 2020-12 草案的可移植 JSON Schema。 */
    readonly schema: JsonSchema202012;
}

/** 一次 LLM 生成请求；消息顺序必须按原样传递给 Adapter。 */
export interface LLMRequest {
    readonly messages: readonly LLMMessage[];
    /** 供应商生成阶段允许的最大输出 Token；配置模型能力时由 Executor 传递。 */
    readonly maxOutputTokens?: number;
    /**
     * strict 模式下必须传递的原生结构化输出配置；prompt_only 模式下必须完全省略。
     */
    readonly structuredOutput?: LLMStructuredOutput;
}

/**
 * LLM 请求与 Adapter 固定的结构化输出模式不匹配时抛出的配置错误。
 *
 * @remarks
 * 当 strict 模式缺少 structuredOutput 或 prompt_only 模式多传 structuredOutput 时，在发起网络请求前快速失败。
 *
 * @example
 * ```ts
 * throw new LLMRequestModeMismatchError("strict mode requires structuredOutput in LLMRequest");
 * ```
 */
export class LLMRequestModeMismatchError extends Error {
    readonly code = "LLM_REQUEST_MODE_MISMATCH";

    constructor(message: string) {
        super(message);
        this.name = "LLMRequestModeMismatchError";
    }
}

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
 *     content: '{"result":{"kind":"complete","summary":"完成","completionEvidence":[],"memoryPatch":null}}',
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
