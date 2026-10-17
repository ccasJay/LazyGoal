import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

(globalThis as { React?: unknown }).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as { window?: unknown }).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout,
    clearTimeout,
  };
}

test("caught render errors render the recovery card and log diagnostics", async () => {
  const { SessionBoundary } = await import("../src/components/error-boundary");
  let reloaded = 0;
  const consoleErrorCalls: unknown[][] = [];
  const previousConsoleError = console.error;
  console.error = (...parts: unknown[]) => { consoleErrorCalls.push(parts); };
  try {
    const derived = SessionBoundary.getDerivedStateFromError(new Error("boom"));
    assert.deepEqual(Object.keys(derived).sort(), ["error"]);

    const boundary = Object.create(SessionBoundary.prototype) as {
      props: never; state: never; render: () => unknown;
    } as never as React.Component;
    Object.assign(boundary, {
      props: { label: "Activity view", onReload: () => { reloaded += 1; } },
      state: derived,
    });
    const fallback = boundary.render() as React.ReactElement<{ className?: string }>;
    assert.equal(fallback.props.className, "session-empty");

    boundary.componentDidCatch(new Error("boom"), { componentStack: "components stack" } as React.ErrorInfo);
    assert.equal(consoleErrorCalls.length, 1, "error and component stack must reach the console");

    const normal = Object.assign(Object.create(SessionBoundary.prototype), {
      props: { children: React.createElement("div", { className: "child" }), label: "x", onReload: () => undefined },
      state: { error: undefined },
    });
    assert.equal((normal.render() as React.ReactElement).props.className, "child");
  } finally {
    console.error = previousConsoleError;
  }
  assert.equal(reloaded, 0, "recovering never auto-triggers reload");
});
