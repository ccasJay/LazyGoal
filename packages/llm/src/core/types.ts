import type { JsonSchema202012, JsonValue } from "../../../contracts/src/index";

import type {
    ModelAssistantMessage,
    ModelConversationMessage,
    ModelToolCall,
    ModelContinuation,
    NativeConversationIdentity,
} from "../../../model-contracts/src/index";
export type { NativeConversationIdentity };

/** 统一模型消息角色，包含原生工具结果。 */
export type LLMRole = ModelConversationMessage["role"];
/** 原生消息与纯文本消息共享的请求边界。 */
export type LLMMessage = ModelConversationMessage;

/**
 * 模型供应商的结构化输出模式。
 *
 * @remarks
 * - `strict`: 要求 Provider 原生通过严格 JSON Schema 参数约束输出结构；
 * - `prompt_only`: 不发送原生结构参数，由 Prompt 注入 Shape Guide 进行结构指引并依赖本地统一校验；
 * - `two_stage`: Runtime 的同模型阶段绑定策略；Think 使用 prompt_only，Decide 按供应商能力使用 strict 或 prompt_only。
 *
 * @example
 * ```ts
 * const mode: StructuredOutputMode = "two_stage";
 * ```
 */
export type StructuredOutputMode = "strict" | "prompt_only" | "two_stage";

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

/**
 * 原生 Function Calling / Tool Calling 工具声明定义。
 *
 * @remarks
 * 供 LLM 适配器映射为具体供应商的工具结构（如 OpenAI `tools[].function` 或 Gemini `functionDeclarations`）。
 *
 * @example
 * ```ts
 * const tool: LLMToolDefinition = {
 *     id: "bash",
 *     description: "Execute bash command",
 *     parametersSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
 * };
 * ```
 */
export interface LLMToolDefinition {
    /** 工具唯一标识，作为函数调用的名称。 */
    readonly id: string;
    /** 工具的功能描述。 */
    readonly description: string;
    /** 符合 JSON Schema 规范的入参定义。 */
    readonly parametersSchema: Record<string, unknown>;
}

/** 模型原生函数调用；与 Runtime Action 身份独立。 */
export type LLMToolCall = ModelToolCall;

/** 一次 LLM 生成请求；消息顺序必须按原样传递给 Adapter。 */
export interface LLMRequest {
    readonly messages: readonly LLMMessage[];
    /** 供应商生成阶段允许的最大输出 Token；配置模型能力时由 Executor 传递。 */
    readonly maxOutputTokens?: number;
    /**
     * strict 模式下必须传递的原生结构化输出配置；prompt_only 模式下必须完全省略。
     */
    readonly structuredOutput?: LLMStructuredOutput;
    /** 原生 Function Calling 挂载的工具定义集合。 */
    readonly tools?: readonly LLMToolDefinition[];
    /**
     * 原生工具调用策略。
     * - `required`: 要求调用工具；Adapter 与 Agent 共同落实 Decide 的单调用约束；
     * - `auto`: 由模型自主决定是仅回复文本还是调用工具；
     * - `none`: 禁止模型调用工具。
     */
    readonly toolChoice?: "auto" | "required" | "none";
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
 * 原生 OpenAI/Gemini Adapter 在响应携带用量时把归一化 token 计数写入
 * `providerMetadata.usage`（`{ inputTokens, outputTokens, cachedInputTokens? }`），
 * 供应商缺失或核心字段非法时该子对象缺省，不以 0 或估算值代替。
 * pi-ai 不提供计数原始存在性的保证，其数值仅写入 piUsage 诊断字段，usage 始终缺省。
 *
 * @example
 * ```ts
 * const response: LLMResponse = {
 *     content: '{"result":{"kind":"complete","summary":"完成","completionEvidence":[],"memoryPatch":null}}',
 *     providerMetadata: {
 *         requestId: "req-1",
 *         usage: { inputTokens: 12, outputTokens: 34, cachedInputTokens: 5 },
 *     },
 * };
 * ```
 */
export interface LLMResponse extends Omit<ModelAssistantMessage, "role"> {
    /** 正文文本；原生 Adapter 的 reasoning 摘要通过独立字段返回。 */
    readonly content: string;
    /** 供应商实际公开的 reasoning 摘要，不进入正文解析。 */
    readonly reasoning?: string;
    /** 可持久化的协议续接字段，不属于诊断 metadata。 */
    readonly continuation?: ModelContinuation;
    /** 模型发起的工具调用列表。原生双通道下单次单步通常包含 0 个或 1 个工具调用。 */
    readonly toolCalls?: readonly LLMToolCall[];
    /** 可选供应商诊断字段；不会参与 Runtime 状态转换。 */
    readonly providerMetadata?: JsonValue;
}

/**
 * 供应商无关的模型流事件。
 *
 * @remarks
 * `completed` 携带与 `generate()` 相同的最终响应；其它事件只描述生成过程，
 * 不参与 AgentDecision 解析。工具调用参数可能是不完整 JSON，调用方不得直接
 * 将其作为可执行 Action 使用。
 *
 * @example
 * ```ts
 * const event: LLMStreamEvent = {
 *     kind: "assistant_text_delta",
 *     text: "正在检查文件...",
 * };
 * ```
 */
export type LLMStreamEvent =
    | { readonly kind: "started" }
    | { readonly kind: "assistant_text_delta"; readonly text: string }
    | { readonly kind: "reasoning_delta"; readonly text: string }
    | {
        readonly kind: "model_tool_call_delta";
        readonly delta: string;
        readonly contentIndex?: number;
    }
    | { readonly kind: "completed"; readonly response: LLMResponse };
