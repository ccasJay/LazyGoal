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
    /**
     * 订阅整个 Goal 的后续事件，覆盖其后创建的后继 Run。
     *
     * @remarks Run 仍是每条事件的来源身份；订阅不随 Run 结束关闭，由调用方
     * 显式 `closeGoal` 或 `dispose` 结束。
     * @param goalId - Goal 稳定标识。
     * @param policy - 可见性与队列上限；省略时使用 public/128。
     * @returns 聚合该 Goal 全部 Run 事件的订阅对象。
     */
    subscribeGoal(
        goalId: string,
        policy?: StreamSubscriptionPolicy,
    ): ExecutionStreamSubscription;
    /** 关闭一个 Goal/Run 的所有订阅。 */
    close(ref: ExecutionStreamRef, reason?: StreamSubscriptionCloseReason): void;
    /** 关闭一个 Goal 的全部订阅并释放内存状态。 */
    closeGoal(goalId: string, reason?: StreamSubscriptionCloseReason): void;
    /** 关闭 Publisher 持有的全部订阅和内存状态。 */
    dispose(): void;
}

/**
 * 发布和订阅通用执行事件的内存总线。
 *
 * @remarks
 * Publisher 按 Goal/Run 隔离 cursor 和订阅者。发布只负责把已经发生的观察
 * 通知到当前进程的订阅者，不写入 Snapshot、Trajectory 或外部传输。增量事件
 * 在每个订阅者的队列中按相同 `kind`、`coalescingKey` 和 visibility 合并；合并
 * 只连接声明携带增量文本的字符串字段（`text` 或 `delta`），其它字段必须完全一致。
 * 控制事件不会被丢弃，无法保留时会关闭慢订阅者。
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
    private readonly goalStreams = new Map<string, GoalStreamState>();

    /** 发布一个事件；订阅者故障不会从该方法传播。 */
    publish(draft: ExecutionStreamEventDraft): void {
        assertDraft(draft);
        const state = this.getOrCreateState(draft);
        state.cursor += 1;
        const event = createEvent(draft, state.cursor);

        this.deliver(event, state.subscribers);

        const goalState = this.getOrCreateGoalState(draft.goalId);
        goalState.cursor += 1;
        this.deliver(event, goalState.subscribers);
    }

    /** 向一组订阅者投递事件，沿用增量合并与有界背压规则。 */
    private deliver(event: ExecutionStreamEvent, subscribers: Set<SubscriberState>): void {
        for (const subscriber of [...subscribers]) {
            if (!isStreamEventVisible(event, subscriber.policy)) continue;
            if (subscriber.subscription.closed) {
                subscribers.delete(subscriber);
                continue;
            }

            if (tryCoalesce(subscriber.subscription, event)) continue;
            if (subscriber.subscription.size >= subscriber.maxQueueSize) {
                subscriber.subscription.close("backpressure");
                subscribers.delete(subscriber);
                continue;
            }
            if (!subscriber.subscription.push(event)) subscribers.delete(subscriber);
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

    /**
     * 订阅整个 Goal 的后续事件。
     *
     * @param goalId - Goal 稳定标识。
     * @param policy - 可见性与队列上限；省略时使用 public/128。
     * @returns 覆盖该 Goal 全部 Run 的订阅对象。
     */
    subscribeGoal(
        goalId: string,
        policy: StreamSubscriptionPolicy = {},
    ): ExecutionStreamSubscription {
        if (goalId.trim() === "") throw new TypeError("goalId must be non-empty");
        const state = this.getOrCreateGoalState(goalId);
        const subscription = new BufferedExecutionStreamSubscription();
        state.subscribers.add({
            subscription,
            policy,
            maxQueueSize: resolveMaxQueueSize(policy),
        });
        if (state.cursor > 0 && isStreamEventVisible({ kind: "live_gap", visibility: "public" }, policy)) {
            subscription.push(createLiveGapEvent({ goalId, runId: "*" }, state.cursor));
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

    /** 关闭一个 Goal 的全部订阅并释放内存状态。 */
    closeGoal(goalId: string, reason: StreamSubscriptionCloseReason = "publisher_closed"): void {
        const state = this.goalStreams.get(goalId);
        if (state === undefined) return;
        for (const subscriber of state.subscribers) subscriber.subscription.close(reason);
        state.subscribers.clear();
        this.goalStreams.delete(goalId);
    }

    /** 关闭所有订阅并释放 Publisher 持有的状态。 */
    dispose(): void {
        for (const state of this.streams.values()) {
            for (const subscriber of state.subscribers) subscriber.subscription.close("publisher_closed");
            state.subscribers.clear();
        }
        this.streams.clear();
        for (const state of this.goalStreams.values()) {
            for (const subscriber of state.subscribers) subscriber.subscription.close("publisher_closed");
            state.subscribers.clear();
        }
        this.goalStreams.clear();
    }

    private getOrCreateGoalState(goalId: string): GoalStreamState {
        const existing = this.goalStreams.get(goalId);
        if (existing !== undefined) return existing;
        const state: GoalStreamState = { cursor: 0, subscribers: new Set() };
        this.goalStreams.set(goalId, state);
        return state;
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

interface GoalStreamState {
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
        || last.runId !== incoming.runId
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
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length || !leftKeys.every(key => Object.hasOwn(right, key))) return undefined;

    // 通用增量合并：除声明携带增量的字符串字段外，其它字段必须完全一致。
    let mergedField: string | undefined;
    for (const key of leftKeys) {
        if (Object.is(left[key], right[key])) continue;
        if (mergedField !== undefined) return undefined;
        if (isDeltaTextField(key) && typeof left[key] === "string" && typeof right[key] === "string") {
            mergedField = key;
            continue;
        }
        return undefined;
    }
    const field = mergedField ?? DELTA_TEXT_FIELDS.find(candidate =>
        isDeltaTextField(candidate) && typeof left[candidate] === "string" && typeof right[candidate] === "string");
    if (field === undefined) return undefined;
    return { ...left, [field]: `${String(left[field])}${String(right[field])}` };
}

/** 通用增量载荷允许携带增量文本的字段名；Core 不解释这些字段的业务含义。 */
const DELTA_TEXT_FIELDS = ["text", "delta"] as const;

function isDeltaTextField(key: string): key is (typeof DELTA_TEXT_FIELDS)[number] {
    return (DELTA_TEXT_FIELDS as readonly string[]).includes(key);
}

function isRecord(value: StreamJsonValue): value is { readonly [key: string]: StreamJsonValue } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Keep the listener type visible to consumers that use callback adapters.
export type { ExecutionStreamListener } from "./subscription";
