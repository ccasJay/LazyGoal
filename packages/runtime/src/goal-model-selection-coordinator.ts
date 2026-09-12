import type { Goal, GoalModelSelection, RunRef } from "./domain.js";
import { throwIfAborted, type ExecutionControl } from "./execution-control.js";
import type { GoalStore } from "./goal-store.js";

/**
 * 切换模型选择请求的稳定业务错误分类。
 */
export type GoalModelSelectionErrorCode =
    | "GOAL_NOT_FOUND"
    | "RUN_MISMATCH"
    | "GOAL_NOT_WAITING"
    | "SAVE_FAILED";

/**
 * 提交 Goal 模型选择更新的请求参数。
 */
export interface GoalModelSelectionRequest {
    /** 目标 Goal 与当前 Run 的关联引用。 */
    readonly ref: RunRef;
    /** 用户确认的合法模型选择状态。 */
    readonly selection: GoalModelSelection;
}

/**
 * Goal 模型选择协调更新的结果契约。
 */
export type GoalModelSelectionResult =
    | {
        readonly ok: true;
        readonly goal: Goal;
    }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: GoalModelSelectionErrorCode;
            readonly message: string;
        };
        readonly goal?: Goal | undefined;
    };

/**
 * Goal 模型选择协调器契约。
 *
 * @remarks
 * 负责在安全等待点将用户确认的新模型选择原子持久化到 Goal 快照中。
 * 仅允许在 question、planning approval feedback 和 executing blocked 三类等待点保存；
 * 在运行中、终态、Run 不匹配或非文本等待点拒绝保存，且不引发任何副作用。
 *
 * @example
 * ```ts
 * const coordinator = new DefaultGoalModelSelectionCoordinator({ store });
 * const result = await coordinator.updateModelSelection({
 *   ref: { goalId: "goal-1", runId: "run-1" },
 *   selection: newSelection,
 * });
 * ```
 */
export interface GoalModelSelectionCoordinator {
    /**
     * 在匹配的安全等待点更新并持久化 Goal 的模型选择。
     *
     * @param request - 包含目标 Goal 引用与新模型选择。
     * @param control - 可选的执行中止信号控制。
     * @returns 切换结果；包含成功后的新 Goal 或失败原因及旧 Goal。
     */
    updateModelSelection(
        request: GoalModelSelectionRequest,
        control?: ExecutionControl,
    ): Promise<GoalModelSelectionResult>;
}

/**
 * 判断指定 Goal 是否处于允许切换模型的安全文本等待点。
 *
 * @remarks
 * 仅包含三类状态：
 * 1. question：`gathering_context` 且 `preparation.status === "waiting_input"`；
 * 2. planning approval feedback：`planning` 且 `preparation.status === "waiting_approval"`；
 * 3. executing blocked：`executing` 且 `run.status === "waiting"` 且无待批准的 pendingAction。
 *
 * @param goal - 当前目标 Goal 聚合。
 * @returns 是否为安全等待点。
 *
 * @example
 * ```ts
 * if (isSafeWaitingPointForModelSwitching(goal)) {
 *   // 允许弹出模型选择器
 * }
 * ```
 */
export function isSafeWaitingPointForModelSwitching(goal: Goal): boolean {
    const workflow = goal.state.workflow;
    const run = goal.state.run;

    // 终态一律拒绝
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        return false;
    }

    // 1. question: gathering_context 且 preparation waiting_input
    if (
        workflow.phase === "gathering_context" &&
        workflow.preparation.status === "waiting_input"
    ) {
        return true;
    }

    // 2. planning approval feedback: planning 且 preparation waiting_approval
    if (
        workflow.phase === "planning" &&
        workflow.preparation.status === "waiting_approval"
    ) {
        return true;
    }

    // 3. executing blocked: executing 且 run.status === "waiting" 且无 pendingAction
    if (
        workflow.phase === "executing" &&
        run.status === "waiting" &&
        run.pendingAction === undefined &&
        run.stopReason === undefined
    ) {
        return true;
    }

    return false;
}

function cloneModelSelection(selection: GoalModelSelection): GoalModelSelection {
    return {
        provider: selection.provider,
        modelId: selection.modelId,
        structuredOutputMode: selection.structuredOutputMode,
        ...(selection.contextWindowTokens !== undefined ? { contextWindowTokens: selection.contextWindowTokens } : {}),
        ...(selection.maxOutputTokens !== undefined ? { maxOutputTokens: selection.maxOutputTokens } : {}),
        inputEstimator: selection.inputEstimator.kind === "character-v1"
            ? { kind: "character-v1" }
            : { kind: "token-encoding", encoding: selection.inputEstimator.encoding },
    };
}

/**
 * 默认的 Goal 模型选择协调器实现。
 */
export class DefaultGoalModelSelectionCoordinator implements GoalModelSelectionCoordinator {
    constructor(
        private readonly dependencies: {
            readonly store: GoalStore;
        },
    ) {}

    public async updateModelSelection(
        request: GoalModelSelectionRequest,
        control?: ExecutionControl,
    ): Promise<GoalModelSelectionResult> {
        throwIfAborted(control);

        const goal = await this.dependencies.store.restore(request.ref.goalId);
        if (goal === undefined) {
            return {
                ok: false,
                error: {
                    code: "GOAL_NOT_FOUND",
                    message: `Goal "${request.ref.goalId}" was not found`,
                },
            };
        }

        if (goal.state.run.id !== request.ref.runId) {
            return {
                ok: false,
                error: {
                    code: "RUN_MISMATCH",
                    message: `Run ID "${request.ref.runId}" does not match active Run "${goal.state.run.id}"`,
                },
                goal,
            };
        }

        if (!isSafeWaitingPointForModelSwitching(goal)) {
            return {
                ok: false,
                error: {
                    code: "GOAL_NOT_WAITING",
                    message: "Goal is not in a safe text waiting state for model switching",
                },
                goal,
            };
        }

        const updatedGoal: Goal = {
            ...goal,
            state: {
                ...goal.state,
                modelSelection: cloneModelSelection(request.selection),
            },
        };

        throwIfAborted(control);

        try {
            await this.dependencies.store.save(updatedGoal);
        } catch (error) {
            return {
                ok: false,
                error: {
                    code: "SAVE_FAILED",
                    message: error instanceof Error ? error.message : String(error),
                },
                goal,
            };
        }

        return {
            ok: true,
            goal: updatedGoal,
        };
    }
}
