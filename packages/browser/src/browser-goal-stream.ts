import type { Goal, GoalStore } from "../../runtime/src/index";
import type { BrowserGoalSaveNotifications } from "./browser-goal-command-service";

const MAX_LIVE_TEXT_LENGTH = 2_000;
const MAX_PENDING_LIVE_EVENTS = 128;

/**
 * 浏览器可见的单 Goal/Run 临时进展或刷新通知。
 *
 * @remarks
 * 实时事件仅用于短期活动展示；`snapshot_changed` 与 `refresh_required` 要求客户端
 * 从正式会话读取边界重建状态。该协议不提供终态事实，也不包含原始 Runtime 载荷。
 *
 * @example
 * ```ts
 * const event: BrowserGoalLiveEvent = {
 *     type: "activity",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     activity: { kind: "assistant_text_delta", text: "正在检查", truncated: false },
 * };
 * ```
 */
export type BrowserGoalLiveEvent =
    | {
        readonly type: "activity";
        readonly goalId: string;
        readonly runId: string;
        readonly activity:
            | { readonly kind: "assistant_text_delta"; readonly text: string; readonly truncated: boolean }
            | { readonly kind: "model_started" }
            | { readonly kind: "model_completed" }
            | { readonly kind: "step_started" }
            | { readonly kind: "tool_started" }
            | { readonly kind: "tool_finished" };
    }
    | { readonly type: "snapshot_changed"; readonly goalId: string; readonly runId: string }
    | { readonly type: "refresh_required"; readonly goalId: string; readonly runId: string };

/**
 * 一个已绑定 Goal/Run 的有限实时订阅。
 *
 * @example
 * ```ts
 * const opened = await streams.open("goal-1", "run-1");
 * if (opened.ok) opened.feed.close();
 * ```
 */
export interface BrowserGoalLiveFeed {
    /** 当前授权页面可读的安全事件流。 */
    readonly events: AsyncIterable<BrowserGoalLiveEvent>;
    /** 解除 Publisher 与 Snapshot 通知订阅并结束事件流。 */
    close(): void;
}

/** 浏览器实时流的创建结果。 */
export type BrowserGoalStreamOpenResult =
    | { readonly ok: true; readonly feed: BrowserGoalLiveFeed }
    | { readonly ok: false; readonly error: "goal_not_found" | "stale_run" };

/**
 * 浏览器实时流服务所需的正式工作区边界。
 *
 * @example
 * ```ts
 * const dependencies: BrowserGoalStreamDependencies = {
 *     store: workspaceGoalStore,
 *     saveNotifications: notifyingStore,
 *     publisher: executionStream,
 * };
 * ```
 */
export interface BrowserGoalStreamDependencies {
    /** 仅读取当前工作区 Goal Snapshot。 */
    readonly store: Pick<GoalStore, "restore">;
    /** 保存 Snapshot 后发出的进程内通知。 */
    readonly saveNotifications: BrowserGoalSaveNotifications;
    /** Runtime 与 Agent 共用的进程内事件发布器。 */
    readonly publisher: BrowserGoalExecutionStream;
}

/**
 * 浏览器实时流读取 Runtime 事件时所需的最小进程内端口。
 *
 * @example
 * ```ts
 * const stream: BrowserGoalExecutionStream = root.executionStream;
 * ```
 */
export interface BrowserGoalExecutionStream {
    /**
     * 订阅一个精确的 Goal/Run，并按可选队列上限提供后续事件。
     *
     * @param ref - 目标 Goal 与 Run 稳定身份。
     * @param policy - 进程内有界队列配置。
     * @returns 只读异步事件序列；关闭释放对应订阅。
     */
    subscribe(
        ref: { readonly goalId: string; readonly runId: string },
        policy?: { readonly maxQueueSize?: number },
    ): BrowserGoalExecutionSubscription;
}

/**
 * 浏览器端口消费的最小执行事件信封。
 *
 * @example
 * ```ts
 * const event: BrowserGoalExecutionEvent = {
 *     goalId: "goal-1", runId: "run-1", kind: "model_started",
 *     visibility: "public", durability: "live", payload: {},
 * };
 * ```
 */
export interface BrowserGoalExecutionEvent {
    readonly goalId: string;
    readonly runId: string;
    readonly kind: string;
    readonly visibility: "public" | "diagnostic" | "restricted";
    readonly durability: "live" | "trajectory" | "checkpoint";
    readonly payload: unknown;
}

/**
 * BrowserGoalExecutionStream.subscribe 返回的单个只读订阅。
 *
 * @example
 * ```ts
 * const subscription: BrowserGoalExecutionSubscription = publisher.subscribe({
 *     goalId: "goal-1", runId: "run-1",
 * });
 * ```
 */
export interface BrowserGoalExecutionSubscription extends AsyncIterable<BrowserGoalExecutionEvent> {
    /** 结束订阅并清理等待中的事件。 */
    close(): void;
}

/**
 * 将执行进展和 Snapshot 保存通知合并为安全、有界的浏览器事件流。
 *
 * @remarks
 * 连接只绑定当前 Snapshot 的 Goal/Run。仅接受精确身份匹配的 public 事件，并对白名单
 * 类型重新投影；文本有长度上限。刷新缺口、提交事件和 Snapshot 保存只触发重新读取，
 * 不把流结束或传输故障解释为 Run 终态。
 *
 * @example
 * ```ts
 * const streams = new BrowserGoalStreamService({ store, saveNotifications, publisher });
 * const result = await streams.open("goal-1", "run-1");
 * ```
 */
export class BrowserGoalStreamService {
    /**
     * @param dependencies - 正式 Snapshot 读取、保存通知与 Runtime 事件发布器。
     */
    constructor(private readonly dependencies: BrowserGoalStreamDependencies) {}

    /**
     * 打开当前 Goal/Run 的实时视图。
     *
     * @param goalId - 当前 Goal 稳定身份。
     * @param runId - 页面最新 Snapshot 中的 Run 身份。
     * @param signal - 可选的 HTTP 请求取消信号。
     * @returns 有界事件流；Goal 缺失或 Run 已过期时返回稳定拒绝码。
     * @throws 正式 Snapshot 读取失败时拒绝。
     */
    async open(
        goalId: string,
        runId: string,
        signal?: AbortSignal,
    ): Promise<BrowserGoalStreamOpenResult> {
        const goal = await this.dependencies.store.restore(goalId);
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== runId) return { ok: false, error: "stale_run" };

        const feed = new BrowserGoalLiveFeedImpl(
            { goalId, runId },
            this.dependencies.publisher.subscribe({ goalId, runId }, { maxQueueSize: MAX_PENDING_LIVE_EVENTS }),
            this.dependencies.saveNotifications,
            signal,
        );
        let latest: Goal | undefined;
        try {
            latest = await this.dependencies.store.restore(goalId);
        } catch (error) {
            feed.close();
            throw error;
        }
        if (latest === undefined) {
            feed.close();
            return { ok: false, error: "goal_not_found" };
        }
        if (latest.state.run.id !== runId) {
            feed.close();
            return { ok: false, error: "stale_run" };
        }
        feed.push({ type: "snapshot_changed", goalId, runId });
        feed.start();
        return { ok: true, feed };
    }
}

interface GoalRunRef {
    readonly goalId: string;
    readonly runId: string;
}

class BrowserGoalLiveFeedImpl implements BrowserGoalLiveFeed {
    private readonly queue = new LiveEventQueue();
    private readonly unsubscribeSaves: () => void;
    private closed = false;
    private readonly onAbort: () => void;

    constructor(
        private readonly ref: GoalRunRef,
        private readonly subscription: BrowserGoalExecutionSubscription,
        saveNotifications: BrowserGoalSaveNotifications,
        private readonly signal?: AbortSignal,
    ) {
        this.unsubscribeSaves = saveNotifications.onSave((goal) => this.onGoalSaved(goal));
        this.onAbort = () => this.close();
        if (this.signal?.aborted === true) {
            this.close();
        } else {
            this.signal?.addEventListener("abort", this.onAbort, { once: true });
        }
    }

    start(): void {
        void this.observeSubscription();
    }

    get events(): AsyncIterable<BrowserGoalLiveEvent> {
        return this.queue;
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.unsubscribeSaves();
        this.signal?.removeEventListener("abort", this.onAbort);
        this.subscription.close();
        this.queue.close();
    }

    push(event: BrowserGoalLiveEvent): void {
        if (this.closed) return;
        if (!this.queue.push(event)) this.close();
    }

    private onExecutionEvent(event: BrowserGoalExecutionEvent): void {
        if (
            event.goalId !== this.ref.goalId
            || event.runId !== this.ref.runId
            || event.visibility !== "public"
        ) return;
        if (event.kind === "live_gap") {
            this.push({ type: "refresh_required", ...this.ref });
            return;
        }
        if (event.durability === "checkpoint" || event.kind === "step_committed") {
            this.push({ type: "snapshot_changed", ...this.ref });
            return;
        }
        const activity = projectLiveActivity(event);
        if (activity !== undefined) {
            this.push({ type: "activity", ...this.ref, activity });
        }
    }

    private onGoalSaved(goal: Goal): void {
        if (goal.id !== this.ref.goalId) return;
        this.push({
            type: "snapshot_changed",
            goalId: goal.id,
            runId: goal.state.run.id,
        });
    }

    private async observeSubscription(): Promise<void> {
        try {
            for await (const event of this.subscription) {
                if (this.closed || this.signal?.aborted === true) return;
                this.onExecutionEvent(event);
            }
            if (!this.closed) this.push({ type: "refresh_required", ...this.ref });
        } catch {
            if (!this.closed) this.push({ type: "refresh_required", ...this.ref });
        } finally {
            if (!this.closed) this.close();
        }
    }
}

class LiveEventQueue implements AsyncIterable<BrowserGoalLiveEvent>, AsyncIterator<BrowserGoalLiveEvent> {
    private readonly events: BrowserGoalLiveEvent[] = [];
    private readonly waiters: Array<(result: IteratorResult<BrowserGoalLiveEvent>) => void> = [];
    private closed = false;

    push(event: BrowserGoalLiveEvent): boolean {
        if (this.closed) return false;
        const waiter = this.waiters.shift();
        if (waiter !== undefined) {
            waiter({ value: event, done: false });
            return true;
        }
        if (this.events.length >= MAX_PENDING_LIVE_EVENTS) {
            this.events.length = 0;
            this.events.push({ type: "refresh_required", goalId: event.goalId, runId: event.runId });
            return false;
        }
        this.events.push(event);
        return true;
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const waiter of this.waiters.splice(0)) {
            waiter({ value: undefined, done: true });
        }
    }

    next(): Promise<IteratorResult<BrowserGoalLiveEvent>> {
        const event = this.events.shift();
        if (event !== undefined) return Promise.resolve({ value: event, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
    }

    return(): Promise<IteratorResult<BrowserGoalLiveEvent>> {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
    }

    [Symbol.asyncIterator](): AsyncIterator<BrowserGoalLiveEvent> {
        return this;
    }
}

function projectLiveActivity(
    event: BrowserGoalExecutionEvent,
): Extract<BrowserGoalLiveEvent, { readonly type: "activity" }>["activity"] | undefined {
    switch (event.kind) {
        case "model_started":
        case "tool_started":
        case "tool_finished":
            return { kind: event.kind };
        case "model_completed":
            return { kind: "model_completed" };
        case "step_started":
            return { kind: "step_started" };
        case "assistant_text_delta": {
            if (!isRecord(event.payload) || typeof event.payload.text !== "string") return undefined;
            const text = event.payload.text;
            return {
                kind: "assistant_text_delta",
                text: text.slice(0, MAX_LIVE_TEXT_LENGTH),
                truncated: text.length > MAX_LIVE_TEXT_LENGTH,
            };
        }
        default:
            return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
