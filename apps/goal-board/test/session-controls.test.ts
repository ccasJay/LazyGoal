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

test("清空队列先确认服务端已受理的范围", async () => {
  const { queueClearScope } = await import("../src/session-controls");

  assert.equal(queueClearScope(0), undefined);
  assert.equal(queueClearScope(1), "Clear 1 accepted queued task?");
  assert.equal(queueClearScope(3), "Clear 3 accepted queued tasks?");
});

test("运行中的输入区提供显式 Steer 与独立 Stop，且不弹出 Steer／Queue 菜单", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MessageComposer } = await import("../src/components/MessageComposer");

  const html = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: false,
    running: true,
    placeholder: "Add direction while this Run is working…",
    onSubmit: async () => true,
    onSteer: async () => true,
    onInterrupt: async () => undefined,
    footerControls: null,
  } as any));

  assert.match(html, /aria-label="Stop run"/);
  assert.match(html, /aria-label="Steer the current Run with this message"/);
  assert.match(html, /Sending normally queues the next task\. Steer modifies the current task instead\./);
  assert.equal(html.includes("Choose Steer or Queue"), false);
  assert.equal(html.includes("Choose message action"), false);
  assert.match(html, /aria-label="Send message"/);
});

test("停止入口不依赖草稿内容，停止中给出明确状态", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MessageComposer } = await import("../src/components/MessageComposer");

  const running = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: true,
    running: true,
    stopping: false,
    placeholder: "Add direction while this Run is working…",
    onSubmit: async () => true,
    onInterrupt: async () => undefined,
    footerControls: null,
  } as any));
  assert.match(running, /aria-label="Stop run"/);
  const stopButton = /<button[^>]*aria-label="Stop run"[^>]*>/.exec(running)?.[0] ?? "";
  assert.equal(stopButton.includes("disabled"), false, "输入提交在途时停止入口仍然可达");

  const stopping = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: true,
    running: true,
    stopping: true,
    placeholder: "Add direction while this Run is working…",
    onSubmit: async () => true,
    onInterrupt: async () => undefined,
    footerControls: null,
  } as any));
  assert.match(stopping, /aria-label="Stopping Run"/);
  assert.match(stopping, /Stopping/);
});
