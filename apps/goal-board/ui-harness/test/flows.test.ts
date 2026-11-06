import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runFlow, observeFlow } from "../src/flows";
import { sendMessageFlow } from "../src/flows/send-message";
import type { UiFlow } from "../src/flows/types";
import { boardPopulatedScenario } from "../src/scenarios";

test("send-message flow passes with command receipt and event-driven completion", { timeout: 30_000 }, async () => {
  const report = await runFlow(sendMessageFlow);

  assert.equal(report.ok, true, report.error ?? "flow failed without an error message");
  assert.equal(report.steps.length, sendMessageFlow.steps.length);
  assert.ok(report.steps.every((step) => step.ok));
  assert.equal(report.diagnostics?.ok, true);
});

test("observe flow records frames with evolving page facts", { timeout: 30_000 }, async () => {
  const outDir = await mkdtemp(join(tmpdir(), "lazygoal-observation-"));
  const report = await observeFlow(sendMessageFlow, { outDir, intervalMs: 400 });

  assert.equal(report.ok, true, report.error ?? "observation failed without an error message");
  assert.ok(report.frames.length >= 5);
  assert.equal(report.frames[0]?.facts.sendLabel, "Send message");
  assert.ok(report.frames.some((frame) => frame.facts.runStatuses.includes("Running")));
  assert.ok(report.frames.some((frame) => frame.facts.liveResponses.length > 0));
  assert.ok(report.frames.some((frame) => frame.facts.liveResponses.length >= 2));
  assert.ok(report.frames.some((frame) => frame.facts.progressTitles.some((title) => title.includes("Waiting for model response"))));
  assert.ok(report.frames.some((frame) => frame.facts.progressTitles.some((title) => title.includes("shell"))));
  assert.deepEqual(report.frames.at(-1)?.facts.runStatuses, ["Completed", "Completed"]);
  assert.equal(report.frames.at(-1)?.facts.liveResponses.length, 0);
  assert.ok(report.frames.every((frame) => frame.path.startsWith(outDir)));

  const manifest = JSON.parse(await readFile(report.manifestPath, "utf8")) as { flowId: string };
  assert.equal(manifest.flowId, "send-message");
});

test("failing flow captures a screenshot and reports the failing step", { timeout: 30_000 }, async () => {
  const artifactsDir = await mkdtemp(join(tmpdir(), "lazygoal-flow-failure-"));
  const failingFlow: UiFlow = {
    id: "failing-probe",
    description: "Probe the runner failure path",
    view: "board",
    scenario: boardPopulatedScenario,
    steps: [
      { action: "expect", selector: "[data-flow-probe='missing']", text: "never", timeoutMs: 300 },
    ],
  };

  const report = await runFlow(failingFlow, artifactsDir);

  assert.equal(report.ok, false);
  assert.equal(report.steps.length, 1);
  assert.equal(report.steps[0]?.ok, false);
  assert.ok(report.error?.includes("step 1"));
  assert.ok(report.screenshot?.startsWith(artifactsDir));
});
