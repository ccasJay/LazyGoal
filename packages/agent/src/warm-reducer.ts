import type { ModelInputEstimator } from "./model-context-budget";
import { CharacterModelInputEstimator } from "./model-context-budget";

/** Warm Compact 支持的语义分区。 */
export type WarmEntryKind =
    | "decision"
    | "finding"
    | "failure"
    | "blocker"
    | "unresolved";

/** Warm 条目的生命周期状态。 */
export type WarmEntryStatus = "active" | "resolved" | "superseded";

/**
 * 可进入 Warm 层的有损条目。
 *
 * @remarks
 * 条目只描述 committed Trajectory 的中期语义，不替代 Goal Task、Working Memory
 * 或 Runtime 控制状态。`sourceHash` 和 evidence sequence 使其可验证；淘汰条目后
 * 原始事实仍留在 Cold Trajectory。
 *
 * @example
 * ```ts
 * const entry: WarmCompactEntry = {
 *     id: "finding-tests-pass",
 *     kind: "finding",
 *     summary: "单元测试已通过",
 *     status: "active",
 *     lossy: true,
 *     evidenceSequences: [18],
 *     firstSequence: 18,
 *     lastSequence: 18,
 *     lastAccessedSequence: 18,
 *     reinforcementCount: 1,
 *     sourceHash: "sha256:...",
 * };
 * ```
 */
export interface WarmCompactEntry {
    readonly id: string;
    readonly kind: WarmEntryKind;
    readonly summary: string;
    readonly status: WarmEntryStatus;
    readonly lossy: true;
    readonly evidenceSequences: readonly number[];
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly lastAccessedSequence: number;
    readonly reinforcementCount: number;
    readonly sourceHash: string;
}

/**
 * 单个 Warm 分区的条目数和计量容量。
 *
 * @example
 * ```ts
 * const quota: WarmPartitionQuota = { maxEntries: 4, maxMeasurement: 2048 };
 * ```
 */
export interface WarmPartitionQuota {
    /** 该类别最多保留的条目数；零表示禁用该分区。 */
    readonly maxEntries: number;
    /** 该类别最多占用的最终模型输入计量值。 */
    readonly maxMeasurement: number;
}

/** 所有 Warm 分区的确定性容量配置。 */
export type WarmPartitionQuotas = Readonly<Record<WarmEntryKind, WarmPartitionQuota>>;

/** 默认每类 Warm 分区容量。 */
export const DEFAULT_WARM_PARTITION_QUOTA: WarmPartitionQuota = Object.freeze({
    maxEntries: 8,
    maxMeasurement: 4_096,
});

/** 默认 Warm 分区顺序，影响跨类别输出的稳定顺序。 */
export const WARM_ENTRY_KINDS: readonly WarmEntryKind[] = Object.freeze([
    "decision",
    "finding",
    "failure",
    "blocker",
    "unresolved",
]);

/** 创建所有类别使用同一容量的 Warm 配额。 */
export function createDefaultWarmPartitionQuotas(): WarmPartitionQuotas {
    return Object.freeze(Object.fromEntries(
        WARM_ENTRY_KINDS.map((kind) => [kind, DEFAULT_WARM_PARTITION_QUOTA]),
    ) as Record<WarmEntryKind, WarmPartitionQuota>);
}

/**
 * WarmReducer 构造配置。
 *
 * @example
 * ```ts
 * const options: WarmReducerOptions = {
 *     quotas: createDefaultWarmPartitionQuotas(),
 *     protectedIds: ["blocker-1"],
 * };
 * ```
 */
export interface WarmReducerOptions {
    /** 按类别隔离的条目数与计量容量。 */
    readonly quotas?: Partial<WarmPartitionQuotas>;
    /** 对最终 Warm 条目执行 Token 或字符计量。 */
    readonly estimator?: ModelInputEstimator;
    /** 当前轮次临时保护的条目 ID；仍受所在分区配额约束。 */
    readonly protectedIds?: readonly string[];
}

/**
 * 一次 Warm 归约的结果报告。
 *
 * @example
 * ```ts
 * const result: WarmReductionResult = reducer.reduce(entries);
 * console.log(result.retained.length, result.overflowCandidates.length);
 * ```
 */
export interface WarmReductionResult {
    /** 按类别和新近程度排列、可直接加入本轮模型输入的条目。 */
    readonly retained: readonly WarmCompactEntry[];
    /** 因分类容量被移出、可供本轮 Compact 候选评估的条目。 */
    readonly overflowCandidates: readonly WarmCompactEntry[];
    /** 被确定性状态规则丢弃的条目（当前主要是 superseded）。 */
    readonly discarded: readonly WarmCompactEntry[];
    /** 本次计量单位。 */
    readonly measuredAs: "token" | "character";
    /** retained 的计量总和。 */
    readonly retainedMeasurement: number;
    /** overflowCandidates 的计量总和。 */
    readonly overflowMeasurement: number;
}

/**
 * 按 stable ID、状态和分区配额归约 Warm 条目。
 *
 * @remarks
 * 归约顺序固定为：深复制并校验 → 按 ID 合并 → 删除 superseded → 每区按语义
 * LRU 选择 retained/overflow。保护只提升同区优先级，不绕过条目数或计量上限；
 * `reinforcementCount` 不会因重复输入自动累加。该类无持久状态，不写入 Trajectory
 * 或 Sidecar。
 *
 * @example
 * ```ts
 * const reducer = new WarmReducer({
 *     quotas: {
 *         ...createDefaultWarmPartitionQuotas(),
 *         finding: { maxEntries: 4, maxMeasurement: 2048 },
 *     },
 * });
 * const result = reducer.reduce(entries);
 * ```
 */
export class WarmReducer {
    private readonly quotas: WarmPartitionQuotas;
    private readonly estimator: ModelInputEstimator;
    private readonly protectedIds: ReadonlySet<string>;

    /** @param options - 分区配额、计量器和本轮临时保护集合。 */
    constructor(options: WarmReducerOptions = {}) {
        this.quotas = normalizeQuotas(options.quotas);
        this.estimator = options.estimator ?? new CharacterModelInputEstimator();
        const protectedIds = options.protectedIds ?? [];
        if (protectedIds.some((id) => typeof id !== "string" || id.trim().length === 0)) {
            throw new RangeError("protectedIds must contain non-empty strings");
        }
        this.protectedIds = new Set(protectedIds);
    }

    /**
     * @param entries - 来自 Sidecar 或 committed Trajectory 的 Warm 条目。
     * @returns 深冻结的 retained、overflow 和 discarded 报告。
     * @throws RangeError 当条目、配额或计量结果违反协议时。
     */
    reduce(entries: readonly WarmCompactEntry[]): WarmReductionResult {
        const normalized = entries.map(normalizeEntry);
        const merged = mergeByStableId(normalized);
        const discarded: WarmCompactEntry[] = [];
        const retained: WarmCompactEntry[] = [];
        const overflowCandidates: WarmCompactEntry[] = [];
        let retainedMeasurement = 0;
        let overflowMeasurement = 0;

        for (const kind of WARM_ENTRY_KINDS) {
            const quota = this.quotas[kind];
            const partition = merged
                .filter((entry) => entry.kind === kind)
                .filter((entry) => {
                    if (entry.status === "superseded") {
                        discarded.push(entry);
                        return false;
                    }
                    return true;
                });
            const scored = partition
                .map((entry) => ({ entry, measurement: measure(this.estimator, entry) }))
                .sort((left, right) => compareRetention(
                    left.entry,
                    right.entry,
                    this.protectedIds,
                ));
            let partitionCount = 0;
            let partitionMeasurement = 0;

            for (const candidate of scored) {
                if (
                    partitionCount < quota.maxEntries
                    && candidate.measurement <= quota.maxMeasurement - partitionMeasurement
                ) {
                    retained.push(candidate.entry);
                    partitionCount += 1;
                    partitionMeasurement += candidate.measurement;
                    retainedMeasurement += candidate.measurement;
                } else {
                    overflowCandidates.push(candidate.entry);
                    overflowMeasurement += candidate.measurement;
                }
            }
        }

        const retainedOrdered = retained.sort((left, right) => compareOutput(left, right));
        const overflowOrdered = overflowCandidates.sort((left, right) => compareEviction(
            left,
            right,
            this.protectedIds,
        ));
        const discardedOrdered = discarded.sort(compareOutput);
        return Object.freeze({
            retained: Object.freeze(retainedOrdered),
            overflowCandidates: Object.freeze(overflowOrdered),
            discarded: Object.freeze(discardedOrdered),
            measuredAs: this.estimator.unit,
            retainedMeasurement,
            overflowMeasurement,
        });
    }
}

/** Warm 条目 reinforcement 的合法来源。 */
export type WarmReinforcementReason = "committed_evidence" | "retrieval_hit";

/**
 * 一次合法 reinforcement 的来源信息。
 *
 * @example
 * ```ts
 * const input: WarmReinforcementInput = {
 *     reason: "retrieval_hit",
 *     sequence: 30,
 * };
 * ```
 */
export interface WarmReinforcementInput {
    /** committed 新证据或本轮 Retrieval 命中。 */
    readonly reason: WarmReinforcementReason;
    /** 产生新证据/命中的 committed sequence。 */
    readonly sequence: number;
    /** 新 committed 证据可选的来源 hash。 */
    readonly sourceHash?: string;
}

/**
 * 根据新的 committed 证据或 Retrieval 命中强化条目。
 *
 * @remarks
 * 该函数不会因为模型重复输出而自动调用。相同或更旧的 sequence 被拒绝，避免
 * replay 让条目永久占据分区；`retrieval_hit` 不改变 evidence range，
 * `committed_evidence` 才会追加 evidence 并可更新 sourceHash。
 *
 * @example
 * ```ts
 * const next = reinforceWarmEntry(entry, {
 *     reason: "committed_evidence",
 *     sequence: 25,
 *     sourceHash: "sha256:new",
 * });
 * ```
 */
export function reinforceWarmEntry(
    entry: WarmCompactEntry,
    input: WarmReinforcementInput,
): WarmCompactEntry {
    const normalized = normalizeEntry(entry);
    assertPositiveSafeInteger(input.sequence, "reinforcement sequence");
    if (normalized.status === "superseded") {
        throw new RangeError("superseded Warm entry cannot be reinforced");
    }
    if (input.reason !== "committed_evidence" && input.reason !== "retrieval_hit") {
        throw new RangeError("reinforcement reason is invalid");
    }
    if (input.reason === "committed_evidence") {
        if (input.sequence <= normalized.lastSequence) {
            throw new RangeError("committed evidence sequence must be newer than lastSequence");
        }
        if (input.sourceHash !== undefined && input.sourceHash.trim().length === 0) {
            throw new RangeError("sourceHash must be a non-empty string");
        }
        const evidenceSequences = [...normalized.evidenceSequences, input.sequence].sort(
            (left, right) => left - right,
        );
        if (normalized.reinforcementCount === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("reinforcementCount cannot exceed the safe integer range");
        }
        return Object.freeze({
            ...normalized,
            evidenceSequences: Object.freeze(evidenceSequences),
            lastSequence: input.sequence,
            lastAccessedSequence: input.sequence,
            reinforcementCount: normalized.reinforcementCount + 1,
            ...(input.sourceHash === undefined ? {} : { sourceHash: input.sourceHash }),
        });
    }

    if (input.sequence <= normalized.lastAccessedSequence) {
        throw new RangeError("retrieval hit sequence must be newer than lastAccessedSequence");
    }
    if (normalized.reinforcementCount === Number.MAX_SAFE_INTEGER) {
        throw new RangeError("reinforcementCount cannot exceed the safe integer range");
    }
    return Object.freeze({
        ...normalized,
        lastAccessedSequence: input.sequence,
        reinforcementCount: normalized.reinforcementCount + 1,
    });
}

function normalizeQuotas(input: Partial<WarmPartitionQuotas> | undefined): WarmPartitionQuotas {
    const quotas = {} as Record<WarmEntryKind, WarmPartitionQuota>;
    for (const kind of WARM_ENTRY_KINDS) {
        const quota = input?.[kind] ?? DEFAULT_WARM_PARTITION_QUOTA;
        assertNonNegativeSafeInteger(quota.maxEntries, `${kind}.maxEntries`);
        assertNonNegativeSafeInteger(quota.maxMeasurement, `${kind}.maxMeasurement`);
        quotas[kind] = Object.freeze({
            maxEntries: quota.maxEntries,
            maxMeasurement: quota.maxMeasurement,
        });
    }
    return Object.freeze(quotas);
}

function normalizeEntry(entry: WarmCompactEntry): WarmCompactEntry {
    if (
        typeof entry.id !== "string"
        || entry.id.trim().length === 0
        || typeof entry.summary !== "string"
        || entry.summary.trim().length === 0
        || !WARM_ENTRY_KINDS.includes(entry.kind)
        || !["active", "resolved", "superseded"].includes(entry.status)
        || entry.lossy !== true
        || typeof entry.sourceHash !== "string"
        || entry.sourceHash.trim().length === 0
    ) {
        throw new RangeError("Warm entry has invalid identity, status, kind, or sourceHash");
    }
    assertPositiveSafeInteger(entry.firstSequence, "firstSequence");
    assertPositiveSafeInteger(entry.lastSequence, "lastSequence");
    assertPositiveSafeInteger(entry.lastAccessedSequence, "lastAccessedSequence");
    assertNonNegativeSafeInteger(entry.reinforcementCount, "reinforcementCount");
    if (entry.firstSequence > entry.lastSequence) {
        throw new RangeError("firstSequence must not exceed lastSequence");
    }
    if (entry.lastAccessedSequence < entry.firstSequence) {
        throw new RangeError("lastAccessedSequence must not precede firstSequence");
    }
    if (!Array.isArray(entry.evidenceSequences)) {
        throw new RangeError("evidenceSequences must be an array");
    }
    const evidenceSequences = [...new Set(entry.evidenceSequences)].sort(
        (left, right) => left - right,
    );
    if (evidenceSequences.some((sequence) => !Number.isSafeInteger(sequence) || sequence <= 0)) {
        throw new RangeError("evidenceSequences must contain positive safe integers");
    }
    if (evidenceSequences.some((sequence) => sequence < entry.firstSequence || sequence > entry.lastSequence)) {
        throw new RangeError("evidenceSequences must be within the entry sequence range");
    }
    return Object.freeze({
        ...entry,
        id: entry.id,
        summary: entry.summary,
        evidenceSequences: Object.freeze(evidenceSequences),
    });
}

function mergeByStableId(entries: readonly WarmCompactEntry[]): WarmCompactEntry[] {
    const merged = new Map<string, WarmCompactEntry>();
    for (const entry of entries) {
        const current = merged.get(entry.id);
        if (current === undefined) {
            merged.set(entry.id, entry);
            continue;
        }
        if (current.kind !== entry.kind) {
            throw new RangeError(`Warm entry ${entry.id} changes kind`);
        }
        const latest = compareVersion(entry, current) > 0 ? entry : current;
        const evidenceSequences = [...new Set([
            ...current.evidenceSequences,
            ...entry.evidenceSequences,
        ])].sort((left, right) => left - right);
        merged.set(entry.id, Object.freeze({
            ...latest,
            firstSequence: Math.min(current.firstSequence, entry.firstSequence),
            lastSequence: Math.max(current.lastSequence, entry.lastSequence),
            lastAccessedSequence: Math.max(
                current.lastAccessedSequence,
                entry.lastAccessedSequence,
            ),
            reinforcementCount: Math.max(
                current.reinforcementCount,
                entry.reinforcementCount,
            ),
            evidenceSequences: Object.freeze(evidenceSequences),
        }));
    }
    return [...merged.values()];
}

function compareVersion(left: WarmCompactEntry, right: WarmCompactEntry): number {
    if (left.lastSequence !== right.lastSequence) return left.lastSequence - right.lastSequence;
    if (left.lastAccessedSequence !== right.lastAccessedSequence) {
        return left.lastAccessedSequence - right.lastAccessedSequence;
    }
    if (left.sourceHash !== right.sourceHash) return left.sourceHash < right.sourceHash ? -1 : 1;
    return left.summary < right.summary ? -1 : left.summary > right.summary ? 1 : 0;
}

function compareRetention(
    left: WarmCompactEntry,
    right: WarmCompactEntry,
    protectedIds: ReadonlySet<string>,
): number {
    const status = statusRank(right.status) - statusRank(left.status);
    if (status !== 0) return status;
    const protection = protectionRank(right, protectedIds) - protectionRank(left, protectedIds);
    if (protection !== 0) return protection;
    const reinforcement = cappedReinforcement(right) - cappedReinforcement(left);
    if (reinforcement !== 0) return reinforcement;
    if (right.lastAccessedSequence !== left.lastAccessedSequence) {
        return right.lastAccessedSequence - left.lastAccessedSequence;
    }
    if (right.lastSequence !== left.lastSequence) return right.lastSequence - left.lastSequence;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function compareEviction(
    left: WarmCompactEntry,
    right: WarmCompactEntry,
    protectedIds: ReadonlySet<string>,
): number {
    return -compareRetention(left, right, protectedIds);
}

function compareOutput(left: WarmCompactEntry, right: WarmCompactEntry): number {
    if (left.kind !== right.kind) {
        return WARM_ENTRY_KINDS.indexOf(left.kind) - WARM_ENTRY_KINDS.indexOf(right.kind);
    }
    if (right.lastSequence !== left.lastSequence) return right.lastSequence - left.lastSequence;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function statusRank(status: WarmEntryStatus): number {
    return status === "active" ? 1 : status === "resolved" ? 0 : -1;
}

function protectionRank(entry: WarmCompactEntry, protectedIds: ReadonlySet<string>): number {
    return protectedIds.has(entry.id) ? 1 : 0;
}

function cappedReinforcement(entry: WarmCompactEntry): number {
    return Math.min(entry.reinforcementCount, 3);
}

function measure(estimator: ModelInputEstimator, entry: WarmCompactEntry): number {
    const count = estimator.estimate(entry);
    assertNonNegativeSafeInteger(count, "Warm entry measurement");
    return count;
}

function assertPositiveSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${field} must be a positive safe integer`);
    }
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${field} must be a non-negative safe integer`);
    }
}
