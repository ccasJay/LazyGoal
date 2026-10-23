import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserTrajectoryEntry } from "../../../packages/web-contracts/src/index";
import {
  primaryTimelineEntries,
  timelineContentWidth,
  timelineSequenceRange,
  timelineSpan,
  timelineStepBoundaries,
  timelineTimesValid,
} from "../src/trajectory-timeline-model.js";

function entry(sequence: number, occurredAt: string, overrides: Partial<BrowserTrajectoryEntry> = {}): BrowserTrajectoryEntry {
  return {
    eventId: `event-${sequence}`,
    sequence,
    occurredAt,
    eventType: "run_started",
    category: "lifecycle",
    title: `Event ${sequence}`,
    preview: "",
    previewTruncated: false,
    ...overrides,
  };
}

const entries = [
  entry(1, "2026-10-18T00:00:00.000Z"),
  entry(2, "2026-10-18T00:00:01.000Z", { eventType: "state_committed", category: "commit" }),
  entry(3, "2026-10-18T00:00:02.000Z", { eventType: "decision_received", category: "decision" }),
  entry(4, "2026-10-18T00:00:05.000Z", { eventType: "tool_started", category: "tool" }),
  entry(5, "2026-10-18T00:00:06.000Z", { stepIndex: 1, eventType: "tool_finished", category: "tool" }),
  entry(6, "2026-10-18T00:00:07.000Z", { stepIndex: 1, eventType: "run_completed", category: "terminal" }),
];

test("primary timeline entries drop commits and internal observation facts", () => {
  assert.deepEqual(primaryTimelineEntries(entries).map((item) => item.sequence), [1, 3, 4, 6]);
});

test("time projection requires ordered finite timestamps", () => {
  assert.equal(timelineTimesValid(entries), true);
  assert.equal(timelineTimesValid([entry(1, "invalid"), entry(2, "2026-10-18T00:00:01.000Z")]), false);
  assert.equal(timelineTimesValid([
    entry(1, "2026-10-18T00:00:02.000Z"),
    entry(2, "2026-10-18T00:00:01.000Z"),
  ]), false);
});

test("timeline content width never falls below the viewport", () => {
  assert.equal(timelineContentWidth(900, "time", 1), 900);
  assert.equal(timelineContentWidth(900, "sequence", 1), 900);
  assert.equal(timelineContentWidth(900, "sequence", 2), 1800);
  assert.equal(timelineContentWidth(900, "sequence", 0.5), 900);
});

test("sequence spans fill the full width and compact marks stay at both edges", () => {
  const primary = primaryTimelineEntries(entries);
  const full = primary.map((item, index) => timelineSpan(item, index, primary, "sequence", false, 900));
  assert.equal(Math.round(full[0]!.left), 4);
  assert.ok(Math.round(full.at(-1)!.left + full.at(-1)!.width) <= 896);
  assert.ok(full.every((span) => span.left >= 4 && span.left + span.width <= 896));

  const compact = primary.map((item, index) => timelineSpan(item, index, primary, "sequence", true, 900));
  assert.ok(compact.every((span) => Math.round(span.width) === 8));
  assert.equal(Math.round(compact[0]!.left), 4);
  assert.equal(Math.round(compact.at(-1)!.left + compact.at(-1)!.width), 896);
});

test("time spans preserve the recorded edges across the full width", () => {
  const primary = primaryTimelineEntries(entries);
  const first = timelineSpan(primary[0]!, 0, primary, "time", false, 900);
  const last = timelineSpan(primary.at(-1)!, primary.length - 1, primary, "time", false, 900);
  assert.equal(Math.round(first.left), 4);
  assert.equal(Math.round(last.left + last.width), 896);
  assert.deepEqual([...new Set(primary.map((item, index) => timelineSpan(item, index, primary, "time", false, 900).top))], [7, 21, 35]);
});

test("dragging on the timeline returns the enclosing sequence range", () => {
  const primary = primaryTimelineEntries(entries);
  const range = timelineSequenceRange(primary, "sequence", false, 900, 0, 450);
  assert.deepEqual(range, { fromSequence: 1, toSequence: 3 });
  assert.equal(timelineSequenceRange(primary, "sequence", false, 900, 1000, 1200), null);
});

test("step boundaries mark the first event of each later step", () => {
  const primary = primaryTimelineEntries(entries);
  const boundaries = timelineStepBoundaries(primary, "sequence", false, 900);
  assert.equal(boundaries.length, 1);
  const firstStepOne = timelineSpan(primary[3]!, 3, primary, "sequence", false, 900);
  assert.equal(boundaries[0], firstStepOne.left);
});
