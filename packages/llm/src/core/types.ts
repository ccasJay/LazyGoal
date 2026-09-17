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
 * - `prompt_only`: 不发送原生结构参数，由 Prompt 注入 Shape Guide 进行结构指引并依赖本地统一校验；
 * - `two_stage`: 同模型双阶段模式，单步决策先自由思考后挂载 strict Schema 提取动作。
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

/**
 * 模型返回的原生结构化工具调用。
 *
 * @remarks
 * 表示模型在特定步骤生成的工具执行指令，包含唯一调用 ID、调用的工具名称以及未解析的 JSON 参数字符串。
 *
 * @example
 * ```ts
 * const call: LLMToolCall = {
 *     callId: "call_123",
 *     toolId: "bash",
 *     argumentsJson: '{"command":"ls -la"}',
 * };
 * ```
 */
export interface LLMToolCall {
    /** 工具调用的唯一标识 ID。 */
    readonly callId: string;
    /** 所调用的工具名称 / 标识。 */
    readonly toolId: string;
    /** 序列化的参数 JSON 字符串。 */
    readonly argumentsJson: string;
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
    /** 原生 Function Calling 挂载的工具定义集合。 */
    readonly tools?: readonly LLMToolDefinition[];
    /**
     * 原生工具调用策略。
     * - `required`: 强制模型必须且仅触发 1 个工具调用；
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
export interface LLMResponse {
    /** Agent 协议解析使用的原始模型文本（包含思维链/自然语言回复）。 */
    readonly content: string;
    /** 模型发起的工具调用列表。原生双通道下单次单步通常包含 0 个或 1 个工具调用。 */
    readonly toolCalls?: readonly LLMToolCall[];
    /** 可选供应商诊断字段；不会参与 Runtime 状态转换。 */
    readonly providerMetadata?: JsonValue;
}
