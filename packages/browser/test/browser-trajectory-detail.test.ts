import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BrowserTrajectoryDetail, BrowserTrajectoryPage } from "../src/index";
import { createBrowserTrajectoryRoutes } from "../src/index";
import { JsonFileTrajectoryStore } from "../../storage/src/index";
import { browserTrajectoryDetailBinding } from "../../web-contracts/src/index";
import { fact, goal, goalId, runId, withTrajectory } from "./trajectory-fixtures";

const metadata = { goalId, runId, phase: "executing" as const, executionUnitId: "unit-1", stepIndex: 1 };

test("details associate Action facts across pages and never treat tool_finished as a confirmed observation", async () => {
    const started = { ...fact(1, { ...metadata, actionId: "action-1", eventType: "tool_started", payload: { type: "tool_started", actionId: "action-1", toolId: "read_file", input: { path: "example.txt" } } }), occurredAt: "2026-09-30T00:00:00Z" };
    const finished = { ...fact(150, { ...metadata, actionId: "action-1", eventType: "tool_finished", payload: { type: "tool_finished", actionId: "action-1", toolId: "read_file", observation: { kind: "success", output: "recorded output", summary: "read" } } }), occurredAt: "2026-09-30T00:00:02Z" };
    const observed = fact(152, { ...metadata, actionId: "action-1", eventType: "observation_recorded", payload: { type: "observation_recorded", actionId: "action-1", observation: { kind: "success", output: "confirmed output", summary: "read" } } });

    await withTrajectory(goal(152), { [runId]: [started, finished, observed] }, async ({ app }) => {
        const detail = await (await app.request("/api/goals/goal-1/trajectory/events/1?runId=run-1")).json() as BrowserTrajectoryDetail;
        const parsed = browserTrajectoryDetailBinding.read(detail, "strip");
        assert.equal(parsed.ok, true, JSON.stringify(parsed));
        assert.deepEqual(detail.input, { path: "example.txt" });
        assert.deepEqual(detail.related, { toolStarted: 1, toolFinished: 150, observation: 152 });
        assert.equal(detail.toolDurationMs, 2000);
        assert.equal(detail.observationConfirmed, true);
        assert.equal((detail.result as { output: unknown }).output, "confirmed output");
        assert.equal(detail.committedThroughSequence, 152);
        assert.equal(detail.correlation.actionId, "action-1");

        const partial = await (await app.request("/api/goals/goal-1/trajectory/events/150?runId=run-1&watermark=150")).json() as BrowserTrajectoryDetail;
        assert.equal(partial.observationConfirmed, false);
        assert.equal(partial.related.observation, undefined);
        assert.equal((partial.result as { output: unknown }).output, "recorded output");
        assert.equal(partial.toolDurationMs, 2000);

        assert.equal((await app.request("/api/goals/goal-1/trajectory/events/152?runId=run-1&watermark=150")).status, 404);
        assert.equal((await app.request("/api/goals/goal-1/trajectory/events/1?runId=run-1&watermark=153")).status, 400);
    });
});

test("accepted output links to its preceding stage frame without borrowing another unit's prompt", async () => {
    const frame = fact(1, { ...metadata, executionUnitId: "unit", eventType: "model_context_frame", payload: { type: "model_context_frame", stage: "think", epochNumber: 0, conversationPosition: 1, sections: [], modelCallId: "saved-call" } });
    const output = fact(2, { ...metadata, executionUnitId: "unit", eventType: "think_completed", payload: { type: "think_completed", requestId: "think-1", stepOrdinal: 1, goal: "Inspect", output: "Evidence found" } });
    const other = { ...output, eventId: "other", sequence: 3, executionUnitId: "other-unit" };

    await withTrajectory(goal(3), { [runId]: [frame, output, other] }, async ({ app }) => {
        const page = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1")).json() as BrowserTrajectoryPage;
        assert.equal(page.entries[1]?.modelCallId, "saved-call");
        assert.equal(page.entries[2]?.modelCallId, undefined);

        const detail = await (await app.request("/api/goals/goal-1/trajectory/events/2?runId=run-1")).json() as BrowserTrajectoryDetail;
        assert.equal(detail.correlation.modelCallId, "saved-call");
    });
});

test("oversized details are rejected while the payload endpoint returns the recorded JSON", async () => {
    const summary = "x".repeat(300_000) + "tail";
    const event = fact(1, { goalId, runId, phase: "executing", eventType: "run_completed", payload: { type: "run_completed", summary } });
    await withTrajectory(goal(1), { [runId]: [event] }, async ({ app }) => {
        const page = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1")).json() as BrowserTrajectoryPage;
        assert.equal(page.total, 1);
        assert.equal(page.entries[0]?.previewTruncated, true);
        assert.equal(page.entries[0]?.preview.length, 800);

        const detail = await app.request("/api/goals/goal-1/trajectory/events/1?runId=run-1");
        assert.equal(detail.status, 413);
        assert.deepEqual(await detail.json(), { error: "trajectory_detail_too_large", maximumBytes: 256 * 1024 });

        const payload = await app.request("/api/goals/goal-1/trajectory/events/1/payload?runId=run-1");
        assert.equal(payload.status, 200);
        assert.equal((await payload.json() as { summary: string }).summary, summary);
    });
});

test("externalized payloads expose a reference and remain readable through the payload route", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-trajectory-blob-"));
    try {
        const store = new JsonFileTrajectoryStore(directory, {}, { blobThresholdBytes: 1 });
        await store.append({
            goalId,
            runId,
            phase: "executing",
            eventType: "goal_created",
            payload: { type: "goal_created", intent: "y".repeat(1024) },
        });
        const app = createBrowserTrajectoryRoutes({ restore: async () => goal(1) }, store);
        const detail = await (await app.request("/api/goals/goal-1/trajectory/events/1?runId=run-1")).json() as BrowserTrajectoryDetail;

        assert.ok(detail.payloadRef !== undefined);
        assert.equal(detail.payloadRef.encoding, "canonical-json");
        assert.ok(detail.payloadBytes > 1000);
        const payload = await app.request("/api/goals/goal-1/trajectory/events/1/payload?runId=run-1");
        assert.equal(payload.status, 200);
        assert.equal((await payload.json() as { intent: string }).intent, "y".repeat(1024));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
