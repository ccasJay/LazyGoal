import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserModelInputSummary, BrowserTrajectoryEntry } from "../../../packages/browser/src/index";
import { requestResult } from "../src/trajectory-presentation";

const call = (id: string, time: number): BrowserModelInputSummary => ({ goalId: "goal", runId: "run", callId: id, executionUnitId: "unit", stepIndex: 2, stage: "decide", occurredAt: new Date(time).toISOString(), systemVersion: "hash", firstSystem: false, systemChanged: false, previousCallId: null, messages: [], omittedMessageCount: 0 });
const feedback = (sequence: number, time: number): BrowserTrajectoryEntry => ({ eventId: `event-${sequence}`, sequence, occurredAt: new Date(time).toISOString(), eventType: "model_repair_feedback_recorded", category: "decision", executionUnitId: "unit", stepIndex: 2, modelStage: "decide", title: "rejected", preview: "path: required", previewTruncated: false });

test("committed feedback belongs to one prepared request, not another retry or stage", () => {
  const calls = [call("first", 100), call("second", 200), call("third", 300)];
  const entries = [feedback(20, 150), feedback(24, 250), feedback(28, 350)];
  assert.deepEqual(calls.map(value => requestResult(value, calls, entries).entry?.sequence), [20, 24, 28]);
  assert.equal(requestResult(calls[0]!, calls, [{ ...entries[0]!, executionUnitId: "other" }]).status, "prepared");
  assert.equal(requestResult(calls[0]!, calls, [{ ...entries[0]!, modelStage: "think" }]).status, "prepared");
  assert.equal(requestResult(calls[0]!, calls, entries, false).status, "prepared");
});

test("ambiguous timing and duplicate feedback do not fabricate a result; accepted frames use call identity", () => {
  const first = call("first", 100);
  assert.equal(requestResult(first, [first, call("same-time", 100)], [feedback(1, 150)]).status, "prepared");
  assert.equal(requestResult(first, [first], [feedback(1, 150), feedback(2, 160)]).status, "prepared");
  assert.equal(requestResult(first, [first], [{ ...feedback(1, 120), eventType: "model_repair_attempt_started" }, feedback(2, 150)]).status, "prepared");
  const accepted: BrowserTrajectoryEntry = { ...feedback(3, 170), eventType: "model_context_frame", modelCallId: "first" };
  assert.equal(requestResult(first, [first], [accepted]).status, "accepted");
  assert.equal(requestResult(first, [first], [{ ...accepted, modelCallId: "other" }]).status, "prepared");
});
