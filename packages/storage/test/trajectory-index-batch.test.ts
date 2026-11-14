import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { TrajectoryEventDraft } from "../../runtime/src/index";
import { JsonFileTrajectoryStore, runDirectory, runTrajectoryIndexPath, runTrajectorySegmentPath } from "../src/index";

const goalId = "goal-1";
const runId = "run-1";

function draft(): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        eventType: "run_started",
        payload: { type: "run_started" },
    } as TrajectoryEventDraft;
}

function indexPath(directory: string): string {
    return runTrajectoryIndexPath(directory, goalId, runId);
}

async function withStore(
    callback: (store: JsonFileTrajectoryStore, directory: string) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-index-batch-"));

    try {
        await callback(new JsonFileTrajectoryStore(directory), directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

test("index reads flush buffered rows appended without an explicit commit", async () => {
    await withStore(async (store) => {
        for (let index = 0; index < 3; index += 1) await store.append(draft());

        const suffix = await store.readAfter({ goalId, runId, afterSequence: 0 }, 3);

        assert.deepEqual(suffix.committed.map((event) => event.sequence), [1, 2, 3]);
    });
});

test("flushIndex commits buffered rows with the DELETE journal and current index schema", async () => {
    await withStore(async (store, directory) => {
        for (let index = 0; index < 3; index += 1) await store.append(draft());

        await store.flushIndex(goalId, runId);

        const database = new DatabaseSync(indexPath(directory));
        try {
            const count = (database.prepare("SELECT count(*) AS count FROM events").get() as {
                readonly count: number;
            }).count;
            const journal = (database.prepare("PRAGMA journal_mode").get() as {
                readonly journal_mode: string;
            }).journal_mode;
            const version = (database.prepare("PRAGMA user_version").get() as {
                readonly user_version: number;
            }).user_version;

            assert.equal(count, 3);
            assert.equal(journal.toLowerCase(), "delete");
            assert.equal(version, 1);
        } finally {
            database.close();
        }
    });
});

test("flushIndex does not create an index for a run without buffered rows", async () => {
    await withStore(async (store, directory) => {
        await store.flushIndex(goalId, runId);

        await assert.rejects(readFile(indexPath(directory)), { code: "ENOENT" });
    });
});

test("a failed index flush is dropped and repaired from JSONL", async () => {
    await withStore(async (store, directory) => {
        await store.append(draft());
        await store.flushIndex(goalId, runId);
        await store.append(draft());

        const database = new DatabaseSync(indexPath(directory));
        try {
            const row = database.prepare("SELECT * FROM events WHERE sequence = 1").get() as
                Record<string, unknown>;
            const columns = Object.keys(row);
            const conflicting = columns.map((column) => column === "sequence" ? 2
                : column === "event_id" ? "conflict"
                    : column === "byte_offset" ? 0
                        : row[column]);
            database.prepare(
                `INSERT INTO events (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
            ).run(...conflicting as never[]);
        } finally {
            database.close();
        }

        await store.flushIndex(goalId, runId);

        const suffix = await store.readAfter({ goalId, runId, afterSequence: 1 }, 2);
        assert.deepEqual(suffix.committed.map((event) => event.sequence), [2]);
        assert.deepEqual(
            (await store.read({ goalId, runId })).map((event) => event.sequence),
            [1, 2],
        );
    });
});

test("unflushed buffered rows survive a restart through JSONL replay", async () => {
    await withStore(async (store, directory) => {
        await store.append(draft());
        await store.append(draft());

        const reopened = new JsonFileTrajectoryStore(directory);

        assert.deepEqual(
            (await reopened.read({ goalId, runId })).map((event) => event.sequence),
            [1, 2],
        );
        const suffix = await reopened.readAfter({ goalId, runId, afterSequence: 0 }, 2);
        assert.deepEqual(suffix.committed.map((event) => event.sequence), [1, 2]);
    });
});
