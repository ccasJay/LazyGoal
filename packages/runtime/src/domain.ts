import type { AgentProfile } from "./agent-profile";

/** Goal 的稳定任务定义，不包含执行过程中产生的状态。 */
export interface GoalTask {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/** Goal 工作流使用的稳定阶段名称。 */
export type GoalPhase =
    | "gathering_context"
    | "planning"
    | "executing";

/** Goal 创建后冻结的 Working Memory 协议。 */
export type MemoryProtocol =
    | { readonly kind: "checkpoint"; readonly version: 1 }
    | { readonly kind: "structured"; readonly version: 1 };

/** Goal 创建后冻结的模型上下文协议。 */
export type ModelContextProtocol =
    | { readonly kind: "conversation"; readonly version: 1 }
    | { readonly kind: "trajectory-layered"; readonly version: 1 };

/** Working Memory 条目的生命周期状态。 */
export type MemoryEntryStatus = "active" | "resolved" | "superseded";

/** Working Memory 条目跨阶段保留的作用域。 */
export type MemoryEntryScope = "goal" | "phase";

/** Working Memory 条目可识别的种类。 */
export type MemoryEntryKind =
    | "finding"
    | "hypothesis"
    | "plan"
    | "blocker"
    | "next_action";

/**
 * 所有结构化 Memory 条共用的来源和生命周期元数据。
 *
 * @remarks
 * `originSequence` 指向产生该条目的已接受 Patch Event，而不是模型响应或
 * Runtime 当前状态。`scope` 决定阶段转换时的失效范围；`status` 为
 * `superseded` 或 `resolved` 的条目仍可出现在已提交历史中，但不属于当前有效投影。
 * Runtime State 的 checkpoint、pending Action、Step 计数和 Run 状态不属于本接口。
 *
 * @example
 * ```ts
 * const base: MemoryEntryBase = {
 *     id: "finding-1",
 *     originPhase: "gathering_context",
 *     originSequence: 12,
 *     scope: "goal",
 *     status: "active",
 * };
 * ```
 */
export interface MemoryEntryBase {
    /** 条目的跨 Patch 稳定身份。 */
    readonly id: string;
    /** 首次被接受的业务阶段。 */
    readonly originPhase: GoalPhase;
    /** 产生当前版本条目的 accepted Patch Event sequence。 */
    readonly originSequence: number;
    /** 条目在阶段转换时的保留范围。 */
    readonly scope: MemoryEntryScope;
    /** 条目当前生命周期状态。 */
    readonly status: MemoryEntryStatus;
}

/** 由已提交 Observation 或其他事实 Event 支持的 Finding。 */
export interface EvidenceBackedFinding extends MemoryEntryBase {
    readonly kind: "finding";
    /** 对已观察事实的有界归纳，不代表 Runtime 控制状态。 */
    readonly statement: string;
    /** 支持该归纳的已提交 Trajectory sequence。 */
    readonly evidenceSequences: readonly number[];
}

/** 明确标记为未验证判断的 Hypothesis。 */
export interface Hypothesis extends MemoryEntryBase {
    readonly kind: "hypothesis";
    /** 待验证判断；不能单独作为完成证据。 */
    readonly statement: string;
}

/** 表达未完成工作意图的 Plan 条目。 */
export interface PlanItem extends MemoryEntryBase {
    readonly kind: "plan";
    /** 计划步骤描述；不表示对应外部 Action 已执行。 */
    readonly description: string;
}

/** 表达当前阻塞的 Memory 条目。 */
export interface Blocker extends MemoryEntryBase {
    readonly kind: "blocker";
    /** 阻塞描述；不替代 Runtime 的失败或等待状态。 */
    readonly description: string;
}

/** 表达当前阶段下一步意图的单一 Memory 条目。 */
export interface NextAction extends MemoryEntryBase {
    readonly kind: "next_action";
    /** 下一步建议；不表示 Action 已经执行。 */
    readonly description: string;
}

/** 结构化 Working Memory 中允许出现的条目联合。 */
export type MemoryEntry =
    | EvidenceBackedFinding
    | Hypothesis
    | PlanItem
    | Blocker
    | NextAction;

/** 指向最新已提交 accepted Patch 的不可变 revision。 */
export interface MemoryRevision {
    /** accepted Patch Event 的稳定事件 ID。 */
    readonly eventId: string;
    /** 该 Event 在当前 Goal/Run 中的 sequence。 */
    readonly sequence: number;
}

/** 新增 Finding 时模型可以提交的字段；来源元数据由 Runtime 补齐。 */
export interface AddFinding {
    readonly id: string;
    readonly statement: string;
    readonly evidenceSequences: readonly number[];
}

/** 更新 Finding 时模型可以提交的字段。 */
export interface UpdateFinding {
    readonly id: string;
    readonly statement?: string;
    readonly evidenceSequences?: readonly number[];
    readonly status?: MemoryEntryStatus;
}

/** 更新 Hypothesis 时模型可以提交的字段。 */
export interface HypothesisUpdate {
    readonly id: string;
    readonly statement: string;
    readonly status?: MemoryEntryStatus;
}

/** 更新 Plan 条目时模型可以提交的字段。 */
export interface PlanItemUpdate {
    readonly id: string;
    readonly description: string;
    readonly status?: MemoryEntryStatus;
}

/** 更新 Blocker 时模型可以提交的字段。 */
export interface BlockerUpdate {
    readonly id: string;
    readonly description: string;
    readonly scope: MemoryEntryScope;
    readonly status?: MemoryEntryStatus;
}

/** 设置下一步意图时模型可以提交的字段。 */
export interface NextActionUpdate {
    readonly id: string;
    readonly description: string;
    readonly status?: MemoryEntryStatus;
}

/** 模型响应中允许出现的结构化 Memory 操作。 */
export type MemoryPatchOperation =
    | { readonly type: "add_finding"; readonly finding: AddFinding }
    | { readonly type: "update_finding"; readonly finding: UpdateFinding }
    | { readonly type: "upsert_hypothesis"; readonly hypothesis: HypothesisUpdate }
    | { readonly type: "upsert_plan_item"; readonly planItem: PlanItemUpdate }
    | { readonly type: "upsert_blocker"; readonly blocker: BlockerUpdate }
    | { readonly type: "set_next_action"; readonly nextAction: NextActionUpdate | null };

/**
 * 模型或 Runtime 生命周期提出的增量 Memory Patch。
 *
 * @remarks
 * Patch 只是待校验输入，不会直接修改 Working Memory、Goal Snapshot 或
 * Trajectory。Runtime 接受关联业务结果后，才会把规范化操作写成
 * `memory_patch_accepted` 事实；模型不能通过本 DTO 写入 checkpoint、Action、Run
 * 状态或 Step 计数。
 *
 * @example
 * ```ts
 * const patch: WorkingMemoryPatch = {
 *     protocolVersion: 1,
 *     operations: [{
 *         type: "add_finding",
 *         finding: {
 *             id: "finding-1",
 *             statement: "配置文件位于项目根目录",
 *             evidenceSequences: [12],
 *         },
 *     }],
 * };
 * ```
 */
export interface WorkingMemoryPatch {
    readonly protocolVersion: 1;
    readonly operations: readonly MemoryPatchOperation[];
}

/** `WorkingMemoryPatch` 的语义别名，供领域代码使用。 */
export type MemoryPatch = WorkingMemoryPatch;

/** Runtime 归一化后可持久化的 Memory 操作。 */
export type CanonicalMemoryOperation =
    | { readonly type: "add_finding"; readonly finding: EvidenceBackedFinding }
    | { readonly type: "update_finding"; readonly finding: EvidenceBackedFinding }
    | { readonly type: "upsert_hypothesis"; readonly hypothesis: Hypothesis }
    | { readonly type: "upsert_plan_item"; readonly planItem: PlanItem }
    | { readonly type: "upsert_blocker"; readonly blocker: Blocker }
    | { readonly type: "set_next_action"; readonly nextAction: NextAction | null }
    | {
        readonly type: "supersede_scope";
        readonly scope: MemoryEntryScope;
        readonly phase?: GoalPhase;
        readonly kinds?: readonly MemoryEntryKind[];
    };

/** 写入 Trajectory 的 accepted Memory Patch 事实载荷。 */
export interface MemoryPatchAcceptedPayload {
    readonly type: "memory_patch_accepted";
    readonly protocolVersion: 1;
    readonly producers: readonly ("model" | "runtime_lifecycle")[];
    readonly parentRevisionEventId?: string;
    readonly operations: readonly CanonicalMemoryOperation[];
}

/**
 * 当前进程内的结构化 Working Memory 投影。
 *
 * @remarks
 * 该对象是从已提交 Trajectory 归约出的临时视图，不进入 Goal Snapshot；
 * `derivedThroughSequence` 只能单调前进且不得超过 Snapshot 提交边界。只有
 * `status: "active"` 的条目会作为当前有效上下文提供给模型，历史状态仍由事件账本保留。
 * 本接口不包含 checkpoint、previousStep、pending Action、Step 计数、Run 状态或
 * 其他 Runtime 控制字段。
 *
 * @example
 * ```ts
 * const memory: WorkingMemory = {
 *     protocolVersion: 1,
 *     derivedThroughSequence: 12,
 *     findings: [],
 *     hypotheses: [],
 *     plan: [],
 *     blockers: [],
 * };
 * ```
 */
export interface WorkingMemory {
    readonly protocolVersion: 1;
    readonly derivedThroughSequence: number;
    readonly revision?: MemoryRevision;
    readonly findings: readonly EvidenceBackedFinding[];
    readonly hypotheses: readonly Hypothesis[];
    readonly plan: readonly PlanItem[];
    readonly blockers: readonly Blocker[];
    readonly nextAction?: NextAction;
}

/**
 * 供 Runtime 与 Agent 组合根校验冻结协议组合的输入。
 *
 * @example
 * ```ts
 * const input: GoalProtocolValidationInput = {
 *     promptBundleVersion: 4,
 *     memoryProtocol: { kind: "structured", version: 1 },
 * };
 * ```
 */
export interface GoalProtocolValidationInput {
    readonly promptBundleVersion: number;
    readonly memoryProtocol: MemoryProtocol;
    /** Goal 冻结的模型上下文协议；省略仅用于向后兼容的调用方，按 `conversation@1` 解释。 */
    readonly modelContextProtocol?: ModelContextProtocol;
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
 *     validate: ({ promptBundleVersion, memoryProtocol }) => {
 *         if (promptBundleVersion === 4 && memoryProtocol.kind !== "structured") {
 *             throw new GoalProtocolError("Prompt/Memory 协议不匹配");
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

/** 判断未知值是否为受支持的 Memory 协议判别联合。 */
export function isMemoryProtocol(value: unknown): value is MemoryProtocol {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        (candidate.kind === "checkpoint" || candidate.kind === "structured")
        && candidate.version === 1
        && Object.keys(candidate).every((key) => key === "kind" || key === "version")
    );
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
        (candidate.kind === "conversation" || candidate.kind === "trajectory-layered")
        && candidate.version === 1
        && Object.keys(candidate).every((key) => key === "kind" || key === "version")
    );
}

/**
 * 将旧 Goal 的省略字段解释为 legacy checkpoint 协议。
 *
 * @param definition - Goal 冻结定义的协议字段。
 * @returns 独立的 Memory 协议对象；省略字段返回 `checkpoint@1`。
 * @throws GoalProtocolError 当显式值不是受支持协议时。
 */
export function resolveMemoryProtocol(
    definition: Pick<GoalDefinition, "memoryProtocol">,
): MemoryProtocol {
    const protocol = definition.memoryProtocol;
    if (protocol === undefined) {
        return { kind: "checkpoint", version: 1 };
    }

    if (!isMemoryProtocol(protocol)) {
        throw new GoalProtocolError("Memory 协议必须是 checkpoint@1 或 structured@1");
    }

    return { kind: protocol.kind, version: protocol.version };
}

/**
 * 将旧 Goal 的省略字段解释为 Conversation 模型上下文协议。
 *
 * @param definition - Goal 冻结定义的模型上下文协议字段。
 * @returns 独立的模型上下文协议对象；省略字段返回 `conversation@1`。
 * @throws GoalProtocolError 当显式值不是受支持协议时。
 */
export function resolveModelContextProtocol(
    definition: Pick<GoalDefinition, "modelContextProtocol">,
): ModelContextProtocol {
    const protocol = definition.modelContextProtocol;
    if (protocol === undefined) {
        return { kind: "conversation", version: 1 };
    }

    if (!isModelContextProtocol(protocol)) {
        throw new GoalProtocolError(
            "模型上下文协议必须是 conversation@1 或 trajectory-layered@1",
        );
    }

    return { kind: protocol.kind, version: protocol.version };
}

/** 创建没有条目的、可作为 Reducer 初始值的 Working Memory。 */
export function createEmptyWorkingMemory(
    derivedThroughSequence = 0,
    revision?: MemoryRevision,
): WorkingMemory {
    if (!Number.isInteger(derivedThroughSequence) || derivedThroughSequence < 0) {
        throw new Error("derivedThroughSequence must be a non-negative integer");
    }

    const revisionCandidate = revision as unknown;
    if (
        revisionCandidate !== undefined
        && (
            typeof revisionCandidate !== "object"
            || revisionCandidate === null
            || Array.isArray(revisionCandidate)
            || typeof (revisionCandidate as { eventId?: unknown }).eventId !== "string"
            || (revisionCandidate as { eventId: string }).eventId.trim().length === 0
            || !Number.isInteger((revisionCandidate as { sequence?: unknown }).sequence)
            || (revisionCandidate as { sequence: number }).sequence < 0
            || (revisionCandidate as { sequence: number }).sequence > derivedThroughSequence
        )
    ) {
        throw new Error("revision must be valid and within derivedThroughSequence");
    }

    const normalizedRevision = revisionCandidate as MemoryRevision | undefined;

    return {
        protocolVersion: 1,
        derivedThroughSequence,
        ...(normalizedRevision === undefined
            ? {}
            : {
                revision: {
                    eventId: normalizedRevision.eventId,
                    sequence: normalizedRevision.sequence,
                },
            }),
        findings: [],
        hypotheses: [],
        plan: [],
        blockers: [],
    };
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
 * 原始意图、Prompt Bundle 版本、Profile 和执行策略在 Session 生命周期内保持
 * 不变。Runtime 只持有通用正整数版本标识，不持有或渲染 Prompt 文本，也不判断
 * 版本是否受支持；Agent 的 Bundle Registry 负责把版本解析为对应 Prompt 组合。
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
    /** 恢复时必须继续使用的 Prompt Bundle 正整数版本。 */
    readonly promptBundleVersion: number;
    /**
     * Goal 创建时冻结的 Memory 协议；旧内存调用方省略时按 `checkpoint@1` 解释。
     *
     * @remarks
     * 新的结构化 Goal 必须显式设置为 `{ kind: "structured", version: 1 }`。
     * 该字段只描述协议选择，不把 Working Memory 内容写入 Goal 定义。
     */
    readonly memoryProtocol?: MemoryProtocol;
    /**
     * Goal 创建时冻结的模型上下文协议；旧 Goal 省略时按 `conversation@1` 解释。
     *
     * @remarks
     * `trajectory-layered@1` 只适用于结构化 Working Memory；该字段只描述模型
     * 输入来源选择，不把 Hot/Warm 内容写入 Goal 定义。
     */
    readonly modelContextProtocol?: ModelContextProtocol;
    readonly profile: AgentProfile;
    readonly executionPolicy: {
        /** 正整数表示上限，`0` 表示不以 Step 数量限制执行。 */
        readonly maxSteps: number;
    };
}

/** Goal 在执行前的准备工作流，只有 executing 分支拥有最终任务。 */
export type GoalWorkflowState =
    | {
        readonly phase: "gathering_context";
        readonly preparation: {
            readonly status: "active" | "waiting_input";
        };
    }
    | {
        readonly phase: "planning";
        readonly preparation:
            | { readonly status: "active" }
            | {
                readonly status: "waiting_approval";
                readonly proposal: GoalTask;
            };
    }
    | {
        readonly phase: "executing";
        readonly preparation: { readonly status: "completed" };
        readonly task: GoalTask;
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
export interface ToolCallAction {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: JsonValue;
}

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
export interface CompletionEvidence {
    /** 当前 Goal Task completionCriteria 的零基索引。 */
    readonly criterionIndex: number;
    /** 支持该标准的已提交 Observation/事实 sequence。 */
    readonly evidenceSequences: readonly number[];
}

/**
 * 旧 `checkpoint@1` 协议的 AgentDecision。
 *
 * @remarks
 * 该类型保留历史 Prompt Bundle v1–v3 的 checkpoint 语义；新 Goal 不应将它与
 * structured Decision 混用。
 *
 * @example
 * ```ts
 * const decision: LegacyAgentDecision = {
 *   kind: "complete",
 *   checkpoint: "已完成目标",
 *   summary: "目标完成",
 * };
 * ```
 */
export type LegacyAgentDecision =
    | {
        readonly kind: "tool_call";
        readonly checkpoint: string;
        readonly action: ToolCallAction;
    }
    | {
        readonly kind: "complete";
        readonly checkpoint: string;
        readonly summary: string;
    }
    | {
        readonly kind: "wait";
        readonly checkpoint: string;
        readonly reason: string;
    }
    | {
        readonly kind: "fail";
        readonly checkpoint: string;
        readonly error: string;
    };

/**
 * 新 `structured@1` 协议的 AgentDecision。
 *
 * @remarks
 * Structured Decision 不携带 checkpoint；Working Memory 的增量由可选
 * `memoryPatch` 承载，`complete` 还必须提供按 criterion index 对齐的
 * `completionEvidence`。Runtime 仍负责 Action、Observation、Step 与 Run 状态。
 *
 * @example
 * ```ts
 * const decision: StructuredAgentDecision = {
 *   kind: "complete",
 *   summary: "所有标准均已验证",
 *   completionEvidence: [],
 * };
 * ```
 */
export type StructuredAgentDecision =
    | {
        readonly kind: "tool_call";
        readonly action: ToolCallAction;
        readonly memoryPatch?: WorkingMemoryPatch;
    }
    | {
        readonly kind: "complete";
        readonly summary: string;
        readonly completionEvidence: readonly CompletionEvidence[];
        readonly memoryPatch?: WorkingMemoryPatch;
    }
    | {
        readonly kind: "wait";
        readonly reason: string;
        readonly memoryPatch?: WorkingMemoryPatch;
    }
    | {
        readonly kind: "fail";
        readonly error: string;
        readonly memoryPatch?: WorkingMemoryPatch;
    };

/** Agent 当前冻结协议对应的四分支决策联合。 */
export type AgentDecision = LegacyAgentDecision | StructuredAgentDecision;

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
        readonly result: Exclude<AgentDecision, { readonly kind: "tool_call" }>;
    };

/** 可识别的 Runtime 执行协议失败代码。 */
export type ExecutionErrorCode =
    | "TOOL_NOT_AUTHORIZED"
    | "TOOL_NOT_FOUND"
    | "INVALID_TOOL_INPUT"
    | "INVALID_MEMORY_PATCH"
    | "INVALID_AGENT_DECISION"
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
 * `lastStep` 只保留最新 Step。`checkpoint` 与 `pendingAction` 是有界执行记忆，
 * 不属于 Goal.messages。
 * @example
 * ```ts
 * const run: RunState = createRun("run-1");
 * ```
 */
export interface RunState {
    readonly id: string;
    readonly status: RunStatus;
    readonly stepCount: number;
    /**
     * 最新有效 Goal Snapshot 纳入恢复边界的最大 Trajectory sequence。
     *
     * @remarks
     * 旧内存调用方可能省略该字段；Storage 在读取旧快照时将其解释为 `0`。
     */
    readonly committedThroughSequence?: number;
    /**
     * 当前 Snapshot 选择的最新 accepted Memory Patch 链头。
     *
     * @remarks 仅 structured 协议使用；省略表示尚未提交任何 Patch。该指针不携带
     * Memory 内容，恢复时由 Trajectory 反查并重放。
     */
    readonly memoryRevision?: MemoryRevision;
    readonly lastStep?: StepRecord;
    readonly checkpoint?: string;
    readonly pendingAction?: PendingAction;
    readonly stopReason?: RunStopReason;
}

/**
 * Goal 当前可变且需要持久化的状态。
 *
 * @remarks Preparation 不消费 Run Step；messages 只保存真实交互。
 * @example
 * ```ts
 * const state: GoalState = {
 *   workflow: { phase: "gathering_context", preparation: { status: "active" } },
 *   messages: [],
 *   run: createRun("run-1"),
 * };
 * ```
 */
export interface GoalState {
    readonly workflow: GoalWorkflowState;
    readonly messages: readonly GoalMessage[];
    readonly run: RunState;
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
 * `reject_action` 和非 Tool 的 `decision` 才完成一个 Step。`execution_error`
 * 停止当前 Run 但不消费 Step，并在存在待执行 Action 时保留其不确定结果。
 *
 * `resume` 由外部协调器在保存解除 Agent wait 的真实输入时使用；`recover_action`
 * 由 Runner 在进程恢复时用于把已批准但结果未知的 Action 转为可处理的等待点。
 *
 * @example
 * ```ts
 * const input: RunInput = {
 *   kind: "stage_action",
 *   checkpoint: "已确定要读取配置",
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
        /** legacy checkpoint；structured@1 Action 不携带该字段。 */
        readonly checkpoint?: string;
        readonly action: ToolCallAction;
        readonly status?: "approved" | "awaiting_approval";
    }
    | {
        readonly kind: "observe_action";
        readonly actionId: string;
        readonly observation: Exclude<Observation, { readonly kind: "rejected" }>;
    }
    | {
        readonly kind: "decision";
        readonly decision: Exclude<AgentDecision, { readonly kind: "tool_call" }>;
    }
    | {
        readonly kind: "reject_action";
        readonly actionId: string;
        readonly reason: string;
    }
    | {
        readonly kind: "approve_action";
        readonly actionId: string;
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
 * promptBundleVersion 必须为正整数，由调用方（Composition Root）注入 Agent
 * 当前生效的 Prompt Bundle 版本。
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
    /** Goal 创建时冻结的 Prompt Bundle 正整数版本。 */
    readonly promptBundleVersion: number;
    /** 新 Goal 使用的冻结 Memory 协议；省略时保持 legacy checkpoint 兼容语义。 */
    readonly memoryProtocol?: MemoryProtocol;
    /** 新 Goal 使用的冻结模型上下文协议；省略时保持 Conversation 兼容语义。 */
    readonly modelContextProtocol?: ModelContextProtocol;
    readonly profile: AgentProfile;
    readonly runId: string;
    readonly maxSteps?: number;
    readonly messages?: readonly GoalMessage[];
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
 * 创建 gathering_context 阶段的确定性 Goal 聚合。
 * @param input - Goal ID、原始意图、冻结 Prompt Bundle 版本、Profile、Run ID 与执行策略。
 * @returns Run 为 created/0 的全新 Goal。
 * @throws maxSteps 不是非负整数、或 promptBundleVersion 不是正整数时抛出 Error。
 */
export function createGoal(input: GoalCreationInput): Goal {
    const maxSteps = input.maxSteps ?? 0;

    if (!Number.isInteger(maxSteps) || maxSteps < 0) {
        throw new Error("maxSteps must be a non-negative integer");
    }

    if (
        !Number.isInteger(input.promptBundleVersion)
        || input.promptBundleVersion <= 0
    ) {
        throw new Error("promptBundleVersion must be a positive integer");
    }

    return {
        id: input.id,
        definition: {
            intent: input.intent,
            promptBundleVersion: input.promptBundleVersion,
            ...(input.memoryProtocol === undefined
                ? {}
                : { memoryProtocol: resolveMemoryProtocol(input) }),
            ...(input.modelContextProtocol === undefined
                ? {}
                : { modelContextProtocol: resolveModelContextProtocol(input) }),
            profile: cloneProfile(input.profile),
            executionPolicy: { maxSteps },
        },
        state: {
            workflow: {
                phase: "gathering_context",
                preparation: { status: "active" },
            },
            messages: cloneMessages([
                { role: "user", content: input.intent },
                ...(input.messages ?? []),
            ]),
            run: createRun(input.runId),
        },
    };
}

/** 创建只包含 Run 自身字段的初始状态。 */
export function createRun(runId: string): RunState {
    return { id: runId, status: "created", stepCount: 0 };
}
