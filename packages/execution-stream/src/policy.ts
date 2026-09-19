import type { ExecutionStreamEvent, StreamVisibility } from "./event";

/**
 * 订阅者的流事件过滤和队列策略。
 *
 * @remarks
 * 默认只接收 `public` 事件且不开放 reasoning。提高 `minimumVisibility` 会
 * 同时包含更低级别的事件；`includeReasoning` 必须显式设为 `true` 才会接收
 * `reasoning_delta`。队列达到上限时，Publisher 会先尝试合并增量，仍无法
 * 安全保留时关闭慢订阅者，而不是丢弃控制事件。
 *
 * @example
 * ```ts
 * const policy: StreamSubscriptionPolicy = {
 *     minimumVisibility: "diagnostic",
 *     includeReasoning: false,
 *     maxQueueSize: 128,
 * };
 * ```
 */
export interface StreamSubscriptionPolicy {
    /** 最低可见性；默认只接收 `public`。 */
    readonly minimumVisibility?: StreamVisibility;
    /** 是否显式订阅 reasoning 增量；默认关闭。 */
    readonly includeReasoning?: boolean;
    /** 每个订阅者的最大待消费事件数；默认 128。 */
    readonly maxQueueSize?: number;
}

/** 订阅关闭时可供诊断的稳定原因。 */
export type StreamSubscriptionCloseReason =
    | "closed"
    | "backpressure"
    | "publisher_closed";

const VISIBILITY_RANK: Record<StreamVisibility, number> = {
    public: 0,
    diagnostic: 1,
    restricted: 2,
};

/** 判断事件是否满足订阅者的可见性策略。 */
export function isStreamEventVisible(
    event: Pick<ExecutionStreamEvent, "kind" | "visibility">,
    policy: StreamSubscriptionPolicy,
): boolean {
    const minimum = policy.minimumVisibility ?? "public";
    if (VISIBILITY_RANK[event.visibility] > VISIBILITY_RANK[minimum]) return false;
    if (event.kind === "reasoning_delta" && policy.includeReasoning !== true) return false;
    return true;
}

/** 规范化并校验队列上限。 */
export function resolveMaxQueueSize(policy: StreamSubscriptionPolicy): number {
    const value = policy.maxQueueSize ?? 128;
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError("maxQueueSize must be a positive safe integer");
    }
    return value;
}
