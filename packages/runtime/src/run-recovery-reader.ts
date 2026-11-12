import type { Goal, RunRef } from "./domain";
import type { GoalStore } from "./goal-store";
import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type {
    TrajectoryEvent,
    TrajectoryReadResult,
    TrajectoryStore,
} from "./trajectory";

/**
 * Run 导航历史恢复失败。
 *
 * @remarks
 * 当已提交历史无法读取，或启用 Trajectory 的 Run 声明了非零提交水位但
 * Trajectory 中缺少该边界时抛出。错误保留 Goal/Run 身份和原始原因，调用方
 * 必须停止本次依赖该导航的模型推进，不得用空历史替代失败。
 *
 * @example
 * ```ts
 * try {
 *     await reader.readNavigationHistory(ref, boundary);
 * } catch (error) {
 *     if (error instanceof RunNavigationRecoveryError) {
 *         console.error(error.goalId, error.runId, error.cause);
 *     }
 * }
 * ```
 */
export class RunNavigationRecoveryError extends Error {
    /** 导航历史所属的 Goal 稳定标识。 */
    readonly goalId: string;
    /** 导航历史所属的 Run 稳定标识。 */
    readonly runId: string;

    /**
     * @param ref - 导航历史所属的 Goal 与 Run。
     * @param message - 描述恢复失败原因的诊断信息。
     * @param options - 可选原始原因。
     */
    constructor(ref: RunRef, message: string, options?: { readonly cause?: unknown }) {
        super(message, options);
        this.name = "RunNavigationRecoveryError";
        this.goalId = ref.goalId;
        this.runId = ref.runId;
    }
}

/**
 * 创建只读恢复入口所需的持久化端口。
 *
 * @example
 * ```ts
 * const reader = new RunRecoveryReader({ store, trajectoryStore });
 * ```
 */
export interface RunRecoveryReaderDependencies {
    /** 最新 Goal 快照的只读来源。 */
    readonly store: GoalStore;
    /** 已提交轨迹事实的只读来源；省略时不支持轨迹恢复查询。 */
    readonly trajectoryStore?: TrajectoryStore;
}

/**
 * 读取并校验 Run 身份及其已提交恢复输入，不推进状态也不写入存储。
 *
 * @remarks
 * Runner 使用该边界恢复 Goal 身份和受 Snapshot 提交序号约束的 Trajectory。
 * 类不缓存快照；调用方仍须通过共享提交器拥有状态推进和持久化。
 *
 * @example
 * ```ts
 * const reader = new RunRecoveryReader({ store, trajectoryStore });
 * const goal = await reader.restoreGoal({ goalId, runId }, control);
 * ```
 */
export class RunRecoveryReader {
    private readonly store: GoalStore;
    private readonly trajectoryStore: TrajectoryStore | undefined;

    /** @param dependencies - 只读快照和轨迹持久化端口。 */
    constructor(dependencies: RunRecoveryReaderDependencies) {
        this.store = dependencies.store;
        this.trajectoryStore = dependencies.trajectoryStore;
    }

    /**
     * 按 Goal/Run 身份读取最新快照。
     *
     * @param ref - 必须匹配的 Goal 与 Run 身份。
     * @param control - 可选的调用级取消控制。
     * @returns 身份匹配的最新快照；不存在或身份不匹配时返回 `undefined`。
     * @throws 底层读取失败或调用被中止时传播原错误。
     */
    async restoreGoal(ref: RunRef, control?: ExecutionControl): Promise<Goal | undefined> {
        throwIfAborted(control);
        const goal = await this.store.restore(ref.goalId);
        throwIfAborted(control);
        if (goal === undefined || goal.id !== ref.goalId || goal.state.run.id !== ref.runId) {
            return undefined;
        }
        return goal;
    }

    /**
     * 读取 Snapshot 提交边界内的轨迹事实及其未提交尾部。
     *
     * @param ref - 轨迹事实所属的 Goal 与 Run。
     * @param committedThroughSequence - 最新成功提交 Snapshot 声明的事实序号。
     * @param control - 可选的调用级取消控制。
     * @returns Store 按指定边界读取的事实和未提交尾部。
     * @throws 未配置轨迹 Store、读取失败或调用被中止时抛出异常。
     */
    async readTrajectory(
        ref: RunRef,
        committedThroughSequence: number,
        control?: ExecutionControl,
    ): Promise<TrajectoryReadResult> {
        if (this.trajectoryStore === undefined) {
            throw new Error("Trajectory recovery requires an enabled Trajectory store");
        }
        throwIfAborted(control);
        const result = await this.trajectoryStore.readWithBoundary(ref, committedThroughSequence);
        throwIfAborted(control);
        return result;
    }

    /**
     * 读取一个 Run 在自身 Snapshot 提交边界内的导航历史。
     *
     * @remarks
     * 边界必须来自该 `(goalId, runId)` 的最新 Snapshot，不能使用其它 Run 的水位。
     * 读取失败、边界非法，或声明的非零水位在 Trajectory 中缺少对应提交边界时，
     * 返回保留 Goal/Run 身份与原错误的恢复失败；零水位且确实无历史时返回空数组。
     *
     * @param ref - 导航历史所属的 Goal 与 Run。
     * @param committedThroughSequence - 该 Run 最新 Snapshot 声明的提交边界。
     * @param control - 可选的调用级取消控制。
     * @returns 边界内按序号升序排列的只读事实。
     * @throws RunNavigationRecoveryError 读取失败或非零水位缺少提交边界时抛出。
     * @throws 调用被中止时传播 `ExecutionAbortedError`。
     */
    async readNavigationHistory(
        ref: RunRef,
        committedThroughSequence: number,
        control?: ExecutionControl,
    ): Promise<readonly TrajectoryEvent[]> {
        const trajectoryStore = this.trajectoryStore;
        if (trajectoryStore === undefined) {
            throw new RunNavigationRecoveryError(
                ref,
                "Run navigation requires an enabled Trajectory store",
            );
        }
        if (!Number.isSafeInteger(committedThroughSequence) || committedThroughSequence < 0) {
            throw new RunNavigationRecoveryError(
                ref,
                "Run navigation commit boundary is invalid",
            );
        }
        throwIfAborted(control);
        let result: TrajectoryReadResult;
        try {
            result = await trajectoryStore.readWithBoundary(ref, committedThroughSequence);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            throw new RunNavigationRecoveryError(
                ref,
                "Committed navigation history could not be read",
                { cause: error },
            );
        }
        throwIfAborted(control);
        const committed = result.committed;
        if (committedThroughSequence > 0
            && (committed.length === 0
                || committed[committed.length - 1]!.sequence !== committedThroughSequence)) {
            throw new RunNavigationRecoveryError(
                ref,
                "Committed navigation boundary is missing from Trajectory",
            );
        }
        return committed;
    }
}
