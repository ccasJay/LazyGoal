import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

test("Enter 直接提交普通消息，Shift+Enter 换行，输入法组合期间不提交", async () => {
  const { resolveComposerKey } = await import("../src/session-controls");

  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: false, isComposing: false }), { kind: "submit" });
  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: true, isComposing: false }), { kind: "newline" });
  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: false, isComposing: true }), { kind: "ignore" });
  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: true, isComposing: true }), { kind: "ignore" });
  assert.deepEqual(resolveComposerKey({ key: "a", shiftKey: false, isComposing: false }), { kind: "ignore" });
});

test("明确拒绝与结果不明被区分，结果不明保留原身份与冻结载荷", async () => {
  const { classifySubmissionAttempt, reduceUnverifiedSubmissions } = await import("../src/session-controls");

  const accepted = classifySubmissionAttempt({ ok: true, existing: false });
  assert.deepEqual(accepted, { kind: "accepted", existing: false });

  const rejected = classifySubmissionAttempt({ ok: false, error: "QUEUE_PAUSED" });
  assert.deepEqual(rejected, { kind: "rejected", code: "QUEUE_PAUSED" });

  const structured = classifySubmissionAttempt(undefined, { code: "GOAL_BUSY", refresh: true });
  assert.deepEqual(structured, { kind: "rejected", code: "GOAL_BUSY" });

  const unknown = classifySubmissionAttempt(undefined, new TypeError("network down"));
  assert.deepEqual(unknown, { kind: "unknown" });

  const submission = {
    inputId: "input-1",
    goalId: "goal-1",
    runId: "run-1",
    kind: "message" as const,
    content: "Continue the review",
  };
  const recorded = reduceUnverifiedSubmissions([], { kind: "record", submission });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.inputId, "input-1");
  assert.equal(recorded[0]?.content, "Continue the review");

  const duplicate = reduceUnverifiedSubmissions(recorded, { kind: "record", submission });
  assert.equal(duplicate.length, 1, "同一身份只保留一条待核验记录");

  const settled = reduceUnverifiedSubmissions(recorded, { kind: "settled", inputId: "input-1" });
  assert.equal(settled.length, 0);
});

test("迟到响应只作用于提交时的 Goal 与 Run", async () => {
  const { isSameSubmissionTarget } = await import("../src/session-controls");

  const submission = { goalId: "goal-1", runId: "run-1" };
  assert.equal(isSameSubmissionTarget(submission, { goalId: "goal-1", currentRunId: "run-1" }), true);
  assert.equal(isSameSubmissionTarget(submission, { goalId: "goal-2", currentRunId: "run-1" }), false);
  assert.equal(isSameSubmissionTarget(submission, { goalId: "goal-1", currentRunId: "run-2" }), false);
  assert.equal(isSameSubmissionTarget(submission, undefined), false);
});

test("运行中的输入区只显示一个主按钮：空输入暂停，消息仍走排队发送", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MessageComposer } = await import("../src/components/MessageComposer");

  const html = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: false,
    running: true,
    placeholder: "Queue a message for the next Run…",
    onSubmit: async () => true,
    onInterrupt: async () => undefined,
    footerControls: null,
  } as any));

  assert.match(html, /aria-label="Pause Run"/);
  assert.match(html, /class="[^"]*send is-running"/);
  assert.doesNotMatch(html, /send-snake-loader|send-snake-pixel|send-live-indicator/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1, "running composer has one primary action");
  assert.doesNotMatch(html, /aria-label="Stop run"|aria-label="Steer the current Run with this message"/);
  assert.equal(html.includes("Choose Steer or Queue"), false);
  assert.equal(html.includes("Choose message action"), false);
});

test("暂停受理后主按钮显示暂停进度", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MessageComposer } = await import("../src/components/MessageComposer");

  const stopping = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: true,
    running: true,
    stopping: true,
    placeholder: "Queue a message for the next Run…",
    onSubmit: async () => true,
    onInterrupt: async () => undefined,
    footerControls: null,
  } as any));
  assert.match(stopping, /aria-label="Pausing Run"/);
  assert.match(stopping, /class="loading-mark small"/);
  assert.match(stopping, /disabled=""/);
});
