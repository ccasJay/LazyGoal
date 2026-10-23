import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocateImmutableEvent,
  createGoal,
  type Goal,
  type TrajectoryEvent,
  type TrajectoryEventDraft,
} from "../../../packages/runtime/src/index";
import { testAssistantMessage, testUserMessage } from "../../../packages/runtime/test/current-fixtures";
import { readBrowserGoalActivity, readBrowserGoalSessionState } from "../../../packages/browser/src/index";
import type { BrowserActivityPage, BrowserGoalSessionState } from "../../../packages/web-contracts/src/index";
import { projectSessionTimeline } from "../src/session-timeline";
import { collectActivityProjections } from "../src/collect-activity-projections";

test("history lookups fold by lookupId while not found and failure remain distinct", async () => {
  const initial = createGoal({
    id: "lookup-timeline-goal", intent: "Find prior evidence", promptBundleVersion: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    profile: { id: "profile", systemPrompt: "private", instructions: [], toolIds: [] },
    runId: "run-1",
  });
  const goal: Goal = { ...initial, state: { ...initial.state, run: { ...initial.state.run, committedThroughSequence: 4 } } };
  const event = (sequence: number, payload: TrajectoryEventDraft["payload"]) => allocateImmutableEvent({
    goalId: goal.id, runId: "run-1", phase: "executing", eventType: payload.type, payload,
  } as TrajectoryEventDraft, sequence);
  const committed: readonly TrajectoryEvent[] = [
    event(1, { type: "context_lookup_requested", lookupId: "missing", request: { kind: "context_lookup", need: "historical_execution", question: "PRIVATE_QUERY" } }),
    event(2, { type: "context_lookup_requested", lookupId: "broken", request: { kind: "context_lookup", operation: "directory_search", query: "PRIVATE_DIRECTORY" } }),
    event(3, { type: "context_lookup_not_found", lookupId: "missing", result: { status: "not_found", lookupId: "missing" } }),
    event(4, { type: "context_lookup_failed", lookupId: "broken", code: "CONTEXT_LOOKUP_FAILED", message: "PRIVATE_ERROR" }),
  ];
  const store = { restore: async () => goal };
  const [activity, state] = await Promise.all([
    readBrowserGoalActivity(goal.id, {}, store, async () => ({ committed, uncommittedTail: [] })),
    readBrowserGoalSessionState(goal.id, store),
  ]);
  assert.equal(activity.ok, true);
  assert.ok(state);
  if (!activity.ok || state === undefined) return;
  assert.equal(JSON.stringify(activity.page).includes("PRIVATE_"), false);
  const projection = projectSessionTimeline(activity.page, state, collectActivityProjections(activity.page, goal.id, []));
  const lookups = projection.items.filter((item) => item.kind === "lookup");
  assert.deepEqual(lookups.map((item) => [item.itemId, item.status, item.position.sequence]), [
    ["lookup:run-1:missing", "not_found", 1], ["lookup:run-1:broken", "failed", 2],
  ]);
  assert.equal(lookups[0]?.kind === "lookup" ? lookups[0].request : undefined, "History search, Historical execution");
  assert.equal(lookups[1]?.kind === "lookup" ? lookups[1].errorCode : undefined, "CONTEXT_LOOKUP_FAILED");
  assert.equal(projection.items.some((item) => item.kind === "fact" && item.eventType.startsWith("context_lookup_")), false);
  const reordered = projectSessionTimeline({ ...activity.page, items: [...activity.page.items].reverse() }, state, new Map());
  assert.deepEqual(reordered.items.filter((item) => item.kind === "lookup").map((item) => [item.itemId, item.status, item.position.sequence]),
    lookups.map((item) => [item.itemId, item.status, item.position.sequence]));
  const resultOnly = projectSessionTimeline({ ...activity.page, items: activity.page.items.filter((item) =>
    item.type === "fact" && item.eventType === "context_lookup_not_found") }, state, new Map());
  const partial = resultOnly.items.find((item) => item.kind === "lookup");
  assert.equal(partial?.itemId, "lookup:run-1:missing");
  assert.equal(partial?.kind === "lookup" ? partial.status : undefined, "not_found");
  assert.equal(partial?.kind === "lookup" ? partial.request : undefined, undefined);
});

test("saved multi-Run activity keeps stable source order across duplicate sync and refresh", async () => {
  const initial = createGoal({
    id: "timeline-goal",
    intent: "Review the issue",
    promptBundleVersion: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    profile: { id: "profile", systemPrompt: "private", instructions: [], toolIds: [] },
    runId: "run-plan",
    mode: "plan",
  });
  const route = {
    revision: 1,
    nextStageIndex: 1,
    nextStageOrdinal: 2,
    stages: [{
      stageId: "stage-1",
      revision: 1,
      status: "accepted" as const,
      target: "Summarize verified findings",
      acceptanceCriteria: ["Use committed evidence"],
      acceptedSequence: 2,
    }],
  };
  const messages = [
    testUserMessage("Review the issue", { runId: "run-normal", messageId: "user-start", position: { afterSequence: 0, order: 0 } }),
    testAssistantMessage("same text", { runId: "run-normal", messageId: "process-first", purpose: "process", position: { afterSequence: 1, order: 0 } }),
    testUserMessage("Keep the review focused", { runId: "run-normal", messageId: "steer-applied", position: { afterSequence: 4, order: 0 } }),
    testAssistantMessage("Updated analysis", { runId: "run-normal", messageId: "process-second", purpose: "process", position: { afterSequence: 5, order: 0 } }),
    testAssistantMessage("same text", { runId: "run-normal", messageId: "final-answer", purpose: "answer", position: { afterSequence: 8, order: 0 } }),
    testAssistantMessage("Stage accepted; continuing", { runId: "run-plan", messageId: "stage-process", purpose: "process", position: { afterSequence: 2, order: 0 } }),
  ];
  const goal: Goal = {
    ...initial,
    state: {
      ...initial.state,
      messages,
      completedRuns: [{ runId: "run-normal", status: "completed", stepCount: 1, committedThroughSequence: 8, messageRange: { start: 0, end: 5 } }],
      run: { ...initial.state.run, mode: "plan", status: "running", committedThroughSequence: 3, planRoute: route },
    },
  };
  const event = (runId: string, sequence: number, payload: TrajectoryEventDraft["payload"]): TrajectoryEvent =>
    allocateImmutableEvent({
      goalId: goal.id,
      runId,
      phase: "executing",
      eventType: payload.type,
      payload,
    } as TrajectoryEventDraft, sequence, `event-${runId}-${sequence}`);
  const events = new Map<string, readonly TrajectoryEvent[]>([
    ["run-normal", [
      event("run-normal", 1, { type: "run_started" }),
      event("run-normal", 2, { type: "tool_started", actionId: "action-1", toolId: "read_file", input: { path: "src/app.ts" } }),
      event("run-normal", 4, { type: "steer_input_applied", messageId: "steer-applied", messageIndex: 2 }),
      event("run-normal", 8, { type: "run_completed", summary: "Review completed" }),
    ]],
    ["run-plan", [
      event("run-plan", 1, { type: "run_stage_declared", stageId: "stage-1", revision: 1, target: "Summarize verified findings", acceptanceCriteria: ["Use committed evidence"] }),
      event("run-plan", 2, { type: "run_stage_accepted", stageId: "stage-1", revision: 1 }),
    ]],
  ]);
  const store = { restore: async (goalId: string) => goalId === goal.id ? goal : undefined };
  const readTrajectory = async ({ runId }: { readonly runId: string }) => ({
    committed: events.get(runId) ?? [],
    uncommittedTail: [],
  });
  const [activity, state] = await Promise.all([
    readBrowserGoalActivity(goal.id, {}, store, readTrajectory),
    readBrowserGoalSessionState(goal.id, store),
  ]);
  assert.equal(activity.ok, true);
  assert.ok(state);
  if (!activity.ok || state === undefined) return;

  const resultPage = await readBrowserGoalActivity(goal.id, { limit: 2 }, store, readTrajectory);
  assert.ok(resultPage.ok);
  if (!resultPage.ok) return;
  assert.equal(resultPage.page.items.some(item => item.type === "fact" && item.eventType === "run_stage_declared"), false);
  assert.deepEqual(resultPage.page.stages, [{ runId: "run-plan", stageId: "stage-1", revision: 1,
    target: "Summarize verified findings", status: "accepted", firstSequence: 1, lastSequence: 2, completeWithinPage: false }]);
  const partialProjection = projectSessionTimeline(resultPage.page, { ...state, currentPlanRoute: undefined }, new Map());
  assert.deepEqual(partialProjection.stages, resultPage.page.stages);
  assert.deepEqual(partialProjection.actionGroups, resultPage.page.actionGroups);

  const activityGroups = collectActivityProjections(activity.page, goal.id, []);
  const projection = projectSessionTimeline(activity.page, state, activityGroups, "temporary answer");
  const saved = projection.items.filter((item) => item.kind !== "live-preview");
  assert.deepEqual(saved.map((item) => item.itemId), [
    "run:run-normal",
    "message:user-start",
    "event:event-run-normal-1",
    "message:process-first",
    "activity:action:run-normal:action-1",
    "event:event-run-normal-4",
    "message:steer-applied",
    "message:process-second",
    "event:event-run-normal-8",
    "message:final-answer",
    "terminal:run-normal:completed",
    "run:run-plan",
    "event:event-run-plan-1",
    "event:event-run-plan-2",
    "message:stage-process",
  ]);
  const sameTextMessages = saved.filter((item) => item.kind === "message" && item.content === "same text");
  assert.deepEqual(sameTextMessages.map((item) => [item.itemId, item.purpose]), [
    ["message:process-first", "process"],
    ["message:final-answer", "answer"],
  ]);
  assert.equal(saved.some((item) => item.kind === "fact" && item.runId === "run-normal" && item.eventType.startsWith("run_stage_")), false);
  assert.equal(saved.some((item) => item.kind === "terminal" && item.runId === "run-plan"), false);
  const stage = saved.find((item) => item.kind === "fact" && item.eventType === "run_stage_declared");
  assert.equal(stage?.kind === "fact" ? stage.stageTarget : undefined, "Summarize verified findings");
  assert.deepEqual(projection.currentPlanRoute?.stages[0]?.target, "Summarize verified findings");
  assert.equal(projection.items.at(-1)?.kind, "live-preview");

  const duplicateAndReorderedPage: BrowserActivityPage = {
    ...activity.page,
    items: [...activity.page.items].reverse().concat(activity.page.items[0]!),
  };
  const refreshed = projectSessionTimeline(duplicateAndReorderedPage, state, activityGroups, "temporary answer");
  assert.deepEqual(refreshed.items.map((item) => item.itemId), projection.items.map((item) => item.itemId));
});

test("显式 Think 在时间线中保留获准摘要与详情定位入口", async () => {
  const initial = createGoal({
    id: "timeline-think-goal",
    intent: "Review the issue",
    promptBundleVersion: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    profile: { id: "profile", systemPrompt: "private", instructions: [], toolIds: [] },
    runId: "run-1",
  });
  const goal: Goal = {
    ...initial,
    state: { ...initial.state, run: { ...initial.state.run, committedThroughSequence: 3 } },
  };
  const thinkMetadata = { goalId: goal.id, runId: "run-1", phase: "executing" as const, executionUnitId: "unit-think", stepIndex: 1 };
  const thinkPayload = { requestId: "think-1", stepOrdinal: 1, goal: "Compare the committed evidence" };
  const committed: readonly TrajectoryEvent[] = [
    allocateImmutableEvent({ ...thinkMetadata, eventType: "think_requested", payload: { type: "think_requested", ...thinkPayload } }, 1),
    allocateImmutableEvent({ ...thinkMetadata, eventType: "think_completed", payload: { type: "think_completed", ...thinkPayload, output: "The committed analysis" } }, 2),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", eventType: "run_completed", payload: { type: "run_completed", summary: "Done" } }, 3),
  ];
  const store = { restore: async (goalId: string) => (goalId === goal.id ? goal : undefined) };
  const readTrajectory = async () => ({ committed, uncommittedTail: [] });

  const [activity, state] = await Promise.all([
    readBrowserGoalActivity(goal.id, {}, store, readTrajectory),
    readBrowserGoalSessionState(goal.id, store),
  ]);
  assert.equal(activity.ok, true);
  assert.ok(state);
  if (!activity.ok || state === undefined) return;

  const thinkItem = activity.page.items.find((item) => item.type === "think");
  assert.equal(thinkItem?.type, "think");
  if (thinkItem?.type !== "think") return;
  assert.equal(thinkItem.executionUnitId, "unit-think");
  assert.equal(thinkItem.think.goal, "Compare the committed evidence");
  assert.equal(thinkItem.think.output, "The committed analysis");

  const activityGroups = collectActivityProjections(activity.page, goal.id, []);
  const projection = projectSessionTimeline(activity.page, state, activityGroups);
  const thinkEntry = projection.items.find((item) => item.kind === "activity" && item.group.category === "think");
  assert.ok(thinkEntry);
  if (thinkEntry?.kind !== "activity") return;
  assert.equal(thinkEntry.group.members[0]?.executionUnitId, "unit-think");
  assert.equal(thinkEntry.group.members[0]?.think?.output, "The committed analysis");
  assert.equal(JSON.stringify(projection).includes("PRIVATE_"), false);
});


test("one tool action folds permission, retry and result facts into a single timeline activity", async () => {
  const initial = createGoal({
    id: "timeline-action-goal",
    intent: "Inspect the workspace",
    promptBundleVersion: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    profile: { id: "profile", systemPrompt: "private", instructions: [], toolIds: [] },
    runId: "run-1",
  });
  const goal: Goal = {
    ...initial,
    state: { ...initial.state, run: { ...initial.state.run, committedThroughSequence: 8 } },
  };
  const action = { actionId: "action-1", toolId: "bash", input: { command: "git status" } };
  const committed: readonly TrajectoryEvent[] = [
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-1", actionId: action.actionId,
      eventType: "decision_received", payload: { type: "decision_received", decision: { kind: "tool_call", action } } }, 1),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-1", actionId: action.actionId,
      eventType: "action_staged", payload: { type: "action_staged", action, approvalStatus: "awaiting_approval" } }, 2),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", actionId: action.actionId,
      eventType: "action_approved", payload: { type: "action_approved", actionId: action.actionId, approvalScope: "action" } }, 3),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-2", actionId: action.actionId,
      eventType: "tool_started", payload: { type: "tool_started", actionId: action.actionId, toolId: "bash", input: action.input } }, 4),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-2", actionId: action.actionId,
      eventType: "tool_attempt_started", payload: { type: "tool_attempt_started", actionId: action.actionId, attempt: 1 } }, 5),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-2", actionId: action.actionId,
      eventType: "tool_attempt_failed", payload: { type: "tool_attempt_failed", actionId: action.actionId, attempt: 1, reason: "temporary failure" } }, 6),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-2", actionId: action.actionId,
      eventType: "tool_attempt_started", payload: { type: "tool_attempt_started", actionId: action.actionId, attempt: 2 } }, 7),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-2", actionId: action.actionId,
      eventType: "observation_recorded", payload: { type: "observation_recorded", actionId: action.actionId,
        observation: { kind: "success", output: { exitCode: 0, stdout: "clean", stderr: "" }, summary: "Workspace clean" } } }, 8),
  ];
  const store = { restore: async (goalId: string) => (goalId === goal.id ? goal : undefined) };
  const readTrajectory = async () => ({ committed, uncommittedTail: [] });
  const [activity, state] = await Promise.all([
    readBrowserGoalActivity(goal.id, {}, store, readTrajectory),
    readBrowserGoalSessionState(goal.id, store),
  ]);
  assert.equal(activity.ok, true);
  assert.ok(state);
  if (!activity.ok || state === undefined) return;

  const activityGroups = collectActivityProjections(activity.page, goal.id, []);
  const projection = projectSessionTimeline(activity.page, state, activityGroups);
  const activities = projection.items.filter((item) => item.kind === "activity");
  assert.equal(activities.length, 1);
  if (activities[0]?.kind !== "activity") return;
  assert.equal(activities[0].group.status, "completed");
  assert.equal(activities[0].group.members.length, 1);
  assert.equal(activities[0].group.members[0]?.actionId, "action-1");
  assert.equal(activities[0].position?.sequence, 1);
  assert.deepEqual(activities[0].group.members[0]?.lifecycle?.map((entry) => entry.title), [
    "Permission requested",
    "Permission granted",
    "Tool started",
    "Tool attempt 1 started",
    "Tool attempt 1 failed",
    "Tool attempt 2 started",
    "Result saved",
  ]);
  assert.equal(projection.items.some((item) => item.kind === "fact"), false);
});

test("a waiting permission action stays a visible activity with an explicit approval state", async () => {
  const initial = createGoal({
    id: "timeline-waiting-goal",
    intent: "Inspect the workspace",
    promptBundleVersion: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    profile: { id: "profile", systemPrompt: "private", instructions: [], toolIds: [] },
    runId: "run-1",
  });
  const goal: Goal = {
    ...initial,
    state: { ...initial.state, run: { ...initial.state.run, status: "waiting", committedThroughSequence: 2 } },
  };
  const action = { actionId: "action-1", toolId: "bash", input: { command: "git status" } };
  const committed: readonly TrajectoryEvent[] = [
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-1", actionId: action.actionId,
      eventType: "decision_received", payload: { type: "decision_received", decision: { kind: "tool_call", action } } }, 1),
    allocateImmutableEvent({ goalId: goal.id, runId: "run-1", phase: "executing", executionUnitId: "unit-1", actionId: action.actionId,
      eventType: "action_staged", payload: { type: "action_staged", action, approvalStatus: "awaiting_approval" } }, 2),
  ];
  const store = { restore: async (goalId: string) => (goalId === goal.id ? goal : undefined) };
  const readTrajectory = async () => ({ committed, uncommittedTail: [] });
  const [activity, state] = await Promise.all([
    readBrowserGoalActivity(goal.id, {}, store, readTrajectory),
    readBrowserGoalSessionState(goal.id, store),
  ]);
  assert.equal(activity.ok, true);
  assert.ok(state);
  if (!activity.ok || state === undefined) return;

  const activityGroups = collectActivityProjections(activity.page, goal.id, []);
  const projection = projectSessionTimeline(activity.page, state, activityGroups);
  const activities = projection.items.filter((item) => item.kind === "activity");
  assert.equal(activities.length, 1);
  if (activities[0]?.kind !== "activity") return;
  assert.equal(activities[0].group.status, "waiting");
  assert.equal(activities[0].group.members[0]?.status, "waiting");
  assert.deepEqual(activities[0].group.members[0]?.lifecycle?.map((entry) => entry.title), ["Permission requested"]);
  assert.equal(projection.items.some((item) => item.kind === "fact"), false);

  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SessionTimeline } = await import("../src/components/SessionTimeline");
  const html = renderToStaticMarkup(createElement(SessionTimeline, {
    projection, currentRunId: state.currentRunId, runStatus: state.runStatus,
    olderAvailable: false, showExecutionFacts: false, liveActivity: null, streamConnected: false,
    brandMark: "/mark.svg",
  }));
  assert.match(html, /Awaiting approval/);
  assert.match(html, /Permission requested/);
  assert.match(html, /Execution is paused until permission is granted\./);
});

test("current failure details reach Activity without leaking into another Run", async () => {
  const initial = createGoal({
    id: "failed-activity", intent: "hi", runId: "failed-run", promptBundleVersion: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    profile: { id: "profile", systemPrompt: "private", instructions: [], toolIds: [] },
  });
  const goal: Goal = { ...initial, state: { ...initial.state, run: {
    ...initial.state.run, status: "failed",
    stopReason: { kind: "execution_error", code: "MODEL_REQUEST_FAILED", message: "Provider rejected this request" },
  } } };
  const store = { restore: async () => goal };
  const state = await readBrowserGoalSessionState(goal.id, store);
  const activity = await readBrowserGoalActivity(goal.id, {}, store, async () => ({ committed: [], uncommittedTail: [] }));
  assert.ok(state);
  assert.equal(activity.ok, true);
  if (!activity.ok) return;
  const projection = projectSessionTimeline(activity.page, state, new Map());
  const terminal = projection.items.find(item => item.kind === "terminal");
  assert.ok(terminal?.kind === "terminal");
  assert.deepEqual(terminal.detail, { code: "MODEL_REQUEST_FAILED", message: "Provider rejected this request" });
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SessionTimeline } = await import("../src/components/SessionTimeline");
  const html = renderToStaticMarkup(createElement(SessionTimeline, {
    projection, currentRunId: state.currentRunId, runStatus: state.runStatus,
    olderAvailable: false, showExecutionFacts: false, liveActivity: null, streamConnected: false,
    brandMark: "/mark.svg",
  }));
  assert.match(html, /Run failed/);
  assert.match(html, /MODEL_REQUEST_FAILED/);
  assert.match(html, /Provider rejected this request/);
  const stale = projectSessionTimeline(activity.page, { ...state, currentRunId: "another-run" }, new Map());
  assert.equal(stale.items.find(item => item.kind === "terminal")?.detail, undefined);
});
