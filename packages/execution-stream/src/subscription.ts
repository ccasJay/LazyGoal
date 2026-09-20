import type { ExecutionStreamEvent } from "./event";
import type { StreamSubscriptionCloseReason } from "./policy";

/** Stream Core 订阅回调。 */
export type ExecutionStreamListener = (event: ExecutionStreamEvent) => void;

/**
 * 单个 Goal/Run 的流式订阅。
 *
 * @remarks
 * 调用方可以选择 AsyncIterable 或 `onEvent` 回调消费；两种方式不应在同一
 * 订阅上混用。关闭后不会再产生新事件，未消费的队列内容会被释放。
 *
 * @example
 * ```ts
 * const subscription = publisher.subscribe({ goalId: "g", runId: "r" });
 * for await (const event of subscription) {
 *     console.log(event.kind);
 * }
 * ```
 */
export interface ExecutionStreamSubscription extends AsyncIterable<ExecutionStreamEvent> {
    /** 注册事件回调并返回幂等取消函数。 */
    onEvent(listener: ExecutionStreamListener): () => void;
    /** 主动结束订阅。 */
    close(): void;
    /** 当前订阅是否已关闭。 */
    readonly closed: boolean;
    /** 订阅关闭原因；仍开放时为 `undefined`。 */
    readonly closeReason: StreamSubscriptionCloseReason | undefined;
}

type PendingResult = IteratorResult<ExecutionStreamEvent>;

/** @internal Publisher 使用的有界异步队列实现。 */
export class BufferedExecutionStreamSubscription implements ExecutionStreamSubscription {
    private readonly queue: ExecutionStreamEvent[] = [];
    private readonly waiters: Array<(result: PendingResult) => void> = [];
    private readonly listeners = new Set<ExecutionStreamListener>();
    private closedState = false;
    private reason: StreamSubscriptionCloseReason | undefined;

    get closed(): boolean {
        return this.closedState;
    }

    get closeReason(): StreamSubscriptionCloseReason | undefined {
        return this.reason;
    }

    /** @internal 推送事件；返回 false 表示已关闭。 */
    push(event: ExecutionStreamEvent): boolean {
        if (this.closedState) return false;

        if (this.listeners.size > 0) {
            for (const listener of this.listeners) {
                try {
                    listener(event);
                } catch {
                    // 订阅者故障不能反向改变生产者执行语义。
                }
            }
            return true;
        }

        const waiter = this.waiters.shift();
        if (waiter !== undefined) {
            waiter({ value: event, done: false });
            return true;
        }

        this.queue.push(event);
        return true;
    }

    /** @internal 合并尚未消费的增量事件。 */
    replaceLast(event: ExecutionStreamEvent): boolean {
        if (this.closedState || this.queue.length === 0) return false;
        this.queue[this.queue.length - 1] = event;
        return true;
    }

    /** @internal 当前待消费数量。 */
    get size(): number {
        return this.queue.length;
    }

    /** @internal 查看尚未消费的最后一个事件。 */
    peekLast(): ExecutionStreamEvent | undefined {
        return this.queue.at(-1);
    }

    onEvent(listener: ExecutionStreamListener): () => void {
        if (this.closedState) return () => undefined;
        this.listeners.add(listener);
        if (this.queue.length > 0) {
            const pending = this.queue.splice(0);
            for (const event of pending) {
                try {
                    listener(event);
                } catch {
                    // 订阅者故障隔离在回调边界。
                }
            }
        }
        return () => {
            this.listeners.delete(listener);
        };
    }

    close(reason: StreamSubscriptionCloseReason = "closed"): void {
        if (this.closedState) return;
        this.closedState = true;
        this.reason = reason;
        this.queue.length = 0;
        const waiters = this.waiters.splice(0);
        for (const waiter of waiters) waiter({ value: undefined, done: true });
        this.listeners.clear();
    }

    next(): Promise<PendingResult> {
        const event = this.queue.shift();
        if (event !== undefined) return Promise.resolve({ value: event, done: false });
        if (this.closedState) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
            this.waiters.push(resolve);
        });
    }

    return(): Promise<PendingResult> {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
    }

    [Symbol.asyncIterator](): AsyncIterator<ExecutionStreamEvent> {
        return this;
    }
}
