import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { TrajectoryEventDraft } from "../../runtime/src/index";
import { JsonFileTrajectoryStore, runTrajectoryIndexPath, runTrajectorySegmentPath } from "../src/index";

const goalId = "goal-index";
const runId = "run-index";

const jsonlPath = (directory: string) => runTrajectorySegmentPath(directory, goalId, runId, 0);
const indexPath = (directory: string) => runTrajectoryIndexPath(directory, goalId, runId);

interface IndexRow {
    sequence: number;
    event_id: string;
    event_type: string;
    action_id: string | null;
    model_call_id: string | null;
    model_stage: string | null;
    parent_action_id: string | null;
    segment: number;
    byte_offset: number;
    byte_length: number;
    payload_bytes: number;
    payload_ref: string | null;
    result_preview: string | null;
}

function runStarted(): TrajectoryEventDraft {
    return { goalId, runId, phase: "executing", eventType: "run_started", payload: { type: "run_started" } };
}

function programStarted(programId: string, parentActionId: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", eventType: "program_started",
        payload: {
            type: "program_started",
            programId,
            parentActionId,
            codeHash: "a".repeat(64),
            workerHash: "b".repeat(64),
            nodeVersion: "22.22.2",
        },
    };
}

function toolStarted(actionId: string, programId?: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", actionId,
        ...(programId === undefined ? {} : { programId, callIndex: 0 }),
        eventType: "tool_started",
        payload: { type: "tool_started", actionId, toolId: "read_file", input: { path: "a.txt" } },
    };
}

function toolFinished(actionId: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", actionId,
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId,
            toolId: "read_file",
            observation: { kind: "success", output: { stdout: "done" }, summary: "done" },
        },
    };
}

function modelFrame(callId: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", executionUnitId: "unit-1",
        eventType: "model_context_frame",
        payload: {
            type: "model_context_frame",
            stage: "decide",
            epochNumber: 0,
            conversationPosition: 0,
            sections: [],
            modelCallId: callId,
        },
    };
}

function decision(actionId: string): TrajectoryEventDraft {
    return {
        goalId, runId, phase: "executing", executionUnitId: "unit-1",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: { kind: "tool_call", action: { actionId, toolId: "read_file", input: { path: "a.txt" } } },
        },
    };
}

function rows(directory: string): IndexRow[] {
    const database = new DatabaseSync(indexPath(directory));
    try {
        return database.prepare("SELECT * FROM events ORDER BY sequence").all() as unknown as IndexRow[];
    } finally {
        database.close();
    }
}

test("index records event metadata, byte location and program parent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-write-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await store.append(programStarted("program-1", "action-parent"));
        await store.append(toolStarted("action-1", "program-1"));
        await store.append(toolFinished("action-1"));
        await store.flushIndex(goalId, runId);

        const indexed = rows(directory);
        assert.deepEqual(indexed.map((row) => row.sequence), [1, 2, 3, 4]);
        assert.equal(indexed[2]?.action_id, "action-1");
        assert.equal(indexed[2]?.parent_action_id, "action-parent");
        assert.equal(indexed[2]?.result_preview, "done");
        assert.equal(indexed[3]?.event_type, "tool_finished");

        const content = await readFile(jsonlPath(directory), "utf8");
        const location = indexed[2]!;
        const line = Buffer.from(content).subarray(location.byte_offset, location.byte_offset + location.byte_length).toString("utf8");
        assert.equal(JSON.parse(line).sequence, 3);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("deleting the index rebuilds it from JSONL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-rebuild-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await store.append(toolStarted("action-1"));
        await rm(indexPath(directory));

        const reopened = new JsonFileTrajectoryStore(directory);
        await reopened.append(toolFinished("action-1"));
        await reopened.flushIndex(goalId, runId);

        assert.deepEqual(rows(directory).map((row) => row.sequence), [1, 2, 3]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a lagging index is repaired from the last verified location", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-repair-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await store.append(toolStarted("action-1"));

        const database = new DatabaseSync(indexPath(directory));
        database.exec("DELETE FROM events WHERE sequence = 2");
        database.close();

        const reopened = new JsonFileTrajectoryStore(directory);
        await reopened.append(toolFinished("action-1"));
        await reopened.flushIndex(goalId, runId);

        assert.deepEqual(rows(directory).map((row) => row.sequence), [1, 2, 3]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("an index that leads JSONL is rebuilt instead of trusted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-ahead-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());

        const database = new DatabaseSync(indexPath(directory));
        database.exec("UPDATE events SET sequence = 999 WHERE sequence = 1");
        database.close();

        const reopened = new JsonFileTrajectoryStore(directory);
        await reopened.append(toolStarted("action-1"));
        await reopened.flushIndex(goalId, runId);

        assert.deepEqual(rows(directory).map((row) => row.sequence), [1, 2]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("an incomplete tail is truncated and its event is not replayed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-tail-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());
        await store.append(toolStarted("action-1"));

        const { size } = await stat(jsonlPath(directory));
        await truncate(jsonlPath(directory), size - 5);

        const reopened = new JsonFileTrajectoryStore(directory);
        const next = await reopened.append(toolFinished("action-1"));
        await reopened.flushIndex(goalId, runId);

        assert.equal(next.sequence, 2);
        assert.deepEqual(rows(directory).map((row) => row.sequence), [1, 2]);
        assert.deepEqual(
            (await reopened.read({ goalId, runId })).map((event) => event.eventType),
            ["run_started", "tool_finished"],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("an unsupported index schema is deleted and rebuilt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-schema-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(runStarted());

        const database = new DatabaseSync(indexPath(directory));
        database.exec("PRAGMA user_version = 99");
        database.close();

        const reopened = new JsonFileTrajectoryStore(directory);
        await reopened.append(toolStarted("action-1"));
        await reopened.flushIndex(goalId, runId);

        assert.deepEqual(rows(directory).map((row) => row.sequence), [1, 2]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("index associates decisions with the preceding model call and records externalized payloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-index-model-"));
    try {
        const store = new JsonFileTrajectoryStore(directory, {}, { blobThresholdBytes: 128 });
        await store.append({
            goalId, runId, phase: "executing", executionUnitId: "unit-1",
            eventType: "goal_created",
            payload: { type: "goal_created", intent: "x".repeat(1024) },
        });
        await store.append(modelFrame("call-1"));
        await store.append(decision("action-1"));
        await store.flushIndex(goalId, runId);

        const indexed = rows(directory);
        assert.equal(indexed[1]?.model_call_id, "call-1");
        assert.equal(indexed[1]?.model_stage, "decide");
        assert.equal(indexed[2]?.model_call_id, "call-1");
        assert.equal(indexed[2]?.model_stage, "decide");
        assert.ok(indexed[0]?.payload_ref !== null);
        assert.ok((indexed[0]?.payload_bytes ?? 0) > 128);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
