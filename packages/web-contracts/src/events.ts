/**
 * Web SSE 实时流事件数据传输对象 (DTO)。
 */

import type { BrowserSessionInputOutcome, BrowserSessionState } from "./session-input";

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
    }
    | {
        readonly kind: "candidate_preview";
        readonly sourceEventId: string;
        readonly sourceCursor: number;
        readonly candidateId: string;
        readonly text: string;
        readonly startOffset: number;
        readonly truncated: boolean;
        readonly complete: boolean;
    }
    | {
        readonly kind: "candidate_invalidated";
        readonly sourceEventId: string;
        readonly sourceCursor: number;
        readonly candidateId: string;
        readonly reason: "rejected" | "cancelled" | "failed" | "replaced" | "ambiguous";
    };

/**
 * 浏览器端消费的 Goal 范围实时推送事件。
 *
 * @remarks
 * 连接覆盖整个 Goal，不绑定单一当前 Run：`state_sync` 是订阅首项的一致安全状态，
 * `input_result` 按 `inputId` 报告受理或拒绝，`activity` 携带真实来源 Run 的公开
 * 执行活动；`snapshot_changed` 与 `refresh_required` 只要求客户端按最新 Snapshot
 * 重新同步，不代表业务终态。
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
        readonly type: "state_sync";
        readonly goalId: string;
        readonly state: BrowserSessionState;
    }
    | {
        readonly type: "input_result";
        readonly goalId: string;
        readonly outcome: BrowserSessionInputOutcome;
    }
    | {
        readonly type: "activity";
        readonly goalId: string;
        readonly runId: string;
        readonly activity: BrowserGoalActivityEvent;
    }
    | {
        readonly type: "message_committed";
        readonly goalId: string;
        readonly runId: string;
        readonly message: {
            readonly messageId: string;
            readonly role: "user" | "assistant";
            readonly runId: string;
            readonly purpose?: "process" | "answer" | "notice";
            readonly commitRevision: number;
            readonly previewId?: string;
        };
    }
    | {
        readonly type: "interaction_required";
        readonly goalId: string;
        readonly runId: string;
        readonly interaction: {
            readonly interactionId: string;
            readonly kind: "ask_user" | "task_approval" | "action_approval" | "action_recovery";
            readonly runId: string;
        };
    }
    | {
        readonly type: "snapshot_changed";
        readonly goalId: string;
        readonly runId?: string;
    }
    | {
        readonly type: "refresh_required";
        readonly goalId: string;
        readonly runId?: string;
    };
