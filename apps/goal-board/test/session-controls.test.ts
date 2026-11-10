import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout,
    clearTimeout,
  };
}

test("Enter submits the first Goal intent, Shift+Enter adds a line, and IME composition does not submit", async () => {
  const { resolveComposerKey } = await import("../src/session-controls");

  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: false, isComposing: false }), { kind: "submit" });
  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: true, isComposing: false }), { kind: "newline" });
  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: false, isComposing: true }), { kind: "ignore" });
  assert.deepEqual(resolveComposerKey({ key: "Enter", shiftKey: true, isComposing: true }), { kind: "ignore" });
  assert.deepEqual(resolveComposerKey({ key: "a", shiftKey: false, isComposing: false }), { kind: "ignore" });
});

test("The composer only submits a new Goal and exposes no Run control", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MessageComposer } = await import("../src/components/MessageComposer");

  const html = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: false,
    draftValue: "",
    onDraftChange: () => {},
    placeholder: "Describe a Goal…",
    onSubmit: async () => true,
    footerControls: null,
  }));

  assert.match(html, /aria-label="Goal intent"/);
  assert.match(html, /aria-label="Start Goal"/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /Pause Run|Resume Run|Queue next task|Steer/);
});
