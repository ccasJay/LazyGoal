import type { Goal, GoalStore } from "../../runtime/src/index";

/**
 * 带有原子提交通知能力的 GoalStore 装饰器。
 *
 * @remarks
 * 在底层 GoalStore 的 `save()` 成功完成后，发布只读的 Goal 快照副本。
 * 外部订阅者抛出的任何异常都会被捕获隔离，绝不会将已持久化的成功操作回退或标记为异常。
 *
 * @example
 * ```ts
 * const store = new NotifyingGoalStore(baseStore);
 * const unsubscribe = store.onSave((goal) => {
 *     console.log("Committed goal step:", goal.state.run.stepCount);
 * });
 * ```
 */
export class NotifyingGoalStore implements GoalStore {
    private readonly listeners = new Set<(goal: Goal) => void>();

    /**
     * @param delegate - 被包装的基础 GoalStore 实例。
     */
    constructor(private readonly delegate: GoalStore) {}

    /**
     * 保存 Goal 最新快照并广播提交通知。
     *
     * @param goal - 待保存的完整 Goal 对象。
     * @throws 底层存储保存失败时抛出异常；订阅者抛出的异常会被捕获隔离。
     */
    async save(goal: Goal): Promise<void> {
        await this.delegate.save(goal);
        const snapshot = structuredClone(goal);
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            } catch {
                // 订阅者异常视为 UI/投影非致命错误，不改变底层存储成功语义
            }
        }
    }

    /**
     * 读取指定 Goal 的最新快照。
     *
     * @param goalId - 目标 Goal 的唯一标识。
     * @returns 存在时返回 Goal，不存在时返回 undefined。
     */
    async restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }

    /**
     * 注册 Goal 成功保存后的监听器。
     *
     * @param listener - 保存成功后调用的只读快照回调。
     * @returns 注销该监听器的清理函数。
     */
    onSave(listener: (goal: Goal) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
