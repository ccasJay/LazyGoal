import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserControlReceipt, BrowserModelSelectionResult } from "../../../packages/web-contracts/src/index";
import { modelSelectionOutcomeOf } from "../src/control/model-selection";

const accepted = (result: BrowserModelSelectionResult): BrowserControlReceipt => ({
  intentId: "model-intent-1",
  status: "accepted",
  result: { kind: "model_selection", result },
});

test("模型选择与默认偏好分别报告子结果", () => {
  assert.deepEqual(modelSelectionOutcomeOf(accepted({
    ok: true,
    goalId: "goal-1",
    runId: "run-1",
    selection: { modelId: "model-2" },
    defaultPreference: { ok: true },
  })), { kind: "applied", modelId: "model-2", preference: "saved" });

  assert.deepEqual(modelSelectionOutcomeOf(accepted({
    ok: true,
    goalId: "goal-1",
    runId: "run-1",
    selection: { modelId: "model-2" },
    defaultPreference: { ok: false, error: "model_preference_save_failed" },
  })), { kind: "applied", modelId: "model-2", preference: "failed" });

  assert.deepEqual(modelSelectionOutcomeOf(accepted({
    ok: true,
    goalId: "goal-1",
    runId: "run-1",
    selection: { modelId: "model-2" },
  })), { kind: "applied", modelId: "model-2", preference: "not_requested" });
});

test("拒绝与未知收据不被显示为已切换", () => {
  assert.deepEqual(modelSelectionOutcomeOf({
    intentId: "model-intent-2",
    status: "rejected",
    error: "model_switch_not_allowed",
    refresh: true,
  }), { kind: "rejected", error: "model_switch_not_allowed", refresh: true });

  assert.deepEqual(modelSelectionOutcomeOf({ intentId: "model-intent-3", status: "unknown" }), { kind: "unknown" });
});
