import assert from "node:assert/strict";
import { test } from "node:test";
import { collectActivityProjections } from "../src/collect-activity-projections";
import type {
  BrowserActivityFactItem,
  BrowserActivityPage,
  BrowserGoalLiveEvent,
} from "../../../packages/web-contracts/src/index";

function toolFact(runId: string, sequence: number, actionId: string): BrowserActivityFactItem {
  return {
    type: "fact",
    itemId: `fact:${runId}:${sequence}`,
    eventId: `event-${runId}-${sequence}`,
    runId,
    position: { runId, runOrder: 0, sequence, itemKind: "fact", order: 0 },
    eventType: "tool_started",
    title: "Tool started",
    actionId,
    tool: { toolId: "read_file", status: "completed", inputSummary: "config.json" },
  };
}

function pageFixture(): BrowserActivityPage {
  return {
    goalId: "goal-1",
    limit: 50,
    items: [
      toolFact("run-1", 1, "action-1"),
      toolFact("run-2", 1, "action-2"),
    ],
    runs: [
      { runId: "run-1", status: "completed", current: false, runOrder: 0, committedThroughSequence: 4 },
      { runId: "run-2", status: "running", current: true, runOrder: 1, committedThroughSequence: 4 },
    ],
    window: [],
    gaps: [],
    range: { olderAvailable: false, newerAvailable: false },
    stages: [],
    actionGroups: [],
  };
}

const goalId = "goal-1";

test("collectActivityProjections returns one projection per run keyed by runId", () => {
  const projections = collectActivityProjections(pageFixture(), goalId, []);
  assert.deepEqual([...projections.keys()].sort(), ["run-1", "run-2"]);
  assert.ok(projections.get("run-1")!.length > 0, "committed facts project into groups");
  assert.equal(projections.get("run-1")![0]?.members[0]?.actionId, "action-1");
});

test("live events only participate in the current run projection", () => {
  const live = [{
    type: "activity",
    goalId,
    runId: "run-2",
    activity: { kind: "activity_boundary", sourceEventId: "evt-1", sourceCursor: 1, reason: "assistant_reply" },
  }] as unknown as readonly BrowserGoalLiveEvent[];

  const withLive = collectActivityProjections(pageFixture(), goalId, live);
  const withoutLive = collectActivityProjections(pageFixture(), goalId, []);

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
