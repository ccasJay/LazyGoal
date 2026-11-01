import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserToolActivity } from "../../../packages/web-contracts/src/index";
import { applyToolActivityEvent, type ToolActivity } from "../src/control/tool-activity";

function activity(overrides: Partial<BrowserToolActivity> & Pick<BrowserToolActivity, "phase" | "actionId">): BrowserToolActivity {
  return {
    actionId: overrides.actionId,
    executionUnitId: "unit-1",
    toolId: "write_file",
    phase: overrides.phase,
    ...overrides,
  };
}

function only(activities: readonly ToolActivity[]): ToolActivity {
  assert.equal(activities.length, 1);
  return activities[0]!;
}

test("工具返回停在 result_pending，Observation 提交后才进入 observed_committed", () => {
  let activities = applyToolActivityEvent([], activity({ actionId: "action-1", phase: "started", attempt: 1 }));
  assert.equal(only(activities).phase, "started");

  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "result_pending", outcome: "success", summary: "written" }));
  const pending = only(activities);
  assert.equal(pending.phase, "result_pending");
  assert.equal(pending.outcome, "success");
  assert.deepEqual(pending.attempts, [{ attempt: 1, phase: "returned" }]);

  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "observed_committed" }));
  const committed = only(activities);
  assert.equal(committed.phase, "observed_committed");
  assert.equal(committed.outcome, "success");
  assert.equal(committed.summary, "written");
});

test("迟到的工具返回不回退已提交结果", () => {
  let activities = applyToolActivityEvent([], activity({ actionId: "action-1", phase: "started", attempt: 1 }));
  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "result_pending", outcome: "failure" }));
  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "observed_committed" }));
  const before = only(activities);

  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "result_pending", outcome: "success" }));
  assert.equal(only(activities), before);
});

test("重试保留先前 attempt 的事实，旧 attempt 不回退当前状态", () => {
  let activities = applyToolActivityEvent([], activity({ actionId: "action-1", phase: "started", attempt: 1 }));
  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "retrying", attempt: 1, reason: "timeout" }));
  assert.deepEqual(only(activities).attempts, [{ attempt: 1, phase: "failed", reason: "timeout" }]);
  assert.equal(only(activities).phase, "retrying");

  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "attempting", attempt: 2 }));
  assert.deepEqual(only(activities).attempts, [
    { attempt: 1, phase: "failed", reason: "timeout" },
    { attempt: 2, phase: "started" },
  ]);

  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "attempting", attempt: 1 }));
  assert.deepEqual(only(activities).attempts, [
    { attempt: 1, phase: "failed", reason: "timeout" },
    { attempt: 2, phase: "started" },
  ]);
  assert.equal(only(activities).phase, "attempting");
});

test("重复事件保持引用不变，缺少执行单元的事件并入同一 Action", () => {
  let activities = applyToolActivityEvent([], activity({ actionId: "action-1", phase: "started", attempt: 1 }));
  const first = activities;
  activities = applyToolActivityEvent(activities, activity({ actionId: "action-1", phase: "started", attempt: 1 }));
  assert.equal(activities, first);
  assert.equal(only(activities).phase, "started");

  activities = applyToolActivityEvent(activities, {
    actionId: "action-1",
    attempt: 2,
    phase: "attempting",
  });
  assert.equal(only(activities).executionUnitId, "unit-1");
  assert.equal(only(activities).toolId, "write_file");
  assert.equal(only(activities).attempts.length, 2);
});

test("不同 Action 与执行单元分别保留", () => {
  let activities = applyToolActivityEvent([], activity({ actionId: "action-1", phase: "started", attempt: 1 }));
  activities = applyToolActivityEvent(activities, activity({ actionId: "action-2", executionUnitId: "unit-2", phase: "started", attempt: 1 }));
  assert.equal(activities.length, 2);
  assert.deepEqual(activities.map((entry) => entry.executionUnitId), ["unit-1", "unit-2"]);
});
