import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BrowserActivityFactItem,
  BrowserActivityItem,
  BrowserActivityMessageItem,
  BrowserActivityPosition,
  BrowserActivityThinkItem,
  BrowserActivityToolState,
  BrowserGoalActivityEvent,
  BrowserGoalLiveEvent,
  BrowserRunStatus,
} from "../../../packages/web-contracts/src/index";
import { projectActivityGroups } from "../src/activity-projector";

function position(sequence: number, runId = "run-1"): BrowserActivityPosition {
  return { runId, runOrder: 0, sequence, itemKind: "fact", order: 0 };
}

function toolFact(options: {
  readonly actionId?: string;
  readonly sequence: number;
  readonly toolId: string;
  readonly status?: BrowserActivityToolState["status"];
  readonly actionStatus?: BrowserActivityToolState["actionStatus"];
  readonly stageId?: string;
  readonly inputSummary?: string;
  readonly summary?: string;
  readonly attempts?: readonly string[];
  readonly activityBoundaryBefore?: true;
  readonly executionUnitId?: string;
  readonly parentActionId?: string;
  readonly revisionRef?: string;
  readonly recoveryRef?: string;
  readonly runId?: string;
  readonly eventId?: string;
}): BrowserActivityFactItem {
  const runId = options.runId ?? "run-1";
  const eventId = options.eventId ?? `event-${options.sequence}`;
  return {
    type: "fact",
    itemId: `fact:${eventId}`,
    eventId,
    runId,
    position: position(options.sequence, runId),
    eventType: "tool_started",
    title: "Tool started",
    ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
    ...(options.stageId === undefined ? {} : { stageId: options.stageId }),
    ...(options.executionUnitId === undefined ? {} : { executionUnitId: options.executionUnitId }),
    tool: {
      toolId: options.toolId,
      status: options.status ?? "completed",
      ...(options.actionStatus === undefined ? {} : { actionStatus: options.actionStatus }),
      ...(options.inputSummary === undefined ? {} : { inputSummary: options.inputSummary }),
      ...(options.summary === undefined ? {} : { summary: options.summary }),
      ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
      ...(options.parentActionId === undefined ? {} : { parentActionId: options.parentActionId }),
      ...(options.revisionRef === undefined ? {} : { revisionRef: options.revisionRef }),
      ...(options.recoveryRef === undefined ? {} : { recoveryRef: options.recoveryRef }),
      ...(options.activityBoundaryBefore === undefined ? {} : { activityBoundaryBefore: options.activityBoundaryBefore }),
    },
  };
}

function message(options: {
  readonly sequence: number;
  readonly messageId: string;
  readonly content?: string;
  readonly runId?: string;
}): BrowserActivityMessageItem {
  const runId = options.runId ?? "run-1";
  return {
    type: "message",
    itemId: `message:${options.messageId}`,
    messageId: options.messageId,
    role: "assistant",
    purpose: "process",
    runId,
    position: { ...position(options.sequence, runId), itemKind: "message" },
    content: options.content ?? "Progress update",
    contentLength: (options.content ?? "Progress update").length,
    truncated: false,
  };
}

function think(options: {
  readonly sequence: number;
  readonly goal: string;
  readonly output?: string;
  readonly runId?: string;
  readonly executionUnitId?: string;
}): BrowserActivityThinkItem {
  const runId = options.runId ?? "run-1";
  return {
    type: "think",
    itemId: `think:event-${options.sequence}`,
    runId,
    position: position(options.sequence, runId),
    ...(options.executionUnitId === undefined ? {} : { executionUnitId: options.executionUnitId }),
    think: {
      goal: options.goal,
      ...(options.output === undefined ? {} : { output: options.output }),
    },
  };
}

function event(
  runId: string,
  activity: BrowserGoalActivityEvent,
  goalId = "goal-1",
): BrowserGoalLiveEvent {
  return { type: "activity", goalId, runId, activity };
}

function project(
  items: readonly BrowserActivityItem[],
  liveEvents: readonly BrowserGoalLiveEvent[] = [],
  options: { readonly current?: boolean; readonly runStatus?: BrowserRunStatus } = {},
) {
  return projectActivityGroups({
    goalId: "goal-1",
    runId: "run-1",
    items,
    liveEvents,
    current: options.current ?? true,
    runStatus: options.runStatus ?? "running",
  });
}

test("Think rounds remain separate from tools and retain committed analysis after reload", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file" }),
    think({ sequence: 4, goal: "Compare evidence", output: "Use the observed result." }),
    think({ sequence: 7, goal: "Check uncertainty", output: "A fresh observation is needed." }),
    toolFact({ actionId: "a2", sequence: 10, toolId: "read_file" }),
  ]);

  assert.deepEqual(groups.map((group) => group.category), ["explore", "think", "think", "explore"]);
  assert.equal(groups[1]?.summary, "Thinking · Compare evidence");
  assert.equal(groups[1]?.members[0]?.think?.output, "Use the observed result.");
  assert.equal(groups[1]?.members[0]?.actionId, undefined);
});

test("Think 成员保留 Trajectory 详情定位引用，不暴露未获准内容", () => {
  const groups = project([
    think({ sequence: 4, goal: "Compare evidence", output: "Use the observed result.", executionUnitId: "unit-think" }),
  ]);

  const member = groups[0]?.members[0];
  assert.equal(member?.category, "think");
  assert.equal(member?.executionUnitId, "unit-think");
  assert.deepEqual(member?.think, { goal: "Compare evidence", output: "Use the observed result." });
  assert.equal(JSON.stringify(groups).includes("PRIVATE_"), false);
});

test("committed actions merge only when tool, stage and verified adjacency match", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file", inputSummary: "a.ts" }),
    toolFact({ actionId: "a2", sequence: 4, toolId: "grep", inputSummary: "needle" }),
    toolFact({ actionId: "a3", sequence: 7, toolId: "bash", stageId: "stage-1", inputSummary: "npm test" }),
    toolFact({ actionId: "a4", sequence: 10, toolId: "read_file", stageId: "stage-1", activityBoundaryBefore: true }),
    toolFact({ actionId: "a5", sequence: 13, toolId: "read_file", stageId: "stage-2" }),
    toolFact({ actionId: "a6", sequence: 16, toolId: "custom_tool" }),
    toolFact({ actionId: "a7", sequence: 19, toolId: "custom_tool" }),
  ]);

  assert.deepEqual(groups.map((group) => [group.category, group.members.map((member) => member.actionId)]), [
    ["explore", ["a1"]], ["explore", ["a2"]], ["execute", ["a3"]], ["explore", ["a4"]],
    ["explore", ["a5"]], ["single", ["a6"]], ["single", ["a7"]],
  ]);
  assert.equal(groups[0]?.summary, "Read a.ts");
  assert.equal(groups[1]?.summary, "Searched for needle");
  assert.equal(groups[2]?.members[0]?.label, "Ran npm test");
});

test("repeated reads count actual calls rather than claiming distinct files", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file", inputSummary: "same.ts" }),
    toolFact({ actionId: "a2", sequence: 2, toolId: "read_file", inputSummary: "same.ts" }),
    toolFact({ actionId: "a3", sequence: 3, toolId: "edit_file", inputSummary: "same.ts" }),
    toolFact({ actionId: "a4", sequence: 4, toolId: "read_file", inputSummary: "same.ts" }),
  ]);
  assert.deepEqual(groups.map((group) => group.summary), ["Read files", "Edited same.ts", "Read same.ts"]);
  assert.deepEqual(groups[0]?.members.map((member) => member.actionId), ["a1", "a2"]);
});

test("approval waits are visible even alongside a running call", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "bash", status: "recorded", actionStatus: "approved" }),
    toolFact({ actionId: "a2", sequence: 2, toolId: "bash", status: "recorded", actionStatus: "awaiting_approval" }),
  ]);
  assert.equal(groups[0]?.status, "waiting");
  assert.deepEqual(groups[0]?.members.map((member) => member.status), ["running", "waiting"]);
});

test("a running call stays visible alongside a failed member", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "bash", status: "recorded" }),
    toolFact({ actionId: "a2", sequence: 2, toolId: "bash", status: "failed", summary: "Tests failed" }),
  ]);
  assert.equal(groups[0]?.status, "running");
  assert.equal(groups[0]?.counts.failed, 1);
  assert.equal(groups[0]?.members[1]?.summary, "Tests failed");
});

test("committed same-category actions still break at a verified Activity boundary", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file" }),
    toolFact({ actionId: "a2", sequence: 2, toolId: "read_file", activityBoundaryBefore: true }),
  ]);

  assert.deepEqual(groups.map((group) => group.members.map((member) => member.actionId)), [["a1"], ["a2"]]);
});

test("an assistant message between two adjacent actions breaks the group", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file" }),
    message({ sequence: 2, messageId: "m1" }),
    toolFact({ actionId: "a2", sequence: 3, toolId: "read_file" }),
  ]);

  assert.deepEqual(groups.map((group) => group.members.map((member) => member.actionId)), [["a1"], ["a2"]]);
});

test("committed tool state keeps attempts, PTC parent, revision and recovery references", () => {
  const groups = project([
    toolFact({
      actionId: "child:0",
      sequence: 1,
      toolId: "write_file",
      status: "completed",
      inputSummary: "a.txt",
      summary: "Written",
      attempts: ["Tool retry 1 failed: temporary failure"],
      parentActionId: "parent-action",
      revisionRef: "review-1",
      recoveryRef: "recovery-1",
      executionUnitId: "unit-1",
    }),
  ]);

  const member = groups[0]?.members[0];
  assert.equal(member?.actionId, "child:0");
  assert.equal(member?.parentActionId, "parent-action");
  assert.equal(member?.revisionRef, "review-1");
  assert.equal(member?.recoveryRef, "recovery-1");
  assert.equal(member?.executionUnitId, "unit-1");
  assert.deepEqual(member?.attempts, ["Tool retry 1 failed: temporary failure"]);
  assert.equal(member?.status, "completed");
});

test("a tool that returned without a saved result stays pending instead of saved success", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file", status: "pending-result", summary: "Read file" }),
  ]);

  assert.equal(groups[0]?.status, "pending-result");
  assert.equal(groups[0]?.members[0]?.status, "pending-result");
});

test("live retries update one action; a returned result is not presented as saved success", () => {
  const events: BrowserGoalLiveEvent[] = [
    event("run-1", { kind: "tool_started", sourceEventId: "event-1", sourceCursor: 1, actionId: "live-a", executionUnitId: "unit-a", toolId: "read_file", inputSummary: "src/a.ts" }),
    event("run-1", { kind: "tool_attempt_started", sourceEventId: "event-2", sourceCursor: 2, actionId: "live-a", attempt: 1 }),
    event("run-1", { kind: "tool_attempt_failed", sourceEventId: "event-3", sourceCursor: 3, actionId: "live-a", attempt: 1, reason: "temporary failure" }),
    event("run-1", { kind: "tool_attempt_started", sourceEventId: "event-4", sourceCursor: 4, actionId: "live-a", attempt: 2 }),
    event("run-1", { kind: "tool_finished", sourceEventId: "event-5", sourceCursor: 5, actionId: "live-a", toolId: "read_file", outcome: "success", summary: "Read file" }),
  ];
  const groups = project([], events);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.status, "pending-result");
  assert.equal(groups[0]?.members.length, 1);
  assert.deepEqual(groups[0]?.members[0]?.attempts, ["Attempt 1 failed: temporary failure"]);
  assert.equal(groups[0]?.members[0]?.summary, "Read file");
  assert.equal(groups[0]?.members[0]?.isCommitted, false);
  assert.equal(groups[0]?.live, true);
});

test("live updates reconcile with committed action identity and materialization does not duplicate it", () => {
  const saved = toolFact({ actionId: "shared", sequence: 8, toolId: "bash", status: "recorded", inputSummary: "npm test" });
  const events: BrowserGoalLiveEvent[] = [
    event("run-1", { kind: "tool_started", sourceEventId: "event-1", sourceCursor: 1, actionId: "shared", executionUnitId: "unit-shared", toolId: "bash", inputSummary: "npm test" }),
    event("run-1", { kind: "tool_finished", sourceEventId: "event-2", sourceCursor: 2, actionId: "shared", toolId: "bash", outcome: "success", summary: "Tests passed" }),
  ];
  const overlay = project([saved], events);
  assert.equal(overlay.length, 1);
  assert.equal(overlay[0]?.members.length, 1);
  assert.equal(overlay[0]?.members[0]?.id, "action:run-1:shared");
  assert.equal(overlay[0]?.status, "pending-result");
  assert.equal(overlay[0]?.members[0]?.isCommitted, true);
  assert.equal(overlay[0]?.members[0]?.hasLiveUpdate, true);

  const materialized = project(
    [toolFact({ actionId: "shared", sequence: 8, toolId: "bash", status: "completed", summary: "Tests passed", inputSummary: "npm test" })],
    events,
  );
  assert.equal(materialized.length, 1);
  assert.equal(materialized[0]?.members.length, 1);
  assert.equal(materialized[0]?.members[0]?.id, "action:run-1:shared");
  assert.equal(materialized[0]?.status, "completed");
});

test("missing source identity keeps an otherwise similar durable action as a separate singleton", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file" }),
    toolFact({ sequence: 2, toolId: "read_file" }),
    toolFact({ actionId: "a3", sequence: 3, toolId: "read_file" }),
  ]);
  assert.deepEqual(groups.map((group) => group.members.map((member) => member.actionId)), [["a1"], [undefined], ["a3"]]);
});

test("consecutive calls stay grouped after failure and report partial failure", () => {
  const groups = project([
    toolFact({ actionId: "a1", sequence: 1, toolId: "read_file", status: "completed" }),
    toolFact({ actionId: "a2", sequence: 2, toolId: "read_file", status: "failed" }),
    toolFact({ actionId: "a3", sequence: 3, toolId: "read_file", status: "completed" }),
  ]);
  assert.deepEqual(groups.map((group) => [group.status, group.members.length]), [["partial-failure", 3]]);
});

test("assistant, waiting, stage, terminal and failure events all separate live groups", () => {
  const reasons = ["assistant_reply", "user_wait", "stage_change", "terminal", "failure", "unknown"] as const;
  for (const [index, reason] of reasons.entries()) {
    const cursor = index * 3;
    const groups = project([], [
      event("run-1", { kind: "tool_started", sourceEventId: `start-${index}-1`, sourceCursor: cursor + 1, actionId: `a-${index}-1`, executionUnitId: `u-${index}-1`, toolId: "read_file" }),
      event("run-1", { kind: "activity_boundary", sourceEventId: `boundary-${index}`, sourceCursor: cursor + 2, reason }),
      event("run-1", { kind: "tool_started", sourceEventId: `start-${index}-2`, sourceCursor: cursor + 3, actionId: `a-${index}-2`, executionUnitId: `u-${index}-2`, toolId: "read_file" }),
    ]);
    assert.equal(groups.length, 2, reason);
  }
});

test("identity spaces remain separate, boundaries break groups, and foreign runs are ignored", () => {
  const groups = project(
    [toolFact({ actionId: "saved", sequence: 1, toolId: "read_file" })],
    [
      event("run-1", { kind: "activity_boundary", sourceEventId: "event-1", sourceCursor: 1, reason: "assistant_reply" }),
      event("run-1", { kind: "tool_started", sourceEventId: "event-2", sourceCursor: 2, actionId: "live", executionUnitId: "live-unit", toolId: "read_file" }),
      event("run-1", { kind: "tool_started", sourceEventId: "event-2", sourceCursor: 2, actionId: "live", executionUnitId: "live-unit", toolId: "read_file" }),
      event("another-run", { kind: "tool_started", sourceEventId: "event-3", sourceCursor: 3, actionId: "foreign", executionUnitId: "foreign-unit", toolId: "read_file" }),
      event("run-1", { kind: "assistant_text_delta", sourceEventId: "event-4", sourceCursor: 4, text: "public answer", truncated: false }),
    ],
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.members[0]?.id, "action:run-1:saved");
  assert.equal(groups[1]?.members[0]?.id, "action:run-1:live");
  assert.equal(groups[1]?.members[0]?.isCommitted, false);
  assert.equal(JSON.stringify(groups).includes("public answer"), false);
});

test("live-only activity is excluded once the Run reaches a saved wait or terminal state", () => {
  const liveEvents = [
    event("run-1", { kind: "tool_started", sourceEventId: "event-1", sourceCursor: 1, actionId: "live", executionUnitId: "unit", toolId: "read_file" }),
  ];
  assert.equal(project([], liveEvents).length, 1);
  assert.equal(project([], liveEvents, { runStatus: "waiting" }).length, 0);
  assert.equal(project([], liveEvents, { runStatus: "completed" }).length, 0);
  assert.equal(project([], liveEvents, { current: false }).length, 0);
});
