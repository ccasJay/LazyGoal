/**
 * ModelInferenceView 的独立 DTO 契约。
 *
 * @remarks
 * 本文件只声明发送给模型推理的投影类型与协议文本，不导入 Runtime 的任何
 * 领域类型（Profile、Goal、Step、Pending Action 或 ToolDefinition）。这样模型
 * 输入视图可以独立演进，且不会被 Runtime 聚合类型或嵌套执行状态类型所引用。
 * 从 Runtime State 到本视图的单向转换由独立的 Projector 完成。
 */

/** 已冻结 Profile 的模型可读投影。 */
export interface ModelProfileView {
    readonly id: string;
    readonly name?: string;
    readonly description?: string;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
}

/** 一次模型轮次会消费的真实会话消息投影。 */
export type ModelConversationMessage =
    | { readonly role: "user"; readonly content: string }
    | {
        readonly role: "assistant";
        readonly assistant: { readonly profileId: string };
        readonly content: string;
    };

/** 模型可见的稳定任务定义投影。 */
export interface ModelTask {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/** 模型可见的单个 Tool Action 投影。 */
export interface ModelToolCallAction {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: unknown;
}

/** 模型可见的 Recent Step 投影（仅复制当前协议已消费的两种记录）。 */
export type ModelStepRecord =
    | {
        readonly kind: "action";
        readonly action: ModelToolCallAction;
        readonly observation: unknown;
    }
    | {
        readonly kind: "decision";
        readonly result:
            | { readonly kind: "complete"; readonly checkpoint: string; readonly summary: string }
            | { readonly kind: "wait"; readonly checkpoint: string; readonly reason: string }
            | { readonly kind: "fail"; readonly checkpoint: string; readonly error: string };
    };

/** 模型可见的待执行 Action 投影。 */
export interface ModelPendingAction {
    readonly action: ModelToolCallAction;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
}

/** 已授权且经 Registry 解析出的 Tool 描述投影。 */
export interface ModelToolDefinition {
    readonly id: string;
    readonly description: string;
    readonly inputSchema: unknown;
}

/** 与 GoalWorkflowState 对应的 Preparation 阶段。 */
export type PreparationPhase = "gathering_context" | "planning";

/**
 * 按阶段投影的 Working Context。
 *
 * @remarks
 * Preparation 只投影稳定 intent；Executing 额外投影已批准任务与有界执行记忆
 * （Step 预算、checkpoint、最近 Step 与 pending Action）。该视图不包含
 * Run 状态机字段（status、stopReason）或任何瞬时执行资源。
 */
export type ModelWorkingContext =
    | { readonly phase: "gathering_context"; readonly intent: string }
    | { readonly phase: "planning"; readonly intent: string }
    | {
        readonly phase: "executing";
        readonly intent: string;
        readonly task: ModelTask;
        readonly execution: {
            readonly stepCount: number;
            readonly maxSteps?: number;
            readonly checkpoint?: string;
            readonly previousStep?: ModelStepRecord;
            readonly pendingAction?: ModelPendingAction;
        };
    };

/**
 * 一次模型推理的完整输入投影。
 *
 * @remarks
 * 该对象由 Runtime State 单向派生，只含构建 Prompt 所需的数据：响应协议种类、
 * Global System Prompt 版本、冻结 Profile、真实会话、阶段化 Working Context
 * 与授权 Tool 描述。它不包含 Storage schemaVersion、迁移标记、Run 状态字段
 * 或瞬时执行授权。Renderer 对未知 Prompt 版本直接失败，不回退到最新版。
 *
 * @example
 * ```ts
 * const view: ModelInferenceView = {
 *     globalSystemPromptVersion: 1,
 *     protocol: "gathering_context",
 *     profile,
 *     conversation: [],
 *     workingContext: { phase: "gathering_context", intent: "完成目标" },
 *     authorizedTools: [],
 * };
 * ```
 */
export interface ModelInferenceView {
    /** Goal 创建时冻结、由 Renderer 解析为 Global Overview 的版本。 */
    readonly globalSystemPromptVersion: number;
    readonly protocol: "gathering_context" | "planning" | "agent_decision";
    readonly profile: ModelProfileView;
    readonly conversation: readonly ModelConversationMessage[];
    readonly workingContext: ModelWorkingContext;
    readonly authorizedTools: readonly ModelToolDefinition[];
}

/**
 * 约束模型只返回可被 AgentDecisionSchema 验证的单个 JSON 对象。
 * `checkpoint` 必须吸收当前 Working Context；Tool 执行结果只能由 Runtime 回填。
 */
export const AGENT_DECISION_PROTOCOL = [
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "输出必须符合 AgentDecision 协议，只能选择以下四个 kind 分支。",
    'Tool 调用形状为 {"kind":"tool_call","checkpoint":"累计状态",',
    '"action":{"actionId":"稳定 ID","toolId":"授权 Tool ID","input":对象}}。',
    '结束形状为 {"kind":"complete|wait|fail","checkpoint":"累计状态",',
    '"summary|reason|error":"非空文本"}，字段名必须与 kind 匹配。',
    "checkpoint、actionId、toolId 和对应文本字段必须是非空字符串。",
    "不要自行声明 Tool 的执行结果；必须等待 Runtime 提供 Observation。",
].join("\n");

/** Preparation 阶段对应的严格输出协议。 */
export const PREPARATION_RESULT_PROTOCOL: Readonly<
    Record<PreparationPhase, string>
> = {
    gathering_context: [
        "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
        '允许的形状为 {"kind":"question","question":"非空文本"} 或',
        '{"kind":"context_ready"}。',
        "不要返回任务提案或执行结果。",
    ].join("\n"),
    planning: [
        "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
        '唯一允许的形状为 {"kind":"task_proposal","task":',
        '{"objective":"非空文本","completionCriteria":["非空文本"]},',
        '"approvalRequest":"非空文本"}。',
        "不要返回问题、context_ready 或执行结果。",
    ].join("\n"),
};
