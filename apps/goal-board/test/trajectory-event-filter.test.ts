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
    phase: "executing",
    category: "tool",
    title: "tool_started: read_file",
    preview: "Reading package.json",
    inputPreview: "{\"path\":\"package.json\"}",
    resultPreview: null,
    actionId: "act-42",
    ...overrides,
  };
}

void test("isEventMatched 在无查询和全部分类时返回 true", () => {
  const entry = mockEntry();
  assert.equal(isEventMatched(entry, "", "All events"), true);
  assert.equal(isEventMatched(entry, "   ", "All events"), true);
});

void test("isEventMatched 准确过滤类别", () => {
  const toolEntry = mockEntry({ category: "tool" });
  assert.equal(isEventMatched(toolEntry, "", "tool"), true);
  assert.equal(isEventMatched(toolEntry, "", "decision"), false);
  assert.equal(isEventMatched(toolEntry, "", "commit"), false);
});

void test("isEventMatched 在 title、preview、sequence 及 actionId 中模糊匹配搜索文本", () => {
  const entry = mockEntry({
    sequence: 123,
    title: "tool_started: grep",
    preview: "Searching for imports in src",
    actionId: "act-import-search",
  });

  // sequence 匹配
  assert.equal(isEventMatched(entry, "123", "All events"), true);
  assert.equal(isEventMatched(entry, "999", "All events"), false);

  // title 匹配（大小写不敏感）
  assert.equal(isEventMatched(entry, "GREP", "All events"), true);

  // preview 匹配
  assert.equal(isEventMatched(entry, "imports", "All events"), true);

  // actionId 匹配
  assert.equal(isEventMatched(entry, "act-import", "All events"), true);

  // 不相关关键字
  assert.equal(isEventMatched(entry, "nonexistent", "All events"), false);
});

void test("isEventMatched 类别与搜索词复合过滤逻辑", () => {
  const entry = mockEntry({
    category: "tool",
    title: "tool_started: write_file",
  });

  // 类别匹配且搜索词匹配
  assert.equal(isEventMatched(entry, "write_file", "tool"), true);

  // 类别不匹配但搜索词匹配 -> false
  assert.equal(isEventMatched(entry, "write_file", "decision"), false);

  // 类别匹配但搜索词不匹配 -> false
  assert.equal(isEventMatched(entry, "missing_term", "tool"), false);
});
