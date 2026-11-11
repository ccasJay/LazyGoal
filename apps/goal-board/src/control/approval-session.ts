import type {
  BrowserActionReview,
} from "../../../../packages/web-contracts/src/index";
import type { ControlIntentState, ControlState } from "./types";

/** 审批会话的派生阶段。 */
export type ApprovalSessionPhase =
  | "unreviewed"
  | "reviewing"
  | "reviewed"
  | "submitting"
  | "accepted"
  | "settled"
  | "invalidated"
  | "unknown";

/**
 * 一个 Action 审批的派生会话。
 *
 * @remarks
 * 审批会话不是独立持久化资源：它由当前 `pendingAction`、最近一次
 * `action_review` 意图与对应 `respond` 提交意图派生。`accepted` 只表示决定已保存，
 * `settled` 才表示等待已解除；`pendingAction` 身份变化使旧会话失效。
 *
 * @example
 * ```ts
 * const session = selectApprovalSession(state, actionId);
 * ```
 */
export interface ApprovalSession {
  readonly actionId: string;
  readonly phase: ApprovalSessionPhase;
  /** 最近一次成功预检结果；尚无预检时省略。 */
  readonly review?: BrowserActionReview;
  /** 取得当前预检的意图身份。 */
  readonly reviewIntentId?: string;
  /** 对应审批决定的提交意图身份。 */
  readonly submissionIntentId?: string;
}

/**
 * 从控制状态派生一个 Action 的审批会话。
 *
 * @remarks
 * 只信任最近一次针对该 Action 的 `action_review` 意图；更早的预检结果即使仍在
 * 状态下也不复用。提交意图按当前等待交互的 `requestId` 关联，不使用相近时间或
 * 其它 Action 的决定推断。当前 `pendingAction` 已消失时报告 `settled`，身份改变
 * 时报告 `invalidated`。
 *
 * @param state - 当前控制状态。
 * @param actionId - 等待审批的 Action 身份。
 * @returns 该 Action 的派生审批阶段。
 * @example
 * ```ts
 * if (selectApprovalSession(state, actionId).phase === "reviewed") enableApprove();
 * ```
 */
export function selectApprovalSession(state: ControlState, actionId: string): ApprovalSession {
  const reviewEntry = latestReviewIntent(state, actionId);
  const review = reviewEntry === undefined ? undefined : reviewOf(reviewEntry);
  const submission = latestSubmissionIntent(state, actionId);
  const pendingAction = state.snapshot?.goal.pendingAction;

  if (submission !== undefined) {
    const base = {
      actionId,
      ...(review === undefined ? {} : { review }),
      ...(reviewEntry === undefined ? {} : { reviewIntentId: reviewEntry.intent.intentId }),
      submissionIntentId: submission.intent.intentId,
    };
    switch (submission.phase) {
      case "pending":
        return { ...base, phase: "submitting" };
      case "accepted":
        return { ...base, phase: "accepted" };
      case "applied":
        return { ...base, phase: pendingAction === undefined ? "settled" : "accepted" };
      case "rejected":
        return { ...base, phase: "invalidated" };
      case "unknown":
        return { ...base, phase: "unknown" };
    }
  }

  if (pendingAction === undefined) {
    return reviewEntry === undefined
      ? { actionId, phase: "unreviewed" }
      : {
          actionId,
          phase: "settled",
          ...(review === undefined ? {} : { review }),
          reviewIntentId: reviewEntry.intent.intentId,
        };
  }
  if (pendingAction.actionId !== actionId) return { actionId, phase: "invalidated" };
  if (reviewEntry === undefined) return { actionId, phase: "unreviewed" };

  switch (reviewEntry.phase) {
    case "pending":
      return { actionId, phase: "reviewing", reviewIntentId: reviewEntry.intent.intentId };
    case "rejected":
      return { actionId, phase: "unreviewed" };
    case "unknown":
      return { actionId, phase: "unknown", reviewIntentId: reviewEntry.intent.intentId };
    default:
      return review === undefined
        ? { actionId, phase: "unreviewed" }
        : { actionId, phase: "reviewed", review, reviewIntentId: reviewEntry.intent.intentId };
  }
}

function latestReviewIntent(state: ControlState, actionId: string): ControlIntentState | undefined {
  const snapshot = state.snapshot;
  if (snapshot === null) return undefined;
  const current = snapshot.goal.interaction;
  return [...state.intents].reverse().find((entry) =>
    entry.intent.kind === "action_review" && entry.intent.actionId === actionId
    && entry.intent.goalId === snapshot.goal.goalId && entry.intent.runId === snapshot.goal.currentRunId
    && entry.reviewTarget?.view === state.view
    && (snapshot.goal.pendingAction?.actionId !== actionId
      || entry.reviewTarget.interactionId === current?.interactionId));
}

function latestSubmissionIntent(state: ControlState, actionId: string): ControlIntentState | undefined {
  const requestId = approvalRequestId(state, actionId);
  if (requestId === undefined) return undefined;
  return [...state.intents].reverse().find((entry) =>
    entry.intent.kind === "session_input"
    && entry.intent.input.kind === "respond"
    && entry.intent.goalId === state.snapshot?.goal.goalId
    && entry.intent.input.runId === state.snapshot.session.runId
    && entry.intent.input.requestId === requestId);
}

function approvalRequestId(state: ControlState, actionId: string): string | undefined {
  const interaction = state.snapshot?.session.interaction;
  if (interaction?.actionId === actionId) return interaction.requestId;
  const goalInteraction = state.snapshot?.goal.interaction;
  return goalInteraction?.actionId === actionId ? goalInteraction.requestId : undefined;
}

function reviewOf(entry: ControlIntentState): BrowserActionReview | undefined {
  const receipt = entry.receipt;
  if (receipt === undefined || receipt.status === "rejected" || receipt.status === "unknown") return undefined;
  if (receipt.result.kind !== "action_review" || !receipt.result.result.ok) return undefined;
  return receipt.result.result.review;
}
