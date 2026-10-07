import type { Goal, RunRef } from "./domain";
import type { GoalStore } from "./goal-store";
import {
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type { TrajectoryReadResult, TrajectoryStore } from "./trajectory";

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
}
