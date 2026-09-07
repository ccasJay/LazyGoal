import assert from "node:assert/strict";
import {
    appendFile,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { TrajectoryEventDraft } from "../../runtime/src/index";
import {
    JsonFileTrajectoryStore,
} from "../src/index";
import {
    TrajectoryProtocolError,
} from "../../runtime/src/index";

function draft(
    eventType: TrajectoryEventDraft["eventType"],
    payload: TrajectoryEventDraft["payload"],
    input: Partial<Extract<TrajectoryEventDraft, { eventType: typeof eventType }>> = {},
): TrajectoryEventDraft {
    return {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType,
        payload,
        ...input,
    } as TrajectoryEventDraft;
}

async function withStore(
    callback: (store: JsonFileTrajectoryStore, directory: string) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-trajectory-"));

    try {
        await callback(new JsonFileTrajectoryStore(directory), directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

test("JsonFileTrajectoryStore appends ordered JSONL events across instances", async () => {
    await withStore(async (store, directory) => {
        const started = await store.append(
            draft("run_started", { type: "run_started" }),
        );
        const toolStarted = await store.append(
            draft(
                "tool_started",
                {
                    type: "tool_started",
                    actionId: "action-1",
                    toolId: "read_file",
                    input: { path: "README.md" },
                },
                { actionId: "action-1" },
            ),
        );
        const restoredStore = new JsonFileTrajectoryStore(directory);
        const finished = await restoredStore.append(
            draft(
                "tool_finished",
                {
                    type: "tool_finished",
                    actionId: "action-1",
                    toolId: "read_file",
                    observation: {
                        kind: "success",
                        output: { content: "ok" },
                        summary: "读取成功",
                    },
                },
                { actionId: "action-1" },
            ),
        );

        assert.deepEqual(
            [started.sequence, toolStarted.sequence, finished.sequence],
            [1, 2, 3],
        );
        assert.deepEqual(
            (await restoredStore.read({ goalId: "goal-1", runId: "run-1" }))
                .map((event) => event.eventType),
            ["run_started", "tool_started", "tool_finished"],
        );

        const goalFiles = await readdir(directory);
        assert.deepEqual(goalFiles.length, 1);
        const goalDirectoryName = goalFiles[0];
        assert.ok(goalDirectoryName !== undefined);
        const runFiles = await readdir(join(directory, goalDirectoryName));
        assert.deepEqual(runFiles.length, 1);
        const runFileName = runFiles[0];
        assert.ok(runFileName !== undefined);
        assert.match(runFileName, /\.jsonl$/);
        assert.equal(
            (await readFile(join(directory, goalDirectoryName, runFileName), "utf8"))
                .trim()
                .split("\n").length,
            3,
        );
    });
});

test("JsonFileTrajectoryStore serializes concurrent appends and preserves immutable events", async () => {
    await withStore(async (store) => {
        const events = await Promise.all([
            store.append(draft("run_started", { type: "run_started" })),
            store.append(draft("run_resumed", { type: "run_resumed" })),
            store.append(draft("run_waiting", { type: "run_waiting", reason: "等待输入" })),
        ]);

        assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3]);
        assert.equal(Object.isFrozen(events[0]), true);
        assert.equal(Object.isFrozen(events[0].payload), true);
        assert.throws(() => {
            (events[0] as { sequence: number }).sequence = 99;
        }, TypeError);
    });
});

test("JsonFileTrajectoryStore restarts sequence continuation via tail scan", async () => {
    await withStore(async (store, directory) => {
        await store.append(draft("run_started", { type: "run_started" }));
        await store.append(
            draft("run_waiting", { type: "run_waiting", reason: "等待输入" }),
        );

        // 新实例没有序号缓存,续接序号只能来自尾部扫描。
        const restarted = new JsonFileTrajectoryStore(directory);
        const resumed = await restarted.append(
            draft("run_resumed", { type: "run_resumed" }),
        );

        assert.equal(resumed.sequence, 3);
        assert.deepEqual(
            (await restarted.read({ goalId: "goal-1", runId: "run-1" }))
                .map((event) => event.sequence),
            [1, 2, 3],
        );
    });
});

test("JsonFileTrajectoryStore continues sequence when the last line lacks a trailing newline", async () => {
    await withStore(async (store, directory) => {
        const first = await store.append(
            draft("run_started", { type: "run_started" }),
        );
        const second = await store.append(
            draft("run_waiting", { type: "run_waiting", reason: "等待输入" }),
        );
        const goalDirectory = join(
            directory,
            Buffer.from("goal-1", "utf8").toString("base64url"),
        );
        const filePath = join(
            goalDirectory,
            `${Buffer.from("run-1", "utf8").toString("base64url")}.jsonl`,
        );
        // 手工去掉末行换行符:末行仍须被识别为最后的非空行。
        await writeFile(
            filePath,
            `${JSON.stringify(first)}\n${JSON.stringify(second)}`,
            "utf8",
        );

        const restarted = new JsonFileTrajectoryStore(directory);
        const third = await restarted.append(
            draft("run_resumed", { type: "run_resumed" }),
        );

        assert.equal(third.sequence, 3);
    });
});

test("JsonFileTrajectoryStore rejects appends when the tail line identity mismatches", async () => {
    await withStore(async (store, directory) => {
        const first = await store.append(
            draft("run_started", { type: "run_started" }),
        );
        const goalDirectory = join(
            directory,
            Buffer.from("goal-1", "utf8").toString("base64url"),
        );
        const filePath = join(
            goalDirectory,
            `${Buffer.from("run-1", "utf8").toString("base64url")}.jsonl`,
        );
        await appendFile(
            filePath,
            `${JSON.stringify({ ...first, eventId: "event-2", sequence: 2, runId: "run-other" })}\n`,
            "utf8",
        );

        const restarted = new JsonFileTrajectoryStore(directory);

        await assert.rejects(
            () => restarted.append(draft("run_resumed", { type: "run_resumed" })),
            (error: unknown) => error instanceof TrajectoryProtocolError,
        );
    });
});

test("TrajectoryStore classifies the tail from the Snapshot boundary instead of marker position", async () => {
    await withStore(async (store) => {
        await store.append(draft("run_started", { type: "run_started" }));
        await store.append(
            draft(
                "state_committed",
                { type: "state_committed", committedThroughSequence: 1 },
            ),
        );
        await store.append(
            draft("run_waiting", { type: "run_waiting", reason: "等待输入" }),
        );

        const result = await store.readWithBoundary(
            { goalId: "goal-1", runId: "run-1" },
            1,
        );

        assert.deepEqual(
            result.committed.map((event) => event.sequence),
            [1],
        );
        assert.deepEqual(
            result.uncommittedTail.map((event) => event.sequence),
            [2, 3],
        );
        const firstTailEvent = result.uncommittedTail[0];
        assert.ok(firstTailEvent !== undefined);
        assert.equal(firstTailEvent.eventType, "state_committed");
    });
});

test("JsonFileTrajectoryStore keeps committed/tail classification across cache and tail-scan appends", async () => {
    await withStore(async (store, directory) => {
        await store.append(draft("run_started", { type: "run_started" }));
        await store.append(
            draft(
                "state_committed",
                { type: "state_committed", committedThroughSequence: 1 },
            ),
        );

        const restarted = new JsonFileTrajectoryStore(directory);
        await restarted.append(
            draft("run_waiting", { type: "run_waiting", reason: "等待输入" }),
        );

        const result = await restarted.readWithBoundary(
            { goalId: "goal-1", runId: "run-1" },
            1,
        );

        assert.deepEqual(
            result.committed.map((event) => event.sequence),
            [1],
        );
        assert.deepEqual(
            result.uncommittedTail.map((event) => event.sequence),
            [2, 3],
        );
    });
});

test("JsonFileTrajectoryStore returns an empty result for a missing or empty file", async () => {
    await withStore(async (store, directory) => {
        assert.deepEqual(
            await store.read({ goalId: "missing", runId: "run-1" }),
            [],
        );

        const goalDirectory = join(
            directory,
            Buffer.from("goal-1", "utf8").toString("base64url"),
        );
        await mkdir(goalDirectory, { recursive: true });
        await writeFile(
            join(
                goalDirectory,
                `${Buffer.from("run-1", "utf8").toString("base64url")}.jsonl`,
            ),
            "\n",
            "utf8",
        );

        assert.deepEqual(
            await store.read({ goalId: "goal-1", runId: "run-1" }),
            [],
        );
    });
});

test("JsonFileTrajectoryStore rejects unsafe queries and malformed or non-monotonic JSONL", async () => {
    await withStore(async (store, directory) => {
        await assert.rejects(
            () => store.read({ goalId: "", runId: "run-1" }),
            (error: unknown) => error instanceof TrajectoryProtocolError,
        );
        await assert.rejects(
            () => store.read({
                goalId: "goal-1",
                runId: "run-1",
                fromSequence: 3,
                toSequence: 2,
            }),
            (error: unknown) => error instanceof TrajectoryProtocolError,
        );

        const goalDirectory = join(
            directory,
            Buffer.from("goal-1", "utf8").toString("base64url"),
        );
        const filePath = join(
            goalDirectory,
            `${Buffer.from("run-1", "utf8").toString("base64url")}.jsonl`,
        );
        await mkdir(goalDirectory, { recursive: true });
        await writeFile(filePath, "not-json\n", "utf8");

        await assert.rejects(
            () => store.read({ goalId: "goal-1", runId: "run-1" }),
            (error: unknown) => error instanceof TrajectoryProtocolError,
        );

        await rm(filePath);
        const valid = await new JsonFileTrajectoryStore(directory).append(
            draft("run_started", { type: "run_started" }),
        );
        await writeFile(
            filePath,
            `${JSON.stringify(valid)}\n${JSON.stringify({ ...valid, eventId: "event-2", sequence: 1 })}\n`,
            "utf8",
        );

        await assert.rejects(
            () => store.read({ goalId: "goal-1", runId: "run-1" }),
            (error: unknown) => error instanceof TrajectoryProtocolError,
        );
    });
});
