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

  const projection = projectSessionTimeline(activity.page, state, "temporary answer");
  const saved = projection.items.filter((item) => item.kind !== "live-preview");
  assert.deepEqual(saved.map((item) => item.itemId), [
    "run:run-normal",
    "message:user-start",
    "event:event-run-normal-1",
    "message:process-first",
    "event:event-run-normal-2",
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
  const refreshed = projectSessionTimeline(duplicateAndReorderedPage, state, "temporary answer");
  assert.deepEqual(refreshed.items.map((item) => item.itemId), projection.items.map((item) => item.itemId));
});
