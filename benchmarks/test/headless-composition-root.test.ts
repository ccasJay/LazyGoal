import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../packages/contracts/src/index.js";
import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createToolRegistration,
    ExecutionAbortedError,
    TrajectoryAppendError,
    type AgentProfile,
    type Goal,
    type GoalStore,
    isExecutionAbortedError,
    type TrajectoryEvent,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
    type Tool,
} from "../../packages/runtime/src/index.js";
import { InMemoryGoalStore } from "../../packages/storage/src/index.js";
import {
    HeadlessCompositionRoot,
    HeadlessEpisodeCleanupError,
    validateTaskDescriptor,
    type BenchmarkAdapter,
    type BenchmarkPersistenceAdapter,
    type HeadlessCompositionRootDependencies,
} from "../src/headless-composition-root.js";

const profile: AgentProfile = {
    id: "fake-profile",
    systemPrompt: "You are a test agent.",
    instructions: ["Use the available tools."],
    toolIds: ["benchmark_evidence"],
};
const EMPTY_INPUT_CONTRACT = contract.object({});

const evidenceTool: Tool = {
    definition: {
        id: "benchmark_evidence",
        description: "Produce a committed benchmark fact.",
        inputContract: EMPTY_INPUT_CONTRACT,
    },
    replayPolicy: "safe",
    validate: () => ({ ok: true }),
    execute: async () => ({
        kind: "success",
        output: "benchmark evidence",
        summary: "benchmark evidence recorded",
    }),
};
const evidenceRegistration = createToolRegistration(evidenceTool);

class InMemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    async append(draft: Parameters<TrajectoryStore["append"]>[0]): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(draft, this.events.length + 1);
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence),
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(
            await this.read(query),
            committedThroughSequence,
        );
    }
}

function createDependencies<TTask, TOutcome>(
    adapter: BenchmarkAdapter<TTask, TOutcome>,
    trajectoryStore: InMemoryTrajectoryStore,
): HeadlessCompositionRootDependencies<TTask, TOutcome> {
    const goalStore = new InMemoryGoalStore();
    const persistence: BenchmarkPersistenceAdapter<TTask> = {
        namespaceFor: () => "fake-task",
        open: async () => ({
            goalStore,
            trajectoryStore,
            locator: {
                goalSnapshot: "memory://fake/goal",
                trajectory: "memory://fake/trajectory",
            },
        }),
    };
    let modelCalls = 0;
    return {
        benchmarkId: "fake-benchmark",
        workspaceRoot: "/workspace",
        profile,
        llmAdapter: {
            structuredOutputMode: "strict" as const,
            generate: async () => {
                modelCalls += 1;
                return {
                    content: JSON.stringify({
                        result: modelCalls === 1
                            ? {
                                kind: "tool_call",
                                action: {
                                    actionId: "benchmark-evidence-1",
                                    toolId: "benchmark_evidence",
                                    input: {},
                                },
                                memoryPatch: null,
                            }
                            : {
                                kind: "complete",
                                summary: "done",
                                completionEvidence: [{
                                    criterionIndex: 0,
                                    evidenceSequences: [latestObservationSequence(trajectoryStore)],
                                }],
                                memoryPatch: null,
                            },
                    }),
                };
            },
        },
        renderer: { render: () => "system" },
        contextCompactor: { compact: async (units) => units },
        adapter: {
            describeTask: adapter.describeTask,
            createEpisode: async (task, context) => {
                const episode = await adapter.createEpisode(task, context);
                return {
                    ...episode,
                    registry: {
                        get(toolId: string) {
                            return toolId === evidenceTool.definition.id
                                ? evidenceRegistration
                                : episode.registry.get(toolId);
                        },
                    },
                };
            },
        },
        persistence,
        goalIdGenerator: () => "goal-fake",
        runIdGenerator: () => "run-fake",
    };
}

function latestObservationSequence(
    trajectoryStore: InMemoryTrajectoryStore,
): number {
    const observation = [...trajectoryStore.events]
        .reverse()
        .find((event) => event.eventType === "observation_recorded");
    assert.ok(observation, "the benchmark completion must follow a committed observation");
    return observation.sequence;
}

test("runs a task through preparation, planning, approval and executing", async () => {
    type Task = { readonly prompt: string };
    type Outcome = { readonly answer: number };
    let created = 0;
    let closed = 0;
    const adapter: BenchmarkAdapter<Task, Outcome> = {
        describeTask: (task) => ({
            intent: task.prompt,
            objective: "Return the expected answer",
            completionCriteria: ["The test environment confirms the answer"],
            maxSteps: 5,
        }),
        createEpisode: async (_task, context) => {
            assert.equal(context.workspaceRoot, "/workspace");
            assert.equal(context.profile.id, profile.id);
            created += 1;
            return {
                registry: { get: () => undefined },
                readOutcome: () => ({ answer: 42 }),
                close: async () => {
                    closed += 1;
                },
            };
        },
    };
    const trajectoryStore = new InMemoryTrajectoryStore();
    const root = new HeadlessCompositionRoot(
        createDependencies(adapter, trajectoryStore),
    );

    const result = await root.run({ prompt: "Solve the test task" });

    assert.equal(created, 1);
    assert.equal(closed, 1);
    assert.equal(result.progress.ok, true);
    assert.equal(result.progress.kind, "terminal");
    assert.equal(result.goal.state.workflow.phase, "executing");
    assert.equal(result.goal.state.run.status, "completed");
    assert.equal(result.model.completed, true);
    assert.equal(result.model.runStatus, "completed");
    assert.deepEqual(result.outcome, { answer: 42 });
    assert.equal(result.runner?.ok, true);
    assert.deepEqual(
        trajectoryStore.events
            .filter((event) => event.eventType === "preparation_result")
            .map((event) => event.payload.result),
        ["context_ready", "task_proposal"],
    );
});

test("the same Root contract supports a different task and outcome shape", async () => {
    type Task = { readonly values: readonly number[] };
    type Outcome = { readonly accepted: boolean; readonly count: number };
    const adapter: BenchmarkAdapter<Task, Outcome> = {
        describeTask: (task) => ({
            intent: `Process ${task.values.length} values`,
            objective: "Process all values",
            completionCriteria: ["The environment accepts the values"],
            maxSteps: 2,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ accepted: true, count: 3 }),
            close: async () => undefined,
        }),
    };
    const root = new HeadlessCompositionRoot(
        createDependencies(adapter, new InMemoryTrajectoryStore()),
    );

    const result = await root.run({ values: [1, 2, 3] });

    assert.equal(result.model.completed, true);
    assert.deepEqual(result.outcome, { accepted: true, count: 3 });
});

test("aggregates normalized usage across model calls and counts missing usage calls", async () => {
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a usage aggregation test",
            objective: "Aggregate model usage",
            completionCriteria: ["The environment accepts completion"],
            maxSteps: 5,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: true }),
            close: async () => undefined,
        }),
    };
    const trajectoryStore = new InMemoryTrajectoryStore();
    const dependencies = createDependencies(adapter, trajectoryStore);
    let modelCalls = 0;
    dependencies.llmAdapter.generate = async () => {
        modelCalls += 1;
        if (modelCalls === 1) {
            return {
                content: JSON.stringify({
                    result: {
                        kind: "tool_call",
                        action: {
                            actionId: "benchmark-evidence-1",
                            toolId: "benchmark_evidence",
                            input: {},
                        },
                        memoryPatch: null,
                    },
                }),
                providerMetadata: {
                    usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 10 },
                },
            };
        }
        if (modelCalls === 2) {
            return {
                content: JSON.stringify({
                    result: {
                        kind: "tool_call",
                        action: {
                            actionId: "benchmark-evidence-2",
                            toolId: "benchmark_evidence",
                            input: {},
                        },
                        memoryPatch: null,
                    },
                }),
            };
        }
        return {
            content: JSON.stringify({
                result: {
                    kind: "complete",
                    summary: "done",
                    completionEvidence: [{
                        criterionIndex: 0,
                        evidenceSequences: [latestObservationSequence(trajectoryStore)],
                    }],
                    memoryPatch: null,
                },
            }),
            providerMetadata: {
                usage: { inputTokens: 50, outputTokens: 5 },
            },
        };
    };
    const root = new HeadlessCompositionRoot(dependencies);

    const result = await root.run({ id: "usage-aggregation" });

    assert.equal(result.model.completed, true);
    assert.equal(modelCalls, 3);
    assert.deepEqual(result.model.usage, {
        inputTokens: 150,
        outputTokens: 25,
        missingCalls: 1,
    });
});

test("does not record usage when the model call fails", async () => {
    const modelError = new Error("model unavailable");
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a usage failure test",
            objective: "Fail before usage is recorded",
            completionCriteria: ["The failure is reported"],
            maxSteps: 2,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => undefined,
        }),
    };
    const dependencies = createDependencies(adapter, new InMemoryTrajectoryStore());
    dependencies.llmAdapter.generate = async () => {
        throw modelError;
    };
    const root = new HeadlessCompositionRoot(dependencies);

    const result = await root.run({ id: "usage-failure" });

    assert.equal(result.model.runStatus, "failed");
    assert.equal(result.model.completed, false);
    assert.equal(result.model.usage, undefined);
});

test("reports a cleanup failure without changing a successful outcome", async () => {
    const cleanupError = new Error("environment close failed");
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a cleanup test",
            objective: "Finish the cleanup test",
            completionCriteria: ["The test environment accepts completion"],
            maxSteps: 2,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: true }),
            close: async () => {
                throw cleanupError;
            },
        }),
    };
    const root = new HeadlessCompositionRoot(
        createDependencies(adapter, new InMemoryTrajectoryStore()),
    );

    const result = await root.run({ id: "cleanup" });

    assert.equal(result.model.completed, true);
    assert.strictEqual(result.cleanupError, cleanupError);
    assert.deepEqual(result.outcome, { ok: true });
});

test("preserves the primary failure when execution and cleanup both fail", async () => {
    const primaryError = new Error("model failed");
    const cleanupError = new Error("environment close failed");
    const goalStore = new InMemoryGoalStore();
    let saveCalls = 0;
    const failingGoalStore: GoalStore = {
        save: async (goal: Goal) => {
            saveCalls += 1;
            if (saveCalls === 2) throw primaryError;
            await goalStore.save(goal);
        },
        restore: (goalId) => goalStore.restore(goalId),
    };
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a failure test",
            objective: "Reach the failure boundary",
            completionCriteria: ["The failure is reported"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                throw cleanupError;
            },
        }),
    };
    const dependencies = createDependencies(
        adapter,
        new InMemoryTrajectoryStore(),
    );
    dependencies.persistence.open = async () => ({
        goalStore: failingGoalStore,
        trajectoryStore: new InMemoryTrajectoryStore(),
        locator: {
            goalSnapshot: "memory://fake/goal",
            trajectory: "memory://fake/trajectory",
        },
    });
    dependencies.llmAdapter.generate = async () => ({
        content: JSON.stringify({
            kind: "complete",
            summary: "done",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [] }],
        }),
    });
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(
        () => root.run({ id: "failure" }),
        (error: unknown) => {
            assert.ok(error instanceof HeadlessEpisodeCleanupError);
            assert.strictEqual(error.primaryError, primaryError);
            assert.strictEqual(error.cleanupError, cleanupError);
            return true;
        },
    );
});

test("keeps abort semantics and closes an episode exactly once", async () => {
    const controller = new AbortController();
    let closed = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run an abort test",
            objective: "Stop after cancellation",
            completionCriteria: ["The call reports an abort"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                closed += 1;
            },
        }),
    };
    const dependencies = createDependencies(
        adapter,
        new InMemoryTrajectoryStore(),
    );
    dependencies.llmAdapter.generate = async () => {
        controller.abort();
        return {
            content: JSON.stringify({
                kind: "complete",
                summary: "should not commit",
                completionEvidence: [{ criterionIndex: 0, evidenceSequences: [] }],
            }),
        };
    };
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(
        () => root.run({ id: "abort" }, { signal: controller.signal }),
        (error: unknown) => {
            assert.equal(isExecutionAbortedError(error), true);
            assert.ok(error instanceof ExecutionAbortedError);
            return true;
        },
    );
    assert.equal(closed, 1);
});

test("does not create an Episode or call the model when persistence cannot open", async () => {
    const openError = new Error("persistence unavailable");
    let created = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run an open failure test",
            objective: "Do not start",
            completionCriteria: ["The persistence error is visible"],
            maxSteps: 1,
        }),
        createEpisode: async () => {
            created += 1;
            return {
                registry: { get: () => undefined },
                readOutcome: () => ({ ok: false }),
                close: async () => undefined,
            };
        },
    };
    const dependencies = createDependencies(adapter, new InMemoryTrajectoryStore());
    dependencies.persistence.open = async () => {
        throw openError;
    };
    let modelCalls = 0;
    dependencies.llmAdapter.generate = async () => {
        modelCalls += 1;
        return { content: "{}" };
    };
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(() => root.run({ id: "open-failure" }), openError);
    assert.equal(created, 0);
    assert.equal(modelCalls, 0);
});

test("reports a required Goal Snapshot write failure and closes the Episode", async () => {
    const saveError = new Error("snapshot write failed");
    let closed = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a snapshot failure test",
            objective: "Stop when the snapshot cannot be saved",
            completionCriteria: ["The write failure is reported"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                closed += 1;
            },
        }),
    };
    const dependencies = createDependencies(adapter, new InMemoryTrajectoryStore());
    const failingStore: GoalStore = {
        save: async () => {
            throw saveError;
        },
        restore: async () => undefined,
    };
    dependencies.persistence.open = async () => ({
        goalStore: failingStore,
        trajectoryStore: new InMemoryTrajectoryStore(),
        locator: {
            goalSnapshot: "memory://failure/goal",
            trajectory: "memory://failure/trajectory",
        },
    });
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(() => root.run({ id: "snapshot-failure" }), saveError);
    assert.equal(closed, 1);
});

test("stops before the model when the first Trajectory append fails", async () => {
    const trajectoryStore = new InMemoryTrajectoryStore();
    const trajectoryError = new Error("trajectory unavailable");
    trajectoryStore.append = async () => {
        throw trajectoryError;
    };
    let modelCalls = 0;
    let closed = 0;
    const adapter: BenchmarkAdapter<{ readonly id: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run a trajectory failure test",
            objective: "Stop before execution",
            completionCriteria: ["The trajectory failure is reported"],
            maxSteps: 1,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: false }),
            close: async () => {
                closed += 1;
            },
        }),
    };
    const dependencies = createDependencies(adapter, trajectoryStore);
    dependencies.llmAdapter.generate = async () => {
        modelCalls += 1;
        return { content: "{}" };
    };
    const root = new HeadlessCompositionRoot(dependencies);

    await assert.rejects(
        () => root.run({ id: "trajectory-failure" }),
        (error: unknown) => {
            assert.ok(error instanceof TrajectoryAppendError);
            assert.equal(error.cause, trajectoryError);
            return true;
        },
    );
    assert.equal(modelCalls, 0);
    assert.equal(closed, 1);
});

test("isolates a Trace sink failure from the successful Runtime result", async () => {
    const traceError = new Error("trace unavailable");
    const trajectoryStore = new InMemoryTrajectoryStore();
    const dependencies = createDependencies(
        {
            describeTask: () => ({
                intent: "Run a trace failure test",
                objective: "Complete while trace is unavailable",
                completionCriteria: ["The Runtime completes"],
                maxSteps: 2,
            }),
            createEpisode: async () => ({
                registry: { get: () => undefined },
                readOutcome: () => ({ ok: true }),
                close: async () => undefined,
            }),
        },
        trajectoryStore,
    );
    dependencies.persistence.open = async () => ({
        goalStore: new InMemoryGoalStore(),
        trajectoryStore,
        traceSink: {
            append: async () => {
                throw traceError;
            },
        },
        locator: {
            goalSnapshot: "memory://trace/goal",
            trajectory: "memory://trace/trajectory",
            diagnosticTrace: "memory://trace/diagnostic",
        },
    });
    const root = new HeadlessCompositionRoot(dependencies);

    const result = await root.run({ id: "trace-failure" });

    assert.equal(result.model.completed, true);
    assert.equal(result.cleanupError, undefined);
});

test("validateTaskDescriptor normalizes string and structured criteria and validates tools against profile", () => {
    const validDescriptor = {
        intent: "Test intent",
        objective: "Test objective",
        completionCriteria: [
            "String criterion",
            { text: "Plain structured criterion" },
            {
                text: "Structured with acceptance",
                acceptance: {
                    expectToolId: "benchmark_evidence",
                    expectOutcome: "success" as const,
                },
            },
        ],
        maxSteps: 10,
    };

    const normalized = validateTaskDescriptor(validDescriptor, profile);
    assert.deepEqual(normalized.completionCriteria, [
        { text: "String criterion" },
        { text: "Plain structured criterion" },
        {
            text: "Structured with acceptance",
            acceptance: {
                expectToolId: "benchmark_evidence",
                expectOutcome: "success",
            },
        },
    ]);

    // Unauthorized tool in profile
    assert.throws(
        () => validateTaskDescriptor({
            ...validDescriptor,
            completionCriteria: [{
                text: "Requires unauthorized tool",
                acceptance: {
                    expectToolId: "unauthorized_tool",
                    expectOutcome: "success",
                },
            }],
        }, profile),
        (error: unknown) => {
            assert.ok(error instanceof TypeError);
            assert.match(error.message, /not present in agent profile/);
            return true;
        },
    );

    // Invalid expectOutcome
    assert.throws(
        () => validateTaskDescriptor({
            ...validDescriptor,
            completionCriteria: [{
                text: "Invalid outcome",
                acceptance: {
                    expectToolId: "benchmark_evidence",
                    expectOutcome: "invalid" as unknown as "success",
                },
            }],
        }),
        (error: unknown) => {
            assert.ok(error instanceof TypeError);
            assert.match(error.message, /expectOutcome must be "success" or "failure"/);
            return true;
        },
    );

    // Invalid acceptance shape
    assert.throws(
        () => validateTaskDescriptor({
            ...validDescriptor,
            completionCriteria: [{
                text: "Invalid acceptance",
                acceptance: "not-an-object" as unknown as { expectToolId: string; expectOutcome: "success" },
            }],
        }),
        (error: unknown) => {
            assert.ok(error instanceof TypeError);
            assert.match(error.message, /acceptance must be an object/);
            return true;
        },
    );
});

test("injects structured completion criteria with acceptance into Goal Task during headless execution", async () => {
    type Task = { readonly prompt: string };
    type Outcome = { readonly ok: boolean };

    const adapter: BenchmarkAdapter<Task, Outcome> = {
        describeTask: (task) => ({
            intent: task.prompt,
            objective: "Complete task with verifiable evidence",
            completionCriteria: [
                "String criterion",
                {
                    text: "Evidence produced by tool",
                    acceptance: {
                        expectToolId: "benchmark_evidence",
                        expectOutcome: "success",
                    },
                },
            ],
            maxSteps: 5,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => ({ ok: true }),
            close: async () => undefined,
        }),
    };

    const trajectoryStore = new InMemoryTrajectoryStore();
    const dependencies = createDependencies(adapter, trajectoryStore);

    // Provide completionEvidence referencing both criteria
    let modelCalls = 0;
    dependencies.llmAdapter.generate = async () => {
        modelCalls += 1;
        if (modelCalls === 1) {
            return {
                content: JSON.stringify({
                    result: {
                        kind: "tool_call",
                        action: {
                            actionId: "benchmark-evidence-1",
                            toolId: "benchmark_evidence",
                            input: {},
                        },
                        memoryPatch: null,
                    },
                }),
            };
        }
        const obsSeq = latestObservationSequence(trajectoryStore);
        return {
            content: JSON.stringify({
                result: {
                    kind: "complete",
                    summary: "done",
                    completionEvidence: [
                        {
                            criterionIndex: 0,
                            evidenceSequences: [obsSeq],
                        },
                        {
                            criterionIndex: 1,
                            evidenceSequences: [obsSeq],
                        },
                    ],
                    memoryPatch: null,
                },
            }),
        };
    };

    const root = new HeadlessCompositionRoot(dependencies);
    const result = await root.run({ prompt: "Verify structured criteria injection" });

    assert.equal(result.model.completed, true);
    assert.equal(result.goal.state.workflow.phase, "executing");
    if (result.goal.state.workflow.phase === "executing") {
        assert.deepEqual(result.goal.state.workflow.task.completionCriteria, [
            { text: "String criterion" },
            {
                text: "Evidence produced by tool",
                acceptance: {
                    expectToolId: "benchmark_evidence",
                    expectOutcome: "success",
                },
            },
        ]);
    }
});

test("fails before creating episode when task descriptor requires an unauthorized tool", async () => {
    let episodeCreated = 0;
    const adapter: BenchmarkAdapter<{ readonly prompt: string }, { readonly ok: boolean }> = {
        describeTask: () => ({
            intent: "Run unauthorized tool test",
            objective: "Expect fast failure",
            completionCriteria: [
                {
                    text: "Requires missing tool",
                    acceptance: {
                        expectToolId: "unauthorized_tool",
                        expectOutcome: "success",
                    },
                },
            ],
            maxSteps: 5,
        }),
        createEpisode: async () => {
            episodeCreated += 1;
            return {
                registry: { get: () => undefined },
                readOutcome: () => ({ ok: false }),
                close: async () => undefined,
            };
        },
    };

    const root = new HeadlessCompositionRoot(
        createDependencies(adapter, new InMemoryTrajectoryStore()),
    );

    await assert.rejects(
        () => root.run({ prompt: "unauthorized" }),
        (error: unknown) => {
            assert.ok(error instanceof TypeError);
            assert.match(error.message, /not present in agent profile/);
            return true;
        },
    );
    assert.equal(episodeCreated, 0);
});


test("pi-ai diagnostic usage stays out of benchmark totals and counts as missing", async () => {
    const { createServer } = await import("node:http");
    const { once } = await import("node:events");
    const { createLlmAdapter } = await import("../../packages/llm/src/factory.js");
    const { readLlmConfig } = await import("../../packages/llm/src/config.js");
    const trajectoryStore = new InMemoryTrajectoryStore();
    const dependencies = createDependencies({
        describeTask: () => ({ intent: "Verify pi usage", objective: "Record evidence", completionCriteria: ["Record evidence"], maxSteps: 3 }),
        createEpisode: async () => ({ registry: { get: () => undefined }, readOutcome: () => true, close: async () => undefined }),
    }, trajectoryStore);
    let calls = 0;
    const server = createServer((req, res) => {
        req.resume();
        calls += 1;
        const result = calls === 1
            ? { kind: "tool_call", action: { actionId: "pi-evidence", toolId: "benchmark_evidence", input: {} }, memoryPatch: null }
            : { kind: "complete", summary: "done", completionEvidence: [{ criterionIndex: 0, evidenceSequences: [latestObservationSequence(trajectoryStore)] }], memoryPatch: null };
        res.setHeader("Content-Type", "text/event-stream");
        res.end(`data: ${JSON.stringify({
            id: "pi-usage", model: "local-model", choices: [{ index: 0, delta: { role: "assistant", content: JSON.stringify({ result }) }, finish_reason: "stop" }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
        })}\n\ndata: [DONE]\n\n`);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
        const llmAdapter = createLlmAdapter(readLlmConfig({
            LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "test-key", LLM_MODEL: "local-model",
            LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`, LLM_STRUCTURED_OUTPUT_MODE: "prompt_only",
            LLM_CONTEXT_WINDOW_TOKENS: "8192", LLM_MAX_OUTPUT_TOKENS: "1024",
        }));
        const root = new HeadlessCompositionRoot({ ...dependencies, llmAdapter });
        const result = await root.run({ id: "pi-usage" });
        assert.equal(result.model.completed, true);
        assert.equal(calls, 2);
        assert.deepEqual(result.model.usage, { inputTokens: 0, outputTokens: 0, missingCalls: 2 });
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
