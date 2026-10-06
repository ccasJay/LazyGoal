/**
 * 模型输入审查与对比数据传输对象 (DTO)。
 */

/**
 * 模型输入消息的独立 wire 传输结构。
 *
 * @example
 * ```ts
 * const msg: BrowserModelInputMessageWire = {
 *     role: "user",
 *     content: "Hello",
 *     source: "conversation",
 * };
 * ```
 */
export interface BrowserModelInputMessageWire {
    /** 消息角色。 */
    readonly role: "system" | "user" | "assistant" | "tool";
    /** 消息正文。 */
    readonly content: string;
    /** 消息来源。 */
    readonly source: "system" | "conversation" | "section" | "working_context" | "stage" | "request" | "native_history";
    /** 思考推理过程（assistant 可选）。 */
    readonly reasoning?: string;
    /** 工具调用列表（assistant 可选）。 */
    readonly toolCalls?: readonly {
        readonly callId: string;
        readonly toolId: string;
        readonly argumentsJson: string;
    }[];
    /** 供应商连续性数据。 */
    readonly continuation?: unknown;
    /** 工具调用标识（tool 角色可选）。 */
    readonly callId?: string;
    /** 工具标识（tool 角色可选）。 */
    readonly toolId?: string;
}

/**
 * 完整模型输入调用的 wire 记录。
 *
 * @example
 * ```ts
 * const record: BrowserModelInputRecordWire = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     callId: "call-1",
 *     stepIndex: 1,
 *     stage: "decide",
 *     occurredAt: "2026-10-18T00:00:00.000Z",
 *     messages: [],
 * };
 * ```
 */
export interface BrowserModelInputRecordWire {
    /** 所属 Goal 标识。 */
    readonly goalId: string;
    /** 所属 Run 标识。 */
    readonly runId: string;
    /** 模型调用唯一标识。 */
    readonly callId: string;
    /** 执行单元标识。 */
    readonly executionUnitId?: string;
    /** Step 序号。 */
    readonly stepIndex: number;
    /** 调用阶段。 */
    readonly stage: "think" | "decide" | "completion_review";
    /** 发生时间。 */
    readonly occurredAt: string;
    /** 实际发送给模型的完整输入消息列表。 */
    readonly messages: readonly BrowserModelInputMessageWire[];
}

/**
 * 模型输入摘要传输对象（用于调用列表展示）。
 *
 * @example
 * ```ts
 * const summary: BrowserModelInputSummary = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     callId: "call-1",
 *     stepIndex: 1,
 *     stage: "decide",
 *     occurredAt: "2026-10-18T00:00:00.000Z",
 *     systemVersion: "hash-1",
 *     systemChanged: true,
 *     firstSystem: true,
 *     previousCallId: null,
 *     messages: [],
 *     omittedMessageCount: 0,
 * };
 * ```
 */
export interface BrowserModelInputSummary {
    /** 所属 Goal 标识。 */
    readonly goalId: string;
    /** 所属 Run 标识。 */
    readonly runId: string;
    /** 模型调用唯一标识。 */
    readonly callId: string;
    /** 执行单元标识。 */
    readonly executionUnitId?: string;
    /** Step 序号。 */
    readonly stepIndex: number;
    /** 调用阶段。 */
    readonly stage: "think" | "decide" | "completion_review";
    /** 发生时间。 */
    readonly occurredAt: string;
    /** 系统提示词版本哈希。 */
    readonly systemVersion: string;
    /** 系统提示词相对前一次调用是否变化。 */
    readonly systemChanged: boolean;
    /** 是否为此 Run 首次出现系统提示词。 */
    readonly firstSystem: boolean;
    /** 前一次模型调用标识。 */
    readonly previousCallId: string | null;
    /** 预览消息列表。 */
    readonly messages: readonly {
        readonly role: BrowserModelInputMessageWire["role"];
        readonly source: BrowserModelInputMessageWire["source"];
        readonly index: number;
        readonly preview: string;
        readonly truncated: boolean;
    }[];
    /** 超出列表限制而省略的消息条数。 */
    readonly omittedMessageCount: number;
}

/**
 * 完整模型输入调用详情（用于只读比对）。
 *
 * @example
 * ```ts
 * const detail: BrowserModelInputDetail = {
 *     call: {
 *         goalId: "goal-1",
 *         runId: "run-1",
 *         callId: "call-1",
 *         stepIndex: 1,
 *         stage: "decide",
 *         occurredAt: "2026-10-18T00:00:00.000Z",
 *         messages: [],
 *     },
 *     previousSystem: null,
 *     previousCallId: null,
 *     systemVersion: "hash-1",
 * };
 * ```
 */
export interface BrowserModelInputDetail {
    /** 当前调用的完整输入事实。 */
    readonly call: BrowserModelInputRecordWire;
    /** 上一次调用的完整系统提示词（用于比对 diff）。 */
    readonly previousSystem: string | null;
    /** 上一次调用标识。 */
    readonly previousCallId: string | null;
    /** 当前系统提示词哈希。 */
    readonly systemVersion: string;
}
