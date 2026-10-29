import type {
    BrowserInteractionDecision,
    BrowserInteractionKind,
    BrowserInteractionView,
} from "../session";

const DECISIONS_BY_KIND: Readonly<Record<BrowserInteractionKind, readonly BrowserInteractionDecision[]>> = {
    question: ["answer_questions", "reply_to_question", "skip_question"],
    task_approval: ["approve_task", "send_task_feedback"],
    action_approval: ["approve_action", "approve_action_revision", "reject_action"],
    action_recovery: ["retry_unknown_action", "decline_unknown_action_retry"],
};

/**
 * 交互视图的身份与决定子集不变量。
 *
 * @remarks
 * 问答与任务审批使用 `requestId` 且不得携带 `actionId`；Action 审批与恢复等待使用
 * `actionId` 且不得携带 `requestId`。`decisions` 必须是当前种类允许的子集。
 *
 * @param view - 已通过结构解析的交互视图。
 * @returns 身份组合与决定子集均合法时为 `true`。
 *
 * @example
 * ```ts
 * if (isInteractionView(view)) console.log(view.decisions);
 * ```
 */
export function isInteractionView(view: BrowserInteractionView): boolean {
    if (view.kind === "question" || view.kind === "task_approval") {
        if (view.requestId === undefined || view.actionId !== undefined) return false;
    } else if (view.actionId === undefined || view.requestId !== undefined) {
        return false;
    }
    const allowed = DECISIONS_BY_KIND[view.kind];
    return view.decisions.every((decision) => allowed.includes(decision));
}
