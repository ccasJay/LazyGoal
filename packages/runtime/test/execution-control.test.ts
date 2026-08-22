import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    ExecutionAbortedError,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    throwIfAborted,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import type {
    AgentDecision,
    AgentProfile,
    Goal,
    GoalStore,
    PreparationExecutor,
    RunnerResult,
    RunExecutionOptions,
    RunRef,
    StepExecutor,
    Tool,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Stop promptly when the execution signal is aborted."],
    toolIds: [],
};

function createExecutingGoal(
    toolIds: readonly string[] = [],
): Goal {
    const goal = createGoal({
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "Test abort propagation",
        profile: { ...profile, toolIds: [...toolIds] },
        runId: "run-1",
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: goal.definition.intent,
                    completionCriteria: ["Abort is not converted into a failure"],
                },
            },
            run: {
                ...goal.state.run,
                status: "running",
            },
        },
    };
}

async function seed(store: GoalStore, goal: Goal): Promise<void> {
    await store.save(goal);
}

test("throwIfAborted uses the dedicated execution abort error", () => {
    const controller = new AbortController();
    controller.abort();

    assert.throws(
        () => throwIfAborted({ signal: controller.signal }),
        (error: unknown) => {
            assert.ok(error instanceof ExecutionAbortedError);
            assert.equal(error.code, "EXECUTION_ABORTED");
            return true;
        },
    );
});

test("Runner propagates control into an executor and preserves the last snapshot", async () => {
    const controller = new AbortController();
    const goal = createExecutingGoal();
    const store = new InMemoryGoalStore();
    await seed(store, goal);
    let started: (() => void) | undefined;
    const executorStarted = new Promise<void>((resolve) => {
        started = resolve;
    });
    const executor: StepExecutor = {
        async execute(
            _goal,
            _tools,
            control,
        ): Promise<AgentDecision> {
            assert.strictEqual(control?.signal, controller.signal);
            started?.();
            await new Promise<void>((resolve) => {
                control?.signal?.addEventListener("abort", () => resolve(), {
                    once: true,
                });
            });
            return {
                kind: "complete",
                checkpoint: "unreachable",
                summary: "unreachable",
            };
        },
    };
    const runner = new Runner({ store, executor });
    const operation = runner.run(
        { goalId: goal.id, runId: goal.state.run.id },
        {},
        { signal: controller.signal },
    );

    await executorStarted;
    controller.abort();

    await assert.rejects(
        operation,
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.deepEqual(await store.restore(goal.id), goal);
});

test("Runner aborts after a model result without saving a failure", async () => {
    const controller = new AbortController();
    const goal = createExecutingGoal();
    const delegate = new InMemoryGoalStore();
    await delegate.save(goal);
    let saveCalls = 0;
    const store: GoalStore = {
        restore: (goalId) => delegate.restore(goalId),
        save: async (nextGoal) => {
            saveCalls += 1;
            await delegate.save(nextGoal);
        },
    };
    const executor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            controller.abort();
            return {
                kind: "complete",
                checkpoint: "not persisted",
                summary: "not persisted",
            };
        },
    };
    const runner = new Runner({ store, executor });

    await assert.rejects(
        () => runner.run(
            { goalId: goal.id, runId: goal.state.run.id },
            { signal: controller.signal },
        ),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.equal(saveCalls, 0);
    assert.deepEqual(await delegate.restore(goal.id), goal);
});

test("Runner keeps an approved pending Action when Tool execution is aborted", async () => {
    const controller = new AbortController();
    const goal = createExecutingGoal(["echo"]);
    const store = new InMemoryGoalStore();
    await seed(store, goal);
    let started: (() => void) | undefined;
    const toolStarted = new Promise<void>((resolve) => {
        started = resolve;
    });
    const tool: Tool = {
        definition: {
            id: "echo",
            description: "Echo input",
            inputSchema: { type: "object" },
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute(_request, control) {
            assert.strictEqual(control?.signal, controller.signal);
            started?.();
            await new Promise<void>((resolve) => {
                control?.signal?.addEventListener("abort", () => resolve(), {
                    once: true,
                });
            });
            return {
                kind: "success",
                output: "unreachable",
                summary: "unreachable",
            };
        },
    };
    const executor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            return {
                kind: "tool_call",
                checkpoint: "Action staged before execution",
                action: {
                    actionId: "action-1",
                    toolId: "echo",
                    input: { value: "hello" },
                },
            };
        },
    };
    const runner = new Runner({
        store,
        executor,
        toolRegistry: { get: (toolId) => toolId === "echo" ? tool : undefined },
    });
    const operation = runner.run(
        { goalId: goal.id, runId: goal.state.run.id },
        {},
        { signal: controller.signal },
    );

    await toolStarted;
    controller.abort();

    await assert.rejects(
        operation,
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    const latest = await store.restore(goal.id);
    assert.equal(latest?.state.run.status, "running");
    assert.equal(latest?.state.run.stepCount, 0);
    assert.equal(latest?.state.run.pendingAction?.status, "approved");
    assert.equal(latest?.state.run.lastStep, undefined);
});

test("InlineScheduler forwards and checks the shared execution control", async () => {
    const controller = new AbortController();
    let receivedControl: unknown;
    const result: RunnerResult = {
        ok: true,
        state: { id: "run-1", status: "waiting", stepCount: 0 },
    };
    const runner = {
        async runUntilBlocked(
            _ref: RunRef,
            _options?: RunExecutionOptions,
            control?: { readonly signal?: AbortSignal },
        ): Promise<RunnerResult> {
            receivedControl = control;
            controller.abort();
            return result;
        },
    };
    const scheduler = new InlineScheduler(runner);

    await assert.rejects(
        () => scheduler.schedule(
            { goalId: "goal-1", runId: "run-1" },
            undefined,
            { signal: controller.signal },
        ),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.deepEqual(receivedControl, { signal: controller.signal });
});

test("GoalCoordinator does not save a preparation result after abort", async () => {
    const controller = new AbortController();
    const goal = createGoal({
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "Test preparation abort",
        profile,
        runId: "run-1",
    });
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const preparationExecutor: PreparationExecutor = {
        async execute(_goal, control) {
            assert.strictEqual(control?.signal, controller.signal);
            controller.abort();
            return { kind: "context_ready" };
        },
    };
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor,
        scheduler: {
            async schedule(): Promise<RunnerResult> {
                throw new Error("Scheduler must not be reached");
            },
        },
    });

    await assert.rejects(
        () => coordinator.advance(
            { goalId: goal.id, runId: goal.state.run.id },
            { signal: controller.signal },
        ),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.deepEqual(await store.restore(goal.id), goal);
});
