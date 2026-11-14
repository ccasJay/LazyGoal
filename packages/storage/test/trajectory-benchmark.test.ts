import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open as openFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { JsonFileTrajectoryStore, runDirectory, runTrajectorySegmentPath } from "../src/index";

/** 压测规模三档:小、中、大轨迹。 */
const SCALES = [100, 1_000, 10_000] as const;

test("JsonFileTrajectoryStore 三档规模追加与范围读取压测", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-trajectory-bench-"));

    try {
        const store = new JsonFileTrajectoryStore(directory);

        for (const scale of SCALES) {
            const goalId = `goal-bench-${scale}`;
            const runId = `run-bench-${scale}`;
            const appendStartedAt = performance.now();
            const sequences: number[] = [];

            for (let index = 0; index < scale; index += 1) {
                const event = await store.append({
                    goalId,
                    runId,
                    phase: "executing",
                    eventType: "run_resumed",
                    payload: { type: "run_resumed" },
                });
                sequences.push(event.sequence);
            }
            const appendElapsedMs = performance.now() - appendStartedAt;

            const fromSequence = scale / 2;
            const readStartedAt = performance.now();
            const range = await store.read({
                goalId,
                runId,
                fromSequence,
                toSequence: scale,
            });
            const readElapsedMs = performance.now() - readStartedAt;

            // 断言只覆盖行为:序号 1..N 连续,范围读取闭区间数量正确。
            for (const [index, sequence] of sequences.entries()) {
                if (sequence !== index + 1) {
                    assert.fail(`sequence ${sequence} at index ${index} breaks continuity`);
                }
            }
            assert.equal(range.length, scale - fromSequence + 1);
            assert.equal(range[0]?.sequence, fromSequence);
            assert.equal(range[range.length - 1]?.sequence, scale);

            console.log(
                `[trajectory-benchmark] scale=${scale} append=${appendElapsedMs.toFixed(1)}ms`
                + ` read=[${fromSequence},${scale}]=${readElapsedMs.toFixed(1)}ms`,
            );
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("索引分页不读取 payload，且 10,000 事件重建有上限", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-trajectory-index-bench-"));
    const goalId = "goal-index-bench";
    const runId = "run-index-bench";

    try {
        await mkdir(runDirectory(directory, goalId, runId), { recursive: true });
        const base = Date.parse("2026-01-01T00:00:00.000Z");
        const lines = Array.from({ length: 10_000 }, (_, index) => JSON.stringify({
            storageEncodingVersion: 2,
            eventSchemaVersion: 1,
            eventId: `event-${index + 1}`,
            goalId,
            runId,
            phase: "executing",
            executionUnitId: `unit-${Math.floor(index / 10)}`,
            sequence: index + 1,
            occurredAt: new Date(base + index * 1_000).toISOString(),
            eventType: "run_started",
            payload: { type: "run_started" },
        }));
        await writeFile(runTrajectorySegmentPath(directory, goalId, runId, 0), lines.join("\n") + "\n", "utf8");

        let reads = 0;
        const store = new JsonFileTrajectoryStore(directory, {
            readFile: (async (
                ...args: [Parameters<typeof readFile>[0], Parameters<typeof readFile>[1]]
            ) => {
                reads += 1;
                return readFile(...args);
            }) as typeof readFile,
            open: async (...args: Parameters<typeof openFile>) => {
                reads += 1;
                return openFile(...args);
            },
        });
        const context = { goalId, runId, committedThroughSequence: 10_000 };

        const rebuildStartedAt = performance.now();
        const first = await store.queryPage(context, { limit: 100 });
        const rebuildElapsedMs = performance.now() - rebuildStartedAt;
        assert.equal(first.entries.length, 100);
        assert.equal(first.total, 10_000);
        assert.ok(first.nextCursor !== null);

        const readsAfterRebuild = reads;
        const pageStartedAt = performance.now();
        const next = await store.queryPage(context, { limit: 100, cursor: first.nextCursor });
        const pageElapsedMs = performance.now() - pageStartedAt;
        assert.deepEqual(next.entries[0]?.sequence, 101);
        assert.equal(reads, readsAfterRebuild, "page query must not read JSONL or payload");
        assert.ok(rebuildElapsedMs < 15_000, `index rebuild took ${rebuildElapsedMs.toFixed(1)}ms`);
        assert.ok(pageElapsedMs < 1_000, `indexed page took ${pageElapsedMs.toFixed(1)}ms`);

        console.log(
            `[trajectory-benchmark] indexed rebuild=${rebuildElapsedMs.toFixed(1)}ms`
            + ` page=${pageElapsedMs.toFixed(1)}ms total=${first.total}`,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
