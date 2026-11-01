import assert from "node:assert/strict";
import { test } from "node:test";

import { selectApprovalSession } from "../src/control/approval-session";
import { applyControlEvent, beginControlIntent, settleControlIntent } from "../src/control/reducer";
import {
  acceptedInput,
  acceptedReview,
  actionReviewIntent,
  appliedInputEvent,
  controlSnapshot,
  pendingAction,
  respondIntent,
  reviewFor,
  stateWith,
} from "./control-fixtures";

const actionId = "action-1";
const requestId = "request-approval-1";

test("审批会话依次经历 reviewing、reviewed、submitting、accepted 与 settled", () => {
  let state = stateWith(controlSnapshot({
    pendingAction: pendingAction(actionId),
    interactionRequestId: requestId,
    interactionActionId: actionId,
  }));
  assert.equal(selectApprovalSession(state, actionId).phase, "unreviewed");

  state = beginControlIntent(state, actionReviewIntent("review-1", actionId));
  assert.equal(selectApprovalSession(state, actionId).phase, "reviewing");

  const review = reviewFor(actionId, "ref-1");
  state = settleControlIntent(state, acceptedReview("review-1", review));
  const reviewed = selectApprovalSession(state, actionId);
  assert.equal(reviewed.phase, "reviewed");
  assert.equal(reviewed.review?.reviewRef, "ref-1");
  assert.equal(reviewed.reviewIntentId, "review-1");

  state = beginControlIntent(state, respondIntent("respond-1", "input-approval-1", requestId));
  assert.equal(selectApprovalSession(state, actionId).phase, "submitting");

  state = settleControlIntent(state, acceptedInput("respond-1", "input-approval-1"));
  assert.equal(selectApprovalSession(state, actionId).phase, "accepted");

  state = applyControlEvent(state, appliedInputEvent("input-approval-1"));
  assert.equal(selectApprovalSession(state, actionId).phase, "accepted");

  state = applyControlEvent(state, {
    type: "state_sync",
    goalId: "goal-1",
    state: { ...controlSnapshot().session, commitRevision: 2 },
    snapshot: controlSnapshot({ revision: 2 }),
  });
  assert.equal(selectApprovalSession(state, actionId).phase, "settled");
});

test("pendingAction 身份变化使旧审批会话失效", () => {
  let state = stateWith(controlSnapshot({
    pendingAction: pendingAction(actionId),
    interactionRequestId: requestId,
    interactionActionId: actionId,
  }));
  state = beginControlIntent(state, actionReviewIntent("review-1", actionId));
  state = settleControlIntent(state, acceptedReview("review-1", reviewFor(actionId, "ref-1")));
  assert.equal(selectApprovalSession(state, actionId).phase, "reviewed");

  state = applyControlEvent(state, {
    type: "state_sync",
    goalId: "goal-1",
    state: { ...controlSnapshot().session, commitRevision: 1 },
    snapshot: controlSnapshot({
      revision: 1,
      pendingAction: pendingAction("action-2"),
      interactionRequestId: "request-approval-2",
      interactionActionId: "action-2",
    }),
  });
  assert.equal(selectApprovalSession(state, actionId).phase, "invalidated");
  assert.equal(selectApprovalSession(state, "action-2").phase, "unreviewed");
});

test("只有最近一次预检结果可用于审批", () => {
  let state = stateWith(controlSnapshot({
    pendingAction: pendingAction(actionId),
    interactionRequestId: requestId,
    interactionActionId: actionId,
  }));
  state = beginControlIntent(state, actionReviewIntent("review-1", actionId));
  state = settleControlIntent(state, acceptedReview("review-1", reviewFor(actionId, "ref-1")));
  state = beginControlIntent(state, actionReviewIntent("review-2", actionId));
  state = settleControlIntent(state, acceptedReview("review-2", reviewFor(actionId, "ref-2")));

  const session = selectApprovalSession(state, actionId);
  assert.equal(session.reviewIntentId, "review-2");
  assert.equal(session.review?.reviewRef, "ref-2");
});

test("被拒绝的预检回到 unreviewed，未知结果保持 unknown", () => {
  let state = stateWith(controlSnapshot({
    pendingAction: pendingAction(actionId),
    interactionRequestId: requestId,
    interactionActionId: actionId,
  }));
  state = beginControlIntent(state, actionReviewIntent("review-1", actionId));
  state = settleControlIntent(state, { intentId: "review-1", status: "rejected", error: "invalid_tool_input" });
  assert.equal(selectApprovalSession(state, actionId).phase, "unreviewed");

  state = beginControlIntent(state, actionReviewIntent("review-2", actionId));
  state = settleControlIntent(state, { intentId: "review-2", status: "unknown" });
  assert.equal(selectApprovalSession(state, actionId).phase, "unknown");
});
