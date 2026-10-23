import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserGoalActivityEvent, BrowserGoalLiveEvent } from "../../../packages/web-contracts/src/index";
import { recordExecutionProgress } from "../src/execution-progress";
import { SessionTimeline } from "../src/components/SessionTimeline";

(globalThis as any).React = React;
const event = (activity: BrowserGoalActivityEvent, runId = "run-1"): BrowserGoalLiveEvent => ({ type: "activity", goalId: "goal-1", runId, activity });

test("model progress distinguishes deciding, explicit analysis and completion review", () => {
  const entries = (["decide", "think", "completion_review"] as const).reduce((current, stage) => recordExecutionProgress(current,
    event({ kind: "model_started", stage, modelCallId: `call-${stage}`, occurredAt: "2026-10-22T00:00:00.000Z", executionUnitId: "unit-1" }), 99), [] as ReturnType<typeof recordExecutionProgress>);
  assert.deepEqual(entries.map(entry => entry.label), Array(3).fill("Waiting for model response"));
  assert.equal(entries[0]?.startedAt, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(entries[0]?.hasSourceTime, true);
  assert.equal(entries[0]?.executionUnitId, "unit-1");
});

test("text fragments do not flood recent progress or reset the observed start time", () => {
  const delta = event({ kind: "assistant_text_delta", text: "PRIVATE_RESPONSE_TEXT", truncated: false, sourceEventId: "e1", sourceCursor: 1 });
  const initial = recordExecutionProgress([], delta, 100);
  const next = recordExecutionProgress(initial, delta, 5000);
  assert.equal(next.length, 1);
  assert.equal(next[0]?.id, initial[0]?.id);
  assert.equal(next[0]?.lastObservedAt, 5000);
  assert.equal(next[0]?.startedAt, 100);
  assert.equal(next[0]?.hasSourceTime, false);
  assert.equal(JSON.stringify(next).includes("PRIVATE_RESPONSE_TEXT"), false);
});

test("progress stays bounded and never marks a returned tool result as saved", () => {
  let entries: ReturnType<typeof recordExecutionProgress> = [];
  for (let index = 0; index < 30; index += 1) entries = recordExecutionProgress(entries, event({ kind: "model_started", stage: "decide" }), index);
  assert.equal(entries.length, 20);
  const next = recordExecutionProgress(entries, event({ kind: "tool_finished", sourceEventId: "e1", sourceCursor: 1,
    actionId: "a1", toolId: "read_file", outcome: "success", summary: "PRIVATE_OUTPUT" }), 100);
  assert.equal(next.at(-1)?.detail, "Waiting for the result to be saved.");
  assert.equal(JSON.stringify(next).includes("PRIVATE_OUTPUT"), false);
});

test("the running view shows a real phase, source elapsed time and an inspectable live log", () => {
  const entries = recordExecutionProgress([], event({ kind: "model_started", stage: "completion_review",
    occurredAt: new Date(Date.now() - 42000).toISOString(), executionUnitId: "unit-1" }), Date.now());
  const html = renderToStaticMarkup(<SessionTimeline projection={{ items: [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus="running" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={entries} streamConnected brandMark="/logo.svg" onOpenTrajectory={() => {}} />);
  assert.match(html, /Checking the proposed answer/);
  assert.match(html, /No public response received yet/);
  assert.match(html, /Time since the model request started/);
  assert.match(html, /4[23]s/);
  assert.match(html, /Recent live events from this connection/);
  assert.match(html, /Inspect Waiting for model response/);
});

test("a later Run does not inherit the last operation of the previous Run", () => {
  const entries = recordExecutionProgress([], event({ kind: "model_started", stage: "think" }, "previous-run"), Date.now());
  const html = renderToStaticMarkup(<SessionTimeline projection={{ items: [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus="running" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={entries} streamConnected brandMark="/logo.svg" />);
  assert.doesNotMatch(html, /Analyzing the question/);
  assert.match(html, /No current operation observed/);
});

test("a terminal run retains an inspectable log without a running animation or elapsed timer", () => {
  const entries = recordExecutionProgress([], event({ kind: "model_started", stage: "decide", executionUnitId: "unit-1" }), Date.now());
  const html = renderToStaticMarkup(<SessionTimeline projection={{ items: [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus="failed" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={entries} streamConnected brandMark="/logo.svg" />);
  assert.match(html, /Recent execution events/);
  assert.match(html, /Waiting for model response/);
  assert.doesNotMatch(html, /activity-snake|timeline-progress-elapsed|No public response received yet/);
});

test("model silence warns after sixty seconds while disconnection and fresh text do not", () => {
  const now = Date.now();
  const entries = recordExecutionProgress([], event({ kind: "model_started", stage: "decide", occurredAt: new Date(now - 70_000).toISOString() }), now - 61_000);
  const render = (progress: typeof entries, connected = true) => renderToStaticMarkup(<SessionTimeline projection={{ items: [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus="running" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={progress} streamConnected={connected} brandMark="/logo.svg" />);
  assert.match(render(entries), /No new public response for 60 seconds/);
  const disconnected = render(entries, false);
  assert.match(disconnected, /Reconnecting · last observed activity/);
  assert.doesNotMatch(disconnected, /No new public response for 60 seconds|activity-snake-loader/);
  const delta = event({ kind: "assistant_text_delta", text: "PRIVATE_TEXT", truncated: false, sourceEventId: "e2", sourceCursor: 2 });
  const resumed = recordExecutionProgress(entries, delta, now);
  assert.doesNotMatch(render(resumed), /No new public response for 60 seconds|PRIVATE_TEXT/);
});
