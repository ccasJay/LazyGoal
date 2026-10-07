import type { JsonValue } from "../../contracts/src/index";
import type {
    FactProposal,
    FactStability,
    MemoryPatchOperation,
    WorkingMemoryPatch,
} from "../../model-contracts/src/index";

/**
 * Working Memory 协议定义。
 *
 * @remarks
 * 当前支持版本固定为 structured@1。
 *
 * @example
 * ```ts
 * const protocol: MemoryProtocol = { kind: "structured", version: 1 };
 * ```
 */
export type MemoryProtocol = { readonly kind: "structured"; readonly version: 1 };

/**
 * 产生 Working Memory 条目的业务阶段。
 *
 * @remarks
 * 脱离 GoalPhase 独立存在，当前固定为 "executing"。
 *
 * @example
 * ```ts
 * const phase: MemoryOriginPhase = "executing";
 * ```
 */
export type MemoryOriginPhase = "executing";

/**
 * Hypothesis 与 Blocker 使用的生命周期状态。
 *
 * @example
 * ```ts
 * const status: MemoryEntryStatus = "active";
 * ```
 */
export type MemoryEntryStatus = "active" | "resolved" | "superseded";

/**
 * Working Memory 条目跨阶段保留的作用域。
 *
 * @example
 * ```ts
 * const scope: MemoryEntryScope = "goal";
 * ```
 */
export type MemoryEntryScope = "goal" | "phase";

/**
 * Working Memory 条目可识别的种类。
 *
 * @example
 * ```ts
 * const kind: MemoryEntryKind = "fact";
 * ```
 */
export type MemoryEntryKind = "fact" | "hypothesis" | "blocker";

/**
 * 已接受 Memory 条目的候选来源。
 *
 * @example
 * ```ts
 * const source: MemoryEntrySource = "model";
 * ```
 */
export type MemoryEntrySource = "model" | "tool_projector" | "runtime";

/**
 * 所有结构化 Memory 条目共用的来源和生命周期元数据。
 *
 * @remarks
 * `originSequence` 指向产生该条目的已接受 Patch Event，而不是模型响应或
 * Runtime 当前状态。`scope` 决定阶段转换时的失效范围；`status` 为
 * `superseded` 或 `resolved` 的条目仍可出现在已提交历史中，但不属于当前有效投影。
 *
 * @example
 * ```ts
 * const base: MemoryEntryBase = {
 *     id: "fact-1",
 *     originPhase: "executing",
 *     originSequence: 12,
 *     scope: "goal",
 *     updatedAtSequence: 12,
 * };
 * ```
 */
export interface MemoryEntryBase {
    /** 条目的跨 Patch 稳定身份。 */
    readonly id: string;
    /** 首次被接受的业务阶段。 */
    readonly originPhase: MemoryOriginPhase;
    /** 产生当前版本条目的 accepted Patch Event sequence。 */
    readonly originSequence: number;
    /** 条目在阶段转换时的保留范围。 */
    readonly scope: MemoryEntryScope;
    /** 最近一次改变该条目的 accepted Patch sequence。 */
    readonly updatedAtSequence: number;
}

/**
 * 由已提交事实 Event 支持的实体化 Fact。
 *
 * @example
 * ```ts
 * const fact: EvidenceBackedFact = {
 *     id: "fact-1",
 *     originPhase: "executing",
 *     originSequence: 8,
 *     scope: "goal",
 *     updatedAtSequence: 8,
 *     kind: "fact",
 *     subject: "file:a",
 *     predicate: "exists",
 *     value: true,
 *     stability: "stable",
 *     evidenceSequences: [8],
 *     reinforcementCount: 1,
 *     lastEvidenceSequence: 8,
 *     source: "model",
 * };
 * ```
 */
export interface EvidenceBackedFact extends MemoryEntryBase {
    readonly kind: "fact";
    /** 规范化前的事实主体。 */
    readonly subject: string;
    /** 规范化前的主体属性或关系。 */
    readonly predicate: string;
    /** 当前已接受的 JSON 值。 */
    readonly value: JsonValue;
    /** 事实持续成立或仅表示最后一次观察。 */
    readonly stability: FactStability;
    /** 支持当前值的已提交 Trajectory sequences。 */
    readonly evidenceSequences: readonly number[];
    /** 同值更新证据成功强化的累计次数，首次接受为 1。 */
    readonly reinforcementCount: number;
    /** `evidenceSequences` 中最大的 sequence。 */
    readonly lastEvidenceSequence: number;
    /** 最近一次提交当前值的 producer。 */
    readonly source: MemoryEntrySource;
}

/**
 * 明确标记为未验证判断的 Hypothesis。
 *
 * @example
 * ```ts
 * const hypothesis: Hypothesis = {
 *     id: "hypo-1",
 *     originPhase: "executing",
 *     originSequence: 1,
 *     scope: "goal",
 *     updatedAtSequence: 1,
 *     kind: "hypothesis",
 *     statement: "cache is stale",
 *     status: "active",
 * };
 * ```
 */
export interface Hypothesis extends MemoryEntryBase {
    readonly kind: "hypothesis";
    /** 待验证判断；不能单独作为完成证据。 */
    readonly statement: string;
    /** 当前生命周期状态。 */
    readonly status: MemoryEntryStatus;
}

/**
 * 表达当前阻塞的 Memory 条目。
 *
 * @example
 * ```ts
 * const blocker: Blocker = {
 *     id: "block-1",
 *     originPhase: "executing",
 *     originSequence: 1,
 *     scope: "goal",
 *     updatedAtSequence: 1,
 *     kind: "blocker",
 *     description: "approval required",
 *     status: "active",
 * };
 * ```
 */
export interface Blocker extends MemoryEntryBase {
    readonly kind: "blocker";
    /** 阻塞描述；不替代 Runtime 的失败或等待状态。 */
    readonly description: string;
    /** 当前生命周期状态。 */
    readonly status: MemoryEntryStatus;
}

/**
 * 结构化 Working Memory 中允许出现的条目联合。
 *
 * @example
 * ```ts
 * const entry: MemoryEntry = fact;
 * ```
 */
export type MemoryEntry =
    | EvidenceBackedFact
    | Hypothesis
    | Blocker;

/**
 * 指向最新已提交 accepted Patch 的不可变 revision。
 *
 * @example
 * ```ts
 * const revision: MemoryRevision = { eventId: "event-12", sequence: 12 };
 * ```
 */
export interface MemoryRevision {
    /** accepted Patch Event 的稳定事件 ID。 */
    readonly eventId: string;
    /** 该 Event 在当前 Goal/Run 中的 sequence。 */
    readonly sequence: number;
}

/**
 * `WorkingMemoryPatch` 的语义别名，供领域代码使用。
 *
 * @example
 * ```ts
 * const patch: MemoryPatch = { protocolVersion: 1, operations: [] };
 * ```
 */
export type MemoryPatch = WorkingMemoryPatch;

/**
 * Runtime 归一化后可持久化的 Memory 操作。
 *
 * @example
 * ```ts
 * const op: CanonicalMemoryOperation = {
 *     type: "retire_fact",
 *     factId: "fact-1",
 * };
 * ```
 */
export type CanonicalMemoryOperation =
    | { readonly type: "upsert_fact"; readonly fact: EvidenceBackedFact }
    | { readonly type: "retire_fact"; readonly factId: string }
    | { readonly type: "upsert_hypothesis"; readonly hypothesis: Hypothesis }
    | { readonly type: "upsert_blocker"; readonly blocker: Blocker }
    | { readonly type: "evict_entries"; readonly entryIds: readonly string[] }
    | {
        readonly type: "supersede_scope";
        readonly scope: MemoryEntryScope;
        readonly phase?: MemoryOriginPhase;
        readonly kinds?: readonly MemoryEntryKind[];
    };

/**
 * 当前进程内的结构化 Working Memory 投影。
 *
 * @remarks
 * 该对象是从已提交 Trajectory 归约出的临时视图，不进入 Goal Snapshot；
 * `derivedThroughSequence` 只能单调前进且不得超过 Snapshot 提交边界。只有
 * `status: "active"` 的条目会作为当前有效上下文提供给模型，历史状态仍由事件账本保留。
 *
 * @example
 * ```ts
 * const memory: WorkingMemory = {
 *     protocolVersion: 1,
 *     derivedThroughSequence: 12,
 *     facts: [],
 *     hypotheses: [],
 *     blockers: [],
 * };
 * ```
 */
export interface WorkingMemory {
    readonly protocolVersion: 1;
    readonly derivedThroughSequence: number;
    readonly revision?: MemoryRevision;
    readonly facts: readonly EvidenceBackedFact[];
    readonly hypotheses: readonly Hypothesis[];
    readonly blockers: readonly Blocker[];
}

export type {
    FactProposal,
    FactStability,
    MemoryPatchOperation,
    WorkingMemoryPatch,
};
