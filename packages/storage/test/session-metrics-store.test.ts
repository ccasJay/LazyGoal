import assert from "node:assert/strict";
import {
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ModelCallMetricRecord } from "../../runtime/src/index";
import {
    JsonFileMetricsStore,
    ModelCallMetricStoreProtocolError,
} from "../src/index";

function started(callId = "call-1"): ModelCallMetricRecord {
    return {
        recordType: "call_started",
        goalId: "goal/1",
        runId: "run 1",
        callId,
        occurredAt: "2026-09-25T10:00:00.000Z",
    };
}

test("JsonFileMetricsStore persists numeric call facts and restores them in order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-metrics-"));

    try {
        const store = new JsonFileMetricsStore(directory);
        const start = started();
        const finish: ModelCallMetricRecord = {
            recordType: "call_finished",
            goalId: "goal/1",
            runId: "run 1",
            callId: "call-1",
            occurredAt: "2026-09-25T10:00:01.000Z",
            outcome: "completed",
            usage: {
                source: "provider_reported",
                inputTokens: 120,
                outputTokens: 24,
                cachedInputTokens: 80,
            },
            decodeDurationMs: 750,
        };

        await Promise.all([store.append(start), store.append(finish)]);

        const goalDirectory = join(
            directory,
            Buffer.from("goal/1", "utf8").toString("base64url"),
        );
        const filePath = join(
            goalDirectory,
            `${Buffer.from("run 1", "utf8").toString("base64url")}.jsonl`,
        );
        const jsonl = await readFile(filePath, "utf8");
        assert.equal(jsonl.includes("prompt"), false);
        assert.equal(jsonl.includes("response"), false);

        const restored = new JsonFileMetricsStore(directory);
        const expected = [start, finish];
        assert.deepEqual(
            await restored.read({ goalId: "goal/1", runId: "run 1" }),
            expected,
        );
        assert.deepEqual(
            await restored.read({ goalId: "goal/1", runId: "run 1" }),
            expected,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileMetricsStore rejects invalid append payloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-metrics-invalid-"));

    try {
        const store = new JsonFileMetricsStore(directory);
        const invalid = {
            ...started(),
            prompt: "must not be persisted",
        } as unknown as ModelCallMetricRecord;

        assert.throws(
            () => store.append(invalid),
            ModelCallMetricStoreProtocolError,
        );
        assert.deepEqual(
            await store.read({ goalId: "goal/1", runId: "run 1" }),
            [],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileMetricsStore rejects malformed JSON and conflicting call facts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-metrics-protocol-"));

    try {
        const store = new JsonFileMetricsStore(directory);
        const initial = started();
        await store.append(initial);
        await store.append({
            ...initial,
            occurredAt: "2026-09-25T10:00:02.000Z",
        });

        await assert.rejects(
            store.read({ goalId: "goal/1", runId: "run 1" }),
            ModelCallMetricStoreProtocolError,
        );

        const goalDirectory = join(
            directory,
            Buffer.from("goal/1", "utf8").toString("base64url"),
        );
        const filePath = join(
            goalDirectory,
            `${Buffer.from("run 1", "utf8").toString("base64url")}.jsonl`,
        );
        await writeFile(filePath, "{broken\n", "utf8");

        await assert.rejects(
            store.read({ goalId: "goal/1", runId: "run 1" }),
            (error: unknown) =>
                error instanceof ModelCallMetricStoreProtocolError
                && error.message.includes("Invalid model call metric JSON"),
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileMetricsStore preserves first-seen history coverage and deduplicates durable gaps", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-metrics-coverage-"));

    try {
        const store = new JsonFileMetricsStore(directory);
        await store.initializeGoal("goal-new", true);
        await store.initializeGoal("goal-new", false);
        await store.recordGap({ goalId: "goal-new", runId: "run-1", callId: "call-1" });
        await store.recordGap({ goalId: "goal-new", runId: "run-1", callId: "call-1" });
        await store.initializeGoal("goal-old", false);

        const restored = new JsonFileMetricsStore(directory);
        assert.deepEqual(await restored.readCoverage("goal-new"), {
            goalId: "goal-new",
            historyCovered: true,
            gaps: [{ goalId: "goal-new", runId: "run-1", callId: "call-1" }],
        });
        assert.deepEqual(await restored.readCoverage("goal-old"), {
            goalId: "goal-old",
            historyCovered: false,
            gaps: [],
        });
        assert.equal(await restored.readCoverage("goal-missing"), undefined);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
