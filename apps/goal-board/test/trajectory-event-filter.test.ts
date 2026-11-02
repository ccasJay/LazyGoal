import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserTrajectoryEntry } from "../../../packages/web-contracts/src/index";
import { isEventMatched } from "../src/trajectory-event-filter";

function mockEntry(overrides: Partial<BrowserTrajectoryEntry> = {}): BrowserTrajectoryEntry {
  return {
    eventId: "ev-1",
    sequence: 42,
    eventType: "tool_started",
    occurredAt: "2026-10-09T12:00:00.000Z",
    category: "tool",
    title: "tool_started: read_file",
    preview: "Reading package.json",
    inputPreview: "{\"path\":\"package.json\"}",
    actionId: "act-42",
    ...overrides,
  };
}

void test("isEventMatched 在 All events 下接受全部类别", () => {
  const entry = mockEntry();
  assert.equal(isEventMatched(entry, "All events"), true);
  assert.equal(isEventMatched(entry, "  "), false);
});

void test("isEventMatched 准确过滤类别", () => {
  const toolEntry = mockEntry({ category: "tool" });
  assert.equal(isEventMatched(toolEntry, "tool"), true);
  assert.equal(isEventMatched(toolEntry, "decision"), false);
  assert.equal(isEventMatched(toolEntry, "commit"), false);
});
