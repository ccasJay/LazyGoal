import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserGoalActivityEvent, BrowserGoalLiveEvent, BrowserSessionRun, BrowserSessionStep } from "../../../packages/web-contracts/src/index";
import { projectActivityGroups } from "../src/activity-projector";

function step(overrides: Partial<BrowserSessionStep> & Pick<BrowserSessionStep, "executionUnitId" | "sequence" | "toolId">): BrowserSessionStep {
  return {
    runId: "run-1",
    stepIndex: overrides.sequence,
    status: "completed",
    ...overrides,
  };
}

function run(steps: readonly BrowserSessionStep[], runId = "run-1"): BrowserSessionRun {
  return { runId, status: "running", stepCount: steps.length, steps, current: true };
}

function event(
  runId: string,
  activity: BrowserGoalActivityEvent,
  goalId = "goal-1",
): BrowserGoalLiveEvent {
  return { type: "activity", goalId, runId, activity };
}

test("committed actions merge only when category, stage and verified adjacency match", () => {
  const groups = projectActivityGroups({
    goalId: "goal-1",
    run: run([
      step({ executionUnitId: "u1", sequence: 1, sourceEventId: "traj-1", actionId: "a1", toolId: "read_file", inputSummary: "a.ts" }),
      step({ executionUnitId: "u2", sequence: 4, sourceEventId: "traj-4", actionId: "a2", toolId: "grep", inputSummary: "needle" }),
      step({ executionUnitId: "u3", sequence: 7, sourceEventId: "traj-7", actionId: "a3", toolId: "bash", stageId: "stage-1", bashExecution: { command: "npm test" } }),
      step({ executionUnitId: "u4", sequence: 10, sourceEventId: "traj-10", actionId: "a4", toolId: "read_file", stageId: "stage-1", activityBoundaryBefore: true }),
      step({ executionUnitId: "u5", sequence: 13, sourceEventId: "traj-13", actionId: "a5", toolId: "read_file", stageId: "stage-2" }),
      step({ executionUnitId: "u6", sequence: 16, sourceEventId: "traj-16", actionId: "a6", toolId: "custom_tool" }),
      step({ executionUnitId: "u7", sequence: 19, sourceEventId: "traj-19", actionId: "a7", toolId: "custom_tool" }),
    ]),
    liveEvents: [],
  });

  assert.deepEqual(groups.map((group) => [group.category, group.members.map((member) => member.actionId)]), [
    ["explore", ["a1", "a2"]], ["execute", ["a3"]], ["explore", ["a4"]],
    ["explore", ["a5"]], ["single", ["a6"]], ["single", ["a7"]],
  ]);
  assert.equal(groups[1]?.members[0]?.label, "Ran npm test");
});

test("live retries update one action; a failed attempt followed by success completes the group", () => {
  const events: BrowserGoalLiveEvent[] = [
    event("run-1", { kind: "tool_started", sourceEventId: "event-1", sourceCursor: 1, actionId: "live-a", executionUnitId: "unit-a", toolId: "read_file", inputSummary: "src/a.ts" }),
    event("run-1", { kind: "tool_attempt_started", sourceEventId: "event-2", sourceCursor: 2, actionId: "live-a", attempt: 1 }),
    event("run-1", { kind: "tool_attempt_failed", sourceEventId: "event-3", sourceCursor: 3, actionId: "live-a", attempt: 1, reason: "temporary failure" }),
    event("run-1", { kind: "tool_attempt_started", sourceEventId: "event-4", sourceCursor: 4, actionId: "live-a", attempt: 2 }),
    event("run-1", { kind: "tool_finished", sourceEventId: "event-5", sourceCursor: 5, actionId: "live-a", toolId: "read_file", outcome: "success", summary: "Read file" }),
  ];
  const groups = projectActivityGroups({ goalId: "goal-1", run: run([]), liveEvents: events });
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.status, "completed");
  assert.equal(groups[0]?.members.length, 1);
  assert.deepEqual(groups[0]?.members[0]?.attempts, ["Attempt 1 failed: temporary failure"]);
  assert.equal(groups[0]?.members[0]?.summary, "Read file");
  assert.equal(groups[0]?.members[0]?.isCommitted, false);
});

test("live updates reconcile with committed action identity and materialization does not duplicate it", () => {
  const saved = step({ executionUnitId: "unit-shared", sequence: 8, sourceEventId: "traj-event-8", actionId: "shared", toolId: "bash", status: "recorded" });
  const events: BrowserGoalLiveEvent[] = [
    event("run-1", { kind: "tool_started", sourceEventId: "event-1", sourceCursor: 1, actionId: "shared", executionUnitId: "unit-shared", toolId: "bash", inputSummary: "npm test" }),
    event("run-1", { kind: "tool_finished", sourceEventId: "event-2", sourceCursor: 2, actionId: "shared", toolId: "bash", outcome: "success", summary: "Tests passed" }),
  ];
  const overlay = projectActivityGroups({ goalId: "goal-1", run: run([saved]), liveEvents: events });
  assert.equal(overlay.length, 1);
  assert.equal(overlay[0]?.members.length, 1);
  assert.equal(overlay[0]?.members[0]?.id, "action:run-1:shared");
  assert.equal(overlay[0]?.status, "completed");
  assert.equal(overlay[0]?.members[0]?.isCommitted, true);
  assert.equal(overlay[0]?.members[0]?.hasLiveUpdate, true);

  const materialized = projectActivityGroups({
    goalId: "goal-1",
    run: run([{ ...saved, status: "completed", summary: "Tests passed" }]),
    liveEvents: events,
  });
  assert.equal(materialized.length, 1);
  assert.equal(materialized[0]?.members.length, 1);
  assert.equal(materialized[0]?.members[0]?.id, "action:run-1:shared");
});

test("missing source identity keeps an otherwise similar durable action as a separate singleton", () => {
  const groups = projectActivityGroups({
    goalId: "goal-1",
    run: run([
      step({ executionUnitId: "u1", sequence: 1, sourceEventId: "e1", actionId: "a1", toolId: "read_file" }),
      step({ executionUnitId: "u2", sequence: 2, actionId: "a2", toolId: "read_file" }),
      step({ executionUnitId: "u3", sequence: 3, sourceEventId: "e3", actionId: "a3", toolId: "read_file" }),
    ]),
    liveEvents: [],
  });
  assert.deepEqual(groups.map((group) => group.members.map((member) => member.actionId)), [["a1"], ["a2"], ["a3"]]);
});

test("terminal tool failure ends the current group before a later action", () => {
  const groups = projectActivityGroups({
    goalId: "goal-1",
    run: run([
      step({ executionUnitId: "u1", sequence: 1, sourceEventId: "e1", actionId: "a1", toolId: "read_file", status: "completed" }),
      step({ executionUnitId: "u2", sequence: 2, sourceEventId: "e2", actionId: "a2", toolId: "read_file", status: "failed" }),
      step({ executionUnitId: "u3", sequence: 3, sourceEventId: "e3", actionId: "a3", toolId: "read_file", status: "completed" }),
    ]),
    liveEvents: [],
  });
  assert.deepEqual(groups.map((group) => [group.status, group.members.length]), [["failed", 2], ["completed", 1]]);
});

test("assistant, waiting, stage, terminal and failure events all separate live groups", () => {
  const reasons = ["assistant_reply", "user_wait", "stage_change", "terminal", "failure", "unknown"] as const;
  for (const [index, reason] of reasons.entries()) {
    const cursor = index * 3;
    const groups = projectActivityGroups({
      goalId: "goal-1",
      run: run([]),
      liveEvents: [
        event("run-1", { kind: "tool_started", sourceEventId: `start-${index}-1`, sourceCursor: cursor + 1, actionId: `a-${index}-1`, executionUnitId: `u-${index}-1`, toolId: "read_file" }),
        event("run-1", { kind: "activity_boundary", sourceEventId: `boundary-${index}`, sourceCursor: cursor + 2, reason }),
        event("run-1", { kind: "tool_started", sourceEventId: `start-${index}-2`, sourceCursor: cursor + 3, actionId: `a-${index}-2`, executionUnitId: `u-${index}-2`, toolId: "read_file" }),
      ],
    });
    assert.equal(groups.length, 2, reason);
  }
});

test("identity spaces remain separate, boundaries break groups, and foreign runs are ignored", () => {
  const groups = projectActivityGroups({
    goalId: "goal-1",
    run: run([step({ executionUnitId: "saved", sequence: 1, sourceEventId: "event-1", actionId: "saved", toolId: "read_file" })]),
    liveEvents: [
      event("run-1", { kind: "activity_boundary", sourceEventId: "event-1", sourceCursor: 1, reason: "assistant_reply" }),
      event("run-1", { kind: "tool_started", sourceEventId: "event-2", sourceCursor: 2, actionId: "live", executionUnitId: "live-unit", toolId: "read_file" }),
      event("run-1", { kind: "tool_started", sourceEventId: "event-2", sourceCursor: 2, actionId: "live", executionUnitId: "live-unit", toolId: "read_file" }),
      event("another-run", { kind: "tool_started", sourceEventId: "event-3", sourceCursor: 3, actionId: "foreign", executionUnitId: "foreign-unit", toolId: "read_file" }),
      event("run-1", { kind: "assistant_text_delta", sourceEventId: "event-4", sourceCursor: 4, text: "public answer", truncated: false }),
    ],
  });
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
  assert.equal(projectActivityGroups({ goalId: "goal-1", run: run([], "run-1"), liveEvents }).length, 1);
  assert.equal(projectActivityGroups({ goalId: "goal-1", run: { ...run([], "run-1"), status: "waiting" }, liveEvents }).length, 0);
  assert.equal(projectActivityGroups({ goalId: "goal-1", run: { ...run([], "run-1"), status: "completed" }, liveEvents }).length, 0);
});
