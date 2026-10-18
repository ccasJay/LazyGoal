import type { Goal, GoalStore } from "../../runtime/src/index";
import type { BrowserGoalSaveNotifications } from "./browser-goal-command-service";
import type { BrowserGoalLiveEvent } from "../../web-contracts/src/index";

export type { BrowserGoalLiveEvent };

const MAX_LIVE_TEXT_LENGTH = 2_000;
const MAX_PENDING_LIVE_EVENTS = 128;
type ActivityBoundaryReason = "assistant_reply" | "user_wait" | "stage_change" | "terminal" | "failure" | "unknown";

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
    /** 可选的命令服务活动变更订阅，用于向活跃流发送 refresh_required。 */
    readonly onGoalActivityChanged?: (listener: (goalId: string, active: boolean) => void) => () => void;
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
 *     eventId: "event-1", cursor: 1,
 *     visibility: "public", durability: "live", payload: {},
 * };
 * ```
 */
export interface BrowserGoalExecutionEvent {
    readonly goalId: string;
    readonly runId: string;
    readonly kind: string;
    /** ExecutionStream 来源身份；不得与 Trajectory eventId 混用。 */
    readonly eventId?: string;
    /** ExecutionStream 来源 cursor；只在该实时来源内排序。 */
    readonly cursor?: number;
    readonly executionUnitId?: string;
    readonly actionId?: string;
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
            this.dependencies.onGoalActivityChanged,
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
    private readonly unsubscribeActivity?: () => void;
    private closed = false;
    private readonly onAbort: () => void;

    constructor(
        private readonly ref: GoalRunRef,
        private readonly subscription: BrowserGoalExecutionSubscription,
        saveNotifications: BrowserGoalSaveNotifications,
        private readonly signal?: AbortSignal,
        onGoalActivityChanged?: (listener: (goalId: string, active: boolean) => void) => () => void,
    ) {
        this.unsubscribeSaves = saveNotifications.onSave((goal) => this.onGoalSaved(goal));
        if (onGoalActivityChanged !== undefined) {
            this.unsubscribeActivity = onGoalActivityChanged((changedGoalId) => {
                if (changedGoalId === this.ref.goalId) {
                    this.push({ type: "refresh_required", ...this.ref });
                }
            });
        }
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
        if (this.unsubscribeActivity !== undefined) {
            this.unsubscribeActivity();
        }
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
    const sourceEventId = event.eventId;
    const sourceCursor = event.cursor;
    const identity = sourceEventId !== undefined && sourceCursor !== undefined
        ? { sourceEventId, sourceCursor }
        : undefined;
    switch (event.kind) {
        case "model_started":
            return { kind: event.kind };
        case "model_completed":
            return { kind: "model_completed" };
        case "step_started":
            return { kind: "step_started" };
        case "tool_started": {
            if (identity === undefined || event.actionId === undefined || event.executionUnitId === undefined
                || !isRecord(event.payload) || typeof event.payload.toolId !== "string") return undefined;
            const inputSummary = projectSafeToolInputSummary(event.payload.toolId, event.payload.input);
            return {
                kind: "tool_started",
                ...identity,
                actionId: event.actionId,
                executionUnitId: event.executionUnitId,
                toolId: event.payload.toolId,
                ...(inputSummary === undefined ? {} : { inputSummary }),
            };
        }
        case "tool_finished": {
            if (identity === undefined || event.actionId === undefined || !isRecord(event.payload)
                || typeof event.payload.toolId !== "string" || !isRecord(event.payload.observation)) return undefined;
            const observation = event.payload.observation;
            const outcome = observation.kind === "failure" ? "failure" : observation.kind === "success" ? "success" : undefined;
            if (outcome === undefined) return undefined;
            const summary = outcome === "failure" && typeof observation.message === "string"
                ? observation.message
                : typeof observation.summary === "string" ? observation.summary : undefined;
            return {
                kind: "tool_finished",
                ...identity,
                actionId: event.actionId,
                toolId: event.payload.toolId,
                outcome,
                ...(summary === undefined ? {} : { summary: summary.slice(0, 500) }),
            };
        }
        case "tool_attempt_started": {
            if (identity === undefined || event.actionId === undefined || !isRecord(event.payload)
                || !Number.isSafeInteger(event.payload.attempt)) return undefined;
            return { kind: "tool_attempt_started", ...identity, actionId: event.actionId, attempt: Number(event.payload.attempt) };
        }
        case "tool_attempt_failed": {
            if (identity === undefined || event.actionId === undefined || !isRecord(event.payload)
                || !Number.isSafeInteger(event.payload.attempt) || typeof event.payload.reason !== "string") return undefined;
            return {
                kind: "tool_attempt_failed", ...identity, actionId: event.actionId,
                attempt: Number(event.payload.attempt), reason: event.payload.reason.slice(0, 160),
            };
        }
        case "model_block_delta": {
            // 只有公开的普通正文增量进入当前活动视图；结构化 JSON、工具参数与 reasoning 不投影。
            if (!isRecord(event.payload) || event.payload.deltaKind !== "text"
                || typeof event.payload.delta !== "string") return undefined;
            const text = event.payload.delta;
            if (identity === undefined) return undefined;
            return {
                kind: "assistant_text_delta",
                ...identity,
                text: text.slice(0, MAX_LIVE_TEXT_LENGTH),
                truncated: text.length > MAX_LIVE_TEXT_LENGTH,
            };
        }
        case "model_block_completed": {
            // 整块交付的公开正文以完整文本一次性呈现；增量块的内容已由增量发布。
            if (!isRecord(event.payload) || event.payload.blockType !== "text"
                || event.payload.delivery !== "whole" || typeof event.payload.text !== "string") return undefined;
            const text = event.payload.text;
            if (text.length === 0 || identity === undefined) return undefined;
            return {
                kind: "assistant_text_delta",
                ...identity,
                text: text.slice(0, MAX_LIVE_TEXT_LENGTH),
                truncated: text.length > MAX_LIVE_TEXT_LENGTH,
            };
        }
        case "model_block_started":
            // 模型失败／取消的安全终止摘要只结束本次调用的观察，不产生公开活动 DTO。
        case "model_failed":
        case "model_cancelled":
            return undefined;
        case "decision_received": {
            if (isRecord(event.payload) && isRecord(event.payload.decision) && event.payload.decision.kind === "tool_call") return undefined;
            return projectActivityBoundary(identity, "assistant_reply");
        }
        case "run_waiting":
        case "task_approved":
        case "task_feedback_received":
        case "ask_user_answered":
        case "ask_user_cancelled":
            return projectActivityBoundary(identity, "user_wait");
        case "run_stage_declared":
        case "run_stage_accepted":
        case "run_stage_rejected":
        case "run_plan_route_revised":
            return projectActivityBoundary(identity, "stage_change");
        case "run_failed":
        case "run_completed":
        case "run_cancelled":
            return projectActivityBoundary(identity, "terminal");
        case "execution_error":
        case "action_rejected":
            return projectActivityBoundary(identity, "failure");
        case "model_response_received":
        case "model_context_frame":
        case "think_requested":
        case "think_completed":
        case "model_repair_attempt_started":
        case "model_repair_feedback_recorded":
        case "model_request_retry_recorded":
        case "action_staged":
        case "action_approved":
        case "action_recovered":
        case "observation_recorded":
        case "state_committed":
        case "memory_patch_accepted":
        case "context_lookup_requested":
        case "context_lookup_completed":
        case "context_lookup_not_found":
        case "context_lookup_failed":
            return undefined;
        default:
            return projectActivityBoundary(identity, "unknown");
    }
}

function projectSafeToolInputSummary(toolId: string, input: unknown): string | undefined {
    if (!isRecord(input)) return undefined;
    const key = toolId === "read_file" || toolId === "write_file" || toolId === "edit_file" ? "path"
        : toolId === "grep" ? "pattern"
            : toolId === "web_search" ? "query"
                : toolId === "web_fetch" ? "url" : undefined;
    const value = key === undefined ? undefined : input[key];
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 240) : undefined;
}

function projectActivityBoundary(
    identity: { readonly sourceEventId: string; readonly sourceCursor: number } | undefined,
    reason: ActivityBoundaryReason,
): Extract<BrowserGoalLiveEvent, { readonly type: "activity" }> ["activity"] | undefined {
    return identity === undefined ? undefined : { kind: "activity_boundary", ...identity, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
