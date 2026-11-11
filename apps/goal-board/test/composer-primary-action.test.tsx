import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

async function renderComposer(props: Record<string, unknown> = {}): Promise<string> {
  const { MessageComposer } = await import("../src/components/MessageComposer");
  return renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: false,
    placeholder: "Describe a Goal",
    onSubmit: async () => true,
    draftValue: "",
    onDraftChange: () => undefined,
    ...props,
  } as never));
}

function isDisabled(button: string): boolean {
  return /\sdisabled(?![\w:-])/.test(button);
}

function startButton(html: string): string {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
  const button = buttons.find(candidate => /class="[^"]*\bsend\b/.test(candidate));
  assert.ok(button, "Start Goal button is rendered");
  return button!;
}

test("the Goal composer disables Start Goal for an empty intent", async () => {
  const button = startButton(await renderComposer());
  assert.match(button, /aria-label="Start Goal"/);
  assert.equal(isDisabled(button), true);
});

test("the Goal composer enables Start Goal for a non-empty intent", async () => {
  const button = startButton(await renderComposer({ draftValue: "Prepare a release plan" }));
  assert.match(button, /aria-label="Start Goal"/);
  assert.equal(isDisabled(button), false);
});

test("the Goal composer respects sendDisabled", async () => {
  const button = startButton(await renderComposer({ draftValue: "Prepare a release plan", sendDisabled: true }));
  assert.equal(isDisabled(button), true);
});
