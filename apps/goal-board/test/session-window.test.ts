import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SESSION_WINDOW_MESSAGE_THRESHOLD,
  resolveCurrentWindow,
  resolveExpandedWindow,
  resolveInitialWindow,
} from "../src/session-window";
import type { BrowserSessionMessage, BrowserSessionRun } from "../../../packages/web-contracts/src/index";

function runsFixture(counts: readonly number[]): BrowserSessionRun[] {
  return counts.map((messageCount, index) => ({
    runId: `run-${index + 1}`,
    status: "completed",
    stepCount: 1,
    current: false,
    steps: [],
  }) as unknown as BrowserSessionRun);
}

function messagesFor(counts: readonly number[]): BrowserSessionMessage[] {
  const messages: BrowserSessionMessage[] = [];
  counts.forEach((messageCount, index) => {
    for (let order = 0; order < messageCount; order++) {
      messages.push({ runId: `run-${index + 1}`, role: "user", content: `m${order}` } as BrowserSessionMessage);
    }
  });
  return messages;
}

test("small sessions render everything without pagination", () => {
  const counts = [2, 2];
  const window = resolveInitialWindow(runsFixture(counts), messagesFor(counts), SESSION_WINDOW_MESSAGE_THRESHOLD);
  assert.equal(window.runCount, 2);
  assert.equal(window.omittedMessages, 0);
  assert.equal(window.pendingMessages, 0);
});

test("window is the smallest complete-run suffix reaching the threshold", () => {
  const counts = [20, 20, 20, 5];
  const window = resolveInitialWindow(runsFixture(counts), messagesFor(counts), SESSION_WINDOW_MESSAGE_THRESHOLD);
  // 从尾部累计：run-4(5) → run-3(25) → run-2(45) 都不足 50，必须包含 run-1。
  assert.equal(window.runCount, 4);
  assert.equal(window.omittedMessages, 0);
});

test("messages without run ownership always render and never count as omitted", () => {
  const counts = [30, 3];
  const information = messagesFor(counts);
  information.push({ role: "user", content: "older draft" } as BrowserSessionMessage);
  const window = resolveInitialWindow(runsFixture(counts), information, 20);
  assert.equal(window.runCount, 2);
  assert.equal(window.omittedMessages, 0);
});

test("omitted messages count only window-outside run messages", () => {
  const counts = [30, 30, 4, 20];
  const window = resolveInitialWindow(runsFixture(counts), messagesFor(counts), 50);
  // 尾部累计 20 → 24 → 54 ≥ 50，k=3（run-2..run-4）；窗口外 run-1 独支 30 条。
  assert.equal(window.runCount, 3);
  assert.equal(window.omittedMessages, 30);
  assert.equal(window.pendingMessages, 1);
});

test("expanding adds whole runs; full window stays idempotent", () => {
  const counts = [25, 25, 6];
  const runs = runsFixture(counts);
  const messages = messagesFor(counts);
  const initial = resolveInitialWindow(runs, messages, 30);
  assert.equal(initial.runCount, 2, "run-3(6) → run-2(31) is the first suffix to reach 30");

  const expanded = resolveExpandedWindow(runs, messages, initial.runCount, 30);
  assert.equal(expanded.runCount, 3);
  assert.equal(expanded.omittedMessages, 0);

  const alreadyFull = resolveExpandedWindow(runs, messages, 3, 30);
  assert.equal(alreadyFull.runCount, 3);
});

test("current window reports remaining runs and messages for the expand control", () => {
  const runs = runsFixture([40, 30, 20, 5, 2]);
  const messages = messagesFor([40, 30, 20, 5, 2]);
  const current = resolveCurrentWindow(runs, messages, 4);
  assert.equal(current.runCount, 4);
  assert.equal(current.omittedMessages, 40);
  assert.equal(current.pendingMessages, 1);

  const full = resolveCurrentWindow(runs, messages, 5);
  assert.equal(full.pendingMessages, 0);
  assert.equal(full.omittedMessages, 0);
});
