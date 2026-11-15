import assert from "node:assert/strict";
import { test } from "node:test";
import { runFlow } from "../src/flows";
import { stopOutcomeUnknownFlow } from "../src/flows/stop-outcome-unknown";

test("unknown stop outcome blocks duplicate requests and preserves verification", { timeout: 30_000 }, async () => {
  const report = await runFlow(stopOutcomeUnknownFlow);

  assert.equal(report.ok, true, report.error ?? "flow failed without an error message");
  assert.equal(report.steps.length, stopOutcomeUnknownFlow.steps.length);
  assert.ok(report.steps.every((step) => step.ok));
  assert.equal(report.diagnostics?.ok, true);
});
