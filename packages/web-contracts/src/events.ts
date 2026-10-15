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
 *     sourceEventId: "stream-event-1",
 *     sourceCursor: 1,
 * };
 * ```
 */
export type BrowserGoalActivityEvent =
    | {
        readonly kind: "assistant_text_delta";
        readonly text: string;
        readonly truncated: boolean;
        readonly sourceEventId: string;
        readonly sourceCursor: number;
    }
    | { readonly kind: "model_started" }
    | { readonly kind: "model_completed" }
    | { readonly kind: "step_started" }
    | {
        readonly kind: "tool_started";
        readonly sourceEventId: string;
        readonly sourceCursor: number;
        readonly actionId: string;
        readonly executionUnitId: string;
        readonly toolId: string;
        readonly inputSummary?: string;
    }
    | {
        readonly kind: "tool_finished";
        readonly sourceEventId: string;
        readonly sourceCursor: number;
        readonly actionId: string;
        readonly toolId: string;
        readonly outcome: "success" | "failure";
        readonly summary?: string;
    }
    | {
        readonly kind: "tool_attempt_started";
        readonly sourceEventId: string;
        readonly sourceCursor: number;
        readonly actionId: string;
        readonly attempt: number;
    }
    | {
        readonly kind: "tool_attempt_failed";
        readonly sourceEventId: string;
        readonly sourceCursor: number;
        readonly actionId: string;
        readonly attempt: number;
        readonly reason: string;
    }
    | {
        readonly kind: "activity_boundary";
        readonly sourceEventId: string;
        readonly sourceCursor: number;
        readonly reason: "assistant_reply" | "user_wait" | "stage_change" | "terminal" | "failure" | "unknown";
    };

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
