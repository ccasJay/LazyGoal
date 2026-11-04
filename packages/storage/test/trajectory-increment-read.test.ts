import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileTrajectoryStore } from "../src/index";
import { encodePathSegment } from "../src/path-segment";
import type { TrajectoryEventDraft } from "../../runtime/src/index";

const goalId = "goal-increment-read";
const runId = "run-increment-read";

function observationDraft(label: string, size: number): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        executionUnitId: "unit-1",
        actionId: `action-${label}`,
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: `action-${label}`,
            observation: {
                kind: "success",
                output: { text: `${label}:${"x".repeat(size)}` },
                summary: label,
            },
        },
    };
}

test("readAfter 只读取已校验前缀之后的事件与 payload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-increment-read-"));
    let blobReads = 0;
    let segmentReads = 0;

    try {
        const store = new JsonFileTrajectoryStore(directory, {
            readFile: (async (...args: Parameters<typeof readFile>) => {
                const path = String(args[0]);
                if (path.includes("/blobs/")) blobReads += 1;
                if (path.endsWith(".jsonl")) segmentReads += 1;
                return readFile(...args);
            }) as typeof readFile,
        }, { blobThresholdBytes: 8 });

        await store.append(observationDraft("first", 64));
        await store.append(observationDraft("second", 64));
        await store.append(observationDraft("third", 64));

        // 先通过全量读取建立并验证索引，模拟 assembler 已持有已校验前缀。
        const all = await store.read({ goalId, runId });
        assert.deepEqual(all.map((event) => event.sequence), [1, 2, 3]);
        blobReads = 0;
        segmentReads = 0;

        const suffix = await store.readAfter({ goalId, runId, afterSequence: 2 }, 3);

        assert.deepEqual(suffix.committed.map((event) => event.sequence), [3]);
        assert.deepEqual(suffix.uncommittedTail, []);
        assert.equal(blobReads, 1, "只应读取后缀事件的 payload");
        assert.equal(segmentReads, 0, "后缀应从索引定位处按字节读取，而不是全文件 readFile");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("readAfter 保留后缀协议校验并拒绝损坏事件", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-increment-read-corrupt-"));

    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(observationDraft("first", 16));
        await store.append(observationDraft("second", 16));

        const filePath = join(
            directory,
            encodePathSegment(goalId),
            `${encodePathSegment(runId)}.jsonl`,
        );
        await appendFile(filePath, "{not-json}\n", "utf8");

        await assert.rejects(
            store.readAfter({ goalId, runId, afterSequence: 1 }, 2),
            /Invalid Trajectory JSONL/,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("readAfter 在无已校验位置时回退全量读取，并处理空后缀", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-increment-read-fallback-"));

    try {
        const store = new JsonFileTrajectoryStore(directory);
        await store.append(observationDraft("first", 16));
        await store.append(observationDraft("second", 16));

        const fallback = await store.readAfter({ goalId, runId, afterSequence: 0 }, 2);
        assert.deepEqual(fallback.committed.map((event) => event.sequence), [1, 2]);
        assert.deepEqual(fallback.uncommittedTail, []);

        const empty = await store.readAfter({ goalId, runId, afterSequence: 2 }, 2);
        assert.deepEqual(empty.committed, []);
        assert.deepEqual(empty.uncommittedTail, []);

        await assert.rejects(
            store.readAfter({ goalId, runId, afterSequence: -1 }, 2),
            /afterSequence must be a non-negative integer/,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
