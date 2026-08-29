import type {
    TrajectoryEvent,
} from "../../runtime/src/index";
import {
    freezeTrajectoryEvent,
} from "../../runtime/src/index";
import type { ModelInputEstimator } from "./model-context-budget";
import { CharacterModelInputEstimator } from "./model-context-budget";
import { stableJson } from "./prompting/environment";

/** 分层模型上下文在 Trajectory 来源非法时使用的稳定错误代码。 */
export const MODEL_CONTEXT_SOURCE_ERROR_CODE = "MODEL_CONTEXT_SOURCE_ERROR" as const;

/**
 * committed Trajectory 无法形成合法模型上下文来源时抛出的错误。
 *
 * @remarks
 * 该错误只表示权威事件来源违反了上下文投影契约；调用方不得用空上下文静默
 * 替代，也不得因此修改原始 Trajectory。
 *
 * @example
 * ```ts
 * try {
 *     adapter.adapt(events, { committedThroughSequence: 42 });
 * } catch (error) {
 *     if (error instanceof ModelContextSourceError) console.error(error.code);
 * }
 * ```
 */
export class ModelContextSourceError extends Error {
    readonly code = MODEL_CONTEXT_SOURCE_ERROR_CODE;

    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(message, options);
        this.name = "ModelContextSourceError";
    }
}

/**
 * 一组已提交且完整的执行单元。
 *
 * @remarks
 * `items`/`events` 保持 Trajectory 原始顺序；两个字段引用同一个冻结数组，方便
 * 通用上下文选择器和分层模型 DTO 分别消费。单位边界由稳定的
 * `executionUnitId` 定义，生命周期、marker、Memory Patch 和不完整单元不会出现。
 * `characterCount` 仅是字符模式的便捷计量，Token 模式应由选择器重新估算。
 *
 * @example
 * ```ts
 * const unit: ModelExecutionUnit = {
 *     executionUnitId: "execution-1",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     phase: "executing",
 *     firstSequence: 10,
 *     lastSequence: 14,
 *     items: events,
 *     events,
 *     characterCount: 320,
 * };
 * ```
 */
export interface ModelExecutionUnit {
    readonly executionUnitId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly phase: "executing";
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly items: readonly TrajectoryEvent[];
    readonly events: readonly TrajectoryEvent[];
    readonly characterCount: number;
}

/**
 * Execution Unit Adapter 的提交边界和可选身份约束。
 *
 * @example
 * ```ts
 * const options: TrajectoryExecutionUnitAdapterOptions = {
 *     committedThroughSequence: 42,
 *     goalId: "goal-1",
 *     runId: "run-1",
 * };
 * ```
 */
export interface TrajectoryExecutionUnitAdapterOptions {
    /** 只允许序号不大于该 Snapshot 边界的事件进入投影。 */
    readonly committedThroughSequence: number;
    /** 可选的预期 Goal 身份；不匹配时立即失败。 */
    readonly goalId?: string;
    /** 可选的预期 Run 身份；不匹配时立即失败。 */
    readonly runId?: string;
}

/**
 * 读取 committed Trajectory 并构建完整执行单元。
 *
 * @remarks
 * Adapter 会忽略提交边界之外的 tail，但会严格校验边界内事件的序号、Goal/Run
 * 身份、执行阶段、单元连续性和事件配对。成功的 Tool 单元必须包含 Decision、已
 * 批准 Action、Tool 开始/结果与 Observation；非 Tool Decision 必须包含对应终态。
 * 不完整单元被排除而不被拆分，结构矛盾则抛出 `MODEL_CONTEXT_SOURCE_ERROR`。
 *
 * @example
 * ```ts
 * const adapter = new TrajectoryExecutionUnitAdapter();
 * const units = adapter.adapt(events, { committedThroughSequence: 42 });
 * ```
 */
export class TrajectoryExecutionUnitAdapter {
    /**
     * @param source - 按序读取的同一或多个 Goal/Run Domain Events。
     * @param boundary - Snapshot 提交边界或包含该边界的选项。
     * @returns 只包含合法完整执行单元的冻结列表。
     * @throws `ModelContextSourceError` 当边界内来源身份、顺序或配对非法时。
     */
    adapt(
        source: readonly TrajectoryEvent[],
        boundary: number | TrajectoryExecutionUnitAdapterOptions,
    ): readonly ModelExecutionUnit[] {
        const options = typeof boundary === "number"
            ? { committedThroughSequence: boundary }
            : boundary;
        assertNonNegativeSafeInteger(
            options.committedThroughSequence,
            "committedThroughSequence",
        );

        const committed: TrajectoryEvent[] = [];
        let previousSequence = 0;
        let expectedGoalId = options.goalId;
        let expectedRunId = options.runId;

        for (const event of source) {
            if (event.sequence > options.committedThroughSequence) continue;

            const immutableEvent = freezeTrajectoryEvent(event) as TrajectoryEvent;
            if (immutableEvent.sequence <= previousSequence) {
                throw new ModelContextSourceError(
                    "Committed Trajectory events must be strictly ordered by sequence",
                );
            }
            previousSequence = immutableEvent.sequence;

            expectedGoalId ??= immutableEvent.goalId;
            expectedRunId ??= immutableEvent.runId;
            if (
                immutableEvent.goalId !== expectedGoalId
                || immutableEvent.runId !== expectedRunId
            ) {
                throw new ModelContextSourceError(
                    "Committed Trajectory contains cross-Goal or cross-Run events",
                );
            }

            committed.push(immutableEvent);
        }

        const grouped = new Map<string, TrajectoryEvent[]>();
        const order: string[] = [];
        const closedUnitIds = new Set<string>();
        let activeUnitId: string | undefined;

        for (const event of committed) {
            if (!isExecutionUnitEvent(event)) continue;

            if (event.phase !== "executing") {
                throw new ModelContextSourceError(
                    "Execution Unit events must belong to the executing phase",
                );
            }

            const unitId = event.executionUnitId;
            if (activeUnitId !== unitId) {
                if (activeUnitId !== undefined) closedUnitIds.add(activeUnitId);
                if (closedUnitIds.has(unitId)) {
                    throw new ModelContextSourceError(
                        `Execution Unit ${unitId} is not contiguous in Trajectory`,
                    );
                }
                activeUnitId = unitId;
                grouped.set(unitId, []);
                order.push(unitId);
            }

            grouped.get(unitId)!.push(event);
        }

        const units: ModelExecutionUnit[] = [];
        for (const unitId of order) {
            const events = grouped.get(unitId)!;
            const unit = completeExecutionUnit(
                events,
                unitId,
                expectedGoalId,
                expectedRunId,
            );
            if (unit !== undefined) units.push(unit);
        }

        return Object.freeze(units);
    }
}

/** Hot Window 选择结果。 */
export interface HotWindowSelection<T> {
    /** 从最新单元开始、保持原顺序的连续后缀。 */
    readonly selected: readonly T[];
    /** 未进入模型输入的较旧前缀。 */
    readonly omitted: readonly T[];
    /** 本次选择使用的计量单位。 */
    readonly measuredAs: "token" | "character";
    /** 可供 Hot 使用的预算。 */
    readonly budget: number;
    /** 选中单元的实际计量总和。 */
    readonly used: number;
    /** 首个无法整体容纳的单元在输入列表中的索引。 */
    readonly stoppedAtIndex?: number;
}

/** Hot Window 选择器的可选输入。 */
export interface HotWindowSelectionOptions<T> {
    /** 可供 Hot 使用的非负安全整数预算。 */
    readonly budget: number;
    /** 把一个执行单元投影为最终计量结构；省略时优先使用其 `items`。 */
    readonly project?: (unit: T) => unknown;
}

/**
 * 从最新执行单元向旧单元选择连续后缀。
 *
 * @remarks
 * 选择器在首个无法完整容纳的单元处停止，不拆分该单元，也不跳过它继续选择更
 * 旧单元。最新单元自身超出预算时结果为空；这与旧 Conversation Compactor 的
 * “强制保留最新单元”语义不同。选择器无会话状态且不修改输入。
 *
 * @example
 * ```ts
 * const selector = new HotWindowSelector(tokenEstimator);
 * const result = selector.select(units, { budget: 4096 });
 * ```
 */
export class HotWindowSelector<T> {
    private readonly estimator: ModelInputEstimator;

    /** @param estimator - 对最终单元投影执行 Token 或字符计量的适配器。 */
    constructor(estimator: ModelInputEstimator = new CharacterModelInputEstimator()) {
        this.estimator = estimator;
    }

    /**
     * @param units - 按旧到新排列的完整执行单元。
     * @param input - Hot 预算，或直接传入预算数值。
     * @param project - 直接传入预算时可选的最终结构投影函数。
     * @returns 不可变的连续后缀选择报告。
     * @throws RangeError 当预算或计量结果非法时。
     */
    select(
        units: readonly T[],
        input: number | HotWindowSelectionOptions<T>,
        project?: (unit: T) => unknown,
    ): HotWindowSelection<T> {
        const options = typeof input === "number"
            ? { budget: input, ...(project === undefined ? {} : { project }) }
            : input;
        assertNonNegativeSafeInteger(options.budget, "hotBudget");

        const projectUnit = options.project ?? defaultHotProjection;
        let used = 0;
        let start = units.length;
        let stoppedAtIndex: number | undefined;

        for (let index = units.length - 1; index >= 0; index -= 1) {
            const measured = this.estimator.estimate(projectUnit(units[index]!));
            assertNonNegativeSafeInteger(measured, "estimated execution unit size");

            if (measured > options.budget - used) {
                stoppedAtIndex = index;
                break;
            }

            used += measured;
            start = index;
        }

        const selected = Object.freeze([...units.slice(start)]);
        const omitted = Object.freeze([...units.slice(0, start)]);
        return Object.freeze({
            selected,
            omitted,
            measuredAs: this.estimator.unit,
            budget: options.budget,
            used,
            ...(stoppedAtIndex === undefined ? {} : { stoppedAtIndex }),
        });
    }
}

const EXECUTION_UNIT_EVENT_TYPES = new Set([
    "decision_received",
    "action_staged",
    "tool_started",
    "tool_finished",
    "observation_recorded",
    "run_completed",
    "run_waiting",
    "run_failed",
    "run_cancelled",
    "execution_error",
]);

function isExecutionUnitEvent(
    event: TrajectoryEvent,
): event is TrajectoryEvent & { readonly executionUnitId: string } {
    return event.executionUnitId !== undefined
        && EXECUTION_UNIT_EVENT_TYPES.has(event.eventType);
}

function completeExecutionUnit(
    events: readonly TrajectoryEvent[],
    executionUnitId: string,
    goalId: string | undefined,
    runId: string | undefined,
): ModelExecutionUnit | undefined {
    const decisions = events.filter((event) => event.eventType === "decision_received");
    if (decisions.length === 0) return undefined;
    if (decisions.length !== 1) {
        throw new ModelContextSourceError(
            `Execution Unit ${executionUnitId} contains multiple decisions`,
        );
    }

    const decision = decisions[0]!.payload.decision;
    if (decision.kind === "tool_call") {
        const staged = events.filter((event) => event.eventType === "action_staged");
        const started = events.filter((event) => event.eventType === "tool_started");
        const finished = events.filter((event) => event.eventType === "tool_finished");
        const observations = events.filter(
            (event) => event.eventType === "observation_recorded",
        );
        const terminals = events.filter((event) => [
            "run_completed",
            "run_waiting",
            "run_failed",
            "run_cancelled",
            "execution_error",
        ].includes(event.eventType));

        if (staged.length > 1 || started.length > 1 || finished.length > 1 || observations.length > 1) {
            throw new ModelContextSourceError(
                `Execution Unit ${executionUnitId} contains duplicate action lifecycle events`,
            );
        }
        if (terminals.length > 0) {
            throw new ModelContextSourceError(
                `Tool Execution Unit ${executionUnitId} contains a terminal event`,
            );
        }
        if (
            staged.length !== 1
            || staged[0]!.payload.approvalStatus !== "approved"
            || started.length !== 1
            || finished.length !== 1
            || observations.length !== 1
        ) {
            return undefined;
        }

        const actionId = decision.action.actionId;
        if (
            staged[0]!.payload.action.actionId !== actionId
            || started[0]!.payload.actionId !== actionId
            || finished[0]!.payload.actionId !== actionId
            || observations[0]!.payload.actionId !== actionId
        ) {
            throw new ModelContextSourceError(
                `Execution Unit ${executionUnitId} contains mismatched action identities`,
            );
        }
    } else {
        const terminals = events.filter((event) => [
            "run_completed",
            "run_waiting",
            "run_failed",
        ].includes(event.eventType));
        if (terminals.length === 0) return undefined;
        if (terminals.length !== 1) {
            throw new ModelContextSourceError(
                `Execution Unit ${executionUnitId} contains multiple terminal events`,
            );
        }

        const expectedTerminal = decision.kind === "complete"
            ? "run_completed"
            : decision.kind === "wait"
                ? "run_waiting"
                : "run_failed";
        if (terminals[0]!.eventType !== expectedTerminal) {
            throw new ModelContextSourceError(
                `Execution Unit ${executionUnitId} terminal event does not match its decision`,
            );
        }

        if (events.some((event) => [
            "action_staged",
            "tool_started",
            "tool_finished",
            "observation_recorded",
        ].includes(event.eventType))) {
            throw new ModelContextSourceError(
                `Non-tool Execution Unit ${executionUnitId} contains Tool events`,
            );
        }
    }

    const items = Object.freeze([...events]);
    return Object.freeze({
        executionUnitId,
        goalId: goalId ?? events[0]!.goalId,
        runId: runId ?? events[0]!.runId,
        phase: "executing" as const,
        firstSequence: events[0]!.sequence,
        lastSequence: events.at(-1)!.sequence,
        items,
        events: items,
        characterCount: stableJson(items).length,
    });
}

function defaultHotProjection(value: unknown): unknown {
    if (typeof value === "object" && value !== null && "items" in value) {
        const items = (value as { readonly items?: unknown }).items;
        if (Array.isArray(items)) return items;
    }
    return value;
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${field} must be a non-negative safe integer`);
    }
}
