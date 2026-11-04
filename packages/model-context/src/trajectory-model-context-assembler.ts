import { deepFreeze } from "../../contracts/src/index";
import type { NativeConversationIdentity } from "../../model-contracts/src/index";
import { collectNativeModelExchanges } from "./native-model-history";
import type { Goal } from "../../runtime/src/domain";
import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type {
    TrajectoryEvent,
    ModelContextFramePayload,
    ModelContextSectionIdentity,
    TrajectoryIncrementalReadPort,
    TrajectoryStore,
} from "../../runtime/src/index";
import { selectCommittedModelContextFrames } from "../../runtime/src/index";
import type {
    ModelContextBudgetPolicy,
    ModelInputEstimator,
} from "../../context-budget/src/index";
import { stableJson } from "../../context-budget/src/index";
import {
    HotWindowSelector,
    ModelContextSourceError,
    TrajectoryExecutionUnitAdapter,
    type HotWindowSelection,
    type ModelExecutionUnit,
} from "./trajectory-execution-unit-adapter";
import {
    TrajectoryEventProjector,
    type TrajectoryArtifactResolver,
} from "./trajectory-event-projector";
import type {
    ModelExecutionUnitProjection,
    ModelInferenceView,
    ModelTrajectoryContext,
    NativeModelExchange,
    WarmCompactEntry,
    WarmEntryKind,
} from "../../model-view/src/index";
import { ModelInferenceProjector } from "./model-inference-projector";
import {
    WarmReducer,
    WARM_ENTRY_KINDS,
    warmEntryMeasurementKey,
} from "./warm-reducer";
import { deterministicWarmEntryExtractor } from "./deterministic-warm";
import { ModelContextHardOverflowError } from "../../context-budget/src/index";

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
 * };
 * ```
 */
export interface TrajectoryWarmEntryExtractionInput {
    /** 当前完整 Goal 快照；提取器只能读取它。 */
    readonly goal: Goal;
    /** 当前 committed Trajectory 中、未进入 Hot 的完整执行单元。 */
    readonly omittedUnits: readonly ModelExecutionUnitProjection[];
}

/**
 * 从 Cold/Hot 边界提取有损 Warm 语义条目的纯函数。
 *
 * @remarks
 * 提取器不能写入 Goal、Snapshot、Working Memory 或 Trajectory；返回值
 * 会再次经过严格的 `WarmReducer` 校验。应用可在 Composition Root 注入基于自身领域知识的确定性提取器。
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
    /** 仅 Decide 原生 Adapter 提供；省略时保持现有语义投影。 */
    readonly nativeConversationIdentity?: NativeConversationIdentity;
    /** 当前完整 Goal 快照。 */
    readonly goal: Goal;
    /** 已完成 Conversation 裁剪的基础 View。 */
    readonly view: ModelInferenceView;
    /** 已渲染的 system/Conversation/Working Context 固定输入；省略时使用 View DTO。 */
    readonly fixedInput?: unknown;
    /** 当前调用的瞬时中止控制。 */
    readonly control?: ExecutionControl;
}

/** 单个 assembler 实例保留的 Run 级 committed 前缀缓存上限。 */
const MAX_CACHED_TRAJECTORY_RUNS = 2;

/** 原生交换已承载、不再重复投影的事件类型。 */
const NATIVE_OMITTED_EVENT_TYPES: ReadonlySet<string> = new Set([
    "model_response_received",
    "decision_received",
    "think_requested",
    "think_completed",
    "tool_finished",
    "observation_recorded",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
]);

interface AssemblerTrajectorySnapshot {
    readonly committed: readonly TrajectoryEvent[];
    readonly baseUnits: readonly ModelExecutionUnit[];
    readonly units: readonly ModelExecutionUnit[];
    readonly semanticUnits: readonly ModelExecutionUnitProjection[];
    readonly projectedUnits: readonly ModelExecutionUnitProjection[];
    readonly native: ReadonlyMap<string, readonly NativeModelExchange[]>;
    readonly hotMeasurements: Map<string, number>;
    readonly warmMeasurements: Map<string, number>;
}

interface AssemblerTrajectoryCacheEntry {
    readonly goalId: string;
    readonly runId: string;
    readonly boundary: number;
    readonly epochKey: string;
    readonly nativeIdentityKey: string;
    readonly snapshot: AssemblerTrajectorySnapshot;
}

/**
 * 将基础 ModelInferenceView 与 committed Trajectory 的 Hot/Warm 组装为分层 View。
 *
 * @remarks
 * 实例按 `(goalId, runId)` 保留至多两个已校验的 committed 前缀、执行单元投影与
 * 计量缓存。同一 boundary、Epoch 和 native identity 直接复用；boundary 前进时
 * 只读取并适配后缀。Run/Epoch/native identity 变化、边界回退或 Store 实例变化时
 * 回退全量读取。缓存不持久化，不跨进程，也不作为恢复权威。
 *
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
    private readonly trajectoryStore: (TrajectoryStore & Partial<TrajectoryIncrementalReadPort>) | undefined;
    private readonly policy: ModelContextBudgetPolicy;
    private readonly executionUnitAdapter: TrajectoryExecutionUnitAdapter;
    private readonly eventProjector: TrajectoryEventProjector;
    private readonly warmEntryExtractor: TrajectoryWarmEntryExtractor | undefined;
    private readonly trajectoryCache = new Map<string, AssemblerTrajectoryCacheEntry>();

    /** @param options - Trajectory、预算策略和可选纯投影扩展。 */
    constructor(options: TrajectoryModelContextAssemblerOptions) {
        this.trajectoryStore = options.trajectoryStore;
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
        const snapshot = await this.loadTrajectoryFor(input);
        const context = this.assembleContextFromCommitted(input, snapshot);
        throwIfAborted(input.control);
        return new ModelInferenceProjector().withTrajectoryContext(
            input.view,
            context,
        );
    }

    /**
     * 读取一次已提交 Trajectory，让调用方先按可见 Section 历史构造固定预算输入，再组装 Hot/Warm。
     *
     * @remarks
     * Frame 筛选使用当前 Snapshot boundary、Goal/Run、Prompt stage、Epoch、Conversation 起点和
     * Registry 身份。`prepareFixedInput` 是同步纯函数；其结果被计入 Context Assembler 的固定预算，
     * 从而避免历史读取与 Section diff 分别扫描 Trajectory。
     *
     * @param input - Goal、基础 View、Section 身份和调用级中止控制。
     * @param prepareFixedInput - 根据已筛选的 frame 重建本轮必需固定输入的纯函数。
     * @returns 带 Hot/Warm 的 View，以及此次恢复使用的 frame payload。
     * @throws 与 {@link assemble} 相同；未知或身份不匹配的 Section frame 以恢复错误失败。
     * @example
     * ```ts
     * const prepared = await assembler.assembleForPrompt(
     *     { goal, view, sectionIdentities },
     *     (frames) => makeFixedInput(frames),
     * );
     * ```
     */
    async assembleForPrompt(
        input: TrajectoryModelContextAssemblyInput & {
            readonly sectionIdentities: readonly ModelContextSectionIdentity[];
        },
        prepareFixedInput: (
            frames: readonly ModelContextFramePayload[],
        ) => unknown,
    ): Promise<Readonly<{
        readonly view: ModelInferenceView;
        readonly sectionFrames: readonly ModelContextFramePayload[];
    }>> {
        const snapshot = await this.loadTrajectoryFor(input);
        const epoch = input.view.contextEpoch;
        const frames = selectCommittedModelContextFrames(snapshot.committed, {
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
            committedThroughSequence: input.goal.state.run.committedThroughSequence,
            stage: input.view.prompt.stage,
            epochNumber: epoch.epochNumber,
            conversationStartPosition: epoch.conversationStartIndex,
            sectionIdentities: input.sectionIdentities,
        }).map((event) => event.payload);
        throwIfAborted(input.control);
        const context = this.assembleContextFromCommitted({
            ...input,
            fixedInput: prepareFixedInput(frames),
        }, snapshot);
        throwIfAborted(input.control);
        return Object.freeze({
            view: new ModelInferenceProjector().withTrajectoryContext(input.view, context),
            sectionFrames: Object.freeze(frames),
        });
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
        const snapshot = await this.loadTrajectoryFor(input);
        return this.assembleContextFromCommitted(input, snapshot);
    }

    private async loadTrajectoryFor(
        input: TrajectoryModelContextAssemblyInput,
    ): Promise<AssemblerTrajectorySnapshot> {
        throwIfAborted(input.control);
        if (this.trajectoryStore === undefined) {
            throw new ModelContextSourceError(
                "trajectory-layered model context requires a TrajectoryStore",
            );
        }

        const goalId = input.goal.id;
        const runId = input.goal.state.run.id;
        const boundary = input.goal.state.run.committedThroughSequence;
        assertNonNegativeSafeInteger(boundary, "committedThroughSequence");
        const key = `${goalId}\u0000${runId}`;
        const epochKey = contextEpochCacheKey(input.view);
        const nativeIdentityKey = input.nativeConversationIdentity === undefined
            ? "none"
            : stableJson(input.nativeConversationIdentity);
        const cached = this.trajectoryCache.get(key);

        if (cached !== undefined
            && cached.epochKey === epochKey
            && cached.nativeIdentityKey === nativeIdentityKey) {
            if (cached.boundary === boundary) {
                this.rememberTrajectoryCache(key, cached);
                return cached.snapshot;
            }
            if (cached.boundary < boundary) {
                const suffix = await this.readCommittedSuffix(
                    goalId,
                    runId,
                    cached.boundary,
                    boundary,
                    input.control,
                );
                if (suffix !== undefined) {
                    const snapshot = this.mergeIncrementalSnapshot(
                        input,
                        cached,
                        suffix,
                        boundary,
                    );
                    this.rememberTrajectoryCache(key, { ...cached, boundary, snapshot });
                    return snapshot;
                }
            }
        }

        const committed = await this.readCommittedTrajectory(
            goalId,
            runId,
            boundary,
            input.control,
        );
        const snapshot = this.buildSnapshot(input, committed);
        this.rememberTrajectoryCache(key, {
            goalId,
            runId,
            boundary,
            epochKey,
            nativeIdentityKey,
            snapshot,
        });
        return snapshot;
    }

    private async readCommittedSuffix(
        goalId: string,
        runId: string,
        afterSequence: number,
        boundary: number,
        control: ExecutionControl | undefined,
    ): Promise<readonly TrajectoryEvent[] | undefined> {
        const store = this.trajectoryStore;
        const readAfter = store?.readAfter;
        if (store === undefined || readAfter === undefined) return undefined;

        try {
            const result = await readAfter.call(store, { goalId, runId, afterSequence }, boundary);
            throwIfAborted(control);
            return result.committed;
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            return undefined;
        }
    }

    private buildSnapshot(
        input: TrajectoryModelContextAssemblyInput,
        committed: readonly TrajectoryEvent[],
    ): AssemblerTrajectorySnapshot {
        const boundary = input.goal.state.run.committedThroughSequence;
        const baseUnits = this.executionUnitAdapter.adapt(committed, {
            committedThroughSequence: boundary,
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
        });
        const native = input.nativeConversationIdentity === undefined
            ? new Map<string, readonly NativeModelExchange[]>()
            : collectNativeModelExchanges(
                committed,
                input.nativeConversationIdentity,
                this.eventProjector,
            );
        const units = this.mergeNativeUnits(input, committed, baseUnits, native);
        const semanticUnits = units.map(unit => this.eventProjector.projectExecutionUnit(unit));
        const projectedUnits = this.projectUnits(units, semanticUnits, native);

        return {
            committed,
            baseUnits,
            units,
            semanticUnits,
            projectedUnits,
            native,
            hotMeasurements: new Map(),
            warmMeasurements: new Map(),
        };
    }

    private mergeIncrementalSnapshot(
        input: TrajectoryModelContextAssemblyInput,
        cached: AssemblerTrajectoryCacheEntry,
        suffix: readonly TrajectoryEvent[],
        boundary: number,
    ): AssemblerTrajectorySnapshot {
        const appended = suffix.filter((event) =>
            event.sequence > cached.boundary && event.sequence <= boundary);
        const committed = [...cached.snapshot.committed, ...appended];
        const lastBase = cached.snapshot.baseUnits.at(-1);
        const recomputedUnitIds = new Set<string>();
        let baseUnits: readonly ModelExecutionUnit[];

        if (lastBase === undefined) {
            baseUnits = this.executionUnitAdapter.adapt(committed, {
                committedThroughSequence: boundary,
                goalId: input.goal.id,
                runId: input.goal.state.run.id,
            });
            for (const unit of baseUnits) recomputedUnitIds.add(unit.executionUnitId);
        } else {
            const startIndex = cached.snapshot.committed.findIndex(
                (event) => event.sequence === lastBase.firstSequence,
            );
            if (startIndex < 0) {
                return this.buildSnapshot(input, committed);
            }
            const tailEvents = [
                ...cached.snapshot.committed.slice(startIndex),
                ...appended,
            ];
            const tailUnits = this.executionUnitAdapter.adapt(tailEvents, {
                committedThroughSequence: boundary,
                goalId: input.goal.id,
                runId: input.goal.state.run.id,
            });
            baseUnits = [...cached.snapshot.baseUnits.slice(0, -1), ...tailUnits];
            recomputedUnitIds.add(lastBase.executionUnitId);
            for (const unit of tailUnits) recomputedUnitIds.add(unit.executionUnitId);
        }

        const native = input.nativeConversationIdentity === undefined
            ? new Map<string, readonly NativeModelExchange[]>()
            : collectNativeModelExchanges(
                committed,
                input.nativeConversationIdentity,
                this.eventProjector,
            );
        const units = this.mergeNativeUnits(input, committed, baseUnits, native);
        const cachedSemantic = new Map(cached.snapshot.units.map((unit, index) => [
            unit.executionUnitId,
            cached.snapshot.semanticUnits[index]!,
        ] as const));
        const semanticUnits = units.map((unit) => {
            const cachedProjection = cachedSemantic.get(unit.executionUnitId);
            if (cachedProjection !== undefined
                && !recomputedUnitIds.has(unit.executionUnitId)) {
                return cachedProjection;
            }
            return this.eventProjector.projectExecutionUnit(unit);
        });
        const projectedUnits = this.projectUnits(units, semanticUnits, native);
        const hotMeasurements = new Map(cached.snapshot.hotMeasurements);
        const presentUnitIds = new Set(units.map((unit) => unit.executionUnitId));

        for (const unitId of [...hotMeasurements.keys()]) {
            if (!presentUnitIds.has(unitId)) hotMeasurements.delete(unitId);
        }
        const nativeUnitIds = new Set(native.keys());
        for (let index = 0; index < units.length; index += 1) {
            const unitId = units[index]!.executionUnitId;
            if (recomputedUnitIds.has(unitId)
                || nativeUnitIds.has(unitId)
                || !hotMeasurements.has(unitId)) {
                hotMeasurements.set(
                    unitId,
                    this.policy.estimator.estimate(projectedUnits[index]!),
                );
            }
        }

        return {
            committed,
            baseUnits,
            units,
            semanticUnits,
            projectedUnits,
            native,
            hotMeasurements,
            warmMeasurements: new Map(cached.snapshot.warmMeasurements),
        };
    }

    private mergeNativeUnits(
        input: TrajectoryModelContextAssemblyInput,
        committed: readonly TrajectoryEvent[],
        baseUnits: readonly ModelExecutionUnit[],
        native: ReadonlyMap<string, readonly NativeModelExchange[]>,
    ): ModelExecutionUnit[] {
        const units = [...baseUnits];
        const known = new Set(units.map((unit) => unit.executionUnitId));

        for (const [unitId, exchanges] of native) {
            if (known.has(unitId)) continue;
            const events = committed.filter((event) => event.executionUnitId === unitId);
            if (events.length === 0) {
                throw new ModelContextSourceError(
                    `Native exchange ${unitId} has no committed events`,
                );
            }
            units.push({
                executionUnitId: unitId,
                goalId: input.goal.id,
                runId: input.goal.state.run.id,
                phase: "executing",
                firstSequence: events[0]!.sequence,
                lastSequence: exchanges.at(-1)!.settledThroughSequence,
                items: events,
                events,
                characterCount: 0,
            });
            known.add(unitId);
        }

        units.sort((left, right) => left.firstSequence - right.firstSequence);
        return units;
    }

    private projectUnits(
        units: readonly ModelExecutionUnit[],
        semanticUnits: readonly ModelExecutionUnitProjection[],
        native: ReadonlyMap<string, readonly NativeModelExchange[]>,
    ): readonly ModelExecutionUnitProjection[] {
        return Object.freeze(units.map((unit, index) => {
            const projection = semanticUnits[index]!;
            const exchanges = native.get(unit.executionUnitId);
            if (exchanges === undefined) return projection;
            return {
                ...projection,
                nativeExchanges: exchanges,
                events: projection.events
                    .filter((event) => !NATIVE_OMITTED_EVENT_TYPES.has(event.eventType))
                    .map(stripActionParameters),
            };
        }));
    }

    private rememberTrajectoryCache(
        key: string,
        entry: AssemblerTrajectoryCacheEntry,
    ): void {
        this.trajectoryCache.delete(key);
        this.trajectoryCache.set(key, entry);
        while (this.trajectoryCache.size > MAX_CACHED_TRAJECTORY_RUNS) {
            const oldest = this.trajectoryCache.keys().next().value;
            if (oldest === undefined) break;
            this.trajectoryCache.delete(oldest);
        }
    }

    private assembleContextFromCommitted(
        input: TrajectoryModelContextAssemblyInput,
        snapshot: AssemblerTrajectorySnapshot,
    ): ModelTrajectoryContext {
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
        const fixedInput = input.fixedInput ?? defaultFixedInput(input.view);
        const budget = this.policy.plan({ fixedInput });

        if (budget.softOverflow) {
            throw new ModelContextHardOverflowError(
                "authoritative fixed context exceeds the model input budget",
            );
        }

        const units = snapshot.units;
        const projectedUnits = snapshot.projectedUnits;
        const projectedById = new Map(projectedUnits.map((unit) => [
            unit.executionUnitId,
            unit,
        ] as const));

        const firstSelection = this.selectHot(
            projectedUnits,
            units,
            budget.hotBudget,
            snapshot.hotMeasurements,
        );
        const firstWarm = this.reduceWarm(
            input,
            firstSelection,
            snapshot.semanticUnits,
            budget.warmBudget,
            snapshot.warmMeasurements,
        );
        const reallocatedHotBudget = this.policy.reallocateHotBudget(
            budget,
            firstWarm.retainedMeasurement,
        );
        const finalSelection = this.selectHot(
            projectedUnits,
            units,
            reallocatedHotBudget,
            snapshot.hotMeasurements,
        );
        const finalWarm = this.reduceWarm(
            input,
            finalSelection,
            snapshot.semanticUnits,
            budget.warmBudget,
            snapshot.warmMeasurements,
        );

        return freezeContext({
            measuredAs: budget.measuredAs,
            softOverflow: false,
            hot: finalSelection.selected.map((unit) =>
                projectedById.get(unit.executionUnitId)!),
            warm: finalWarm.retained,
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

    private selectHot(
        projectedUnits: readonly ModelExecutionUnitProjection[],
        rawUnits: readonly ModelExecutionUnit[],
        budget: number,
        measurements: Map<string, number>,
    ): HotWindowSelection<ModelExecutionUnit> {
        // Selector 的预算必须使用同一个 Policy estimator；projectedUnits 只用于
        // 计量，rawUnits 保留原始 unit 作为最终选择结果，避免重复反序列化事实。
        const selector = new HotWindowSelector<ModelExecutionUnit>(
            this.policy.estimator,
        );
        const projectedById = new Map(projectedUnits.map((unit) => [
            unit.executionUnitId,
            unit,
        ] as const));
        return selector.select(rawUnits, {
            budget,
            project: (unit) => projectedById.get(unit.executionUnitId) ?? unit.events,
            measure: (unit) => {
                const cached = measurements.get(unit.executionUnitId);
                if (cached !== undefined) return cached;
                const measured = this.policy.estimator.estimate(
                    projectedById.get(unit.executionUnitId) ?? unit.events,
                );
                measurements.set(unit.executionUnitId, measured);
                return measured;
            },
        });
    }

    private reduceWarm(
        input: TrajectoryModelContextAssemblyInput,
        selection: HotWindowSelection<ModelExecutionUnit>,
        candidateUnits: readonly ModelExecutionUnitProjection[],
        budget: number,
        measurements: Map<string, number>,
    ): WarmReductionForAssembly {
        const byId = new Map(candidateUnits.map((unit) => [
            unit.executionUnitId,
            unit,
        ] as const));
        const omitted = selection.omitted
            .map((unit) => byId.get(unit.executionUnitId))
            .filter((unit): unit is ModelExecutionUnitProjection => unit !== undefined);
        const candidates = this.extractWarmEntries(input, omitted);
        if (candidates.length === 0) {
            return {
                retained: Object.freeze([]),
                retainedMeasurement: 0,
            };
        }
        const reducer = new WarmReducer({
            estimator: this.policy.estimator,
            quotas: Object.fromEntries(
                WARM_ENTRY_KINDS.map((kind) => [kind, {
                    maxEntries: Math.max(1, candidates.length),
                    maxMeasurement: budget,
                }]),
            ) as Record<WarmEntryKind, { maxEntries: number; maxMeasurement: number }>,
            protectedIds: activeBlockerIds(input.view),
            measurementCache: measurements,
        });
        let reduced;
        try {
            reduced = reducer.reduce(candidates);
        } catch {
            return {
                retained: Object.freeze([]),
                retainedMeasurement: 0,
            };
        }
        const retained = fitWarmBudget(
            this.policy.estimator,
            reduced.retained,
            budget,
            measurements,
        );
        const deduplicated = retained.retained.filter((entry) =>
            !isAuthoritativeBlockerDuplicate(input.view, entry),
        );
        const measurement = deduplicated.reduce((total, entry) => {
            const size = measurements.get(warmEntryMeasurementKey(entry))
                ?? this.policy.estimator.estimate(entry);
            assertNonNegativeSafeInteger(size, "Warm entry measurement");
            return total + size;
        }, 0);
        return {
            retained: Object.freeze(deduplicated),
            retainedMeasurement: measurement,
        };
    }

    private extractWarmEntries(
        input: TrajectoryModelContextAssemblyInput,
        omittedUnits: readonly ModelExecutionUnitProjection[],
    ): readonly WarmCompactEntry[] {
        if (omittedUnits.length === 0) return [];
        try {
            const extractor = this.warmEntryExtractor ?? deterministicWarmEntryExtractor;
            const extracted = extractor({
                goal: input.goal,
                omittedUnits,
            });
            return extracted.filter((entry) =>
                entry.lastSequence > 0
                && entry.lastSequence <= input.goal.state.run.committedThroughSequence,
            );
        } catch {
            // 可选语义提取失败时不牺牲主模型调用；提取失败只产生空 Warm，不影响 Hot 或主模型调用。
            return [];
        }
    }
}

interface WarmReductionForAssembly {
    readonly retained: readonly WarmCompactEntry[];
    readonly retainedMeasurement: number;
}

function contextEpochCacheKey(view: ModelInferenceView): string {
    const epoch = view.contextEpoch;
    return epoch === undefined
        ? "none"
        : `${epoch.epochNumber}\u0000${epoch.conversationStartIndex}\u0000${epoch.openedAtSequence}`;
}

function defaultFixedInput(view: ModelInferenceView): unknown {
    const conversation = view.contextEpoch === undefined
        ? view.conversation
        : view.conversation.filter((message) =>
            message.sourceMessageIndex >= view.contextEpoch!.conversationStartIndex,
        );
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

function fitWarmBudget(
    estimator: ModelInputEstimator,
    entries: readonly WarmCompactEntry[],
    budget: number,
    measurements?: ReadonlyMap<string, number>,
): { readonly retained: readonly WarmCompactEntry[]; readonly measurement: number } {
    const retained: WarmCompactEntry[] = [];
    let measurement = 0;
    for (const entry of entries) {
        const size = measurements?.get(warmEntryMeasurementKey(entry))
            ?? estimator.estimate(entry);
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

function assertNonNegativeSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ModelContextAssemblyError(
            `${field} must be a non-negative safe integer`,
        );
    }
}

function stripActionParameters(event: import("../../model-view/src/index").ModelTrajectoryEvent): import("../../model-view/src/index").ModelTrajectoryEvent {
    if (event.eventType === "action_staged") {
        const payload = event.payload as {
            readonly type: "action_staged";
            readonly action: { readonly actionId: string; readonly toolId: string; readonly input?: unknown };
            readonly approvalStatus: "approved" | "awaiting_approval";
            readonly approvalKind?: "tool" | "sandbox" | undefined;
            readonly effectiveSandboxScope?: unknown;
        };
        const { input: _, ...actionWithoutInput } = payload.action;
        return Object.freeze({
            ...event,
            payload: Object.freeze({
                ...payload,
                action: Object.freeze(actionWithoutInput),
            }),
        });
    }
    if (event.eventType === "tool_started") {
        const payload = event.payload as {
            readonly type: "tool_started";
            readonly actionId: string;
            readonly toolId: string;
            readonly input?: unknown;
        };
        const { input: _, ...payloadWithoutInput } = payload;
        return Object.freeze({
            ...event,
            payload: Object.freeze(payloadWithoutInput),
        });
    }
    return event;
}
