/**
 * 按键串行执行异步操作的进程内队列。
 *
 * @remarks
 * 同一 key 上的操作严格按提交顺序执行，后一个操作只在前一个操作结算后开始。
 * 一个操作拒绝只拒绝它自己的 Promise，同一 key 的后续操作与其它 key 的操作
 * 继续执行。最后一个排队操作结算后队列删除该 key 的簿记；簿记 Promise 本身
 * 不会产生未处理的拒绝。队列只提供进程内顺序，不提供跨进程锁。
 *
 * @example
 * ```ts
 * const queue = new KeyedSerialQueue();
 * await queue.run("goal-1", async () => store.save(goal));
 * await queue.drain("goal-1");
 * ```
 */
export class KeyedSerialQueue {
    private readonly tails = new Map<string, Promise<void>>();

    /** 当前仍有排队或执行中工作的 key 数量。 */
    get pendingKeyCount(): number {
        return this.tails.size;
    }

    /**
     * 在指定 key 上串行执行一个操作。
     *
     * @param key - 需要保持提交顺序的稳定标识。
     * @param operation - 前一个同 key 操作结算后才开始的工作。
     * @returns 该操作的结算结果；拒绝只属于该操作自身。
     */
    run<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const result = previous.then(operation, operation);
        const tracked = result.then(
            () => undefined,
            () => undefined,
        );

        this.tails.set(key, tracked);
        void tracked
            .finally(() => {
                if (this.tails.get(key) === tracked) this.tails.delete(key);
            })
            .catch(() => undefined);

        return result;
    }

    /**
     * 等待指定 key 当前已排队工作全部结算。
     *
     * @param key - 需要等待的稳定标识。
     * @returns 当前已排队工作结算后 resolve；key 空闲时立即 resolve。
     */
    drain(key: string): Promise<void> {
        return this.tails.get(key) ?? Promise.resolve();
    }
}
