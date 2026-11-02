import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { TrajectoryEventDraft, TrajectoryQueryContext } from "../../runtime/src/index";
import { JsonFileTrajectoryStore } from "../src/index";

const goalId = "goal-query";
const runId = "run-query";

const context = (committedThroughSequence: number): TrajectoryQueryContext => ({
    goalId,
    runId,
    committedThroughSequence,
});

function runStarted(): TrajectoryEventDraft {
    return { goalId, runId, phase: "executing", eventType: "run_started", payload: { type: "run_started" } };
}

function runWaiting(): TrajectoryEventDraft {
    return { goalId, runId, phase: "executing", eventType: "run_waiting", payload: { type: "run_waiting", reason: "wait" } };
}

function toolStarted(actionId: string, executionUnitId?: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", actionId,
        ...(executionUnitId === undefined ? {} : { executionUnitId }),
        eventType: "tool_started",
        payload: { type: "tool_started", actionId, toolId: "read_file", input: { path: `${actionId}.txt` } },
    };
}

function toolFinished(actionId: string, executionUnitId?: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", actionId,
        ...(executionUnitId === undefined ? {} : { executionUnitId }),
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId,
            toolId: "read_file",
            observation: { kind: "success", output: { stdout: "done" }, summary: "done" },
        },
    };
}

function observation(actionId: string, executionUnitId?: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", actionId,
        ...(executionUnitId === undefined ? {} : { executionUnitId }),
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId,
            observation: { kind: "success", output: { stdout: "done" }, summary: "done" },
        },
    };
}

async function appendMany(store: JsonFileTrajectoryStore, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) await store.append(runStarted());
}

test("queries never expose events above the fixed watermark", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-query-watermark-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await appendMany(store, 5);
        const page = await store.queryPage(context(3), { limit: 10 });

        assert.deepEqual(page.entries.map((entry) => entry.sequence), [1, 2, 3]);
        assert.equal(page.total, 3);
        assert.equal(page.committedCount, 3);
        assert.equal(page.committedThroughSequence, 3);
        assert.equal(page.previousCursor, null);
        assert.equal(page.nextCursor, null);
        assert.equal(await store.queryPage(context(0), { limit: 10 }).then((result) => result.entries.length), 0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("pagination stays on one watermark while new events commit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-query-pagination-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await appendMany(store, 250);
        const first = await store.queryPage(context(250), { limit: 50 });
        assert.deepEqual(first.entries.map((entry) => entry.sequence), Array.from({ length: 50 }, (_, index) => index + 1));
        assert.equal(first.previousCursor, null);
        assert.ok(first.nextCursor !== null);

        await appendMany(store, 10);

        const seen: number[] = [...first.entries.map((entry) => entry.sequence)];
        let cursor: string | null = first.nextCursor;

        while (cursor !== null) {
            const page = await store.queryPage(context(250), { limit: 50, cursor });
            assert.equal(page.total, 250);
            assert.equal(page.committedCount, 250);
            seen.push(...page.entries.map((entry) => entry.sequence));
            cursor = page.nextCursor;
        }

        assert.deepEqual(seen, Array.from({ length: 250 }, (_, index) => index + 1));
        assert.equal(seen.some((sequence) => sequence > 250), false);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a cursor from another watermark or filter is rejected", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-query-cursor-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await appendMany(store, 60);
        const page = await store.queryPage(context(60), { limit: 10 });
        assert.ok(page.nextCursor !== null);

        await assert.rejects(
            store.queryPage(context(59), { limit: 10, cursor: page.nextCursor }),
            (error: unknown) => error instanceof Error && /cursor does not match/.test(error.message),
        );
        await assert.rejects(
            store.queryPage(context(60), { limit: 10, cursor: page.nextCursor, category: "tool" }),
            (error: unknown) => error instanceof Error && /cursor does not match/.test(error.message),
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("category, action and execution unit filters only return explicit matches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-query-filters-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await store.append(toolStarted("action-1", "unit-a"));
        await store.append(observation("action-1", "unit-a"));
        await store.append(toolStarted("action-2", "unit-b"));
        await store.append(runWaiting());

        assert.deepEqual(
            (await store.queryPage(context(5), { limit: 10, category: "tool" })).entries.map((entry) => entry.sequence),
            [2, 4],
        );
        assert.deepEqual(
            (await store.queryPage(context(5), { limit: 10, actionId: "action-1" })).entries.map((entry) => entry.sequence),
            [2, 3],
        );
        assert.deepEqual(
            (await store.queryPage(context(5), { limit: 10, executionUnitId: "unit-a" })).entries.map((entry) => entry.sequence),
            [2, 3],
        );
        assert.equal(
            (await store.queryPage(context(5), { limit: 10, executionUnitId: "unit-a" })).locatedSequence,
            2,
        );
        assert.equal((await store.queryPage(context(5), { limit: 10 })).locatedSequence, null);
        assert.equal(
            (await store.queryPage(context(1), { limit: 10, executionUnitId: "unit-a" })).locatedSequence,
            null,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("execution unit lookup separates owned events from context events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-query-unit-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await store.append(toolStarted("action-1", "unit-a"));
        await store.append(toolFinished("action-1", "unit-a"));
        await store.append(runWaiting());
        await store.append(toolStarted("action-2", "unit-b"));
        await store.append(runStarted());

        assert.equal(await store.locateExecutionUnit(context(6), "unit-a"), 2);
        assert.equal(await store.locateExecutionUnit(context(6), "unit-missing"), undefined);

        const page = await store.queryExecutionUnitPage(context(6), "unit-a", { limit: 10 });
        assert.deepEqual(page.entries.map((entry) => entry.sequence), [2, 3]);
        assert.equal(page.total, 2);
        assert.deepEqual(page.contextBefore.map((entry) => entry.sequence), [1]);
        assert.deepEqual(page.contextAfter.map((entry) => entry.sequence), [4, 5, 6]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("detail resolves action relations, timing and blob payloads within the watermark", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-query-detail-"));
    try {
        const store = new JsonFileTrajectoryStore(directory, {}, { blobThresholdBytes: 1 });
        await store.append(toolStarted("action-1", "unit-a"));
        await store.append(toolFinished("action-1", "unit-a"));
        await store.append(observation("action-1", "unit-a"));

        const detail = await store.readDetail(context(3), 1);
        assert.ok(detail !== undefined);
        assert.deepEqual(detail.related, { toolStarted: 1, toolFinished: 2, observation: 3 });
        assert.deepEqual(detail.input, { path: "action-1.txt" });
        assert.equal(detail.observationConfirmed, true);
        assert.equal(detail.observation?.kind, "success");
        assert.ok(detail.toolDurationMs !== null && detail.toolDurationMs >= 0);
        assert.ok(detail.payloadRef !== undefined);
        assert.ok(detail.payloadBytes > 0);
        assert.equal(detail.correlation.actionId, "action-1");

        const partial = await store.readDetail(context(2), 1);
        assert.ok(partial !== undefined);
        assert.equal(partial.related.observation, undefined);
        assert.equal(partial.observationConfirmed, false);
        assert.equal(partial.observation?.kind, "success");

        assert.equal(await store.readDetail(context(2), 3), undefined);
        assert.equal(JSON.parse((await store.readPayload(context(3), 1))!).input.path, "action-1.txt");
        assert.equal(await store.readPayload(context(2), 3), undefined);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("timeline aggregates sequence buckets without materializing events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-query-timeline-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await appendMany(store, 250);

        const timeline = await store.queryTimeline(context(250), 100);
        assert.equal(timeline.eventCount, 250);
        assert.ok(timeline.timeRange !== null);
        assert.deepEqual(timeline.buckets.map((bucket) => [bucket.startSequence, bucket.endSequence, bucket.eventCount]), [
            [1, 100, 100],
            [101, 200, 100],
            [201, 250, 50],
        ]);
        assert.equal(timeline.buckets[0]?.eventTypes.run_started, 100);

        const partial = await store.queryTimeline(context(150), 100);
        assert.equal(partial.eventCount, 150);
        assert.deepEqual(partial.buckets.map((bucket) => bucket.eventCount), [100, 50]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
