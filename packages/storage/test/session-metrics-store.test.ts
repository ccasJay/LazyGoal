import assert from "node:assert/strict";
import {
    mkdtemp,
    readFile,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ModelCallMetricRecord } from "../../runtime/src/index";
import {
    goalDirectory as goalDirectoryPath,
    goalMetricsCoveragePath,
    JsonFileMetricsStore,
    ModelCallMetricStoreProtocolError,
    runMetricsPath,
} from "../src/index";

function started(callId = "call-1"): ModelCallMetricRecord {
    return {
        recordType: "call_started",
        goalId: "goal/1",
        runId: "run 1",
        callId,
        modelId: "test-model",
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

        const goalDirectory = goalDirectoryPath(directory, "goal/1");
        const filePath = runMetricsPath(directory, "goal/1", "run 1");
        const jsonl = await readFile(filePath, "utf8");
        assert.equal(jsonl.includes("prompt"), false);
        assert.equal(jsonl.includes("response"), false);
        if (process.platform !== "win32") {
            assert.equal((await stat(directory)).mode & 0o777, 0o700);
            assert.equal((await stat(goalDirectory)).mode & 0o777, 0o700);
            assert.equal((await stat(filePath)).mode & 0o777, 0o600);
        }

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

test("JsonFileMetricsStore reads legacy facts and round trips request durations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-metrics-request-duration-"));

    try {
        const store = new JsonFileMetricsStore(directory);
        const legacyStarted = started("legacy-call");
        const legacyFinished: ModelCallMetricRecord = {
            recordType: "call_finished",
            goalId: "goal/1",
            runId: "run 1",
            callId: "legacy-call",
            occurredAt: "2026-09-25T10:00:01.000Z",
            outcome: "completed",
            usage: { source: "provider_reported", inputTokens: 10, outputTokens: 3 },
        };
        const currentStarted = started("current-call");
        const currentFinished = {
            recordType: "call_finished" as const,
            goalId: "goal/1",
            runId: "run 1",
            callId: "current-call",
            occurredAt: "2026-09-25T10:00:02.000Z",
            outcome: "completed" as const,
            usage: { source: "provider_reported" as const, inputTokens: 20, outputTokens: 6 },
            requestDurationMs: 125.5,
        } as ModelCallMetricRecord;

        await store.append(legacyStarted);
        await store.append(legacyFinished);
        await store.append(currentStarted);
        await store.append(currentFinished);

        assert.deepEqual(await store.read({ goalId: "goal/1", runId: "run 1" }), [
            legacyStarted,
            legacyFinished,
            currentStarted,
            currentFinished,
        ]);
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
        assert.throws(
            () => store.append({
                recordType: "call_finished",
                goalId: "goal/1",
                runId: "run 1",
                callId: "call-invalid-duration",
                occurredAt: "2026-09-25T10:00:01.000Z",
                outcome: "completed",
                usage: { source: "provider_reported", inputTokens: 0, outputTokens: 0 },
                requestDurationMs: 0,
            } as unknown as ModelCallMetricRecord),
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

        const filePath = runMetricsPath(directory, "goal/1", "run 1");
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

        if (process.platform !== "win32") {
            const coveragePath = goalMetricsCoveragePath(directory, "goal-new");
            assert.equal((await stat(coveragePath)).mode & 0o777, 0o600);
        }

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
