import type { JsonSchema202012, JsonValue } from "../../contracts/src/index";

import type {
    ModelConversationMessage,
    ModelToolCall,
    ModelContinuation,
} from "../../model-contracts/src/index";

/** 统一模型消息角色，包含原生工具结果。 */
export type LLMRole = ModelConversationMessage["role"];
/** 原生消息与纯文本消息共享的请求边界。 */
export type LLMMessage = ModelConversationMessage;

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

/**
 * 一次 LLM 生成请求；消息顺序必须按原样传递给 Adapter。
 *
 * @example
 * ```ts
 * const request: LLMRequest = {
 *     messages: [{ role: "user", content: "总结这次运行" }],
 *     maxOutputTokens: 1024,
 * };
 * ```
 */
export interface LLMRequest {
    readonly messages: readonly LLMMessage[];
    /** 供应商生成阶段允许的最大输出 Token；配置模型能力时由 Executor 传递。 */
    readonly maxOutputTokens?: number;
    /**
     * 无工具的 strict 请求必须传递原生结构化输出配置；工具请求由参数 Schema 约束，省略此字段。
     * prompt_only 请求必须完全省略。
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
    /**
     * 稳定会话身份（如 Goal 的 id）。供应商会话感知能力据此获得跨调用一致的会话标识；
     * 省略时适配器保持既有请求形态，不发送任何会话头。
     */
    readonly sessionId?: string;
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
 * 文本内容块正文的来源格式。
 *
 * @remarks
 * 由本次请求的结构化输出契约决定，不扫描正文猜测：携带原生结构 Schema 的无工具
 * 请求返回 `json`，自由文本请求返回 `plain`。格式只说明正文来源，不表示解析结果。
 *
 * @example
 * ```ts
 * const format: LLMTextBlockFormat = request.structuredOutput === undefined ? "plain" : "json";
 * ```
 */
export type LLMTextBlockFormat = "plain" | "json";

/**
 * 完整响应中的正文块。
 *
 * @remarks
 * 块索引在本次响应内稳定且唯一，从 0 开始；正文按块内容直接连接，不隐式 trim 或插入换行。
 *
 * @example
 * ```ts
 * const block: LLMTextBlock = { index: 0, type: "text", format: "plain", text: "检查完成" };
 * ```
 */
export interface LLMTextBlock {
    /** 本次响应内稳定且唯一的块索引。 */
    readonly index: number;
    readonly type: "text";
    /** 正文来源格式；结构化输出为 `json`。 */
    readonly format: LLMTextBlockFormat;
    /** 该块的完整正文。 */
    readonly text: string;
}

/**
 * 完整响应中的公开 reasoning 块。
 *
 * @remarks
 * 只承载供应商实际返回的 reasoning 文本；保持受限，不与签名或最终答复混淆。
 *
 * @example
 * ```ts
 * const block: LLMReasoningBlock = { index: 1, type: "reasoning", text: "先核对文件差异" };
 * ```
 */
export interface LLMReasoningBlock {
    /** 本次响应内稳定且唯一的块索引。 */
    readonly index: number;
    readonly type: "reasoning";
    /** 该块的完整 reasoning 文本。 */
    readonly text: string;
}

/**
 * 完整响应中的工具调用块。
 *
 * @remarks
 * `callId` 是模型供应商协议中的调用身份，不替代 Runtime `actionId`；`argumentsJson`
 * 保留原始或协议规范化后的参数 JSON 文本，其业务 Schema 是否可用由阶段解码判断。
 *
 * @example
 * ```ts
 * const block: LLMToolCallBlock = {
 *     index: 0, type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"README.md"}',
 * };
 * ```
 */
export interface LLMToolCallBlock {
    /** 本次响应内稳定且唯一的块索引。 */
    readonly index: number;
    readonly type: "tool_call";
    /** 供应商工具调用 ID；缺失时由协议规则分配一次本地身份。 */
    readonly callId: string;
    /** 模型选择的工具名。 */
    readonly toolId: string;
    /** 工具参数 JSON 文本。 */
    readonly argumentsJson: string;
}

/** 一次模型响应的有序内容块。 */
export type LLMContentBlock = LLMTextBlock | LLMReasoningBlock | LLMToolCallBlock;

/**
 * 供应商无关的完整模型响应。
 *
 * @remarks
 * `blocks` 是正文、工具调用与公开 reasoning 的唯一权威；现有消费者所需的正文、
 * 推理视图与工具列表由 `llm-core` 的纯投影从块派生，不保存可独立修改的平行字段。
 * 可选的 `providerMetadata` 只供 Diagnostic Trace 使用，不进入 Domain Event、Goal
 * Snapshot 或模型上下文。调用方应避免把凭据放入 metadata。
 * 原生 OpenAI/Gemini Adapter 在响应携带用量时把归一化 token 计数写入
 * `providerMetadata.usage`（`{ inputTokens, outputTokens, cachedInputTokens? }`），
 * 供应商缺失或核心字段非法时该子对象缺省，不以 0 或估算值代替。
 * pi-ai 不提供计数原始存在性的保证，其数值仅写入 piUsage 诊断字段，usage 始终缺省。
 *
 * @example
 * ```ts
 * const response: LLMResponse = {
 *     blocks: [{
 *         index: 0, type: "text", format: "json",
 *         text: '{"result":{"kind":"complete","summary":"完成","completionEvidence":[],"memoryPatch":null}}',
 *     }],
 *     providerMetadata: {
 *         requestId: "req-1",
 *         usage: { inputTokens: 12, outputTokens: 34, cachedInputTokens: 5 },
 *     },
 * };
 * ```
 */
export interface LLMResponse {
    /** 本次响应的有序完整块；正文、工具调用与公开 reasoning 的唯一来源。 */
    readonly blocks: readonly LLMContentBlock[];
    /** 可持久化的协议续接字段，不属于诊断 metadata。 */
    readonly continuation?: ModelContinuation;
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
