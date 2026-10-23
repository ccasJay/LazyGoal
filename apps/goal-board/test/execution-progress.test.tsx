import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserGoalActivityEvent, BrowserGoalLiveEvent } from "../../../packages/web-contracts/src/index";
import { recordExecutionProgress } from "../src/execution-progress";
import { projectActivityGroups } from "../src/activity-projector";
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
  assert.match(html, /data-execution-unit-id="unit-1"/);
  assert.match(html, /timeline-step-progress/);
  assert.doesNotMatch(html, /timeline-progress|Recent live events from this connection/);
  assert.match(html, /Inspect Waiting for model response/);
});

test("a later Run does not inherit the last operation of the previous Run", () => {
  const entries = recordExecutionProgress([], event({ kind: "model_started", stage: "think" }, "previous-run"), Date.now());
  const html = renderToStaticMarkup(<SessionTimeline projection={{ items: [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus="running" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={entries} streamConnected brandMark="/logo.svg" />);
  assert.doesNotMatch(html, /Analyzing the question/);
  assert.doesNotMatch(html, /timeline-step-progress|Waiting for execution events|data-execution-unit-id/);
});

test("non-running runs hide live progress even when connection events remain cached", () => {
  const entries = recordExecutionProgress([], event({ kind: "model_started", stage: "decide", executionUnitId: "unit-1" }), Date.now());
  for (const runStatus of ["created", "waiting", "completed", "failed", "cancelled"] as const) {
    for (const streamConnected of [true, false]) {
      const html = renderToStaticMarkup(<SessionTimeline projection={{ items: [], currentPlanRoute: undefined }}
        currentRunId="run-1" runStatus={runStatus} olderAvailable={false} showExecutionFacts liveActivity={null}
        progressEntries={entries} streamConnected={streamConnected} brandMark="/logo.svg" />);
      assert.doesNotMatch(html, /timeline-step-progress|timeline-progress|timeline-working|Recent execution events|Waiting for model response/,
        `${runStatus}, connected=${streamConnected}`);
    }
  }
});

test("model silence warns after sixty seconds while disconnection and fresh text do not", () => {
  const now = Date.now();
  const entries = recordExecutionProgress([], event({ kind: "model_started", stage: "decide", executionUnitId: "unit-1", occurredAt: new Date(now - 70_000).toISOString() }), now - 61_000);
  const render = (progress: typeof entries, connected = true) => renderToStaticMarkup(<SessionTimeline projection={{ items: [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus="running" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={progress} streamConnected={connected} brandMark="/logo.svg" />);
  assert.match(render(entries), /No new public response for 60 seconds/);
  const disconnected = render(entries, false);
  assert.match(disconnected, /Reconnecting. Showing the last observed operation/);
  assert.doesNotMatch(disconnected, /No new public response for 60 seconds|activity-snake-loader/);
  const delta = event({ kind: "assistant_text_delta", text: "PRIVATE_TEXT", truncated: false, sourceEventId: "e2", sourceCursor: 2 });
  const resumed = recordExecutionProgress(entries, delta, now);
  assert.doesNotMatch(render(resumed), /No new public response for 60 seconds|PRIVATE_TEXT/);
});

test("model completion and tool retries retain their real execution identity without crossing runs", () => {
  let entries = recordExecutionProgress([], event({ kind: "model_started", stage: "decide", executionUnitId: "model-unit" }), 1);
  entries = recordExecutionProgress(entries, event({ kind: "model_completed" }), 2);
  assert.equal(entries.at(-1)?.executionUnitId, "model-unit");
  entries = recordExecutionProgress(entries, event({ kind: "tool_started", actionId: "action-1", executionUnitId: "tool-unit",
    toolId: "read_file", sourceEventId: "e1", sourceCursor: 1 }), 3);
  entries = recordExecutionProgress(entries, event({ kind: "tool_attempt_failed", actionId: "action-1", attempt: 1,
    reason: "temporary failure", sourceEventId: "e2", sourceCursor: 2 }), 4);
  assert.equal(entries.at(-1)?.executionUnitId, "tool-unit");
  assert.equal(entries.at(-1)?.actionId, "action-1");
  entries = recordExecutionProgress(entries, event({ kind: "model_completed" }, "other-run"), 5);
  assert.equal(entries.at(-1)?.executionUnitId, undefined);
});

test("progress belongs to the matching correction node and never an adjacent event or another run", () => {
  const entries = recordExecutionProgress([], event({ kind: "model_started", executionUnitId: "unit-1" }), 1);
  const html = renderToStaticMarkup(<SessionTimeline projection={{ currentPlanRoute: undefined, items: [
    { kind: "fact", itemId: "repair", runId: "run-1", eventType: "model_repair_feedback_recorded", title: "Correcting model output",
      detail: "Correction detail", executionUnitId: "unit-1", position: { runId: "run-1", runOrder: 0, sequence: 1, itemKind: "fact", order: 0 } },
  ] }} currentRunId="run-1" runStatus="running" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={entries} streamConnected brandMark="/logo.svg" />);
  assert.match(html, /Correcting model output/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Correction detail|Waiting for model response|data-execution-unit-id|timeline-progress/);
});

test("tool progress appears once inside its own expanded activity step", () => {
  const source = { kind: "tool_started" as const, actionId: "action-1", executionUnitId: "tool-unit", toolId: "read_file",
    sourceEventId: "e1", sourceCursor: 1, inputSummary: "README.md" };
  const live = event(source);
  const entries = recordExecutionProgress([], live, Date.now());
  const groups = projectActivityGroups({ goalId: "goal-1", runId: "run-1", current: true, runStatus: "running", items: [], liveEvents: [live] });
  const html = renderToStaticMarkup(<SessionTimeline projection={{ currentPlanRoute: undefined, items: groups.map(group => ({
    kind: "activity" as const, itemId: `activity:${group.id}`, runId: "run-1", group,
  })) }} currentRunId="run-1" runStatus="running" olderAvailable={false} showExecutionFacts liveActivity={null}
    progressEntries={entries} streamConnected brandMark="/logo.svg" onOpenTrajectory={() => {}} />);
  assert.match(html, /timeline-activity running/);
  assert.equal((html.match(/class="timeline-step-progress"/g) ?? []).length, 1);
  assert.match(html, /Inspect Running read_file/);
  assert.doesNotMatch(html, /data-execution-unit-id|timeline-progress|Recent live events/);
});

test("similar tool attempts from different actions never coalesce into one step", () => {
  const attempt = (actionId: string) => event({ kind: "tool_attempt_failed", actionId, attempt: 1, reason: "temporary failure",
    sourceEventId: actionId, sourceCursor: 1 });
  const first = recordExecutionProgress([], attempt("a1"), 1);
  const second = recordExecutionProgress(first, attempt("a2"), 2);
  assert.equal(second.length, 2);
  assert.deepEqual(second.map(entry => entry.actionId), ["a1", "a2"]);
});
