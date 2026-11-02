import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserTrajectoryPage } from "../src/index";
import { fact, goal, runId, withTrajectory } from "./trajectory-fixtures";

test("pagination keeps the first watermark while new events commit", async () => {
    const events = Array.from({ length: 260 }, (_, index) => fact(index + 1));
    await withTrajectory(goal(250), { [runId]: events }, async ({ app }) => {
        const first = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1&limit=50")).json() as BrowserTrajectoryPage;
        assert.equal(first.committedThroughSequence, 250);
        assert.equal(first.committedCount, 250);
        assert.equal(first.previousCursor, null);
        assert.ok(first.nextCursor !== null);

        const seen: number[] = first.entries.map((entry) => entry.sequence);
        let cursor: string | null = first.nextCursor;

        while (cursor !== null) {
            const page = await (await app.request(
                `/api/goals/goal-1/trajectory?runId=run-1&limit=50&watermark=${first.committedThroughSequence}&cursor=${encodeURIComponent(cursor)}`,
            )).json() as BrowserTrajectoryPage;
            assert.equal(page.total, 250);
            assert.equal(page.committedCount, 250);
            seen.push(...page.entries.map((entry) => entry.sequence));
            cursor = page.nextCursor;
        }

        assert.deepEqual(seen, Array.from({ length: 250 }, (_, index) => index + 1));
        assert.equal(seen.some((sequence) => sequence > 250), false);
    });
});

test("cursor direction can move back to the previous page", async () => {
    const events = Array.from({ length: 150 }, (_, index) => fact(index + 1));
    await withTrajectory(goal(150), { [runId]: events }, async ({ app }) => {
        const first = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1&limit=50")).json() as BrowserTrajectoryPage;
        assert.ok(first.nextCursor !== null);
        const second = await (await app.request(
            `/api/goals/goal-1/trajectory?runId=run-1&limit=50&watermark=150&cursor=${encodeURIComponent(first.nextCursor)}`,
        )).json() as BrowserTrajectoryPage;
        assert.equal(second.entries[0]?.sequence, 51);
        assert.ok(second.previousCursor !== null);

        const previous = await (await app.request(
            `/api/goals/goal-1/trajectory?runId=run-1&limit=50&watermark=150&direction=backward&cursor=${encodeURIComponent(second.previousCursor)}`,
        )).json() as BrowserTrajectoryPage;
        assert.deepEqual(previous.entries.map((entry) => entry.sequence), Array.from({ length: 50 }, (_, index) => index + 1));
    });
});

test("a cursor from another watermark or filter is rejected", async () => {
    const events = Array.from({ length: 100 }, (_, index) => fact(index + 1));
    await withTrajectory(goal(100), { [runId]: events }, async ({ app }) => {
        const first = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1&limit=10")).json() as BrowserTrajectoryPage;
        assert.ok(first.nextCursor !== null);

        const wrongWatermark = await app.request(
            `/api/goals/goal-1/trajectory?runId=run-1&limit=10&watermark=99&cursor=${encodeURIComponent(first.nextCursor)}`,
        );
        assert.equal(wrongWatermark.status, 400);
        assert.deepEqual(await wrongWatermark.json(), { error: "invalid_trajectory_cursor" });

        const wrongFilter = await app.request(
            `/api/goals/goal-1/trajectory?runId=run-1&limit=10&watermark=100&category=tool&cursor=${encodeURIComponent(first.nextCursor)}`,
        );
        assert.equal(wrongFilter.status, 400);
        assert.deepEqual(await wrongFilter.json(), { error: "invalid_trajectory_cursor" });
    });
});
