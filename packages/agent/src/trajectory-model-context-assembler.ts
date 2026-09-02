import { createHash } from "node:crypto";

import type { Goal } from "../../runtime/src/domain";
import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import type {
    TrajectoryEvent,
    TrajectoryStore,
    WarmContextSidecar,
    WarmContextSidecarStore,
} from "../../runtime/src/index";
import type {
    ModelContextBudgetPolicy,
    ModelInputEstimator,
} from "./model-context-budget";
import {
    HotWindowSelector,
    ModelContextSourceError,
    TrajectoryExecutionUnitAdapter,
    type HotWindowSelection,
    type ModelExecutionUnit,
} from "./trajectory-execution-unit-adapter";
import {
    TrajectoryEventProjector,
    type ModelExecutionUnitProjection,
    type TrajectoryArtifactResolver,
} from "./trajectory-event-projector";
import type {
    ModelInferenceView,
    ModelTrajectoryContext,
} from "./model-inference-view";
import { ModelInferenceProjector } from "./model-inference-projector";
import {
    WarmReducer,
    WARM_ENTRY_KINDS,
    type WarmCompactEntry,
    type WarmEntryKind,
} from "./warm-reducer";
import {
    ContextCompactAdapter,
    type ContextCompactResult,
} from "./context-compact-adapter";
import { deterministicWarmEntryExtractor } from "./deterministic-warm";
import { ModelContextHardOverflowError } from "./context-selector";

/** 分层上下文组装缺少权威来源或协议不一致时使用的稳定错误代码。 */
export const MODEL_CONTEXT_ASSEMBLY_ERROR_CODE = "MODEL_CONTEXT_ASSEMBLY_ERROR" as const;

/** 分层上下文组装失败时抛出的配置/输入错误。 */
export class ModelContextAssemblyError extends Error {
    readonly code = MODEL_CONTEXT_ASSEMBLY_ERROR_CODE;

    /** @param message - 面向诊断的稳定错误文本。 */
    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(message, options);
        this.name = "ModelContextAssemblyError";
    }
}

/**
 * 从较旧执行单元派生 Warm 条目的可选无状态扩展输入。
 *
 * @example
 * ```ts
 * const input: TrajectoryWarmEntryExtractionInput = {
 *     goal,
 *     omittedUnits: [],
 *     derivedThroughSequence: 0,
 * };
 * ```
 */
export interface TrajectoryWarmEntryExtractionInput {
    /** 当前完整 Goal 快照；提取器只能读取它。 */
    readonly goal: Goal;
    /** 当前 committed Trajectory 中、未进入 Hot 的完整执行单元。 */
    readonly omittedUnits: readonly ModelExecutionUnitProjection[];
    /** Sidecar 已覆盖的最大 sequence；没有 Sidecar 时为零。 */
    readonly derivedThroughSequence: number;
}

/**
 * 从 Cold/Hot 边界提取有损 Warm 语义条目的纯函数。
 *
 * @remarks
 * 提取器不能写入 Goal、Snapshot、Working Memory、Trajectory 或 Sidecar；返回值
 * 会再次经过严格的 `WarmReducer` 校验。默认不凭空生成语义条目，仅使用有效
 * Sidecar；应用可在 Composition Root 注入基于自身领域知识的确定性提取器。
 *
 * @example
 * ```ts
 * const extractor: TrajectoryWarmEntryExtractor = ({ omittedUnits }) => [];
 * ```
 */
export type TrajectoryWarmEntryExtractor = (
    input: TrajectoryWarmEntryExtractionInput,
) => readonly WarmCompactEntry[];

/**
 * Context Assembler 的构造依赖。
 *
 * @example
 * ```ts
 * const options: TrajectoryModelContextAssemblerOptions = {
 *     trajectoryStore,
 *     policy,
 * };
 * ```
 */
export interface TrajectoryModelContextAssemblerOptions {
    /** 读取当前 Goal/Run committed Trajectory 的权威 Port。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 可选的 Warm Sidecar 缓存；读取失败只影响缓存命中，不阻断主调用。 */
    readonly sidecarStore?: WarmContextSidecarStore;
    /** 本轮总输入、响应预留和历史分层预算策略。 */
    readonly policy: ModelContextBudgetPolicy;
    /** 只读执行单元边界适配器；省略时使用默认严格实现。 */
    readonly executionUnitAdapter?: TrajectoryExecutionUnitAdapter;
    /** 有界大型输出投影器；省略时按 Policy preview 上限创建。 */
    readonly eventProjector?: TrajectoryEventProjector;
    /** 可选已有 Artifact 引用解析器。仅用于默认投影器。 */
    readonly artifactResolver?: TrajectoryArtifactResolver;
    /** 可选的确定性 Warm 提取器；省略时不从事件猜测语义摘要。 */
    readonly warmEntryExtractor?: TrajectoryWarmEntryExtractor;
    /** 可选的独立 Compact 模型适配器；确定性归约不足时最多调用一次。 */
    readonly compactAdapter?: ContextCompactAdapter;
    /** Sidecar 校验使用的归约实现版本。 */
    readonly compactorVersion?: string;
}

/**
 * 一次 Context Assembler 调用的输入。
 *
 * @example
 * ```ts
 * const input: TrajectoryModelContextAssemblyInput = { goal, view };
 * ```
 */
export interface TrajectoryModelContextAssemblyInput {
    /** 当前完整 Goal 快照。 */
    readonly goal: Goal;
    /** 已完成 Conversation 裁剪的基础 View。 */
    readonly view: ModelInferenceView;
    /** 已渲染的 system/Conversation/Working Context 固定输入；省略时使用 View DTO。 */
    readonly fixedInput?: unknown;
    /** 当前调用的瞬时中止控制。 */
    readonly control?: ExecutionControl;
}

/**
 * 将基础 ModelInferenceView 与 committed Trajectory 的 Hot/Warm 组装为分层 View。
 *
 * @remarks
 * 每次 `assemble` 都从 Snapshot boundary 和 TrajectoryStore 重新读取，实例不缓存
 * Goal、Trajectory 或 Warm；调用结束、等待、中断和进程退出都可以丢弃其结果。
 * Conversation 必须已按当前 Context Epoch 裁剪，Assembler 不会再次改变它。
 * Assembler 从不写入任何持久化边界。
 *
 * @example
 * ```ts
 * const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });
 * const view = await assembler.assemble({ goal, view: compactedView });
 * ```
 */
export class TrajectoryModelContextAssembler {
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly sidecarStore: WarmContextSidecarStore | undefined;
    private readonly policy: ModelContextBudgetPolicy;
    private readonly executionUnitAdapter: TrajectoryExecutionUnitAdapter;
    private readonly eventProjector: TrajectoryEventProjector;
    private readonly warmEntryExtractor: TrajectoryWarmEntryExtractor | undefined;
    private readonly compactAdapter: ContextCompactAdapter | undefined;
    private readonly compactorVersion: string;

    /** @param options - Trajectory、Sidecar、预算策略和可选纯投影扩展。 */
    constructor(options: TrajectoryModelContextAssemblerOptions) {
        this.trajectoryStore = options.trajectoryStore;
        this.sidecarStore = options.sidecarStore;
        this.policy = options.policy;
        this.executionUnitAdapter = options.executionUnitAdapter
            ?? new TrajectoryExecutionUnitAdapter();
        this.eventProjector = options.eventProjector
            ?? new TrajectoryEventProjector({
                previewLimit: options.policy.largeOutputPreviewLimit,
                ...(options.artifactResolver === undefined
                    ? {}
                    : { artifactResolver: options.artifactResolver }),
            });
        this.warmEntryExtractor = options.warmEntryExtractor;
        this.compactAdapter = options.compactAdapter;
        this.compactorVersion = options.compactorVersion ?? "deterministic-warm-v1";
        if (this.compactorVersion.trim().length === 0) {
            throw new RangeError("compactorVersion must be a non-empty string");
        }
    }

    /**
     * 组装一次模型调用的最终 View。
     *
     * @param input - 已投影且完成 Conversation 裁剪的基础 View。
     * @returns 当前 View 增加深冻结的 Trajectory Context。
     * @throws ModelContextSourceError 当权威 Trajectory 缺失、读取失败或结构非法。
     * @throws ModelContextAssemblyError 当协议、Working Memory 或预算输入不一致。
     * @throws ExecutionAbortedError 当调用在任一异步边界被中止。
     */
    async assemble(
        input: TrajectoryModelContextAssemblyInput,
    ): Promise<ModelInferenceView> {
        throwIfAborted(input.control);
        if (input.view.workingMemory === undefined) {
            throw new ModelContextAssemblyError(
                "trajectory-layered model context requires Working Memory",
            );
        }
        if (input.view.prompt.modelContextProtocol.kind !== "trajectory-layered") {
            throw new ModelContextAssemblyError(
                "基础 View 缺少 trajectory-layered model context protocol",
            );
        }

        const context = await this.assembleContext(input);
        throwIfAborted(input.control);
        return new ModelInferenceProjector().withTrajectoryContext(
            input.view,
            context,
        );
    }

    /**
     * 只计算本轮分层 Context DTO，供需要自定义 View 合并的 Composition Root 使用。
     *
     * @param input - 与 {@link assemble} 相同的基础输入。
     * @returns 深冻结的 Hot/Warm 与预算报告。
     * @throws 与 {@link assemble} 相同；Conversation 协议也会被拒绝。
     * @example
     * ```ts
     * const context = await assembler.assembleContext({ goal, view });
     * console.log(context.budget.measuredAs, context.hot.length);
     * ```
     */
    async assembleContext(
        input: TrajectoryModelContextAssemblyInput,
    ): Promise<ModelTrajectoryContext> {
        throwIfAborted(input.control);
        if (this.trajectoryStore === undefined) {
            throw new ModelContextSourceError(
                "trajectory-layered model context requires a TrajectoryStore",
            );
        }

        const boundary = input.goal.state.run.committedThroughSequence;
        assertNonNegativeSafeInteger(boundary, "committedThroughSequence");

        const committed = await this.readCommittedTrajectory(
            input.goal.id,
            input.goal.state.run.id,
            boundary,
            input.control,
        );
        const units = this.executionUnitAdapter.adapt(committed, {
            committedThroughSequence: boundary,
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
        });
        const projectedUnits = Object.freeze(
            units.map((unit) => this.eventProjector.projectExecutionUnit(unit)),
        );
        const fixedInput = input.fixedInput ?? defaultFixedInput(input.view);
        const budget = this.policy.plan({ fixedInput });

        if (budget.softOverflow) {
            throw new ModelContextHardOverflowError(
                "authoritative fixed context exceeds the model input budget",
            );
        }

        const sidecar = await this.restoreSidecar(
            input.goal.id,
            input.goal.state.run.id,
            boundary,
            committed,
            input.control,
        );
        const sidecarEntries = validSidecarEntries(
            sidecar,
            input.goal.id,
            input.goal.state.run.id,
            boundary,
        );
        const sidecarDerivedThroughSequence = sidecar !== undefined
            && Array.isArray(sidecar.entries)
            && sidecarEntries.length === sidecar.entries.length
            ? sidecar.derivedThroughSequence
            : 0;

        const firstSelection = this.selectHot(projectedUnits, units, budget.hotBudget);
        const firstWarm = this.reduceWarm(
            input,
            firstSelection,
            projectedUnits,
            sidecarEntries,
            sidecarDerivedThroughSequence,
            budget.warmBudget,
        );
        const reallocatedHotBudget = this.policy.reallocateHotBudget(
            budget,
            firstWarm.retainedMeasurement,
        );
        const finalSelection = this.selectHot(
            projectedUnits,
            units,
            reallocatedHotBudget,
        );
        const finalWarm = this.reduceWarm(
            input,
            finalSelection,
            projectedUnits,
            sidecarEntries,
            sidecarDerivedThroughSequence,
            budget.warmBudget,
        );
        const compactedWarm = finalWarm.retained;

        return freezeContext({
            measuredAs: budget.measuredAs,
            softOverflow: false,
            hot: finalSelection.selected.map((unit) =>
                this.eventProjector.projectExecutionUnit(unit),
            ),
            warm: compactedWarm,
            budget,
        });
    }

    private async readCommittedTrajectory(
        goalId: string,
        runId: string,
        boundary: number,
        control: ExecutionControl | undefined,
    ): Promise<readonly TrajectoryEvent[]> {
        try {
            const result = await this.trajectoryStore!.readWithBoundary(
                { goalId, runId },
                boundary,
            );
            throwIfAborted(control);
            return result.committed;
        } catch (error) {
            if (error instanceof ModelContextSourceError || isExecutionAbortedError(error)) {
                throw error;
            }
            throw new ModelContextSourceError(
                "Committed Trajectory could not be read for model context",
                { cause: error },
            );
        }
    }

    private async restoreSidecar(
        goalId: string,
        runId: string,
        boundary: number,
        committed: readonly TrajectoryEvent[],
        control: ExecutionControl | undefined,
    ): Promise<WarmContextSidecar | undefined> {
        if (this.sidecarStore === undefined) return undefined;
        try {
            const sidecar = await this.sidecarStore.restore(goalId, runId, {
                committedThroughSequence: boundary,
                compactorVersion: this.compactorVersion,
            });
            throwIfAborted(control);
            if (
                sidecar === undefined
                || sidecar.schemaVersion !== 1
                || sidecar.goalId !== goalId
                || sidecar.runId !== runId
                || sidecar.compactorVersion !== this.compactorVersion
                || !Number.isSafeInteger(sidecar.derivedThroughSequence)
                || sidecar.derivedThroughSequence < 0
                || sidecar.derivedThroughSequence > boundary
                || typeof sidecar.sourceDigest !== "string"
                || sidecar.sourceDigest.trim().length === 0
                || !Array.isArray(sidecar.entries)
                || sourceDigest(committed, sidecar.derivedThroughSequence)
                    !== sidecar.sourceDigest
            ) {
                return undefined;
            }
            return sidecar;
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }
            // Sidecar 是可丢弃缓存；任何读取异常都回退到 committed Trajectory。
            return undefined;
        }
    }

    private selectHot(
        projectedUnits: readonly ModelExecutionUnitProjection[],
        rawUnits: readonly ModelExecutionUnit[],
        budget: number,
    ): HotWindowSelection<ModelExecutionUnit> {
        // Selector 的预算必须使用同一个 Policy estimator；projectedUnits 只用于
        // 计量，rawUnits 保留原始 unit 作为最终选择结果，避免重复反序列化事实。
        const selector = new HotWindowSelector<ModelExecutionUnit>(
            this.policy.estimator,
        );
        return selector.select(rawUnits, {
            budget,
            project: (unit) => {
                const index = rawUnits.indexOf(unit);
                return index < 0
                    ? unit.events
                    : projectedUnits[index];
            },
        });
    }

    private reduceWarm(
        input: TrajectoryModelContextAssemblyInput,
        selection: HotWindowSelection<ModelExecutionUnit>,
        projectedUnits: readonly ModelExecutionUnitProjection[],
        sidecarEntries: readonly WarmCompactEntry[],
        sidecarDerivedThroughSequence: number,
        budget: number,
    ): WarmReductionForAssembly {
        const omitted = selection.omitted.map((unit) => {
            const index = projectedUnits.findIndex((candidate) =>
                candidate.executionUnitId === unit.executionUnitId,
            );
            return index < 0 ? undefined : projectedUnits[index];
        }).filter((unit): unit is ModelExecutionUnitProjection => unit !== undefined);
        const extracted = this.extractWarmEntries(
            input,
            omitted,
            sidecarDerivedThroughSequence,
        );
        const candidates = [...sidecarEntries, ...extracted];
        const reducer = new WarmReducer({
            estimator: this.policy.estimator,
            quotas: Object.fromEntries(
                WARM_ENTRY_KINDS.map((kind) => [kind, {
                    maxEntries: Math.max(1, candidates.length),
                    maxMeasurement: budget,
                }]),
            ) as Record<WarmEntryKind, { maxEntries: number; maxMeasurement: number }>,
            protectedIds: activeBlockerIds(input.view),
        });
        let reduced;
        try {
            reduced = reducer.reduce(candidates);
        } catch {
            // 缓存或可选提取器的单条损坏不应覆盖其它权威来源。
            try {
                reduced = reducer.reduce(sidecarEntries);
            } catch {
                return {
                    retained: [],
                    retainedMeasurement: 0,
                    overflowCandidates: [],
                    overflowMeasurement: 0,
                };
            }
        }
        const retained = fitWarmBudget(
            this.policy.estimator,
            reduced.retained,
            budget,
        );
        const deduplicated = retained.retained.filter((entry) =>
            !isAuthoritativeBlockerDuplicate(input.view, entry),
        );
        const overflowCandidates = reduced.overflowCandidates.filter((entry) =>
            !isAuthoritativeBlockerDuplicate(input.view, entry),
        );
        const measurement = deduplicated.reduce((total, entry) => {
            const size = this.policy.estimator.estimate(entry);
            assertNonNegativeSafeInteger(size, "Warm entry measurement");
            return total + size;
        }, 0);
        return {
            retained: Object.freeze(deduplicated),
            retainedMeasurement: measurement,
            overflowCandidates: Object.freeze(overflowCandidates),
            overflowMeasurement: reduced.overflowMeasurement,
        };
    }

    private async compactWarm(
        input: TrajectoryModelContextAssemblyInput,
        budget: ModelTrajectoryContext["budget"],
        reduction: WarmReductionForAssembly,
    ): Promise<readonly WarmCompactEntry[]> {
        if (
            this.compactAdapter === undefined
            || reduction.overflowCandidates.length === 0
            || budget.warmBudget === 0
            || reduction.retainedMeasurement + reduction.overflowMeasurement
                < Math.max(1, Math.floor(
                    budget.warmBudget * this.policy.compactTriggerRatio,
                ))
        ) {
            return reduction.retained;
        }

        let result: ContextCompactResult;
        try {
            result = await this.compactAdapter.compact({
                goalId: input.goal.id,
                runId: input.goal.state.run.id,
                measuredAs: budget.measuredAs,
                // Compact 的输出可以替换已有 retained；必须看到完整 Warm 配额，
                // 不能因为确定性条目已占满配额而永远失去归纳机会。
                remainingBudget: budget.warmBudget,
                existingEntries: reduction.retained,
                overflowCandidates: reduction.overflowCandidates,
                allowedKinds: WARM_ENTRY_KINDS,
            }, input.control);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            return reduction.retained;
        }

        if (!result.accepted || result.entries.length === 0) {
            return reduction.retained;
        }

        try {
            const reducer = new WarmReducer({
                estimator: this.policy.estimator,
                quotas: Object.fromEntries(
                    WARM_ENTRY_KINDS.map((kind) => [kind, {
                        maxEntries: reduction.retained.length + result.entries.length,
                        maxMeasurement: budget.warmBudget,
                    }]),
                ) as Record<WarmEntryKind, { maxEntries: number; maxMeasurement: number }>,
                protectedIds: activeBlockerIds(input.view),
            });
            const reduced = reducer.reduce([
                ...reduction.retained,
                ...result.entries,
            ]);
            const fitted = fitWarmBudget(
                this.policy.estimator,
                reduced.retained,
                budget.warmBudget,
            );
            return Object.freeze(fitted.retained.filter((entry) =>
                !isAuthoritativeBlockerDuplicate(input.view, entry),
            ));
        } catch {
            // Compact 是可失败的旁路优化；任何归约异常都回退到确定性结果。
            return reduction.retained;
        }
    }

    private extractWarmEntries(
        input: TrajectoryModelContextAssemblyInput,
        omittedUnits: readonly ModelExecutionUnitProjection[],
        derivedThroughSequence: number,
    ): readonly WarmCompactEntry[] {
        if (omittedUnits.length === 0) return [];
        try {
            const extractor = this.warmEntryExtractor ?? deterministicWarmEntryExtractor;
            const extracted = extractor({
                goal: input.goal,
                omittedUnits,
                derivedThroughSequence,
            });
            return extracted.filter((entry) =>
                entry.lastSequence > derivedThroughSequence
                && entry.lastSequence <= input.goal.state.run.committedThroughSequence,
            );
        } catch {
            // 可选语义提取失败时不牺牲主模型调用；Reducer 仍可使用 Sidecar。
            return [];
        }
    }
}

interface WarmReductionForAssembly {
    readonly retained: readonly WarmCompactEntry[];
    readonly retainedMeasurement: number;
    readonly overflowCandidates: readonly WarmCompactEntry[];
    readonly overflowMeasurement: number;
}

function defaultFixedInput(view: ModelInferenceView): unknown {
    const conversation = view.contextEpoch === undefined
        ? view.conversation
        : view.conversation.slice(view.contextEpoch.conversationStartIndex);
    return {
        prompt: view.prompt,
        conversation,
        workingContext: view.workingContext,
        ...(view.workingMemory === undefined
            ? {}
            : { workingMemory: view.workingMemory }),
    };
}

function activeBlockerIds(view: ModelInferenceView): readonly string[] {
    return (view.workingMemory?.blockers ?? [])
        .filter((blocker) => blocker.status === "active")
        .map((blocker) => blocker.id);
}

function isAuthoritativeBlockerDuplicate(
    view: ModelInferenceView,
    entry: WarmCompactEntry,
): boolean {
    if (entry.kind !== "blocker") return false;
    return (view.workingMemory?.blockers ?? [])
        .some((blocker) =>
            blocker.status === "active"
            && (
                blocker.id === entry.id
                || blocker.description === entry.summary
            ),
        );
}

function validSidecarEntries(
    sidecar: WarmContextSidecar | undefined,
    goalId: string,
    runId: string,
    boundary: number,
): readonly WarmCompactEntry[] {
    try {
        if (
            sidecar === undefined
            || sidecar.goalId !== goalId
            || sidecar.runId !== runId
            || !Number.isSafeInteger(sidecar.derivedThroughSequence)
            || sidecar.derivedThroughSequence < 0
            || sidecar.derivedThroughSequence > boundary
            || new Set(sidecar.entries.map((entry) => entry.id)).size
                !== sidecar.entries.length
            || sidecar.entries.some((entry) =>
                entry.firstSequence > boundary
                || entry.lastSequence > boundary
                || entry.evidenceSequences.some((sequence) => sequence > boundary),
            )
        ) {
            return [];
        }
        return sidecar.entries.map((entry) => structuredClone(entry) as WarmCompactEntry);
    } catch {
        return [];
    }
}

function sourceDigest(
    events: readonly TrajectoryEvent[],
    throughSequence: number,
): string {
    const committed = events
        .filter((event) => event.sequence <= throughSequence)
        .map((event) => structuredClone(event));
    const canonical = JSON.stringify(sortKeys(committed));
    return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
            Object.keys(record)
                .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
                .map((key) => [key, sortKeys(record[key])]),
        );
    }
    return value;
}

function fitWarmBudget(
    estimator: ModelInputEstimator,
    entries: readonly WarmCompactEntry[],
    budget: number,
): { readonly retained: readonly WarmCompactEntry[]; readonly measurement: number } {
    const retained: WarmCompactEntry[] = [];
    let measurement = 0;
    for (const entry of entries) {
        const size = estimator.estimate(entry);
        assertNonNegativeSafeInteger(size, "Warm entry measurement");
        if (size <= budget - measurement) {
            retained.push(entry);
            measurement += size;
        }
    }
    return {
        retained: Object.freeze(retained),
        measurement,
    };
}

function freezeContext(context: ModelTrajectoryContext): ModelTrajectoryContext {
    return deepFreeze(context);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) {
        return value;
    }
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) {
        deepFreeze(child, seen);
    }
    return Object.freeze(value);
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ModelContextAssemblyError(
            `${field} must be a non-negative safe integer`,
        );
    }
}
