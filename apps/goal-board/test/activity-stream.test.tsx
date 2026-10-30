import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectActivityGroups } from "../src/activity-projector";
import { SessionTimeline, ActivityGroupRow } from "../src/components/SessionTimeline";
import type { SessionTimelineEntry, SessionTimelineProjection } from "../src/session-timeline";

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

function render(items: readonly SessionTimelineEntry[], options: { showExecutionFacts?: boolean; running?: boolean; waiting?: boolean; olderAvailable?: boolean; newerItemCount?: number; stages?: SessionTimelineProjection["stages"]; actionGroups?: SessionTimelineProjection["actionGroups"] } = {}) {
  return renderToStaticMarkup(<SessionTimeline projection={{ items, stages: options.stages ?? [], actionGroups: options.actionGroups ?? [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus={options.waiting ? "waiting" : options.running ? "running" : "completed"} olderAvailable={options.olderAvailable ?? false}
    showExecutionFacts={options.showExecutionFacts ?? true} liveActivity={null} streamConnected brandMark="/logo.svg"
    onLoadEarlier={options.olderAvailable ? () => {} : undefined} newerItemCount={options.newerItemCount} />);
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
  assert.match(html, /Run tests/);
});

test("saved correction and lookup activities retain collapsed diagnostics after the run ends", () => {
  const html = render([
    { kind: "fact", itemId: "correction", runId: "run-1", eventType: "model_repair_feedback_recorded",
      title: "Correcting model output", detail: "Tool input did not satisfy the current contract. Correction 2 of 3.", position: position(3) },
    { kind: "lookup", itemId: "lookup:run-1:missing", runId: "run-1", lookupId: "missing",
      status: "not_found", request: "History search", resultDetail: "No matching history was found.", position: position(4) },
  ], { showExecutionFacts: false });
  assert.match(html, /Model output correction recorded/);
  assert.match(html, /Look up history/);
  assert.match(html, /Not found/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Correction 2 of 3|No matching history was found/);
});

test("consecutive corrections group only when their execution unit is known and shared", () => {
  const correction = (n: number, unit?: string): SessionTimelineEntry => ({ kind: "fact", itemId: `correction:${n}`, runId: "run-1",
    eventType: "model_repair_feedback_recorded", title: "Rejected", position: position(n),
    ...(unit === undefined ? {} : { executionUnitId: unit }) });
  assert.match(render([correction(1, "unit"), correction(2, "unit")]), /2 attempts recorded/);
  assert.doesNotMatch(render([correction(1), correction(2)]), /2 attempts recorded/);
  assert.doesNotMatch(render([correction(1, "one"), correction(2, "two")]), /2 attempts recorded/);
});

test("failed current run offers continuation and explains model format failure", () => {
  const items: SessionTimelineEntry[] = [
    { kind: "run", itemId: "run:run-1", runId: "run-1", status: "failed", position: position(0) },
    { kind: "terminal", itemId: "terminal", runId: "run-1", status: "failed", detail: { code: "INVALID_AGENT_DECISION", message: "Invalid response" }, position: position(1) },
  ];
  const html = renderToStaticMarkup(<SessionTimeline projection={{ items, stages: [], actionGroups: [], currentPlanRoute: undefined }}
    currentRunId="run-1" runStatus="failed" olderAvailable={false} showExecutionFacts={false} liveActivity={null}
    streamConnected brandMark="/logo.svg" onContinueFailed={() => {}} />);
  assert.match(html, /Continue Goal/);
  assert.match(html, /The model returned an invalid response/);
  assert.match(html, /INVALID_AGENT_DECISION/);
});

test("progress names only stages supplied by the runtime", () => {
  const stages: SessionTimelineProjection["stages"] = [
    { runId: "run-1", stageId: "a", revision: 1, status: "executing", target: "Inspect recovery", firstSequence: 1, completeWithinPage: true },
    { runId: "run-1", stageId: "b", revision: 1, status: "accepted", target: "Read source", firstSequence: 1, completeWithinPage: true },
  ];
  const html = render([], { running: true, stages });
  assert.match(html, /In progress: Inspect recovery/);
  assert.match(html, /Accepted: Read source/);
  const older = render([], { running: true, stages, newerItemCount: 10 });
  assert.match(older, /Last recorded in progress: Inspect recovery/);
  assert.match(older, /Recorded as accepted: Read source/);
});

test("one lookup row shows a distinct not-found state and expands failure diagnostics", () => {
  const html = render([
    { kind: "lookup", itemId: "lookup:run-1:missing", runId: "run-1", lookupId: "missing",
      status: "not_found", request: "History search, Historical execution",
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
  assert.match(html, /timeline-stage recorded/);
  assert.doesNotMatch(html, /Needs attention/);
  assert.match(html, /timeline-activity failed/);
  assert.match(html, /3 tests failed/);
});

test("a running stage retains failed diagnostics without requesting intervention", () => {
  const context = { runId: "run-1", stageId: "stage-1", revision: 1, status: "executing" as const,
    target: "Verify the implementation", firstSequence: 1, completeWithinPage: true };
  const html = render([stage("run_stage_declared", 1), activity("failed", "stage-1")], { running: true, stages: [context] });
  assert.match(html, /timeline-stage running/);
  assert.doesNotMatch(html, /Needs attention/);
  assert.match(html, /timeline-activity failed/);
  assert.match(html, /3 tests failed/);
  const older = render([stage("run_stage_declared", 1), activity("failed", "stage-1")], { running: true, stages: [context], newerItemCount: 3 });
  assert.match(older, /timeline-stage recorded/);
  assert.doesNotMatch(older, /timeline-stage running/);
});

test("a stage requests attention only for a currently waiting activity", () => {
  const entry = activity("recorded", "stage-1");
  const waiting = { ...entry, group: { ...entry.group, status: "waiting" as const,
    members: entry.group.members.map(member => ({ ...member, status: "waiting" as const })) } };
  const html = render([stage("run_stage_declared", 1), waiting], { waiting: true });
  assert.match(html, /timeline-stage attention/);
  assert.match(html, /Needs attention/);
  assert.doesNotMatch(render([stage("run_stage_declared", 1), waiting], { running: true }), /Needs attention/);
  assert.doesNotMatch(render([stage("run_stage_declared", 1), waiting], { waiting: true, newerItemCount: 3 }), /Needs attention/);
});

test("corrections use an unambiguous execution unit without crossing stage or message boundaries", () => {
  const entry = activity("recorded", "stage-1");
  const owned = { ...entry, group: { ...entry.group, members: entry.group.members.map(member => ({ ...member, executionUnitId: "unit-1" })) } };
  const correction = { kind: "fact" as const, itemId: "repair", runId: "run-1", executionUnitId: "unit-1",
    eventType: "model_repair_feedback_recorded", title: "Correction", position: position(3) };
  const merged = render([stage("run_stage_declared", 1), owned, correction], { running: true });
  assert.equal((merged.match(/data-stage-id="stage-1"/g) ?? []).length, 1);
  assert.match(merged, /Model output correction recorded/);
  const message = { kind: "message" as const, itemId: "message", presentationKey: "message", runId: "run-1",
    role: "assistant" as const, purpose: "process" as const, content: "A progress message", position: position(4) };
  const split = render([stage("run_stage_declared", 1), owned, message, correction, { ...owned, itemId: "activity:second" }], { running: true });
  assert.equal((split.match(/data-stage-id="stage-1"/g) ?? []).length, 2);
  assert.ok(split.indexOf("A progress message") < split.indexOf('data-item-id="repair"'));
  assert.match(split, /Stage activity continued/);
  const ambiguous = { ...owned, itemId: "other-stage", group: { ...owned.group, stageId: "stage-2" } };
  const separate = render([stage("run_stage_declared", 1), owned, correction, { ...owned, itemId: "activity:again" }, ambiguous], { running: true });
  assert.ok(separate.indexOf('data-item-id="repair"') > separate.indexOf('data-item-id="activity:action:run-1:action-1"'));
  assert.ok(separate.indexOf('data-item-id="repair"') < separate.indexOf('data-item-id="activity:again"'));
  assert.equal((separate.match(/data-stage-id="stage-1"/g) ?? []).length, 2);
  const revised = render([stage("run_stage_declared", 1), owned, correction, { ...owned, itemId: "activity:again" },
    { ...stage("run_stage_declared", 5), stageRevision: 2, stageTarget: "Verify a revision" } as SessionTimelineEntry], { running: true });
  assert.equal((revised.match(/data-stage-id="stage-1"/g) ?? []).length, 3);
});

test("an incomplete stage offers one stage-level load action instead of one per activity", () => {
  const entry = activity("recorded", "stage-1");
  const context = { runId: "run-1", stageId: "stage-1", revision: 1, status: "executing" as const,
    target: "Verify the implementation", firstSequence: 1, completeWithinPage: false };
  const action = { runId: "run-1", actionId: "action-1", firstSequence: 1, lastSequence: 3, completeWithinPage: false };
  const html = render([stage("run_stage_declared", 1), entry], { running: true, olderAvailable: true, stages: [context], actionGroups: [action] });
  assert.equal((html.match(/Load earlier activity/g) ?? []).length, 2, "one global control and one stage control");
  assert.match(html, /Details not fully loaded/);
});

test("saved answers offer navigation to a later loaded answer without claiming it is a correction", () => {
  const answer = (runId: string, runOrder: number): SessionTimelineEntry => ({
    kind: "message", itemId: `answer:${runId}`, presentationKey: `answer:${runId}`, runId,
    role: "assistant", purpose: "answer", content: `Answer ${runOrder}`,
    position: { ...position(1), runId, runOrder },
  });
  const html = render([answer("run-1", 0), answer("run-2", 1)]);
  assert.equal((html.match(/View later answer/g) ?? []).length, 1);
  assert.doesNotMatch(html, /corrected answer/i);
  assert.doesNotMatch(render([answer("run-1", 0)]), /View later answer/);
});

test("completed runs distinguish execution status from answer accuracy", () => {
  const html = render([{ kind: "run", itemId: "run:run-1", runId: "run-1", status: "completed", position: position(0) }]);
  assert.match(html, /Run finished; answer accuracy is not indicated/);
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
  assert.match(html, /Run tests/);
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

test("Bash titles stay short while expanded details retain the supplied command and result", () => {
  const command = 'git status --short; echo "branch"; git diff --stat; git status --porcelain';
  const group = projectActivityGroups({ goalId: "goal-1", runId: "run-1", liveEvents: [], current: true, runStatus: "completed",
    items: [{ type: "fact", itemId: "tool", eventId: "tool", runId: "run-1", actionId: "action-1", position: position(1),
      eventType: "tool_started", title: "Tool started", tool: { toolId: "bash", status: "completed", inputSummary: command, summary: "Workspace checked" } }],
  })[0]!;
  const row = (expanded: boolean) => renderToStaticMarkup(<ActivityGroupRow itemId="activity:tool" runId="run-1"
    group={group} expanded={expanded} onToggle={() => {}} onOpenTrajectory={undefined} />);
  const collapsed = row(false);
  assert.match(collapsed, /Run shell commands/);
  assert.match(collapsed, /1 call/);
  assert.doesNotMatch(collapsed, /git status|timeline-activity-member-command|Workspace checked/);
  const expanded = row(true);
  assert.match(expanded, /timeline-activity-member-command[^>]*>git status --short; echo &quot;branch&quot;; git diff --stat; git status --porcelain/);
  assert.match(expanded, /Workspace checked/);
});

test("saved tool activity shows its filtered lifecycle only in the expanded details", () => {
  const group = projectActivityGroups({
    goalId: "goal-1", runId: "run-1", liveEvents: [], current: true, runStatus: "running",
    items: [{
      type: "fact", itemId: "fact:tool-1", eventId: "tool-1", runId: "run-1", actionId: "action-1",
      position: position(2), eventType: "tool_started", title: "Tool started",
      tool: {
        toolId: "bash", status: "completed", actionStatus: "approved", inputSummary: "git status", summary: "Workspace clean",
        lifecycle: [
          { kind: "approval", title: "Permission requested", detail: "Execution is paused until permission is granted." },
          { kind: "approval", title: "Permission granted" },
          { kind: "execution", title: "Tool started" },
          { kind: "result", title: "Result saved" },
        ],
      },
    }],
  })[0]!;
  const entry: SessionTimelineEntry = { kind: "activity", itemId: `activity:${group.id}`, runId: "run-1", group, position: position(2) };
  const row = (expanded: boolean) => renderToStaticMarkup(<ActivityGroupRow itemId={entry.itemId} runId={entry.runId}
    group={group} expanded={expanded} onToggle={() => {}} onOpenTrajectory={undefined} />);
  const collapsed = row(false);
  assert.doesNotMatch(collapsed, /Permission requested|Permission granted|Result saved/);
  const expanded = row(true);
  assert.match(expanded, /timeline-activity-details-heading[^>]*>Execution details/);
  assert.match(expanded, /aria-label="Execution details"/);
  assert.match(expanded, /Permission requested/);
  assert.match(expanded, /Permission granted/);
  assert.match(expanded, /Result saved/);
  assert.ok(expanded.indexOf("Permission requested") < expanded.indexOf("Result saved"));
});

test("a waiting permission activity remains visible when execution facts are filtered", () => {
  const group = projectActivityGroups({
    goalId: "goal-1", runId: "run-1", liveEvents: [], current: true, runStatus: "waiting",
    items: [{
      type: "fact", itemId: "fact:waiting-1", eventId: "waiting-1", runId: "run-1", actionId: "action-1",
      position: position(2), eventType: "action_staged", title: "Waiting for permission",
      tool: {
        toolId: "bash", status: "recorded", actionStatus: "awaiting_approval", inputSummary: "git status",
        lifecycle: [{ kind: "approval", title: "Permission requested", detail: "Execution is paused until permission is granted." }],
      },
    }],
  })[0]!;
  const html = render([{ kind: "activity", itemId: `activity:${group.id}`, runId: "run-1", group, position: position(2) }],
    { showExecutionFacts: false, running: true });
  assert.match(html, /timeline-activity waiting/);
  assert.match(html, /Awaiting approval/);
  assert.match(html, /Permission requested/);
  assert.match(html, /Execution is paused until permission is granted\./);
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

test("server contexts recover a historical stage without its declaration and expose incomplete details", () => {
  const accepted = { ...stage("run_stage_accepted", 3), title: "Stage accepted", runId: "old-run" } as SessionTimelineEntry;
  const context = { runId: "old-run", stageId: "stage-1", revision: 1, target: "Verify historical evidence",
    status: "accepted" as const, firstSequence: 1, lastSequence: 3, completeWithinPage: false };
  const html = render([accepted], { stages: [context] });
  assert.match(html, /Verify historical evidence/);
  assert.match(html, /timeline-stage completed/);
  assert.match(html, /Details not fully loaded/);
  assert.doesNotMatch(html, /Stage accepted/);
  const complete = render([accepted], { stages: [{ ...context, completeWithinPage: true }] });
  assert.doesNotMatch(complete, /Details not fully loaded/);
  const otherRun = render([accepted], { stages: [{ ...context, runId: "different-run" }] });
  assert.doesNotMatch(otherRun, /Verify historical evidence/);
  assert.match(otherRun, /Stage accepted/);
});

test("an incomplete Action keeps the loading note visible while collapsed", () => {
  const entry = activity("completed");
  const context = { runId: "run-1", actionId: "action-1", firstSequence: 1, lastSequence: 3, completeWithinPage: false };
  assert.match(render([entry], { actionGroups: [context] }), /Details not fully loaded/);
  assert.doesNotMatch(render([entry], { actionGroups: [{ ...context, runId: "other-run" }] }), /Details not fully loaded/);
  assert.doesNotMatch(render([entry], { actionGroups: [{ ...context, completeWithinPage: true }] }), /Details not fully loaded/);
});

test("execution details filtering retains successful and running tool summaries with their normal defaults", () => {
  const completed = render([activity("completed")], { showExecutionFacts: false });
  assert.match(completed, /Run tests/);
  assert.match(completed, /aria-expanded="false"/);
  assert.doesNotMatch(completed, /timeline-activity-members/);
  const running = render([activity("recorded")], { showExecutionFacts: false, running: true });
  assert.match(running, /Run tests/);
  assert.match(running, /aria-expanded="true"/);
});

test("technical records with detail obey the filter while failures and rejection stay visible", () => {
  const fact = (eventType: string, sequence: number): SessionTimelineEntry => ({ kind: "fact", itemId: `fact:${eventType}`,
    runId: "run-1", eventType, title: eventType, detail: `Detail for ${eventType}`, position: position(sequence) });
  const technical = ["action_staged", "action_approved", "action_revised", "tool_started", "tool_attempt_started", "tool_finished", "observation_recorded", "model_request_retry_recorded"];
  const failures = ["action_rejected", "tool_attempt_failed", "context_lookup_failed"];
  const items = [...technical, ...failures].map(fact);
  const hidden = render(items, { showExecutionFacts: false });
  for (const event of technical) assert.doesNotMatch(hidden, new RegExp(`data-item-id="fact:${event}"`));
  for (const event of failures) {
    assert.match(hidden, new RegExp(`data-item-id="fact:${event}"`));
    assert.match(hidden, new RegExp(`Detail for ${event}`));
  }
  const visible = render(items, { showExecutionFacts: true });
  for (const event of technical) assert.match(visible, new RegExp(`data-item-id="fact:${event}"`));
});

test("successful permission lifecycle stays inside its collapsed tool summary when details are filtered", () => {
  const entry = activity("completed");
  const group = { ...entry.group, members: entry.group.members.map(member => ({ ...member,
    lifecycle: [{ kind: "approval" as const, title: "Permission granted" }, { kind: "result" as const, title: "Result saved" }] })) };
  const html = render([{ ...entry, group }], { showExecutionFacts: false });
  assert.match(html, /Run tests/);
  assert.doesNotMatch(html, /Permission granted|Result saved/);
});
