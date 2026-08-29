import type {
    CanonicalMemoryOperation,
    Goal,
    MemoryPatchAcceptedPayload,
    MemoryRevision,
} from "./domain";
import type { GoalStore } from "./goal-store";
import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
import {
    allocateDiagnosticTraceRecord,
    TrajectoryAppendError,
    TrajectoryCommitMarkerError,
    type DiagnosticTraceSink,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryPhase,
    type TrajectorySink,
} from "./trajectory";

/** Runtime 与 accepted Memory Patch 的来源标签。 */
export type MemoryPatchProducer = "model" | "runtime_lifecycle";

/**
 * 需要由共享提交器追加的规范化 Memory Patch。
 *
 * @remarks `operations` 必须已经通过 Working Memory Core 与业务分支校验；提交器
 * 只负责把它作为独立事实追加，并把返回 Event 作为 Snapshot 的 memory revision。
 *
 * @example
 * ```ts
 * const patch: AcceptedMemoryPatchInput = {
 *   phase: "executing",
 *   producers: ["model"],
 *   operations: normalized.operations,
 * };
 * ```
 */
export interface AcceptedMemoryPatchInput {
    /** 产生 Patch 的业务阶段；省略时使用 Goal 当前阶段。 */
    readonly phase?: TrajectoryPhase;
    /** 组成该 Patch 的来源；提交器按 model、runtime_lifecycle 去重排序。 */
    readonly producers: readonly MemoryPatchProducer[];
    /** 已由 Core 规范化、带来源元数据的操作。 */
    readonly operations: readonly CanonicalMemoryOperation[];
    /** 该 Patch 链头的父 accepted Event；省略时沿用 Goal 当前 revision。 */
    readonly parentRevisionEventId?: string;
    /** 可选的执行单元关联键。 */
    readonly executionUnitId?: string;
    /** 可选的 Action 关联键。 */
    readonly actionId?: string;
}

/**
 * 一次事实与 Snapshot 的原子边界提交请求。
 *
 * @remarks `facts` 按给定顺序追加；`acceptedPatch` 紧随其后追加。任一追加失败
 * 都不会保存 Snapshot。Snapshot 成功后 marker 失败不会回滚 Snapshot。
 *
 * @example
 * ```ts
 * const result = await committer.commit(goal, {
 *   facts: [factDraft],
 *   acceptedPatch: patch,
 * });
 * ```
 */
export interface TrajectoryCheckpointCommitRequest {
    /** 已经通过业务校验、需要进入本次边界的事实事件。 */
    readonly facts?: readonly TrajectoryEventDraft[];
    /** 可选的独立 accepted Memory Patch 事实。 */
    readonly acceptedPatch?: AcceptedMemoryPatchInput;
    /** 当前调用级中止控制。 */
    readonly control?: ExecutionControl;
}

/**
 * 共享提交器返回的事件与保存副本。
 *
 * @example
 * ```ts
 * const { goal: saved } = await committer.commit(goal);
 * console.log(saved.state.run.committedThroughSequence);
 * ```
 */
export interface TrajectoryCheckpointCommitResult {
    /** 已成功保存的 Goal Snapshot 副本。 */
    readonly goal: Goal;
    /** 本次追加的业务事实，按追加顺序返回。 */
    readonly events: readonly Readonly<TrajectoryEvent>[];
    /** 本次追加的 accepted Patch Event；未提交 Patch 时省略。 */
    readonly memoryPatchEvent?: Readonly<TrajectoryEvent>;
}

/**
 * 创建 {@link TrajectoryCheckpointCommitter} 所需的依赖。
 *
 * @example
 * ```ts
 * const committer = new TrajectoryCheckpointCommitter({ store, trajectorySink });
 * ```
 */
export interface TrajectoryCheckpointCommitterDependencies {
    /** 保存最新 Goal Snapshot 的边界。 */
    readonly store: GoalStore;
    /** 可选事实追加端口；省略时保持 legacy 无 Trajectory 行为。 */
    readonly trajectorySink?: TrajectorySink;
    /** 可选旁路诊断端口。 */
    readonly traceSink?: DiagnosticTraceSink;
}

function trajectoryKey(goal: Pick<Goal, "id" | "state">): string {
    return `${goal.id}\u0000${goal.state.run.id}`;
}

function normalizeProducers(
    producers: readonly MemoryPatchProducer[],
): readonly MemoryPatchProducer[] {
    const allowed = new Set<MemoryPatchProducer>(["model", "runtime_lifecycle"]);
    const unique = new Set<MemoryPatchProducer>();
    for (const producer of producers) {
        if (!allowed.has(producer)) {
            throw new TrajectoryAppendError("memory patch producer is invalid");
        }
        unique.add(producer);
    }
    return [
        ...(unique.has("model") ? ["model" as const] : []),
        ...(unique.has("runtime_lifecycle") ? ["runtime_lifecycle" as const] : []),
    ];
}

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
    if (value !== undefined && value.trim().length === 0) {
        throw new TrajectoryAppendError(`${label} must be a non-empty string`);
    }
}

function asMemoryPatchPayload(
    input: AcceptedMemoryPatchInput,
    goal: Goal,
): MemoryPatchAcceptedPayload {
    const producers = normalizeProducers(input.producers);
    if (producers.length === 0) {
        throw new TrajectoryAppendError("memory patch must have at least one producer");
    }
    assertOptionalNonEmpty(input.parentRevisionEventId, "parentRevisionEventId");
    assertOptionalNonEmpty(input.executionUnitId, "executionUnitId");
    assertOptionalNonEmpty(input.actionId, "actionId");
    return {
        type: "memory_patch_accepted",
        protocolVersion: 1,
        producers,
        ...(input.parentRevisionEventId === undefined
            ? goal.state.run.memoryRevision?.eventId === undefined
                ? {}
                : { parentRevisionEventId: goal.state.run.memoryRevision.eventId }
            : { parentRevisionEventId: input.parentRevisionEventId }),
        operations: structuredClone(input.operations),
    };
}

/**
 * 统一 Coordinator 与 Runner 的 Trajectory/Snapshot 提交顺序。
 *
 * @remarks
 * 该对象维护的事实高水位只用于本进程内计算 Snapshot 边界；真正的恢复权威仍是
 * Snapshot。accepted Patch 的 revision 只有在 Snapshot 保存成功后才进入返回副本，
 * 调用方不应在提交失败时更新自己的 Working Memory。
 *
 * @example
 * ```ts
 * const committer = new TrajectoryCheckpointCommitter({ store, trajectorySink });
 * const saved = await committer.commit(goal, { facts: [draft] });
 * ```
 */
export class TrajectoryCheckpointCommitter {
    private readonly store: GoalStore;
    private readonly trajectorySink: TrajectorySink;
    private readonly trajectoryEnabled: boolean;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trajectoryFactSequences = new Map<string, number>();

    /** @param dependencies - Snapshot Store、可选 Trajectory 和诊断端口。 */
    constructor(dependencies: TrajectoryCheckpointCommitterDependencies) {
        this.store = dependencies.store;
        this.trajectoryEnabled = dependencies.trajectorySink !== undefined;
        this.trajectorySink = dependencies.trajectorySink ?? {
            async append(): Promise<Readonly<TrajectoryEvent>> {
                throw new TrajectoryAppendError("Trajectory sink is disabled");
            },
        };
        this.traceSink = dependencies.traceSink;
    }

    /**
     * 追加一个事实事件并更新本进程的边界高水位。
     *
     * @param draft - 已通过业务校验的事实草稿。
     * @param control - 当前调用级中止控制。
     * @param countAsFact - 是否纳入下一次 Snapshot 边界；marker 应传 false。
     * @returns 追加成功的事件；Trajectory 未启用时返回 `undefined`。
     * @throws TrajectoryAppendError 追加失败；中止时传播 `ExecutionAbortedError`。
     */
    async append(
        draft: TrajectoryEventDraft,
        control?: ExecutionControl,
        countAsFact = true,
    ): Promise<Readonly<TrajectoryEvent> | undefined> {
        if (!this.trajectoryEnabled) return undefined;
        throwIfAborted(control);
        let event: Readonly<TrajectoryEvent>;
        try {
            event = await this.trajectorySink.append(draft);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            throw new TrajectoryAppendError(
                error instanceof Error ? error.message : String(error),
                { cause: error },
            );
        }
        throwIfAborted(control);
        if (countAsFact && event.payload.type !== "state_committed") {
            const key = `${event.goalId}\u0000${event.runId}`;
            this.trajectoryFactSequences.set(
                key,
                Math.max(this.trajectoryFactSequences.get(key) ?? 0, event.sequence),
            );
        }
        return event;
    }

    /**
     * 按 facts → accepted Patch → Snapshot → marker 顺序提交一次边界。
     *
     * @param goal - 本次业务转换后的 Goal 状态；不会被原地修改。
     * @param request - 可选事实、accepted Patch 与中止控制。
     * @returns 保存副本及本次追加事件。
     * @throws TrajectoryAppendError、GoalStore 写入异常或
     *   TrajectoryCommitMarkerError；Snapshot 失败时不会返回提交副本。
     */
    async commit(
        goal: Goal,
        request: TrajectoryCheckpointCommitRequest = {},
    ): Promise<TrajectoryCheckpointCommitResult> {
        throwIfAborted(request.control);

        if (!this.trajectoryEnabled) {
            if (request.acceptedPatch !== undefined) {
                throw new TrajectoryAppendError(
                    "accepted Memory Patch requires an enabled Trajectory sink",
                );
            }
            await this.store.save(goal);
            throwIfAborted(request.control);
            return { goal, events: [] };
        }

        const events: Readonly<TrajectoryEvent>[] = [];
        for (const draft of request.facts ?? []) {
            const event = await this.append(draft, request.control);
            if (event !== undefined) events.push(event);
        }

        let memoryPatchEvent: Readonly<TrajectoryEvent> | undefined;
        if (request.acceptedPatch !== undefined) {
            const patch = request.acceptedPatch;
            const phase = patch.phase ?? goal.state.workflow.phase;
            const payload = asMemoryPatchPayload(patch, goal);
            memoryPatchEvent = await this.append({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase,
                ...(patch.executionUnitId === undefined
                    ? {}
                    : { executionUnitId: patch.executionUnitId }),
                ...(patch.actionId === undefined ? {} : { actionId: patch.actionId }),
                ...(payload.parentRevisionEventId === undefined
                    ? {}
                    : { parentEventId: payload.parentRevisionEventId }),
                eventType: "memory_patch_accepted",
                payload,
            }, request.control);
        }
        if (memoryPatchEvent !== undefined) events.push(memoryPatchEvent);

        const key = trajectoryKey(goal);
        const priorBoundary = goal.state.run.committedThroughSequence ?? 0;
        const committedThroughSequence = Math.max(
            priorBoundary,
            this.trajectoryFactSequences.get(key) ?? 0,
        );
        const revision: MemoryRevision | undefined = memoryPatchEvent === undefined
            ? goal.state.run.memoryRevision
            : {
                eventId: memoryPatchEvent.eventId,
                sequence: memoryPatchEvent.sequence,
            };
        const run = {
            ...goal.state.run,
            ...(committedThroughSequence === priorBoundary
                ? {}
                : { committedThroughSequence }),
            ...(revision === undefined ? {} : { memoryRevision: revision }),
        };
        const checkpoint: Goal = {
            ...goal,
            state: {
                ...goal.state,
                run,
            },
        };

        await this.store.save(checkpoint);
        throwIfAborted(request.control);
        try {
            await this.append({
                goalId: checkpoint.id,
                runId: checkpoint.state.run.id,
                phase: checkpoint.state.workflow.phase,
                eventType: "state_committed",
                payload: {
                    type: "state_committed",
                    committedThroughSequence,
                },
            }, request.control, false);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            await this.recordMarkerDiagnostic(checkpoint, error);
            throw new TrajectoryCommitMarkerError(
                error instanceof Error ? error.message : String(error),
                { cause: error },
            );
        }

        return {
            goal: checkpoint,
            events: Object.freeze(events),
            ...(memoryPatchEvent === undefined ? {} : { memoryPatchEvent }),
        };
    }

    /**
     * 仅保存已有事实高水位的 Goal，兼容旧 Coordinator/Runner 调用路径。
     *
     * @param goal - 业务转换后的 Goal。
     * @param control - 当前调用级中止控制。
     * @returns 成功保存的 Goal 副本。
     */
    async saveCheckpoint(goal: Goal, control?: ExecutionControl): Promise<Goal> {
        const result = await this.commit(goal, {
            ...(control === undefined ? {} : { control }),
        });
        return result.goal;
    }

    private async recordMarkerDiagnostic(goal: Goal, error: unknown): Promise<void> {
        if (this.traceSink === undefined) return;
        try {
            await this.traceSink.append(allocateDiagnosticTraceRecord({
                goalId: goal.id,
                runId: goal.state.run.id,
                kind: "trajectory_commit_marker_failed",
                payload: {
                    eventType: "state_committed",
                    error: error instanceof Error ? error.message : String(error),
                },
            }));
        } catch {
            // Diagnostic Trace 是旁路；其自身故障不能覆盖 marker 缺口。
        }
    }
}
