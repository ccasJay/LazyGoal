/**
 * Web SSE 实时流事件数据传输对象 (DTO)。
 */

/**
 * 实时执行活动事件。
 *
 * @example
 * ```ts
 * const act: BrowserGoalActivityEvent = {
 *     kind: "assistant_text_delta",
 *     text: "分析中...",
 *     truncated: false,
 * };
 * ```
 */
export type BrowserGoalActivityEvent =
    | {
        readonly kind: "assistant_text_delta";
        readonly text: string;
        readonly truncated: boolean;
    }
    | { readonly kind: "model_started" }
    | { readonly kind: "model_completed" }
    | { readonly kind: "step_started" }
    | { readonly kind: "tool_started" }
    | { readonly kind: "tool_finished" };

/**
 * 浏览器端消费的实时推送事件。
 *
 * @remarks
 * 支持流式文本增量、状态活动、快照变更及强制刷新信号。
 *
 * @example
 * ```ts
 * const event: BrowserGoalLiveEvent = {
 *     type: "activity",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     activity: { kind: "step_started" },
 * };
 * ```
 */
export type BrowserGoalLiveEvent =
    | {
        readonly type: "activity";
        readonly goalId: string;
        readonly runId: string;
        readonly activity: BrowserGoalActivityEvent;
    }
    | {
        readonly type: "snapshot_changed";
        readonly goalId: string;
        readonly runId: string;
    }
    | {
        readonly type: "refresh_required";
        readonly goalId: string;
        readonly runId: string;
    };
