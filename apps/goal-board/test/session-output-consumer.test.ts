import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserGoalLiveEvent } from "../../../packages/web-contracts/src/index";
import {
  EMPTY_SESSION_OUTPUT_DISPLAY,
  applySessionOutputEvent,
  type SessionOutputDisplay,
} from "../src/session-output-consumer";

function previewEvent(text: string, startOffset = 0): BrowserGoalLiveEvent {
  return {
    type: "activity",
    goalId: "goal-1",
    runId: "run-1",
    activity: {
      kind: "candidate_preview",
      sourceEventId: "event-1",
      sourceCursor: 1,
      candidateId: "candidate-1",
      text,
      startOffset,
      truncated: false,
      complete: true,
    },
  };
}

function committedEvent(messageId: string): BrowserGoalLiveEvent {
  return {
    type: "message_committed",
    goalId: "goal-1",
    runId: "run-1",
    message: {
      messageId,
      role: "assistant",
      runId: "run-1",
      purpose: "answer",
      commitRevision: 7,
      previewId: "candidate-1",
    },
  };
}

test("未确认候选只进入临时显示，不被当作正式消息", () => {
  const display = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, previewEvent("候选正文"));
  assert.ok(display !== undefined);
  assert.equal(display.liveText, "候选正文");
  assert.equal(display.unconfirmed, true);
  assert.match(display.liveActivity, /not saved/);
});

test("正式消息替换未确认预览，正文不会追加两次", () => {
  const preview = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, previewEvent("候选正文"));
  assert.ok(preview !== undefined);
  const committed = applySessionOutputEvent(preview, committedEvent("msg-1"));
  assert.ok(committed !== undefined);
  assert.equal(committed.liveText, "");
  assert.equal(committed.unconfirmed, false);
  assert.equal(committed.liveText.includes("候选正文"), false);
});

test("重复的正式消息通知不产生第二份正文", () => {
  const first = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, committedEvent("msg-1"));
  assert.ok(first !== undefined);
  const second = applySessionOutputEvent(first, committedEvent("msg-1"));
  assert.ok(second !== undefined);
  assert.equal(second.liveText, first.liveText);
  assert.equal(second.unconfirmed, false);
});

test("候选作废后临时正文被清空，不保留旧候选", () => {
  const preview = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, previewEvent("候选正文"));
  assert.ok(preview !== undefined);
  const invalidated = applySessionOutputEvent(preview, {
    type: "activity",
    goalId: "goal-1",
    runId: "run-1",
    activity: {
      kind: "candidate_invalidated",
      sourceEventId: "event-2",
      sourceCursor: 2,
      candidateId: "candidate-1",
      reason: "rejected",
    },
  });
  assert.ok(invalidated !== undefined);
  assert.equal(invalidated.liveText, "");
  assert.equal(invalidated.unconfirmed, false);
});

test("等待交互只更新提示，不伪造完成结果", () => {
  const display: SessionOutputDisplay = { liveText: "临时正文", liveActivity: "生成中", unconfirmed: true };
  const next = applySessionOutputEvent(display, {
    type: "interaction_required",
    goalId: "goal-1",
    runId: "run-1",
    interaction: { interactionId: "question:ask-1", kind: "ask_user", runId: "run-1" },
  });
  assert.ok(next !== undefined);
  assert.match(next.liveActivity, /Waiting/);
  assert.equal(next.unconfirmed, true);
});

test("与候选无关的事件不改变显示状态", () => {
  const display: SessionOutputDisplay = { liveText: "临时正文", liveActivity: "生成中", unconfirmed: true };
  assert.equal(applySessionOutputEvent(display, {
    type: "refresh_required",
    goalId: "goal-1",
  }), undefined);
});
