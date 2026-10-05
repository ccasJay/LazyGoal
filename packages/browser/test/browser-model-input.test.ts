import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserModelInputSummary, BrowserModelInputDetail } from "../src/index";
import { Hono } from "hono";
import { createGoal } from "../../runtime/src/index";
import type { ModelInputRecord } from "../../runtime/src/model-input";
import { createBrowserModelInputRoutes, createBrowserSessionAccess } from "../src/index";

test("model inputs preserve global version comparisons across paging and search, with complete details", async () => {
    const goal = createGoal({ id: "goal-1", runId: "run-1", intent: "Inspect", promptBundleVersion: 1, memoryProtocol: { kind: "structured", version: 1 }, modelContextProtocol: { kind: "trajectory-layered", version: 1 }, contextRetrievalProtocol: { kind: "bm25-lite", version: 1 }, profile: { id: "profile", systemPrompt: "current config must not substitute historical prompt", instructions: [], toolIds: [] } });
    const calls: ModelInputRecord[] = Array.from({ length: 102 }, (_, index) => ({ goalId: goal.id, runId: "run-1", callId: `call-${index}`, stepIndex: index + 1, stage: index === 101 ? "completion_review" : "decide", occurredAt: new Date().toISOString(), messages: [{ role: "system", source: "system", content: index < 100 ? "original system" : "changed system" }, { role: "user", source: "working_context", content: index === 101 ? "x".repeat(900) + "hidden needle" : `context-${index}` }] }));
    const app = createBrowserModelInputRoutes({ restore: async () => goal }, async () => calls);
    for (let index = 0; index < calls.length; index++) calls[index] = { ...calls[index]!, messages: [...calls[index]!.messages, { source: "conversation", content: "unchanged user input", role: "user" }] };
    const first = await (await app.request("/api/goals/goal-1/model-inputs?runId=run-1")).json() as { calls: BrowserModelInputSummary[]; nextOffset: number };
    assert.equal(first.calls.length, 100); assert.equal(first.nextOffset, 100);
    assert.equal(first.calls[0]!.firstSystem, true); assert.equal(first.calls[1]!.systemChanged, false);
    assert.equal(first.calls[0]!.messages.length, 2);
    assert.equal(first.calls[1]!.messages.length, 1);
    assert.equal(first.calls[1]!.messages[0]!.preview, "context-1");
    const second = await (await app.request("/api/goals/goal-1/model-inputs?runId=run-1&offset=100")).json() as { calls: BrowserModelInputSummary[] };
    assert.equal(second.calls[0]!.systemChanged, true); assert.equal(second.calls[0]!.previousCallId, "call-99");
    const found = await (await app.request("/api/goals/goal-1/model-inputs?runId=run-1&q=hidden%20needle")).json() as { calls: BrowserModelInputSummary[] };
    assert.equal(found.calls[0]!.stage, "completion_review");
    assert.equal(found.calls.length, 1); assert.equal(found.calls[0]!.systemChanged, false); assert.equal(found.calls[0]!.messages[0]!.truncated, true);
    const detail = await (await app.request("/api/goals/goal-1/model-inputs?runId=run-1&callId=call-101")).json() as BrowserModelInputDetail;
    assert.equal(detail.call.stage, "completion_review");
    assert.equal(detail.previousSystem, "changed system"); assert.ok(detail.call.messages[1]!.content.endsWith("hidden needle"));
    assert.equal((await app.request("/api/goals/goal-1/model-inputs?runId=run-1&callId=absent")).status, 404);
    assert.equal((await app.request("/api/goals/goal-1/model-inputs?runId=other")).status, 404);
    assert.equal((await app.request("/api/goals/goal-1/model-inputs?runId=run-1&offset=-1")).status, 400);
    assert.equal((await app.request("/api/goals/goal-1/model-inputs?runId=run-1&runId=run-2")).status, 400);
});

test("model input access is denied before any private input read", async () => {
    let reads = 0;
    const access = createBrowserSessionAccess();
    access.bindOrigin("http://127.0.0.1:43127");
    const app = new Hono();
    app.use("*", access.middleware);
    app.route("/", createBrowserModelInputRoutes({ restore: async () => { reads++; return undefined; } }, async () => { reads++; return []; }));
    assert.equal((await app.request("http://127.0.0.1:43127/api/goals/goal-1/model-inputs?runId=run-1", { headers: { host: "127.0.0.1:43127" } })).status, 401);
    assert.equal(reads, 0);
});
