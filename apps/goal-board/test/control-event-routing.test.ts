import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserGoalEvent } from "../../../packages/web-contracts/src/index";
import { readScopesForEvent } from "../src/control/event-routing";

const session = {
  goalId: "goal-1",
  runId: "run-1",
  runStatus: "running",
  mode: "normal",
  commitRevision: 1,
  queueRevision: 0,
  queuePaused: false,
  pendingMessageCount: 0,
  pendingSteerCount: 0,
  needsRecovery: false,
  executionOwner: true,
  messages: { count: 0, recent: [] },
} as const;

test("已由 reducer 应用的控制事实不触发 HTTP 重读", () => {
  const controlEvents: readonly BrowserGoalEvent[] = [
    { type: "state_sync", goalId: "goal-1", state: session },
    { type: "run_status_changed", goalId: "goal-1", runId: "run-1", status: "waiting" },
    { type: "run_result", goalId: "goal-1", runId: "run-1", result: "completed" },
    { type: "interaction_opened", goalId: "goal-1", runId: "run-1", interactionId: "question:1", kind: "question" },
    { type: "interaction_settled", goalId: "goal-1", runId: "run-1", interactionId: "question:1", kind: "question" },
    {
      type: "tool_activity",
      goalId: "goal-1",
      runId: "run-1",
      activity: { actionId: "action-1", executionUnitId: "unit-1", phase: "started" },
    },
    { type: "closed", goalId: "goal-1", reason: "closed" },
    {
      type: "activity",
      goalId: "goal-1",
      runId: "run-1",
      activity: { kind: "activity_boundary", sourceEventId: "event-1", sourceCursor: 1, reason: "assistant_reply" },
    },
  ];
  for (const event of controlEvents) {
    assert.deepEqual(readScopesForEvent(event), [], event.type);
  }
});

test("提交边界、内容事实与故障只声明自己的失效范围", () => {
  assert.deepEqual(readScopesForEvent({
    type: "state_committed", goalId: "goal-1", commitRevision: 2, changed: ["grants"],
  }), ["grants"]);
  assert.deepEqual(readScopesForEvent({
    type: "stream_fault", goalId: "goal-1", code: "gap", resync: ["session", "activity"],
  }), ["session", "activity"]);
  assert.deepEqual(readScopesForEvent({
    type: "message_committed",
    goalId: "goal-1",
    runId: "run-1",
    message: {
      messageId: "msg-1",
      role: "assistant",
      runId: "run-1",
      position: { afterSequence: 1, order: 0 },
      commitRevision: 2,
    },
  }), ["activity", "session"]);
  assert.deepEqual(readScopesForEvent({
    type: "input_result",
    goalId: "goal-1",
    outcome: { goalId: "goal-1", inputId: "input-1", kind: "message", ok: true },
  }), ["session"]);
});
