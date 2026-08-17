import type { Goal } from "./domain";
import type { GoalStore } from "./goal-store";

/** Checkpoint Gate 冻结后拒绝新保存请求时使用的稳定错误代码。 */
export const CHECKPOINT_GATE_FROZEN_CODE = "CHECKPOINT_GATE_FROZEN" as const;

/**
 * 表示 Checkpoint Gate 已冻结，当前保存不会再进入底层存储。
 *
 * @remarks
 * 该错误只表示关闭流程拒绝了一个尚未进入底层 Store 的新写入；已经通过
 * Gate 的保存仍会继续完成，调用方不应通过此错误回滚或修改 Goal 状态。
 *
 * @example
 * ```ts
 * try {
 *     await gate.save(goal);
 * } catch (error) {
 *     if (error instanceof CheckpointGateFrozenError) {
 *         // 关闭流程正在保留最近成功检查点
 *     }
 * }
 * ```
 */
export class CheckpointGateFrozenError extends Error {
    readonly code = CHECKPOINT_GATE_FROZEN_CODE;

    constructor(message = "Checkpoint gate is frozen") {
        super(message);
        this.name = "CheckpointGateFrozenError";
    }
}

/**
 * 在关闭流程中保护 GoalStore 写入边界的单向闸门。
 *
 * @remarks
 * Gate 只拦截 `freeze()` 之后新发起的 `save`；冻结前已经进入的保存会继续
 * 等待底层 Store 完成。`restore` 始终可用，以便关闭和恢复流程读取最近一次
 * 成功持久化的快照。Gate 一旦冻结不能重新打开。
 *
 * @example
 * ```ts
 * const gate = new CheckpointGateGoalStore(store);
 * await gate.save(goal);
 * gate.freeze();
 * await gate.waitForIdle();
 * ```
 */
export class CheckpointGateGoalStore implements GoalStore {
    private frozen = false;
    private activeSaves = 0;
    private readonly idleResolvers: Array<() => void> = [];

    /** @param delegate - 负责实际校验和持久化的底层 GoalStore。 */
    constructor(private readonly delegate: GoalStore) {}

    /**
     * 当前是否已经拒绝新的保存请求。
     *
     * @returns Gate 是否处于不可逆冻结状态。
     */
    get isFrozen(): boolean {
        return this.frozen;
    }

    /**
     * 冻结新保存请求。
     *
     * @remarks
     * 重复调用没有副作用；不会取消或回滚已经进入底层 Store 的保存。
     */
    freeze(): void {
        this.frozen = true;
    }

    /**
     * 保存一个 Goal 快照。
     *
     * @param goal - 需要写入底层 Store 的完整 Goal 快照。
     * @throws CheckpointGateFrozenError 当 Gate 已冻结；底层 Store 的协议或
     * I/O 错误会原样传播。
     */
    async save(goal: Goal): Promise<void> {
        if (this.frozen) {
            throw new CheckpointGateFrozenError();
        }

        this.activeSaves += 1;

        try {
            await this.delegate.save(goal);
        } finally {
            this.activeSaves -= 1;
            this.resolveIdleWaiters();
        }
    }

    /**
     * 恢复指定 Goal 的最近成功快照。
     *
     * @param goalId - Goal 的稳定标识。
     * @returns 底层 Store 返回的快照；Gate 冻结不影响读取。
     * @throws 底层 Store 的协议或 I/O 错误。
     */
    restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }

    /**
     * 等待所有已进入 Gate 的保存完成。
     *
     * @returns 当活动保存数归零时完成；没有活动保存时立即完成。
     * @remarks 该方法不会解除冻结，也不会启动新的保存。
     */
    waitForIdle(): Promise<void> {
        if (this.activeSaves === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.idleResolvers.push(resolve);
        });
    }

    private resolveIdleWaiters(): void {
        if (this.activeSaves !== 0) {
            return;
        }

        const resolvers = this.idleResolvers.splice(0);
        for (const resolve of resolvers) {
            resolve();
        }
    }
}
