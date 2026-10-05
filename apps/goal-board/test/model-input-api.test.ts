import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelInputRecord } from "../../../packages/runtime/src/model-input";

test("browser model input wire boundary accepts completion review lists and details", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "#test-access" } } });
  try {
    const { browserApi } = await import("../src/api");
    const call: ModelInputRecord = { goalId: "goal", runId: "run", callId: "review-call", stage: "completion_review", stepIndex: 1,
      occurredAt: new Date().toISOString(), messages: [{ role: "system", source: "system", content: "Review the candidate" }] };
    const summary = { ...call, messages: [], systemVersion: "hash", firstSystem: true, systemChanged: false, previousCallId: null, omittedMessageCount: 0 };
    const detail = { call, previousSystem: null, previousCallId: null, systemVersion: "hash" };
    t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.includes("callId=") ? detail : { calls: [summary], total: 1, nextOffset: null }));
    assert.deepEqual((await browserApi.modelInputs("goal", "run")).calls, [summary]);
    assert.deepEqual(await browserApi.modelInput("goal", "run", "review-call"), detail);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
