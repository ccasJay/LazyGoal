import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    TrajectoryProtocolError,
    type TrajectoryEventDraft,
} from "../../runtime/src/index";
import { JsonFileTrajectoryStore } from "../src/index";
import { encodePathSegment } from "../src/path-segment";

const goalId = "goal-encoding";
const runId = "run-encoding";
const encodedGoal = encodePathSegment(goalId);
const encodedRun = encodePathSegment(runId);

function draft(intent = "small"): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        eventType: "goal_created",
        payload: { type: "goal_created", intent },
    };
}

function runFile(directory: string, name = `${encodedRun}.jsonl`): string {
    return join(directory, encodedGoal, name);
}

test("small payloads stay inline and read back as domain events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-encoding-inline-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        const event = await store.append(draft());
        const line = JSON.parse((await readFile(runFile(directory), "utf8")).trim()) as Record<string, unknown>;

        assert.equal(line.storageEncodingVersion, 2);
        assert.deepEqual(line.payload, { type: "goal_created", intent: "small" });
        assert.equal(line.payloadRef, undefined);
        assert.deepEqual(await store.read({ goalId, runId }), [event]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("large payloads are externalized and materialized from the content-addressed blob", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-encoding-blob-"));
    try {
        const store = new JsonFileTrajectoryStore(directory, {}, { blobThresholdBytes: 128 });
        const intent = "x".repeat(1024);
        const event = await store.append(draft(intent));
        const line = JSON.parse((await readFile(runFile(directory), "utf8")).trim()) as {
            payload?: unknown;
            payloadRef?: { sha256: string; bytes: number; encoding: string };
        };

        assert.equal(line.payload, undefined);
        assert.ok(line.payloadRef);
        const blob = join(directory, encodedGoal, "blobs", `${line.payloadRef.sha256}.json`);
        assert.equal(JSON.parse(await readFile(blob, "utf8")).intent, intent);
        assert.deepEqual(await store.read({ goalId, runId }), [event]);
        assert.equal((await store.readWithBoundary({ goalId, runId }, 1)).committed.length, 1);

        await rm(blob);
        await assert.rejects(store.read({ goalId, runId }), (error: unknown) =>
            error instanceof TrajectoryProtocolError && /Missing Trajectory payload blob/.test(error.message));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("identical externalized payloads reuse one blob", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-encoding-dedup-"));
    try {
        const store = new JsonFileTrajectoryStore(directory, {}, { blobThresholdBytes: 128 });
        await store.append(draft("y".repeat(1024)));
        await store.append(draft("y".repeat(1024)));
        const lines = (await readFile(runFile(directory), "utf8")).trim().split("\n")
            .map((line) => JSON.parse(line) as { payloadRef: { sha256: string } });
        assert.equal(lines[0]?.payloadRef.sha256, lines[1]?.payloadRef.sha256);
        const blobs = await readdir(join(directory, encodedGoal, "blobs"));
        assert.equal(blobs.length, 1);
        assert.equal((await store.read({ goalId, runId })).length, 2);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("segments roll after the configured threshold and read across boundaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-encoding-segments-"));
    try {
        const store = new JsonFileTrajectoryStore(directory, {}, { segmentThresholdBytes: 1 });
        for (const intent of ["one", "two", "three"]) await store.append(draft(intent));

        const files = (await readdir(join(directory, encodedGoal)))
            .filter((name) => name.endsWith(".jsonl"))
            .sort();
        assert.deepEqual(files, [`${encodedRun}.jsonl`, `${encodedRun}.part2.jsonl`, `${encodedRun}.part3.jsonl`]);

        const events = await store.read({ goalId, runId });
        assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3]);
        assert.deepEqual(
            events.map((event) => event.eventType === "goal_created" ? event.payload.intent : ""),
            ["one", "two", "three"],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("unsupported or ambiguous storage encoding fails closed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trajectory-encoding-invalid-"));
    try {
        const goalDirectory = join(directory, encodedGoal);
        await mkdir(goalDirectory, { recursive: true });
        const path = join(goalDirectory, `${encodedRun}.jsonl`);
        const event = allocateImmutableEvent(draft(), 1);
        const store = new JsonFileTrajectoryStore(directory);

        await writeFile(path, `${JSON.stringify({ ...event, storageEncodingVersion: 1 })}\n`);
        await assert.rejects(store.read({ goalId, runId }), (error: unknown) =>
            error instanceof TrajectoryProtocolError && /Unsupported Trajectory storage encoding/.test(error.message));

        await writeFile(path, `${JSON.stringify({
            storageEncodingVersion: 2,
            ...event,
            payloadRef: { sha256: "a".repeat(64), bytes: 1, encoding: "canonical-json" },
        })}\n`);
        await assert.rejects(store.read({ goalId, runId }), (error: unknown) =>
            error instanceof TrajectoryProtocolError && /ambiguous/.test(error.message));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
