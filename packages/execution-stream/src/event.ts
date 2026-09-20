/** Stream Core 可携带的 JSON 标量。 */
export type StreamJsonPrimitive = string | number | boolean | null;

/** Stream Core 的只读 JSON 值。 */
export type StreamJsonValue =
    | StreamJsonPrimitive
    | readonly StreamJsonValue[]
    | { readonly [key: string]: StreamJsonValue };

/** 事件对订阅者的最低可见性级别。 */
export type StreamVisibility = "public" | "diagnostic" | "restricted";

/** 事件是否允许被订阅队列合并。 */
export type StreamDelivery = "control" | "delta";

/** 事件在实时层或持久化层中的来源边界。 */
export type StreamDurability = "live" | "trajectory" | "checkpoint";

/**
 * 尚未分配身份的通用执行流事件。
 *
 * @remarks
 * `payload` 必须是可序列化 JSON 值。`delivery: "delta"` 的事件可以按
 * `coalescingKey` 合并；控制事件始终独立保序。事件种类由 Runtime、LLM、Tool
 * 或 UI Adapter 定义，Stream Core 不解释领域语义。
 *
 * @example
 * ```ts
 * const draft: ExecutionStreamEventDraft = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     kind: "assistant_text_delta",
 *     visibility: "public",
 *     durability: "live",
 *     delivery: "delta",
 *     coalescingKey: "assistant:step-1",
 *     payload: { text: "Hello" },
 * };
 * ```
 */
export interface ExecutionStreamEventDraft {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** Run 稳定标识。 */
    readonly runId: string;
    /** 可选的执行单元标识。 */
    readonly executionUnitId?: string;
    /** 可选的 Action 标识。 */
    readonly actionId?: string;
    /** 由接入方定义的事件类型名称。 */
    readonly kind: string;
    /** 订阅过滤使用的可见性。 */
    readonly visibility: StreamVisibility;
    /** 事件对应的实时、Trajectory 或 Snapshot 提交边界。 */
    readonly durability: StreamDurability;
    /** 控制事件保序；增量事件可在同一 key 下合并。 */
    readonly delivery: StreamDelivery;
    /** 同一连续文本或工具输出流使用的合并键。 */
    readonly coalescingKey?: string;
    /** JSON-safe 的事件内容。 */
    readonly payload: StreamJsonValue;
}

/**
 * 已由 Stream Core 分配身份和 cursor 的执行流事件。
 *
 * @remarks
 * `cursor` 在同一 Goal/Run 内单调递增。若多个增量被合并，`coalescedFrom`
 * 表示该 Envelope 覆盖的最早 cursor；中间 cursor 不代表事件丢失。
 *
 * @example
 * ```ts
 * function render(event: ExecutionStreamEvent): void {
 *     console.log(event.cursor, event.kind);
 * }
 * ```
 */
export interface ExecutionStreamEvent extends ExecutionStreamEventDraft {
    /** 当前 Goal/Run 内的唯一事件标识。 */
    readonly eventId: string;
    /** 当前 Goal/Run 内单调递增的来源 cursor。 */
    readonly cursor: number;
    /** 合并增量覆盖的首个来源 cursor；未合并时省略。 */
    readonly coalescedFrom?: number;
    /** RFC 3339 时间戳。 */
    readonly occurredAt: string;
    /** 当前执行流协议版本。 */
    readonly schemaVersion: 1;
}

/** 判断值是否为 Stream Core 可接受的 JSON 值。 */
export function isStreamJsonValue(value: unknown): value is StreamJsonValue {
    if (value === null) return true;
    if (typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isStreamJsonValue);
    if (typeof value !== "object") return false;

    const prototype = Object.getPrototypeOf(value);
    return (
        (prototype === Object.prototype || prototype === null)
        && Object.values(value).every(isStreamJsonValue)
    );
}

/**
 * 校验 Stream Core 公共输入的 JSON 边界。
 *
 * @param value - 待校验的未知值。
 * @param label - 错误信息中的字段名称。
 * @throws TypeError 当值不是有限 JSON 值时抛出。
 */
export function assertStreamJsonValue(value: unknown, label = "payload"): asserts value is StreamJsonValue {
    if (!isStreamJsonValue(value)) {
        throw new TypeError(`${label} must be a finite JSON value`);
    }
}
