import assert from "node:assert/strict";
import { test } from "node:test";
import { request as httpRequest } from "node:http";
import { performance } from "node:perf_hooks";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateImmutableEvent, createGoal } from "../../runtime/src/index";
import type { Goal, TrajectoryEvent, TrajectoryEventDraft } from "../../runtime/src/index";
import { createBrowserTrajectoryRoutes, createBrowserSessionAccess } from "../src/index";
import type { BrowserTrajectoryPage, BrowserTrajectoryDetail } from "../src/index";
import { createHttpService } from "../../http/src/index";
import { JsonFileTrajectoryStore } from "../../storage/src/index";

function goal(boundary = 500): Goal {
    const value = createGoal({ id: "goal-1", intent: "Inspect trajectory", runId: "run-1", promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 }, modelContextProtocol: { kind: "trajectory-layered", version: 1 }, contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile: { id: "private-profile", systemPrompt: "private-system", instructions: [], toolIds: [] } });
    return { ...value, state: { ...value.state, run: { ...value.state.run, committedThroughSequence: boundary } } };
}
function fact(sequence: number, draft?: TrajectoryEventDraft): TrajectoryEvent {
    return allocateImmutableEvent(draft ?? { goalId: "goal-1", runId: "run-1", phase: "executing", executionUnitId: `unit-${sequence}`, stepIndex: sequence,
        eventType: "run_started", payload: { type: "run_started" } }, sequence);
}
function routes(value = goal(), events: readonly TrajectoryEvent[] = Array.from({ length: 510 }, (_, index) => fact(index + 1))) {
    return createBrowserTrajectoryRoutes({ restore: async id => id === value.id ? value : undefined }, async () => ({ committed: events, uncommittedTail: [] }));
}

test("trajectory pages search and locate the entire committed Run while excluding tail", async () => {
    const app = routes();
    const url = "/api/goals/goal-1/trajectory?runId=run-1";
    const first = await (await app.request(url)).json() as BrowserTrajectoryPage;
    assert.equal(first.entries.length, 100); assert.equal(first.total, 500); assert.equal(first.nextCursor, 100);
    const next = await (await app.request(`${url}&after=100`)).json() as BrowserTrajectoryPage;
    assert.deepEqual(next.entries.map((event: { sequence: number }) => event.sequence), Array.from({ length: 100 }, (_, i) => 101 + i));
    const previous = await (await app.request(`${url}&before=101`)).json() as BrowserTrajectoryPage;
    assert.equal(previous.entries.at(-1)!.sequence, 100);
    const short = await (await app.request(`${url}&before=25`)).json() as BrowserTrajectoryPage;
    assert.equal(short.entries.length, 24); assert.equal(short.entries.at(-1)!.sequence, 24);
    const located = await (await app.request(`${url}&executionUnitId=unit-401`)).json() as BrowserTrajectoryPage;
    assert.equal(located.locatedSequence, 401); assert.equal(located.entries[0]!.sequence, 401);
    const tail = await app.request(`${url}&executionUnitId=unit-501`); assert.equal(tail.status, 404);
    assert.equal((await app.request("/api/goals/goal-1/trajectory/events/501?runId=run-1")).status, 404);
    const filtered = await (await app.request(`${url}&q=run_started&fromSequence=450&toSequence=500`)).json() as BrowserTrajectoryPage;
    assert.equal(filtered.total, 51); assert.equal(filtered.entries[0]!.sequence, 450);
    const empty = await (await app.request(`${url}&q=missing`)).json() as BrowserTrajectoryPage; assert.equal(empty.total, 0); assert.equal(empty.committedCount, 500);
});

test("full payload search crosses summary limits; Raw rejects oversized details without truncation", async () => {
    const value = goal(1);
    const event = fact(1, { goalId: "goal-1", runId: "run-1", phase: "executing", eventType: "run_completed", payload: { type: "run_completed", summary: "x".repeat(300_000) + "search-end" } });
    const app = routes(value, [event]);
    const page = await (await app.request("/api/goals/goal-1/trajectory?runId=run-1&q=search-end")).json() as BrowserTrajectoryPage;
    assert.equal(page.total, 1); assert.equal(page.entries[0]!.previewTruncated, true); assert.equal(page.entries[0]!.preview.length, 800);
    const detail = await app.request("/api/goals/goal-1/trajectory/events/1?runId=run-1");
    assert.equal(detail.status, 413); assert.equal((await detail.json() as {error: string}).error, "trajectory_detail_too_large");
});

test("Run directory includes old Runs beyond Activity limits and applies their independent commit boundaries", async () => {
    const value = goal();
    const historical: Goal = { ...value, state: { ...value.state, completedRuns: Array.from({ length: 120 }, (_, index) => ({
        runId: `old-${index}`, status: "failed" as const, stepCount: 1, committedThroughSequence: 2, messageRange: { start: 0, end: 0 },
    })) } };
    const app = createBrowserTrajectoryRoutes({ restore: async () => historical }, async query => ({
        committed: [1, 2, 3].map(sequence => fact(sequence, { goalId: "goal-1", runId: query.runId, phase: "executing", eventType: "run_started", payload: { type: "run_started" } })), uncommittedTail: [],
    }));
    const first = await (await app.request("/api/goals/goal-1/trajectory/runs")).json() as { runs: {runId: string}[]; nextOffset: number };
    assert.equal(first.runs.length, 100); assert.equal(first.runs[0]?.runId, "run-1"); assert.equal(first.nextOffset, 100);
    const next = await (await app.request("/api/goals/goal-1/trajectory/runs?offset=100")).json() as { runs: {runId: string}[]; nextOffset: null };
    assert.equal(next.runs.length, 21); assert.equal(next.runs.at(-1)?.runId, "old-0"); assert.equal(next.nextOffset, null);
    const page = await (await app.request("/api/goals/goal-1/trajectory?runId=old-0")).json() as BrowserTrajectoryPage;
    assert.equal(page.run.status, "failed"); assert.equal(page.run.current, false); assert.deepEqual(page.entries.map(event => event.sequence), [1, 2]);
    assert.equal((await app.request("/api/goals/goal-1/trajectory/events/3?runId=old-0")).status, 404);
});

test("details associate Action facts across pages and never treat tool_finished as a confirmed observation", async () => {
    const metadata = { goalId: "goal-1", runId: "run-1", phase: "executing" as const, executionUnitId: "unit-1", stepIndex: 1 };
    const started = { ...fact(1, { ...metadata, actionId: "action-1", eventType: "tool_started", payload: { type: "tool_started", actionId: "action-1", toolId: "read_file", input: { path: "example.txt" } } }), occurredAt: "2026-09-30T00:00:00Z" };
    const finished = { ...fact(150, { ...metadata, actionId: "action-1", eventType: "tool_finished", payload: { type: "tool_finished", actionId: "action-1", toolId: "read_file", observation: { kind: "success", output: "recorded output", summary: "read" } } }), occurredAt: "2026-09-30T00:00:02Z" };
    const unrelated = fact(151, { ...metadata, actionId: "action-2", eventType: "observation_recorded", payload: { type: "observation_recorded", actionId: "action-2", observation: { kind: "success", output: "other output", summary: "other" } } });
    const app = routes(goal(), [started, finished, unrelated]);
    const result = await (await app.request("/api/goals/goal-1/trajectory/events/150?runId=run-1")).json() as BrowserTrajectoryDetail;
    assert.deepEqual(result.input, { path: "example.txt" }); assert.equal(result.toolDurationMs, 2000);
    assert.equal(result.observationConfirmed, false); assert.equal(result.result, undefined); assert.deepEqual(result.event, finished);
    const observed = fact(152, { ...metadata, actionId: "action-1", eventType: "observation_recorded", payload: { type: "observation_recorded", actionId: "action-1", observation: { kind: "success", output: "confirmed output", summary: "read" } } });
    const confirmed = await (await routes(goal(), [started, finished, observed]).request("/api/goals/goal-1/trajectory/events/1?runId=run-1")).json() as BrowserTrajectoryDetail;
    assert.equal(confirmed.observationConfirmed, true); assert.equal((confirmed.result as {output: unknown}).output, "confirmed output");
    const invalidTiming = await (await routes(goal(), [started, { ...finished, occurredAt: "invalid" }]).request("/api/goals/goal-1/trajectory/events/1?runId=run-1")).json() as BrowserTrajectoryDetail;
    assert.equal(invalidTiming.toolDurationMs, null);
});

test("trajectory query rejects malformed wire input and distinguishes missing data from read failures", async () => {
    const app = routes();
    for (const suffix of ["runId=run-1&runId=run-2", "runId=run-1&after=-1", "runId=run-1&after=1.2", "runId=run-1&after=1&before=2", "runId=run-1&unknown=1", "runId=run-1&category=invalid", "runId=run-1&executionUnitId=unit-1&q=other", "runId=run-1&fromSequence=8&toSequence=2"]) {
        assert.equal((await app.request(`/api/goals/goal-1/trajectory?${suffix}`)).status, 400, suffix);
    }
    assert.equal((await app.request("/api/goals/missing/trajectory?runId=run-1")).status, 404);
    assert.equal((await app.request("/api/goals/goal-1/trajectory?runId=missing")).status, 404);
    const failed = createBrowserTrajectoryRoutes({ restore: async () => { throw new Error("private-storage-path"); } }, async () => ({ committed: [], uncommittedTail: [] }));
    const failure = await failed.request("/api/goals/goal-1/trajectory?runId=run-1");
    assert.equal(failure.status, 500); assert.deepEqual(await failure.json(), { error: "trajectory_read_failed" });
});

test("trajectory endpoints enforce Host, origin, and capability before any storage read", async () => {
    const access = createBrowserSessionAccess();
    let reads = 0;
    const service = createHttpService({ middleware: access.middleware });
    service.mount("/", createBrowserTrajectoryRoutes({ restore: async () => { reads += 1; return goal(); } }, async () => ({ committed: [], uncommittedTail: [] })));
    const address = await service.start(0); access.bindOrigin(address.origin);
    const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);
    try {
        for (const path of ["trajectory/runs", "trajectory?runId=run-1", "trajectory/events/1?runId=run-1"]) {
            const url = `${address.origin}/api/goals/goal-1/${path}`;
            assert.equal((await fetch(url)).status, 401);
            assert.equal((await fetch(url, { headers: { authorization: `Bearer ${token}`, origin: "https://external.example" } })).status, 403);
            const wrongHostStatus = await new Promise<number>((resolve, reject) => {
                const request = httpRequest(url, { headers: { authorization: `Bearer ${token}`, host: "localhost:1" } }, response => {
                    response.resume(); response.on("end", () => resolve(response.statusCode ?? 0));
                });
                request.on("error", reject); request.end();
            });
            assert.equal(wrongHostStatus, 403);
        }
        assert.equal(reads, 0);
        assert.equal((await fetch(`${address.origin}/api/goals/goal-1/trajectory/runs`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
        assert.equal(reads, 1);
    } finally { await service.close(); }
});

test("long committed trajectory returns bounded pages and locates late steps", async () => {
    const value = goal(10_000);
    const events = Array.from({ length: 10_000 }, (_, index) => fact(index + 1));
    const app = routes(value, events); const start = performance.now();
    const response = await app.request("/api/goals/goal-1/trajectory?runId=run-1&executionUnitId=unit-9901");
    const text = await response.text(); const page = JSON.parse(text);
    assert.equal(page.entries.length, 100); assert.equal(page.locatedSequence, 9901); assert.equal(page.total, 10_000);
    assert.ok(Buffer.byteLength(text) < 512 * 1024);
    console.info(`10,000-event page: ${(performance.now() - start).toFixed(1)} ms, ${Buffer.byteLength(text)} bytes (in-memory reader)`);
});

test("long JSONL trajectory is searchable through the real storage reader without returning uncommitted tail", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-trajectory-"));
    try {
        const goalDirectory = join(directory, Buffer.from("goal-1").toString("base64url"));
        await mkdir(goalDirectory);
        const events = Array.from({ length: 10_010 }, (_, index) => fact(index + 1));
        await writeFile(join(goalDirectory, `${Buffer.from("run-1").toString("base64url")}.jsonl`), events.map(event => JSON.stringify(event)).join("\n") + "\n");
        const store = new JsonFileTrajectoryStore(directory);
        const app = createBrowserTrajectoryRoutes({ restore: async () => goal(10_000) }, query => store.readWithBoundary(query, 10_000));
        const start = performance.now();
        const response = await app.request("/api/goals/goal-1/trajectory?runId=run-1&q=run_started&after=9900");
        assert.equal(response.status, 200);
        const page = await response.json() as BrowserTrajectoryPage;
        assert.equal(page.entries.length, 100); assert.equal(page.total, 10_000); assert.equal(page.entries.at(-1)?.sequence, 10_000);
        assert.equal(page.nextCursor, null); assert.ok(Buffer.byteLength(JSON.stringify(page)) < 512 * 1024);
        console.info(`10,010-event JSONL read/search: ${(performance.now() - start).toFixed(1)} ms (full-file parsing)`);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
