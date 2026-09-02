import { createHash } from "node:crypto";

import type {
    Blocker,
    CanonicalMemoryOperation,
    EvidenceBackedFact,
    FactProposal,
    GoalPhase,
    Hypothesis,
    JsonObject,
    JsonValue,
    MemoryEntry,
    MemoryEntryKind,
    MemoryEntryScope,
    MemoryEntrySource,
    MemoryEntryStatus,
    MemoryPatchOperation,
    PlanItem,
    PlanItemStatus,
    WorkingMemory,
    WorkingMemoryPatch,
} from "./domain";
import { createEmptyWorkingMemory } from "./domain";

/** Working Memory Patch 校验失败的稳定错误码。 */
export const WORKING_MEMORY_PATCH_ERROR_CODE = "INVALID_MEMORY_PATCH" as const;

/** Working Memory Core 限制配置错误的稳定错误码。 */
export const WORKING_MEMORY_LIMITS_ERROR_CODE = "INVALID_MEMORY_LIMITS" as const;

/** 被 Runtime 抑制且不会进入 accepted Event 的稳定原因。 */
export type MemorySuppressionReason =
    | "duplicate"
    | "stale_evidence"
    | "covered_update"
    | "capacity_low_utility";

/**
 * Working Memory Patch 与当前投影使用的确定性资源限制。
 *
 * @remarks
 * 限制只在接受新 proposal 时计算；重放 accepted Event 时直接应用其中的
 * `evict_entries`，因此恢复结果不依赖进程当前配置。
 *
 * @example
 * ```ts
 * const limits: WorkingMemoryLimits = {
 *   ...DEFAULT_WORKING_MEMORY_LIMITS,
 *   maxFacts: 32,
 * };
 * ```
 */
export interface WorkingMemoryLimits {
    /** 单个 proposal Patch 最多包含的操作数。 */
    readonly maxOperations: number;
    /** proposal Patch JSON 的最大 UTF-8 字节数。 */
    readonly maxSerializedBytes: number;
    /** 当前 Working Memory 投影的最大 UTF-8 字节数。 */
    readonly maxWorkingMemoryBytes: number;
    /** 单个 Fact JSON 的最大 UTF-8 字节数。 */
    readonly maxFactSerializedBytes: number;
    /** Fact value 允许的最大 JSON 深度。 */
    readonly maxJsonDepth: number;
    /** Runtime 生成或模型引用 ID 的最大长度。 */
    readonly maxStableIdLength: number;
    /** 人类可读字段的最大长度。 */
    readonly maxTextLength: number;
    /** 单个操作最多引用的 evidence sequences。 */
    readonly maxEvidenceReferences: number;
    /** 当前 Fact 数量上限。 */
    readonly maxFacts: number;
    /** 当前 Hypothesis 数量上限。 */
    readonly maxHypotheses: number;
    /** 当前 PlanItem 数量上限。 */
    readonly maxPlanItems: number;
    /** 当前 Blocker 数量上限。 */
    readonly maxBlockers: number;
}

/** v1 结构化 Working Memory 的默认限制。 */
export const DEFAULT_WORKING_MEMORY_LIMITS: WorkingMemoryLimits = Object.freeze({
    maxOperations: 32,
    maxSerializedBytes: 32 * 1024,
    maxWorkingMemoryBytes: 32 * 1024,
    maxFactSerializedBytes: 4 * 1024,
    maxJsonDepth: 6,
    maxStableIdLength: 128,
    maxTextLength: 2048,
    maxEvidenceReferences: 16,
    maxFacts: 64,
    maxHypotheses: 8,
    maxPlanItems: 16,
    maxBlockers: 8,
});

/** 允许调用方覆盖部分默认限制。 */
export type WorkingMemoryLimitsInput =
    | WorkingMemoryLimits
    | Partial<WorkingMemoryLimits>;

/**
 * Patch 结构校验所需的当前投影上下文。
 *
 * @example
 * ```ts
 * validateMemoryPatch(patch, { workingMemory });
 * ```
 */
export interface WorkingMemoryPatchValidationContext {
    /** 当前 committed Working Memory；省略时按空投影处理。 */
    readonly workingMemory?: WorkingMemory;
    /** 本次准入限制；省略时使用默认值。 */
    readonly limits?: WorkingMemoryLimitsInput;
}

/**
 * 将 proposal 归一化成 canonical Patch 的上下文。
 *
 * @remarks
 * `originSequence` 是即将写入的 accepted Patch Event sequence。`source` 决定同一
 * evidence sequence 冲突时的优先级，但不能绕过 schema、引用或控制字段门。
 *
 * @example
 * ```ts
 * const context: WorkingMemoryPatchNormalizationContext = {
 *   phase: "executing",
 *   originSequence: 17,
 *   source: "model",
 *   workingMemory,
 * };
 * ```
 */
export interface WorkingMemoryPatchNormalizationContext
    extends WorkingMemoryPatchValidationContext {
    /** proposal 产生时的 Goal phase。 */
    readonly phase: GoalPhase;
    /** accepted Patch Event 的预分配 sequence。 */
    readonly originSequence: number;
    /** proposal 来源；模型调用省略时默认为 `model`。 */
    readonly source?: MemoryEntrySource;
}

/**
 * 被抑制 proposal 的可诊断结果。
 *
 * @example
 * ```ts
 * const item: SuppressedMemoryOperation = { index: 0, reason: "duplicate" };
 * ```
 */
export interface SuppressedMemoryOperation {
    /** 原 proposal operation index。 */
    readonly index: number;
    /** 不落 accepted Event 的稳定原因。 */
    readonly reason: MemorySuppressionReason;
}

/**
 * 可写入 `memory_patch_accepted` 的 canonical Patch。
 *
 * @remarks
 * `operations` 为空表示 proposal 全部被抑制，调用方不得写 accepted Event。
 * `suppressed` 只用于当前调用诊断，不参与 reducer 重放。
 *
 * @example
 * ```ts
 * const normalized = normalizeMemoryPatch(patch, {
 *   phase: "executing",
 *   originSequence: 8,
 * });
 * ```
 */
export interface NormalizedWorkingMemoryPatch {
    readonly protocolVersion: 1;
    readonly operations: readonly CanonicalMemoryOperation[];
    readonly suppressed: readonly SuppressedMemoryOperation[];
}

/** 表示 proposal 违反原子准入契约。 */
export class WorkingMemoryPatchError extends Error {
    readonly code = WORKING_MEMORY_PATCH_ERROR_CODE;

    /** @param message - 不包含模型原文的稳定诊断信息。 */
    constructor(message: string) {
        super(`${WORKING_MEMORY_PATCH_ERROR_CODE}: ${message}`);
        this.name = "WorkingMemoryPatchError";
    }
}

/** 表示注入的资源限制无效。 */
export class WorkingMemoryLimitsError extends Error {
    readonly code = WORKING_MEMORY_LIMITS_ERROR_CODE;

    /** @param message - 限制配置诊断信息。 */
    constructor(message: string) {
        super(`${WORKING_MEMORY_LIMITS_ERROR_CODE}: ${message}`);
        this.name = "WorkingMemoryLimitsError";
    }
}

type RecordValue = Record<string, unknown>;

const MEMORY_ENTRY_KINDS: readonly MemoryEntryKind[] = [
    "fact",
    "hypothesis",
    "plan",
    "blocker",
];
const MEMORY_ENTRY_SCOPES: readonly MemoryEntryScope[] = ["goal", "phase"];
const MEMORY_ENTRY_STATUSES: readonly MemoryEntryStatus[] = [
    "active",
    "resolved",
    "superseded",
];
const PLAN_ITEM_STATUSES: readonly PlanItemStatus[] = [
    "pending",
    "active",
    "completed",
    "blocked",
    "superseded",
];
const FACT_STABILITIES = ["stable", "last_observed"] as const;
const GOAL_PHASES: readonly GoalPhase[] = [
    "gathering_context",
    "planning",
    "executing",
];
const CONTROL_STATE_TERMS = new Set([
    "checkpoint",
    "run_status",
    "runstatus",
    "step",
    "step_count",
    "pending_action",
    "pendingaction",
    "previous_step",
    "previousstep",
    "done",
    "won",
]);

function isRecord(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
    value: unknown,
    keys: readonly string[],
    label: string,
): asserts value is RecordValue {
    if (!isRecord(value)) throw new WorkingMemoryPatchError(`${label} must be an object`);
    const expected = new Set(keys);
    const actual = Object.keys(value);
    if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
        throw new WorkingMemoryPatchError(`${label} contains unknown or missing fields`);
    }
}

function assertAllowedKeys(
    value: unknown,
    required: readonly string[],
    allowed: readonly string[],
    label: string,
): asserts value is RecordValue {
    if (!isRecord(value)) throw new WorkingMemoryPatchError(`${label} must be an object`);
    const allowedSet = new Set(allowed);
    if (Object.keys(value).some((key) => !allowedSet.has(key))) {
        throw new WorkingMemoryPatchError(`${label} contains unknown fields`);
    }
    for (const key of required) {
        if (!(key in value)) throw new WorkingMemoryPatchError(`${label} is missing ${key}`);
    }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new WorkingMemoryPatchError(`${label} must be a non-empty string`);
    }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
        throw new WorkingMemoryPatchError(`${label} must be a positive integer`);
    }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
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

function serializedByteLength(value: unknown): number {
    const serialized = JSON.stringify(value);
    return serialized === undefined
        ? Number.POSITIVE_INFINITY
        : new TextEncoder().encode(serialized).byteLength;
}

function jsonDepth(value: JsonValue): number {
    if (value === null || typeof value !== "object") return 0;
    if (Array.isArray(value)) {
        return 1 + value.reduce<number>((depth, item) => Math.max(depth, jsonDepth(item)), 0);
    }
    return 1 + Object.values(value).reduce<number>(
        (depth, item) => Math.max(depth, jsonDepth(item)),
        0,
    );
}

function normalizeText(value: string): string {
    return value.normalize("NFC").trim();
}

function canonicalizeJson(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(canonicalizeJson);
    if (value !== null && typeof value === "object") {
        const normalized: Record<string, JsonValue> = {};
        for (const key of Object.keys(value).sort()) {
            normalized[key] = canonicalizeJson((value as JsonObject)[key] as JsonValue);
        }
        return normalized;
    }
    return value;
}

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
    return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));
}

function assertJsonValue(value: unknown, label: string, depth = 0): asserts value is JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new WorkingMemoryPatchError(`${label} must be finite JSON`);
        return;
    }
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            assertJsonValue(value[index], `${label}[${index}]`, depth + 1);
        }
        return;
    }
    if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) {
            if (key.length === 0) throw new WorkingMemoryPatchError(`${label} has an empty key`);
            assertJsonValue(item, `${label}.${key}`, depth + 1);
        }
        return;
    }
    throw new WorkingMemoryPatchError(`${label} must be JSON-serializable`);
}

function assertLimit(value: unknown, label: string, positive = false): asserts value is number {
    if (
        typeof value !== "number"
        || !Number.isSafeInteger(value)
        || (positive ? value <= 0 : value < 0)
    ) {
        throw new WorkingMemoryLimitsError(
            `${label} must be a ${positive ? "positive" : "non-negative"} safe integer`,
        );
    }
}

/** 解析并冻结本次准入使用的完整限制。 */
export function resolveWorkingMemoryLimits(
    input?: WorkingMemoryLimitsInput,
): WorkingMemoryLimits {
    if (input !== undefined && !isRecord(input)) {
        throw new WorkingMemoryLimitsError("limits must be an object");
    }
    const limits = { ...DEFAULT_WORKING_MEMORY_LIMITS, ...(input ?? {}) };
    assertLimit(limits.maxOperations, "maxOperations");
    assertLimit(limits.maxSerializedBytes, "maxSerializedBytes", true);
    assertLimit(limits.maxWorkingMemoryBytes, "maxWorkingMemoryBytes", true);
    assertLimit(limits.maxFactSerializedBytes, "maxFactSerializedBytes", true);
    assertLimit(limits.maxJsonDepth, "maxJsonDepth");
    assertLimit(limits.maxStableIdLength, "maxStableIdLength", true);
    assertLimit(limits.maxTextLength, "maxTextLength", true);
    assertLimit(limits.maxEvidenceReferences, "maxEvidenceReferences");
    assertLimit(limits.maxFacts, "maxFacts");
    assertLimit(limits.maxHypotheses, "maxHypotheses");
    assertLimit(limits.maxPlanItems, "maxPlanItems");
    assertLimit(limits.maxBlockers, "maxBlockers");
    return Object.freeze(limits);
}

function assertText(value: unknown, label: string, limits: WorkingMemoryLimits): asserts value is string {
    assertNonEmptyString(value, label);
    if (value.length > limits.maxTextLength) {
        throw new WorkingMemoryPatchError(`${label} exceeds maxTextLength (${limits.maxTextLength})`);
    }
}

function assertId(value: unknown, label: string, limits: WorkingMemoryLimits): asserts value is string {
    assertNonEmptyString(value, label);
    if (value.length > limits.maxStableIdLength) {
        throw new WorkingMemoryPatchError(`${label} exceeds maxStableIdLength (${limits.maxStableIdLength})`);
    }
}

function assertStringIds(
    value: unknown,
    label: string,
    limits: WorkingMemoryLimits,
): asserts value is readonly string[] {
    if (!Array.isArray(value)) throw new WorkingMemoryPatchError(`${label} must be an array`);
    const seen = new Set<string>();
    for (const id of value) {
        assertId(id, `${label} item`, limits);
        if (seen.has(id)) throw new WorkingMemoryPatchError(`${label} contains duplicate ID`);
        seen.add(id);
    }
}

function assertEvidence(
    value: unknown,
    label: string,
    limits: WorkingMemoryLimits,
    allowEmpty = false,
): asserts value is readonly number[] {
    if (!Array.isArray(value)) throw new WorkingMemoryPatchError(`${label} must be an array`);
    if (!allowEmpty && value.length === 0) {
        throw new WorkingMemoryPatchError(`${label} must not be empty`);
    }
    if (value.length > limits.maxEvidenceReferences) {
        throw new WorkingMemoryPatchError(
            `${label} exceeds maxEvidenceReferences (${limits.maxEvidenceReferences})`,
        );
    }
    const seen = new Set<number>();
    for (const sequence of value) {
        assertPositiveInteger(sequence, `${label} sequence`);
        if (seen.has(sequence)) throw new WorkingMemoryPatchError(`${label} contains duplicate sequence`);
        seen.add(sequence);
    }
}

function assertFactProposal(
    value: unknown,
    label: string,
    limits: WorkingMemoryLimits,
): asserts value is FactProposal {
    assertAllowedKeys(
        value,
        ["subject", "predicate", "value", "stability", "evidenceSequences"],
        ["subject", "predicate", "value", "stability", "evidenceSequences", "scope"],
        label,
    );
    assertText(value.subject, `${label}.subject`, limits);
    assertText(value.predicate, `${label}.predicate`, limits);
    assertJsonValue(value.value, `${label}.value`);
    if (jsonDepth(value.value) > limits.maxJsonDepth) {
        throw new WorkingMemoryPatchError(`${label}.value exceeds maxJsonDepth (${limits.maxJsonDepth})`);
    }
    assertOneOf(value.stability, FACT_STABILITIES, `${label}.stability`);
    assertEvidence(value.evidenceSequences, `${label}.evidenceSequences`, limits);
    if (value.scope !== undefined) assertOneOf(value.scope, MEMORY_ENTRY_SCOPES, `${label}.scope`);
    if (serializedByteLength(value) > limits.maxFactSerializedBytes) {
        throw new WorkingMemoryPatchError(
            `${label} exceeds maxFactSerializedBytes (${limits.maxFactSerializedBytes})`,
        );
    }
    const controlKey = `${normalizeText(value.subject)} ${normalizeText(value.predicate)}`
        .toLowerCase()
        .replace(/[\s.-]+/g, "_");
    if ([...CONTROL_STATE_TERMS].some((term) => controlKey.split("_").includes(term) || controlKey.includes(term))) {
        throw new WorkingMemoryPatchError(`${label} attempts to store Runtime control state`);
    }
}

function assertOperation(
    value: unknown,
    index: number,
    limits: WorkingMemoryLimits,
): asserts value is MemoryPatchOperation {
    const label = `operations[${index}]`;
    if (!isRecord(value) || typeof value.type !== "string") {
        throw new WorkingMemoryPatchError(`${label} must have a type`);
    }
    switch (value.type) {
        case "upsert_fact":
            assertExactKeys(value, ["type", "fact"], label);
            assertFactProposal(value.fact, `${label}.fact`, limits);
            return;
        case "retire_fact":
            assertExactKeys(value, ["type", "fact"], label);
            assertExactKeys(value.fact, ["id", "evidenceSequences"], `${label}.fact`);
            assertId(value.fact.id, `${label}.fact.id`, limits);
            assertEvidence(value.fact.evidenceSequences, `${label}.fact.evidenceSequences`, limits);
            return;
        case "create_hypothesis":
            assertExactKeys(value, ["type", "hypothesis"], label);
            assertAllowedKeys(value.hypothesis, ["statement"], ["statement", "scope"], `${label}.hypothesis`);
            assertText(value.hypothesis.statement, `${label}.hypothesis.statement`, limits);
            if (value.hypothesis.scope !== undefined) {
                assertOneOf(value.hypothesis.scope, MEMORY_ENTRY_SCOPES, `${label}.hypothesis.scope`);
            }
            return;
        case "update_hypothesis":
            assertExactKeys(value, ["type", "hypothesis"], label);
            assertAllowedKeys(value.hypothesis, ["id"], ["id", "statement", "status"], `${label}.hypothesis`);
            assertId(value.hypothesis.id, `${label}.hypothesis.id`, limits);
            if (value.hypothesis.statement !== undefined) {
                assertText(value.hypothesis.statement, `${label}.hypothesis.statement`, limits);
            }
            if (value.hypothesis.status !== undefined) {
                assertOneOf(value.hypothesis.status, MEMORY_ENTRY_STATUSES, `${label}.hypothesis.status`);
            }
            if (value.hypothesis.statement === undefined && value.hypothesis.status === undefined) {
                throw new WorkingMemoryPatchError(`${label}.hypothesis must change a field`);
            }
            return;
        case "create_plan_item":
            assertExactKeys(value, ["type", "planItem"], label);
            assertAllowedKeys(
                value.planItem,
                ["description"],
                ["description", "status", "dependsOnFactIds", "dependsOnPlanItemIds"],
                `${label}.planItem`,
            );
            assertText(value.planItem.description, `${label}.planItem.description`, limits);
            if (value.planItem.status !== undefined) {
                assertOneOf(value.planItem.status, ["pending", "active", "blocked"] as const, `${label}.planItem.status`);
            }
            if (value.planItem.dependsOnFactIds !== undefined) {
                assertStringIds(value.planItem.dependsOnFactIds, `${label}.planItem.dependsOnFactIds`, limits);
            }
            if (value.planItem.dependsOnPlanItemIds !== undefined) {
                assertStringIds(value.planItem.dependsOnPlanItemIds, `${label}.planItem.dependsOnPlanItemIds`, limits);
            }
            return;
        case "update_plan_item":
            assertExactKeys(value, ["type", "planItem"], label);
            assertAllowedKeys(
                value.planItem,
                ["id"],
                [
                    "id",
                    "description",
                    "status",
                    "dependsOnFactIds",
                    "dependsOnPlanItemIds",
                    "completionEvidenceSequences",
                ],
                `${label}.planItem`,
            );
            assertId(value.planItem.id, `${label}.planItem.id`, limits);
            if (value.planItem.description !== undefined) {
                assertText(value.planItem.description, `${label}.planItem.description`, limits);
            }
            if (value.planItem.status !== undefined) {
                assertOneOf(value.planItem.status, PLAN_ITEM_STATUSES, `${label}.planItem.status`);
            }
            if (value.planItem.dependsOnFactIds !== undefined) {
                assertStringIds(value.planItem.dependsOnFactIds, `${label}.planItem.dependsOnFactIds`, limits);
            }
            if (value.planItem.dependsOnPlanItemIds !== undefined) {
                assertStringIds(value.planItem.dependsOnPlanItemIds, `${label}.planItem.dependsOnPlanItemIds`, limits);
            }
            if (value.planItem.completionEvidenceSequences !== undefined) {
                assertEvidence(
                    value.planItem.completionEvidenceSequences,
                    `${label}.planItem.completionEvidenceSequences`,
                    limits,
                    true,
                );
            }
            if (Object.keys(value.planItem).length === 1) {
                throw new WorkingMemoryPatchError(`${label}.planItem must change a field`);
            }
            return;
        case "create_blocker":
            assertExactKeys(value, ["type", "blocker"], label);
            assertAllowedKeys(value.blocker, ["description"], ["description", "scope"], `${label}.blocker`);
            assertText(value.blocker.description, `${label}.blocker.description`, limits);
            if (value.blocker.scope !== undefined) {
                assertOneOf(value.blocker.scope, MEMORY_ENTRY_SCOPES, `${label}.blocker.scope`);
            }
            return;
        case "update_blocker":
            assertExactKeys(value, ["type", "blocker"], label);
            assertAllowedKeys(value.blocker, ["id"], ["id", "description", "status"], `${label}.blocker`);
            assertId(value.blocker.id, `${label}.blocker.id`, limits);
            if (value.blocker.description !== undefined) {
                assertText(value.blocker.description, `${label}.blocker.description`, limits);
            }
            if (value.blocker.status !== undefined) {
                assertOneOf(value.blocker.status, MEMORY_ENTRY_STATUSES, `${label}.blocker.status`);
            }
            if (value.blocker.description === undefined && value.blocker.status === undefined) {
                throw new WorkingMemoryPatchError(`${label}.blocker must change a field`);
            }
            return;
        default:
            throw new WorkingMemoryPatchError(`${label} has unknown type`);
    }
}

function assertPatch(
    patch: unknown,
    limits: WorkingMemoryLimits,
): asserts patch is WorkingMemoryPatch {
    assertExactKeys(patch, ["protocolVersion", "operations"], "memoryPatch");
    if (patch.protocolVersion !== 1) {
        throw new WorkingMemoryPatchError("memoryPatch.protocolVersion must be 1");
    }
    if (!Array.isArray(patch.operations)) {
        throw new WorkingMemoryPatchError("memoryPatch.operations must be an array");
    }
    if (patch.operations.length > limits.maxOperations) {
        throw new WorkingMemoryPatchError(`operations exceeds maxOperations (${limits.maxOperations})`);
    }
    if (serializedByteLength(patch) > limits.maxSerializedBytes) {
        throw new WorkingMemoryPatchError(`memoryPatch exceeds maxSerializedBytes (${limits.maxSerializedBytes})`);
    }
    patch.operations.forEach((operation, index) => assertOperation(operation, index, limits));
}

function allEntries(memory: WorkingMemory): MemoryEntry[] {
    return [...memory.facts, ...memory.hypotheses, ...memory.plan, ...memory.blockers];
}

function assertBase(entry: MemoryEntry, memory: WorkingMemory): void {
    assertNonEmptyString(entry.id, "workingMemory entry.id");
    assertOneOf(entry.originPhase, GOAL_PHASES, "workingMemory entry.originPhase");
    assertPositiveInteger(entry.originSequence, "workingMemory entry.originSequence");
    assertPositiveInteger(entry.updatedAtSequence, "workingMemory entry.updatedAtSequence");
    assertOneOf(entry.scope, MEMORY_ENTRY_SCOPES, "workingMemory entry.scope");
    if (entry.originSequence > entry.updatedAtSequence) {
        throw new WorkingMemoryPatchError("entry origin exceeds updated sequence");
    }
    if (entry.updatedAtSequence > memory.derivedThroughSequence) {
        throw new WorkingMemoryPatchError("entry exceeds derivedThroughSequence");
    }
}

/** 校验当前 Working Memory 投影的结构与跨条目引用。 */
export function assertValidWorkingMemory(memory: WorkingMemory): void {
    if (!isRecord(memory)) throw new WorkingMemoryPatchError("workingMemory must be an object");
    assertAllowedKeys(
        memory,
        ["protocolVersion", "derivedThroughSequence", "facts", "hypotheses", "plan", "blockers"],
        ["protocolVersion", "derivedThroughSequence", "revision", "facts", "hypotheses", "plan", "blockers"],
        "workingMemory",
    );
    if (memory.protocolVersion !== 1) throw new WorkingMemoryPatchError("workingMemory.protocolVersion must be 1");
    assertNonNegativeInteger(memory.derivedThroughSequence, "workingMemory.derivedThroughSequence");
    if (!Array.isArray(memory.facts) || !Array.isArray(memory.hypotheses) || !Array.isArray(memory.plan) || !Array.isArray(memory.blockers)) {
        throw new WorkingMemoryPatchError("workingMemory collections must be arrays");
    }
    if (memory.revision !== undefined) {
        assertExactKeys(memory.revision, ["eventId", "sequence"], "workingMemory.revision");
        assertNonEmptyString(memory.revision.eventId, "workingMemory.revision.eventId");
        assertNonNegativeInteger(memory.revision.sequence, "workingMemory.revision.sequence");
        if (memory.revision.sequence > memory.derivedThroughSequence) {
            throw new WorkingMemoryPatchError("workingMemory revision exceeds derived boundary");
        }
    }
    const ids = new Set<string>();
    for (const entry of allEntries(memory)) {
        assertBase(entry, memory);
        if (ids.has(entry.id)) throw new WorkingMemoryPatchError("workingMemory contains duplicate ID");
        ids.add(entry.id);
        if (entry.kind === "fact") {
            if (entry.id !== createCanonicalFactId(entry.subject, entry.predicate)) {
                throw new WorkingMemoryPatchError("Fact ID does not match canonical identity");
            }
            assertJsonValue(entry.value, "workingMemory fact.value");
            assertOneOf(entry.stability, FACT_STABILITIES, "workingMemory fact.stability");
            assertEvidence(entry.evidenceSequences, "workingMemory fact.evidenceSequences", DEFAULT_WORKING_MEMORY_LIMITS);
            assertPositiveInteger(entry.reinforcementCount, "workingMemory fact.reinforcementCount");
            if (entry.lastEvidenceSequence !== Math.max(...entry.evidenceSequences)) {
                throw new WorkingMemoryPatchError("Fact lastEvidenceSequence is inconsistent");
            }
        } else if (entry.kind === "plan") {
            assertOneOf(entry.status, PLAN_ITEM_STATUSES, "workingMemory plan.status");
            if (entry.dependsOnFactIds.some((id) => !memory.facts.some((fact) => fact.id === id))) {
                throw new WorkingMemoryPatchError("Plan references a missing Fact");
            }
            if (entry.dependsOnPlanItemIds.some((id) => !memory.plan.some((item) => item.id === id))) {
                throw new WorkingMemoryPatchError("Plan references a missing PlanItem");
            }
            if (entry.status === "completed" && entry.completionEvidenceSequences.length === 0) {
                throw new WorkingMemoryPatchError("completed PlanItem requires evidence");
            }
        } else {
            assertOneOf(entry.status, MEMORY_ENTRY_STATUSES, `workingMemory ${entry.kind}.status`);
        }
    }
}

/** 仅执行 proposal schema 与当前投影结构校验，不产生 canonical operations。 */
export function validateMemoryPatch(
    patch: unknown,
    context: WorkingMemoryPatchValidationContext = {},
): asserts patch is WorkingMemoryPatch {
    const limits = resolveWorkingMemoryLimits(context.limits);
    if (context.workingMemory !== undefined) assertValidWorkingMemory(context.workingMemory);
    assertPatch(patch, limits);
}

/**
 * 在 canonicalize 前校验模型 Patch 的阶段准入策略。
 *
 * @remarks
 * 本函数只读取 Patch、阶段和当前 Working Memory，不产生 canonical operation，也不
 * 修改调用方对象。它同时执行基础 Patch schema 校验，随后按原始操作类型执行唯一的
 * 阶段策略：gathering_context 禁止所有 PlanItem 操作，planning 允许创建或更新已有
 * PlanItem，executing 只允许更新当前投影中已有的 PlanItem。任一操作不满足策略时，
 * 整个 Patch 都会被拒绝；Runtime lifecycle 的 canonical `supersede_scope` 不经过本入口。
 *
 * @param patch - 尚未 canonicalize 的结构化 Patch。
 * @param phase - 产生 Patch 的 Goal 阶段。
 * @param context - 当前 Working Memory 与可选 schema 限制。
 * @throws WorkingMemoryPatchError 当 Patch schema、当前条目引用或阶段准入非法时。
 * @example
 * ```ts
 * validateMemoryPatchPhase(patch, "executing", { workingMemory });
 * ```
 */
export function validateMemoryPatchPhase(
    patch: unknown,
    phase: GoalPhase,
    context: WorkingMemoryPatchValidationContext = {},
): asserts patch is WorkingMemoryPatch {
    assertOneOf(phase, GOAL_PHASES, "phase");
    validateMemoryPatch(patch, context);
    const workingMemory = context.workingMemory ?? createEmptyWorkingMemory();
    const planOperations = patch.operations.filter(
        (operation): operation is Extract<MemoryPatchOperation, { readonly type: "create_plan_item" | "update_plan_item" }> =>
            operation.type === "create_plan_item" || operation.type === "update_plan_item",
    );

    if (phase === "gathering_context" && planOperations.length > 0) {
        throw new WorkingMemoryPatchError(
            "gathering_context does not allow PlanItem operations",
        );
    }

    for (const operation of planOperations) {
        if (operation.type === "create_plan_item") {
            if (phase === "executing") {
                throw new WorkingMemoryPatchError(
                    "executing does not allow create_plan_item",
                );
            }
            continue;
        }
        if (!workingMemory.plan.some((item) => item.id === operation.planItem.id)) {
            throw new WorkingMemoryPatchError(
                `${operation.type}.id does not reference an existing PlanItem`,
            );
        }
    }
}

/** 根据规范化 `{subject, predicate}` 生成稳定 Fact ID。 */
export function createCanonicalFactId(subject: string, predicate: string): string {
    const identity = `${normalizeText(subject)}\u0000${normalizeText(predicate)}`;
    return `fact:${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function runtimeId(kind: "hypothesis" | "plan" | "blocker", sequence: number, index: number): string {
    return `${kind}:${sequence}:${index}`;
}

function sortedEvidence(evidence: readonly number[]): number[] {
    return [...new Set(evidence)].sort((left, right) => left - right);
}

function sourcePriority(source: MemoryEntrySource): number {
    if (source === "tool_projector") return 3;
    if (source === "model") return 2;
    return 1;
}

function findEntry(memory: WorkingMemory, id: string): MemoryEntry | undefined {
    return allEntries(memory).find((entry) => entry.id === id);
}

function assertActiveReference<T extends MemoryEntry["kind"]>(
    memory: WorkingMemory,
    id: string,
    kind: T,
    label: string,
): Extract<MemoryEntry, { kind: T }> {
    const entry = findEntry(memory, id);
    if (entry === undefined || entry.kind !== kind) {
        throw new WorkingMemoryPatchError(`${label} does not reference a current ${kind}`);
    }
    return entry as Extract<MemoryEntry, { kind: T }>;
}

function assertLifecycleTransition(
    current: MemoryEntryStatus,
    next: MemoryEntryStatus,
    label: string,
): void {
    if (current !== "active") throw new WorkingMemoryPatchError(`${label} is terminal`);
    if (next === "active") return;
    if (next !== "resolved" && next !== "superseded") {
        throw new WorkingMemoryPatchError(`${label} transition is invalid`);
    }
}

function assertPlanTransition(current: PlanItemStatus, next: PlanItemStatus): void {
    const allowed: Record<PlanItemStatus, readonly PlanItemStatus[]> = {
        pending: ["pending", "active", "blocked", "superseded"],
        active: ["active", "blocked", "completed", "superseded"],
        blocked: ["blocked", "active", "completed", "superseded"],
        completed: [],
        superseded: [],
    };
    if (!allowed[current].includes(next)) {
        throw new WorkingMemoryPatchError(`PlanItem transition ${current} -> ${next} is invalid`);
    }
}

function applyOne(memory: WorkingMemory, operation: CanonicalMemoryOperation): WorkingMemory {
    const remove = (ids: ReadonlySet<string>): WorkingMemory => ({
        ...memory,
        facts: memory.facts.filter((entry) => !ids.has(entry.id)),
        hypotheses: memory.hypotheses.filter((entry) => !ids.has(entry.id)),
        plan: memory.plan.filter((entry) => !ids.has(entry.id)),
        blockers: memory.blockers.filter((entry) => !ids.has(entry.id)),
    });
    switch (operation.type) {
        case "upsert_fact":
            return {
                ...memory,
                facts: [...memory.facts.filter((entry) => entry.id !== operation.fact.id), operation.fact],
            };
        case "retire_fact":
            return { ...memory, facts: memory.facts.filter((entry) => entry.id !== operation.factId) };
        case "upsert_hypothesis":
            return operation.hypothesis.status === "active"
                ? {
                    ...memory,
                    hypotheses: [
                        ...memory.hypotheses.filter((entry) => entry.id !== operation.hypothesis.id),
                        operation.hypothesis,
                    ],
                }
                : remove(new Set([operation.hypothesis.id]));
        case "upsert_plan_item":
            return operation.planItem.status === "completed" || operation.planItem.status === "superseded"
                ? remove(new Set([operation.planItem.id]))
                : {
                    ...memory,
                    plan: [...memory.plan.filter((entry) => entry.id !== operation.planItem.id), operation.planItem],
                };
        case "upsert_blocker":
            return operation.blocker.status === "active"
                ? {
                    ...memory,
                    blockers: [...memory.blockers.filter((entry) => entry.id !== operation.blocker.id), operation.blocker],
                }
                : remove(new Set([operation.blocker.id]));
        case "evict_entries":
            return remove(new Set(operation.entryIds));
        case "supersede_scope": {
            const ids = new Set(
                allEntries(memory)
                    .filter((entry) => entry.scope === operation.scope)
                    .filter((entry) => operation.phase === undefined || entry.originPhase === operation.phase)
                    .filter((entry) => operation.kinds === undefined || operation.kinds.includes(entry.kind))
                    .map((entry) => entry.id),
            );
            return remove(ids);
        }
    }
}

function withoutDerivedMetadata(memory: WorkingMemory): WorkingMemory {
    return {
        ...memory,
        facts: [...memory.facts],
        hypotheses: [...memory.hypotheses],
        plan: [...memory.plan],
        blockers: [...memory.blockers],
    };
}

function canonicalizeOperation(
    operation: MemoryPatchOperation,
    index: number,
    context: Required<Pick<WorkingMemoryPatchNormalizationContext, "phase" | "originSequence">> & {
        source: MemoryEntrySource;
    },
    memory: WorkingMemory,
): { operation?: CanonicalMemoryOperation; suppression?: MemorySuppressionReason } {
    const updatedAtSequence = context.originSequence;
    switch (operation.type) {
        case "upsert_fact": {
            const subject = normalizeText(operation.fact.subject);
            const predicate = normalizeText(operation.fact.predicate);
            const id = createCanonicalFactId(subject, predicate);
            const existing = memory.facts.find((fact) => fact.id === id);
            const evidence = sortedEvidence(operation.fact.evidenceSequences);
            const latest = Math.max(...evidence);
            const value = canonicalizeJson(operation.fact.value);
            if (existing !== undefined) {
                const sameValue = jsonEquals(existing.value, value);
                const newEvidence = evidence.some((sequence) => !existing.evidenceSequences.includes(sequence));
                if (sameValue && !newEvidence) {
                    return { suppression: latest < existing.lastEvidenceSequence ? "stale_evidence" : "duplicate" };
                }
                if (latest < existing.lastEvidenceSequence) return { suppression: "covered_update" };
                if (
                    !sameValue
                    && latest === existing.lastEvidenceSequence
                    && sourcePriority(context.source) <= sourcePriority(existing.source)
                ) {
                    throw new WorkingMemoryPatchError("Fact conflict lacks newer or higher-priority evidence");
                }
                const mergedEvidence = sameValue
                    ? sortedEvidence([...existing.evidenceSequences, ...evidence])
                    : evidence;
                return {
                    operation: {
                        type: "upsert_fact",
                        fact: {
                            ...existing,
                            subject,
                            predicate,
                            value,
                            stability: operation.fact.stability,
                            evidenceSequences: mergedEvidence,
                            reinforcementCount: sameValue
                                ? existing.reinforcementCount + 1
                                : 1,
                            lastEvidenceSequence: Math.max(...mergedEvidence),
                            source: context.source,
                            scope: operation.fact.scope ?? existing.scope,
                            updatedAtSequence,
                        },
                    },
                };
            }
            return {
                operation: {
                    type: "upsert_fact",
                    fact: {
                        kind: "fact",
                        id,
                        subject,
                        predicate,
                        value,
                        stability: operation.fact.stability,
                        evidenceSequences: evidence,
                        reinforcementCount: 1,
                        lastEvidenceSequence: latest,
                        source: context.source,
                        originPhase: context.phase,
                        originSequence: context.originSequence,
                        updatedAtSequence,
                        scope: operation.fact.scope ?? "goal",
                    },
                },
            };
        }
        case "retire_fact": {
            const existing = assertActiveReference(memory, operation.fact.id, "fact", "retire_fact.id");
            const latest = Math.max(...operation.fact.evidenceSequences);
            if (latest <= existing.lastEvidenceSequence) return { suppression: "stale_evidence" };
            return { operation: { type: "retire_fact", factId: existing.id } };
        }
        case "create_hypothesis":
            return {
                operation: {
                    type: "upsert_hypothesis",
                    hypothesis: {
                        kind: "hypothesis",
                        id: runtimeId("hypothesis", context.originSequence, index),
                        statement: normalizeText(operation.hypothesis.statement),
                        status: "active",
                        scope: operation.hypothesis.scope ?? "phase",
                        originPhase: context.phase,
                        originSequence: context.originSequence,
                        updatedAtSequence,
                    },
                },
            };
        case "update_hypothesis": {
            const existing = assertActiveReference(memory, operation.hypothesis.id, "hypothesis", "update_hypothesis.id");
            const status = operation.hypothesis.status ?? existing.status;
            assertLifecycleTransition(existing.status, status, "Hypothesis");
            const statement = operation.hypothesis.statement === undefined
                ? existing.statement
                : normalizeText(operation.hypothesis.statement);
            if (status === existing.status && statement === existing.statement) return { suppression: "duplicate" };
            return {
                operation: {
                    type: "upsert_hypothesis",
                    hypothesis: { ...existing, statement, status, updatedAtSequence },
                },
            };
        }
        case "create_plan_item": {
            const dependsOnFactIds = operation.planItem.dependsOnFactIds ?? [];
            const dependsOnPlanItemIds = operation.planItem.dependsOnPlanItemIds ?? [];
            dependsOnFactIds.forEach((id) => assertActiveReference(memory, id, "fact", "dependsOnFactIds"));
            dependsOnPlanItemIds.forEach((id) => assertActiveReference(memory, id, "plan", "dependsOnPlanItemIds"));
            return {
                operation: {
                    type: "upsert_plan_item",
                    planItem: {
                        kind: "plan",
                        id: runtimeId("plan", context.originSequence, index),
                        description: normalizeText(operation.planItem.description),
                        status: operation.planItem.status ?? "pending",
                        dependsOnFactIds: [...dependsOnFactIds],
                        dependsOnPlanItemIds: [...dependsOnPlanItemIds],
                        completionEvidenceSequences: [],
                        scope: "phase",
                        originPhase: context.phase,
                        originSequence: context.originSequence,
                        updatedAtSequence,
                    },
                },
            };
        }
        case "update_plan_item": {
            const existing = assertActiveReference(memory, operation.planItem.id, "plan", "update_plan_item.id");
            const status = operation.planItem.status ?? existing.status;
            assertPlanTransition(existing.status, status);
            const dependsOnFactIds = operation.planItem.dependsOnFactIds ?? existing.dependsOnFactIds;
            const dependsOnPlanItemIds = operation.planItem.dependsOnPlanItemIds ?? existing.dependsOnPlanItemIds;
            dependsOnFactIds.forEach((id) => assertActiveReference(memory, id, "fact", "dependsOnFactIds"));
            dependsOnPlanItemIds.forEach((id) => {
                if (id === existing.id) throw new WorkingMemoryPatchError("PlanItem cannot depend on itself");
                assertActiveReference(memory, id, "plan", "dependsOnPlanItemIds");
            });
            const completionEvidence = operation.planItem.completionEvidenceSequences
                ?? existing.completionEvidenceSequences;
            if (status === "completed" && completionEvidence.length === 0) {
                throw new WorkingMemoryPatchError("completed PlanItem requires completion evidence");
            }
            const next: PlanItem = {
                ...existing,
                description: operation.planItem.description === undefined
                    ? existing.description
                    : normalizeText(operation.planItem.description),
                status,
                dependsOnFactIds: [...dependsOnFactIds],
                dependsOnPlanItemIds: [...dependsOnPlanItemIds],
                completionEvidenceSequences: sortedEvidence(completionEvidence),
                updatedAtSequence,
            };
            const comparable = { ...next, updatedAtSequence: existing.updatedAtSequence };
            if (JSON.stringify(comparable) === JSON.stringify(existing)) return { suppression: "duplicate" };
            return { operation: { type: "upsert_plan_item", planItem: next } };
        }
        case "create_blocker":
            return {
                operation: {
                    type: "upsert_blocker",
                    blocker: {
                        kind: "blocker",
                        id: runtimeId("blocker", context.originSequence, index),
                        description: normalizeText(operation.blocker.description),
                        status: "active",
                        scope: operation.blocker.scope ?? "phase",
                        originPhase: context.phase,
                        originSequence: context.originSequence,
                        updatedAtSequence,
                    },
                },
            };
        case "update_blocker": {
            const existing = assertActiveReference(memory, operation.blocker.id, "blocker", "update_blocker.id");
            const status = operation.blocker.status ?? existing.status;
            assertLifecycleTransition(existing.status, status, "Blocker");
            const description = operation.blocker.description === undefined
                ? existing.description
                : normalizeText(operation.blocker.description);
            if (status === existing.status && description === existing.description) return { suppression: "duplicate" };
            return {
                operation: {
                    type: "upsert_blocker",
                    blocker: { ...existing, description, status, updatedAtSequence },
                },
            };
        }
    }
}

function protectedIds(memory: WorkingMemory): Set<string> {
    const protectedSet = new Set<string>();
    for (const blocker of memory.blockers) {
        if (blocker.status === "active") protectedSet.add(blocker.id);
    }
    for (const item of memory.plan) {
        if (item.status !== "active") continue;
        protectedSet.add(item.id);
        item.dependsOnFactIds.forEach((id) => protectedSet.add(id));
    }
    return protectedSet;
}

function memoryViolatesLimits(memory: WorkingMemory, limits: WorkingMemoryLimits): boolean {
    return memory.facts.length > limits.maxFacts
        || memory.hypotheses.length > limits.maxHypotheses
        || memory.plan.length > limits.maxPlanItems
        || memory.blockers.length > limits.maxBlockers
        || serializedByteLength(memory) > limits.maxWorkingMemoryBytes;
}

function utilityOrder(left: MemoryEntry, right: MemoryEntry): number {
    const category = (entry: MemoryEntry): number => {
        if (entry.kind === "hypothesis") return 0;
        if (entry.kind === "fact" && entry.stability === "last_observed") return 1;
        if (entry.kind === "fact") return 2;
        return 3;
    };
    const categoryDelta = category(left) - category(right);
    if (categoryDelta !== 0) return categoryDelta;
    const reinforcementLeft = left.kind === "fact" ? left.reinforcementCount : 0;
    const reinforcementRight = right.kind === "fact" ? right.reinforcementCount : 0;
    if (reinforcementLeft !== reinforcementRight) return reinforcementLeft - reinforcementRight;
    const evidenceLeft = left.kind === "fact" ? left.lastEvidenceSequence : 0;
    const evidenceRight = right.kind === "fact" ? right.lastEvidenceSequence : 0;
    if (evidenceLeft !== evidenceRight) return evidenceLeft - evidenceRight;
    if (left.updatedAtSequence !== right.updatedAtSequence) {
        return left.updatedAtSequence - right.updatedAtSequence;
    }
    return left.id.localeCompare(right.id);
}

function selectEvictions(
    memory: WorkingMemory,
    limits: WorkingMemoryLimits,
): readonly string[] {
    if (!memoryViolatesLimits(memory, limits)) return [];
    const protectedSet = protectedIds(memory);
    let protectedMemory = createEmptyWorkingMemory(memory.derivedThroughSequence, memory.revision);
    for (const entry of allEntries(memory).filter((candidate) => protectedSet.has(candidate.id))) {
        protectedMemory = applyOne(protectedMemory, entry.kind === "fact"
            ? { type: "upsert_fact", fact: entry }
            : entry.kind === "hypothesis"
                ? { type: "upsert_hypothesis", hypothesis: entry }
                : entry.kind === "plan"
                    ? { type: "upsert_plan_item", planItem: entry }
                    : { type: "upsert_blocker", blocker: entry });
    }
    if (memoryViolatesLimits(protectedMemory, limits)) {
        throw new WorkingMemoryPatchError("protected Working Memory exceeds capacity");
    }
    const candidates = allEntries(memory)
        .filter((entry) => !protectedSet.has(entry.id))
        .sort(utilityOrder);
    const evicted: string[] = [];
    let selected = memory;
    for (const entry of candidates) {
        if (!memoryViolatesLimits(selected, limits)) break;
        evicted.push(entry.id);
        selected = applyOne(selected, { type: "evict_entries", entryIds: [entry.id] });
    }
    if (memoryViolatesLimits(selected, limits)) {
        throw new WorkingMemoryPatchError("Working Memory capacity cannot be satisfied");
    }
    return evicted;
}

/**
 * 将模型或 Projector proposal 归一化为 deterministic canonical Patch。
 *
 * @returns canonical operations 与抑制原因；全部抑制时 `operations` 为空。
 * @throws WorkingMemoryPatchError 当任一操作违反 schema、证据新旧、引用或容量契约。
 */
export function normalizeMemoryPatch(
    patch: unknown,
    context: WorkingMemoryPatchNormalizationContext,
): NormalizedWorkingMemoryPatch {
    assertOneOf(context.phase, GOAL_PHASES, "phase");
    assertPositiveInteger(context.originSequence, "originSequence");
    const source = context.source ?? "model";
    assertOneOf(source, ["model", "tool_projector", "runtime"] as const, "source");
    validateMemoryPatchPhase(patch, context.phase, context);
    const limits = resolveWorkingMemoryLimits(context.limits);
    const original = context.workingMemory ?? createEmptyWorkingMemory();
    let draft = withoutDerivedMetadata(original);
    const canonical: CanonicalMemoryOperation[] = [];
    const suppressed: SuppressedMemoryOperation[] = [];
    const candidateIds = new Map<string, number>();

    patch.operations.forEach((operation, index) => {
        const result = canonicalizeOperation(
            operation,
            index,
            { phase: context.phase, originSequence: context.originSequence, source },
            draft,
        );
        if (result.suppression !== undefined) {
            suppressed.push({ index, reason: result.suppression });
            return;
        }
        if (result.operation === undefined) return;
        canonical.push(result.operation);
        if (result.operation.type === "upsert_fact") candidateIds.set(result.operation.fact.id, index);
        if (result.operation.type === "upsert_hypothesis") candidateIds.set(result.operation.hypothesis.id, index);
        if (result.operation.type === "upsert_plan_item") candidateIds.set(result.operation.planItem.id, index);
        if (result.operation.type === "upsert_blocker") candidateIds.set(result.operation.blocker.id, index);
        draft = applyOne(draft, result.operation);
    });

    const evicted = selectEvictions(draft, limits);
    if (evicted.length > 0) {
        const createdCandidateIds = new Set(
            [...candidateIds.keys()].filter((id) => findEntry(original, id) === undefined),
        );
        const suppressedCandidates = new Set(evicted.filter((id) => createdCandidateIds.has(id)));
        for (const id of suppressedCandidates) {
            const index = candidateIds.get(id);
            if (index !== undefined) suppressed.push({ index, reason: "capacity_low_utility" });
        }
        const keptOperations = canonical.filter((operation) => {
            const id = operation.type === "upsert_fact"
                ? operation.fact.id
                : operation.type === "upsert_hypothesis"
                    ? operation.hypothesis.id
                    : operation.type === "upsert_plan_item"
                        ? operation.planItem.id
                        : operation.type === "upsert_blocker"
                            ? operation.blocker.id
                            : undefined;
            return id === undefined || !suppressedCandidates.has(id);
        });
        const existingEvictions = evicted.filter((id) => !suppressedCandidates.has(id));
        if (existingEvictions.length > 0) {
            keptOperations.push({ type: "evict_entries", entryIds: existingEvictions });
        }
        return Object.freeze({
            protocolVersion: 1,
            operations: Object.freeze(keptOperations),
            suppressed: Object.freeze(suppressed),
        });
    }
    return Object.freeze({
        protocolVersion: 1,
        operations: Object.freeze(canonical),
        suppressed: Object.freeze(suppressed),
    });
}

/**
 * 重放 canonical operations 并返回新的 Working Memory 投影。
 *
 * @remarks
 * 本函数不重新运行准入或容量算法。`derivedThroughSequence` 与 revision 由调用方给定，
 * 因而同一 accepted Patch 链在不同进程中产生相同内容。
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
    assertValidWorkingMemory(memory);
    const operations: readonly CanonicalMemoryOperation[] = isRecord(patch)
        ? patch.operations as readonly CanonicalMemoryOperation[]
        : patch as readonly CanonicalMemoryOperation[];
    const derivedThroughSequence = options.derivedThroughSequence
        ?? operations.reduce((boundary, operation) => {
            const sequence = operation.type === "upsert_fact"
                ? operation.fact.updatedAtSequence
                : operation.type === "upsert_hypothesis"
                    ? operation.hypothesis.updatedAtSequence
                    : operation.type === "upsert_plan_item"
                        ? operation.planItem.updatedAtSequence
                        : operation.type === "upsert_blocker"
                            ? operation.blocker.updatedAtSequence
                            : boundary;
            return Math.max(boundary, sequence);
        }, memory.derivedThroughSequence);
    const revision = options.revision ?? memory.revision;
    if (!Number.isSafeInteger(derivedThroughSequence) || derivedThroughSequence < memory.derivedThroughSequence) {
        throw new WorkingMemoryPatchError("derivedThroughSequence must advance monotonically");
    }
    let next: WorkingMemory = { ...memory, derivedThroughSequence, ...(revision === undefined ? {} : { revision }) };
    for (const operation of operations) next = applyOne(next, operation);
    next = {
        ...next,
        facts: Object.freeze([...next.facts]),
        hypotheses: Object.freeze([...next.hypotheses]),
        plan: Object.freeze([...next.plan]),
        blockers: Object.freeze([...next.blockers]),
    };
    assertValidWorkingMemory(next);
    return Object.freeze(next);
}

/** 归一化 proposal 并立即应用到当前进程投影；不执行持久化。 */
export function applyMemoryPatch(
    memory: WorkingMemory,
    patch: unknown,
    context: Omit<WorkingMemoryPatchNormalizationContext, "workingMemory"> & {
        readonly revision?: WorkingMemory["revision"];
    },
): WorkingMemory {
    const normalized = normalizeMemoryPatch(patch, { ...context, workingMemory: memory });
    return reduceWorkingMemory(memory, normalized, {
        derivedThroughSequence: context.originSequence,
        ...(context.revision === undefined ? {} : { revision: context.revision }),
        ...(context.limits === undefined ? {} : { limits: context.limits }),
    });
}

/** 创建由 Runtime 使用的 phase/terminal scope 清理操作。 */
export function createSupersedeScopeOperation(
    scope: MemoryEntryScope,
    options: {
        readonly phase?: GoalPhase;
        readonly kinds?: readonly MemoryEntryKind[];
    } = {},
): CanonicalMemoryOperation {
    assertOneOf(scope, MEMORY_ENTRY_SCOPES, "scope");
    if (options.phase !== undefined) assertOneOf(options.phase, GOAL_PHASES, "phase");
    if (options.kinds !== undefined) options.kinds.forEach((kind) => assertOneOf(kind, MEMORY_ENTRY_KINDS, "kind"));
    return Object.freeze({
        type: "supersede_scope",
        scope,
        ...(options.phase === undefined ? {} : { phase: options.phase }),
        ...(options.kinds === undefined ? {} : { kinds: Object.freeze([...options.kinds]) }),
    });
}

/** 合并已经分别完成准入的 canonical Patch，不重新计算容量。 */
export function mergeNormalizedMemoryPatches(
    modelPatch: NormalizedWorkingMemoryPatch | undefined,
    lifecycleOperations: readonly CanonicalMemoryOperation[] = [],
): NormalizedWorkingMemoryPatch {
    return Object.freeze({
        protocolVersion: 1,
        operations: Object.freeze([
            ...(modelPatch?.operations ?? []),
            ...lifecycleOperations,
        ]),
        suppressed: Object.freeze([...(modelPatch?.suppressed ?? [])]),
    });
}
