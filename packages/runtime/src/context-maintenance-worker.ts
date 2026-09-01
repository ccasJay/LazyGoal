import type { Goal } from "./domain";
import type { ManagedResource } from "./shutdown";

/** 提交成功后的上下文维护通知。 */
export interface ContextMaintenanceNotification {
    readonly goal: Goal;
    readonly committedThroughSequence: number;
}

/** Runtime 提交器使用的后台维护端口。 */
export interface ContextMaintenancePort {
    /** 非阻塞通知；实现应按 Goal/Run 合并重复 boundary。 */
    notifyCommitted(input: ContextMaintenanceNotification): void;
}

/** 后台维护任务实现。 */
export type ContextMaintenanceTask = (input: ContextMaintenanceNotification, signal: AbortSignal) => Promise<void>;

/**
 * 按 Goal/Run single-flight 合并维护任务的 Worker。
 *
 * @remarks
 * `notifyCommitted` 永不等待维护任务；同一 Goal 的重复通知只保留最高 boundary。
 * 关闭后不再接收新通知，`forceClose` 会中止当前任务。
 */
export class ContextMaintenanceWorker implements ContextMaintenancePort, ManagedResource {
    private readonly pending = new Map<string, ContextMaintenanceNotification>();
    private readonly running = new Map<string, Promise<void>>();
    private readonly controller = new AbortController();
    private closed = false;

    constructor(
        private readonly task: ContextMaintenanceTask = async () => undefined,
    ) {}

    notifyCommitted(input: ContextMaintenanceNotification): void {
        if (this.closed) return;
        const key = `${input.goal.id}:${input.goal.state.run.id}`;
        const previous = this.pending.get(key);
        if (previous === undefined || input.committedThroughSequence >= previous.committedThroughSequence) {
            this.pending.set(key, input);
        }
        this.pump(key);
    }

    async close(): Promise<void> {
        this.closed = true;
        await Promise.all([...this.running.values()]);
    }

    async forceClose(): Promise<void> {
        this.closed = true;
        this.controller.abort();
        await Promise.allSettled([...this.running.values()]);
        this.pending.clear();
    }

    private pump(key: string): void {
        if (this.running.has(key)) return;
        const input = this.pending.get(key);
        if (input === undefined) return;
        this.pending.delete(key);
        const operation = Promise.resolve()
            .then(() => this.task(input, this.controller.signal))
            .catch(() => undefined)
            .finally(() => {
                this.running.delete(key);
                if (!this.closed) this.pump(key);
            });
        this.running.set(key, operation);
    }
}
