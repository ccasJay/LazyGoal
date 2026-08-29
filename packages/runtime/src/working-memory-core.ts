import type {
    AddFinding,
    Blocker,
    BlockerUpdate,
    CanonicalMemoryOperation,
    EvidenceBackedFinding,
    GoalPhase,
    Hypothesis,
    HypothesisUpdate,
    MemoryEntry,
    MemoryEntryKind,
    MemoryEntryScope,
    MemoryEntryStatus,
    MemoryPatchOperation,
    NextAction,
    NextActionUpdate,
    PlanItem,
    PlanItemUpdate,
    UpdateFinding,
    WorkingMemory,
    WorkingMemoryPatch,
} from "./domain";
import { createEmptyWorkingMemory } from "./domain";

/** Working Memory Patch 校验失败的稳定错误码。 */
export const WORKING_MEMORY_PATCH_ERROR_CODE = "INVALID_MEMORY_PATCH" as const;

/** Working Memory Core 限制配置错误的稳定错误码。 */
export const WORKING_MEMORY_LIMITS_ERROR_CODE = "INVALID_MEMORY_LIMITS" as const;

/**
 * Working Memory Patch 在接受前使用的有界资源配置。
 *
 * @remarks
 * 限制只用于接受新的模型或生命周期 Patch；重放已经提交的 accepted Event 时不应
 * 使用可能变化的运行配置重新拒绝历史事实。所有字段均为 UTF-16 文本长度、UTF-8
 * 序列化字节数或集合元素数量上限，不会触发静默截断。
 *
 * @example
 * ```ts
 * const limits: WorkingMemoryLimits = {
 *   ...DEFAULT_WORKING_MEMORY_LIMITS,
 *   maxTextLength: 4096,
 * };
 * ```
 */
export interface WorkingMemoryLimits {
    /** 单个 Patch 最多包含的操作数量。 */
    readonly maxOperations: number;
    /** Patch JSON 序列化后的最大 UTF-8 字节数。 */
    readonly maxSerializedBytes: number;
    /** stable ID 的最大 UTF-16 code unit 数。 */
    readonly maxStableIdLength: number;
    /** Finding、Hypothesis、Plan、Blocker 和 nextAction 文本的最大长度。 */
    readonly maxTextLength: number;
    /** 一个 Finding 最多引用的 Trajectory sequence 数量。 */
    readonly maxEvidenceReferences: number;
    /** 当前有效 Finding 集合的最大容量。 */
    readonly maxFindings: number;
    /** 当前有效 Hypothesis 集合的最大容量。 */
    readonly maxHypotheses: number;
    /** 当前有效 Plan 集合的最大容量。 */
    readonly maxPlanItems: number;
    /** 当前有效 Blocker 集合的最大容量。 */
    readonly maxBlockers: number;
}

/** v1 结构化 Memory 的默认接受限制。 */
export const DEFAULT_WORKING_MEMORY_LIMITS: WorkingMemoryLimits = Object.freeze({
    maxOperations: 32,
    maxSerializedBytes: 32 * 1024,
    maxStableIdLength: 128,
    maxTextLength: 2048,
    maxEvidenceReferences: 16,
    maxFindings: 64,
    maxHypotheses: 32,
    maxPlanItems: 32,
    maxBlockers: 16,
});

/** 允许只覆盖部分默认限制的配置输入。 */
export type WorkingMemoryLimitsInput =
    | WorkingMemoryLimits
    | Partial<WorkingMemoryLimits>;

/**
 * Patch 校验所需的当前 Memory 上下文。
 *
 * @example
 * ```ts
 * validateMemoryPatch(patch, { workingMemory });
 * ```
 */
export interface WorkingMemoryPatchValidationContext {
    /** 当前进程内从已提交事件归约出的 Memory；省略时按空 Memory 校验。 */
    readonly workingMemory?: WorkingMemory;
    /** 本次接受操作使用的限制；省略时使用 v1 默认限制。 */
    readonly limits?: WorkingMemoryLimitsInput;
}

/**
 * 将模型 Patch 归一化为 accepted Event 所需规范化操作的上下文。
 *
 * @remarks `originSequence` 必须是即将写入 accepted Patch Event 的正整数；模型
 * 不可自行提供来源阶段、sequence 或 scope，这些字段由 Runtime 补齐。
 *
 * @example
 * ```ts
 * const context: WorkingMemoryPatchNormalizationContext = {
 *   phase: "executing",
 *   originSequence: 17,
 *   workingMemory,
 * };
 * ```
 */
export interface WorkingMemoryPatchNormalizationContext
    extends WorkingMemoryPatchValidationContext {
    /** 产生该 Patch 的 Runtime 阶段。 */
    readonly phase: GoalPhase;
    /** accepted Patch Event 的 sequence。 */
    readonly originSequence: number;
}

/**
 * 已补齐来源元数据、可写入 `memory_patch_accepted` 的规范化 Patch。
 *
 * @remarks 该 DTO 仍然只包含 Memory 领域操作；Runtime 控制状态不在其中。
 *
 * @example
 * ```ts
 * const normalized = normalizeMemoryPatch(patch, {
 *   phase: "gathering_context",
 *   originSequence: 3,
 * });
 * ```
 */
export interface NormalizedWorkingMemoryPatch {
    readonly protocolVersion: 1;
    readonly operations: readonly CanonicalMemoryOperation[];
}

/**
 * 表示模型 Patch 没有通过原子协议校验。
 *
 * @remarks 抛出后调用方不得保存关联业务结果、执行外部 Tool 或更新进程 Memory。
 *
 * @example
 * ```ts
 * try {
 *   validateMemoryPatch(input);
 * } catch (error) {
 *   if (error instanceof WorkingMemoryPatchError) console.error(error.code);
 * }
 * ```
 */
export class WorkingMemoryPatchError extends Error {
    readonly code = WORKING_MEMORY_PATCH_ERROR_CODE;

    /** @param message - 不包含模型原文的稳定诊断信息。 */
    constructor(message: string) {
        super(`${WORKING_MEMORY_PATCH_ERROR_CODE}: ${message}`);
        this.name = "WorkingMemoryPatchError";
    }
}

/** 表示注入的 Working Memory 限制本身无效。 */
export class WorkingMemoryLimitsError extends Error {
    readonly code = WORKING_MEMORY_LIMITS_ERROR_CODE;

    /** @param message - 限制配置诊断信息。 */
    constructor(message: string) {
        super(`${WORKING_MEMORY_LIMITS_ERROR_CODE}: ${message}`);
        this.name = "WorkingMemoryLimitsError";
    }
}

const MEMORY_ENTRY_KINDS: readonly MemoryEntryKind[] = [
    "finding",
    "hypothesis",
    "plan",
    "blocker",
    "next_action",
];

const MEMORY_ENTRY_STATUSES: readonly MemoryEntryStatus[] = [
    "active",
    "resolved",
    "superseded",
];

const MEMORY_ENTRY_SCOPES: readonly MemoryEntryScope[] = ["goal", "phase"];
const GOAL_PHASES: readonly GoalPhase[] = [
    "gathering_context",
    "planning",
    "executing",
];

const PATCH_KEYS = ["protocolVersion", "operations"] as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownKeys(value: RecordValue): string[] {
    return Object.keys(value);
}

function assertExactKeys(
    value: unknown,
    keys: readonly string[],
    label: string,
): asserts value is RecordValue {
    if (!isRecord(value)) {
        throw new WorkingMemoryPatchError(`${label} must be an object`);
    }

    const expected = new Set(keys);
    const actual = ownKeys(value);
    if (
        actual.length !== expected.size
        || actual.some((key) => !expected.has(key))
    ) {
        throw new WorkingMemoryPatchError(`${label} contains unknown or missing fields`);
    }
}

function assertAllowedKeys(
    value: unknown,
    requiredKeys: readonly string[],
    allowedKeys: readonly string[],
    label: string,
): asserts value is RecordValue {
    if (!isRecord(value)) {
        throw new WorkingMemoryPatchError(`${label} must be an object`);
    }

    const allowed = new Set(allowedKeys);
    const actual = ownKeys(value);
    if (actual.some((key) => !allowed.has(key))) {
        throw new WorkingMemoryPatchError(`${label} contains unknown fields`);
    }
    for (const key of requiredKeys) {
        if (!(key in value)) {
            throw new WorkingMemoryPatchError(`${label} is missing ${key}`);
        }
    }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new WorkingMemoryPatchError(`${label} must be a non-empty string`);
    }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
    if (
        typeof value !== "number"
        || !Number.isInteger(value)
        || value <= 0
    ) {
        throw new WorkingMemoryPatchError(`${label} must be a positive integer`);
    }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
    if (
        typeof value !== "number"
        || !Number.isInteger(value)
        || value < 0
    ) {
        throw new WorkingMemoryPatchError(`${label} must be a non-negative integer`);
    }
}

function assertOneOf<T extends string>(
    value: unknown,
    choices: readonly T[],
    label: string,
): asserts value is T {
    if (typeof value !== "string" || !choices.includes(value as T)) {
        throw new WorkingMemoryPatchError(`${label} is invalid`);
    }
}

function assertLimitInteger(value: unknown, label: string, allowZero = true): void {
    if (
        typeof value !== "number"
        || !Number.isSafeInteger(value)
        || (allowZero ? value < 0 : value <= 0)
    ) {
        throw new WorkingMemoryLimitsError(
            `${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer`,
        );
    }
}

function mergeLimits(input?: WorkingMemoryLimitsInput): WorkingMemoryLimits {
    const candidate = input ?? {};
    if (!isRecord(candidate)) {
        throw new WorkingMemoryLimitsError("limits must be an object");
    }
    const limits: WorkingMemoryLimits = {
        ...DEFAULT_WORKING_MEMORY_LIMITS,
        ...candidate,
    };

    assertLimitInteger(limits.maxOperations, "maxOperations");
    assertLimitInteger(limits.maxSerializedBytes, "maxSerializedBytes", false);
    assertLimitInteger(limits.maxStableIdLength, "maxStableIdLength", false);
    assertLimitInteger(limits.maxTextLength, "maxTextLength", false);
    assertLimitInteger(limits.maxEvidenceReferences, "maxEvidenceReferences");
    assertLimitInteger(limits.maxFindings, "maxFindings");
    assertLimitInteger(limits.maxHypotheses, "maxHypotheses");
    assertLimitInteger(limits.maxPlanItems, "maxPlanItems");
    assertLimitInteger(limits.maxBlockers, "maxBlockers");
    return limits;
}

function serializedByteLength(value: unknown): number {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return Number.POSITIVE_INFINITY;
    return new TextEncoder().encode(serialized).byteLength;
}

function assertTextLimit(
    value: string,
    label: string,
    limits: WorkingMemoryLimits,
): void {
    if (value.length > limits.maxTextLength) {
        throw new WorkingMemoryPatchError(
            `${label} exceeds maxTextLength (${limits.maxTextLength})`,
        );
    }
}

function assertId(value: unknown, label: string, limits: WorkingMemoryLimits): asserts value is string {
    assertNonEmptyString(value, label);
    if (value.length > limits.maxStableIdLength) {
        throw new WorkingMemoryPatchError(
            `${label} exceeds maxStableIdLength (${limits.maxStableIdLength})`,
        );
    }
}

function assertEvidenceSequences(
    value: unknown,
    label: string,
    limits: WorkingMemoryLimits,
): asserts value is readonly number[] {
    if (!Array.isArray(value)) {
        throw new WorkingMemoryPatchError(`${label} must be an array`);
    }
    if (value.length > limits.maxEvidenceReferences) {
        throw new WorkingMemoryPatchError(
            `${label} exceeds maxEvidenceReferences (${limits.maxEvidenceReferences})`,
        );
    }

    const seen = new Set<number>();
    for (const sequence of value) {
        assertPositiveInteger(sequence, `${label} sequence`);
        if (seen.has(sequence)) {
            throw new WorkingMemoryPatchError(`${label} contains duplicate sequence`);
        }
        seen.add(sequence);
    }
}

function assertStoredEvidenceSequences(value: unknown, label: string): asserts value is readonly number[] {
    if (!Array.isArray(value)) {
        throw new WorkingMemoryPatchError(`${label} must be an array`);
    }
    const seen = new Set<number>();
    for (const sequence of value) {
        assertPositiveInteger(sequence, `${label} sequence`);
        if (seen.has(sequence)) {
            throw new WorkingMemoryPatchError(`${label} contains duplicate sequence`);
        }
        seen.add(sequence);
    }
}

function assertStatus(value: unknown, label: string): asserts value is MemoryEntryStatus {
    assertOneOf(value, MEMORY_ENTRY_STATUSES, label);
}

function assertScope(value: unknown, label: string): asserts value is MemoryEntryScope {
    assertOneOf(value, MEMORY_ENTRY_SCOPES, label);
}

function assertPhase(value: unknown, label: string): asserts value is GoalPhase {
    assertOneOf(value, GOAL_PHASES, label);
}

function assertStoredEntry(value: unknown, label: string): asserts value is MemoryEntry {
    if (!isRecord(value) || typeof value.kind !== "string") {
        throw new WorkingMemoryPatchError(`${label} must be a memory entry object`);
    }

    switch (value.kind) {
        case "finding":
            assertExactKeys(
                value,
                [
                    "kind",
                    "id",
                    "originPhase",
                    "originSequence",
                    "scope",
                    "status",
                    "statement",
                    "evidenceSequences",
                ],
                label,
            );
            break;
        case "hypothesis":
            assertExactKeys(
                value,
                ["kind", "id", "originPhase", "originSequence", "scope", "status", "statement"],
                label,
            );
            break;
        case "plan":
        case "blocker":
        case "next_action":
            assertExactKeys(
                value,
                ["kind", "id", "originPhase", "originSequence", "scope", "status", "description"],
                label,
            );
            break;
        default:
            throw new WorkingMemoryPatchError(`${label}.kind is invalid`);
    }

    assertId(value.id, `${label}.id`, {
        ...DEFAULT_WORKING_MEMORY_LIMITS,
        maxStableIdLength: Number.MAX_SAFE_INTEGER,
    });
    assertPhase(value.originPhase, `${label}.originPhase`);
    assertNonNegativeInteger(value.originSequence, `${label}.originSequence`);
    assertScope(value.scope, `${label}.scope`);
    assertStatus(value.status, `${label}.status`);
    if (value.kind === "finding") {
        if (value.scope !== "goal") {
            throw new WorkingMemoryPatchError(`${label}.scope must be goal`);
        }
        assertNonEmptyString(value.statement, `${label}.statement`);
        assertStoredEvidenceSequences(value.evidenceSequences, `${label}.evidenceSequences`);
    } else {
        if (value.kind !== "blocker" && value.scope !== "phase") {
            throw new WorkingMemoryPatchError(`${label}.scope must be phase`);
        }
        assertNonEmptyString(
            value.kind === "hypothesis" ? value.statement : value.description,
            `${label}.text`,
        );
    }
}

function assertPatchObject(
    patch: unknown,
    limits: WorkingMemoryLimits,
): asserts patch is WorkingMemoryPatch {
    assertExactKeys(patch, PATCH_KEYS, "memoryPatch");
    if (patch.protocolVersion !== 1) {
        throw new WorkingMemoryPatchError("protocolVersion must be 1");
    }
    if (!Array.isArray(patch.operations)) {
        throw new WorkingMemoryPatchError("operations must be an array");
    }
    if (patch.operations.length > limits.maxOperations) {
        throw new WorkingMemoryPatchError(
            `operations exceeds maxOperations (${limits.maxOperations})`,
        );
    }
    if (serializedByteLength(patch) > limits.maxSerializedBytes) {
        throw new WorkingMemoryPatchError(
            `memoryPatch exceeds maxSerializedBytes (${limits.maxSerializedBytes})`,
        );
    }
}

function assertFindingInput(
    value: unknown,
    label: string,
    limits: WorkingMemoryLimits,
    update: boolean,
): asserts value is AddFinding | UpdateFinding {
    const keys = ["id", "statement", "evidenceSequences", "status"];
    assertAllowedKeys(
        value,
        update ? ["id"] : ["id", "statement", "evidenceSequences"],
        update ? keys : keys.slice(0, 3),
        label,
    );
    assertId(value.id, `${label}.id`, limits);
    if (!update || value.statement !== undefined) {
        assertNonEmptyString(value.statement, `${label}.statement`);
        assertTextLimit(value.statement, `${label}.statement`, limits);
    }
    if (!update || value.evidenceSequences !== undefined) {
        assertEvidenceSequences(
            value.evidenceSequences,
            `${label}.evidenceSequences`,
            limits,
        );
    }
    if (update && value.status !== undefined) {
        assertStatus(value.status, `${label}.status`);
    }
    if (
        update
        && value.statement === undefined
        && value.evidenceSequences === undefined
        && value.status === undefined
    ) {
        throw new WorkingMemoryPatchError(`${label} must change at least one field`);
    }
}

function assertDescriptionInput(
    value: unknown,
    label: string,
    limits: WorkingMemoryLimits,
    keys: readonly string[],
): asserts value is HypothesisUpdate | PlanItemUpdate | BlockerUpdate | NextActionUpdate {
    const required = ["id"];
    if (keys.includes("statement")) required.push("statement");
    if (keys.includes("description")) required.push("description");
    if (keys.includes("scope")) required.push("scope");
    assertAllowedKeys(value, required, keys, label);
    assertId(value.id, `${label}.id`, limits);
    const description = value.statement ?? value.description;
    assertNonEmptyString(description, `${label}.description`);
    assertTextLimit(description, `${label}.description`, limits);
    if ("scope" in value) assertScope(value.scope, `${label}.scope`);
    if (value.status !== undefined) assertStatus(value.status, `${label}.status`);
}

function assertOperation(
    value: unknown,
    index: number,
    limits: WorkingMemoryLimits,
): asserts value is MemoryPatchOperation {
    if (!isRecord(value) || typeof value.type !== "string") {
        throw new WorkingMemoryPatchError(`operations[${index}] must have a type`);
    }

    switch (value.type) {
        case "add_finding":
            assertExactKeys(value, ["type", "finding"], `operations[${index}]`);
            assertFindingInput(value.finding, `operations[${index}].finding`, limits, false);
            return;
        case "update_finding":
            assertExactKeys(value, ["type", "finding"], `operations[${index}]`);
            assertFindingInput(value.finding, `operations[${index}].finding`, limits, true);
            return;
        case "upsert_hypothesis":
            assertExactKeys(value, ["type", "hypothesis"], `operations[${index}]`);
            assertDescriptionInput(
                value.hypothesis,
                `operations[${index}].hypothesis`,
                limits,
                ["id", "statement", "status"],
            );
            return;
        case "upsert_plan_item":
            assertExactKeys(value, ["type", "planItem"], `operations[${index}]`);
            assertDescriptionInput(
                value.planItem,
                `operations[${index}].planItem`,
                limits,
                ["id", "description", "status"],
            );
            return;
        case "upsert_blocker":
            assertExactKeys(value, ["type", "blocker"], `operations[${index}]`);
            assertDescriptionInput(
                value.blocker,
                `operations[${index}].blocker`,
                limits,
                ["id", "description", "scope", "status"],
            );
            return;
        case "set_next_action":
            assertExactKeys(value, ["type", "nextAction"], `operations[${index}]`);
            if (value.nextAction === null) return;
            assertDescriptionInput(
                value.nextAction,
                `operations[${index}].nextAction`,
                limits,
                ["id", "description", "status"],
            );
            return;
        default:
            throw new WorkingMemoryPatchError(
                `operations[${index}] has unknown type`,
            );
    }
}

interface MemoryEntriesSource {
    readonly findings: readonly EvidenceBackedFinding[];
    readonly hypotheses: readonly Hypothesis[];
    readonly plan: readonly PlanItem[];
    readonly blockers: readonly Blocker[];
    readonly nextAction?: NextAction;
}

function allEntries(memory: MemoryEntriesSource): MemoryEntry[] {
    return [
        ...memory.findings,
        ...memory.hypotheses,
        ...memory.plan,
        ...memory.blockers,
        ...(memory.nextAction === undefined ? [] : [memory.nextAction]),
    ];
}

function findEntry(memory: MemoryEntriesSource, id: string): MemoryEntry | undefined {
    return allEntries(memory).find((entry) => entry.id === id);
}

function entryKind(entry: MemoryEntry): MemoryEntryKind {
    return entry.kind;
}

function assertWorkingMemoryShape(value: unknown): asserts value is WorkingMemory {
    if (!isRecord(value)) {
        throw new WorkingMemoryPatchError("workingMemory must be an object");
    }
    assertAllowedKeys(
        value,
        ["protocolVersion", "derivedThroughSequence", "findings", "hypotheses", "plan", "blockers"],
        [
            "protocolVersion",
            "derivedThroughSequence",
            "revision",
            "findings",
            "hypotheses",
            "plan",
            "blockers",
            "nextAction",
        ],
        "workingMemory",
    );
    const memory = value as unknown as WorkingMemory;
    if (memory.protocolVersion !== 1) {
        throw new WorkingMemoryPatchError("workingMemory.protocolVersion must be 1");
    }
    if (
        !Array.isArray(memory.findings)
        || !Array.isArray(memory.hypotheses)
        || !Array.isArray(memory.plan)
        || !Array.isArray(memory.blockers)
    ) {
        throw new WorkingMemoryPatchError("workingMemory collections must be arrays");
    }
    if (memory.nextAction !== undefined) assertStoredEntry(memory.nextAction, "workingMemory.nextAction");
    if (memory.nextAction !== undefined && memory.nextAction.kind !== "next_action") {
        throw new WorkingMemoryPatchError("workingMemory.nextAction.kind must be next_action");
    }
    if (memory.revision !== undefined) {
        assertExactKeys(memory.revision, ["eventId", "sequence"], "workingMemory.revision");
        assertNonEmptyString(memory.revision.eventId, "workingMemory.revision.eventId");
        assertNonNegativeInteger(memory.revision.sequence, "workingMemory.revision.sequence");
        if (memory.revision.sequence > memory.derivedThroughSequence) {
            throw new WorkingMemoryPatchError("workingMemory revision exceeds derivedThroughSequence");
        }
    }
    assertNonNegativeInteger(
        memory.derivedThroughSequence,
        "workingMemory.derivedThroughSequence",
    );
    const ids = new Set<string>();
    for (const entry of allEntries(memory)) {
        assertStoredEntry(entry, "workingMemory entry");
        if (ids.has(entry.id)) {
            throw new WorkingMemoryPatchError("workingMemory contains duplicate stable ID");
        }
        ids.add(entry.id);
        if (entry.originSequence > memory.derivedThroughSequence) {
            throw new WorkingMemoryPatchError("workingMemory entry exceeds derivedThroughSequence");
        }
    }
}

function assertCanonicalOperation(
    value: unknown,
    label: string,
): asserts value is CanonicalMemoryOperation {
    if (!isRecord(value) || typeof value.type !== "string") {
        throw new WorkingMemoryPatchError(`${label} must have a type`);
    }
    switch (value.type) {
        case "add_finding":
        case "update_finding":
            assertExactKeys(value, ["type", "finding"], label);
            assertStoredEntry(value.finding, `${label}.finding`);
            if (value.finding.kind !== "finding") {
                throw new WorkingMemoryPatchError(`${label}.finding.kind must be finding`);
            }
            return;
        case "upsert_hypothesis":
            assertExactKeys(value, ["type", "hypothesis"], label);
            assertStoredEntry(value.hypothesis, `${label}.hypothesis`);
            if (value.hypothesis.kind !== "hypothesis") {
                throw new WorkingMemoryPatchError(`${label}.hypothesis.kind must be hypothesis`);
            }
            return;
        case "upsert_plan_item":
            assertExactKeys(value, ["type", "planItem"], label);
            assertStoredEntry(value.planItem, `${label}.planItem`);
            if (value.planItem.kind !== "plan") {
                throw new WorkingMemoryPatchError(`${label}.planItem.kind must be plan`);
            }
            return;
        case "upsert_blocker":
            assertExactKeys(value, ["type", "blocker"], label);
            assertStoredEntry(value.blocker, `${label}.blocker`);
            if (value.blocker.kind !== "blocker") {
                throw new WorkingMemoryPatchError(`${label}.blocker.kind must be blocker`);
            }
            return;
        case "set_next_action":
            assertExactKeys(value, ["type", "nextAction"], label);
            if (value.nextAction !== null) {
                assertStoredEntry(value.nextAction, `${label}.nextAction`);
                if (value.nextAction.kind !== "next_action") {
                    throw new WorkingMemoryPatchError(`${label}.nextAction.kind must be next_action`);
                }
            }
            return;
        case "supersede_scope":
            assertAllowedKeys(value, ["type", "scope"], ["type", "scope", "phase", "kinds"], label);
            assertScope(value.scope, `${label}.scope`);
            if (value.phase !== undefined) assertPhase(value.phase, `${label}.phase`);
            if (value.kinds !== undefined) {
                if (!Array.isArray(value.kinds)) {
                    throw new WorkingMemoryPatchError(`${label}.kinds must be an array`);
                }
                for (const kind of value.kinds) assertOneOf(kind, MEMORY_ENTRY_KINDS, `${label}.kind`);
            }
            return;
        default:
            throw new WorkingMemoryPatchError(`${label} has unknown type`);
    }
}

function assertStatusTransition(
    existing: MemoryEntry | undefined,
    nextStatus: MemoryEntryStatus | undefined,
    label: string,
): void {
    if (existing === undefined) {
        if (nextStatus !== undefined && nextStatus !== "active") {
            throw new WorkingMemoryPatchError(`${label} cannot create an inactive entry`);
        }
        return;
    }

    if (existing.status !== "active") {
        throw new WorkingMemoryPatchError(`${label} targets an inactive entry`);
    }

    if (
        nextStatus !== undefined
        && nextStatus !== "active"
        && nextStatus !== "resolved"
        && nextStatus !== "superseded"
    ) {
        throw new WorkingMemoryPatchError(`${label}.status transition is invalid`);
    }
}

function assertProjectedCapacity(
    memory: WorkingMemory,
    operations: readonly MemoryPatchOperation[],
    limits: WorkingMemoryLimits,
): void {
    const projected = {
        findings: memory.findings.length,
        hypotheses: memory.hypotheses.length,
        plan: memory.plan.length,
        blockers: memory.blockers.length,
    };

    for (const operation of operations) {
        if (operation.type === "add_finding" && findEntry(memory, operation.finding.id) === undefined) {
            projected.findings += 1;
        }
        if (operation.type === "upsert_hypothesis") {
            const existing = findEntry(memory, operation.hypothesis.id);
            if (existing === undefined) projected.hypotheses += 1;
        }
        if (operation.type === "upsert_plan_item") {
            const existing = findEntry(memory, operation.planItem.id);
            if (existing === undefined) projected.plan += 1;
        }
        if (operation.type === "upsert_blocker") {
            const existing = findEntry(memory, operation.blocker.id);
            if (existing === undefined) projected.blockers += 1;
        }
    }

    if (projected.findings > limits.maxFindings) {
        throw new WorkingMemoryPatchError(`findings exceeds maxFindings (${limits.maxFindings})`);
    }
    if (projected.hypotheses > limits.maxHypotheses) {
        throw new WorkingMemoryPatchError(
            `hypotheses exceeds maxHypotheses (${limits.maxHypotheses})`,
        );
    }
    if (projected.plan > limits.maxPlanItems) {
        throw new WorkingMemoryPatchError(`plan exceeds maxPlanItems (${limits.maxPlanItems})`);
    }
    if (projected.blockers > limits.maxBlockers) {
        throw new WorkingMemoryPatchError(
            `blockers exceeds maxBlockers (${limits.maxBlockers})`,
        );
    }
}

/**
 * 校验限制配置并返回独立副本。
 *
 * @param input - 覆盖默认 v1 限制的配置。
 * @returns 不与调用方共享可变引用的完整限制。
 * @throws WorkingMemoryLimitsError 配置不是安全的非负/正整数时抛出。
 */
export function resolveWorkingMemoryLimits(
    input?: WorkingMemoryLimitsInput,
): WorkingMemoryLimits {
    return Object.freeze({ ...mergeLimits(input) });
}

/**
 * 校验当前 Working Memory 的结构和跨集合 stable ID 不变量。
 *
 * @param memory - 需要在归约前验证的 Memory 投影。
 * @throws WorkingMemoryPatchError 当存在控制字段、重复 ID、非法来源或损坏 revision 时抛出。
 */
export function assertValidWorkingMemory(memory: WorkingMemory): void {
    assertWorkingMemoryShape(memory);
}

/**
 * 原子校验模型提出的 Working Memory Patch。
 *
 * @remarks 函数只读输入；任一操作失败都会抛出，调用方不得应用其中部分操作。
 * Finding 的 sequence 这里只校验形状与数量，上下文归属由后续 Evidence Gate 校验。
 *
 * @param patch - 可能来自模型 JSON 的 Patch。
 * @param context - 当前 Memory 与接受限制。
 * @throws WorkingMemoryPatchError 当 schema、stable ID、状态、容量或大小不合法时抛出。
 * @example
 * ```ts
 * validateMemoryPatch({ protocolVersion: 1, operations: [] });
 * ```
 */
export function validateMemoryPatch(
    patch: unknown,
    context: WorkingMemoryPatchValidationContext = {},
): asserts patch is WorkingMemoryPatch {
    const limits = mergeLimits(context.limits);
    const memory = context.workingMemory ?? createEmptyWorkingMemory();
    assertWorkingMemoryShape(memory);
    assertPatchObject(patch, limits);

    const operationIds = new Set<string>();
    let nextActionTouched = false;
    for (const [index, operation] of patch.operations.entries()) {
        assertOperation(operation, index, limits);

        if (operation.type === "set_next_action") {
            if (nextActionTouched) {
                throw new WorkingMemoryPatchError(
                    "Patch may contain at most one set_next_action operation",
                );
            }
            nextActionTouched = true;
        }

        const id = operation.type === "set_next_action"
            ? operation.nextAction?.id
            : operation.type === "add_finding" || operation.type === "update_finding"
                ? operation.finding.id
                : operation.type === "upsert_hypothesis"
                    ? operation.hypothesis.id
                    : operation.type === "upsert_plan_item"
                        ? operation.planItem.id
                        : operation.blocker.id;

        if (id !== undefined) {
            if (operationIds.has(id)) {
                throw new WorkingMemoryPatchError("Patch contains duplicate stable ID");
            }
            operationIds.add(id);
        }

        if (operation.type === "add_finding") {
            if (findEntry(memory, operation.finding.id) !== undefined) {
                throw new WorkingMemoryPatchError("add_finding targets an existing stable ID");
            }
        } else if (operation.type === "update_finding") {
            const existing = findEntry(memory, operation.finding.id);
            if (existing === undefined || entryKind(existing) !== "finding") {
                throw new WorkingMemoryPatchError("update_finding target does not exist");
            }
            assertStatusTransition(existing, operation.finding.status, "update_finding");
        } else if (operation.type === "upsert_hypothesis") {
            const existing = findEntry(memory, operation.hypothesis.id);
            if (existing !== undefined && entryKind(existing) !== "hypothesis") {
                throw new WorkingMemoryPatchError("upsert_hypothesis target kind mismatches");
            }
            assertStatusTransition(existing, operation.hypothesis.status, "upsert_hypothesis");
        } else if (operation.type === "upsert_plan_item") {
            const existing = findEntry(memory, operation.planItem.id);
            if (existing !== undefined && entryKind(existing) !== "plan") {
                throw new WorkingMemoryPatchError("upsert_plan_item target kind mismatches");
            }
            assertStatusTransition(existing, operation.planItem.status, "upsert_plan_item");
        } else if (operation.type === "upsert_blocker") {
            const existing = findEntry(memory, operation.blocker.id);
            if (existing !== undefined && entryKind(existing) !== "blocker") {
                throw new WorkingMemoryPatchError("upsert_blocker target kind mismatches");
            }
            if (existing !== undefined && existing.scope !== operation.blocker.scope) {
                throw new WorkingMemoryPatchError("upsert_blocker cannot change scope");
            }
            assertStatusTransition(existing, operation.blocker.status, "upsert_blocker");
        } else if (operation.nextAction !== null) {
            const existing = findEntry(memory, operation.nextAction.id);
            if (existing !== undefined && entryKind(existing) !== "next_action") {
                throw new WorkingMemoryPatchError("set_next_action target kind mismatches");
            }
            assertStatusTransition(existing, operation.nextAction.status, "set_next_action");
        }
    }

    assertProjectedCapacity(memory, patch.operations, limits);
}

function cloneEvidenceSequences(value: readonly number[]): readonly number[] {
    return [...value];
}

function activeOrInactive<T extends MemoryEntry>(entry: T): T | undefined {
    return entry.status === "active" ? entry : undefined;
}

function normalizeFinding(
    input: AddFinding | UpdateFinding,
    existing: EvidenceBackedFinding | undefined,
    context: WorkingMemoryPatchNormalizationContext,
): EvidenceBackedFinding {
    const statement = input.statement ?? existing?.statement;
    const evidenceSequences = input.evidenceSequences ?? existing?.evidenceSequences;
    if (statement === undefined || evidenceSequences === undefined) {
        throw new WorkingMemoryPatchError("Finding update must provide complete content");
    }
    const status = "status" in input ? input.status : undefined;
    return {
        kind: "finding",
        id: input.id,
        originPhase: existing?.originPhase ?? context.phase,
        originSequence: context.originSequence,
        scope: "goal",
        status: status ?? existing?.status ?? "active",
        statement,
        evidenceSequences: cloneEvidenceSequences(evidenceSequences),
    };
}

function normalizeDescription(
    kind: "hypothesis" | "plan" | "blocker" | "next_action",
    input: HypothesisUpdate | PlanItemUpdate | BlockerUpdate | NextActionUpdate,
    existing: MemoryEntry | undefined,
    context: WorkingMemoryPatchNormalizationContext,
): Hypothesis | PlanItem | Blocker | NextAction {
    const description = "statement" in input ? input.statement : input.description;
    const scope = kind === "blocker"
        ? (input as BlockerUpdate).scope
        : existing?.scope ?? "phase";
    return {
        kind,
        id: input.id,
        originPhase: existing?.originPhase ?? context.phase,
        originSequence: context.originSequence,
        scope,
        status: input.status ?? existing?.status ?? "active",
        ...(kind === "hypothesis"
            ? { statement: description }
            : { description }),
    } as Hypothesis | PlanItem | Blocker | NextAction;
}

/**
 * 将已校验模型 Patch 转为带 Runtime 来源元数据的规范化操作。
 *
 * @param patch - 模型提出的 v1 Patch。
 * @param context - 阶段、accepted sequence、当前 Memory 与限制。
 * @returns 新建的规范化 Patch；不会修改输入或当前 Memory。
 * @throws WorkingMemoryPatchError 当 Patch 不能在当前 Memory 上合法应用时抛出。
 * @example
 * ```ts
 * const normalized = normalizeMemoryPatch(patch, {
 *   phase: "planning",
 *   originSequence: 8,
 *   workingMemory,
 * });
 * ```
 */
export function normalizeMemoryPatch(
    patch: unknown,
    context: WorkingMemoryPatchNormalizationContext,
): NormalizedWorkingMemoryPatch {
    const memory = context.workingMemory ?? createEmptyWorkingMemory();
    const limits = mergeLimits(context.limits);
    assertPositiveInteger(context.originSequence, "originSequence");
    assertPhase(context.phase, "phase");
    validateMemoryPatch(patch, { workingMemory: memory, limits });

    const operations: CanonicalMemoryOperation[] = [];
    for (const operation of patch.operations) {
        switch (operation.type) {
            case "add_finding":
                operations.push({
                    type: "add_finding",
                    finding: normalizeFinding(operation.finding, undefined, context),
                });
                break;
            case "update_finding": {
                const existing = findEntry(memory, operation.finding.id);
                operations.push({
                    type: "update_finding",
                    finding: normalizeFinding(
                        operation.finding,
                        existing?.kind === "finding" ? existing : undefined,
                        context,
                    ),
                });
                break;
            }
            case "upsert_hypothesis": {
                const existing = findEntry(memory, operation.hypothesis.id);
                operations.push({
                    type: "upsert_hypothesis",
                    hypothesis: normalizeDescription(
                        "hypothesis",
                        operation.hypothesis,
                        existing,
                        context,
                    ) as Hypothesis,
                });
                break;
            }
            case "upsert_plan_item": {
                const existing = findEntry(memory, operation.planItem.id);
                operations.push({
                    type: "upsert_plan_item",
                    planItem: normalizeDescription(
                        "plan",
                        operation.planItem,
                        existing,
                        context,
                    ) as PlanItem,
                });
                break;
            }
            case "upsert_blocker": {
                const existing = findEntry(memory, operation.blocker.id);
                operations.push({
                    type: "upsert_blocker",
                    blocker: normalizeDescription(
                        "blocker",
                        operation.blocker,
                        existing,
                        context,
                    ) as Blocker,
                });
                break;
            }
            case "set_next_action":
                operations.push({
                    type: "set_next_action",
                    nextAction: operation.nextAction === null
                        ? null
                        : normalizeDescription(
                            "next_action",
                            operation.nextAction,
                            findEntry(memory, operation.nextAction.id),
                            context,
                        ) as NextAction,
                });
                break;
        }
    }

    return Object.freeze({
        protocolVersion: 1,
        operations: Object.freeze(operations),
    });
}

interface MutableWorkingMemory {
    protocolVersion: 1;
    derivedThroughSequence: number;
    revision?: WorkingMemory["revision"];
    findings: EvidenceBackedFinding[];
    hypotheses: Hypothesis[];
    plan: PlanItem[];
    blockers: Blocker[];
    nextAction?: NextAction;
}

function cloneMemory(memory: WorkingMemory): MutableWorkingMemory {
    return {
        protocolVersion: 1,
        derivedThroughSequence: memory.derivedThroughSequence,
        ...(memory.revision === undefined
            ? {}
            : { revision: { ...memory.revision } }),
        findings: memory.findings.map((entry) => ({
            ...entry,
            evidenceSequences: [...entry.evidenceSequences],
        })),
        hypotheses: memory.hypotheses.map((entry) => ({ ...entry })),
        plan: memory.plan.map((entry) => ({ ...entry })),
        blockers: memory.blockers.map((entry) => ({ ...entry })),
        ...(memory.nextAction === undefined
            ? {}
            : { nextAction: { ...memory.nextAction } }),
    };
}

function removeById<T extends MemoryEntry>(entries: readonly T[], id: string): T[] {
    return entries.filter((entry) => entry.id !== id);
}

function replaceById<T extends MemoryEntry>(
    entries: readonly T[],
    entry: T,
): T[] {
    return entries.map((candidate) => candidate.id === entry.id ? entry : candidate);
}

function upsertById<T extends MemoryEntry>(
    entries: readonly T[],
    entry: T,
): T[] {
    return entries.some((candidate) => candidate.id === entry.id)
        ? replaceById(entries, entry)
        : [...entries, entry];
}

function activeEntries<T extends MemoryEntry>(entries: readonly T[]): T[] {
    return entries.filter((entry) => entry.status === "active");
}

function operationOriginSequence(operation: CanonicalMemoryOperation): number {
    switch (operation.type) {
        case "add_finding":
        case "update_finding":
            return operation.finding.originSequence;
        case "upsert_hypothesis":
            return operation.hypothesis.originSequence;
        case "upsert_plan_item":
            return operation.planItem.originSequence;
        case "upsert_blocker":
            return operation.blocker.originSequence;
        case "set_next_action":
            return operation.nextAction?.originSequence ?? 0;
        case "supersede_scope":
            return 0;
    }
}

function applyCanonicalOperation(
    memory: MutableWorkingMemory,
    operation: CanonicalMemoryOperation,
): void {
    switch (operation.type) {
        case "add_finding":
            if (findEntry(memory, operation.finding.id) !== undefined) {
                throw new WorkingMemoryPatchError("add_finding targets an existing stable ID");
            }
            memory.findings = [
                ...memory.findings,
                operation.finding,
            ];
            return;
        case "update_finding":
            if (
                findEntry(memory, operation.finding.id)?.kind !== "finding"
            ) {
                throw new WorkingMemoryPatchError("update_finding target does not exist");
            }
            memory.findings = activeOrInactive(operation.finding) === undefined
                ? removeById(memory.findings, operation.finding.id)
                : replaceById(memory.findings, operation.finding);
            return;
        case "upsert_hypothesis":
            if (
                findEntry(memory, operation.hypothesis.id) !== undefined
                && findEntry(memory, operation.hypothesis.id)?.kind !== "hypothesis"
            ) {
                throw new WorkingMemoryPatchError("upsert_hypothesis target kind mismatches");
            }
            memory.hypotheses = activeOrInactive(operation.hypothesis) === undefined
                ? removeById(memory.hypotheses, operation.hypothesis.id)
                : upsertById(memory.hypotheses, operation.hypothesis);
            return;
        case "upsert_plan_item":
            if (
                findEntry(memory, operation.planItem.id) !== undefined
                && findEntry(memory, operation.planItem.id)?.kind !== "plan"
            ) {
                throw new WorkingMemoryPatchError("upsert_plan_item target kind mismatches");
            }
            memory.plan = activeOrInactive(operation.planItem) === undefined
                ? removeById(memory.plan, operation.planItem.id)
                : upsertById(memory.plan, operation.planItem);
            return;
        case "upsert_blocker":
            if (
                findEntry(memory, operation.blocker.id) !== undefined
                && findEntry(memory, operation.blocker.id)?.kind !== "blocker"
            ) {
                throw new WorkingMemoryPatchError("upsert_blocker target kind mismatches");
            }
            memory.blockers = activeOrInactive(operation.blocker) === undefined
                ? removeById(memory.blockers, operation.blocker.id)
                : upsertById(memory.blockers, operation.blocker);
            return;
        case "set_next_action":
            if (
                operation.nextAction !== null
                && operation.nextAction.status === "active"
            ) {
                const existing = findEntry(memory, operation.nextAction.id);
                if (existing !== undefined && existing.kind !== "next_action") {
                    throw new WorkingMemoryPatchError("set_next_action target kind mismatches");
                }
                memory.nextAction = operation.nextAction;
            } else {
                delete memory.nextAction;
            }
            return;
        case "supersede_scope": {
            const matches = (entry: MemoryEntry): boolean =>
                entry.scope === operation.scope
                && (operation.phase === undefined || entry.originPhase === operation.phase)
                && (operation.kinds === undefined || operation.kinds.includes(entry.kind));
            memory.findings = memory.findings.filter((entry) => !matches(entry));
            memory.hypotheses = memory.hypotheses.filter((entry) => !matches(entry));
            memory.plan = memory.plan.filter((entry) => !matches(entry));
            memory.blockers = memory.blockers.filter((entry) => !matches(entry));
            if (memory.nextAction !== undefined && matches(memory.nextAction)) {
                delete memory.nextAction;
            }
            return;
        }
    }
}

/**
 * 对规范化操作执行确定性、无副作用的归约。
 *
 * @remarks 归约先复制输入，再按操作顺序构造新投影；状态为 resolved/superseded
 * 的条目不会继续出现在当前有效 Memory 中。原始事件仍由 Trajectory 保留。
 *
 * @param memory - 归约起点。
 * @param patch - 已规范化 Patch 或规范化操作列表。
 * @param options - 可选的提交 sequence、revision 与重放限制。
 * @returns 新的 Working Memory；输入对象和数组不会被修改。
 * @throws WorkingMemoryPatchError 当操作或结果违反 DTO 不变量时抛出。
 * @example
 * ```ts
 * const next = reduceWorkingMemory(memory, normalized);
 * ```
 */
export function reduceWorkingMemory(
    memory: WorkingMemory,
    patch: NormalizedWorkingMemoryPatch | readonly CanonicalMemoryOperation[],
    options: {
        readonly derivedThroughSequence?: number;
        readonly revision?: WorkingMemory["revision"];
        readonly limits?: WorkingMemoryLimitsInput;
    } = {},
): WorkingMemory {
    assertWorkingMemoryShape(memory);
    let operations: readonly CanonicalMemoryOperation[];
    if (Array.isArray(patch)) {
        operations = patch;
    } else if (isRecord(patch) && patch.protocolVersion === 1 && "operations" in patch) {
        if (!Array.isArray(patch.operations)) {
            throw new WorkingMemoryPatchError("normalized patch operations must be an array");
        }
        operations = patch.operations as readonly CanonicalMemoryOperation[];
    } else {
        throw new WorkingMemoryPatchError("normalized patch is invalid");
    }
    const next = cloneMemory(memory);
    const operationIds = new Set<string>();
    let nextActionTouched = false;

    for (const [index, operation] of operations.entries()) {
        assertCanonicalOperation(operation, `canonical operations[${index}]`);
        if (operation.type === "set_next_action") {
            if (nextActionTouched) {
                throw new WorkingMemoryPatchError(
                    "canonical patch may contain at most one set_next_action operation",
                );
            }
            nextActionTouched = true;
        }
        const id = operation.type === "set_next_action"
            ? operation.nextAction?.id
            : operation.type === "supersede_scope"
                ? undefined
                : operation.type === "add_finding" || operation.type === "update_finding"
                    ? operation.finding.id
                    : operation.type === "upsert_hypothesis"
                        ? operation.hypothesis.id
                        : operation.type === "upsert_plan_item"
                            ? operation.planItem.id
                            : operation.blocker.id;
        if (id !== undefined) {
            if (operationIds.has(id)) {
                throw new WorkingMemoryPatchError("canonical patch contains duplicate stable ID");
            }
            operationIds.add(id);
        }
        applyCanonicalOperation(next, operation);
    }

    const operationBoundary = operations.reduce(
        (boundary, operation) => Math.max(boundary, operationOriginSequence(operation)),
        next.derivedThroughSequence,
    );
    const derivedThroughSequence = options.derivedThroughSequence ?? operationBoundary;
    assertNonNegativeInteger(derivedThroughSequence, "derivedThroughSequence");
    if (derivedThroughSequence < memory.derivedThroughSequence) {
        throw new WorkingMemoryPatchError("derivedThroughSequence cannot move backwards");
    }
    if (
        options.revision !== undefined
        && options.revision.sequence > derivedThroughSequence
    ) {
        throw new WorkingMemoryPatchError("revision exceeds derivedThroughSequence");
    }
    next.derivedThroughSequence = derivedThroughSequence;
    if (options.revision !== undefined) {
        next.revision = { ...options.revision };
    }

    next.findings = activeEntries(next.findings);
    next.hypotheses = activeEntries(next.hypotheses);
    next.plan = activeEntries(next.plan);
    next.blockers = activeEntries(next.blockers);
    if (next.nextAction !== undefined && next.nextAction.status !== "active") {
        delete next.nextAction;
    }
    assertWorkingMemoryShape(next as unknown as WorkingMemory);

    const limits = mergeLimits(options.limits);
    if (next.findings.length > limits.maxFindings) {
        throw new WorkingMemoryPatchError("reduced findings exceed configured capacity");
    }
    if (next.hypotheses.length > limits.maxHypotheses) {
        throw new WorkingMemoryPatchError("reduced hypotheses exceed configured capacity");
    }
    if (next.plan.length > limits.maxPlanItems) {
        throw new WorkingMemoryPatchError("reduced plan exceeds configured capacity");
    }
    if (next.blockers.length > limits.maxBlockers) {
        throw new WorkingMemoryPatchError("reduced blockers exceed configured capacity");
    }

    return {
        protocolVersion: 1,
        derivedThroughSequence: next.derivedThroughSequence,
        ...(next.revision === undefined ? {} : { revision: { ...next.revision } }),
        findings: next.findings,
        hypotheses: next.hypotheses,
        plan: next.plan,
        blockers: next.blockers,
        ...(next.nextAction === undefined ? {} : { nextAction: { ...next.nextAction } }),
    };
}

/**
 * 一步完成 Patch 校验、规范化和归约。
 *
 * @param memory - 当前有效 Memory。
 * @param patch - 模型提出的 Patch。
 * @param context - 阶段、accepted sequence、可选 revision 与限制；revision 只有
 *   在调用方已经取得真实 accepted Event ID 时才应提供。
 * @returns 应用成功后的新 Memory。
 * @throws WorkingMemoryPatchError 任一校验失败时抛出，原 Memory 保持不变。
 * @example
 * ```ts
 * const next = applyMemoryPatch(memory, patch, {
 *   phase: "executing",
 *   originSequence: 12,
 * });
 * ```
 */
export function applyMemoryPatch(
    memory: WorkingMemory,
    patch: unknown,
    context: Omit<WorkingMemoryPatchNormalizationContext, "workingMemory"> & {
        readonly limits?: WorkingMemoryLimitsInput;
        readonly revision?: WorkingMemory["revision"];
    },
): WorkingMemory {
    const normalized = normalizeMemoryPatch(patch, {
        ...context,
        workingMemory: memory,
    });
    return reduceWorkingMemory(memory, normalized, {
        derivedThroughSequence: context.originSequence,
        ...(context.limits === undefined ? {} : { limits: context.limits }),
        ...(context.revision === undefined ? {} : { revision: context.revision }),
    });
}

/**
 * 创建 Runtime 生命周期用的范围失效操作。
 *
 * @remarks 该操作不属于模型 Response Schema，只有 Runtime 可以生成。
 *
 * @param scope - 要失效的条目作用域。
 * @param options - 可选的来源阶段和条目种类过滤器。
 * @returns 可与模型规范化操作合并的内部操作。
 * @example
 * ```ts
 * const operation = createSupersedeScopeOperation("phase", {
 *   phase: "gathering_context",
 * });
 * ```
 */
export function createSupersedeScopeOperation(
    scope: MemoryEntryScope,
    options: {
        readonly phase?: GoalPhase;
        readonly kinds?: readonly MemoryEntryKind[];
    } = {},
): Extract<CanonicalMemoryOperation, { readonly type: "supersede_scope" }> {
    assertScope(scope, "scope");
    if (options.phase !== undefined) assertPhase(options.phase, "phase");
    if (options.kinds !== undefined) {
        for (const kind of options.kinds) assertOneOf(kind, MEMORY_ENTRY_KINDS, "kind");
    }
    return {
        type: "supersede_scope",
        scope,
        ...(options.phase === undefined ? {} : { phase: options.phase }),
        ...(options.kinds === undefined ? {} : { kinds: [...options.kinds] }),
    };
}

/**
 * 合并模型 Patch 与 Runtime 生命周期操作，保留确定的提交顺序。
 *
 * @remarks 当前实现要求不同来源不要重复修改同一 stable ID；冲突必须由调用方
 * 在业务分支中先决定，而不是让 Reducer 隐式覆盖。
 *
 * @param modelPatch - 已规范化的模型操作，可省略。
 * @param lifecycleOperations - Runtime 生成的范围失效或其他规范化操作。
 * @returns 新的规范化 Patch。
 * @throws WorkingMemoryPatchError 当输入协议版本不一致时抛出。
 * @example
 * ```ts
 * const merged = mergeNormalizedMemoryPatches(modelPatch, [lifecycleOperation]);
 * ```
 */
export function mergeNormalizedMemoryPatches(
    modelPatch: NormalizedWorkingMemoryPatch | undefined,
    lifecycleOperations: readonly CanonicalMemoryOperation[] = [],
): NormalizedWorkingMemoryPatch {
    if (modelPatch !== undefined && modelPatch.protocolVersion !== 1) {
        throw new WorkingMemoryPatchError("normalized patch protocolVersion must be 1");
    }
    return Object.freeze({
        protocolVersion: 1,
        operations: Object.freeze([
            ...(modelPatch?.operations ?? []),
            ...lifecycleOperations,
        ]),
    });
}
