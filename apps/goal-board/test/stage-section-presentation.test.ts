import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActivityGroup, ActivityMemberStatus } from "../src/activity-projector";
import type { SessionTimelineEntry } from "../src/session-timeline";
import {
  selectStageSectionPresentation,
  stageSectionIdentity,
  type StageSectionState,
} from "../src/stage-section-presentation";

const position = { page: 1, index: 0 };

function group(status: ActivityMemberStatus, stageId = "stage-1"): ActivityGroup {
  const counts: Record<ActivityMemberStatus, number> = {
    running: 0, retrying: 0, waiting: 0, "pending-result": 0, completed: 0, failed: 0, rejected: 0,
  };
  counts[status] = 1;
  return {
    id: `action:run-1:${status}`,
    runId: "run-1",
    stageId,
    category: "execute",
    status,
    summary: "Run tests",
    counts,
    members: [{
      id: `action:run-1:${status}`,
      runId: "run-1",
      stageId,
      category: "execute",
      label: "Run tests",
      status,
      isCommitted: true,
      attempts: [],
      sourceItemId: "item-1",
      position,
    }],
    position,
  };
}

function activity(status: ActivityMemberStatus): SessionTimelineEntry {
  return { kind: "activity", itemId: `activity-${status}`, runId: "run-1", group: group(status), position };
}

function fact(eventType: string, options: { runId?: string; stageId?: string } = {}): SessionTimelineEntry {
  return {
    kind: "fact",
    itemId: `fact-${eventType}`,
    runId: options.runId ?? "run-1",
    title: eventType,
    eventType,
    stageId: options.stageId ?? "stage-1",
    stageRevision: 1,
    position,
  };
}

function presentation(
  entries: readonly SessionTimelineEntry[],
  overrides: Partial<Parameters<typeof selectStageSectionPresentation>[0]> = {},
) {
  return selectStageSectionPresentation({
    entries,
    currentRunId: "run-1",
    runStatus: "running",
    newerItemCount: 0,
    contextStatus: "executing",
    continued: false,
    ...overrides,
  });
}

test("当前 Run 中仍在执行的分段显示运行中并播放动画", () => {
  const result = presentation([activity("running")]);
  assert.equal(result.status, "running");
  assert.equal(result.animate, true);
  assert.deepEqual(result.attention, []);
});

test("延续分段只有自身活动时才继续播放动画", () => {
  const completed = presentation([activity("completed")], { continued: true });
  assert.notEqual(completed.status, "running");
  assert.equal(completed.animate, false);
  const active = presentation([activity("running")], { continued: true });
  assert.equal(active.status, "running");
});

test("阶段接受只标记该分段完成，不推断 Run 完成", () => {
  const result = presentation([fact("run_stage_accepted")], {
    contextStatus: "accepted",
    runStatus: "waiting",
  });
  assert.equal(result.status, "completed");
  assert.equal(result.animate, false);
});

test("拒绝的阶段显示 rejected，失败或等待成员进入注意列表", () => {
  const rejected = presentation([fact("run_stage_rejected")], { contextStatus: "rejected" });
  assert.equal(rejected.status, "rejected");

  const failed = presentation([activity("failed")]);
  assert.deepEqual(failed.attention.map((entry) => entry.itemId), ["activity-failed"]);

  const waiting = presentation([activity("waiting")], { runStatus: "waiting" });
  assert.equal(waiting.status, "attention");
});

test("历史 Run 的分段不显示运行动画", () => {
  const result = presentation([activity("running")], { currentRunId: "run-2" });
  assert.equal(result.status, "recorded");
  assert.equal(result.animate, false);
});

test("分段身份包含 Run、Stage 与修订", () => {
  assert.equal(stageSectionIdentity("run-1", "stage-1", 2), "run-1:stage-1:2");
  assert.notEqual(stageSectionIdentity("run-1", "stage-1", 2), stageSectionIdentity("run-1", "stage-1", 3));
  assert.notEqual(stageSectionIdentity("run-1", "stage-1", undefined), stageSectionIdentity("run-2", "stage-1", undefined));
});

test("状态集合稳定，不产生未声明的展示状态", () => {
  const allowed = new Set<StageSectionState>(["running", "completed", "rejected", "attention", "recorded"]);
  for (const status of ["running", "waiting", "completed", "failed", "rejected"] as const) {
    assert.ok(allowed.has(presentation([activity(status)]).status));
  }
});
