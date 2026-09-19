import {
    assertStreamJsonValue,
    type ExecutionStreamEvent,
    type ExecutionStreamEventDraft,
    type StreamJsonValue,
} from "./event";
import {
    isStreamEventVisible,
    resolveMaxQueueSize,
    type StreamSubscriptionCloseReason,
    type StreamSubscriptionPolicy,
} from "./policy";
import {
    BufferedExecutionStreamSubscription,
    type ExecutionStreamListener,
    type ExecutionStreamSubscription,
} from "./subscription";

/**
 * Goal/Run 订阅的稳定键。
 *
 * @example
 * ```ts
 * const ref: ExecutionStreamRef = { goalId: "goal-1", runId: "run-1" };
 * ```
 */
export interface ExecutionStreamRef {
    readonly goalId: string;
    readonly runId: string;
}

/**
 * 通用执行流发布端口。
 *
 * @remarks
 * 生产者只依赖该最小接口即可发布和订阅事件；具体内存实现可以在组合根替换，
 * 但必须保持 Goal/Run 隔离、可见性过滤和有界订阅语义。
 *
 * @example
 * ```ts
 * const publisher: ExecutionStreamPublisher =
 *     new InMemoryExecutionStreamPublisher();
 * ```
 */
export interface ExecutionStreamPublisher {
    /** 发布一个已经发生的 JSON-safe 事件。 */
    publish(event: ExecutionStreamEventDraft): void;
    /** 订阅指定 Goal/Run 的后续事件。 */
    subscribe(
        ref: ExecutionStreamRef,
        policy?: StreamSubscriptionPolicy,
    ): ExecutionStreamSubscription;
    /** 关闭一个 Goal/Run 的所有订阅。 */
    close(ref: ExecutionStreamRef, reason?: StreamSubscriptionCloseReason): void;
    /** 关闭 Publisher 持有的全部订阅和内存状态。 */
    dispose(): void;
}

/**
 * 发布和订阅通用执行事件的内存总线。
 *
 * @remarks
 * Publisher 按 Goal/Run 隔离 cursor 和订阅者。发布只负责把已经发生的观察
 * 通知到当前进程的订阅者，不写入 Snapshot、Trajectory 或外部传输。增量事件
 * 在每个订阅者的队列中按相同 `kind`、`coalescingKey` 和 visibility 合并；控制
 * 事件不会被丢弃，无法保留时会关闭慢订阅者。
 *
 * @example
 * ```ts
 * const publisher = new InMemoryExecutionStreamPublisher();
 * const subscription = publisher.subscribe({ goalId: "g", runId: "r" });
 * publisher.publish({
 *     goalId: "g",
 *     runId: "r",
 *     kind: "step_started",
 *     visibility: "public",
 *     durability: "live",
 *     delivery: "control",
 *     payload: { executionUnitId: "step-1" },
 * });
 * ```
 */
export class InMemoryExecutionStreamPublisher implements ExecutionStreamPublisher {
    private readonly streams = new Map<string, StreamState>();

    /** 发布一个事件；订阅者故障不会从该方法传播。 */
    publish(draft: ExecutionStreamEventDraft): void {
        assertDraft(draft);
        const state = this.getOrCreateState(draft);
        state.cursor += 1;
        const event = createEvent(draft, state.cursor);

        for (const subscriber of [...state.subscribers]) {
            if (!isStreamEventVisible(event, subscriber.policy)) continue;
            if (subscriber.subscription.closed) {
                state.subscribers.delete(subscriber);
                continue;
            }

            if (tryCoalesce(subscriber.subscription, event)) continue;
            if (subscriber.subscription.size >= subscriber.maxQueueSize) {
                subscriber.subscription.close("backpressure");
                state.subscribers.delete(subscriber);
                continue;
            }
            if (!subscriber.subscription.push(event)) state.subscribers.delete(subscriber);
        }
    }

    /**
     * 订阅指定 Goal/Run 的后续事件。
     *
     * @param ref - Goal 与 Run 的关联键。
     * @param policy - 可见性与队列上限；省略时使用 public/128。
     * @returns 可通过 AsyncIterable 或回调消费的订阅对象。
     */
    subscribe(
        ref: ExecutionStreamRef,
        policy: StreamSubscriptionPolicy = {},
    ): ExecutionStreamSubscription {
        assertRef(ref);
        const state = this.getOrCreateState(ref);
        const subscription = new BufferedExecutionStreamSubscription();
        state.subscribers.add({
            subscription,
            policy,
            maxQueueSize: resolveMaxQueueSize(policy),
        });
        if (state.cursor > 0 && isStreamEventVisible({ kind: "live_gap", visibility: "public" }, policy)) {
            subscription.push(createLiveGapEvent(ref, state.cursor));
        }
        return subscription;
    }

    /** 关闭指定 Goal/Run 的所有订阅并释放内存状态。 */
    close(ref: ExecutionStreamRef, reason: StreamSubscriptionCloseReason = "publisher_closed"): void {
        const key = refKey(ref);
        const state = this.streams.get(key);
        if (state === undefined) return;
        for (const subscriber of state.subscribers) subscriber.subscription.close(reason);
        state.subscribers.clear();
        this.streams.delete(key);
    }

    /** 关闭所有订阅并释放 Publisher 持有的状态。 */
    dispose(): void {
        for (const state of this.streams.values()) {
            for (const subscriber of state.subscribers) subscriber.subscription.close("publisher_closed");
            state.subscribers.clear();
        }
        this.streams.clear();
    }

    private getOrCreateState(ref: ExecutionStreamRef): StreamState {
        const key = refKey(ref);
        const existing = this.streams.get(key);
        if (existing !== undefined) return existing;
        const state: StreamState = { cursor: 0, subscribers: new Set() };
        this.streams.set(key, state);
        return state;
    }
}

interface StreamState {
    cursor: number;
    readonly subscribers: Set<SubscriberState>;
}

interface SubscriberState {
    readonly subscription: BufferedExecutionStreamSubscription;
    readonly policy: StreamSubscriptionPolicy;
    readonly maxQueueSize: number;
}

function refKey(ref: ExecutionStreamRef): string {
    return `${ref.goalId}\u0000${ref.runId}`;
}

function assertRef(ref: ExecutionStreamRef): void {
    if (ref.goalId.trim() === "" || ref.runId.trim() === "") {
        throw new TypeError("goalId and runId must be non-empty");
    }
}

function assertDraft(draft: ExecutionStreamEventDraft): void {
    assertRef(draft);
    if (draft.kind.trim() === "") throw new TypeError("kind must be non-empty");
    if (!Object.hasOwn({ public: true, diagnostic: true, restricted: true }, draft.visibility)) {
        throw new TypeError("visibility is invalid");
    }
    if (!Object.hasOwn({ live: true, trajectory: true, checkpoint: true }, draft.durability)) {
        throw new TypeError("durability is invalid");
    }
    if (!Object.hasOwn({ control: true, delta: true }, draft.delivery)) {
        throw new TypeError("delivery is invalid");
    }
    if (draft.coalescingKey !== undefined && draft.coalescingKey.trim() === "") {
        throw new TypeError("coalescingKey must be non-empty when provided");
    }
    assertStreamJsonValue(draft.payload);
}

function createEvent(draft: ExecutionStreamEventDraft, cursor: number): ExecutionStreamEvent {
    return Object.freeze({
        ...draft,
        eventId: `event-${cursor}`,
        cursor,
        occurredAt: new Date().toISOString(),
        schemaVersion: 1 as const,
    });
}

function createLiveGapEvent(ref: ExecutionStreamRef, latestCursor: number): ExecutionStreamEvent {
    return Object.freeze({
        goalId: ref.goalId,
        runId: ref.runId,
        kind: "live_gap",
        visibility: "public" as const,
        durability: "live" as const,
        delivery: "control" as const,
        payload: { fromCursor: 1, toCursor: latestCursor },
        eventId: `live-gap-${latestCursor}`,
        cursor: latestCursor,
        occurredAt: new Date().toISOString(),
        schemaVersion: 1 as const,
    });
}

function tryCoalesce(
    subscription: BufferedExecutionStreamSubscription,
    incoming: ExecutionStreamEvent,
): boolean {
    if (incoming.delivery !== "delta" || incoming.coalescingKey === undefined) return false;
    const last = subscription.peekLast();
    if (
        last === undefined
        || last.delivery !== "delta"
        || last.kind !== incoming.kind
        || last.visibility !== incoming.visibility
        || last.coalescingKey !== incoming.coalescingKey
    ) {
        return false;
    }
    const mergedPayload = mergeTextPayload(last.payload, incoming.payload);
    if (mergedPayload === undefined) return false;
    const merged: ExecutionStreamEvent = Object.freeze({
        ...last,
        payload: mergedPayload,
        cursor: incoming.cursor,
        coalescedFrom: last.coalescedFrom ?? last.cursor,
        occurredAt: incoming.occurredAt,
    });
    return subscription.replaceLast(merged);
}

function mergeTextPayload(
    left: StreamJsonValue,
    right: StreamJsonValue,
): StreamJsonValue | undefined {
    if (!isRecord(left) || !isRecord(right)) return undefined;
    if (typeof left.text !== "string" || typeof right.text !== "string") return undefined;
    return { ...left, text: `${left.text}${right.text}` };
}

function isRecord(value: StreamJsonValue): value is { readonly [key: string]: StreamJsonValue } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Keep the listener type visible to consumers that use callback adapters.
export type { ExecutionStreamListener } from "./subscription";
