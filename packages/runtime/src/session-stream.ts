import type {
    ExecutionStreamEvent,
    ExecutionStreamPublisher,
    ExecutionStreamSubscription,
    StreamSubscriptionPolicy,
} from "../../execution-stream/src/index";
import type { GoalSessionState } from "./session";
import type { SessionInputKind, SessionInputReceipt, SessionInputRejectionCode } from "./session-input";
import type { Goal } from "./domain";
import {
    classifySessionStreamEvent,
    type SessionOutputEvent,
} from "./session-output";

/**
 * 一条输入受理／拒绝对应的公开结果。
 *
 * @example
 * ```ts
 * const outcome: SessionInputOutcome = {
 *   goalId: "goal-1", inputId: "input-1", kind: "message", ok: true,
 * };
 * ```
 */
export interface SessionInputOutcome {
    /** 受理该输入的 Goal。 */
    readonly goalId: string;
    /** 输入身份。 */
    readonly inputId: string;
    /** 输入种类。 */
    readonly kind: SessionInputKind;
    /** 是否已持久化受理。 */
    readonly ok: boolean;
    /** 是否为同身份同载荷的既有收据。 */
    readonly existing?: boolean;
    /** 已受理收据；拒绝时省略。 */
    readonly receipt?: SessionInputReceipt;
    /** 稳定业务拒绝代码；受理成功时省略。 */
    readonly code?: SessionInputRejectionCode;
}

/** 会话输出流的核心事件种类。 */
export { SESSION_INPUT_RESULT_KIND } from "./session-output";

/**
 * 订阅整个 Goal 的输出流。
 *
 * @remarks
 * 调用时立即建立订阅（不延迟到首次 `next()`）；首项是 `state_sync`，其后按
 * 来源顺序输出输入结果与执行活动。Run 结束与切换不关闭订阅；只有调用方退出、
 * 取消订阅、指定 Goal 的所有订阅关闭或背压无法保留控制事件时才结束。
 *
 * @example
 * ```ts
 * const stream = session.events();
 * for await (const event of stream) {
 *     if (event.type === "state_sync") console.log(event.state.runStatus);
 * }
 * ```
 */
export interface SessionOutputStream extends AsyncIterable<SessionOutputEvent> {
    /** 幂等结束该订阅；只释放本订阅的队列与监听，不改变执行。 */
    close(): void;
    /** 当前订阅是否已关闭。 */
    readonly closed: boolean;
    /** 订阅关闭原因；仍开放时为 `undefined`。 */
    readonly closeReason: "closed" | "backpressure" | "publisher_closed" | undefined;
}

/** 会话输出流依赖。 */
export interface GoalSessionStreamDependencies {
    /** 与执行链共享的实时事件发布端口。 */
    readonly publisher: ExecutionStreamPublisher;
    /** 读取 Goal 最新安全会话投影；用于初始同步与重同步。 */
    readonly readState: (goalId: string) => Promise<GoalSessionState | undefined>;
    /** 观察的 Goal。 */
    readonly goalId: string;
    /** 订阅策略；省略时只接收 public 事件。 */
    readonly policy?: StreamSubscriptionPolicy | undefined;
    /** 订阅结束时的通知回调；用于会话句柄释放订阅跟踪。 */
    readonly onClosed?: ((stream: GoalSessionStream) => void) | undefined;
}

/** Go 会话输出队列的异步消费原语。 */
export class GoalSessionStream implements SessionOutputStream {
    private readonly queue: SessionOutputEvent[] = [];
    private readonly waiters: Array<(result: IteratorResult<SessionOutputEvent>) => void> = [];
    private readonly listeners = new Set<(event: SessionOutputEvent) => void>();
    private readonly subscription: ExecutionStreamSubscription;
    private readonly readState: (goalId: string) => Promise<GoalSessionState | undefined>;
    private readonly onClosed: ((stream: GoalSessionStream) => void) | undefined;
    private readonly goalId: string;
    private initialized = false;
    private closedState = false;
    private reason: "closed" | "backpressure" | "publisher_closed" | undefined;
    private unsubscribeMonitor: (() => void) | undefined;

    /** @param dependencies - 发布端口、状态读取与观察 Goal。 */
    constructor(dependencies: GoalSessionStreamDependencies) {
        this.goalId = dependencies.goalId;
        this.readState = dependencies.readState;
        this.onClosed = dependencies.onClosed;
        // 先注册缓冲，再读取一致快照：两者之间提交的变更不会被遗漏。
        this.subscription = dependencies.publisher.subscribeGoal(
            dependencies.goalId,
            dependencies.policy ?? {},
        );
        void this.initialize();
    }

    /** @internal 监视器注入的取消函数；用于在关闭时停止核对。 */
    setMonitorUnsubscribe(unsubscribe: () => void): void {
        if (this.closedState) {
            unsubscribe();
            return;
        }
        this.unsubscribeMonitor = unsubscribe;
    }

    get closed(): boolean {
        return this.closedState;
    }

    get closeReason(): "closed" | "backpressure" | "publisher_closed" | undefined {
        return this.reason;
    }

    /**
     * 按最新提交修订重新同步状态。
     *
     * @remarks 由提交核对任务或缺口事件触发；读取失败报告同步故障，不伪装业务结果。
     * 同步同时比对已提交消息范围与当前等待：订阅期间新保存的消息按稳定身份
     * 发出 `message_committed`，新建立的等待发出 `interaction_required`。
     */
    async resync(): Promise<void> {
        if (this.closedState) return;
        let state: GoalSessionState | undefined;
        try {
            state = await this.readState(this.goalId);
        } catch (error) {
            this.push({
                type: "stream_fault",
                event: { kind: "read_failed", message: error instanceof Error ? error.message : String(error) },
            });
            return;
        }
        if (state === undefined) {
            this.push({
                type: "stream_fault",
                event: { kind: "read_failed", message: `Goal "${this.goalId}" was not found` },
            });
            return;
        }
        this.push({ type: "state_sync", state });
        this.publishDerivedNotifications(state);
    }

    close(reason: "closed" | "backpressure" | "publisher_closed" = "closed"): void {
        if (this.closedState) return;
        // 结束事件先入队，使消费者能观察到关闭原因（含 backpressure）。
        this.push({ type: "closed", reason });
        this.closedState = true;
        this.reason = reason;
        this.unsubscribeMonitor?.();
        this.unsubscribeMonitor = undefined;
        this.subscription.close();
        const waiters = this.waiters.splice(0);
        for (const waiter of waiters) waiter({ value: undefined, done: true });
        this.listeners.clear();
        this.onClosed?.(this);
    }

    onEvent(listener: (event: SessionOutputEvent) => void): () => void {
        if (this.closedState) return () => undefined;
        this.listeners.add(listener);
        if (this.queue.length > 0) {
            const pending = this.queue.splice(0);
            for (const event of pending) {
                try {
                    listener(event);
                } catch {
                    // 监听器故障隔离在回调边界。
                }
            }
        }
        return () => {
            this.listeners.delete(listener);
        };
    }

    next(): Promise<IteratorResult<SessionOutputEvent>> {
        const event = this.queue.shift();
        if (event !== undefined) return Promise.resolve({ value: event, done: false });
        if (this.closedState) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
            this.waiters.push(resolve);
        });
    }

    return(): Promise<IteratorResult<SessionOutputEvent>> {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
    }

    [Symbol.asyncIterator](): AsyncIterator<SessionOutputEvent> {
        return this;
    }

    private async initialize(): Promise<void> {
        await this.resync();
        if (this.closedState) return;
        this.initialized = true;
        // 缓冲交接：丢弃旧执行单元的暂时增量，保留当前 Run 的实时片段。
        const currentRunId = this.lastSyncedRunId;
        while (true) {
            const result = await this.subscription.next();
            if (result.done) {
                this.close(this.subscription.closeReason === "backpressure" ? "backpressure" : "publisher_closed");
                return;
            }
            const event = result.value;
            if (event.kind === "live_gap") {
                await this.resync();
                continue;
            }
            if (event.delivery === "delta" && currentRunId !== undefined && event.runId !== currentRunId) {
                continue;
            }
            const output = this.toOutputEvent(event);
            if (output !== undefined) this.push(output);
        }
    }

    private lastSyncedRunId: string | undefined;
    private readonly notifiedMessageIds = new Set<string>();
    private knownInteractionId: string | undefined;
    private interactionBaselineReady = false;

    /**
     * 比对同步状态，发布订阅期间新出现的正式消息与等待交互。
     *
     * @remarks 首次同步只建立基线：既有消息与等待由 `state_sync` 的范围表达，
     * 不重复通知。之后的每次同步只为新出现的身份发出一次通知。
     *
     * @param state - 刚同步完成的安全会话状态。
     */
    private publishDerivedNotifications(state: GoalSessionState): void {
        const messageIds = state.messages.recent.map((message) => message.messageId);
        if (this.interactionBaselineReady) {
            for (const message of state.messages.recent) {
                if (this.notifiedMessageIds.has(message.messageId)) continue;
                this.notifiedMessageIds.add(message.messageId);
                this.push({
                    type: "message_committed",
                    event: {
                        source: {
                            goalId: state.goalId,
                            runId: message.runId,
                            eventId: `message:${message.messageId}`,
                            cursor: 0,
                            occurredAt: new Date(0).toISOString(),
                            durability: "checkpoint",
                        },
                        messageId: message.messageId,
                        role: message.role,
                        position: message.position,
                        ...(message.purpose === undefined ? {} : { purpose: message.purpose }),
                        runId: message.runId,
                        commitRevision: state.commitRevision,
                        ...(message.sourceKind === "completion_candidate"
                            ? { previewId: message.sourceId }
                            : {}),
                    },
                });
            }
            const interactionId = state.interaction?.interactionId;
            if (interactionId !== undefined && interactionId !== this.knownInteractionId) {
                this.knownInteractionId = interactionId;
                this.push({
                    type: "interaction_required",
                    event: {
                        kind: "required",
                        source: {
                            goalId: state.goalId,
                            runId: state.interaction?.runId ?? state.runId,
                            eventId: `interaction:${interactionId}`,
                            cursor: 0,
                            occurredAt: new Date(0).toISOString(),
                            durability: "checkpoint",
                        },
                        interactionKind: resolveInteractionKind(state),
                        interactionId,
                        runId: state.interaction?.runId ?? state.runId,
                    },
                });
            }
        } else {
            this.interactionBaselineReady = true;
            for (const messageId of messageIds) this.notifiedMessageIds.add(messageId);
            this.knownInteractionId = state.interaction?.interactionId;
        }
    }

    private push(event: SessionOutputEvent): void {
        if (this.closedState) return;
        if (event.type === "state_sync") this.lastSyncedRunId = event.state.runId;
        const waiter = this.waiters.shift();
        if (waiter !== undefined) {
            waiter({ value: event, done: false });
            return;
        }
        if (this.listeners.size > 0) {
            for (const listener of this.listeners) {
                try {
                    listener(event);
                } catch {
                    // 监听器故障隔离在回调边界。
                }
            }
            return;
        }
        this.queue.push(event);
    }

    private toOutputEvent(event: ExecutionStreamEvent): SessionOutputEvent | undefined {
        return classifySessionStreamEvent(event);
    }
}

function resolveInteractionKind(
    state: GoalSessionState,
): "ask_user" | "task_approval" | "action_approval" | "action_recovery" {
    const kind = state.interaction?.kind;
    if (kind === "task_approval") return "task_approval";
    if (kind === "action_approval") return "action_approval";
    if (kind === "action_recovery") return "action_recovery";
    return "ask_user";
}

/**
 * 按 Goal 合并的只读提交核对任务。
 *
 * @remarks
 * 只有存在观察者时才按不超过一秒的间隔读取最新快照并比较 Goal 提交修订；修订
 * 变化或等待者需要时通知观察者重新同步。核对只读，不调度执行、不改变业务结果。
 *
 * @example
 * ```ts
 * const monitor = new GoalRevisionMonitor({
 *     readGoal: (goalId) => store.restore(goalId),
 *     readRevision: (goalId) => store.readRevision?.(goalId) ?? Promise.resolve(undefined),
 * });
 * const unsubscribe = monitor.observe("goal-1", () => console.log("changed"));
 * ```
 */
export interface GoalRevisionMonitorDependencies {
    /** 读取指定 Goal 的最新快照；`readRevision` 不可用时使用。 */
    readonly readGoal: (goalId: string) => Promise<Goal | undefined>;
    /** 可选的轻量提交修订读取；提供时替代完整 Goal 读取，返回值必须与 `commitRevision` 一致。 */
    readonly readRevision?: ((goalId: string) => Promise<number | undefined>) | undefined;
    /** 核对间隔（毫秒）；默认 1000，必须为正整数且不超过 1000。 */
    readonly intervalMs?: number | undefined;
    /** 定时器边界；省略时使用进程 `setInterval`/`clearInterval`。 */
    readonly setInterval?: ((handler: () => void, timeout: number) => unknown) | undefined;
    readonly clearInterval?: ((handle: unknown) => void) | undefined;
    /** 读取失败时的通知；错误按 Goal 报告，不伪装为业务结果。 */
    readonly onError?: ((goalId: string, error: unknown) => void) | undefined;
}

/** 提交核对任务向观察者发出的信号。 */
export type GoalRevisionSignal =
    | { readonly kind: "revision_changed"; readonly revision: number }
    | { readonly kind: "read_failed" };

interface ObservedGoal {
    readonly listeners: Set<(signal: GoalRevisionSignal) => void>;
    revision: number | undefined;
    handle: unknown;
}

/** 默认的最大核对间隔不超过一秒。 */
export const DEFAULT_RESYNC_INTERVAL_MS = 1000;

export class GoalRevisionMonitor {
    private readonly observed = new Map<string, ObservedGoal>();
    private readonly readGoal: GoalRevisionMonitorDependencies["readGoal"];
    private readonly readRevision: GoalRevisionMonitorDependencies["readRevision"];
    private readonly intervalMs: number;
    private readonly setIntervalFn: (handler: () => void, timeout: number) => unknown;
    private readonly clearIntervalFn: (handle: unknown) => void;
    private readonly onError: ((goalId: string, error: unknown) => void) | undefined;

    /** @param dependencies - 快照读取、间隔与定时器边界。 */
    constructor(dependencies: GoalRevisionMonitorDependencies) {
        this.readGoal = dependencies.readGoal;
        this.readRevision = dependencies.readRevision;
        this.intervalMs = dependencies.intervalMs ?? DEFAULT_RESYNC_INTERVAL_MS;
        if (!Number.isSafeInteger(this.intervalMs) || this.intervalMs <= 0 || this.intervalMs > DEFAULT_RESYNC_INTERVAL_MS) {
            throw new RangeError("intervalMs must be a positive integer no greater than 1000");
        }
        this.setIntervalFn = dependencies.setInterval
            ?? ((handler, timeout) => globalThis.setInterval(handler, timeout));
        this.clearIntervalFn = dependencies.clearInterval
            ?? ((handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>));
        this.onError = dependencies.onError;
    }

    /** 当前是否有任何 Goal 处于核对状态。 */
    get observing(): boolean {
        return this.observed.size > 0;
    }

    /**
     * 观察指定 Goal 的提交修订。
     *
     * @param goalId - 目标 Goal。
     * @param listener - 修订变化时的通知回调。
     * @returns 幂等取消函数；没有观察者时停止对应核对任务。
     */
    observe(goalId: string, listener: (signal: GoalRevisionSignal) => void): () => void {
        let entry = this.observed.get(goalId);
        if (entry === undefined) {
            entry = { listeners: new Set(), revision: undefined, handle: undefined };
            this.observed.set(goalId, entry);
            entry.handle = this.setIntervalFn(() => {
                void this.check(goalId);
            }, this.intervalMs);
            // 核对任务不得阻止宿主进程退出。
            (entry.handle as { unref?: () => void } | undefined)?.unref?.();
        }
        entry.listeners.add(listener);
        void this.check(goalId);
        return () => {
            const current = this.observed.get(goalId);
            if (current === undefined) return;
            current.listeners.delete(listener);
            if (current.listeners.size === 0) {
                if (current.handle !== undefined) this.clearIntervalFn(current.handle);
                this.observed.delete(goalId);
            }
        };
    }

    /** 立即核对一次所有被观察 Goal；定时器与测试共用。 */
    async checkAll(): Promise<void> {
        for (const goalId of [...this.observed.keys()]) {
            await this.check(goalId);
        }
    }

    /** 停止全部核对任务。 */
    dispose(): void {
        for (const entry of this.observed.values()) {
            if (entry.handle !== undefined) this.clearIntervalFn(entry.handle);
        }
        this.observed.clear();
    }

    private notify(goalId: string, entry: ObservedGoal, signal: GoalRevisionSignal): void {
        for (const listener of [...entry.listeners]) {
            try {
                listener(signal);
            } catch (error) {
                this.onError?.(goalId, error);
            }
        }
    }

    private async check(goalId: string): Promise<void> {
        const entry = this.observed.get(goalId);
        if (entry === undefined) return;
        let revision: number | undefined;
        try {
            if (this.readRevision !== undefined) {
                revision = await this.readRevision(goalId);
            } else {
                const goal = await this.readGoal(goalId);
                revision = goal === undefined ? undefined : goal.state.commitRevision ?? 0;
            }
        } catch (error) {
            this.onError?.(goalId, error);
            // 读取故障也通知观察者重新同步，使订阅能报告同步故障而不是停留在旧状态。
            this.notify(goalId, entry, { kind: "read_failed" });
            return;
        }
        if (revision === undefined) {
            this.notify(goalId, entry, { kind: "read_failed" });
            return;
        }
        if (entry.revision === revision) return;
        const changed = entry.revision !== undefined;
        entry.revision = revision;
        if (!changed) return;
        this.notify(goalId, entry, { kind: "revision_changed", revision });
    }
}
