import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { JsonFileTrajectoryStore } from "../src/index";

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
