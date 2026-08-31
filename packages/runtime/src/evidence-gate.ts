import type {
    EvidenceBackedFact,
    MemoryPatch,
    MemoryPatchOperation,
    WorkingMemory,
} from "./domain";
import {
    validateMemoryPatch,
} from "./working-memory-core";
import type {
    TrajectoryEvent,
    TrajectoryEventType,
} from "./trajectory";
import { freezeTrajectoryEvent } from "./trajectory";
import type { ContextLookupResult } from "./context-retrieval";

/** Evidence Gate 校验失败的稳定错误码。 */
export const WORKING_MEMORY_EVIDENCE_ERROR_CODE = "INVALID_MEMORY_EVIDENCE" as const;

/** 能作为 Fact 直接证据的已提交事实事件类型。 */
export const EVIDENCE_EVENT_TYPES: readonly TrajectoryEventType[] = [
    "observation_recorded",
    "tool_finished",
];

/** Context Lookup 事实类型；这些事件只描述查询过程，不能直接成为证据。 */
export const CONTEXT_LOOKUP_EVENT_TYPES: readonly TrajectoryEventType[] = [
    "context_lookup_requested",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
];

/**
 * Evidence 索引构建所需的当前 Goal/Run 与 Snapshot 边界。
 *
 * @example
 * ```ts
 * const index = buildCommittedEvidenceIndex({
 *   goalId: "goal-1",
 *   runId: "run-1",
 *   committedThroughSequence: 12,
 *   events,
 * });
 * ```
 */
export interface CommittedEvidenceIndexInput {
    /** 当前 Goal 的稳定 ID。 */
    readonly goalId: string;
    /** 当前 Run 的稳定 ID。 */
    readonly runId: string;
    /** 最新有效 Snapshot 的提交边界。 */
    readonly committedThroughSequence: number;
    /** 从 Trajectory 读取的事件；可包含未提交 tail。 */
    readonly events: readonly TrajectoryEvent[];
}

/**
 * 当前 Snapshot 边界内可供 Evidence Gate 查询的只读序列索引。
 *
 * @remarks 索引包含所有 committed 事件，但只有允许的 Observation 类型能通过
 * `validate` 成为 Fact 证据。边界之外、跨 Goal/Run 或不存在的序列不会进入索引。
 * 索引是一次调用的临时对象，不写入 Goal Snapshot。
 *
 * @example
 * ```ts
 * const event = index.get(9);
 * if (event !== undefined) console.log(event.eventType);
 * ```
 */
export interface CommittedEvidenceIndex {
    /** 索引对应的 Goal ID。 */
    readonly goalId: string;
    /** 索引对应的 Run ID。 */
    readonly runId: string;
    /** 索引采用的 Snapshot committed boundary。 */
    readonly committedThroughSequence: number;
    /** 当前边界内的事件，按 sequence 建立只读 Map。 */
    readonly events: ReadonlyMap<number, Readonly<TrajectoryEvent>>;
    /**
     * @param sequence - 要查询的 Trajectory sequence。
     * @returns 对应 committed 事件；不存在或超出边界时返回 `undefined`。
     */
    get(sequence: number): Readonly<TrajectoryEvent> | undefined;
    /**
     * @param sequence - 要查询的 Trajectory sequence。
     * @returns 是否存在对应 committed 事件。
     */
    has(sequence: number): boolean;
}

/**
 * 校验 found 结果的原始 source refs 是否仍属于当前 committed Trajectory。
 *
 * @remarks
 * 该校验只确认 lookup 结果的来源完整性，不把 source ref 自动升级为 Fact
 * 证据。调用方仍必须把允许的原始 sequence 交给 `validateFactEvidence`；查询
 * 请求、结果、not_found 与 lookup_error 事件始终会被拒绝。
 *
 * @param result - 已通过 Result DTO 结构校验的 found 结果。
 * @param index - 当前 Goal/Run 的 committed 事件索引。
 * @throws EvidenceGateError 当来源缺失、越界、跨身份、重复或属于 lookup 事件时。
 * @example
 * ```ts
 * validateContextLookupSourceReferences(foundResult, evidenceIndex);
 * ```
 */
export function validateContextLookupSourceReferences(
    result: Extract<ContextLookupResult, { readonly status: "found" }>,
    index: CommittedEvidenceIndex,
): void {
    if (result.committedThroughSequence > index.committedThroughSequence) {
        throw new EvidenceGateError(
            "Context Lookup result boundary exceeds committed evidence boundary",
        );
    }
    const seenEventIds = new Set<string>();
    const knownEventIds = new Map<string, Readonly<TrajectoryEvent>>();
    for (const event of index.events.values()) {
        if (knownEventIds.has(event.eventId)) {
            throw new EvidenceGateError("Trajectory contains duplicate event ID");
        }
        knownEventIds.set(event.eventId, event);
    }

    for (const match of result.matches) {
        if (match.goalId !== index.goalId || match.runId !== index.runId) {
            throw new EvidenceGateError(
                "Context Lookup source ref belongs to a different Goal/Run",
            );
        }
        if (match.lastSequence > result.committedThroughSequence) {
            throw new EvidenceGateError("Context Lookup source range exceeds result boundary");
        }
        for (const eventId of match.sourceEventIds) {
            if (seenEventIds.has(eventId)) {
                throw new EvidenceGateError("Context Lookup contains duplicate source ref");
            }
            seenEventIds.add(eventId);
            const event = knownEventIds.get(eventId);
            if (event === undefined) {
                throw new EvidenceGateError("Context Lookup source ref is not committed");
            }
            if (
                event.sequence < match.firstSequence
                || event.sequence > match.lastSequence
            ) {
                throw new EvidenceGateError("Context Lookup source ref is outside its document range");
            }
            if (isContextLookupEventType(event.eventType)) {
                throw new EvidenceGateError(
                    "Context Lookup events cannot be used as evidence",
                );
            }
        }
    }
}

/**
 * 表示 Fact 证据不存在、未提交或事件类型不被允许。
 *
 * @example
 * ```ts
 * try {
 *   validateFactEvidence([10], index);
 * } catch (error) {
 *   if (error instanceof EvidenceGateError) console.error(error.code);
 * }
 * ```
 */
export class EvidenceGateError extends Error {
    readonly code = WORKING_MEMORY_EVIDENCE_ERROR_CODE;

    /** @param message - 不包含任务正文的稳定诊断信息。 */
    constructor(message: string) {
        super(`${WORKING_MEMORY_EVIDENCE_ERROR_CODE}: ${message}`);
        this.name = "EvidenceGateError";
    }
}

function assertNonEmptyId(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new EvidenceGateError(`${label} must be a non-empty string`);
    }
}

function assertBoundary(value: unknown): asserts value is number {
    if (
        typeof value !== "number"
        || !Number.isInteger(value)
        || value < 0
    ) {
        throw new EvidenceGateError("committedThroughSequence must be a non-negative integer");
    }
}

function eventIsEvidence(event: Readonly<TrajectoryEvent>): boolean {
    if (!EVIDENCE_EVENT_TYPES.includes(event.eventType)) return false;
    if (
        event.eventType === "observation_recorded"
        && event.payload.observation.kind === "rejected"
    ) {
        return false;
    }
    return true;
}

/**
 * 按 Goal/Run 与 Snapshot committed boundary 构建确定性的 Evidence 索引。
 *
 * @param input - 当前 Goal/Run、边界和读取到的 Trajectory 事件。
 * @returns 不共享输入引用的只读序列索引；未提交 tail 不会被纳入。
 * @throws EvidenceGateError 当关联键、边界、sequence 或事件重复时抛出。
 * @example
 * ```ts
 * const index = buildCommittedEvidenceIndex({ goalId, runId, committedThroughSequence, events });
 * ```
 */
export function buildCommittedEvidenceIndex(
    input: CommittedEvidenceIndexInput,
): CommittedEvidenceIndex {
    assertNonEmptyId(input.goalId, "goalId");
    assertNonEmptyId(input.runId, "runId");
    assertBoundary(input.committedThroughSequence);

    const events = new Map<number, Readonly<TrajectoryEvent>>();
    for (const event of input.events) {
        if (event.goalId !== input.goalId || event.runId !== input.runId) continue;
        if (
            typeof event.sequence !== "number"
            || !Number.isInteger(event.sequence)
            || event.sequence <= 0
        ) {
            throw new EvidenceGateError("Trajectory event sequence must be a positive integer");
        }
        if (event.sequence > input.committedThroughSequence) continue;
        if (events.has(event.sequence)) {
            throw new EvidenceGateError("Trajectory contains duplicate sequence");
        }
        try {
            events.set(event.sequence, freezeTrajectoryEvent(event));
        } catch (error) {
            throw new EvidenceGateError(
                `Trajectory event ${event.sequence} is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
            );
        }
    }

    const readonlyEvents = new Map<number, Readonly<TrajectoryEvent>>(events);
    const index: CommittedEvidenceIndex = {
        goalId: input.goalId,
        runId: input.runId,
        committedThroughSequence: input.committedThroughSequence,
        events: readonlyEvents,
        get(sequence) {
            return readonlyEvents.get(sequence);
        },
        has(sequence) {
            return readonlyEvents.has(sequence);
        },
    };
    return Object.freeze(index);
}

/**
 * 校验一组 evidence sequence 是否全部指向当前 committed、允许的事实事件。
 *
 * @param evidenceSequences - Fact 声明的 Trajectory sequence 列表。
 * @param index - 当前 Goal/Run 的 committed Evidence 索引。
 * @throws EvidenceGateError 当列表为空、越界、缺失、跨来源或事件类型不允许时抛出。
 * @example
 * ```ts
 * validateFactEvidence([8, 9], index);
 * ```
 */
export function validateFactEvidence(
    evidenceSequences: readonly number[],
    index: CommittedEvidenceIndex,
): void {
    if (evidenceSequences.length === 0) {
        throw new EvidenceGateError("Fact must reference at least one evidence sequence");
    }

    const seen = new Set<number>();
    for (const sequence of evidenceSequences) {
        if (
            typeof sequence !== "number"
            || !Number.isInteger(sequence)
            || sequence <= 0
        ) {
            throw new EvidenceGateError("evidence sequence must be a positive integer");
        }
        if (seen.has(sequence)) {
            throw new EvidenceGateError("Fact contains duplicate evidence sequence");
        }
        seen.add(sequence);

        if (sequence > index.committedThroughSequence) {
            throw new EvidenceGateError("evidence sequence is beyond committed boundary");
        }
        const event = index.get(sequence);
        if (event === undefined) {
            throw new EvidenceGateError("evidence sequence does not belong to this Goal/Run");
        }
        if (!eventIsEvidence(event)) {
            throw new EvidenceGateError("evidence event type is not allowed for Fact");
        }
    }
}

function evidenceFromOperation(
    operation: MemoryPatchOperation,
): readonly number[] | undefined {
    if (operation.type === "upsert_fact" || operation.type === "retire_fact") {
        return operation.fact.evidenceSequences;
    }
    if (operation.type === "update_plan_item") {
        return operation.planItem.completionEvidenceSequences;
    }
    return undefined;
}

/**
 * 校验模型 Patch 中所有 Fact 与 Plan completion evidence 引用。
 *
 * @remarks 该函数先执行 Core 的原子 Patch 校验，再执行 evidence 归属与事件类别
 * 校验；任何失败都会拒绝整个 Patch。Hypothesis 与 Blocker 不要求 evidence，
 * Plan 仅在完成状态转换时要求 completion evidence。
 *
 * @param patch - 模型提出的结构化 Patch。
 * @param index - 当前 committed Trajectory 的 Evidence 索引。
 * @param workingMemory - 更新操作引用现有条目时使用的当前 Memory。
 * @throws WorkingMemoryPatchError 或 EvidenceGateError 当任一校验失败时抛出。
 * @example
 * ```ts
 * validateMemoryPatchEvidence(patch, index, workingMemory);
 * ```
 */
export function validateMemoryPatchEvidence(
    patch: unknown,
    index: CommittedEvidenceIndex,
    workingMemory?: WorkingMemory,
): asserts patch is MemoryPatch {
    validateMemoryPatch(
        patch,
        workingMemory === undefined ? {} : { workingMemory },
    );
    for (const operation of patch.operations) {
        const evidence = evidenceFromOperation(operation);
        if (evidence !== undefined && evidence.length > 0) validateFactEvidence(evidence, index);
    }
}

/**
 * 校验规范化 accepted Patch 中所有 Fact 与 Plan completion evidence 引用。
 *
 * @param operations - accepted Event 将保存的规范化操作。
 * @param index - 当前 committed Trajectory 的 Evidence 索引。
 * @throws EvidenceGateError 当证据引用不能回查时抛出。
 */
export function validateCanonicalFactEvidence(
    operations: readonly import("./domain").CanonicalMemoryOperation[],
    index: CommittedEvidenceIndex,
): void {
    for (const operation of operations) {
        if (operation.type === "upsert_fact") {
            validateFactEvidence(operation.fact.evidenceSequences, index);
        }
        if (
            operation.type === "upsert_plan_item"
            && operation.planItem.completionEvidenceSequences.length > 0
        ) {
            validateFactEvidence(operation.planItem.completionEvidenceSequences, index);
        }
    }
}

/**
 * 可注入 Coordinator/Runner 的 Evidence Gate。
 *
 * @example
 * ```ts
 * const gate = createEvidenceGate(index);
 * gate.validateFact([12]);
 * ```
 */
export interface EvidenceGate {
    /** @param evidenceSequences - Fact 声明的证据序列。 */
    validateFact(evidenceSequences: readonly number[]): void;
    /** @param patch - 待接受的模型 Patch；可选当前 Memory 用于补全 update。 */
    validatePatch(patch: unknown, workingMemory?: WorkingMemory): void;
    /**
     * @param result - 带原始 source refs 的 found Lookup Result。
     * @remarks 该方法只校验来源；最终 Fact 仍须引用允许的原始 sequence。
     * @example
     * ```ts
     * gate.validateContextLookup(foundResult);
     * ```
     */
    validateContextLookup(
        result: Extract<ContextLookupResult, { readonly status: "found" }>,
    ): void;
}

/**
 * 创建绑定单次 committed Trajectory 索引的 Evidence Gate。
 *
 * @param index - 当前 Goal/Run 的只读 Evidence 索引。
 * @returns 不持有可变执行状态的 Gate。
 */
export function createEvidenceGate(index: CommittedEvidenceIndex): EvidenceGate {
    return Object.freeze({
        validateFact: (evidenceSequences: readonly number[]) =>
            validateFactEvidence(evidenceSequences, index),
        validatePatch: (patch: unknown, workingMemory?: WorkingMemory): asserts patch is MemoryPatch =>
            validateMemoryPatchEvidence(patch, index, workingMemory),
        validateContextLookup: (result: Extract<ContextLookupResult, { readonly status: "found" }>) =>
            validateContextLookupSourceReferences(result, index),
    });
}

/** 供调用方快速判断 Trajectory 事件是否属于允许 Evidence 类别。 */
export function isEvidenceEventType(eventType: string): eventType is typeof EVIDENCE_EVENT_TYPES[number] {
    return (EVIDENCE_EVENT_TYPES as readonly string[]).includes(eventType);
}

/** 判断事件是否属于只记录查询过程、不可作为完成证据的 Context Lookup 类型。 */
export function isContextLookupEventType(
    eventType: string,
): eventType is typeof CONTEXT_LOOKUP_EVENT_TYPES[number] {
    return (CONTEXT_LOOKUP_EVENT_TYPES as readonly string[]).includes(eventType);
}

/** 将 Evidence 事件类型限制为稳定的字符串集合，避免调用方复制常量。 */
export type EvidenceEventType = typeof EVIDENCE_EVENT_TYPES[number];

/** 供类型消费者引用的 Fact 证据字段形状。 */
export type FactEvidence = Pick<EvidenceBackedFact, "evidenceSequences">;
