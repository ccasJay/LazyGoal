import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    AttemptRecorder,
    readBenchmarkAttempt,
    type BenchmarkAttemptRecord,
} from "../src/attempt-recorder.js";

function record<T>(domainResult: T): BenchmarkAttemptRecord<T> {
    return {
        benchmarkId: "fixture",
        taskId: "task-1",
        goalId: "goal-1",
        runId: "run-1",
        attempt: 1,
        status: "infrastructure_error",
        durationMs: 12,
        usage: null,
        errors: [{ stage: "preflight", message: "not ready" }],
        artifactLocator: null,
        domainResult,
    };
}

test("AttemptRecorder atomically persists complete records and retains domain fields", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-attempt-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const recorder = new AttemptRecorder<{ won: boolean }>({ rootDirectory: root });
    await recorder.commit(record({ won: false }));
    await recorder.update({ status: "completed", lastStage: "artifacts", domainResult: { won: true } });
    const restored = await readBenchmarkAttempt<{ won: boolean }>(recorder.path);
    assert.equal(restored.status, "completed");
    assert.deepEqual(restored.domainResult, { won: true });
    assert.equal(restored.lastStage, "artifacts");
    assert.equal((await readFile(recorder.path, "utf8")).endsWith("\n"), true);
});

test("AttemptRecorder rejects identity changes and malformed durable records", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-attempt-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const recorder = new AttemptRecorder({ rootDirectory: root });
    await recorder.commit(record({ patch: "diff" }));
    await assert.rejects(recorder.commit({ ...record({ patch: "other" }), attempt: 2 }), /identity/);
    await assert.rejects(readBenchmarkAttempt(join(root, "missing.json")), /ENOENT/);
});

test("AttemptRecorder persists immutable Prompt Evaluation metadata", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-attempt-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const recorder = new AttemptRecorder<{ won: boolean }>({ rootDirectory: root });
    const promptEvaluation = {
        evaluationId: "eval-1",
        candidateId: "candidate-1",
        baseProfileId: "alfworld-profile",
        promptSha256: "a".repeat(64),
        promptSummary: {
            systemPromptCharacters: 20,
            instructionCount: 1,
            instructionCharacters: 30,
        },
        modelConfigId: "default",
        modelId: "model-1",
    } as const;
    await recorder.commit({ ...record({ won: false }), promptEvaluation });
    const restored = await readBenchmarkAttempt<{ won: boolean }>(recorder.path);
    assert.deepEqual(restored.promptEvaluation, promptEvaluation);
    await assert.rejects(
        recorder.update({
            promptEvaluation: { ...promptEvaluation, candidateId: "candidate-2" },
        }),
        /identity/u,
    );
});
