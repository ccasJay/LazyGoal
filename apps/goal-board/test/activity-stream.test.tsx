import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectActivityGroups } from "../src/activity-projector";
import { SessionTimeline, ActivityGroupRow } from "../src/components/SessionTimeline";
import type { SessionTimelineEntry } from "../src/session-timeline";

(globalThis as any).React = React;

const position = (sequence: number) => ({ runId: "run-1", runOrder: 0, sequence, itemKind: "fact" as const, order: 0 });

function activity(status: "completed" | "failed" | "recorded" = "completed", stageId?: string): Extract<SessionTimelineEntry, { kind: "activity" }> {
  const group = projectActivityGroups({
    goalId: "goal-1", runId: "run-1", liveEvents: [], current: true, runStatus: "running",
    items: [{
      type: "fact", itemId: "fact:tool-1", eventId: "tool-1", runId: "run-1", actionId: "action-1",
      ...(stageId === undefined ? {} : { stageId }),
      position: position(2), eventType: "tool_started", title: "Tool started",
      tool: { toolId: "bash", status, inputSummary: "npm test", summary: "3 tests failed" },
    }],
  })[0]!;
  return { kind: "activity", itemId: `activity:${group.id}`, runId: "run-1", group, position: position(2) };
}

function stage(eventType: string, sequence: number): SessionTimelineEntry {
  return { kind: "fact", itemId: `fact:${sequence}`, runId: "run-1", eventType, title: "Stage event",
    stageId: "stage-1", stageRevision: 1, position: position(sequence),
    ...(eventType === "run_stage_declared" ? { stageTarget: "Verify the implementation" } : {}) };
}

function render(items: readonly SessionTimelineEntry[], options: { showExecutionFacts?: boolean; running?: boolean } = {}) {
  return renderToStaticMarkup(<SessionTimeline projection={{ items, currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus={options.running ? "running" : "completed"} olderAvailable={false}
    showExecutionFacts={options.showExecutionFacts ?? true} liveActivity={null} streamConnected brandMark="/logo.svg" />);
}

test("an accepted real stage collapses its tools and leaves the final answer outside", () => {
  const html = render([
    stage("run_stage_declared", 1), activity("completed", "stage-1"), stage("run_stage_accepted", 3),
    { kind: "message", itemId: "answer", presentationKey: "answer", runId: "run-1", role: "assistant", purpose: "answer", content: "Verified result", position: position(4) },
  ]);
  assert.match(html, /timeline-stage completed/);
  assert.match(html, /<button(?=[^>]*timeline-stage-heading)(?=[^>]*aria-expanded="false")[^>]*>/);
  assert.match(html, /Verify the implementation/);
  assert.doesNotMatch(html, /timeline-activity-heading/);
  assert.match(html, /<\/div><\/div><article class="message assistant"/);
  assert.match(html, /Verified result/);
});

test("a stage identity without a real title stays a flat activity", () => {
  const html = render([activity("completed", "stage-not-in-window")]);
  assert.doesNotMatch(html, /class="timeline-stage /);
  assert.match(html, /timeline-activity-heading/);
  assert.match(html, /Ran npm test/);
});

test("saved correction and lookup activities retain collapsed diagnostics after the run ends", () => {
  const html = render([
    { kind: "fact", itemId: "correction", runId: "run-1", eventType: "model_repair_feedback_recorded",
      title: "Correcting model output", detail: "Tool input did not satisfy the current contract. Correction 2 of 3.", position: position(3) },
    { kind: "lookup", itemId: "lookup:run-1:missing", runId: "run-1", lookupId: "missing",
      status: "not_found", request: "History search", resultDetail: "No matching history was found.", position: position(4) },
  ], { showExecutionFacts: false });
  assert.match(html, /Correcting model output/);
  assert.match(html, /Look up history/);
  assert.match(html, /Not found/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Correction 2 of 3|No matching history was found/);
});

test("one lookup row shows a distinct not-found state and expands failure diagnostics", () => {
  const html = render([
    { kind: "lookup", itemId: "lookup:run-1:missing", runId: "run-1", lookupId: "missing",
      status: "not_found", request: "History search · Historical execution",
      resultDetail: "No matching history was found.", position: position(1) },
    { kind: "lookup", itemId: "lookup:run-1:broken", runId: "run-1", lookupId: "broken",
      status: "failed", request: "Search history directory", errorCode: "CONTEXT_LOOKUP_FAILED",
      resultDetail: "The history lookup could not be completed.", position: position(2) },
  ], { showExecutionFacts: false });
  assert.equal((html.match(/Look up history/g) ?? []).length, 2);
  assert.match(html, /No matching records/);
  assert.match(html, /Not found/);
  assert.match(html, /The lookup could not be completed/);
  assert.match(html, /CONTEXT_LOOKUP_FAILED/);
  assert.doesNotMatch(html, /Looking up history|History lookup failed/);
});

test("a later acceptance resolves a prior stage rejection of the same revision", () => {
  const html = render([stage("run_stage_declared", 1), stage("run_stage_rejected", 2), stage("run_stage_accepted", 3)]);
  assert.match(html, /timeline-stage completed/);
  assert.doesNotMatch(html, /Needs attention/);
});

test("accepting one revision cannot accept a later stage revision", () => {
  const html = render([
    stage("run_stage_declared", 1), stage("run_stage_accepted", 2),
    { ...stage("run_stage_declared", 3), stageRevision: 2, stageTarget: "Verify revised implementation" } as SessionTimelineEntry,
  ]);
  assert.match(html, /timeline-stage completed/);
  assert.match(html, /timeline-stage recorded/);
  assert.match(html, /Verify revised implementation/);
});

test("execution filtering preserves failed calls inside a real stage", () => {
  const html = render([stage("run_stage_declared", 1), activity("failed", "stage-1")], { showExecutionFacts: false });
  assert.match(html, /timeline-stage attention/);
  assert.match(html, /Needs attention/);
  assert.match(html, /timeline-activity failed/);
  assert.match(html, /3 tests failed/);
});

test("a manually collapsed failure keeps its diagnostic summary visible", () => {
  const entry = activity("failed");
  const html = renderToStaticMarkup(<ActivityGroupRow itemId={entry.itemId} runId={entry.runId}
    group={entry.group} expanded={false} onToggle={() => {}} onOpenTrajectory={undefined} />);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /timeline-activity-alert[^>]*>3 tests failed/);
  assert.doesNotMatch(html, /timeline-activity-members/);
});

test("a settled mixed result exposes its failure without a working animation", () => {
  const entry = activity("failed");
  const success = activity("completed").group.members[0]!;
  const group = { ...entry.group, status: "partial-failure" as const,
    members: [...entry.group.members, { ...success, id: "successful-call" }],
    counts: { ...entry.group.counts, completed: 1 } };
  const html = renderToStaticMarkup(<ActivityGroupRow itemId={entry.itemId} runId={entry.runId}
    group={group} expanded={false} onToggle={() => {}} onOpenTrajectory={undefined} />);
  assert.match(html, /Partially failed/);
  assert.match(html, /1 succeeded/);
  assert.match(html, /1 failed/);
  assert.match(html, /3 tests failed/);
  assert.doesNotMatch(html, /activity-snake-loader/);
});

test("historical execution collapses while user messages and final answers remain readable", () => {
  const old = (entry: SessionTimelineEntry): SessionTimelineEntry => ({ ...entry, runId: "old-run" });
  const html = render([
    old({ kind: "run", itemId: "run:old-run", runId: "old-run", status: "failed", detail: { code: "INVALID_AGENT_DECISION", message: "The model response was invalid." }, position: position(0) }),
    old({ kind: "message", itemId: "user", presentationKey: "user", runId: "old-run", role: "user", content: "Original question", position: position(1) }),
    old({ kind: "message", itemId: "process", presentationKey: "process", runId: "old-run", role: "assistant", purpose: "process", content: "Hidden investigation", position: position(2) }),
    old(activity("failed")),
    old({ kind: "message", itemId: "answer", presentationKey: "answer", runId: "old-run", role: "assistant", purpose: "answer", content: "Saved final answer", position: position(4) }),
  ]);
  assert.match(html, /Original question/);
  assert.match(html, /Saved final answer/);
  assert.match(html, /The model response was invalid/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Hidden investigation|timeline-activity-heading/);
});

test("an active stage expands without waiting for assistant text", () => {
  const html = render([stage("run_stage_declared", 1), activity("recorded", "stage-1")], { running: true });
  assert.match(html, /timeline-stage running/);
  assert.match(html, /<button(?=[^>]*timeline-stage-heading)(?=[^>]*aria-expanded="true")[^>]*>/);
  assert.match(html, /<button(?=[^>]*timeline-activity-heading)(?=[^>]*aria-expanded="true")[^>]*>/);
  assert.match(html, /Run npm test/);
  assert.doesNotMatch(html, /class="timeline-working"/);
});

test("no standalone progress panel is invented before a model or tool event arrives", () => {
  const html = render([], { running: true });
  assert.doesNotMatch(html, /timeline-working|timeline-progress|Waiting for execution events|activity-snake-loader/);
});

test("message boundaries remain in source order between stage segments", () => {
  const html = render([
    stage("run_stage_declared", 1),
    { kind: "message", itemId: "progress", presentationKey: "progress", runId: "run-1", role: "assistant", purpose: "process", content: "Checking evidence", position: position(2) },
    activity("recorded", "stage-1"),
  ], { running: true });
  assert.equal((html.match(/data-stage-id="stage-1"/g) ?? []).length, 2);
  assert.ok(html.indexOf("Checking evidence") > html.indexOf('data-item-id="fact:1"'));
  assert.ok(html.indexOf("Checking evidence") < html.indexOf('data-item-id="activity:action:run-1:action-1"'));
});

test("long command titles retain the complete accessible label and expanded call details", () => {
  const entry = activity("completed");
  const command = 'Ran git status --short; echo "branch"; git diff --stat; git status --porcelain';
  const group = { ...entry.group, summary: command, members: entry.group.members.map(member => ({ ...member, label: command })) };
  const row = (expanded: boolean) => renderToStaticMarkup(<ActivityGroupRow itemId={entry.itemId} runId={entry.runId}
    group={group} expanded={expanded} onToggle={() => {}} onOpenTrajectory={undefined} />);
  const collapsed = row(false);
  assert.match(collapsed, /data-slot="trace-title"[^>]*title="Ran git status --short; echo &quot;branch&quot;; git diff --stat; git status --porcelain"/);
  assert.match(collapsed, /1 call/);
  assert.doesNotMatch(collapsed, /timeline-activity-members|3 tests failed/);
  const expanded = row(true);
  assert.match(expanded, /timeline-activity-member-label[^>]*>Ran git status --short; echo &quot;branch&quot;; git diff --stat; git status --porcelain/);
  assert.match(expanded, /3 tests failed/);
});

test("messages split consecutive execution traces without changing source order", () => {
  const first = activity("completed");
  const second = { ...activity("failed"), itemId: "second-activity" };
  const html = render([first,
    { kind: "message", itemId: "update", presentationKey: "update", runId: "run-1", role: "assistant", purpose: "process", content: "Checking the remaining files", position: position(3) },
    second]);
  assert.equal((html.match(/data-slot="trace"/g) ?? []).length, 2);
  assert.match(html, /<\/div><article class="message assistant"/);
  assert.ok(html.indexOf("Checking the remaining files") > html.indexOf(`data-item-id="${first.itemId}"`));
  assert.ok(html.indexOf("Checking the remaining files") < html.indexOf('data-item-id="second-activity"'));
});
