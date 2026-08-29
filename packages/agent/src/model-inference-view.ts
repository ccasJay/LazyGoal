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
            | { readonly kind: "fail"; readonly checkpoint: string; readonly error: string }
            | {
                readonly kind: "complete";
                readonly summary: string;
                readonly completionEvidence: readonly ModelCompletionEvidence[];
            }
            | { readonly kind: "wait"; readonly reason: string }
            | { readonly kind: "fail"; readonly error: string };
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

/** Prompt Bundle 渲染时区分的三种业务阶段。 */
export type PromptPhase = "gathering_context" | "planning" | "executing";

/** Agent 可消费的冻结 Memory 协议标识。 */
export type ModelMemoryProtocol =
    | { readonly kind: "checkpoint"; readonly version: 1 }
    | { readonly kind: "structured"; readonly version: 1 };

/** Agent 可消费的冻结模型上下文协议标识。 */
export type ModelContextProtocol =
    | { readonly kind: "conversation"; readonly version: 1 }
    | { readonly kind: "trajectory-layered"; readonly version: 1 };

/** 模型可见的 Memory 条目公共元数据。 */
export interface ModelMemoryEntryBase {
    readonly id: string;
    readonly originPhase: PromptPhase;
    readonly originSequence: number;
    readonly scope: "goal" | "phase";
    readonly status: "active" | "resolved" | "superseded";
}

/** 模型可见的事实 Finding 投影。 */
export interface ModelFinding extends ModelMemoryEntryBase {
    readonly kind: "finding";
    readonly statement: string;
    readonly evidenceSequences: readonly number[];
}

/** 模型可见的 Hypothesis 投影。 */
export interface ModelHypothesis extends ModelMemoryEntryBase {
    readonly kind: "hypothesis";
    readonly statement: string;
}

/** 模型可见的计划条目投影。 */
export interface ModelPlanItem extends ModelMemoryEntryBase {
    readonly kind: "plan";
    readonly description: string;
}

/** 模型可见的阻塞条目投影。 */
export interface ModelBlocker extends ModelMemoryEntryBase {
    readonly kind: "blocker";
    readonly description: string;
}

/** 模型可见的下一步意图投影。 */
export interface ModelNextAction extends ModelMemoryEntryBase {
    readonly kind: "next_action";
    readonly description: string;
}

/**
 * Structured 协议的 Working Memory 模型视图。
 *
 * @remarks
 * 这是 Runtime WorkingMemory 的只读投影，不包含 checkpoint、pending Action、
 * Step 计数、Run 状态或原始 Tool 输出。只有 active 条目通常会被模型当作当前
 * 上下文使用，历史状态仍保留其生命周期字段供解释变更。
 *
 * @example
 * ```ts
 * const memory: ModelWorkingMemory = {
 *   protocolVersion: 1,
 *   derivedThroughSequence: 12,
 *   findings: [],
 *   hypotheses: [],
 *   plan: [],
 *   blockers: [],
 * };
 * ```
 */
export interface ModelWorkingMemory {
    readonly protocolVersion: 1;
    readonly derivedThroughSequence: number;
    readonly revision?: { readonly eventId: string; readonly sequence: number };
    readonly findings: readonly ModelFinding[];
    readonly hypotheses: readonly ModelHypothesis[];
    readonly plan: readonly ModelPlanItem[];
    readonly blockers: readonly ModelBlocker[];
    readonly nextAction?: ModelNextAction;
}

/** Structured complete Decision 使用的模型视图。 */
export interface ModelCompletionEvidence {
    readonly criterionIndex: number;
    readonly evidenceSequences: readonly number[];
}

/**
 * 一次 Prompt 渲染所需的、从 Runtime State 单向投影出的不可变上下文。
 *
 * @remarks
 * 该 DTO 只包含构建 system prompt 所需的稳定数据：Goal 冻结的 Prompt Bundle
 * 版本、当前业务阶段、冻结 Profile 与已授权 Tool 描述。它不包含 goalId、runId、
 * 当前时间、随机数、进程环境、Snapshot 元数据或瞬时授权，也不包含真实会话消息
 * （会话由 `ModelInferenceView.conversation` 独立承载）。Renderer 只读取本对象，
 * 不得修改它或任何 Runtime 领域状态。
 */
export interface PromptContext {
    /** Goal 创建时冻结、用于选择 Prompt Bundle 的正整数版本。 */
    readonly promptBundleVersion: number;
    /** 决定 Phase Protocol 模板选择的当前业务阶段。 */
    readonly phase: PromptPhase;
    /** 冻结 Profile 的模型可读投影。 */
    readonly profile: ModelProfileView;
    /** 按 Tool ID 稳定升序排列的授权 Tool 描述。 */
    readonly authorizedTools: readonly ModelToolDefinition[];
    /** Goal 冻结的 Memory 协议；legacy Bundle 为保持兼容可省略。 */
    readonly memoryProtocol?: ModelMemoryProtocol;
    /** Goal 冻结的模型上下文协议；省略时按 `conversation@1` 解释。 */
    readonly modelContextProtocol?: ModelContextProtocol;
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
 * 该对象由 Runtime State 单向派生，只含构建 Prompt 所需的数据：深冻结的
 * `PromptContext`、真实会话、阶段化 Working Context。它不包含 Storage
 * schemaVersion、迁移标记、Run 状态字段或瞬时执行授权。`PromptContext` 单独承载
 * Prompt Bundle 版本、Phase、冻结 Profile 与授权 Tool 描述，供 Renderer 只读消费；
 * 真实会话与 Working Context 独立承载，不得进入模板环境。Renderer 对未知 Prompt
 * Bundle 版本直接失败，不回退到最新版。
 *
 * @example
 * ```ts
 * const view: ModelInferenceView = {
 *     prompt: {
 *         promptBundleVersion: 1,
 *         phase: "gathering_context",
 *         profile,
 *         authorizedTools: [],
 *     },
 *     conversation: [],
 *     workingContext: { phase: "gathering_context", intent: "完成目标" },
 * };
 * ```
 */
export interface ModelInferenceView {
    /** 本轮渲染所需的不可变 Prompt 上下文（含冻结版本、Phase、Profile 与工具）。 */
    readonly prompt: PromptContext;
    readonly conversation: readonly ModelConversationMessage[];
    readonly workingContext: ModelWorkingContext;
    /** structured@1 的即时 Memory 投影；checkpoint@1 必须省略。 */
    readonly workingMemory?: ModelWorkingMemory;
}
