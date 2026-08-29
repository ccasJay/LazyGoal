import type {
    Goal,
    MemoryPatch,
    MemoryPatchAcceptedPayload,
    MemoryRevision,
    WorkingMemory,
} from "./domain";
import { resolveMemoryProtocol, createEmptyWorkingMemory } from "./domain";
import {
    buildCommittedEvidenceIndex,
    validateFindingEvidence,
    validateMemoryPatchEvidence,
    type CommittedEvidenceIndex,
    validateCanonicalFindingEvidence,
} from "./evidence-gate";
import {
    reduceWorkingMemory,
    type WorkingMemoryLimitsInput,
} from "./working-memory-core";
import {
    freezeTrajectoryEvent,
    type TrajectoryEvent,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "./trajectory";

/** 缺少结构化 Memory 所需 Trajectory 或 Snapshot 边界时的稳定错误码。 */
export const WORKING_MEMORY_TRAJECTORY_REQUIRED_CODE =
    "WORKING_MEMORY_TRAJECTORY_REQUIRED" as const;

/** committed Trajectory 或 revision 链无法恢复时的稳定错误码。 */
export const WORKING_MEMORY_RECOVERY_ERROR_CODE =
    "WORKING_MEMORY_RECOVERY_ERROR" as const;

/** Session 被显式关闭后再次读取临时 Memory 时的稳定错误码。 */
export const WORKING_MEMORY_SESSION_CLOSED_CODE =
    "WORKING_MEMORY_SESSION_CLOSED" as const;

/**
 * 表示结构化 Goal 缺少恢复所必需的 Trajectory 或 Snapshot 提交边界。
 *
 * @remarks
 * 该错误是 fail-closed 信号；调用方不能以空 Memory 或模型猜测替代缺失的
 * 历史事实。checkpoint 协议不应创建本 Session，因此不会触发该错误。
 *
 * @example
 * ```ts
 * if (error instanceof WorkingMemoryTrajectoryRequiredError) {
 *     // 阻止下一次模型调用，等待 Trajectory/快照恢复。
 * }
 * ```
 */
export class WorkingMemoryTrajectoryRequiredError extends Error {
    readonly code = WORKING_MEMORY_TRAJECTORY_REQUIRED_CODE;

    /** @param message - 不包含会话正文的稳定诊断信息。 */
    constructor(message: string) {
        super(`${WORKING_MEMORY_TRAJECTORY_REQUIRED_CODE}: ${message}`);
        this.name = "WorkingMemoryTrajectoryRequiredError";
    }
}

/**
 * 表示 committed Trajectory、accepted Patch 或 revision 链损坏。
 *
 * @remarks
 * 错误出现后本次 Session 不返回部分归约结果；原始事件保持只读，调用方必须
 * 在修复持久化数据前阻止模型继续工作。
 *
 * @example
 * ```ts
 * throw new WorkingMemoryRecoveryError("revision parent is missing");
 * ```
 */
export class WorkingMemoryRecoveryError extends Error {
    readonly code = WORKING_MEMORY_RECOVERY_ERROR_CODE;
    readonly cause?: unknown;

    /** @param message - 稳定恢复诊断；@param cause - 可选底层错误。 */
    constructor(message: string, cause?: unknown) {
        super(`${WORKING_MEMORY_RECOVERY_ERROR_CODE}: ${message}`);
        this.name = "WorkingMemoryRecoveryError";
        if (cause !== undefined) this.cause = cause;
    }
}

/**
 * 表示进程内 Working Memory 已被丢弃后仍尝试读取它。
 *
 * @example
 * ```ts
 * session.close();
 * // session.workingMemory 会抛出 WorkingMemorySessionClosedError。
 * ```
 */
export class WorkingMemorySessionClosedError extends Error {
    readonly code = WORKING_MEMORY_SESSION_CLOSED_CODE;

    constructor() {
        super(`${WORKING_MEMORY_SESSION_CLOSED_CODE}: session is closed`);
        this.name = "WorkingMemorySessionClosedError";
    }
}

/**
 * 构建一次结构化 Working Memory Session 所需的只读依赖。
 *
 * @example
 * ```ts
 * const session = await WorkingMemorySession.restore(goal, { trajectoryStore });
 * ```
 */
export interface WorkingMemorySessionDependencies {
    /** 读取当前 Goal/Run Trajectory 的持久化端口。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 仅用于归约时的容量上限；恢复默认不按接受期限制拒绝历史事件。 */
    readonly limits?: WorkingMemoryLimitsInput;
}

/**
 * 供需要纯函数调用的恢复入口返回的上下文信息。
 *
 * @example
 * ```ts
 * const restored = await rebuildWorkingMemory(goal, { trajectoryStore });
 * console.log(restored.revision?.eventId);
 * ```
 */
export interface RebuiltWorkingMemory {
    /** 从 committed accepted Patch 归约出的临时 Memory。 */
    readonly memory: WorkingMemory;
    /** 使用的 Snapshot 提交边界。 */
    readonly committedThroughSequence: number;
    /** 被选中的 revision；无 Patch 提交时省略。 */
    readonly revision?: MemoryRevision;
}

interface RebuiltWorkingMemoryInternal extends RebuiltWorkingMemory {
    /** 本次 Snapshot 边界对应的 Evidence Gate 索引，仅供当前 Session 使用。 */
    readonly evidenceIndex: CommittedEvidenceIndex;
}

type AcceptedPatchEvent = Readonly<TrajectoryEvent & {
    readonly eventType: "memory_patch_accepted";
    readonly payload: MemoryPatchAcceptedPayload;
}>;

/** 恢复时不重新套用可能已改变的接受期容量配置。 */
const REPLAY_LIMITS: WorkingMemoryLimitsInput = Object.freeze({
    maxOperations: Number.MAX_SAFE_INTEGER,
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxStableIdLength: Number.MAX_SAFE_INTEGER,
    maxTextLength: Number.MAX_SAFE_INTEGER,
    maxEvidenceReferences: Number.MAX_SAFE_INTEGER,
    maxFindings: Number.MAX_SAFE_INTEGER,
    maxHypotheses: Number.MAX_SAFE_INTEGER,
    maxPlanItems: Number.MAX_SAFE_INTEGER,
    maxBlockers: Number.MAX_SAFE_INTEGER,
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[],
    label: string,
): void {
    const allowed = new Set([...required, ...optional]);
    const keys = Object.keys(value);
    if (
        keys.some((key) => !allowed.has(key))
        || required.some((key) => !keys.includes(key))
    ) {
        throw new WorkingMemoryRecoveryError(`${label} contains unknown or missing fields`);
    }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new WorkingMemoryRecoveryError(`${label} must be a non-empty string`);
    }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new WorkingMemoryRecoveryError(`${label} must be a non-negative integer`);
    }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new WorkingMemoryRecoveryError(`${label} must be a positive integer`);
    }
}

function validateRevision(
    value: unknown,
    committedThroughSequence: number,
): MemoryRevision | undefined {
    if (value === undefined) return undefined;
    if (!isRecord(value)) {
        throw new WorkingMemoryRecoveryError("memoryRevision must be an object");
    }
    assertExactKeys(value, ["eventId", "sequence"], [], "memoryRevision");
    assertNonEmptyString(value.eventId, "memoryRevision.eventId");
    assertPositiveInteger(value.sequence, "memoryRevision.sequence");
    if (value.sequence > committedThroughSequence) {
        throw new WorkingMemoryRecoveryError(
            "memoryRevision.sequence exceeds committedThroughSequence",
        );
    }
    return { eventId: value.eventId, sequence: value.sequence };
}

function normalizeReadResult(
    rawResult: TrajectoryReadResult,
    goal: Goal,
    committedThroughSequence: number,
): {
    readonly committed: readonly Readonly<TrajectoryEvent>[];
    readonly tail: readonly Readonly<TrajectoryEvent>[];
} {
    if (!isRecord(rawResult) || !Array.isArray(rawResult.committed) || !Array.isArray(rawResult.uncommittedTail)) {
        throw new WorkingMemoryRecoveryError("Trajectory read result is malformed");
    }

    const seenSequences = new Set<number>();
    const seenEventIds = new Set<string>();
    const normalizeGroup = (
        values: readonly unknown[],
        committed: boolean,
    ): readonly Readonly<TrajectoryEvent>[] => {
        let previousSequence = 0;
        const normalized: Readonly<TrajectoryEvent>[] = [];
        for (const value of values) {
            let event: Readonly<TrajectoryEvent>;
            try {
                event = freezeTrajectoryEvent(value as TrajectoryEvent);
            } catch (error) {
                throw new WorkingMemoryRecoveryError("Trajectory event is invalid", error);
            }

            if (event.goalId !== goal.id || event.runId !== goal.state.run.id) {
                throw new WorkingMemoryRecoveryError(
                    "Trajectory event Goal/Run identity does not match Snapshot",
                );
            }
            assertPositiveInteger(event.sequence, "Trajectory event sequence");
            if (event.sequence <= previousSequence) {
                throw new WorkingMemoryRecoveryError("Trajectory events are not strictly ordered");
            }
            previousSequence = event.sequence;
            if (seenSequences.has(event.sequence)) {
                throw new WorkingMemoryRecoveryError("Trajectory contains duplicate sequence");
            }
            if (seenEventIds.has(event.eventId)) {
                throw new WorkingMemoryRecoveryError("Trajectory contains duplicate eventId");
            }
            seenSequences.add(event.sequence);
            seenEventIds.add(event.eventId);

            if (committed && event.sequence > committedThroughSequence) {
                throw new WorkingMemoryRecoveryError(
                    "Trajectory committed group exceeds Snapshot boundary",
                );
            }
            if (!committed && event.sequence <= committedThroughSequence) {
                throw new WorkingMemoryRecoveryError(
                    "Trajectory tail contains an event inside Snapshot boundary",
                );
            }
            normalized.push(event);
        }
        return Object.freeze(normalized);
    };

    const committed = normalizeGroup(rawResult.committed, true);
    const tail = normalizeGroup(rawResult.uncommittedTail, false);
    const lastCommitted = committed[committed.length - 1];
    if (committedThroughSequence > 0 && lastCommitted === undefined) {
        throw new WorkingMemoryRecoveryError(
            "Snapshot has a committed boundary but Trajectory is empty",
        );
    }
    if (
        committedThroughSequence > 0
        && lastCommitted !== undefined
        && lastCommitted.sequence < committedThroughSequence
    ) {
        throw new WorkingMemoryRecoveryError(
            "Trajectory does not contain the complete committed boundary",
        );
    }
    const firstTail = tail[0];
    if (
        lastCommitted !== undefined
        && firstTail !== undefined
        && firstTail.sequence <= lastCommitted.sequence
    ) {
        throw new WorkingMemoryRecoveryError("Trajectory committed/tail order is inconsistent");
    }
    return { committed, tail };
}

function decodeAcceptedPatchEvent(
    event: Readonly<TrajectoryEvent>,
): AcceptedPatchEvent | undefined {
    if (event.eventType !== "memory_patch_accepted") return undefined;
    const payload = event.payload;
    if (!isRecord(payload)) {
        throw new WorkingMemoryRecoveryError("accepted Patch payload is not an object");
    }
    assertExactKeys(
        payload,
        ["type", "protocolVersion", "producers", "operations"],
        ["parentRevisionEventId"],
        "memory_patch_accepted payload",
    );
    if (payload.type !== "memory_patch_accepted" || payload.protocolVersion !== 1) {
        throw new WorkingMemoryRecoveryError("accepted Patch protocolVersion is unsupported");
    }
    if (!Array.isArray(payload.producers) || payload.producers.length === 0) {
        throw new WorkingMemoryRecoveryError("accepted Patch producers are invalid");
    }
    const producers = payload.producers as unknown[];
    const producerSet = new Set<string>();
    for (const producer of producers) {
        if (producer !== "model" && producer !== "runtime_lifecycle") {
            throw new WorkingMemoryRecoveryError("accepted Patch producer is invalid");
        }
        if (producerSet.has(producer)) {
            throw new WorkingMemoryRecoveryError("accepted Patch producers contain duplicates");
        }
        producerSet.add(producer);
    }
    const expectedProducers = [
        ...(producerSet.has("model") ? ["model"] : []),
        ...(producerSet.has("runtime_lifecycle") ? ["runtime_lifecycle"] : []),
    ];
    if (JSON.stringify(producers) !== JSON.stringify(expectedProducers)) {
        throw new WorkingMemoryRecoveryError("accepted Patch producers are not canonical");
    }
    if (!Array.isArray(payload.operations)) {
        throw new WorkingMemoryRecoveryError("accepted Patch operations are invalid");
    }
    if (payload.parentRevisionEventId !== undefined) {
        assertNonEmptyString(payload.parentRevisionEventId, "parentRevisionEventId");
    }
    if ((event.parentEventId ?? undefined) !== (payload.parentRevisionEventId ?? undefined)) {
        throw new WorkingMemoryRecoveryError(
            "accepted Patch parent metadata does not match payload",
        );
    }
    return event as AcceptedPatchEvent;
}

async function rebuild(
    goal: Goal,
    dependencies: WorkingMemorySessionDependencies,
): Promise<RebuiltWorkingMemoryInternal> {
    const protocol = resolveMemoryProtocol(goal.definition);
    if (protocol.kind !== "structured") {
        throw new WorkingMemoryRecoveryError(
            "WorkingMemorySession requires the structured Memory protocol",
        );
    }

    const trajectoryStore = dependencies.trajectoryStore;
    if (trajectoryStore === undefined) {
        throw new WorkingMemoryTrajectoryRequiredError(
            "structured Goal requires a readable Trajectory store",
        );
    }

    const committedThroughSequence = goal.state.run.committedThroughSequence;
    if (
        committedThroughSequence === undefined
        || !Number.isInteger(committedThroughSequence)
        || committedThroughSequence < 0
    ) {
        throw new WorkingMemoryTrajectoryRequiredError(
            "structured Goal requires a Snapshot committedThroughSequence",
        );
    }

    const snapshotRevision = validateRevision(
        goal.state.run.memoryRevision,
        committedThroughSequence,
    );

    let rawResult: TrajectoryReadResult;
    try {
        rawResult = await trajectoryStore.readWithBoundary(
            {
                goalId: goal.id,
                runId: goal.state.run.id,
            },
            committedThroughSequence,
        );
    } catch (error) {
        if (error instanceof WorkingMemoryRecoveryError) throw error;
        throw new WorkingMemoryRecoveryError("failed to read Trajectory", error);
    }

    const { committed, tail } = normalizeReadResult(
        rawResult,
        goal,
        committedThroughSequence,
    );
    const allEvents = [...committed, ...tail];
    const evidenceIndex = (() => {
        try {
            return buildCommittedEvidenceIndex({
                goalId: goal.id,
                runId: goal.state.run.id,
                committedThroughSequence,
                events: allEvents,
            });
        } catch (error) {
            throw new WorkingMemoryRecoveryError("committed Evidence index is invalid", error);
        }
    })();

    const patchEvents: AcceptedPatchEvent[] = [];
    for (const event of committed) {
        const patchEvent = decodeAcceptedPatchEvent(event);
        if (patchEvent !== undefined) {
            patchEvents.push(patchEvent);
        }
    }

    const patchById = new Map<string, AcceptedPatchEvent>();
    for (const event of patchEvents) patchById.set(event.eventId, event);

    if (snapshotRevision === undefined) {
        if (patchEvents.length > 0) {
            throw new WorkingMemoryRecoveryError(
                "committed accepted Patch exists without memoryRevision",
            );
        }
        return {
            memory: createEmptyWorkingMemory(committedThroughSequence),
            committedThroughSequence,
            evidenceIndex,
        };
    }

    const head = patchById.get(snapshotRevision.eventId);
    if (head === undefined || head.sequence !== snapshotRevision.sequence) {
        throw new WorkingMemoryRecoveryError(
            "memoryRevision does not identify a committed accepted Patch",
        );
    }

    const chain: AcceptedPatchEvent[] = [];
    const visited = new Set<string>();
    let current: AcceptedPatchEvent | undefined = head;
    while (current !== undefined) {
        if (visited.has(current.eventId)) {
            throw new WorkingMemoryRecoveryError("Memory revision chain contains a cycle");
        }
        visited.add(current.eventId);
        chain.push(current);
        const parentId = current.payload.parentRevisionEventId;
        if (parentId === undefined) break;
        const parent = patchById.get(parentId);
        if (parent === undefined) {
            throw new WorkingMemoryRecoveryError("Memory revision parent is missing or uncommitted");
        }
        if (parent.sequence >= current.sequence) {
            throw new WorkingMemoryRecoveryError("Memory revision parent sequence is not older");
        }
        current = parent;
    }

    let memory = createEmptyWorkingMemory();
    for (const event of chain.reverse()) {
        try {
            validateCanonicalFindingEvidence(event.payload.operations, evidenceIndex);
            memory = reduceWorkingMemory(memory, event.payload.operations, {
                derivedThroughSequence: event.sequence,
                revision: { eventId: event.eventId, sequence: event.sequence },
                limits: REPLAY_LIMITS,
            });
        } catch (error) {
            throw new WorkingMemoryRecoveryError(
                `failed to reduce accepted Patch at sequence ${event.sequence}`,
                error,
            );
        }
    }

    try {
        memory = reduceWorkingMemory(memory, [], {
            derivedThroughSequence: committedThroughSequence,
            revision: snapshotRevision,
            limits: REPLAY_LIMITS,
        });
    } catch (error) {
        throw new WorkingMemoryRecoveryError(
            "failed to advance Working Memory to Snapshot boundary",
            error,
        );
    }

    return {
        memory,
        committedThroughSequence,
        revision: snapshotRevision,
        evidenceIndex,
    };
}

/**
 * 从最新 Snapshot 与 committed Trajectory 确定性重建结构化 Working Memory。
 *
 * @param goal - 已恢复的 Goal Snapshot；必须显式采用 structured@1。
 * @param dependencies - Trajectory 读取端口及可选恢复配置。
 * @returns 临时 Memory、提交边界和选中的 revision；不会修改 Goal、Store 或事件。
 * @throws WorkingMemoryTrajectoryRequiredError 缺少 Trajectory 或 Snapshot 边界；
 * WorkingMemoryRecoveryError 轨迹损坏、revision 缺失、跨 Run、循环或归约失败。
 * @example
 * ```ts
 * const { memory } = await rebuildWorkingMemory(goal, { trajectoryStore });
 * ```
 */
export async function rebuildWorkingMemory(
    goal: Goal,
    dependencies: WorkingMemorySessionDependencies,
): Promise<RebuiltWorkingMemory> {
    const restored = await rebuild(goal, dependencies);
    return {
        memory: restored.memory,
        committedThroughSequence: restored.committedThroughSequence,
        ...(restored.revision === undefined ? {} : { revision: restored.revision }),
    };
}

/** `rebuildWorkingMemory` 的语义别名，供恢复调用方按 Session 语义命名。 */
export async function restoreWorkingMemory(
    goal: Goal,
    dependencies: WorkingMemorySessionDependencies,
): Promise<WorkingMemory> {
    return (await rebuild(goal, dependencies)).memory;
}

/**
 * 一次调用链内的 Working Memory 持有者。
 *
 * @remarks
 * Session 只持有从 committed Trajectory 得到的临时投影；`close` 后立即丢弃该
 * 投影，重启或下一次调用必须再次通过 `restore` 重建。类不向 Goal Snapshot 写入
 * Memory，也不把原始 Trajectory 事件暴露为可变引用。
 *
 * @example
 * ```ts
 * const session = await WorkingMemorySession.restore(goal, { trajectoryStore });
 * const view = session.workingMemory;
 * session.close();
 * ```
 */
export class WorkingMemorySession {
    private currentMemory: WorkingMemory | undefined;
    private currentEvidenceIndex: CommittedEvidenceIndex | undefined;

    /**
     * @param goal - 与恢复结果关联的 Goal 身份。
     * @param memory - 已由 `restore` 或 `rebuildWorkingMemory` 构造的临时 Memory。
     */
    constructor(
        private readonly goal: Pick<Goal, "id" | "state">,
        memory: WorkingMemory,
        evidenceIndex?: CommittedEvidenceIndex,
    ) {
        this.currentMemory = structuredClone(memory);
        this.currentEvidenceIndex = evidenceIndex;
    }

    /** 从 Goal Snapshot 和 Trajectory 打开新的 Session。 */
    static async restore(
        goal: Goal,
        dependencies: WorkingMemorySessionDependencies,
    ): Promise<WorkingMemorySession> {
        const restored = await rebuild(goal, dependencies);
        return new WorkingMemorySession(goal, restored.memory, restored.evidenceIndex);
    }

    /** `restore` 的语义别名，便于调用方表达首次打开。 */
    static async open(
        goal: Goal,
        dependencies: WorkingMemorySessionDependencies,
    ): Promise<WorkingMemorySession> {
        return WorkingMemorySession.restore(goal, dependencies);
    }

    /** 当前 Session 绑定的 Goal/Run 身份。 */
    get goalRef(): Pick<Goal, "id" | "state"> {
        return {
            id: this.goal.id,
            state: structuredClone(this.goal.state),
        };
    }

    /**
     * 返回与 Session 内部隔离的当前 Memory 副本。
     * @throws WorkingMemorySessionClosedError Session 已关闭时抛出。
     */
    get workingMemory(): WorkingMemory {
        if (this.currentMemory === undefined) {
            throw new WorkingMemorySessionClosedError();
        }
        return structuredClone(this.currentMemory);
    }

    /**
     * 在当前 committed Snapshot 边界内校验模型提出的 Memory Patch。
     *
     * @param patch - 尚未接受的模型 Patch。
     * @param workingMemory - 可选的校验起点；省略时使用 Session 当前投影。
     * @throws WorkingMemorySessionClosedError Session 已关闭；
     * WorkingMemoryPatchError 或 EvidenceGateError 当 Patch 或证据引用非法。
     * @example
     * ```ts
     * session.validatePatch(result.memoryPatch);
     * ```
     */
    validatePatch(
        patch: unknown,
        workingMemory?: WorkingMemory,
    ): asserts patch is MemoryPatch {
        if (this.currentMemory === undefined || this.currentEvidenceIndex === undefined) {
            throw new WorkingMemorySessionClosedError();
        }
        const validationMemory = workingMemory ?? this.currentMemory;
        validateMemoryPatchEvidence(
            patch,
            this.currentEvidenceIndex,
            validationMemory,
        );
    }

    /**
     * 校验一组完成声明使用的 committed Evidence sequence。
     *
     * @param evidenceSequences - 当前 Goal/Run 的证据序列。
     * @throws WorkingMemorySessionClosedError Session 已关闭；EvidenceGateError
     * 当序列缺失、越界或事件类别不允许。
     * @example
     * ```ts
     * session.validateEvidence([12]);
     * ```
     */
    validateEvidence(evidenceSequences: readonly number[]): void {
        if (this.currentMemory === undefined || this.currentEvidenceIndex === undefined) {
            throw new WorkingMemorySessionClosedError();
        }
        validateFindingEvidence(evidenceSequences, this.currentEvidenceIndex);
    }

    /** 丢弃进程内 Memory；不会改写 Snapshot 或 Trajectory。 */
    close(): void {
        this.currentMemory = undefined;
        this.currentEvidenceIndex = undefined;
    }
}
