import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createRun,
    createStepExecutor,
    createToolGrantMatcher,
    createToolRegistration,
    ExecutionAbortedError,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    TransientModelRequestFailure,
    TransientToolExecutionFailure,
    transition,
} from "../src/index";
import {
    contract,
    type InferContract,
} from "../../contracts/src/index";
import { BASH_INPUT_CONTRACT } from "../../tools/src/bash";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    currentProtocols,
    InMemoryTrajectoryStore,
    trajectoryStoreFor,
} from "./current-fixtures";
import type {
    AgentDecision,
    AgentProfile,
    Goal,
    GoalMessage,
    GoalStore,
    GoalTask,
    RunInput,
    RunnerResult,
    RunRef,
    RunState,
    RuntimeFeedback,
    StepExecutionInput,
    StepExecutor,
    Tool,
    ToolDefinition,
    ToolPolicy,
    ToolRegistration,
    ToolRegistry,
    ToolGrant,
} from "../src/index";

const goalDefinition: GoalTask = {
    objective: "完成最小同步 Goal Loop",
    completionCriteria: [],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["逐步完成目标"],
    toolIds: [],
};

const toolProfile: AgentProfile = { ...profile, toolIds: ["read_file"] };
const TEST_INPUT_CONTRACT = contract.record(contract.string());
const PATH_INPUT_CONTRACT = contract.object({ path: contract.string() });

type TestTool = Tool<typeof TEST_INPUT_CONTRACT>;
type PathInput = InferContract<typeof PATH_INPUT_CONTRACT>;

type ExecuteAction = (
    goal: Goal,
) => AgentDecision | Promise<AgentDecision>;

class FakeStepExecutor implements StepExecutor {
    async reviewCompletion() { return { kind: "accept" as const }; }
    readonly receivedGoals: Goal[] = [];
    readonly receivedInputs: StepExecutionInput[] = [];

    constructor(
        private readonly actions: readonly ExecuteAction[],
        private readonly events: string[] = [],
    ) {}

    async execute(input: StepExecutionInput): Promise<AgentDecision> {
        const { goal } = input;
        const action = this.actions[this.receivedGoals.length];
        this.receivedGoals.push(goal);
        this.receivedInputs.push(input);
        this.events.push(`execute:${goal.state.run.status}:${goal.state.run.stepCount}`);

        if (action === undefined) {
            throw new Error("Unexpected StepExecutor call");
        }

        return action(goal);
    }

    async decide(input: StepExecutionInput): Promise<{ kind: "decision"; decision: AgentDecision }> {
        const decision = await this.execute(input);
        return { kind: "decision", decision };
    }

    async think(): Promise<never> {
        throw new Error("think not supported in test");
    }
}

class FakeDecisionExecutor implements StepExecutor {
    async reviewCompletion() { return { kind: "accept" as const }; }
    readonly receivedTools: ToolDefinition[][] = [];
    readonly receivedFeedback: (RuntimeFeedback | undefined)[] = [];

    constructor(private readonly decision: AgentDecision) {}

    async execute({ authorizedTools, runtimeFeedback }: StepExecutionInput): Promise<AgentDecision> {
        this.receivedTools.push([...authorizedTools]);
        this.receivedFeedback.push(runtimeFeedback);
        return structuredClone(this.decision);
    }

    async decide(input: StepExecutionInput): Promise<{ kind: "decision"; decision: AgentDecision }> {
        const decision = await this.execute(input);
        return { kind: "decision", decision };
    }

    async think(): Promise<never> {
        throw new Error("think not supported in test");
    }
}

class SequenceDecisionExecutor implements StepExecutor {
    async reviewCompletion() { return { kind: "accept" as const }; }
    readonly receivedGoals: Goal[] = [];
    private index = 0;

    constructor(
        private readonly decisions: readonly AgentDecision[],
        private readonly events: string[] = [],
    ) {}

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.receivedGoals.push(goal);
        this.events.push(`executor:${goal.state.run.stepCount}`);
        const decision = this.decisions[this.index];
        this.index += 1;

        if (decision === undefined) {
            throw new Error("Unexpected AgentDecision call");
        }

        return structuredClone(decision);
    }

    async decide(input: StepExecutionInput): Promise<{ kind: "decision"; decision: AgentDecision }> {
        const decision = await this.execute(input);
        return { kind: "decision", decision };
    }

    async think(): Promise<never> {
        throw new Error("think not supported in test");
    }
}

function createRunnerTool(
    execute: TestTool["execute"],
    validate: TestTool["validate"] = () => ({ ok: true }),
): TestTool {
    return {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate,
        execute,
    };
}

function registerTool(tool: TestTool) {
    return createToolRegistration(tool);
}

function countPrepareCalls(registration: ToolRegistration): {
    readonly registration: ToolRegistration;
    readonly prepareCalls: () => number;
} {
    let calls = 0;
    return {
        registration: {
            ...registration,
            prepare(input, control) {
                calls += 1;
                return registration.prepare(input, control);
            },
        },
        prepareCalls: () => calls,
    };
}

function createSaveFailingStore(
    failureOnSave: number,
    failure: Error,
): {
    readonly store: GoalStore;
    readonly delegate: InMemoryGoalStore;
    readonly saveCalls: () => number;
} {
    const delegate = new InMemoryGoalStore();
    let calls = 0;
    const store: GoalStore = {
        restore: (goalId) => delegate.restore(goalId),
        save: async (goal) => {
            calls += 1;

            if (calls === failureOnSave) {
                throw failure;
            }

            await delegate.save(goal);
        },
    };

    return {
        store,
        delegate,
        saveCalls: () => calls,
    };
}

class RecordingGoalStore implements GoalStore {
    readonly savedGoals: Goal[] = [];
    private readonly delegate = new InMemoryGoalStore();

    constructor(private readonly events: string[] = []) {}

    async seed(goal: Goal): Promise<void> {
        await this.delegate.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        this.events.push(`restore:${goalId}`);
        return this.delegate.restore(goalId);
    }

    async save(goal: Goal): Promise<void> {
        this.events.push(`save:${goal.id}:${goal.state.run.status}:${goal.state.run.stepCount}`);
        this.savedGoals.push(goal);
        await this.delegate.save(goal);
    }

    async peek(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }
}

function applyTransition(state: RunState, input: RunInput): RunState {
    const result = transition(state, input);

    if (!result.ok) {
        assert.fail(`expected a successful transition: ${result.error.message}`);
    }

    return result.state;
}

function createInitialGoal(
    runId = "run-1",
    goalId = "goal-1",
    runProfile: AgentProfile = profile,
    messages: readonly GoalMessage[] = [],
    maxSteps = 3,
    exposedToolIds: readonly string[] = runProfile.toolIds,
): Goal {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: goalDefinition.objective,
        profile: runProfile,
        runId,
        maxSteps,
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
            },
            run: { ...created.state.run, mode: "plan", approvedTask: goalDefinition, exposedToolIds },
            messages: [...messages],
        },
    };
}

function withRun(goal: Goal, run: RunState): Goal {
    return { ...goal, state: { ...goal.state, run } };
}

function createRunningGoal(runId = "run-1", maxSteps = 3): Goal {
    const goal = createInitialGoal(runId, "goal-1", profile, [], maxSteps);
    return withRun(goal, applyTransition(goal.state.run, { kind: "start" }));
}

function createWaitingGoal(runId = "run-1"): Goal {
    const running = createRunningGoal(runId);
    return withRun(
        running,
        applyTransition(running.state.run, {
            kind: "decision",
            decision: {
                kind: "wait",
                reason: "缺少外部依赖",
            },
        }),
    );
}

function createRef(goal: Goal, runId = goal.state.run.id): RunRef {
    return { goalId: goal.id, runId };
}

function executionTask(goal: Goal) {
    if (goal.state.workflow.phase !== "executing") {
        assert.fail("expected an executing Goal");
    }

    return goal.state.run.approvedTask;
}

function requireSuccessfulState(result: RunnerResult): RunState {
    if (!result.ok) {
        assert.fail(`expected Runner success: ${result.error.message}`);
    }

    return result.state;
}

function requireFailedResult(
    result: RunnerResult,
): Extract<RunnerResult, { readonly ok: false }> {
    if (result.ok) {
        assert.fail("expected Runner failure");
    }

    return result;
}

async function assertRejectsWithSameError(
    operation: () => Promise<unknown>,
    expectedError: Error,
): Promise<void> {
    await assert.rejects(operation, (actualError: unknown) => {
        assert.strictEqual(actualError, expectedError);
        return true;
    });
}

test("starts a created Goal, saves every transition, and executes until completed", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const initial = createInitialGoal("run-1", "goal-1", toolProfile);
    await store.seed(initial);
    const completeDecision = {
        kind: "complete",
        completionEvidence: [],
        summary: "目标完成",
    } as const;
    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: "ok",
        summary: "读取完成",
    }));
    const executor = new FakeStepExecutor([
        () => ({
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        }),
        () => completeDecision,
    ], events);
    const runner = new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.deepEqual(events, [
        "restore:goal-1",
        "restore:goal-1",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "save:goal-1:running:1",
        "save:goal-1:running:1",
        "execute:running:1",
        "save:goal-1:completed:2",
    ]);
    assert.deepEqual(
        store.savedGoals.map(({ state: { run: { status, stepCount } } }) => ({
            status,
            stepCount,
        })),
        [
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 1 },
            { status: "running", stepCount: 1 },
            { status: "completed", stepCount: 2 },
        ],
    );
    assert.strictEqual(executor.receivedGoals[0], store.savedGoals[1]);
    assert.strictEqual(executor.receivedGoals[1], store.savedGoals[5]);
    assert.deepEqual(state, store.savedGoals[6]?.state.run);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(state.lastStep, {
        kind: "decision",
        result: completeDecision,
    });
    assert.deepEqual(executor.receivedGoals[1]?.state.run.lastStep, {
        kind: "action",
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        observation: { kind: "success", output: "ok", summary: "读取完成" },
    });

    const persisted = await store.peek(initial.id);
    assert.ok(persisted);
    assert.deepEqual(persisted.state.messages, [
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "目标完成",
        },
    ]);
    assert.deepEqual(executionTask(persisted), executionTask(initial));
    assert.deepEqual(persisted.definition.profile, initial.definition.profile);
    assert.deepEqual(persisted.state.run, state);
});

test("Runner applies tool discovery against authorized tools and supplies the result to the next Decide", async () => {
    const initial = createInitialGoal("discover-run", "discover-goal", toolProfile, [], 3, []);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const executor = new FakeStepExecutor([
        () => ({ kind: "tool_discovery", query: "read" }),
        () => ({ kind: "complete", summary: "完成", completionEvidence: [] }),
    ]);
    const registered = createRunnerTool(async () => ({ kind: "success", output: "ok", summary: "OK" }));
    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: (id) => id === "read_file" ? registerTool(registered) : undefined },
    });

    const state = requireSuccessfulState(await runner.runUntilBlocked(createRef(initial)));

    assert.equal(state.status, "completed");
    assert.deepEqual(state.exposedToolIds, ["read_file"]);
    assert.deepEqual(executor.receivedInputs[1]?.toolDiscoveryResult, {
        tools: [{ id: "read_file", description: "读取文件" }],
    });
    assert.equal(state.stepCount, 2);
});

test("tool discovery consumes maxSteps and prevents another model request", async () => {
    const initial = createInitialGoal("discover-budget-run", "discover-budget-goal", toolProfile, [], 1, []);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const executor = new FakeStepExecutor([
        () => ({ kind: "tool_discovery", query: "read" }),
    ]);
    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(createRunnerTool(async () => ({ kind: "success", output: "ok", summary: "OK" }))) },
    });

    const state = requireSuccessfulState(await runner.runUntilBlocked(createRef(initial)));

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 1);
    assert.deepEqual(state.exposedToolIds, ["read_file"]);
    assert.equal(executor.receivedInputs.length, 1);
});

test("Runner rejects a direct call to an unexposed Tool before Registry preparation", async () => {
    const initial = createInitialGoal("hidden-tool-run", "hidden-tool-goal", toolProfile, [], 3, []);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let prepareCalls = 0;
    let executeCalls = 0;
    const hiddenTool = createRunnerTool(async () => {
        executeCalls += 1;
        return { kind: "success", output: "should not execute", summary: "Should not execute" };
    }, () => {
        prepareCalls += 1;
        return { ok: true };
    });
    const runner = new Runner({
        store,
        executor: new FakeDecisionExecutor({
            kind: "tool_call",
            action: { actionId: "hidden-call", toolId: "read_file", input: { path: "a" } },
        }),
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(hiddenTool) },
    });

    const result = requireSuccessfulState(await runner.runUntilBlocked(createRef(initial)));

    assert.equal(result.status, "failed");
    assert.equal(prepareCalls, 0);
    assert.equal(executeCalls, 0);
});

test("retries only typed transient model failures and caps the model call sequence at three", async () => {
    const initial = createInitialGoal("retry-run", "retry-goal", profile);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let calls = 0;
    const executor: StepExecutor = createStepExecutor(async () => {
        calls += 1;
        if (calls < 3) throw new TransientModelRequestFailure("service_unavailable", { status: 503 });
        return { kind: "complete", summary: "完成", completionEvidence: [] };
    }, async () => ({ kind: "accept" }));
    const trajectory = trajectoryStoreFor(store);
    const runner = new Runner({ store, executor, trajectoryStore: trajectory });

    const result = await runner.runUntilBlocked(createRef(initial));
    assert.equal(result.ok, true);
    assert.equal(calls, 3);
    const events = await trajectory.read({ goalId: initial.id, runId: initial.state.run.id });
    assert.deepEqual(events.filter((event) => event.eventType === "model_request_retry_recorded").map((event) =>
        event.eventType === "model_request_retry_recorded" ? [event.payload.attempt, event.payload.reason] : undefined), [
        [1, "service_unavailable"],
        [2, "service_unavailable"],
    ]);
});

test("safe Tool 对类型化暂时错误沿用 Action 授权重试三次，retryable Observation 不触发重放", async () => {
    const initial = createInitialGoal("tool-retry-run", "tool-retry-goal", toolProfile);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const actionIds: string[] = [];
    let calls = 0;
    const tool = createRunnerTool(async ({ actionId }) => {
        actionIds.push(actionId);
        calls += 1;
        if (calls < 3) throw new TransientToolExecutionFailure("network_unavailable", 0);
        return { kind: "success", output: "ok", summary: "读取完成" };
    });
    const executor = new SequenceDecisionExecutor([
        { kind: "tool_call", action: { actionId: "action-tool-retry", toolId: "read_file", input: { path: "a" } } },
        { kind: "complete", completionEvidence: [], summary: "完成" },
    ]);
    const trajectory = new InMemoryTrajectoryStore();
    const state = requireSuccessfulState(await new Runner({
        trajectoryStore: trajectory,
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial, "tool-retry-run")));

    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.equal(calls, 3);
    assert.deepEqual(actionIds, ["action-tool-retry", "action-tool-retry", "action-tool-retry"]);
    const events = await trajectory.read({ goalId: initial.id, runId: initial.state.run.id });
    assert.deepEqual(events.filter((event) => event.eventType === "tool_attempt_started").map((event) =>
        event.eventType === "tool_attempt_started" ? event.payload.attempt : undefined), [1, 2, 3]);
    assert.deepEqual(events.filter((event) => event.eventType === "tool_attempt_failed").map((event) =>
        event.eventType === "tool_attempt_failed" ? event.payload.attempt : undefined), [1, 2]);
});

test("safe Tool 中断恢复沿用 Action ID 和已提交尝试次数", async () => {
    const initial = createInitialGoal("tool-retry-recovery-run", "tool-retry-recovery-goal", toolProfile);
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    const actionIds: string[] = [];
    let calls = 0;
    const tool = createRunnerTool(async ({ actionId }) => {
        actionIds.push(actionId);
        calls += 1;
        if (calls === 1) throw new ExecutionAbortedError();
        return { kind: "success", output: "ok", summary: "读取完成" };
    });
    const registry = { get: () => registerTool(tool) };
    const firstExecutor = new SequenceDecisionExecutor([
        { kind: "tool_call", action: { actionId: "action-recovered-retry", toolId: "read_file", input: { path: "a" } } },
    ]);
    const firstRunner = new Runner({ store, trajectoryStore: trajectory, executor: firstExecutor, toolRegistry: registry });
    await assert.rejects(() => firstRunner.run(createRef(initial, initial.state.run.id)), ExecutionAbortedError);
    assert.equal((await store.restore(initial.id))?.state.run.pendingAction?.attemptsStarted, 1);

    const secondExecutor = new SequenceDecisionExecutor([
        { kind: "complete", completionEvidence: [], summary: "完成" },
    ]);
    const state = requireSuccessfulState(await new Runner({
        store,
        trajectoryStore: trajectory,
        executor: secondExecutor,
        toolRegistry: registry,
    }).run(createRef(initial, initial.state.run.id)));

    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(actionIds, ["action-recovered-retry", "action-recovered-retry"]);
    assert.deepEqual(trajectory.events
        .filter((event) => event.eventType === "tool_attempt_started")
        .map((event) => event.eventType === "tool_attempt_started" ? event.payload.attempt : undefined), [1, 2]);
});

test("safe Tool 连续暂时故障达到三次后失败且不推进 Step", async () => {
    const initial = createInitialGoal("tool-retry-exhausted-run", "tool-retry-exhausted-goal", toolProfile);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let calls = 0;
    const tool = createRunnerTool(async () => {
        calls += 1;
        throw new TransientToolExecutionFailure("service_unavailable", 0);
    });
    const result = await new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: new SequenceDecisionExecutor([
            { kind: "tool_call", action: { actionId: "action-retry-exhausted", toolId: "read_file", input: { path: "a" } } },
        ]),
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial, initial.state.run.id));
    const state = requireSuccessfulState(result);

    assert.equal(calls, 3);
    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 0);
    assert.equal(state.stopReason?.kind, "execution_error");
    assert.match(state.stopReason?.kind === "execution_error" ? state.stopReason.message : "", /retry limit exhausted/u);
});

test("manual Tool 调用抛错后进入 outcome_unknown 等待，不自动重放或调用模型", async () => {
    const initial = createInitialGoal("manual-tool-unknown-run", "manual-tool-unknown-goal", toolProfile);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let calls = 0;
    const tool = {
        ...createRunnerTool(async () => {
            calls += 1;
            throw new TransientToolExecutionFailure("network_unavailable", 0);
        }),
        replayPolicy: "manual" as const,
    };
    const executor = new SequenceDecisionExecutor([
        { kind: "tool_call", action: { actionId: "action-manual-unknown", toolId: "read_file", input: { path: "a" } } },
    ]);
    const state = requireSuccessfulState(await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial, "manual-tool-unknown-run")));

    assert.equal(state.status, "waiting");
    assert.equal(state.stepCount, 0);
    assert.equal(state.pendingAction?.status, "outcome_unknown");
    assert.equal(calls, 1);
    assert.equal(executor.receivedGoals.length, 1);
});

test("retries the same staged Decide call without advancing the Step", async () => {
    const initial = createInitialGoal("staged-retry-run", "staged-retry-goal", profile);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let decideCalls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async execute() {
            assert.fail("staged executor must not use execute()");
        },
        async decide() {
            decideCalls += 1;
            if (decideCalls === 1) throw new TransientModelRequestFailure("connection");
            return {
                kind: "decision",
                decision: { kind: "complete", summary: "完成", completionEvidence: [] },
            };
        },
        async think() {
            assert.fail("Think is not requested in this test");
        },
    };
    const trajectory = trajectoryStoreFor(store);
    const runner = new Runner({ store, executor, trajectoryStore: trajectory });

    const state = requireSuccessfulState(await runner.runUntilBlocked(createRef(initial)));
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 1);
    assert.equal(decideCalls, 2);
});

test("records stable causes and stops after three transient model request failures", async () => {
    const initial = createInitialGoal("exhausted-run", "exhausted-goal", profile);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let calls = 0;
    const executor: StepExecutor = createStepExecutor(async () => {
        calls += 1;
        throw new TransientModelRequestFailure(calls === 2 ? "rate_limited" : "service_unavailable", {
            status: calls === 2 ? 429 : 503,
        });
    }, async () => ({ kind: "accept" }));
    const trajectory = trajectoryStoreFor(store);
    const runner = new Runner({ store, executor, trajectoryStore: trajectory });

    const result = await runner.runUntilBlocked(createRef(initial));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "failed");
    assert.equal(calls, 3);
    const persisted = await store.restore(initial.id);
    assert.ok(persisted);
    assert.equal(persisted.state.run.stopReason?.kind, "execution_error");
    assert.match(persisted.state.run.stopReason?.kind === "execution_error" ? persisted.state.run.stopReason.message : "", /1:service_unavailable\(503\), 2:rate_limited\(429\), 3:service_unavailable\(503\)/);
    const events = await trajectory.read({ goalId: initial.id, runId: initial.state.run.id });
    assert.deepEqual(events.filter((event) => event.eventType === "model_request_retry_recorded").map((event) =>
        event.eventType === "model_request_retry_recorded" ? [event.payload.attempt, event.payload.reason, event.payload.status] : undefined), [
        [1, "service_unavailable", 503],
        [2, "rate_limited", 429],
        [3, "service_unavailable", 503],
    ]);
});

test("cancelling model backoff prevents the next model request", async () => {
    const initial = createInitialGoal("cancel-retry-run", "cancel-retry-goal", profile);
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let calls = 0;
    const executor: StepExecutor = createStepExecutor(async () => {
        calls += 1;
        throw new TransientModelRequestFailure("rate_limited", { status: 429 });
    }, async () => ({ kind: "accept" }));
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });
    const controller = new AbortController();
    const cancelTimer = setTimeout(() => controller.abort(), 20);

    try {
        await assert.rejects(
            runner.runUntilBlocked(createRef(initial), {}, { signal: controller.signal }),
            ExecutionAbortedError,
        );
    } finally {
        clearTimeout(cancelTimer);
    }
    assert.equal(calls, 1);
});


test("stops on blocked and continues an externally resumed Goal", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const initial = createInitialGoal();
    await store.seed(initial);
    const waitDecision = {
        kind: "wait",
        reason: "需要破坏性操作批准",
    } as const;
    const completeDecision = {
        kind: "complete",
        completionEvidence: [],
        summary: "批准后完成",
    } as const;
    const executor = new FakeStepExecutor([
        () => waitDecision,
        () => completeDecision,
    ], events);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });
    const ref = createRef(initial);

    const waiting = requireSuccessfulState(
        await runner.runUntilBlocked(ref),
    );
    const waitingGoal = await store.peek(initial.id);
    assert.ok(waitingGoal !== undefined);
    const resumedRun = applyTransition(
        waitingGoal.state.run,
        { kind: "resume" },
    );
    const externallyResumed = {
        ...waitingGoal,
        state: {
            ...waitingGoal.state,
            messages: [
                ...waitingGoal.state.messages,
                { role: "user" as const, content: "已批准继续" },
            ],
            run: resumedRun,
        },
    };
    await store.seed(externallyResumed);
    const completed = requireSuccessfulState(
        await runner.runUntilBlocked(ref),
    );

    assert.equal(waiting.status, "waiting");
    assert.equal(waiting.stepCount, 1);
    assert.equal(completed.status, "completed");
    assert.equal(completed.stepCount, 2);
    assert.deepEqual(events, [
        "restore:goal-1",
        "restore:goal-1",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:waiting:1",
        "restore:goal-1",
        "save:goal-1:running:1",
        "execute:running:1",
        "save:goal-1:completed:2",
    ]);
    assert.deepEqual(
        store.savedGoals.map(({ state: { run: { status, stepCount } } }) => ({
            status,
            stepCount,
        })),
        [
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 0 },
            { status: "waiting", stepCount: 1 },
            { status: "running", stepCount: 1 },
            { status: "completed", stepCount: 2 },
        ],
    );
    const persisted = await store.peek(initial.id);
    assert.deepEqual(persisted?.state.run, completed);
    assert.deepEqual(persisted?.state.messages, [
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "需要破坏性操作批准",
        },
        { role: "user", content: "已批准继续" },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "批准后完成",
        },
    ]);
});

test("从 InMemoryGoalStore 恢复 created 和 running Goal 时保留累计进度", async () => {
    const initialMessages: readonly GoalMessage[] = [
        { role: "user", content: "已保存的用户输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "已保存的模型响应" },
    ];
    const scenarios: ReadonlyArray<{
        readonly label: string;
        readonly goal: Goal;
        readonly expectedStepCount: number;
    }> = [
        {
            label: "created",
            goal: createInitialGoal(
                "run-created",
                "goal-created",
                profile,
                initialMessages,
            ),
            expectedStepCount: 0,
        },
        {
            label: "running",
            goal: (() => {
                const created = createInitialGoal(
                    "run-running",
                    "goal-running",
                    profile,
                    initialMessages,
                );
                const running = withRun(
                    created,
                    applyTransition(created.state.run, { kind: "start" }),
                );
                const staged = applyTransition(running.state.run, {
                    kind: "stage_action",
                    action: {
                        actionId: "action-recovered",
                        toolId: "read_file",
                        input: { path: "README.md" },
                    },
                    status: "approved",
                });

                return withRun(
                    running,
                    applyTransition(staged, {
                        kind: "observe_action",
                        actionId: "action-recovered",
                        observation: {
                            kind: "success",
                            output: "ok",
                            summary: "已完成并持久化的一步",
                        },
                    }),
                );
            })(),
            expectedStepCount: 1,
        },
    ];

    for (const scenario of scenarios) {
        const store = new InMemoryGoalStore();
        await store.save(scenario.goal);
        const executor = new FakeStepExecutor([
            (goal) => {
                assert.equal(goal.state.run.stepCount, scenario.expectedStepCount);
                assert.deepEqual(goal.state.messages, initialMessages);
                assert.deepEqual(goal.definition.profile, scenario.goal.definition.profile);
                return {
                    kind: "complete",
                    completionEvidence: [],
                    summary: `${scenario.label} 恢复后完成`,
                };
            },
        ]);
        const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

        const state = requireSuccessfulState(
            await runner.runUntilBlocked(createRef(scenario.goal)),
        );

        assert.equal(executor.receivedGoals.length, 1);
        assert.equal(state.status, "completed");
        assert.equal(state.stepCount, scenario.expectedStepCount + 1);
        assert.deepEqual((await store.restore(scenario.goal.id))?.state.run, state);
    }
});

test("从 InMemoryGoalStore 恢复 waiting 和终态 Goal 时直接短路", async () => {
    const waiting = createWaitingGoal("run-waiting-recovery");
    const waitingStore = new InMemoryGoalStore();
    await waitingStore.save(waiting);
    const waitingExecutor = new FakeStepExecutor([
        () => ({
            kind: "complete",
            completionEvidence: [],
            summary: "恢复后完成",
        }),
    ]);
    const waitingRunner = new Runner({
        trajectoryStore: trajectoryStoreFor(waitingStore),
        store: waitingStore,
        executor: waitingExecutor,
    });
    const waitingRef = createRef(waiting);

    const blocked = requireSuccessfulState(
        await waitingRunner.runUntilBlocked(waitingRef),
    );

    assert.deepEqual(blocked, waiting.state.run);
    assert.equal(waitingExecutor.receivedGoals.length, 0);
    assert.deepEqual(await waitingStore.restore(waiting.id), waiting);

    for (const inactive of inactiveGoals) {
        const store = new InMemoryGoalStore();
        await store.save(inactive.goal);
        const executor = new FakeStepExecutor([]);
        const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

        const state = requireSuccessfulState(
            await runner.runUntilBlocked(createRef(inactive.goal)),
        );

        assert.deepEqual(state, inactive.goal.state.run);
        assert.deepEqual(executor.receivedGoals, []);
        assert.deepEqual(await store.restore(inactive.goal.id), inactive.goal);
    }
});

const inactiveGoals: ReadonlyArray<{
    readonly label: string;
    readonly goal: Goal;
}> = [
    {
        label: "waiting",
        goal: createWaitingGoal("run-waiting"),
    },
    {
        label: "completed",
        goal: withRun(
            createRunningGoal("run-completed"),
            applyTransition(createRunningGoal("run-completed").state.run, {
                kind: "decision",
                decision: {
                    kind: "complete",
                    completionEvidence: [],
                    summary: "已完成",
                },
            }),
        ),
    },
    {
        label: "failed",
        goal: withRun(
            createRunningGoal("run-failed"),
            applyTransition(createRunningGoal("run-failed").state.run, {
                kind: "decision",
                decision: {
                    kind: "fail",
                    error: "已失败",
                },
            }),
        ),
    },
    {
        label: "cancelled",
        goal: withRun(
            createInitialGoal("run-cancelled"),
            applyTransition(createInitialGoal("run-cancelled").state.run, {
                kind: "cancel",
            }),
        ),
    },
];

for (const inactive of inactiveGoals) {
    test(`returns an existing ${inactive.label} Goal without side effects`, async () => {
        const events: string[] = [];
        const store = new RecordingGoalStore(events);
        await store.seed(inactive.goal);
        const executor = new FakeStepExecutor([], events);
        const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

        const state = requireSuccessfulState(
            await runner.runUntilBlocked(createRef(inactive.goal)),
        );

        assert.deepEqual(state, inactive.goal.state.run);
        assert.deepEqual(events, [`restore:${inactive.goal.id}`]);
        assert.deepEqual(store.savedGoals, []);
        assert.deepEqual(executor.receivedGoals, []);
    });
}

test("returns RUN_NOT_FOUND without executing or saving when Goal is missing", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });
    const ref = { goalId: "goal-1", runId: "missing-run" };

    const result = requireFailedResult(
        await runner.runUntilBlocked(ref),
    );

    assert.equal(result.error.code, "RUN_NOT_FOUND");
    assert.match(result.error.message, /missing-run/);
    assert.deepEqual(events, ["restore:goal-1"]);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(executor.receivedGoals, []);
});

test("returns RUN_NOT_FOUND without executing or saving when runId mismatches", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const goal = createInitialGoal("actual-run");
    await store.seed(goal);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

    const result = requireFailedResult(
        await runner.runUntilBlocked({
            goalId: goal.id,
            runId: "other-run",
        }),
    );

    assert.equal(result.error.code, "RUN_NOT_FOUND");
    assert.match(result.error.message, /other-run/);
    assert.deepEqual(events, ["restore:goal-1"]);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(executor.receivedGoals, []);
});

test("fails at maxSteps without an extra executor call or step count", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const initial = createInitialGoal("run-1", "goal-1", toolProfile, [], 2);
    await store.seed(initial);
    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: "ok",
        summary: "读取完成",
    }));
    const executor = new FakeStepExecutor([
        () => ({
            kind: "tool_call",
            action: { actionId: "action-1", toolId: "read_file", input: {} },
        }),
        () => ({
            kind: "tool_call",
            action: { actionId: "action-2", toolId: "read_file", input: {} },
        }),
    ], events);
    const runner = new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.equal(executor.receivedGoals.length, 2);
    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(state.stopReason, { kind: "max_steps_exceeded" });
    assert.equal(state.lastStep?.kind, "action");
    assert.deepEqual((await store.peek(initial.id))?.state.messages, []);
    assert.deepEqual(events, [
        "restore:goal-1",
        "restore:goal-1",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "save:goal-1:running:1",
        "save:goal-1:running:1",
        "execute:running:1",
        "save:goal-1:running:1",
        "save:goal-1:running:1",
        "save:goal-1:running:2",
        "save:goal-1:failed:2",
    ]);
    assert.deepEqual((await store.peek(initial.id))?.state.run, state);
});

test("uses persisted step count after external resume as the maxSteps budget", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const running = createRunningGoal("run-1", 2);
    const firstStep = withRun(
        running,
        (() => {
            const staged = applyTransition(running.state.run, {
                kind: "stage_action",
                action: {
                    actionId: "action-resume-budget",
                    toolId: "read_file",
                    input: { path: "README.md" },
                },
                status: "approved",
            });

            return applyTransition(staged, {
                kind: "observe_action",
                actionId: "action-resume-budget",
                observation: {
                    kind: "success",
                    output: "ok",
                    summary: "已执行一步",
                },
            });
        })(),
    );
    const waitingAtLimit = withRun(
        firstStep,
        applyTransition(firstStep.state.run, {
            kind: "decision",
            decision: {
                kind: "wait",
                reason: "等待恢复",
            },
        }),
    );
    const externallyResumed = withRun(
        waitingAtLimit,
        applyTransition(waitingAtLimit.state.run, { kind: "resume" }),
    );
    await store.seed(externallyResumed);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(externallyResumed)),
    );

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(state.stopReason, { kind: "max_steps_exceeded" });
    const lastResult = state.lastStep !== undefined && "result" in state.lastStep
        ? state.lastStep.result
        : undefined;
    assert.equal(
        lastResult?.kind,
        "wait",
    );
    assert.deepEqual(executor.receivedGoals, []);
    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:failed:2",
    ]);
});

test("executor exception fails without committing a fabricated Decision", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const initial = createInitialGoal();
    await store.seed(initial);
    const executorError = new Error("executor failed");
    const executor = new FakeStepExecutor([
        () => {
            throw executorError;
        },
    ], events);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 0);
    assert.equal(state.lastStep, undefined);
    assert.deepEqual((await store.peek(initial.id))?.state.messages, [
        ...initial.state.messages,
    ]);
    assert.deepEqual(events, [
        "restore:goal-1",
        "restore:goal-1",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:failed:0",
    ]);
    assert.deepEqual((await store.peek(initial.id))?.state.run, state);
});

test("persists an explicit fail decision with a normalized assistant message", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal("run-explicit-fail");
    await store.save(initial);
    const executor = new FakeStepExecutor([
        () => ({
            kind: "fail",
            error: "无法满足完成条件",
        }),
    ]);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );
    const persisted = await store.restore(initial.id);

    assert.equal(state.status, "failed");
    assert.deepEqual(persisted?.state.messages, [
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "无法满足完成条件",
        },
    ]);
});

test("maxSteps 为 0 时连续执行不受 Step 数量限制", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-unlimited",
        "goal-1",
        toolProfile,
        [],
        0,
    );
    await store.save(initial);
    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: "ok",
        summary: "读取完成",
    }));
    const executor = new FakeStepExecutor([
        ...Array.from({ length: 5 }, (_, index) => () => ({
            kind: "tool_call" as const,
            action: {
                actionId: `action-${index + 1}`,
                toolId: "read_file",
                input: {},
            },
        })),
        () => ({
            kind: "complete" as const,
            completionEvidence: [],
            summary: "无限模式完成",
        }),
    ]);
    const runner = new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.equal(executor.receivedGoals.length, 6);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 6);
    assert.equal(state.stopReason, undefined);
});

test("propagates a restore error without saving or executing", async () => {
    const restoreError = new Error("restore failed");
    let saveCalls = 0;
    const store: GoalStore = {
        async restore(): Promise<Goal | undefined> {
            throw restoreError;
        },
        async save(): Promise<void> {
            saveCalls += 1;
        },
    };
    const executor = new FakeStepExecutor([]);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked({ goalId: "goal-1", runId: "run-1" }),
        restoreError,
    );

    assert.equal(saveCalls, 0);
    assert.deepEqual(executor.receivedGoals, []);
});

test("propagates the start save error without executing", async () => {
    const saveError = new Error("start save failed");
    const created = createInitialGoal();
    const savedGoals: Goal[] = [];
    const store: GoalStore = {
        async restore(): Promise<Goal | undefined> {
            return created;
        },
        async save(goal): Promise<void> {
            savedGoals.push(goal);
            throw saveError;
        },
    };
    const executor = new FakeStepExecutor([]);
    const runner = new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked(createRef(created)),
        saveError,
    );

    assert.equal(savedGoals.length, 1);
    assert.equal(savedGoals[0]?.state.run.status, "running");
    assert.deepEqual(executor.receivedGoals, []);
});

test("propagates a recovered step save error and does not execute another step", async () => {
    const saveError = new Error("step save failed");
    const created = createInitialGoal("run-save-error", "goal-1", toolProfile, [], 3);
    const running = withRun(
        created,
        applyTransition(created.state.run, { kind: "start" }),
    );
    const staged = applyTransition(running.state.run, {
        kind: "stage_action",
        action: {
            actionId: "action-save-error",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "approved",
    });
    const persisted = withRun(
        running,
        applyTransition(staged, {
            kind: "observe_action",
            actionId: "action-save-error",
            observation: {
                kind: "success",
                output: "ok",
                summary: "已持久化的一步",
            },
        }),
    );
    let latestGoal = persisted;
    const savedGoals: Goal[] = [];
    const store: GoalStore = {
        async restore(): Promise<Goal | undefined> {
            return latestGoal;
        },
        async save(goal): Promise<void> {
            savedGoals.push(goal);
            if (savedGoals.length === 1) {
                throw saveError;
            }
            latestGoal = goal;
        },
    };
    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: "ok",
        summary: "读取完成",
    }));
    const executor = new FakeStepExecutor([
        () => ({
            kind: "tool_call",
            action: {
                actionId: "action-save-error-2",
                toolId: "read_file",
                input: {},
            },
        }),
        () => ({
            kind: "complete",
            completionEvidence: [],
            summary: "不应执行",
        }),
    ]);
    const runner = new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked(createRef(persisted)),
        saveError,
    );

    assert.deepEqual(
        savedGoals.map(({ state: { run: { status, stepCount } } }) => ({
            status,
            stepCount,
        })),
        [
            { status: "running", stepCount: 1 },
        ],
    );
    assert.equal(executor.receivedGoals.length, 0);
    assert.strictEqual(latestGoal, persisted);
});

test("Runner 在 Profile 授权校验前不访问 Registry 或 Tool", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal("run-unauthorized");
    await store.save(initial);
    let registryCalls = 0;
    let validateCalls = 0;
    let executeCalls = 0;
    const tool: TestTool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => {
            validateCalls += 1;
            return { ok: true };
        },
        async execute() {
            executeCalls += 1;
            return { kind: "success", output: "", summary: "读取完成" };
        },
    };
    const registry: ToolRegistry = {
        get: () => {
            registryCalls += 1;
            return registerTool(tool);
        },
    };
    const executor = new FakeDecisionExecutor({
        kind: "tool_call",
        action: {
            actionId: "action-unauthorized",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    });
    const result = await new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: registry,
    }).run(
        createRef(initial, "run-unauthorized"),
    );

    const state = requireSuccessfulState(result);
    assert.equal(state.stepCount, 0);
    assert.equal(state.lastStep, undefined);
    assert.deepEqual(state.stopReason, {
        kind: "execution_error",
        code: "INVALID_AGENT_DECISION",
        message: "Model output correction exhausted after three decide attempts (TOOL_NOT_AUTHORIZED)",
    });
    assert.equal(registryCalls, 0);
    assert.equal(validateCalls, 0);
    assert.equal(executeCalls, 0);
    assert.deepEqual(executor.receivedTools, [[], [], []]);
});

test("Runner 对 Profile 已授权但未注册的 Tool 返回 TOOL_NOT_FOUND", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-missing-tool",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    await store.save(initial);
    const executor = new FakeDecisionExecutor({
        kind: "tool_call",
        action: {
            actionId: "action-missing-tool",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    });
    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: {
            get: () => undefined,
        },
    }).run(createRef(initial, "run-missing-tool"));

    const state = requireSuccessfulState(result);
    assert.equal(state.stepCount, 0);
    assert.deepEqual(state.stopReason, {
        kind: "execution_error",
        code: "INVALID_AGENT_DECISION",
        message: "Model output correction exhausted after three decide attempts (TOOL_NOT_FOUND)",
    });
    assert.deepEqual(executor.receivedTools, [[], [], []]);
});

test("Runner 在 Tool 外部作用前拒绝非法输入", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-invalid-input",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    await store.save(initial);
    let executeCalls = 0;
    const tool: TestTool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({
            ok: false,
            error: {
                code: "INVALID_TOOL_INPUT",
                message: "path 必须是工作区内相对路径",
            },
        }),
        async execute() {
            executeCalls += 1;
            return { kind: "success", output: "", summary: "不应执行" };
        },
    };
    const executor = new FakeDecisionExecutor({
        kind: "tool_call",
        action: {
            actionId: "action-invalid-input",
            toolId: "read_file",
            input: { path: "../secret.txt" },
        },
    });
    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial, "run-invalid-input"));

    const state = requireSuccessfulState(result);
    assert.equal(state.stepCount, 0);
    assert.deepEqual(state.stopReason, {
        kind: "execution_error",
        code: "INVALID_AGENT_DECISION",
        message: "Model output correction exhausted after three decide attempts (INVALID_TOOL_INPUT)",
    });
    assert.equal(executeCalls, 0);
    assert.deepEqual(executor.receivedFeedback[1]?.issues, [{
        code: "INVALID_TOOL_INPUT",
        path: ["result", "action", "input"],
        message: "path 必须是工作区内相对路径",
    }]);
});

test("Runner 在 Contract 结构失败前不调用语义校验或 Policy，也不记录 Action 事实", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-invalid-contract",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    await store.save(initial);
    const trajectory = new InMemoryTrajectoryStore();
    let validateCalls = 0;
    let policyCalls = 0;
    let executeCalls = 0;
    const tool: Tool<typeof PATH_INPUT_CONTRACT> = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: PATH_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => {
            validateCalls += 1;
            return { ok: true };
        },
        async execute() {
            executeCalls += 1;
            return { kind: "success", output: "不应执行", summary: "不应执行" };
        },
    };
    const executor = new FakeDecisionExecutor({
        kind: "tool_call",
        action: {
            actionId: "action-invalid-contract",
            toolId: "read_file",
            input: { unexpected: true },
        },
    });

    const result = await new Runner({
        store,
        executor,
        trajectoryStore: trajectory,
        toolRegistry: { get: () => createToolRegistration(tool) },
        toolPolicy: {
            evaluate: () => {
                policyCalls += 1;
                return "allow";
            },
        },
    }).run(createRef(initial, "run-invalid-contract"));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 0);
    assert.equal(state.pendingAction, undefined);
    assert.equal(state.stopReason?.kind, "execution_error");
    assert.equal(state.stopReason?.code, "INVALID_AGENT_DECISION");
    assert.match(state.stopReason?.kind === "execution_error" ? state.stopReason.message : "", /INVALID_TOOL_INPUT/u);
    assert.equal(validateCalls, 0);
    assert.equal(policyCalls, 0);
    assert.equal(executeCalls, 0);
    assert.deepEqual(executor.receivedFeedback[1]?.issues[0], {
        code: "missing_field",
        path: ["result", "action", "input", "path"],
        message: "Required field is missing",
    });
    assert.equal(trajectory.events.some((event) => event.eventType === "decision_received"), false);
    assert.equal(trajectory.events.some((event) => event.eventType === "action_staged"), false);
    assert.equal(trajectory.events.some((event) => event.eventType === "tool_started"), false);
});

test("Runner 将非法 sandboxAccess 的字段诊断送回模型并接受修正调用", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-sandbox-input-repair",
        "goal-1",
        { ...profile, toolIds: ["bash"] },
        [],
        1,
    );
    await store.save(initial);
    const receivedFeedback: (RuntimeFeedback | undefined)[] = [];
    let executeCalls = 0;
    const tool: Tool<typeof BASH_INPUT_CONTRACT> = {
        definition: {
            id: "bash",
            description: "执行本地命令",
            inputContract: BASH_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute() {
            executeCalls += 1;
            return { kind: "success", output: "", summary: "已读取 Git 历史" };
        },
    };
    const executor: StepExecutor = createStepExecutor(async ({ runtimeFeedback }) => {
        receivedFeedback.push(runtimeFeedback);
        return {
            kind: "tool_call",
            action: {
                actionId: "action-git-history",
                toolId: "bash",
                input: runtimeFeedback === undefined
                    ? { command: "git log -5 --oneline", sandboxAccess: -1 }
                    : { command: "git log -5 --oneline" },
            },
        };
    }, async () => ({ kind: "accept" }));

    const result = await new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => createToolRegistration(tool) },
    }).run(createRef(initial, "run-sandbox-input-repair"));

    assert.equal(requireSuccessfulState(result).stepCount, 1);
    assert.equal(executeCalls, 1);
    assert.deepEqual(receivedFeedback[1]?.issues[0], {
        code: "invalid_type",
        path: ["result", "action", "input", "sandboxAccess"],
        message: "Expected a JSON object",
    });
});

test("Runner 在一次准备中隔离原始输入，并让 Policy、Action 事实与 Tool 共享 canonical 输入", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-canonical-input",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    await store.save(initial);
    const trajectory = new InMemoryTrajectoryStore();
    const rawInput: { path: string } = { path: "before.txt" };
    const decision = {
        kind: "tool_call" as const,
        action: {
            actionId: "action-canonical-input",
            toolId: "read_file",
            input: rawInput,
        },
    };
    let executorCalls = 0;
    const executor: StepExecutor = createStepExecutor(async () => {
        executorCalls += 1;
        return executorCalls === 1
            ? decision
            : {
                kind: "complete" as const,
                completionEvidence: [],
                summary: "完成",
            };
    }, async () => ({ kind: "accept" }));
    let validateCalls = 0;
    let policyCalls = 0;
    let executeCalls = 0;
    let validatedInput: PathInput | undefined;
    let policyInput: unknown;
    let executedInput: PathInput | undefined;
    const tool: Tool<typeof PATH_INPUT_CONTRACT> = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: PATH_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: (input) => {
            validateCalls += 1;
            validatedInput = input;
            return { ok: true };
        },
        async execute({ input }) {
            executeCalls += 1;
            executedInput = input;
            return {
                kind: "success",
                output: input.path,
                summary: "读取完成",
            };
        },
    };
    const policy: ToolPolicy = {
        evaluate: ({ action }) => {
            policyCalls += 1;
            policyInput = action.input;
            rawInput.path = "after.txt";
            return "allow";
        },
    };

    const result = await new Runner({
        store,
        executor,
        trajectoryStore: trajectory,
        toolRegistry: { get: () => createToolRegistration(tool) },
        toolPolicy: policy,
    }).run(createRef(initial, "run-canonical-input"));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.equal(validateCalls, 1);
    assert.equal(policyCalls, 1);
    assert.equal(executeCalls, 1);
    assert.equal(rawInput.path, "after.txt");
    assert.ok(validatedInput);
    assert.ok(executedInput);
    assert.notStrictEqual(validatedInput, rawInput);
    assert.strictEqual(policyInput, validatedInput);
    assert.strictEqual(executedInput, validatedInput);
    assert.deepEqual(validatedInput, { path: "before.txt" });
    assert.deepEqual(state.lastStep, {
        kind: "decision",
        result: { kind: "complete", completionEvidence: [], summary: "完成" },
    });

    const actionInputs = trajectory.events.flatMap((event) => {
        if (event.eventType === "decision_received" && event.payload.decision.kind === "tool_call") {
            return [event.payload.decision.action.input];
        }
        if (event.eventType === "action_staged") return [event.payload.action.input];
        if (event.eventType === "tool_started") return [event.payload.input];
        return [];
    });
    assert.deepEqual(actionInputs, [
        { path: "before.txt" },
        { path: "before.txt" },
        { path: "before.txt" },
    ]);
});

test("Runner 将 Tool Registry/校验基础设施异常保存为 TOOL_EXECUTION_ERROR", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-tool-infrastructure",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    await store.save(initial);
    const tool: TestTool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => {
            throw new Error("校验器不可用");
        },
        async execute() {
            throw new Error("不应执行");
        },
    };
    const executor = new FakeDecisionExecutor({
        kind: "tool_call",
        action: {
            actionId: "action-tool-infrastructure",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    });

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial, "run-tool-infrastructure"));

    const state = requireSuccessfulState(result);
    assert.equal(state.stepCount, 0);
    assert.deepEqual(state.stopReason, {
        kind: "execution_error",
        code: "TOOL_EXECUTION_ERROR",
        message: "校验器不可用",
    });
});

test("Runner 按 Registry、输入校验与 Policy 顺序处理 Action", async () => {
    const events: string[] = [];
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-policy-order",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    await store.save(initial);
    const tool: TestTool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => {
            events.push("validate");
            return { ok: true };
        },
        async execute() {
            events.push("execute");
            return { kind: "success", output: "", summary: "不应执行" };
        },
    };
    let executorCalls = 0;
    const executor: StepExecutor = createStepExecutor(async ({ authorizedTools }) => {
        events.push(`executor:${authorizedTools.length}`);

        if (executorCalls++ > 0) {
            return {
                kind: "complete",
                completionEvidence: [],
                summary: "完成",
            };
        }

        return {
            kind: "tool_call",
            action: {
                actionId: "action-policy-order",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        };
    }, async () => ({ kind: "accept" }));
    const registry: ToolRegistry = {
        get: (toolId) => {
            events.push(`registry:${toolId}`);
            return registerTool(tool);
        },
    };
    const policy: ToolPolicy = {
        evaluate: () => {
            events.push("policy");
            return "allow";
        },
    };

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: registry,
        toolPolicy: policy,
    }).run(createRef(initial, "run-policy-order"));

    const state = requireSuccessfulState(result);
    assert.deepEqual(events, [
        "registry:read_file",
        "executor:1",
        "registry:read_file",
        "validate",
        "policy",
        "execute",
        "registry:read_file",
        "executor:1",
    ]);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(state.lastStep, {
        kind: "decision",
        result: {
            kind: "complete",
            completionEvidence: [],
            summary: "完成",
        },
    });
});

test("Runner 在 Policy 要求审批时允许匹配的 workspace Grant 放行同一操作", async () => {
    const store = new InMemoryGoalStore();
    const runProfile: AgentProfile = { ...profile, toolIds: ["bash"] };
    const initial = createInitialGoal("run-grant-match", "goal-grant-match", runProfile);
    await store.save(initial);
    const inputContract = contract.object({ command: contract.string() });
    const action = {
        actionId: "action-grant-match",
        toolId: "bash",
        input: { command: "git status --short" },
    };
    const matcher = await createToolGrantMatcher("bash", action.input);
    const grant: ToolGrant = {
        id: "grant-1",
        scope: "workspace",
        workspaceId: "workspace-1",
        source: { goalId: "goal-old", runId: "run-old", actionId: "action-old" },
        matcher,
        status: "active",
    };
    let executorCalls = 0;
    let toolCalls = 0;
    let lookupCount = 0;
    const result = await new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: createStepExecutor(async () => {
            executorCalls += 1;
            return executorCalls === 1
                ? { kind: "tool_call", action }
                : { kind: "complete", completionEvidence: [], summary: "完成" };
        }, async () => ({ kind: "accept" })),
        toolRegistry: {
            get() {
                return createToolRegistration({
                    definition: {
                        id: "bash",
                        description: "执行命令",
                        inputContract,
                        isReadOnly: false,
                    },
                    replayPolicy: "safe",
                    validate: () => ({ ok: true }),
                    async execute() {
                        toolCalls += 1;
                        return { kind: "success", output: {}, summary: "已执行" };
                    },
                });
            },
        },
        toolPolicy: { evaluate: () => "require_approval" },
        toolGrantLookup: {
            async findActiveMatching(query) {
                lookupCount += 1;
                assert.equal(query.workspaceId, "workspace-1");
                assert.equal(query.goalId, initial.id);
                assert.equal(query.matcher.kind, "exact_input");
                return grant;
            },
        },
        workspaceId: "workspace-1",
    }).run(createRef(initial));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.equal(lookupCount, 1);
    assert.equal(toolCalls, 1);
});

test("Runner 按先暂存后执行再观察的顺序完成自动 Action 周期", async () => {
    const events: string[] = [];
    const initial = createInitialGoal(
        "run-auto-action",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    const store = new RecordingGoalStore(events);
    await store.seed(initial);
    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: {
                actionId: "action-auto",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "complete",
            completionEvidence: [],
            summary: "目标完成",
        },
    ], events);
    const tool = createRunnerTool(async ({ actionId, input }) => {
        events.push(`tool:${actionId}`);
        assert.deepEqual(input, { path: "README.md" });
        return {
            kind: "success",
            output: "文件内容",
            summary: "读取完成",
        };
    });

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
        toolPolicy: { evaluate: () => "allow" },
    }).run(createRef(initial, "run-auto-action"));

    const state = requireSuccessfulState(result);
    assert.deepEqual(events, [
        "restore:goal-1",
        "restore:goal-1",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "executor:0",
        "save:goal-1:running:0",
        "save:goal-1:running:0",
        "tool:action-auto",
        "save:goal-1:running:1",
        "save:goal-1:running:1",
        "executor:1",
        "save:goal-1:completed:2",
    ]);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.equal(executor.receivedGoals[1]?.state.run.id, "run-auto-action");
    assert.equal(executor.receivedGoals[1]?.state.run.status, "running");
    assert.equal(executor.receivedGoals[1]?.state.run.stepCount, 1);
    assert.deepEqual(executor.receivedGoals[1]?.state.run.lastStep, {
            kind: "action",
            action: {
                actionId: "action-auto",
                toolId: "read_file",
                input: { path: "README.md" },
            },
            observation: {
                kind: "success",
                output: "文件内容",
                summary: "读取完成",
            },
    });
    assert.equal(state.pendingAction, undefined);
    assert.deepEqual((await store.peek(initial.id))?.state.messages, [
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "目标完成",
        },
    ]);
});

test("Runner 保留 Agent 选择的 Bash 命令，不按命令文本改写", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-bash-command",
        "goal-bash-command",
        { ...profile, toolIds: ["bash"] },
    );
    await store.save(initial);
    const command = "grep -R --line-number --exclude='*.map' src packages";
    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: {
                actionId: "action-bash-command",
                toolId: "bash",
                input: { command },
            },
        },
        {
            kind: "complete",
            completionEvidence: [],
            summary: "完成",
        },
    ]);
    const tool: TestTool = {
        definition: {
            id: "bash",
            description: "执行 Bash 命令",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            assert.deepEqual(input, { command });
            return {
                kind: "success",
                output: { stdout: "src/example.ts:1", stderr: "" },
                summary: "搜索完成",
            };
        },
    };

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: (toolId) => toolId === "bash" ? registerTool(tool) : undefined },
        toolPolicy: { evaluate: () => "allow" },
    }).run(createRef(initial, "run-bash-command"));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.deepEqual(executor.receivedGoals[1]?.state.run.lastStep, {
        kind: "action",
        action: {
            actionId: "action-bash-command",
            toolId: "bash",
            input: { command },
        },
        observation: {
            kind: "success",
            output: { stdout: "src/example.ts:1", stderr: "" },
            summary: "搜索完成",
        },
    });
});

test("require_approval 会保存等待中的 Action 且不调用 Tool", async () => {
    const initial = createInitialGoal(
        "run-action-approval",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    const store = new InMemoryGoalStore();
    await store.save(initial);
    let toolCalls = 0;
    const tool = createRunnerTool(async () => {
        toolCalls += 1;
        return { kind: "success", output: "不应执行", summary: "不应执行" };
    });
    const executor = new SequenceDecisionExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-approval",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
        toolPolicy: { evaluate: () => "require_approval" },
    }).run(createRef(initial, "run-action-approval"));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "waiting");
    assert.equal(state.stepCount, 0);
    assert.deepEqual(state.pendingAction, {
        action: {
            actionId: "action-approval",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "awaiting_approval",
    });
    assert.equal(toolCalls, 0);
    assert.equal(executor.receivedGoals.length, 1);
});

test("Runner 批准后为同一 canonical Action 重新 prepare 且不重复评估 Policy", async () => {
    const initial = createInitialGoal(
        "run-approval-reprepare",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    const action = {
        actionId: "action-approval-reprepare",
        toolId: "read_file",
        input: { path: "README.md" },
    } as const;
    let toolCalls = 0;
    let policyCalls = 0;
    const tool = createRunnerTool(async ({ actionId }) => {
        toolCalls += 1;
        assert.equal(actionId, action.actionId);
        return { kind: "success", output: "文件内容", summary: "读取完成" };
    });
    const counted = countPrepareCalls(registerTool(tool));
    const executor = new SequenceDecisionExecutor([
        { kind: "tool_call", action },
        { kind: "complete", completionEvidence: [], summary: "批准后完成" },
    ]);
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        toolRegistry: { get: () => counted.registration },
        toolPolicy: {
            evaluate: ({ action: evaluatedAction }) => {
                policyCalls += 1;
                assert.deepEqual(evaluatedAction, action);
                return "require_approval";
            },
        },
    });

    const waiting = requireSuccessfulState(
        await runner.run(createRef(initial, "run-approval-reprepare")),
    );
    assert.equal(waiting.status, "waiting");
    assert.equal(counted.prepareCalls(), 1);
    assert.deepEqual(waiting.pendingAction, {
        action,
        status: "awaiting_approval",
    });
    assert.equal(policyCalls, 1);
    assert.equal(toolCalls, 0);

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        scheduler: new InlineScheduler(runner),
    });
    const resumed = await coordinator.resume({
        ref: createRef(initial, "run-approval-reprepare"),
        action: { kind: "approve_action", actionId: action.actionId },
    });
    if (!resumed.ok) {
        assert.fail(`expected approval to resume execution: ${resumed.error.message}`);
    }

    assert.equal(resumed.kind, "terminal");
    assert.equal(resumed.goal.state.run.status, "completed");
    assert.equal(resumed.goal.state.run.stepCount, 2);
    assert.equal(resumed.goal.state.run.pendingAction, undefined);
    assert.equal(counted.prepareCalls(), 2);
    assert.equal(policyCalls, 1);
    assert.equal(toolCalls, 1);

    const actionEvents = trajectory.events.filter((event) =>
        event.eventType === "action_staged"
        || event.eventType === "tool_started"
        || event.eventType === "tool_finished"
        || event.eventType === "observation_recorded"
        || (
            event.eventType === "decision_received"
            && event.payload.decision.kind === "tool_call"
        ),
    );
    assert.deepEqual(actionEvents.map((event) =>
        event.eventType === "decision_received"
            ? event.payload.decision.kind === "tool_call"
                ? event.payload.decision.action.actionId
                : undefined
            : event.actionId,
    ), [
        action.actionId,
        action.actionId,
        action.actionId,
        action.actionId,
        action.actionId,
    ]);
    const approvalIndex = trajectory.events.findIndex(
        (event) => event.eventType === "action_approved",
    );
    const toolStartedIndex = trajectory.events.findIndex(
        (event) => event.eventType === "tool_started",
    );
    assert.ok(approvalIndex >= 0 && approvalIndex < toolStartedIndex);
});

test("Runner 只接受匹配的瞬时授权并且批准本身不重复计 Step", async () => {
    const initialGoal = createInitialGoal(
        "run-authorized-action",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
        [],
        0,
    );
    const initial = withRun(
        initialGoal,
        applyTransition(initialGoal.state.run, { kind: "start" }),
    );
    const action = {
        actionId: "action-authorized",
        toolId: "read_file",
        input: { path: "README.md" },
    } as const;
    const staged = withRun(initial, applyTransition(initial.state.run, {
        kind: "stage_action",
        action,
        status: "approved",
    }));
    const store = new InMemoryGoalStore();
    await store.save(staged);
    let toolCalls = 0;
    const tool = createRunnerTool(async ({ actionId }) => {
        toolCalls += 1;
        assert.equal(actionId, action.actionId);
        return { kind: "success", output: "文件内容", summary: "读取完成" };
    });
    const executor = new SequenceDecisionExecutor([{
        kind: "complete",
        completionEvidence: [],
        summary: "任务完成",
    }]);
    const runner = new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
        toolPolicy: { evaluate: () => "require_approval" },
    });

    const unauthorized = await runner.run(createRef(staged), {
        authorizedActionId: "action-other",
    });
    const unauthorizedFailure = requireFailedResult(unauthorized);
    assert.equal(unauthorizedFailure.error.code, "ACTION_NOT_AUTHORIZED");
    assert.equal(toolCalls, 0);
    assert.equal(executor.receivedGoals.length, 0);

    const result = await runner.run(createRef(staged), {
        authorizedActionId: action.actionId,
    });
    const state = requireSuccessfulState(result);

    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.equal(toolCalls, 1);
    assert.equal(executor.receivedGoals.length, 1);
    assert.equal(state.pendingAction, undefined);
});

test("Runner 恢复 safe pending Action 时沿用原 actionId 自动重放", async () => {
    const base = createInitialGoal(
        "run-safe-replay",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
        [],
        0,
    );
    const running = withRun(
        base,
        applyTransition(base.state.run, { kind: "start" }),
    );
    const action = {
        actionId: "action-safe-replay",
        toolId: "read_file",
        input: { path: "README.md" },
    } as const;
    const interrupted = withRun(running, applyTransition(running.state.run, {
        kind: "stage_action",
        action,
        status: "approved",
    }));
    const store = new InMemoryGoalStore();
    await store.save(interrupted);
    const trajectory = new InMemoryTrajectoryStore();
    const actionIds: string[] = [];
    const tool = createRunnerTool(async ({ actionId }) => {
        actionIds.push(actionId);
        return { kind: "success", output: "内容", summary: "读取完成" };
    });
    const executor = new SequenceDecisionExecutor([{
        kind: "complete",
        completionEvidence: [],
        summary: "任务完成",
    }]);

    const counted = countPrepareCalls(registerTool(tool));
    const result = await new Runner({
        trajectoryStore: trajectory,
        store,
        executor,
        toolRegistry: { get: () => counted.registration },
        toolPolicy: {
            evaluate: () => {
                throw new Error("恢复 safe Action 不应重新评估 Policy");
            },
        },
    }).run(createRef(interrupted));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(actionIds, [action.actionId]);
    assert.equal(executor.receivedGoals.length, 1);
    assert.equal(executor.receivedGoals[0]?.state.run.stepCount, 1);
    assert.deepEqual(executor.receivedGoals[0]?.state.run.lastStep, {
        kind: "action",
        action,
        observation: {
            kind: "success",
            output: "内容",
            summary: "读取完成",
        },
    });
    assert.equal(state.pendingAction, undefined);
    assert.equal(counted.prepareCalls(), 1);
    assert.equal(counted.registration.replayPolicy, "safe");
    assert.deepEqual(
        trajectory.events
            .filter((event) => event.actionId !== undefined)
            .map((event) => event.actionId),
        [action.actionId, action.actionId, action.actionId, action.actionId],
    );
});

test("Runner 恢复 manual pending Action 时进入 outcome_unknown waiting 而不调用 Tool", async () => {
    const base = createInitialGoal(
        "run-manual-replay",
        "goal-1",
        { ...profile, toolIds: ["manual_tool"] },
        [],
        0,
    );
    const running = withRun(
        base,
        applyTransition(base.state.run, { kind: "start" }),
    );
    const action = {
        actionId: "action-manual-replay",
        toolId: "manual_tool",
        input: { value: "x" },
    } as const;
    const interrupted = withRun(running, applyTransition(running.state.run, {
        kind: "stage_action",
        action,
        status: "approved",
    }));
    const store = new InMemoryGoalStore();
    await store.save(interrupted);
    const trajectory = new InMemoryTrajectoryStore();
    let toolCalls = 0;
    const tool = {
        ...createRunnerTool(async () => {
            toolCalls += 1;
            return { kind: "success", output: "不应执行", summary: "不应执行" };
        }),
        definition: {
            id: "manual_tool",
            description: "需要人工确认的 Tool",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "manual" as const,
    };
    const executor = new SequenceDecisionExecutor([]);
    const counted = countPrepareCalls(registerTool(tool));

    const result = await new Runner({
        trajectoryStore: trajectory,
        store,
        executor,
        toolRegistry: { get: () => counted.registration },
    }).run(createRef(interrupted));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "waiting");
    assert.equal(state.stepCount, 0);
    assert.deepEqual(state.pendingAction, {
        action,
        status: "outcome_unknown",
    });
    assert.equal(toolCalls, 0);
    assert.equal(executor.receivedGoals.length, 0);
    assert.equal(counted.prepareCalls(), 1);
    assert.equal(counted.registration.replayPolicy, "manual");
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "action_recovered",
        "state_committed",
    ]);
    assert.deepEqual(trajectory.events[0]?.payload, {
        type: "action_recovered",
        actionId: action.actionId,
        replayPolicy: "manual",
    });
    assert.deepEqual((await store.restore(interrupted.id))?.state.run, state);
});

test("Action loop reaches maxSteps after completing a pending Action", async () => {
    const initial = createInitialGoal(
        "run-action-max-steps",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
        [],
        1,
    );
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const executor = new SequenceDecisionExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-max-steps",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);
    let toolCalls = 0;
    const tool = createRunnerTool(async () => {
        toolCalls += 1;
        return { kind: "success", output: "内容", summary: "读取完成" };
    });

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 1);
    assert.deepEqual(state.stopReason, { kind: "max_steps_exceeded" });
    assert.equal(toolCalls, 1);
    assert.equal(executor.receivedGoals.length, 1);
    assert.equal(state.pendingAction, undefined);
});

test("Action loop 在 maxSteps 为 0 时持续完成多个 Tool 周期", async () => {
    const initial = createInitialGoal(
        "run-action-unlimited",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
        [],
        0,
    );
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: {
                actionId: "action-unlimited-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "tool_call",
            action: {
                actionId: "action-unlimited-2",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "complete",
            completionEvidence: [],
            summary: "任务完成",
        },
    ]);
    const actionIds: string[] = [];
    const tool = createRunnerTool(async ({ actionId }) => {
        actionIds.push(actionId);
        return { kind: "success", output: "内容", summary: "读取完成" };
    });

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 3);
    assert.deepEqual(actionIds, ["action-unlimited-1", "action-unlimited-2"]);
    assert.equal(executor.receivedGoals.length, 3);
});

test("Runner 将领域 failure Observation 保存后继续下一轮", async () => {
    const initial = createInitialGoal(
        "run-domain-failure",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: {
                actionId: "action-domain-failure",
                toolId: "read_file",
                input: { path: "missing.txt" },
            },
        },
        {
            kind: "complete",
            completionEvidence: [],
            summary: "采用替代方案完成",
        },
    ]);
    let toolCalls = 0;
    const tool = createRunnerTool(async () => {
        toolCalls += 1;
        return {
            kind: "failure",
            code: "FILE_NOT_FOUND",
            message: "文件不存在",
            retryable: true,
        };
    });

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial, "run-domain-failure"));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.equal(toolCalls, 1);
    assert.equal(executor.receivedGoals.length, 2);
    assert.deepEqual(executor.receivedGoals[1]?.state.run.lastStep, {
        kind: "action",
        action: {
            actionId: "action-domain-failure",
            toolId: "read_file",
            input: { path: "missing.txt" },
        },
        observation: {
            kind: "failure",
            code: "FILE_NOT_FOUND",
            message: "文件不存在",
            retryable: true,
        },
    });
});

test("pendingAction 保存失败时不调用 Tool 并传播 Store 错误", async () => {
    const initial = createInitialGoal(
        "run-pending-save-failure",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    const saveError = new Error("pending save failed");
    const control = createSaveFailingStore(2, saveError);
    await control.delegate.save(initial);
    let toolCalls = 0;
    const tool = createRunnerTool(async () => {
        toolCalls += 1;
        return { kind: "success", output: "不应执行", summary: "不应执行" };
    });
    const executor = new SequenceDecisionExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-pending-save-failure",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);

    await assertRejectsWithSameError(
        () => new Runner({
        trajectoryStore: trajectoryStoreFor(control.store),
            store: control.store,
            executor,
        toolRegistry: { get: () => registerTool(tool) },
        }).run(createRef(initial, "run-pending-save-failure")),
        saveError,
    );

    assert.equal(control.saveCalls(), 2);
    assert.equal(toolCalls, 0);
    const persisted = await control.delegate.restore(initial.id);
    assert.equal(persisted?.state.run.pendingAction, undefined);
    assert.equal(persisted?.state.run.stepCount, 0);
});

test("Observation 保存失败时保留已暂存 pendingAction", async () => {
    const initial = createInitialGoal(
        "run-observation-save-failure",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    const saveError = new Error("observation save failed");
    const control = createSaveFailingStore(5, saveError);
    await control.delegate.save(initial);
    let toolCalls = 0;
    const tool = createRunnerTool(async () => {
        toolCalls += 1;
        return { kind: "success", output: "文件内容", summary: "读取完成" };
    });
    const executor = new SequenceDecisionExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-observation-save-failure",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);

    await assertRejectsWithSameError(
        () => new Runner({
        trajectoryStore: trajectoryStoreFor(control.store),
            store: control.store,
            executor,
        toolRegistry: { get: () => registerTool(tool) },
        }).run(createRef(initial, "run-observation-save-failure")),
        saveError,
    );

    assert.equal(control.saveCalls(), 5);
    assert.equal(toolCalls, 1);
    const persisted = await control.delegate.restore(initial.id);
    assert.equal(persisted?.state.run.status, "running");
    assert.equal(persisted?.state.run.stepCount, 0);
    assert.deepEqual(persisted?.state.run.pendingAction, {
        action: {
            actionId: "action-observation-save-failure",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "approved",
        attemptsStarted: 1,
    });
    assert.equal(persisted?.state.run.lastStep, undefined);
});

test("Tool 异常会保存 outcome_unknown execution_error", async () => {
    const initial = createInitialGoal(
        "run-tool-error",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const executor = new SequenceDecisionExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-tool-error",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);
    const tool = createRunnerTool(async () => {
        throw new Error("文件系统不可用");
    });

    const result = await new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
        toolRegistry: { get: () => registerTool(tool) },
    }).run(createRef(initial, "run-tool-error"));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 0);
    assert.deepEqual(state.pendingAction, {
        action: {
            actionId: "action-tool-error",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "outcome_unknown",
    });
    assert.deepEqual(state.stopReason, {
        kind: "execution_error",
        code: "TOOL_EXECUTION_ERROR",
        message: "文件系统不可用",
    });
});

test("Runner 将运行时非法 AgentDecision 保存为 INVALID_AGENT_DECISION", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal("run-invalid-decision");
    await store.save(initial);
    const executor = new FakeDecisionExecutor({
        kind: "complete",
        completionEvidence: [],
        summary: "完成",
        checkpoint: "legacy checkpoint field",
    } as unknown as AgentDecision);

    const result = await new Runner({ store, executor, trajectoryStore: trajectoryStoreFor(store) }).run(
        createRef(initial, "run-invalid-decision"),
    );

    const state = requireSuccessfulState(result);
    assert.equal(state.stepCount, 0);
    assert.equal(state.lastStep, undefined);
    assert.equal(state.stopReason?.kind, "execution_error");
    assert.equal(
        state.stopReason?.kind === "execution_error"
            ? state.stopReason.code
            : undefined,
        "INVALID_AGENT_DECISION",
    );
});

function withExecutingTask(goal: Goal, task: GoalTask): Goal {
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
            },
            run: { ...goal.state.run, mode: "plan", approvedTask: task },
        },
    };
}

test("Runner 声明匹配：携带 acceptance 的条件引用匹配工具与成功结果时通过（Req 2.2）", async () => {
    const store = new InMemoryGoalStore();
    const task: GoalTask = {
        objective: "验证通过条件",
        completionCriteria: [
            {
                text: "成功读取文件",
                acceptance: { expectToolId: "read_file", expectOutcome: "success" },
            },
        ],
    };
    const initial = withExecutingTask(
        createInitialGoal("run-accept-pass", "goal-accept-pass", toolProfile),
        task,
    );
    await store.save(initial);

    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: { content: "ok" },
        summary: "read ok",
    }));

    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "a.txt" } },
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [9] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [9] }],
            summary: "任务已完成",
        },
    ]);

    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(tool) },
    });

    const result = await runner.run(createRef(initial, "run-accept-pass"));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed", JSON.stringify(state.stopReason));
    assert.equal(state.lastStep?.kind, "decision");
});

test("Runner 声明匹配：expect failure 声明引用匹配的 failure 观察时通过（Req 3.1）", async () => {
    const store = new InMemoryGoalStore();
    const task: GoalTask = {
        objective: "验证失败预期条件",
        completionCriteria: [
            {
                text: "预期报错测试",
                acceptance: { expectToolId: "read_file", expectOutcome: "failure" },
            },
        ],
    };
    const initial = withExecutingTask(
        createInitialGoal("run-accept-fail-pass", "goal-accept-fail-pass", toolProfile),
        task,
    );
    await store.save(initial);

    const tool = createRunnerTool(async () => ({
        kind: "failure",
        code: "FILE_NOT_FOUND",
        message: "文件不存在",
        retryable: false,
    }));

    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "nonexistent.txt" } },
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
    ]);

    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(tool) },
    });

    const result = await runner.run(createRef(initial, "run-accept-fail-pass"));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed", JSON.stringify(state.stopReason));
    assert.equal(state.lastStep?.kind, "decision");
});

test("Runner 声明匹配：工具标识不匹配时拒绝 complete 并返回明确缺口（Req 2.1, Req 2.4）", async () => {
    const store = new InMemoryGoalStore();
    const task: GoalTask = {
        objective: "验证工具不匹配",
        completionCriteria: [
            {
                text: "需要 bash 工具",
                acceptance: { expectToolId: "bash", expectOutcome: "success" },
            },
        ],
    };
    const initial = withExecutingTask(
        createInitialGoal("run-mismatch-tool", "goal-mismatch-tool", toolProfile),
        task,
    );
    await store.save(initial);

    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: { content: "ok" },
        summary: "read ok",
    }));

    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "a.txt" } },
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
    ]);

    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(tool) },
    });

    const result = await runner.run(createRef(initial, "run-mismatch-tool"));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "failed");
    assert.equal(state.stopReason?.kind, "execution_error");
    if (state.stopReason?.kind === "execution_error") {
        assert.equal(state.stopReason.code, "INVALID_AGENT_DECISION");
        assert.match(
            state.stopReason.message,
            /exhausted after three decide attempts/u,
        );
    }
});

test("Runner 声明匹配：expect failure 引用 success 观察时被拒（Req 2.3）", async () => {
    const store = new InMemoryGoalStore();
    const task: GoalTask = {
        objective: "验证 failure 声明引用 success 被拒",
        completionCriteria: [
            {
                text: "期望失败但成功了",
                acceptance: { expectToolId: "read_file", expectOutcome: "failure" },
            },
        ],
    };
    const initial = withExecutingTask(
        createInitialGoal("run-fail-got-success", "goal-fail-got-success", toolProfile),
        task,
    );
    await store.save(initial);

    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: { content: "ok" },
        summary: "read ok",
    }));

    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "a.txt" } },
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [9] }],
            summary: "任务已完成",
        },
    ]);

    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(tool) },
    });

    const result = await runner.run(createRef(initial, "run-fail-got-success"));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "failed");
    assert.equal(state.stopReason?.kind, "execution_error");
    if (state.stopReason?.kind === "execution_error") {
        assert.equal(state.stopReason.code, "INVALID_AGENT_DECISION");
        assert.match(
            state.stopReason.message,
            /exhausted after three decide attempts/u,
        );
    }
});

test("Runner 声明匹配：expect success 引用 failure 观察时被拒", async () => {
    const store = new InMemoryGoalStore();
    const task: GoalTask = {
        objective: "验证 success 声明引用 failure 被拒",
        completionCriteria: [
            {
                text: "期望成功但失败了",
                acceptance: { expectToolId: "read_file", expectOutcome: "success" },
            },
        ],
    };
    const initial = withExecutingTask(
        createInitialGoal("run-success-got-fail", "goal-success-got-fail", toolProfile),
        task,
    );
    await store.save(initial);

    const tool = createRunnerTool(async () => ({
        kind: "failure",
        code: "ERR",
        message: "读取错误",
        retryable: false,
    }));

    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "a.txt" } },
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
    ]);

    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(tool) },
    });

    const result = await runner.run(createRef(initial, "run-success-got-fail"));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "failed");
    assert.equal(state.stopReason?.kind, "execution_error");
    if (state.stopReason?.kind === "execution_error") {
        assert.equal(state.stopReason.code, "INVALID_AGENT_DECISION");
        assert.match(
            state.stopReason.message,
            /exhausted after three decide attempts/u,
        );
    }
});

test("Runner 声明匹配：无 acceptance 声明的条件保持现状校验通过（Req 1.2）", async () => {
    const store = new InMemoryGoalStore();
    const task: GoalTask = {
        objective: "验证无声明条件",
        completionCriteria: [
            {
                text: "任意已提交观察均可",
            },
        ],
    };
    const initial = withExecutingTask(
        createInitialGoal("run-no-acceptance", "goal-no-acceptance", toolProfile),
        task,
    );
    await store.save(initial);

    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: { content: "ok" },
        summary: "read ok",
    }));

    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "a.txt" } },
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务已完成",
        },
    ]);

    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(tool) },
    });

    const result = await runner.run(createRef(initial, "run-no-acceptance"));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed", JSON.stringify(state.stopReason));
    assert.equal(state.lastStep?.kind, "decision");
});

test("Runner 声明匹配：防御性忽略以 system_ 开头的非法工具验收声明（避免死锁崩溃）", async () => {
    const store = new InMemoryGoalStore();
    const toolProfile: AgentProfile = {
        id: "profile-system-acc",
        systemPrompt: "prompt",
        instructions: [],
        toolIds: ["read_file"],
    };
    const task: GoalTask = {
        objective: "分析任务",
        completionCriteria: [
            {
                text: "总结分析结果",
                acceptance: { expectToolId: "system_complete_task", expectOutcome: "success" },
            },
        ],
    };
    const initial = withExecutingTask(
        createInitialGoal("run-system-acc", "goal-system-acc", toolProfile),
        task,
    );
    await store.save(initial);

    const tool = createRunnerTool(async () => ({
        kind: "success",
        output: { content: "ok" },
        summary: "read ok",
    }));

    const executor = new SequenceDecisionExecutor([
        {
            kind: "tool_call",
            action: { actionId: "act-1", toolId: "read_file", input: { path: "a.txt" } },
        },
        {
            kind: "complete",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
            summary: "任务分析完成",
        },
    ]);

    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectoryStoreFor(store),
        toolRegistry: { get: () => registerTool(tool) },
    });

    const result = await runner.run(createRef(initial, "run-system-acc"));
    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.equal(state.lastStep?.kind, "decision");
});
