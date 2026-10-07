import type { AgentProfile } from "./agent-profile";
import type {
    AgentDecision,
    BlockerCreate,
    BlockerUpdate,
    CompletionAcceptance,
    CompletionEvidence,
    CompletionExpectOutcome,
    CompletionCriterion,
    FactProposal,
    FactScalar,
    FactStability,
    FactValue,
    GoalTask,
    HypothesisCreate,
    HypothesisUpdate,
    MemoryPatchOperation,
    ModelContextCheckpointResult,
    RetireFactProposal,
    StructuredAgentDecision,
    ToolCallAction,
    WorkingMemoryPatch,
    AskUserQuestion,
    AskUserAnswer,
} from "../../model-contracts/src/index";
import type {
    ContextLookupRequest,
    ContextLookupResult,
} from "./context-retrieval";
import type { ToolObservation } from "./tool";
import type { GoalPlan } from "./goal-plan";
import type { EffectiveSandboxScope, SandboxExecutionPlan } from "../../sandbox/src/index";

import {
    isMemoryProtocol,
    type Blocker,
    type CanonicalMemoryOperation,
    type EvidenceBackedFact,
    type Hypothesis,
    type MemoryEntry,
    type MemoryEntryBase,
    type MemoryEntryKind,
    type MemoryEntryScope,
    type MemoryEntrySource,
    type MemoryEntryStatus,
    type MemoryOriginPhase,
    type MemoryPatch,
    type MemoryProtocol,
    type MemoryRevision,
    type WorkingMemory,
} from "../../working-memory/src/index";

export type {
    CompletionAcceptance,
    CompletionExpectOutcome,
    CompletionCriterion,
    GoalTask,
    AskUserQuestion,
    AskUserAnswer,
    ToolObservation,
    SandboxExecutionPlan,
};
export type { GoalPlan, GoalPlanItem, GoalPlanPatch, GoalPlanPatchOperation, GoalPlanStatus } from "./goal-plan";

/** 单个 Run 的任务提案审批模式。 */
export type RunMode = "normal" | "plan";

/** Goal 工作流使用的稳定阶段名称。 */
export type GoalPhase =
    | "executing";

/** Goal 创建后冻结的模型上下文协议。 */
export type ModelContextProtocol = {
    readonly kind: "trajectory-layered";
    readonly version: 1;
};

/** Goal 创建后冻结的 Cold Trajectory 检索协议。 */
export type ContextRetrievalProtocol = {
    readonly kind: "bm25-lite";
    readonly version: 1;
};



/**
 * 指向最新已提交 accepted Patch 的不可变 revision。
 *
 * @example
 * ```ts
 * const revision: MemoryRevision = { eventId: "event-12", sequence: 12 };
 * ```
 */

/**
 * 当前 Step 内未完成的 Decide/Think 输出修复链。
 *
 * @remarks
 * 指针仅保存恢复所需的阶段、输入摘要、已开始次数和 Trajectory 事实身份；修复内容
 * 从最新已提交的反馈事实读取。恢复必须核对 Goal、Run、Step、执行单元和阶段输入。
 *
 * @example
 * ```ts
 * const repair: PendingModelRepair = {
 *     goalId: "goal-1", runId: "run-1", stepOrdinal: 1,
 *     executionUnitId: "unit-1", stage: "decide",
 *     inputBoundary: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *     attemptsStarted: 1, latestAttemptEventId: "event-10",
 * };
 * ```
 */
export interface PendingModelRepair {
    readonly goalId: string;
    readonly runId: string;
    readonly stepOrdinal: number;
    readonly executionUnitId: string;
    readonly stage: "decide" | "think";
    readonly inputBoundary: `sha256:${string}`;
    readonly attemptsStarted: number;
    readonly latestAttemptEventId: string;
    readonly latestFeedbackEventId?: string;
    readonly thinkRequestId?: string;
}


/**
 * 当前 executing Step 的已提交 Think 链恢复指针。
 *
 * @remarks
 * 指针只引用当前 Step 最近一个已提交的 Think 输出；完整目标和输出从 Snapshot
 * 边界内的 Trajectory 事实恢复。`inputBoundary` 绑定 Step 起始输入与模型选择，
 * 输入身份变化时不得复用旧 Think 输出。
 *
 * @example
 * ```ts
 * const pendingThink: PendingThink = {
 *     goalId: "goal-1", runId: "run-1", stepOrdinal: 3,
 *     executionUnitId: "execution-unit-1",
 *     inputBoundary: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *     latestThinkEventId: "event-42",
 * };
 * ```
 */
export interface PendingThink {
    /** 持有该阶段链的 Goal 稳定标识。 */
    readonly goalId: string;
    /** 持有该阶段链的 Run 稳定标识。 */
    readonly runId: string;
    /** 当前尚未完成 Step 的一基序号，即 `stepCount + 1`。 */
    readonly stepOrdinal: number;
    /** 当前 Step 的稳定执行单元 ID；恢复后沿用以验证阶段事实归属。 */
    readonly executionUnitId: string;
    /** 对 Step 起始输入、授权工具和模型选择的 canonical SHA-256 摘要。 */
    readonly inputBoundary: `sha256:${string}`;
    /** Snapshot 边界内最近一个 `think_completed` Trajectory Event 的 ID。 */
    readonly latestThinkEventId: string;
}

export type {
    BlockerCreate,
    BlockerUpdate,
    FactProposal,
    FactScalar,
    FactValue,
    HypothesisCreate,
    HypothesisUpdate,
    MemoryPatchOperation,
    RetireFactProposal,
    WorkingMemoryPatch,
};


/**
 * 写入 Trajectory 的 accepted Memory Patch 事实载荷。
 *
 * @example
 * ```ts
 * const payload: MemoryPatchAcceptedPayload = { type: "memory_patch_accepted",
 *   protocolVersion: 1, producers: ["runtime_lifecycle"], operations: [] };
 * ```
 */
export interface MemoryPatchAcceptedPayload {
    readonly type: "memory_patch_accepted";
    readonly protocolVersion: 1;
    readonly producers: readonly ("model" | "tool_projector" | "runtime_lifecycle")[];
    readonly parentRevisionEventId?: string;
    readonly operations: readonly CanonicalMemoryOperation[];
}

/**
 * 供 Runtime 与 Agent 组合根校验冻结协议组合的输入。
 *
 * @example
 * ```ts
 * const input: GoalProtocolValidationInput = {
 *     promptBundleVersion: 1,
 *     memoryProtocol: { kind: "structured", version: 1 },
 *     modelContextProtocol: { kind: "trajectory-layered", version: 1 },
 *     contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
 * };
 * ```
 */
export interface GoalProtocolValidationInput {
    readonly promptBundleVersion: 1;
    readonly memoryProtocol: MemoryProtocol;
    readonly modelContextProtocol: ModelContextProtocol;
    readonly contextRetrievalProtocol: ContextRetrievalProtocol;
}

/**
 * 验证 Goal 的 Prompt Bundle 与 Memory 协议是否为受支持的组合。
 *
 * @remarks
 * Validator 只读输入，不调用模型、不推进 Goal、不写 Snapshot 或 Trajectory。
 * 实现应在任何模型或持久化副作用前拒绝未知版本和交叉组合，并抛出可识别的
 * `GoalProtocolError` 或等价稳定错误。
 *
 * @example
 * ```ts
 * const validator: GoalProtocolValidator = {
 *     validate: ({ promptBundleVersion }) => {
 *         if (promptBundleVersion !== 1) {
 *             throw new GoalProtocolError("不支持的 Prompt Bundle 版本");
 *         }
 *     },
 * };
 * ```
 */
export interface GoalProtocolValidator {
    /**
     * @param input - Goal 冻结的 Prompt Bundle 与 Memory 协议组合。
     * @throws GoalProtocolError 或实现定义的稳定协议错误，当组合未知或不匹配时。
     */
    validate(input: GoalProtocolValidationInput): void;
}

/** Goal 协议组合错误的稳定错误码。 */
export const GOAL_PROTOCOL_ERROR_CODE = "GOAL_PROTOCOL_ERROR" as const;

/**
 * 表示冻结的 Prompt/Memory 协议组合不可用或不匹配。
 *
 * @remarks
 * 该错误表示调用方必须 fail closed；抛出后不得继续模型调用、状态推进或持久化。
 * `cause` 只供诊断使用，不承诺可序列化。
 *
 * @example
 * ```ts
 * throw new GoalProtocolError("不支持的 Memory 协议");
 * ```
 */
export class GoalProtocolError extends Error {
    readonly code = GOAL_PROTOCOL_ERROR_CODE;
    readonly cause?: unknown;

    /** @param message - 不包含会话正文的稳定诊断文本。 */
    constructor(message: string, cause?: unknown) {
        super(`${GOAL_PROTOCOL_ERROR_CODE}: ${message}`);
        this.name = "GoalProtocolError";
        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}


/** 判断未知值是否为受支持的模型上下文协议判别联合。 */
export function isModelContextProtocol(
    value: unknown,
): value is ModelContextProtocol {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        candidate.kind === "trajectory-layered"
        && candidate.version === 1
        && Object.keys(candidate).every((key) => key === "kind" || key === "version")
    );
}

/** 判断未知值是否为受支持的 Cold Trajectory 检索协议。 */
export function isContextRetrievalProtocol(
    value: unknown,
): value is ContextRetrievalProtocol {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        candidate.kind === "bm25-lite"
        && candidate.version === 1
        && Object.keys(candidate).every((key) => key === "kind" || key === "version")
    );
}


/**
 * Tool 输入和 Observation 输出使用的递归 JSON 对象。
 *
 * @remarks
 * 该边界排除函数、`undefined`、`bigint` 和循环引用，保证 Action/Observation
 * 能随 Goal 快照稳定序列化。
 *
 * @example
 * ```ts
 * const input: JsonObject = { path: "src/index.ts" };
 * ```
 */
export interface JsonObject {
    readonly [key: string]: JsonValue;
}

/** Tool 输入与 Observation 输出允许的 JSON 值。 */
export type JsonValue =
    | null
    | boolean
    | number
    | string
    | readonly JsonValue[]
    | JsonObject;

/**
 * 用户实际发送并需要随 Session 恢复的消息。
 * @example
 * ```ts
 * const message: UserMessage = { role: "user", content: "继续" };
 * ```
 */
export interface UserMessage {
    readonly role: "user";
    readonly content: string;
}

/**
 * Assistant 实际发送并需要随 Session 恢复的消息。
 *
 * @remarks `profileId` 记录消息来源；Working Context 不属于真实消息。
 * @example
 * ```ts
 * const message: AssistantMessage = {
 *   role: "assistant",
 *   assistant: { profileId: "default" },
 *   content: "需要批准后继续",
 * };
 * ```
 */
export interface AssistantMessage {
    readonly role: "assistant";
    readonly assistant: { readonly profileId: string };
    readonly content: string;
}

/** 按时间顺序持久化的真实 Session 消息。 */
export type GoalMessage = UserMessage | AssistantMessage;

/**
 * Goal 创建后冻结的定义。
 *
 * @remarks
 * 原始意图、当前 Prompt Bundle、三项上下文协议、Profile 和执行策略在 Session
 * 生命周期内保持不变。Runtime 不持有或渲染 Prompt 文本。
 * @example
 * ```ts
 * const definition: GoalDefinition = {
 *   intent: "实现恢复能力",
 *   promptBundleVersion: 1,
 *   profile,
 *   executionPolicy: { maxSteps: 0 },
 * };
 * ```
 */
export interface GoalDefinition {
    readonly intent: string;
    /** 恢复时必须继续使用的当前 Prompt Bundle 版本。 */
    readonly promptBundleVersion: 1;
    /** Goal 创建时冻结的结构化 Working Memory 协议。 */
    readonly memoryProtocol: MemoryProtocol;
    /** Goal 创建时冻结的分层模型上下文协议。 */
    readonly modelContextProtocol: ModelContextProtocol;
    /** Goal 创建时冻结的 fielded BM25-lite 检索协议。 */
    readonly contextRetrievalProtocol: ContextRetrievalProtocol;
    readonly profile: AgentProfile;
    readonly executionPolicy: {
        /** 正整数表示上限，`0` 表示不以 Step 数量限制执行。 */
        readonly maxSteps: number;
    };
}

/**
 * 等待 AskUser 问答交互的挂起状态。
 *
 * @remarks
 * 包含全局请求 ID、交互模式（计划期或执行期）及规范化后的 1 至 3 个问题。
 *
 * @example
 * ```ts
 * const interaction: PendingInteractionAskUser = {
 *     kind: "ask_user",
 *     requestId: "ask-1",
 *     mode: "plan",
 *     questions: [],
 * };
 * ```
 */
export interface PendingInteractionAskUser {
    readonly kind: "ask_user";
    readonly requestId: string;
    readonly mode: "plan" | "execution";
    readonly questions: readonly AskUserQuestion[];
}

/**
 * 等待用户审查并批准任务提案的挂起状态。
 *
 * @remarks
 * 包含当前 Run 的稳定请求 ID、Agent 提出的任务目标、验收标准与审批提示。
 * 用户恢复交互时必须回传相同 request ID；反馈或批准后该 ID 立即失效。
 *
 * @example
 * ```ts
 * const interaction: PendingInteractionTaskApproval = {
 *     kind: "task_approval",
 *     requestId: "proposal-1",
 *     proposal: task,
 *     approvalRequest: "请确认任务目标",
 * };
 * ```
 */
export interface PendingInteractionTaskApproval {
    readonly kind: "task_approval";
    readonly requestId: string;
    readonly proposal: GoalTask;
    readonly approvalRequest: string;
}

/**
 * 待处理的用户交互挂起状态。
 *
 * @remarks
 * 在 Run 进入 waiting 时记录，与 pendingAction 严格互斥。
 *
 * @example
 * ```ts
 * const interaction: PendingInteraction = {
 *     kind: "ask_user",
 *     requestId: "ask-1",
 *     mode: "plan",
 *     questions: [],
 * };
 * ```
 */
export type PendingInteraction = PendingInteractionAskUser | PendingInteractionTaskApproval;

/**
 * Goal 工作流状态。
 *
 * @remarks
 * 只记录统一的 `executing` 生命周期；任务提案审批与已批准任务由当前 Run 持有。
 *
 * @example
 * ```ts
 * const workflow: GoalWorkflowState = {
 *     phase: "executing",
 * };
 * ```
 */
export type GoalWorkflowState = {
    readonly phase: "executing";
};

/**
 * Agent 请求 Runtime 调用的单个 Tool Action。
 *
 * @remarks
 * `actionId` 是一次 Action 生命周期的稳定身份；重放或审批必须沿用它。
 * `input` 只允许 JSON 值，Runtime 不把模型声明的执行结果当作 Observation。
 *
 * @example
 * ```ts
 * const action: ToolCallAction = {
 *   actionId: "action-1",
 *   toolId: "read_file",
 *   input: { path: "README.md" },
 * };
 * ```
 */
export type {
    ToolCallAction,
};


/**
 * Tool 执行环境返回的可信结果。
 *
 * @remarks
 * `success` 与 `failure` 都是正常 Tool 结果，`rejected` 表示策略或用户拒绝；
 * Tool 未能返回结果时由 Runtime 记录系统失败，不伪造 Observation。
 *
 * @example
 * ```ts
 * const observation: Observation = {
 *   kind: "success",
 *   output: "file content",
 *   summary: "已读取 README.md",
 * };
 * ```
 */
export type Observation =
    | {
        readonly kind: "success";
        readonly output: JsonValue;
        readonly summary: string;
    }
    | {
        readonly kind: "failure";
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
        readonly details?: JsonValue;
    }
    | {
        readonly kind: "rejected";
        readonly reason: string;
    };

/**
 * Structured `complete` Decision 对每个完成标准提交的事实序列引用。
 *
 * @remarks
 * `criterionIndex` 按当前 Goal Task 的 `completionCriteria` 零基索引；Runtime
 * 只验证索引覆盖、引用已提交且属于允许证据类别，不判断自然语言摘要是否真实。
 * 空完成标准必须使用空数组，不能伪造无关证据。
 *
 * @example
 * ```ts
 * const evidence: CompletionEvidence = {
 *   criterionIndex: 0,
 *   evidenceSequences: [18, 21],
 * };
 * ```
 */
export type {
    AgentDecision,
    CompletionEvidence,
    ModelContextCheckpointResult,
    StructuredAgentDecision,
};


/**
 * 当前未完成 Action 的持久化意图。
 *
 * @remarks
 * `approved` 表示已通过当前调度周期的授权，`awaiting_approval` 等待用户批准，
 * `outcome_unknown` 表示执行可能已经发生但结果未能保存；恢复时必须保留原
 * `actionId`。
 *
 * @example
 * ```ts
 * const pending: PendingAction = {
 *   action,
 *   status: "awaiting_approval",
 * };
 * ```
 */
export interface PendingAction {
    readonly action: ToolCallAction;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
    /** 已提交的 Tool 调用开始次数；只对获批 Action 设置，最多三次。 */
    readonly attemptsStarted?: number;
    /** 已批准 Action 使用的权限期限；单次批准为 action。 */
    readonly approvalScope?: "action" | "goal" | "workspace";
    /** 持续授权关联的待生效或有效 Grant；单次批准不设置。 */
    readonly grantId?: string;
    /** 审批类别：tool（常规工具审批）或 sandbox（沙箱越界能力审批）。 */
    readonly approvalKind?: "tool" | "sandbox";
    /** 获批或待审的规范化沙箱范围。 */
    readonly effectiveSandboxScope?: EffectiveSandboxScope;
}

/**
 * 最近一次已完成 Step 的有界记录。
 *
 * @remarks
 * Goal 只保存这一条记录，不累积完整 Action/Observation 轨迹。当前协议只
 * 产生 `action` 与 `decision` 两种记录。
 *
 * @example
 * ```ts
 * const step: StepRecord = {
 *   kind: "action",
 *   action,
 *   observation: { kind: "success", output: "ok", summary: "读取完成" },
 * };
 * ```
 */
export type StepRecord =
    | {
        readonly kind: "action";
        readonly action: ToolCallAction;
        readonly observation: Observation;
    }
    | {
        readonly kind: "decision";
        readonly result: Exclude<
            AgentDecision,
            | { readonly kind: "tool_call" }
            | { readonly kind: "context_checkpoint" }
            | { readonly kind: "ask_user" }
            | { readonly kind: "task_proposal" }
        >;
    };

/** 可识别的 Runtime 执行协议失败代码。 */
export type ExecutionErrorCode =
    | "TOOL_NOT_AUTHORIZED"
    | "TOOL_NOT_FOUND"
    | "INVALID_TOOL_INPUT"
    | "INVALID_MEMORY_PATCH"
    | "INVALID_AGENT_DECISION"
    | "MODEL_REQUEST_FAILED"
    | "TOOL_EXECUTION_ERROR";

/** 非 Step 自身导致的 Run 终止原因。 */
export type RunStopReason =
    | { readonly kind: "max_steps_exceeded" }
    | {
        readonly kind: "execution_error";
        readonly code: ExecutionErrorCode;
        readonly message: string;
    };

/**
 * 单个 Run 的可持久化执行状态。
 *
 * @remarks
 * `stepCount` 只统计 executing 阶段完成的决策或 Action/Observation 周期；
 * `lastStep` 只保留最新 Step。`pendingAction` 是有界执行记忆，不属于
 * Goal.messages。`pendingThink` 只保存当前 Step 的恢复指针，不复制 Think 文本。
 * 当前分层上下文 Epoch 始终由 Runtime 管理。
 * @example
 * ```ts
 * const run: RunState = createRun("run-1");
 * ```
 */
export interface RunState {
    readonly id: string;
    /** 当前 Run 是否要求先提交任务提案并等待用户审批。 */
    readonly mode: RunMode;
    /** Plan Run 经用户批准后固定的任务范围；普通 Run 与待审批 Run 省略。 */
    readonly approvedTask?: GoalTask;
    readonly status: RunStatus;
    readonly stepCount: number;
    /** 当前 Run 已向模型暴露完整 Schema 的工具 ID；只由 Runtime 更新并持久化。 */
    readonly exposedToolIds: readonly string[];
    /**
     * 最新有效 Goal Snapshot 纳入恢复边界的最大 Trajectory sequence。
     *
     * @remarks
     * 该字段是 Snapshot 纳入 Trajectory 恢复边界的最大 sequence。
     */
    readonly committedThroughSequence: number;
    /**
     * 当前 Snapshot 选择的最新 accepted Memory Patch 链头。
     *
     * @remarks 仅 structured 协议使用；省略表示尚未提交任何 Patch。该指针不携带
     * Memory 内容，恢复时由 Trajectory 反查并重放。
     */
    readonly memoryRevision?: MemoryRevision;
    readonly lastStep?: StepRecord;
    readonly pendingAction?: PendingAction;
    /** 当前由 Runtime 持有的程序父 Action；内部调用结算前不得增加 Step。 */
    readonly pendingProgram?: PendingProgram;
    readonly pendingInteraction?: PendingInteraction;
    readonly pendingThink?: PendingThink;
    readonly pendingModelRepair?: PendingModelRepair;
    readonly stopReason?: RunStopReason;
    /**
     * 当前模型上下文 Epoch。
     *
     * @remarks
     * Epoch 是 Conversation 的投影代际，不是摘要或供应商会话对象。该字段由
     * Runtime 分配并持久化；模型响应不得提交其中任何编号或边界字段。
     * @example
     * ```ts
     * const run = createRun("run-1");
     * console.log(run.contextEpoch.number);
     * ```
     */
    readonly contextEpoch: ModelContextEpochState;
}

/**
 * 程序执行的最小持久化恢复指针。
 *
 * @remarks
 * 代码保存在父 Action 输入中；工具的大结果只保存在已提交 Trajectory。
 * 每次恢复必须重新检查 worker、Node 与代码身份，不能依赖旧进程内存。
 *
 * @example
 * ```ts
 * const program: PendingProgram = {
 *   programId: "program-1", action: { actionId: "a1", toolId: "execute_program", input: { code: "return 1" } },
 *   executionUnitId: "unit-1", codeHash: "abc", workerHash: "def",
 *   nodeVersion: "v22", fixedTime: 0, seed: 1, nextCallIndex: 0,
 *   resultBytes: 0,
 * };
 * ```
 */
export interface PendingProgram {
    readonly programId: string;
    readonly action: ToolCallAction;
    readonly executionUnitId: string;
    readonly codeHash: string;
    readonly workerHash: string;
    readonly nodeVersion: string;
    readonly fixedTime: number;
    readonly seed: number;
    readonly nextCallIndex: number;
    /** 已提交内部结果占用的 UTF-8 字节数。 */
    readonly resultBytes: number;
    /** 停止原因需等未知副作用处理后才结算父程序。 */
    readonly pendingStop?: { readonly code: string; readonly message: string };
}

/** 当前 Snapshot 持久化的模型上下文 Epoch 状态。 */
export interface ModelContextEpochState {
    readonly version: 1;
    readonly number: number;
    readonly conversationStartIndex: number;
    readonly openedAtSequence: number;
}

/**
 * Goal 当前可变且需要持久化的状态。
 *
 * @remarks 交互不会消费 Run Step；已提交的 Tool Observation 会生成最新 Step；messages 只保存真实交互。
 * @example
 * ```ts
 * const state: GoalState = {
 *   workflow: { phase: "executing" },
 *   messages: [],
 *   run: createRun("run-1"),
 * };
 * ```
 */
/**
 * 结构化模型选择与执行参数恢复契约。
 *
 * @remarks
 * 记录 Goal 当前绑定的语言模型标识、供应商、结构化输出模式、容量上限与 Token 估算器。
 * 持久化到 Goal 快照中，用于进程重启后重建完全一致的模型绑定，严禁包含 API Key、baseURL 或凭据。
 *
 * @example
 * ```ts
 * const selection: GoalModelSelection = {
 *   provider: "anthropic",
 *   modelId: "claude-sonnet-4-5",
 *   structuredOutputMode: "prompt_only",
 *   contextWindowTokens: 200000,
 *   maxOutputTokens: 8192,
 *   inputEstimator: { kind: "character-v1" },
 * };
 * ```
 */
export interface GoalModelSelection {
    /** 语言模型供应商标识（如 "openai", "google", "anthropic" 等）。 */
    readonly provider: string;
    /** 模型唯一标识（如 "gpt-4o", "claude-sonnet-4-5"）。 */
    readonly modelId: string;
    /** 结构化输出模式：原生 strict 约束、prompt_only 提示词约束或 two_stage 双阶段推演。 */
    readonly structuredOutputMode?: "strict" | "prompt_only" | "two_stage" | undefined;
    /** 模型上下文窗口 Token 容量上限。 */
    readonly contextWindowTokens?: number | undefined;
    /** 单次补全最大输出 Token 限制。 */
    readonly maxOutputTokens?: number | undefined;
    /** 输入估算器契约：字符估算或精确 Tokenizer 编码。 */
    readonly inputEstimator:
        | { readonly kind: "character-v1" }
        | { readonly kind: "token-encoding"; readonly encoding: "cl100k_base" | "o200k_base" };
}

/** 缺省模型选择基准，供未显式指定模型选择的场景使用。 */
export const DEFAULT_GOAL_MODEL_SELECTION: GoalModelSelection = Object.freeze({
    provider: "default",
    modelId: "default-model",
    structuredOutputMode: "prompt_only",
    inputEstimator: Object.freeze({ kind: "character-v1" as const }),
});

/**
 * Goal 当前可变且需要持久化的状态。
 *
 * @remarks
 * 当前模式与已批准任务属于当前 Run；`nextRunMode` 只表示尚未启动的下一 Run。
 * GoalPlan 可独立于当前 Run 模式存在，并在首次成功计划写入前保持缺省。
 *
 * @example
 * ```ts
 * const state: GoalState = {
 *   workflow: { phase: "executing" },
 *   messages: [],
 *   run: createRun("run-1"),
 *   modelSelection: DEFAULT_GOAL_MODEL_SELECTION,
 * };
 * ```
 */
export interface GoalState {
    /** 已完成 Run 后为下一 Run 保存的一次性 Plan 模式选择。 */
    readonly nextRunMode?: "plan";
    readonly workflow: GoalWorkflowState;
    readonly messages: readonly GoalMessage[];
    readonly run: RunState;
    readonly modelSelection: GoalModelSelection;
    /** 可选的 Goal 进度计划；与当前 Run 模式及任务审批状态独立。 */
    readonly goalPlan?: GoalPlan;
    /** 已归档终态 Run 的只读摘要；初始 Goal 为空。 */
    readonly completedRuns?: readonly CompletedRunRecord[];
}

/**
 * 已归档终态 Run 的跨会话历史摘要。
 *
 * @remarks
 * 只保存归档时的状态、消息范围和轨迹边界；新 Run 不继承旧 Run 的证据。
 *
 * @example
 * ```ts
 * const previousRun: CompletedRunRecord = {
 *   runId: "run-1", status: "failed", stepCount: 1,
 *   committedThroughSequence: 8, messageRange: { start: 0, end: 1 },
 * };
 * ```
 */
export interface CompletedRunRecord {
    /** 已归档 Run 的稳定 ID。 */
    readonly runId: string;
    /** 归档时的终态，保留失败 Run 的真实状态。 */
    readonly status: "completed" | "failed";
    /** 归档时的 Step 数量。 */
    readonly stepCount: number;
    /** 该 Run Snapshot 最后纳入的局部 Trajectory sequence。 */
    readonly committedThroughSequence: number;
    /** 该 Run 在 Goal.messages 中占用的半开区间。 */
    readonly messageRange: { readonly start: number; readonly end: number };
}

/**
 * 一个可恢复的 Session 聚合，是 Runtime 的唯一领域真相。
 *
 * @remarks
 * definition 是冻结输入，state 是工作流推进产生的最新状态；Goal 不携带
 * Snapshot 版本、文件表示或迁移控制数据，持久化协议归 Storage Codec 所有。
 *
 * @example
 * ```ts
 * const goal = createGoal({ id: "goal-1", intent: "实现恢复", profile, runId: "run-1" });
 * ```
 */
export interface Goal {
    readonly id: string;
    readonly definition: GoalDefinition;
    readonly state: GoalState;
}

/** Scheduler 与 Runner 使用的 Goal/Run 显式关联键。 */
export interface RunRef {
    readonly goalId: string;
    readonly runId: string;
}

/**
 * 一次调度调用的瞬时授权。
 *
 * @remarks
 * `authorizedActionId` 只在当前 Scheduler/Runner 调用链内有效，不写入 Goal
 * 快照。它必须匹配已持久化且状态为 `approved` 的 pendingAction；批准本身不
 * 增加 `stepCount`。`signal` 同样只属于本次调用，不会写入 Goal 快照。
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * const options: RunExecutionOptions = {
 *   authorizedActionId: "action-1",
 *   signal: controller.signal,
 * };
 * ```
 */
export interface RunExecutionOptions {
    readonly authorizedActionId?: string;
    /** 可选的调用级中止信号；不会写入 Goal 快照。 */
    readonly signal?: AbortSignal;
    /** 上一轮已提交 Context Lookup 的瞬时结果；不会写入 Snapshot。 */
    readonly contextLookupResult?: ContextLookupResult;
    /**
     * 经核准或显式授权的本次非持久化沙箱执行计划。
     *
     * @remarks
     * 仅用于当前调用的 Action 执行；不写入 Snapshot 或 Trajectory。
     * 进程重启或 Action 重新核准后须重新构建。
     */
    readonly sandboxExecutionPlan?: SandboxExecutionPlan;
}

/** Run 生命周期状态；completed、failed、cancelled 是终态。 */
export type RunStatus =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

/**
 * 传给 transition 的显式状态转换输入。
 *
 * @remarks
 * `stage_action` 只建立可恢复的 Action 意图，不消费 Step；`approve_action` 和
 * `recover_action` 只解除或改变 Action 恢复状态，不消费 Step；`observe_action`、
 * `reject_action` 和非 Tool 的 `decision` 完成一个 Step。`execution_error`
 * 停止当前 Run 但不额外消费 Step，并在存在待执行 Action 时保留其不确定结果。
 *
 * `resume` 由外部协调器在保存解除 Agent wait 的真实输入时使用；`recover_action`
 * 由 Runner 在进程恢复时用于把已批准但结果未知的 Action 转为可处理的等待点。
 *
 * @example
 * ```ts
 * const input: RunInput = {
 *   kind: "stage_action",
 *   action: {
 *     actionId: "action-1",
 *     toolId: "read_file",
 *     input: { path: "config.json" },
 *   },
 * };
 * ```
 */
export type RunInput =
    | { readonly kind: "start" }
    | {
        readonly kind: "stage_action";
        readonly action: ToolCallAction;
        readonly status?: "approved" | "awaiting_approval";
        readonly approvalKind?: "tool" | "sandbox";
        readonly effectiveSandboxScope?: EffectiveSandboxScope;
    }
    | {
        readonly kind: "observe_action";
        readonly actionId: string;
        readonly observation: Exclude<Observation, { readonly kind: "rejected" }>;
    }
    | { readonly kind: "tool_outcome_unknown"; readonly actionId: string }
    | {
        readonly kind: "decision";
        readonly decision: Exclude<
            AgentDecision,
            | { readonly kind: "tool_call" }
            | { readonly kind: "context_checkpoint" }
            | { readonly kind: "ask_user" }
            | { readonly kind: "task_proposal" }
        >;
    }
    | {
        /** 完成一次 Plan Mode 的 GoalPlan 更新 Step；不改变 Run 的终态。 */
        readonly kind: "plan_update";
        readonly decision: Extract<AgentDecision, { readonly kind: "goal_plan_update" }>;
    }
    | {
        /** 完成一个 Context Lookup Step，但保持 Run running。 */
        readonly kind: "context_lookup";
        readonly request: ContextLookupRequest;
    }
    | {
        /** 完成一个工具发现 Step 并将 Runtime 匹配的工具并入可见集合。 */
        readonly kind: "tool_discovery";
        readonly decision: Extract<AgentDecision, { readonly kind: "tool_discovery" }>;
        readonly matchedToolIds: readonly string[];
    }
    | {
        readonly kind: "stage_interaction";
        readonly interaction: PendingInteraction;
    }
    | {
        readonly kind: "resolve_interaction";
        readonly interactionKind: PendingInteraction["kind"];
    }
    | {
        readonly kind: "reject_action";
        readonly actionId: string;
        readonly reason: string;
    }
    | {
        readonly kind: "approve_action";
        readonly actionId: string;
        readonly approvalScope?: "action" | "goal" | "workspace";
        readonly grantId?: string;
    }
    | {
        readonly kind: "recover_action";
        readonly actionId: string;
    }
    | {
        readonly kind: "execution_error";
        readonly code: ExecutionErrorCode;
        readonly message: string;
    }
    | { readonly kind: "resume" }
    | { readonly kind: "cancel" };

/** 状态转换结果；非法转换返回原状态和稳定错误，不抛出异常。 */
export type TransitionResult<TState extends RunState = RunState> =
    | { readonly ok: true; readonly state: TState }
    | {
        readonly ok: false;
        readonly state: TState;
        readonly error: {
            readonly code: "INVALID_TRANSITION";
            readonly message: string;
        };
    };

/**
 * createGoal 所需的确定性输入。
 *
 * @remarks intent 同时写入冻结定义和首条 user 消息；maxSteps 默认 0；
 * 当前实现只接受 Prompt Bundle v1 与唯一的三项上下文协议组合。
 * @example
 * ```ts
 * const input: GoalCreationInput = {
 *     id: "goal-1",
 *     intent: "实现恢复",
 *     promptBundleVersion: 1,
 *     profile,
 *     runId: "run-1",
 * };
 * ```
 */
export interface GoalCreationInput {
    readonly id: string;
    readonly intent: string;
    /** Goal 创建时冻结的当前 Prompt Bundle 版本。 */
    readonly promptBundleVersion: 1;
    /** 新 Goal 使用的冻结结构化 Memory 协议。 */
    readonly memoryProtocol: MemoryProtocol;
    /** 新 Goal 使用的冻结分层模型上下文协议。 */
    readonly modelContextProtocol: ModelContextProtocol;
    /** 新 Goal 使用的冻结 fielded BM25-lite 检索协议。 */
    readonly contextRetrievalProtocol: ContextRetrievalProtocol;
    readonly profile: AgentProfile;
    readonly runId: string;
    /** 首个 Run 的模式；未提供时直接执行。 */
    readonly mode?: RunMode;
    readonly maxSteps?: number;
    readonly messages?: readonly GoalMessage[];
    /** 可选的模型选择状态；未提供时使用 DEFAULT_GOAL_MODEL_SELECTION。 */
    readonly modelSelection?: GoalModelSelection | undefined;
}

function cloneModelSelection(selection: GoalModelSelection): GoalModelSelection {
    return {
        provider: selection.provider,
        modelId: selection.modelId,
        structuredOutputMode: selection.structuredOutputMode,
        ...(selection.contextWindowTokens !== undefined ? { contextWindowTokens: selection.contextWindowTokens } : {}),
        ...(selection.maxOutputTokens !== undefined ? { maxOutputTokens: selection.maxOutputTokens } : {}),
        inputEstimator: selection.inputEstimator.kind === "character-v1"
            ? { kind: "character-v1" }
            : { kind: "token-encoding", encoding: selection.inputEstimator.encoding },
    };
}

function cloneProfile(profile: AgentProfile): AgentProfile {
    return {
        ...profile,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };
}

function cloneMessages(messages: readonly GoalMessage[]): readonly GoalMessage[] {
    return messages.map((message) => message.role === "user"
        ? { role: "user", content: message.content }
        : {
            role: "assistant",
            assistant: { profileId: message.assistant.profileId },
            content: message.content,
        });
}

/**
 * 创建统一 executing 生命周期的确定性 Goal 聚合。
 * @param input - Goal ID、原始意图、冻结 Prompt Bundle 版本、Profile、Run ID 与执行策略。
 * @returns 处于 executing 阶段且 Run 为 created/0 的全新 Goal。
 * @throws maxSteps 不是非负整数或协议字段不是当前组合时抛出 Error。
 */
export function createGoal(input: GoalCreationInput): Goal {
    const maxSteps = input.maxSteps ?? 0;
    const mode = input.mode ?? "normal";

    if (!Number.isInteger(maxSteps) || maxSteps < 0) {
        throw new Error("maxSteps must be a non-negative integer");
    }

    if (input.promptBundleVersion !== 1) {
        throw new Error("promptBundleVersion must be 1");
    }

    if (mode !== "normal" && mode !== "plan") {
        throw new Error("mode must be normal or plan");
    }

    if (
        !isMemoryProtocol(input.memoryProtocol)
        || !isModelContextProtocol(input.modelContextProtocol)
        || !isContextRetrievalProtocol(input.contextRetrievalProtocol)
    ) {
        throw new Error("Goal protocols must be structured@1, trajectory-layered@1, and bm25-lite@1");
    }

    return {
        id: input.id,
        definition: {
            intent: input.intent,
            promptBundleVersion: 1,
            memoryProtocol: { ...input.memoryProtocol },
            modelContextProtocol: { ...input.modelContextProtocol },
            contextRetrievalProtocol: { ...input.contextRetrievalProtocol },
            profile: cloneProfile(input.profile),
            executionPolicy: { maxSteps },
        },
        state: {
            workflow: {
                phase: "executing",
            },
            messages: cloneMessages([
                { role: "user", content: input.intent },
                ...(input.messages ?? []),
            ]),
            run: createRun(input.runId, mode),
            modelSelection: cloneModelSelection(input.modelSelection ?? DEFAULT_GOAL_MODEL_SELECTION),
            completedRuns: [],
        },
    };
}

/**
 * 创建只包含 Run 自身字段的初始状态。
 *
 * @param runId - Runtime 分配的 Run 稳定 ID。
 * @param mode - 当前 Run 的模式；省略时为 `normal`。
 * @returns 处于 created 状态且尚未消费 Step 的 Run。
 * @example
 * ```ts
 * const run = createRun("run-2", "plan");
 * ```
 */
export function createRun(runId: string, mode: RunMode = "normal"): RunState {
    return {
        id: runId,
        mode,
        status: "created",
        stepCount: 0,
        exposedToolIds: [],
        committedThroughSequence: 0,
        contextEpoch: {
            version: 1,
            number: 0,
            conversationStartIndex: 0,
            openedAtSequence: 0,
        },
    };
}
