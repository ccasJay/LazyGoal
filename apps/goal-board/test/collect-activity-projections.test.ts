import assert from "node:assert/strict";
import { test } from "node:test";
import { collectActivityProjections } from "../src/collect-activity-projections";
import type { BrowserGoalLiveEvent, BrowserSessionRun } from "../../../packages/web-contracts/src/index";

function runFixture(runId: string, current: boolean): BrowserSessionRun {
  return {
    runId,
    status: "running",
    stepCount: 1,
    current,
    steps: [{
      runId,
      executionUnitId: `unit-${runId}`,
      sequence: 1,
      stepIndex: 1,
      toolId: "read_file",
      inputSummary: "config.json",
      status: "completed",
      summary: "Read initial config",
    }],
  };
}

const goalId = "goal-1";

test("collectActivityProjections returns one projection per run keyed by runId", () => {
  const runs = [runFixture("run-1", false), runFixture("run-2", true)];
  const projections = collectActivityProjections(runs, goalId, []);
  assert.deepEqual([...projections.keys()].sort(), ["run-1", "run-2"]);
  assert.ok(projections.get("run-1")!.length > 0, "committed steps project into groups");
});

test("live events only participate in the current run projection", () => {
  const runs = [runFixture("run-1", false), runFixture("run-2", true)];
  const live = [{
    type: "activity",
    runId: "run-2",
    activity: { kind: "activity_boundary", sourceEventId: "evt-1", sourceCursor: 1, reason: "assistant_reply" },
  }] as unknown as readonly BrowserGoalLiveEvent[];

  const withLive = collectActivityProjections(runs, goalId, live);
  const withoutLive = collectActivityProjections(runs, goalId, []);

  assert.deepEqual(
    withLive.get("run-1")!.map((group) => group.id),
    withoutLive.get("run-1")!.map((group) => group.id),
    "non-current runs must ignore live events",
  );
  assert.notEqual(
    withLive.get("run-2")!.length,
    0,
    "current run still projects with live events attached",
  );
});
