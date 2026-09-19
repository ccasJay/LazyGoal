import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import type { LLMAdapter } from "../../packages/llm/src/core/adapter.js";
import type { AgentProfile } from "../../packages/runtime/src/agent-profile.js";
import { runPromptEvaluationCli } from "../src/prompt-evaluation-cli.js";
import {
    PromptEvaluationBenchmarkRegistry,
    type PromptEvaluationBenchmarkAdapter,
} from "../src/prompt-evaluation-runner.js";
import type {
    PromptEvaluationEventV1,
    PromptEvaluationTaskStatus,
} from "../src/prompt-evaluation-protocol.js";

const profile: AgentProfile = {
    id: "gaia-worker-profile",
    name: "Fixture",
    description: "Prompt CLI fixture",
    systemPrompt: "Base Prompt",
    instructions: ["Use submit_answer."],
    toolIds: ["submit_answer"],
};

const llmAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    async generate() { throw new Error("not used"); },
};

test("Prompt Evaluation CLI maps domain failure to success and commits terminal result path", async (t) => {
    const fixture = await createFixture(t);
    const lines: string[] = [];
    const code = await runPromptEvaluationCli(fixture.argv, {
        cwd: fixture.root,
        registry: registryWithStatus("failed"),
        llmAdapter,
        evaluationIdGenerator: () => "eval-domain-failure",
        now: () => "2026-09-20T00:00:00.000Z",
        writeOutput: (line) => lines.push(line),
        writeError: assert.fail,
    });

    assert.equal(code, 0);
    const events = lines.map(parseEvent);
    assert.ok(events.every((event) => event.authoritative === false));
    assert.deepEqual(events.map((event) => event.stage), [
        "accepted",
        "task_started",
        "task_completed",
        "completed",
    ]);
    const terminal = events.at(-1)!;
    assert.ok(terminal.resultPath?.endsWith("/evaluations/eval-domain-failure/result.json"));
    const persisted = JSON.parse(await readFile(terminal.resultPath!, "utf8"));
    assert.equal(persisted.tasks[0].status, "failed");
});

test("Prompt Evaluation CLI maps infrastructure failure and cancellation to stable exits", async (t) => {
    const fixture = await createFixture(t);
    const infrastructureLines: string[] = [];
    const infrastructureCode = await runPromptEvaluationCli(fixture.argv, {
        cwd: fixture.root,
        registry: registryWithStatus("infrastructure_error"),
        llmAdapter,
        evaluationIdGenerator: () => "eval-infra",
        writeOutput: (line) => infrastructureLines.push(line),
        writeError: assert.fail,
    });
    assert.equal(infrastructureCode, 1);
    assert.equal(parseEvent(infrastructureLines.at(-1)!).stage, "infrastructure_error");

    const controller = new AbortController();
    controller.abort();
    const cancellationLines: string[] = [];
    const cancellationCode = await runPromptEvaluationCli(fixture.argv, {
        cwd: fixture.root,
        registry: registryWithStatus("passed"),
        llmAdapter,
        signal: controller.signal,
        evaluationIdGenerator: () => "eval-cancelled",
        writeOutput: (line) => cancellationLines.push(line),
        writeError: assert.fail,
    });
    assert.equal(cancellationCode, 130);
    assert.equal(parseEvent(cancellationLines.at(-1)!).stage, "cancelled");
});

test("Prompt Evaluation CLI rejects invalid request before adapter execution", async (t) => {
    const fixture = await createFixture(t, { unexpected: true });
    let taskCalls = 0;
    const errors: string[] = [];
    const code = await runPromptEvaluationCli(fixture.argv, {
        cwd: fixture.root,
        registry: registryWithStatus("passed", () => taskCalls += 1),
        llmAdapter,
        writeOutput: assert.fail,
        writeError: (line) => errors.push(line),
    });

    assert.equal(code, 2);
    assert.equal(taskCalls, 0);
    assert.match(errors[0]!, /Unknown Prompt Evaluation field/);
});

test("Prompt Evaluation CLI creates new identities for repeated candidate calls", async (t) => {
    const fixture = await createFixture(t);
    let sequence = 0;
    const ids: string[] = [];
    for (let index = 0; index < 2; index += 1) {
        const lines: string[] = [];
        const code = await runPromptEvaluationCli(fixture.argv, {
            cwd: fixture.root,
            registry: registryWithStatus("passed"),
            llmAdapter,
            evaluationIdGenerator: () => `eval-repeat-${++sequence}`,
            writeOutput: (line) => lines.push(line),
            writeError: assert.fail,
        });
        assert.equal(code, 0);
        ids.push(parseEvent(lines.at(-1)!).evaluationId);
    }
    assert.deepEqual(ids, ["eval-repeat-1", "eval-repeat-2"]);
});

function registryWithStatus(
    status: PromptEvaluationTaskStatus,
    onRun?: () => void,
): PromptEvaluationBenchmarkRegistry {
    const adapter: PromptEvaluationBenchmarkAdapter<{ id: string }, { correct: boolean }> = {
        benchmarkId: "gaia",
        async loadManifest() { return [{ id: "task-1" }]; },
        async loadBaseProfile() { return profile; },
        validateCandidateProfile(candidate) { return candidate; },
        taskId(task) { return task.id; },
        async runTask(input) {
            onRun?.();
            const authoritative = status === "passed" || status === "failed";
            return {
                taskId: input.task.id,
                status,
                domainResult: authoritative ? { correct: status === "passed" } : null,
                attemptPath: authoritative ? join(input.outputDirectory, "attempt.json") : null,
                artifactLocator: null,
                errors: status === "infrastructure_error"
                    ? [{ stage: "container", message: "fixture failure" }]
                    : [],
            };
        },
    };
    return new PromptEvaluationBenchmarkRegistry([
        adapter as unknown as PromptEvaluationBenchmarkAdapter<unknown, unknown>,
    ]);
}

async function createFixture(
    t: TestContext,
    extra: Record<string, unknown> = {},
): Promise<{ root: string; argv: string[] }> {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-prompt-cli-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(join(root, "manifest.json"), "{}\n", "utf8");
    await writeFile(join(root, "request.json"), `${JSON.stringify({
        protocol: "prompt-evaluation@1",
        benchmark: { id: "gaia", manifestPath: "manifest.json" },
        candidate: {
            id: "candidate-1",
            baseProfileId: profile.id,
            systemPrompt: "Candidate Prompt",
            instructions: ["Use submit_answer carefully."],
        },
        model: { configId: "default", modelId: "model-1" },
        outputDirectory: "output",
        ...extra,
    })}\n`, "utf8");
    return {
        root,
        argv: ["eval", "prompt", "--request", "request.json"],
    };
}

function parseEvent(line: string): PromptEvaluationEventV1 {
    return JSON.parse(line) as PromptEvaluationEventV1;
}
