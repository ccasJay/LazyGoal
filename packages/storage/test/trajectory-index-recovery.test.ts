import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    TrajectoryProtocolError,
    type TrajectoryEventDraft,
    type TrajectoryQueryContext,
} from "../../runtime/src/index";
import {
    JsonFileModelInputStore,
    JsonFileTrajectoryStore,
    runDirectory,
    runTrajectoryIndexPath,
    runTrajectorySegmentPath,
} from "../src/index";

const goalId = "goal-recovery";
const runId = "run-recovery";

const jsonlPath = (directory: string) => runTrajectorySegmentPath(directory, goalId, runId, 0);
const indexPath = (directory: string) => runTrajectoryIndexPath(directory, goalId, runId);
const context = (committedThroughSequence: number): TrajectoryQueryContext => ({ goalId, runId, committedThroughSequence });

function runStarted(): TrajectoryEventDraft {
    return { goalId, runId, phase: "executing", eventType: "run_started", payload: { type: "run_started" } };
}

function programStarted(): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", eventType: "program_started",
        payload: {
            type: "program_started", programId: "program-1", parentActionId: "parent-action",
            codeHash: "a".repeat(64), workerHash: "b".repeat(64), nodeVersion: "22.22.2",
        },
    };
}

function modelFrame(): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", executionUnitId: "unit-1",
        eventType: "model_context_frame",
        payload: {
            type: "model_context_frame", stage: "decide", epochNumber: 0,
            conversationPosition: 0, sections: [], modelCallId: "call-1",
        },
    };
}

function decision(): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", executionUnitId: "unit-1",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: { kind: "tool_call", action: { actionId: "action-1", toolId: "read_file", input: { path: "a.txt" } } },
        },
    };
}

function toolStarted(): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", executionUnitId: "unit-1", actionId: "action-1",
        eventType: "tool_started",
        payload: { type: "tool_started", actionId: "action-1", toolId: "read_file", input: { path: "a.txt" } },
    };
}

function toolFinished(): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", executionUnitId: "unit-1", actionId: "action-1",
        eventType: "tool_finished",
        payload: {
            type: "tool_finished", actionId: "action-1", toolId: "read_file",
            observation: { kind: "success", output: { stdout: "done" }, summary: "done" },
        },
    };
}

function observation(): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", executionUnitId: "unit-1", actionId: "action-1",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded", actionId: "action-1",
            observation: { kind: "success", output: { stdout: "done" }, summary: "done" },
        },
    };
}

test("rebuilding the index preserves pages, details, units, timelines and model calls", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-equivalence-"));
    try {
        const store = new JsonFileTrajectoryStore(directory, {}, { blobThresholdBytes: 128, segmentThresholdBytes: 1 });
        for (const draft of [runStarted(), programStarted(), modelFrame(), decision(), toolStarted(), toolFinished(), observation()]) {
            await store.append(draft);
        }

        const snapshot = async (query: JsonFileTrajectoryStore) => ({
            page: await query.queryPage(context(7), { limit: 100 }),
            detail: await query.readDetail(context(7), 5),
            unit: await query.queryExecutionUnitPage(context(7), "unit-1", { limit: 100 }),
            timeline: await query.queryTimeline(context(7), 2),
            calls: await query.listModelCallIds(context(7)),
        });

        const before = await snapshot(store);
        await rm(indexPath(directory));
        const rebuilt = new JsonFileTrajectoryStore(directory);
        const after = await snapshot(rebuilt);

        assert.deepEqual(after, before);
        assert.deepEqual(after.calls, ["call-1"]);
        assert.equal(after.detail?.correlation.actionId, "action-1");
        assert.equal(after.detail?.observationConfirmed, true);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("two store instances append sequentially without reusing a sequence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-cross-instance-"));
    try {
        const first = new JsonFileTrajectoryStore(directory);
        const second = new JsonFileTrajectoryStore(directory);
        const firstEvent = await first.append(runStarted());
        const secondEvent = await second.append(runStarted());

        assert.deepEqual([firstEvent.sequence, secondEvent.sequence], [1, 2]);
        assert.deepEqual((await first.read({ goalId, runId })).map((event) => event.sequence), [1, 2]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("duplicate sequences written by competing writers fail closed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-duplicate-"));
    try {
        const event = {
            storageEncodingVersion: 2,
            eventSchemaVersion: 1,
            eventId: "duplicate-event",
            goalId,
            runId,
            phase: "executing",
            sequence: 1,
            occurredAt: "2026-11-02T00:00:00.000Z",
            eventType: "run_started",
            payload: { type: "run_started" },
        };
        await mkdir(runDirectory(directory, goalId, runId), { recursive: true });
        await writeFile(jsonlPath(directory), `${JSON.stringify(event)}\n${JSON.stringify({ ...event, eventId: "other" })}\n`, "utf8");
        const store = new JsonFileTrajectoryStore(directory);
        await assert.rejects(
            store.read({ goalId, runId }),
            (error: unknown) => error instanceof TrajectoryProtocolError && /sequence must increase/.test(error.message),
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a JSONL line committed before the index is repaired from its location", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-crash-tail-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());

        const extra = {
            storageEncodingVersion: 2,
            eventSchemaVersion: 1,
            eventId: "extra-event",
            goalId,
            runId,
            phase: "executing",
            sequence: 2,
            occurredAt: "2026-11-02T00:00:01.000Z",
            eventType: "run_started",
            payload: { type: "run_started" },
        };
        await writeFile(jsonlPath(directory), `${JSON.stringify(extra)}\n`, { flag: "a" });

        const reopened = new JsonFileTrajectoryStore(directory);
        const page = await reopened.queryPage(context(2), { limit: 10 });
        assert.deepEqual(page.entries.map((entry) => entry.sequence), [1, 2]);
        assert.equal(page.committedCount, 2);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("action relations respect the current watermark instead of leaking a later observation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-partial-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(toolStarted());
        await store.append(toolFinished());
        await store.append(observation());

        const partial = await store.readDetail(context(2), 1);
        assert.ok(partial !== undefined);
        assert.equal(partial.observationConfirmed, false);
        assert.equal(partial.related.observation, undefined);
        assert.equal(partial.observation?.kind, "success");

        const committed = await store.readDetail(context(3), 1);
        assert.ok(committed !== undefined);
        assert.equal(committed.observationConfirmed, true);
        assert.equal(committed.related.observation, 3);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("an index ahead of the ledger is rebuilt from committed JSONL facts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-ahead-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await store.append(runStarted());

        const lines = (await readFile(jsonlPath(directory), "utf8")).split("\n").filter(Boolean);
        await writeFile(jsonlPath(directory), `${lines[0]}\n`, "utf8");

        const reopened = new JsonFileTrajectoryStore(directory);
        const page = await reopened.queryPage(context(2), { limit: 10 });
        assert.deepEqual(page.entries.map((entry) => entry.sequence), [1]);
        assert.equal(page.total, 1);
        assert.equal(page.committedCount, 1);
        assert.equal(await reopened.readDetail(context(2), 2), undefined);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a half-written trailing line is discarded without losing committed events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-halfline-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await writeFile(
            jsonlPath(directory),
            '{"storageEncodingVersion":2,"eventSchemaVersion":1,"eventId":"tor',
            { flag: "a" },
        );

        const reopened = new JsonFileTrajectoryStore(directory);
        const page = await reopened.queryPage(context(2), { limit: 10 });
        assert.deepEqual(page.entries.map((entry) => entry.sequence), [1]);
        assert.equal(page.committedCount, 1);

        const appended = await reopened.append(runStarted());
        assert.equal(appended.sequence, 2);
        assert.deepEqual(
            (await reopened.read({ goalId, runId })).map((event) => event.sequence),
            [1, 2],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a page cursor keeps its watermark while new events keep arriving", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-watermark-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        for (let index = 0; index < 5; index += 1) await store.append(runStarted());

        const first = await store.queryPage(context(5), { limit: 2 });
        assert.ok(first.nextCursor !== null);
        for (let index = 0; index < 5; index += 1) await store.append(runStarted());

        const second = await store.queryPage(context(5), { limit: 2, cursor: first.nextCursor });
        assert.deepEqual(second.entries.map((entry) => entry.sequence), [3, 4]);
        assert.equal(second.total, 5);
        assert.equal(second.committedThroughSequence, 5);

        await assert.rejects(
            store.queryPage(context(6), { limit: 2, cursor: first.nextCursor }),
            (error: unknown) => error instanceof TrajectoryProtocolError && /cursor does not match/.test(error.message),
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("an orphan model input stays hidden until its trajectory event commits", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-orphan-input-"));
    try {
        const inputs = new JsonFileModelInputStore(directory);
        await inputs.append({
            goalId,
            runId,
            callId: "call-orphan",
            stage: "decide",
            stepIndex: 1,
            occurredAt: "2026-11-02T00:00:00.000Z",
            messages: [],
        });

        const store = new JsonFileTrajectoryStore(directory);
        assert.deepEqual(await store.listModelCallIds(context(0)), []);
        assert.equal((await inputs.read(goalId, runId)).length, 1);

        await store.append(modelFrame());
        await store.append(decision());
        assert.deepEqual(await store.listModelCallIds(context(2)), ["call-1"]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
