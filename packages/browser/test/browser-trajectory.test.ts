import assert from "node:assert/strict";
import { test } from "node:test";
import { request as httpRequest } from "node:http";
import { performance } from "node:perf_hooks";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBrowserSessionAccess, createBrowserTrajectoryRoutes } from "../src/index";
import type { BrowserExecutionUnitPage, BrowserTrajectoryPage, BrowserTrajectoryTimeline } from "../src/index";
import { createHttpService } from "../../http/src/index";
import { JsonFileTrajectoryStore } from "../../storage/src/index";
import { encodePathSegment } from "../../storage/src/path-segment";
import { fact, goal, goalId, runId, withTrajectory, writeTrajectory } from "./trajectory-fixtures";

test("trajectory labels the initial model call separately from an output retry", async () => {
    const attempts = [1, 2].map((attempt) => fact(attempt, {
        goalId, runId, phase: "executing", executionUnitId: "unit-1", stepIndex: 1,
        eventType: "model_repair_attempt_started",
        payload: { type: "model_repair_attempt_started", stage: "decide", attempt, inputBoundary: `sha256:${"a".repeat(64)}` },
    }));
    await withTrajectory(goal(2), { [runId]: attempts }, async ({ app }) => {
        const page = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1")).json() as BrowserTrajectoryPage;
        assert.equal(page.committedThroughSequence, 2);
        assert.deepEqual(page.entries.map((entry) => entry.preview), ["decide, Model request 1", "decide, Output retry 2"]);
    });
});

test("trajectory audit links an internal tool call to its parent program", async () => {
    const start = fact(1, {
        goalId, runId, phase: "executing", executionUnitId: "parent-unit", actionId: "parent-action",
        eventType: "program_started",
        payload: {
            type: "program_started", programId: "program-1", parentActionId: "parent-action",
            codeHash: "code-hash", workerHash: "worker-hash", nodeVersion: "v22",
        },
    });
    const child = fact(2, {
        goalId, runId, phase: "executing", executionUnitId: "child-unit",
        actionId: "child-action", programId: "program-1", callIndex: 0,
        eventType: "tool_started",
        payload: { type: "tool_started", actionId: "child-action", toolId: "read_file", input: { path: "README.md" } },
    });
    await withTrajectory(goal(2), { [runId]: [start, child] }, async ({ app }) => {
        const page = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1")).json() as BrowserTrajectoryPage;
        assert.equal(page.entries[1]?.programId, "program-1");
        assert.equal(page.entries[1]?.callIndex, 0);
        assert.equal(page.entries[1]?.parentActionId, "parent-action");
    });
});

test("Run directory includes old Runs beyond Activity limits and applies their independent commit boundaries", async () => {
    const base = goal();
    const value = {
        ...base,
        state: {
            ...base.state,
            completedRuns: Array.from({ length: 120 }, (_, index) => ({
                runId: `old-${index}`,
                status: "failed" as const,
                stepCount: 1,
                committedThroughSequence: 2,
                messageRange: { start: 0, end: 0 },
            })),
        },
    };
    const oldEvents = [1, 2, 3].map((sequence) => fact(sequence, {
        goalId, runId: "old-0", phase: "executing", eventType: "run_started", payload: { type: "run_started" },
    }));
    await withTrajectory(value, {
        [runId]: [1, 2, 3].map((sequence) => fact(sequence)),
        "old-0": oldEvents,
    }, async ({ app }) => {
        const first = await (await app.request("/api/goals/goal-1/trajectory/runs")).json() as { runs: { runId: string }[]; nextOffset: number };
        assert.equal(first.runs.length, 100);
        assert.equal(first.runs[0]?.runId, "run-1");
        assert.equal(first.nextOffset, 100);
        const next = await (await app.request("/api/goals/goal-1/trajectory/runs?offset=100")).json() as { runs: { runId: string }[]; nextOffset: null };
        assert.equal(next.runs.length, 21);
        assert.equal(next.runs.at(-1)?.runId, "old-0");
        assert.equal(next.nextOffset, null);
        const page = await (await app.request("/api/goals/goal-1/trajectory?runId=old-0")).json() as BrowserTrajectoryPage;
        assert.equal(page.run.status, "failed");
        assert.equal(page.run.current, false);
        assert.deepEqual(page.entries.map((entry) => entry.sequence), [1, 2]);
        assert.equal((await app.request("/api/goals/goal-1/trajectory/events/3?runId=old-0")).status, 404);
    });
});

test("trajectory query rejects malformed wire input and distinguishes missing data from read failures", async () => {
    const events = Array.from({ length: 510 }, (_, index) => fact(index + 1));
    await withTrajectory(goal(500), { [runId]: events }, async ({ app }) => {
        for (const suffix of [
            "runId=run-1&runId=run-2",
            "runId=run-1&after=1",
            "runId=run-1&q=run_started",
            "runId=run-1&unknown=1",
            "runId=run-1&category=invalid",
            "runId=run-1&limit=0",
            "runId=run-1&limit=201",
            "runId=run-1&direction=sideways",
            "runId=run-1&cursor=abc",
            "runId=run-1&watermark=501",
            "runId=run-1&fromSequence=8&toSequence=2",
        ]) {
            assert.equal((await app.request(`/api/goals/goal-1/trajectory?${suffix}`)).status, 400, suffix);
        }
        assert.equal((await app.request("/api/goals/missing/trajectory?runId=run-1")).status, 404);
        assert.equal((await app.request("/api/goals/goal-1/trajectory?runId=missing")).status, 404);
        assert.equal((await app.request("/api/goals/goal-1/trajectory/events/501?runId=run-1")).status, 404);
        const locate = await (await app.request("/api/goals/goal-1/trajectory/units/unit-501/locate?runId=run-1")).json() as { sequence: number | null };
        assert.equal(locate.sequence, null);
    });

    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-trajectory-failure-"));
    try {
        await writeTrajectory(directory, { [runId]: [] });
        await writeFile(
            join(directory, encodePathSegment(goalId), "runs", encodePathSegment(runId), "trajectory.jsonl"),
            "{not-json}\n",
            "utf8",
        );
        const store = new JsonFileTrajectoryStore(directory);
        const app = createBrowserTrajectoryRoutesForFailure(store);
        const failure = await app.request("/api/goals/goal-1/trajectory?runId=run-1");
        assert.equal(failure.status, 500);
        assert.deepEqual(await failure.json(), { error: "trajectory_read_failed" });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("trajectory endpoints enforce Host, origin, and capability before any storage read", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-trajectory-access-"));
    const access = createBrowserSessionAccess();
    let reads = 0;
    const service = createHttpService({ middleware: access.middleware });
    try {
        const store = new JsonFileTrajectoryStore(directory);
        service.mount("/", createBrowserTrajectoryRoutesCountingReads(() => { reads += 1; }, store));
        const address = await service.start(0);
        access.bindOrigin(address.origin);
        const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);

        for (const path of ["trajectory/runs", "trajectory?runId=run-1", "trajectory/events/1?runId=run-1"]) {
            const url = `${address.origin}/api/goals/goal-1/${path}`;
            assert.equal((await fetch(url)).status, 401);
            assert.equal((await fetch(url, { headers: { authorization: `Bearer ${token}`, origin: "https://external.example" } })).status, 403);
            const wrongHostStatus = await new Promise<number>((resolve, reject) => {
                const request = httpRequest(url, { headers: { authorization: `Bearer ${token}`, host: "localhost:1" } }, (response) => {
                    response.resume();
                    response.on("end", () => resolve(response.statusCode ?? 0));
                });
                request.on("error", reject);
                request.end();
            });
            assert.equal(wrongHostStatus, 403);
        }
        assert.equal(reads, 0);
        assert.equal((await fetch(`${address.origin}/api/goals/goal-1/trajectory/runs`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
        assert.equal(reads, 1);
    } finally {
        await service.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("long trajectory pages forward and backward without loading the whole Run payload", async () => {
    const value = goal(10_000);
    const events = Array.from({ length: 10_000 }, (_, index) => fact(index + 1));
    await withTrajectory(value, { [runId]: events }, async ({ app }) => {
        const start = performance.now();
        const forward = await app.request("/api/goals/goal-1/trajectory?runId=run-1&watermark=10000&limit=100");
        const forwardText = await forward.text();
        const page = JSON.parse(forwardText) as BrowserTrajectoryPage;
        assert.equal(page.entries.length, 100);
        assert.equal(page.total, 10_000);
        assert.equal(page.committedThroughSequence, 10_000);
        assert.deepEqual(page.entries[0]?.sequence, 1);
        assert.ok(Buffer.byteLength(forwardText) < 512 * 1024);

        const backward = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1&watermark=10000&direction=backward&limit=100")).json() as BrowserTrajectoryPage;
        assert.equal(backward.entries.length, 100);
        assert.equal(backward.entries[0]?.sequence, 9_901);
        assert.equal(backward.entries.at(-1)?.sequence, 10_000);
        assert.equal(backward.nextCursor, null);
        assert.ok(backward.previousCursor !== null);
        console.info(`10,000-event forward page: ${(performance.now() - start).toFixed(1)} ms`);
    });
});

test("execution unit and timeline routes expose explicit boundaries", async () => {
    const events = [
        fact(1),
        fact(2, { goalId, runId, phase: "executing", executionUnitId: "unit-a", actionId: "action-1", eventType: "tool_started", payload: { type: "tool_started", actionId: "action-1", toolId: "read_file", input: { path: "a.txt" } } }),
        fact(3, { goalId, runId, phase: "executing", executionUnitId: "unit-a", actionId: "action-1", eventType: "tool_finished", payload: { type: "tool_finished", actionId: "action-1", toolId: "read_file", observation: { kind: "success", output: { stdout: "done" }, summary: "done" } } }),
        fact(4, { goalId, runId, phase: "executing", eventType: "run_waiting", payload: { type: "run_waiting", reason: "wait" } }),
        fact(5, { goalId, runId, phase: "executing", executionUnitId: "unit-b", actionId: "action-2", eventType: "tool_started", payload: { type: "tool_started", actionId: "action-2", toolId: "read_file", input: { path: "b.txt" } } }),
        fact(6),
    ];
    await withTrajectory(goal(6), { [runId]: events }, async ({ app }) => {
        const locate = await (await app.request("/api/goals/goal-1/trajectory/units/unit-a/locate?runId=run-1")).json() as { sequence: number | null };
        assert.equal(locate.sequence, 2);

        const unit = await (await app.request("/api/goals/goal-1/trajectory/units/unit-a?runId=run-1")).json() as BrowserExecutionUnitPage;
        assert.deepEqual(unit.entries.map((entry) => entry.sequence), [2, 3]);
        assert.deepEqual(unit.contextBefore.map((entry) => entry.sequence), [1]);
        assert.deepEqual(unit.contextAfter.map((entry) => entry.sequence), [4, 5, 6]);

        const timeline = await (await app.request("/api/goals/goal-1/trajectory/timeline?runId=run-1&bucketSize=2")).json() as BrowserTrajectoryTimeline;
        assert.equal(timeline.eventCount, 6);
        assert.deepEqual(timeline.buckets.map((bucket) => [bucket.startSequence, bucket.endSequence, bucket.eventCount]), [
            [1, 2, 2],
            [3, 4, 2],
            [5, 6, 2],
        ]);
        assert.deepEqual(timeline.buckets[0]?.eventTypes, [{ eventType: "run_started", count: 1 }, { eventType: "tool_started", count: 1 }]);
    });
});

function createBrowserTrajectoryRoutesForFailure(store: JsonFileTrajectoryStore) {
    const value = goal(1);
    return createBrowserTrajectoryRoutes({ restore: async () => value }, store);
}

function createBrowserTrajectoryRoutesCountingReads(onRead: () => void, store: JsonFileTrajectoryStore) {
    const value = goal();
    return createBrowserTrajectoryRoutes({ restore: async () => { onRead(); return value; } }, store);
}
