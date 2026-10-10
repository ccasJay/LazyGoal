import assert from "node:assert/strict";
import test from "node:test";
import { displayStepBySequence } from "../src/trajectory-display-step";

test("unscoped program calls follow the visible Step until the next Step", () => {
  const steps = displayStepBySequence([
    { sequence: 1, eventType: "run_started" },
    { sequence: 5, eventType: "model_repair_attempt_started", stepIndex: 1 },
    { sequence: 10, eventType: "decision_received" },
    { sequence: 12, eventType: "model_repair_attempt_started", stepIndex: 2 },
    { sequence: 19, eventType: "tool_started" },
    { sequence: 27, eventType: "tool_started" },
    { sequence: 51, eventType: "model_repair_attempt_started", stepIndex: 3 },
    { sequence: 208, eventType: "run_completed" },
    { sequence: 209, eventType: "context_epoch_closed" },
  ]);
  assert.deepEqual([...steps], [[5, 1], [10, 1], [12, 2], [19, 2], [27, 2], [51, 3]]);
});

test("a page without a visible Step start leaves earlier events ungrouped", () => {
  assert.deepEqual([...displayStepBySequence([
    { sequence: 102, eventType: "tool_started" },
    { sequence: 115, eventType: "model_repair_attempt_started", stepIndex: 4 },
  ])], [[115, 4]]);
});
