import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../packages/llm/src/core/adapter.js";
import type { AgentProfile } from "../../packages/runtime/src/agent-profile.js";
import type { PromptEvaluationRequestV1 } from "../src/prompt-evaluation-protocol.js";
import {
    PromptEvaluationBenchmarkRegistry,
    PromptEvaluationRunner,
    PromptEvaluationRunnerError,
    type PromptEvaluationBenchmarkAdapter,
    type PromptEvaluationTaskInput,
} from "../src/prompt-evaluation-runner.js";

interface FixtureTask {
    readonly id: string;
    readonly passed: boolean;
}

const baseProfile: AgentProfile = Object.freeze({
    id: "alfworld-profile",
    systemPrompt: "Base",
    instructions: Object.freeze(["Base instruction"]),
    toolIds: Object.freeze(["read_file"]),
});

const request: PromptEvaluationRequestV1 = Object.freeze({
    protocol: "prompt-evaluation@1",
    benchmark: Object.freeze({ id: "alfworld", manifestPath: "/tmp/manifest.json" }),
    candidate: Object.freeze({
        id: "candidate-1",
        baseProfileId: baseProfile.id,
        systemPrompt: "Candidate",
        instructions: Object.freeze(["Candidate instruction"]),
    }),
    model: Object.freeze({ configId: "default", modelId: "model-1" }),
    outputDirectory: "/tmp/output",
});

const llmAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    async generate() {
        throw new Error("Fixture adapter must not call the model");
    },
};

function createAdapter(
    tasks: readonly FixtureTask[],
    runTask: (input: PromptEvaluationTaskInput<FixtureTask>) => Promise<{
        readonly taskId: string;
        readonly status: "passed" | "failed" | "infrastructure_error" | "cancelled";
        readonly domainResult: { readonly won: boolean } | null;
        readonly attemptPath: string | null;
        readonly errors: readonly [];
    }>,
): PromptEvaluationBenchmarkAdapter<FixtureTask, { readonly won: boolean }> {
    return {
        benchmarkId: "alfworld",
        async loadManifest() { return tasks; },
        async loadBaseProfile() { return baseProfile; },
        validateCandidateProfile(profile) { return profile; },
        taskId(task) { return task.id; },
        runTask,
    };
}

function registry(adapter: PromptEvaluationBenchmarkAdapter<FixtureTask, { readonly won: boolean }>) {
    return new PromptEvaluationBenchmarkRegistry([adapter]);
}

test("PromptEvaluationRunner preserves adapter domain judgments and creates isolated task contexts", async () => {
    const inputs: PromptEvaluationTaskInput<FixtureTask>[] = [];
    const adapter = createAdapter([
        { id: "task-1", passed: true },
        { id: "task-2", passed: false },
    ], async (input) => {
        inputs.push(input);
        return {
            taskId: input.task.id,
            status: input.task.passed ? "passed" : "failed",
            domainResult: { won: input.task.passed },
            attemptPath: `/tmp/${input.task.id}.json`,
            errors: [],
        };
    });
    const events: string[] = [];
    const runner = new PromptEvaluationRunner({
        registry: registry(adapter),
        evaluationIdGenerator: () => "eval-1",
        now: () => "2026-09-20T00:00:00.000Z",
    });

    const result = await runner.run(request, {
        llmAdapter,
        onEvent(event) { events.push(`${event.type}:${event.stage}:${event.taskId ?? "-"}`); },
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(result.tasks.map((task) => [task.taskId, task.status, task.domainResult]), [
        ["task-1", "passed", { won: true }],
        ["task-2", "failed", { won: false }],
    ]);
    assert.equal(inputs.length, 2);
    assert.notEqual(inputs[0], inputs[1]);
    assert.notEqual(inputs[0]?.outputDirectory, inputs[1]?.outputDirectory);
    assert.deepEqual(inputs[0]?.profile.toolIds, baseProfile.toolIds);
    assert.equal(inputs[0]?.profile.systemPrompt, "Candidate");
    assert.deepEqual(events, [
        "progress:accepted:-",
        "progress:task_started:task-1",
        "progress:task_completed:task-1",
        "progress:task_started:task-2",
        "progress:task_completed:task-2",
        "terminal:completed:-",
    ]);
});

test("PromptEvaluationRunner stops starting tasks after cancellation and lists the remainder", async () => {
    const controller = new AbortController();
    const called: string[] = [];
    const adapter = createAdapter([
        { id: "task-1", passed: false },
        { id: "task-2", passed: true },
        { id: "task-3", passed: true },
    ], async (input) => {
        called.push(input.task.id);
        controller.abort();
        return {
            taskId: input.task.id,
            status: "cancelled",
            domainResult: null,
            attemptPath: null,
            errors: [],
        };
    });
    const runner = new PromptEvaluationRunner({
        registry: registry(adapter),
        evaluationIdGenerator: () => "eval-cancelled",
    });

    const result = await runner.run(request, { llmAdapter, signal: controller.signal });

    assert.deepEqual(called, ["task-1"]);
    assert.equal(result.status, "cancelled");
    assert.deepEqual(result.tasks.map((task) => [task.taskId, task.status]), [
        ["task-1", "cancelled"],
        ["task-2", "cancelled"],
        ["task-3", "cancelled"],
    ]);
});

test("PromptEvaluationBenchmarkRegistry rejects duplicate and missing adapters", () => {
    const adapter = createAdapter([{ id: "task-1", passed: true }], async (input) => ({
        taskId: input.task.id,
        status: "passed",
        domainResult: { won: true },
        attemptPath: null,
        errors: [],
    }));
    assert.throws(
        () => new PromptEvaluationBenchmarkRegistry([adapter, adapter]),
        (error: unknown) => error instanceof PromptEvaluationRunnerError
            && error.code === "DUPLICATE_BENCHMARK",
    );
    const empty = new PromptEvaluationBenchmarkRegistry([]);
    assert.throws(
        () => empty.require("gaia"),
        (error: unknown) => error instanceof PromptEvaluationRunnerError
            && error.code === "UNSUPPORTED_BENCHMARK",
    );
});
