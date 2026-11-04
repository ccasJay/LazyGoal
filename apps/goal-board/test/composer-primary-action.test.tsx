import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchActions } from "../src/workbench-actions";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

const available = (id: "send_message" | "stop" | "resume", label: string, group: "message" | "run") =>
  ({ id, label, group, available: true }) as const;

const unavailable = (id: "send_message" | "stop" | "resume", label: string, group: "message" | "run") =>
  ({ id, label, group, available: false, reason: "recovery-unavailable" }) as const;

function primaryActions(options: { send?: boolean; stop?: boolean; resume?: boolean } = {}): Pick<WorkbenchActions, "send_message" | "stop" | "resume"> {
  return {
    send_message: options.send === false
      ? unavailable("send_message", "Send message", "message")
      : available("send_message", "Send message", "message"),
    stop: options.stop === false
      ? ({ id: "stop", label: "Pause Run", group: "run", available: false, reason: "run-not-running" } as const)
      : available("stop", "Pause Run", "run"),
    resume: options.resume === false
      ? unavailable("resume", "Resume Run", "run")
      : available("resume", "Resume Run", "run"),
  };
}

async function renderComposer(props: Record<string, unknown>): Promise<string> {
  const { MessageComposer } = await import("../src/components/MessageComposer");
  return renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: false,
    placeholder: "Message LazyGoal…",
    onSubmit: async () => true,
    footerControls: null,
    draftValue: "",
    onDraftChange: () => undefined,
    ...props,
  } as never));
}

function isDisabled(button: string): boolean {
  return /\sdisabled(?![\w:-])/.test(button);
}

function sendButton(html: string): string {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
  const button = buttons.find(candidate => /class="[^"]*\bsend\b/.test(candidate));
  assert.ok(button, "send button is rendered");
  return button!;
}

test("纯发送状态下空输入禁用主按钮", async () => {
  const html = await renderComposer({ primaryActions: primaryActions() });
  const button = sendButton(html);
  assert.match(button, /aria-label="Type a message to send"/);
  assert.equal(isDisabled(button), true);
});

test("纯发送状态下有草稿时主按钮可用", async () => {
  const html = await renderComposer({ primaryActions: primaryActions(), draftValue: "Continue the task" });
  const button = sendButton(html);
  assert.match(button, /aria-label="Send message"/);
  assert.equal(isDisabled(button), false);
});

test("运行中空输入仍以暂停为主操作", async () => {
  const html = await renderComposer({ primaryActions: primaryActions(), running: true, onInterrupt: async () => undefined });
  const button = sendButton(html);
  assert.match(button, /aria-label="Pause Run"/);
  assert.equal(isDisabled(button), false);
});

test("可恢复空输入仍以恢复为主操作", async () => {
  const html = await renderComposer({ primaryActions: primaryActions(), recoverable: true, onResume: async () => undefined });
  const button = sendButton(html);
  assert.match(button, /aria-label="Resume Run"/);
  assert.equal(isDisabled(button), false);
});

test("发送不可用时保持禁用并沿用原因", async () => {
  const html = await renderComposer({ primaryActions: primaryActions({ send: false }), draftValue: "Continue" });
  const button = sendButton(html);
  assert.equal(isDisabled(button), true);
});
