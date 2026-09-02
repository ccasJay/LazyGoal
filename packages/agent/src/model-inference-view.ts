import type { ModelContextBudgetPlan } from "./model-context-budget";
import type { ModelExecutionUnitProjection } from "./trajectory-event-projector";
import type { WarmCompactEntry } from "./warm-reducer";

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
    | {
        readonly role: "user";
        readonly content: string;
        /** 对应 Goal.state.messages 的稳定原始索引。 */
        readonly sourceMessageIndex: number;
    }
    | {
        readonly role: "assistant";
        readonly assistant: { readonly profileId: string };
        readonly content: string;
        /** 对应 Goal.state.messages 的稳定原始索引。 */
        readonly sourceMessageIndex: number;
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
            | {
                readonly kind: "complete";
                readonly summary: string;
                readonly completionEvidence: readonly ModelCompletionEvidence[];
            }
            | { readonly kind: "wait"; readonly reason: string }
            | { readonly kind: "fail"; readonly error: string }
            | {
                readonly kind: "context_lookup";
                readonly need: "conversation_history" | "historical_execution" | "decision_rationale";
                readonly question: string;
                readonly filters?: import("../../runtime/src/context-retrieval").ContextLookupFilters;
            };
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
export type ModelMemoryProtocol = { readonly kind: "structured"; readonly version: 1 };

/** Agent 可消费的冻结模型上下文协议标识。 */
export type ModelContextProtocol = {
    readonly kind: "trajectory-layered";
    readonly version: 1;
};

/** Agent 可消费的冻结 Cold Trajectory 检索协议标识。 */
export type ModelContextRetrievalProtocol = { readonly kind: "bm25-lite"; readonly version: 1 };

/** 模型可见的 Memory 条目公共元数据。 */
export interface ModelMemoryEntryBase {
    readonly id: string;
    readonly originPhase: PromptPhase;
    readonly originSequence: number;
    readonly scope: "goal" | "phase";
    readonly updatedAtSequence: number;
}

/** 模型输入边界允许的递归 JSON 值。 */
export type ModelJsonValue =
    | null
    | boolean
    | number
    | string
    | readonly ModelJsonValue[]
    | { readonly [key: string]: ModelJsonValue };

/** 模型可见的实体化 Fact 投影。 */
export interface ModelFact extends ModelMemoryEntryBase {
    readonly kind: "fact";
    readonly subject: string;
    readonly predicate: string;
    readonly value: ModelJsonValue;
    readonly stability: "stable" | "last_observed";
    readonly evidenceSequences: readonly number[];
    readonly reinforcementCount: number;
    readonly lastEvidenceSequence: number;
    readonly source: "model" | "tool_projector" | "runtime";
}

/** 模型可见的 Hypothesis 投影。 */
export interface ModelHypothesis extends ModelMemoryEntryBase {
    readonly kind: "hypothesis";
    readonly statement: string;
    readonly status: "active" | "resolved" | "superseded";
}

/** 模型可见的计划条目投影。 */
export interface ModelPlanItem extends ModelMemoryEntryBase {
    readonly kind: "plan";
    readonly description: string;
    readonly status: "pending" | "active" | "completed" | "blocked" | "superseded";
    readonly dependsOnFactIds: readonly string[];
    readonly dependsOnPlanItemIds: readonly string[];
    readonly completionEvidenceSequences: readonly number[];
}

/** 模型可见的阻塞条目投影。 */
export interface ModelBlocker extends ModelMemoryEntryBase {
    readonly kind: "blocker";
    readonly description: string;
    readonly status: "active" | "resolved" | "superseded";
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
 *   facts: [],
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
    readonly facts: readonly ModelFact[];
    readonly hypotheses: readonly ModelHypothesis[];
    readonly plan: readonly ModelPlanItem[];
    readonly blockers: readonly ModelBlocker[];
}

/** Structured complete Decision 使用的模型视图。 */
export interface ModelCompletionEvidence {
    readonly criterionIndex: number;
    readonly evidenceSequences: readonly number[];
}

/**
 * 模型可见的历史 Context Lookup 命中；它保留原始来源但不代表当前状态。
 *
 * @remarks
 * `sourceEventIds` 只用于回查原始 committed Trajectory；该 DTO 本身不是
 * Fact/Completion Evidence，也不能证明当前 Workspace 内容仍然相同。
 *
 * @example
 * ```ts
 * const match: ModelContextLookupMatch = {
 *   documentId: "doc-1",
 *   goalId: "goal-1",
 *   runId: "run-1",
 *   firstSequence: 3,
 *   lastSequence: 4,
 *   matchedFields: ["path"],
 *   score: 2,
 *   preview: "src/index.ts",
 *   truncated: false,
 *   historical: true,
 *   sourceEventIds: ["event-3"],
 * };
 * ```
 */
export interface ModelContextLookupMatch {
    readonly documentId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly matchedFields: readonly import("../../runtime/src/context-retrieval").ContextLookupMatchedField[];
    readonly score: number;
    readonly preview: string;
    readonly truncated: boolean;
    readonly adjacent?: boolean;
    readonly historical: true;
    readonly sourceEventIds: readonly string[];
    readonly source?:
        | {
            readonly kind: "trajectory";
            readonly firstSequence: number;
            readonly lastSequence: number;
            readonly sourceEventIds: readonly string[];
        }
        | {
            readonly kind: "conversation";
            readonly messageIndex: number;
            readonly role: "user" | "assistant";
            readonly contentHash: string;
        };
}

/**
 * 提醒模型历史结果可能描述已变化的 Workspace/Environment。
 *
 * @example
 * ```ts
 * const freshness: ModelContextLookupFreshness = {
 *   kind: "historical",
 *   committedThroughSequence: 4,
 *   warning: "需要重新观察当前状态",
 * };
 * ```
 */
export interface ModelContextLookupFreshness {
    readonly kind: "historical";
    readonly committedThroughSequence: number;
    readonly warning: string;
}

/**
 * Context Lookup Result 的模型投影。
 *
 * @remarks
 * found 结果携带固定的历史时效提示；模型不能把 Lookup 事件或预览文本本身
 * 当作完成证据，若当前状态可能变化，仍须通过授权 Tool 重新观察。
 *
 * @example
 * ```ts
 * const result: ModelContextLookupResult = {
 *   status: "not_found",
 *   lookupId: "lookup-1",
 * };
 * ```
 */
export type ModelContextLookupResult =
    | {
        readonly status: "found";
        readonly lookupId: string;
        readonly committedThroughSequence: number;
        readonly queryHash?: string;
        readonly indexVersion?: string;
        readonly matches: readonly ModelContextLookupMatch[];
        readonly truncated: boolean;
        readonly freshness: ModelContextLookupFreshness;
    }
    | {
        readonly status: "not_found";
        readonly lookupId: string;
        readonly committedThroughSequence?: number;
        readonly reason?: string;
    }
    | {
        readonly status: "lookup_error";
        readonly lookupId: string;
        readonly code: string;
        readonly message: string;
        readonly committedThroughSequence?: number;
    };

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
    /** Goal 创建时冻结的当前 Prompt Bundle 版本。 */
    readonly promptBundleVersion: 1;
    /** 决定 Phase Protocol 模板选择的当前业务阶段。 */
    readonly phase: PromptPhase;
    /** 冻结 Profile 的模型可读投影。 */
    readonly profile: ModelProfileView;
    /** 按 Tool ID 稳定升序排列的授权 Tool 描述。 */
    readonly authorizedTools: readonly ModelToolDefinition[];
    /** Goal 冻结的 Memory 协议。 */
    readonly memoryProtocol: ModelMemoryProtocol;
    /** Goal 冻结的模型上下文协议。 */
    readonly modelContextProtocol: ModelContextProtocol;
    /** Goal 冻结的 Cold Trajectory 检索协议。 */
    readonly contextRetrievalProtocol: ModelContextRetrievalProtocol;
}

/** 与 GoalWorkflowState 对应的 Preparation 阶段。 */
export type PreparationPhase = "gathering_context" | "planning";

/**
 * 按阶段投影的 Working Context。
 *
 * @remarks
 * Preparation 只投影稳定 intent；Executing 额外投影已批准任务与有界执行记忆
 * （Step 预算、最近 Step 与 pending Action）。该视图不包含
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
            readonly previousStep?: ModelStepRecord;
            readonly pendingAction?: ModelPendingAction;
        };
    };

/**
 * 分层模型上下文的本轮不可变投影。
 *
 * @remarks
 * `hot` 只包含 committed Trajectory 中完整且连续的执行单元，`warm` 是可丢弃的
 * 有损语义条目；两者都不承载 Task、pending Action 或 Run 控制状态，这些字段
 * 继续由 `workingContext` 和 `workingMemory` 的权威投影提供。`budget` 是本轮
 * 固定输入、响应预留及历史分层配额的报告。该 DTO 只存在于一次模型调用中，
 * 不写回 Goal、Snapshot、Working Memory 或 Trajectory。
 *
 * @example
 * ```ts
 * const context: ModelTrajectoryContext = {
 *     measuredAs: "character",
 *     softOverflow: false,
 *     hot: [],
 *     warm: [],
 *     budget,
 * };
 * ```
 */
export interface ModelTrajectoryContext {
    /** 本轮 Hot/Warm 使用的统一计量单位。 */
    readonly measuredAs: "token" | "character";
    /** 固定输入已达到历史预算边界时的软超限标记。 */
    readonly softOverflow: boolean;
    /** 从最新完整执行单元开始选择的连续 Hot 后缀。 */
    readonly hot: readonly ModelExecutionUnitProjection[];
    /** 按语义分区归约后保留的有损 Warm 条目。 */
    readonly warm: readonly WarmCompactEntry[];
    /** 本轮固定输入与 Hot/Warm 配额报告。 */
    readonly budget: ModelContextBudgetPlan;
}

/** 模型可见的 Context Epoch 控制状态。 */
export interface ModelContextControl {
    /** 当前 Epoch 是否需要模型先提交检查点。 */
    readonly status: "active" | "checkpoint_required";
    /** 触发检查点的稳定原因。 */
    readonly reason?: "conversation_pruned" | "input_threshold";
    /** 不含 Hot/Warm 的 Epoch 输入 Token 数。 */
    readonly inputTokens: number;
    /** 该 Goal 的输入硬上限。 */
    readonly hardInputLimit: number;
    /** 距离硬上限的剩余 Token。 */
    readonly remainingTokens: number;
}

/** `trajectory-layered@1` 的单轮 Epoch 投影。 */
export interface ModelContextEpochView {
    readonly protocolVersion: 1;
    readonly epochNumber: number;
    readonly conversationStartIndex: number;
    readonly openedAtSequence: number;
    readonly control: ModelContextControl;
}

/**
 * Preparation 用户输入 provenance 的模型侧 hash-only 投影。
 *
 * @remarks
 * 该 DTO 只保留 committed sequence、Goal Conversation 原始索引和内容摘要，
 * 不携带用户正文；它只能为 Preparation Fact 提供可回查来源，不能证明 Plan
 * 完成或 Executing 完成。
 *
 * @example
 * ```ts
 * const evidence: ModelPreparationInputEvidence = {
 *     sequence: 2,
 *     messageIndex: 1,
 *     contentHash: "sha256:<64 hex characters>",
 * };
 * ```
 */
export interface ModelPreparationInputEvidence {
    /** `preparation_input_recorded` 事件的 committed sequence。 */
    readonly sequence: number;
    /** 对应真实用户消息在 Goal Conversation 中的原始索引。 */
    readonly messageIndex: number;
    /** 用户消息正文的 UTF-8 SHA-256 摘要；该 DTO 不携带正文。 */
    readonly contentHash: `sha256:${string}`;
}

/**
 * 最终模型可见 Conversation 位置到 Goal 原始消息位置的映射项。
 *
 * @remarks
 * `visibleIndex` 只在本轮最终请求的真实 Conversation 中有效，不包含 system 或
 * Working Context 控制消息；`sourceMessageIndex` 始终指向 Goal 的原始消息数组。
 * 该映射不包含正文。
 *
 * @example
 * ```ts
 * const mapping: VisibleConversationMessageMapEntry = {
 *     visibleIndex: 0,
 *     sourceMessageIndex: 3,
 * };
 * ```
 */
export interface VisibleConversationMessageMapEntry {
    /** 最终请求中真实 Conversation 的可见数组索引。 */
    readonly visibleIndex: number;
    /** 对应 Goal.state.messages 的原始数组索引。 */
    readonly sourceMessageIndex: number;
}

/**
 * 一次模型推理的完整输入投影。
 *
 * @remarks
 * 该对象由 Runtime State 单向派生，只含构建 Prompt 所需的数据：深冻结的
 * `PromptContext`、真实会话、阶段化 Working Context。它不包含 Storage
 * schemaVersion、迁移标记、Run 状态字段或瞬时执行授权。`PromptContext` 单独承载
 * Prompt Bundle 版本、Phase、冻结 Profile 与授权 Tool 描述，供 Renderer 只读消费；
 * 真实会话与 Working Context 独立承载，不得进入模板环境；Conversation 每条消息
 * 保留其 Goal 原始索引但不把索引写入正文；分层协议额外通过 `trajectoryContext`
 * 承载本轮 Hot/Warm 与预算报告。Renderer 对未知 Prompt Bundle 版本直接失败，
 * 不回退到最新版。
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
    /** 保留原始 Goal message index 的真实会话投影。 */
    readonly conversation: readonly ModelConversationMessage[];
    readonly workingContext: ModelWorkingContext;
    /** structured@1 的即时 Memory 投影。 */
    readonly workingMemory: ModelWorkingMemory;
    /** trajectory-layered@1 的即时 Hot/Warm 投影。 */
    readonly trajectoryContext?: ModelTrajectoryContext;
    /**
     * 上一轮已提交的历史 Lookup 结果；仅属于当前模型调用，不写入 Goal、
     * Snapshot 或 Working Memory。结果带 committed boundary，不能替代当前
     * Workspace/Environment 的授权 Tool Observation。
     */
    readonly contextLookupResult?: ModelContextLookupResult;
    /** 已提交 Preparation 用户输入的 hash-only provenance；Executing 不得携带。 */
    readonly preparationInputEvidence?: readonly ModelPreparationInputEvidence[];
    /** `trajectory-layered@1` 的当前 Epoch 控制投影。 */
    readonly contextEpoch: ModelContextEpochView;
}
