import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { PromptEvaluationResultV1 } from "../../src/prompt-evaluation/protocol.js";
import {
    PromptEvaluationResultRecorder,
    readPromptEvaluationResult,
} from "../../src/prompt-evaluation/result-recorder.js";

function result(evaluationId: string): PromptEvaluationResultV1 {
    return {
        protocol: "prompt-evaluation@1",
        evaluationId,
        status: "cancelled",
        benchmarkId: "alfworld",
        manifestPath: "/tmp/manifest.json",
        candidateId: "candidate-1",
        baseProfileId: "alfworld-profile",
        promptSha256: "b".repeat(64),
        promptSummary: {
            systemPromptCharacters: 10,
            instructionCount: 1,
            instructionCharacters: 12,
        },
        modelConfigId: "default",
        modelId: "model-1",
        generatedAt: "2026-09-20T00:00:00.000Z",
        tasks: [
            {
                taskId: "task-1",
                status: "failed",
                domainResult: { won: false },
                attemptPath: "/tmp/attempt-1.json",
                artifactLocator: {
                    goalSnapshot: "/tmp/goal.json",
                    trajectory: "/tmp/trajectory.jsonl",
                },
                errors: [],
            },
            {
                taskId: "task-2",
                status: "cancelled",
                domainResult: null,
                attemptPath: null,
                artifactLocator: null,
                errors: [],
            },
        ],
    };
}

test("PromptEvaluationResultRecorder atomically preserves completed and unfinished task facts", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-prompt-result-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const directory = join(root, "eval-1");
    const recorder = new PromptEvaluationResultRecorder(directory);

    const path = await recorder.commit(result("eval-1"));
    const restored = await readPromptEvaluationResult(path);

    assert.deepEqual(restored.tasks.map((task) => [task.taskId, task.status, task.attemptPath]), [
        ["task-1", "failed", "/tmp/attempt-1.json"],
        ["task-2", "cancelled", null],
    ]);
    assert.equal(restored.tasks[0]?.artifactLocator?.goalSnapshot, "/tmp/goal.json");
    assert.equal((await readFile(path, "utf8")).endsWith("\n"), true);
});

test("PromptEvaluationResultRecorder rejects mismatched identities and fake infrastructure scores", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-prompt-result-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const recorder = new PromptEvaluationResultRecorder(join(root, "eval-1"));

    await assert.rejects(recorder.commit(result("eval-2")), /identity/u);
    const invalid = result("eval-1");
    await assert.rejects(recorder.commit({
        ...invalid,
        tasks: [{
            taskId: "task-1",
            status: "infrastructure_error",
            domainResult: { won: false },
            attemptPath: null,
            artifactLocator: null,
            errors: [],
        }],
    }), /Invalid PromptEvaluationTaskResult/u);
});
