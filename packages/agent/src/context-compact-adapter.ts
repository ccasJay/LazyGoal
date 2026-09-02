import { z } from "zod";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest } from "../../llm/src/core/types";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import type { DiagnosticTraceSink } from "../../runtime/src/index";
import type {
    ModelInputEstimator,
} from "./model-context-budget";
import { CharacterModelInputEstimator } from "./model-context-budget";
import {
    recordContextCompactDiagnosticTrace,
} from "./llm-diagnostic-trace";
import {
    type WarmCompactEntry,
    type WarmEntryKind,
} from "./warm-reducer";
import { stableJson } from "./prompting/environment";

/** Compact Adapter 输入/输出协议版本。 */
export const CONTEXT_COMPACT_SCHEMA_VERSION = 1 as const;

/** Compact Adapter 的固定实现版本，用于诊断和后续 Sidecar 校验。 */
export const CONTEXT_COMPACTOR_VERSION = "deterministic-warm-v1" as const;

/** Compact 模型只能输出的严格 Warm 条目 Schema。 */
export const ContextCompactWarmEntrySchema = z.object({
    id: z.string().trim().min(1),
    kind: z.enum(["decision", "finding", "failure", "blocker", "unresolved"]),
    summary: z.string().trim().min(1),
    status: z.enum(["active", "resolved", "superseded"]),
    lossy: z.literal(true),
    evidenceSequences: z.array(z.number().int().positive().safe()),
    firstSequence: z.number().int().positive().safe(),
    lastSequence: z.number().int().positive().safe(),
    lastAccessedSequence: z.number().int().positive().safe(),
    reinforcementCount: z.number().int().nonnegative().safe(),
    sourceHash: z.string().trim().min(1),
}).strict();

/** Compact 模型必须返回的严格 JSON 外壳。 */
export const ContextCompactResponseSchema = z.object({
    schemaVersion: z.literal(CONTEXT_COMPACT_SCHEMA_VERSION),
    entries: z.array(ContextCompactWarmEntrySchema),
}).strict();

/** Compact 调用允许的模型输出类别。 */
export const CONTEXT_COMPACT_ENTRY_KINDS: readonly WarmEntryKind[] = Object.freeze([
    "decision",
    "finding",
    "failure",
    "blocker",
    "unresolved",
]);

/**
 * Compact 请求输入。
 *
 * @example
 * ```ts
 * const input: ContextCompactInput = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     measuredAs: "token",
 *     remainingBudget: 2048,
 *     existingEntries: [],
 *     overflowCandidates: candidates,
 *     allowedKinds: ["finding", "failure"],
 * };
 * ```
 */
export interface ContextCompactInput {
    /** 当前 Goal 稳定标识。 */
    readonly goalId: string;
    /** 当前 Run 稳定标识。 */
    readonly runId: string;
    /** 输入和输出使用的 Token 或字符计量单位。 */
    readonly measuredAs: "token" | "character";
    /** 本次 Compact 输出可使用的非负预算。 */
    readonly remainingBudget: number;
    /** 已保留的 Warm 条目，供模型避免重复归纳。 */
    readonly existingEntries: readonly WarmCompactEntry[];
    /** 因确定性容量淘汰、尚未被 Warm 表达的候选条目。 */
    readonly overflowCandidates: readonly WarmCompactEntry[];
    /** Compact 输出允许的条目类别。 */
    readonly allowedKinds: readonly WarmEntryKind[];
}

/** Compact 失败时保留的确定性回退原因。 */
export type ContextCompactFailureReason =
    | "no_candidates"
    | "adapter"
    | "invalid_response"
    | "over_budget";

/**
 * Compact 调用结果；失败时 `accepted` 为 false 且 entries 为空。
 *
 * @example
 * ```ts
 * const result: ContextCompactResult = await adapter.compact(input);
 * const warm = result.accepted ? result.entries : deterministicEntries;
 * ```
 */
export interface ContextCompactResult {
    /** 是否接受了严格校验后的 Compact 条目。 */
    readonly accepted: boolean;
    /** 可替换确定性 Warm 的有损条目；失败时为空数组。 */
    readonly entries: readonly WarmCompactEntry[];
    /** 输入/输出计量单位。 */
    readonly measuredAs: "token" | "character";
    /** Compact 请求的计量值。 */
    readonly requestMeasurement: number;
    /** 成功响应条目的计量值；失败或未调用时为零。 */
    readonly responseMeasurement: number;
    /** Compact 调用耗时；未调用时为零。 */
    readonly durationMs: number;
    /** 确定性回退原因。 */
    readonly failureReason?: ContextCompactFailureReason;
}

/**
 * ContextCompactAdapter 构造依赖。
 *
 * @example
 * ```ts
 * const options: ContextCompactAdapterOptions = {
 *     adapter: llmAdapter,
 *     traceSink,
 * };
 * ```
 */
export interface ContextCompactAdapterOptions {
    /** 独立的模型适配器；主模型请求不会复用本次调用。 */
    readonly adapter: LLMAdapter;
    /** Compact 请求和响应使用的计量器。 */
    readonly estimator?: ModelInputEstimator;
    /** 旁路诊断 Sink；失败不会改变确定性回退。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 诊断/Sidecar 关联的实现版本。 */
    readonly compactorVersion?: string;
}

/**
 * 严格执行一次独立 Compact 模型调用。
 *
 * @remarks
 * 调用前验证输入身份、类别和预算；无候选时不调用模型。模型只收到 Warm 条目，
 * 不会看到 Goal Task、用户约束或 Runtime 控制字段。每次 `compact` 最多调用一次
 * Adapter，非法、无来源、超预算、Provider 失败或中止都不会污染已有 Warm；主
 * 后台维护组件应在失败时继续使用确定性 reducer 结果；当前主模型 Assembler
 * 不调用该 Adapter，也不会等待 Compact 结果。
 *
 * @example
 * ```ts
 * const adapter = new ContextCompactAdapter({ llmAdapter });
 * const result = await adapter.compact(input, control);
 * const warm = result.accepted ? result.entries : deterministicWarm;
 * ```
 */
export class ContextCompactAdapter {
    private readonly adapter: LLMAdapter;
    private readonly estimator: ModelInputEstimator;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly compactorVersion: string;

    /** @param options - 独立 Adapter、计量器、诊断 Sink 和版本标识。 */
    constructor(options: ContextCompactAdapterOptions) {
        this.adapter = options.adapter;
        this.estimator = options.estimator ?? new CharacterModelInputEstimator();
        this.traceSink = options.traceSink;
        this.compactorVersion = options.compactorVersion ?? CONTEXT_COMPACTOR_VERSION;
        if (this.compactorVersion.trim().length === 0) {
            throw new RangeError("compactorVersion must be a non-empty string");
        }
    }

    /**
     * @param input - 已由 WarmReducer 产生的 retained/candidate 集合和剩余预算。
     * @param control - 当前主调用共享的中止控制。
     * @returns 严格校验结果；失败时返回 accepted=false 供确定性结果回退。
     * @throws RangeError 当输入配置非法；中止时抛出 `ExecutionAbortedError`。
     */
    async compact(
        input: ContextCompactInput,
        control?: ExecutionControl,
    ): Promise<ContextCompactResult> {
        validateInput(input, this.estimator.unit);
        throwIfAborted(control);
        if (input.overflowCandidates.length === 0) {
            return emptyResult(input.measuredAs, "no_candidates");
        }

        const requestPayload = {
            schemaVersion: CONTEXT_COMPACT_SCHEMA_VERSION,
            goalId: input.goalId,
            runId: input.runId,
            measuredAs: input.measuredAs,
            remainingBudget: input.remainingBudget,
            allowedKinds: [...input.allowedKinds],
            existingEntries: stableEntries(input.existingEntries),
            overflowCandidates: stableEntries(input.overflowCandidates),
        };
        const request: LLMRequest = {
            messages: [
                {
                    role: "system",
                    content: "Return only JSON matching schemaVersion 1 with lossy Warm entries. Cite only evidenceSequences present in the input; do not output task, user constraints, or runtime control state.",
                },
                { role: "user", content: stableJson(requestPayload) },
            ],
        };
        const requestMeasurement = measure(this.estimator, request);
        const startedAt = Date.now();
        await recordContextCompactDiagnosticTrace({
            sink: this.traceSink,
            goalId: input.goalId,
            runId: input.runId,
            kind: "context_compact_request",
            payload: {
                compactorVersion: this.compactorVersion,
                measuredAs: input.measuredAs,
                requestMeasurement,
                remainingBudget: input.remainingBudget,
                existingCount: input.existingEntries.length,
                candidateCount: input.overflowCandidates.length,
            },
        });

        let response: { readonly content: string; readonly providerMetadata?: unknown };
        try {
            response = await this.adapter.generate(request, control);
            throwIfAborted(control);
        } catch (error) {
            await recordContextCompactDiagnosticTrace({
                sink: this.traceSink,
                goalId: input.goalId,
                runId: input.runId,
                kind: "context_compact_error",
                payload: {
                    compactorVersion: this.compactorVersion,
                    durationMs: Date.now() - startedAt,
                    stage: "adapter",
                    error: error instanceof Error ? error.message : String(error),
                },
            });
            if (isExecutionAbortedError(error) || control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }
            return {
                ...emptyResult(input.measuredAs, "adapter"),
                requestMeasurement,
                durationMs: Date.now() - startedAt,
            };
        }

        const durationMs = Date.now() - startedAt;
        await recordContextCompactDiagnosticTrace({
            sink: this.traceSink,
            goalId: input.goalId,
            runId: input.runId,
            kind: "context_compact_response",
            payload: {
                compactorVersion: this.compactorVersion,
                durationMs,
                measuredAs: input.measuredAs,
                providerMetadata: response.providerMetadata,
                content: response.content,
            },
        });

        const parsed = parseCompactResponse(response.content);
        if (!parsed.ok) {
            await recordContextCompactDiagnosticTrace({
                sink: this.traceSink,
                goalId: input.goalId,
                runId: input.runId,
                kind: "context_compact_error",
                payload: {
                    compactorVersion: this.compactorVersion,
                    durationMs,
                    stage: "response_validation",
                    error: parsed.error,
                },
            });
            return {
                ...emptyResult(input.measuredAs, "invalid_response"),
                requestMeasurement,
                durationMs,
            };
        }

        const validation = validateCompactEntries(parsed.entries, input);
        if (!validation.ok) {
            await recordContextCompactDiagnosticTrace({
                sink: this.traceSink,
                goalId: input.goalId,
                runId: input.runId,
                kind: "context_compact_error",
                payload: {
                    compactorVersion: this.compactorVersion,
                    durationMs,
                    stage: "source_or_budget_validation",
                    error: validation.error,
                },
            });
            return {
                ...emptyResult(
                    input.measuredAs,
                    validation.error === "compact output exceeds remaining budget"
                        ? "over_budget"
                        : "invalid_response",
                ),
                requestMeasurement,
                durationMs,
            };
        }

        let responseMeasurement: number;
        try {
            responseMeasurement = measure(this.estimator, validation.entries);
        } catch (error) {
            await recordContextCompactDiagnosticTrace({
                sink: this.traceSink,
                goalId: input.goalId,
                runId: input.runId,
                kind: "context_compact_error",
                payload: {
                    compactorVersion: this.compactorVersion,
                    durationMs,
                    stage: "response_measurement",
                    error: error instanceof Error ? error.message : String(error),
                },
            });
            return {
                ...emptyResult(input.measuredAs, "invalid_response"),
                requestMeasurement,
                durationMs,
            };
        }
        if (responseMeasurement > input.remainingBudget) {
            await recordContextCompactDiagnosticTrace({
                sink: this.traceSink,
                goalId: input.goalId,
                runId: input.runId,
                kind: "context_compact_error",
                payload: {
                    compactorVersion: this.compactorVersion,
                    durationMs,
                    stage: "response_budget",
                    responseMeasurement,
                    remainingBudget: input.remainingBudget,
                },
            });
            return {
                ...emptyResult(input.measuredAs, "over_budget"),
                requestMeasurement,
                durationMs,
            };
        }
        return Object.freeze({
            accepted: true,
            entries: Object.freeze(validation.entries),
            measuredAs: input.measuredAs,
            requestMeasurement,
            responseMeasurement,
            durationMs,
        });
    }
}

function validateInput(input: ContextCompactInput, estimatorUnit: "token" | "character"): void {
    if (
        typeof input.goalId !== "string"
        || input.goalId.trim().length === 0
        || typeof input.runId !== "string"
        || input.runId.trim().length === 0
    ) {
        throw new RangeError("Compact Goal/Run identity must be non-empty");
    }
    if (input.measuredAs !== estimatorUnit) {
        throw new RangeError("Compact input measurement unit must match estimator");
    }
    assertNonNegativeSafeInteger(input.remainingBudget, "remainingBudget");
    if (!Array.isArray(input.existingEntries) || !Array.isArray(input.overflowCandidates)) {
        throw new RangeError("Compact entries must be arrays");
    }
    if (
        !Array.isArray(input.allowedKinds)
        || input.allowedKinds.length === 0
        || input.allowedKinds.some((kind) => !CONTEXT_COMPACT_ENTRY_KINDS.includes(kind))
        || new Set(input.allowedKinds).size !== input.allowedKinds.length
    ) {
        throw new RangeError("allowedKinds must be a non-empty unique Warm kind list");
    }
    for (const entry of [...input.existingEntries, ...input.overflowCandidates]) {
        validateWarmEntry(entry);
    }
}

function validateWarmEntry(entry: WarmCompactEntry): void {
    const parsed = ContextCompactWarmEntrySchema.safeParse(entry);
    if (!parsed.success) {
        throw new RangeError("Compact source contains an invalid Warm entry");
    }
    if (
        entry.firstSequence > entry.lastSequence
        || entry.lastAccessedSequence < entry.firstSequence
        || entry.evidenceSequences.some(
            (sequence) => sequence < entry.firstSequence || sequence > entry.lastSequence,
        )
    ) {
        throw new RangeError("Compact source Warm sequence range is invalid");
    }
}

function stableEntries(entries: readonly WarmCompactEntry[]): readonly WarmCompactEntry[] {
    return [...entries].sort((left, right) => {
        if (left.kind !== right.kind) {
            return CONTEXT_COMPACT_ENTRY_KINDS.indexOf(left.kind)
                - CONTEXT_COMPACT_ENTRY_KINDS.indexOf(right.kind);
        }
        if (left.id !== right.id) return left.id < right.id ? -1 : 1;
        if (left.sourceHash !== right.sourceHash) {
            return left.sourceHash < right.sourceHash ? -1 : 1;
        }
        return left.lastSequence - right.lastSequence;
    });
}

function parseCompactResponse(
    content: string,
):
    | { readonly ok: true; readonly entries: readonly WarmCompactEntry[] }
    | { readonly ok: false; readonly error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? "response is not valid JSON" : "response JSON is invalid",
        };
    }
    const result = ContextCompactResponseSchema.safeParse(parsed);
    if (!result.success) {
        return { ok: false, error: "response does not match the Compact schema" };
    }
    return { ok: true, entries: result.data.entries as readonly WarmCompactEntry[] };
}

function validateCompactEntries(
    entries: readonly WarmCompactEntry[],
    input: ContextCompactInput,
):
    | { readonly ok: true; readonly entries: readonly WarmCompactEntry[] }
    | { readonly ok: false; readonly error: string } {
    const sourceSequences = new Set<number>();
    for (const entry of [...input.existingEntries, ...input.overflowCandidates]) {
        for (const sequence of entry.evidenceSequences) sourceSequences.add(sequence);
    }
    const ids = new Set<string>();
    const normalized: WarmCompactEntry[] = [];
    for (const entry of entries) {
        if (ids.has(entry.id)) return { ok: false, error: "compact output contains duplicate IDs" };
        ids.add(entry.id);
        if (!input.allowedKinds.includes(entry.kind)) {
            return { ok: false, error: "compact output contains a disallowed kind" };
        }
        if (entry.status === "superseded") {
            return { ok: false, error: "compact output must not create superseded entries" };
        }
        if (entry.evidenceSequences.length === 0) {
            return { ok: false, error: "compact output entry has no evidence" };
        }
        if (entry.evidenceSequences.some((sequence) => !sourceSequences.has(sequence))) {
            return { ok: false, error: "compact output cites evidence outside its input" };
        }
        if (
            entry.firstSequence > entry.lastSequence
            || entry.lastAccessedSequence < entry.firstSequence
            || entry.evidenceSequences.some(
                (sequence) => sequence < entry.firstSequence || sequence > entry.lastSequence,
            )
        ) {
            return { ok: false, error: "compact output has an invalid sequence range" };
        }
        normalized.push(Object.freeze({
            ...entry,
            evidenceSequences: Object.freeze([...new Set(entry.evidenceSequences)].sort(
                (left, right) => left - right,
            )),
        }));
    }
    return { ok: true, entries: normalized };
}

function measure(estimator: ModelInputEstimator, value: unknown): number {
    const count = estimator.estimate(value);
    assertNonNegativeSafeInteger(count, "Compact measurement");
    return count;
}

function emptyResult(
    measuredAs: "token" | "character",
    failureReason: ContextCompactFailureReason,
): ContextCompactResult {
    return Object.freeze({
        accepted: false,
        entries: Object.freeze([]),
        measuredAs,
        requestMeasurement: 0,
        responseMeasurement: 0,
        durationMs: 0,
        failureReason,
    });
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${field} must be a non-negative safe integer`);
    }
}
