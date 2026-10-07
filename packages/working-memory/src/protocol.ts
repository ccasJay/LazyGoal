import type {
    MemoryProtocol,
    MemoryRevision,
    WorkingMemory,
} from "./types";

/**
 * 判断未知值是否为受支持的 Memory 协议判别联合。
 *
 * @param value - 待判断的未知值。
 * @returns 是否符合受支持的结构化记忆协议。
 *
 * @example
 * ```ts
 * if (isMemoryProtocol(input)) {
 *     // input is MemoryProtocol
 * }
 * ```
 */
export function isMemoryProtocol(value: unknown): value is MemoryProtocol {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        candidate.kind === "structured"
        && candidate.version === 1
        && Object.keys(candidate).every((key) => key === "kind" || key === "version")
    );
}

/**
 * 创建没有条目的、可作为 Reducer 初始值的 Working Memory。
 *
 * @param derivedThroughSequence - 派生截止 sequence，必须为非负整数，默认为 0。
 * @param revision - 可选的指向 accepted Patch 的不可变 revision。
 * @returns 初始化的空 Working Memory 投影。
 * @throws `derivedThroughSequence` 非整数或为负数，或 `revision` 非法／越界时抛出 Error。
 *
 * @example
 * ```ts
 * const initial = createEmptyWorkingMemory();
 * ```
 */
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
        facts: [],
        hypotheses: [],
        blockers: [],
    };
}
