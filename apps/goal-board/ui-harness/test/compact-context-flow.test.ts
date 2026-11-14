import assert from "node:assert/strict";
import { test } from "node:test";
import { runFlow } from "../src/flows";
import { compactContextFlow } from "../src/flows/compact-context";

test("/compact flow dispatches a compact session input without writing a message", { timeout: 30_000 }, async () => {
  const report = await runFlow(compactContextFlow);

  assert.equal(report.ok, true, report.error ?? "flow failed without an error message");
  assert.equal(report.steps.length, compactContextFlow.steps.length);
  assert.ok(report.steps.every((step) => step.ok));
  assert.equal(report.diagnostics?.ok, true);
});
