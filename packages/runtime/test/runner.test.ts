import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createRun,
    Runner,
    transition,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
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
    StepExecutor,
    Tool,
    ToolDefinition,
    ToolPolicy,
    ToolRegistry,
} from "../src/index";

const goalDefinition: GoalTask = {
    objective: "完成最小同步 Goal Loop",
    completionCriteria: ["Run 进入终态或等待状态"],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["逐步完成目标"],
    toolIds: [],
};

const toolProfile: AgentProfile = { ...profile, toolIds: ["read_file"] };

type ExecuteAction = (
    goal: Goal,
) => AgentDecision | Promise<AgentDecision>;

class FakeStepExecutor implements StepExecutor {
    readonly receivedGoals: Goal[] = [];

    constructor(
        private readonly actions: readonly ExecuteAction[],
        private readonly events: string[] = [],
    ) {}

    async execute(goal: Goal): Promise<AgentDecision> {
        const action = this.actions[this.receivedGoals.length];
        this.receivedGoals.push(goal);
        this.events.push(`execute:${goal.state.run.status}:${goal.state.run.stepCount}`);

        if (action === undefined) {
            throw new Error("Unexpected StepExecutor call");
        }

        return action(goal);
    }
}

class FakeDecisionExecutor implements StepExecutor {
    readonly receivedTools: ToolDefinition[][] = [];

    constructor(private readonly decision: AgentDecision) {}

    async execute(
        _goal: Goal,
        tools: readonly ToolDefinition[],
    ): Promise<AgentDecision> {
        this.receivedTools.push([...tools]);
        return structuredClone(this.decision);
    }
}

class SequenceDecisionExecutor implements StepExecutor {
    readonly receivedGoals: Goal[] = [];
    private index = 0;

    constructor(
        private readonly decisions: readonly AgentDecision[],
        private readonly events: string[] = [],
    ) {}

    async execute(
        goal: Goal,
        _tools: readonly ToolDefinition[],
    ): Promise<AgentDecision> {
        this.receivedGoals.push(goal);
        this.events.push(`executor:${goal.state.run.stepCount}`);
        const decision = this.decisions[this.index];
        this.index += 1;

        if (decision === undefined) {
            throw new Error("Unexpected AgentDecision call");
        }

        return structuredClone(decision);
    }
}

function createRunnerTool(
    execute: Tool["execute"],
    validate: Tool["validate"] = () => ({ ok: true }),
): Tool {
    return {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputSchema: { type: "object" },
        },
        replayPolicy: "safe",
        validate,
        execute,
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
): Goal {
    const created = createGoal({
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
                preparation: { status: "completed" },
                task: goalDefinition,
            },
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
                checkpoint: "等待外部输入",
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

    return goal.state.workflow.task;
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
        checkpoint: "已吸收读取结果",
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
            checkpoint: "准备读取文件",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        }),
        () => completeDecision,
    ], events);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
    });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:running:0",
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
            { status: "running", stepCount: 1 },
            { status: "completed", stepCount: 2 },
        ],
    );
    assert.strictEqual(executor.receivedGoals[0], store.savedGoals[0]);
    assert.strictEqual(executor.receivedGoals[1], store.savedGoals[2]);
    assert.deepEqual(state, store.savedGoals[3]?.state.run);
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

test("does not start or consume a Step for a preparation Goal", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const preparationGoal = createGoal({
        promptBundleVersion: 1,
        id: "goal-preparation",
        intent: "先收集上下文",
        profile,
        runId: "run-preparation",
    });
    await store.seed(preparationGoal);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(preparationGoal)),
    );

    assert.deepEqual(state, createRun("run-preparation"));
    assert.deepEqual(events, ["restore:goal-preparation"]);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(executor.receivedGoals, []);
});

test("stops on blocked and continues an externally resumed Goal", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const initial = createInitialGoal();
    await store.seed(initial);
    const waitDecision = {
        kind: "wait",
        checkpoint: "需要用户批准",
        reason: "需要破坏性操作批准",
    } as const;
    const completeDecision = {
        kind: "complete",
        checkpoint: "批准后收尾",
        summary: "批准后完成",
    } as const;
    const executor = new FakeStepExecutor([
        () => waitDecision,
        () => completeDecision,
    ], events);
    const runner = new Runner({ store, executor });
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
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:waiting:1",
        "restore:goal-1",
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
            { status: "waiting", stepCount: 1 },
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
                    checkpoint: "已确定要读取的文件",
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
                    checkpoint: "恢复后收尾",
                    summary: `${scenario.label} 恢复后完成`,
                };
            },
        ]);
        const runner = new Runner({ store, executor });

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
            checkpoint: "恢复后收尾",
            summary: "恢复后完成",
        }),
    ]);
    const waitingRunner = new Runner({
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
        const runner = new Runner({ store, executor });

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
                    checkpoint: "已收尾",
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
                    checkpoint: "已失败",
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
        const runner = new Runner({ store, executor });

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
    const runner = new Runner({ store, executor });
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
    const runner = new Runner({ store, executor });

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
            checkpoint: "第一次",
            action: { actionId: "action-1", toolId: "read_file", input: {} },
        }),
        () => ({
            kind: "tool_call",
            checkpoint: "第二次",
            action: { actionId: "action-2", toolId: "read_file", input: {} },
        }),
    ], events);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:running:0",
        "save:goal-1:running:1",
        "execute:running:1",
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
                checkpoint: "已确定要读取的文件",
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
                checkpoint: "等待恢复",
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
    const runner = new Runner({ store, executor });

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

test("converts an executor exception into a persisted fail decision", async () => {
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
    const runner = new Runner({ store, executor });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 1);
    assert.deepEqual(state.lastStep, {
        kind: "decision",
        result: {
            kind: "fail",
            checkpoint: "Executor failed before returning an AgentDecision.",
            error: "executor failed",
        },
    });
    assert.deepEqual((await store.peek(initial.id))?.state.messages, [
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "executor failed",
        },
    ]);
    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:failed:1",
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
            checkpoint: "无法继续",
            error: "无法满足完成条件",
        }),
    ]);
    const runner = new Runner({ store, executor });

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
            checkpoint: `累计 checkpoint ${index + 1}`,
            action: {
                actionId: `action-${index + 1}`,
                toolId: "read_file",
                input: {},
            },
        })),
        () => ({
            kind: "complete" as const,
            checkpoint: "无限模式收尾",
            summary: "无限模式完成",
        }),
    ]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
    const runner = new Runner({ store, executor });

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
    const runner = new Runner({ store, executor });

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
        checkpoint: "已确定要读取的文件",
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
            checkpoint: "恢复后继续",
            action: {
                actionId: "action-save-error-2",
                toolId: "read_file",
                input: {},
            },
        }),
        () => ({
            kind: "complete",
            checkpoint: "不应执行",
            summary: "不应执行",
        }),
    ]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
    assert.equal(executor.receivedGoals.length, 1);
    assert.equal(executor.receivedGoals[0]?.state.run.stepCount, 1);
    assert.strictEqual(latestGoal, persisted);
});

test("Runner 在 Profile 授权校验前不访问 Registry 或 Tool", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal("run-unauthorized");
    await store.save(initial);
    let registryCalls = 0;
    let validateCalls = 0;
    let executeCalls = 0;
    const tool: Tool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputSchema: { type: "object" },
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
            return tool;
        },
    };
    const executor = new FakeDecisionExecutor({
        kind: "tool_call",
        checkpoint: "准备读取文件",
        action: {
            actionId: "action-unauthorized",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    });
    const result = await new Runner({ store, executor, toolRegistry: registry }).run(
        createRef(initial, "run-unauthorized"),
    );

    const state = requireSuccessfulState(result);
    assert.equal(state.stepCount, 0);
    assert.equal(state.lastStep, undefined);
    assert.deepEqual(state.stopReason, {
        kind: "execution_error",
        code: "TOOL_NOT_AUTHORIZED",
        message: 'Tool "read_file" is not authorized by the frozen Profile',
    });
    assert.equal(registryCalls, 0);
    assert.equal(validateCalls, 0);
    assert.equal(executeCalls, 0);
    assert.deepEqual(executor.receivedTools, [[]]);
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
        checkpoint: "准备读取文件",
        action: {
            actionId: "action-missing-tool",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    });
    const result = await new Runner({
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
        code: "TOOL_NOT_FOUND",
        message: 'Authorized Tool "read_file" is not registered',
    });
    assert.deepEqual(executor.receivedTools, [[]]);
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
    const tool: Tool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputSchema: { type: "object" },
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
        checkpoint: "准备读取文件",
        action: {
            actionId: "action-invalid-input",
            toolId: "read_file",
            input: { path: "../secret.txt" },
        },
    });
    const result = await new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
    }).run(createRef(initial, "run-invalid-input"));

    const state = requireSuccessfulState(result);
    assert.equal(state.stepCount, 0);
    assert.deepEqual(state.stopReason, {
        kind: "execution_error",
        code: "INVALID_TOOL_INPUT",
        message: "path 必须是工作区内相对路径",
    });
    assert.equal(executeCalls, 0);
});

test("Runner 将 Tool Registry/校验基础设施异常保存为 TOOL_EXECUTION_ERROR", async () => {
    const store = new InMemoryGoalStore();
    const initial = createInitialGoal(
        "run-tool-infrastructure",
        "goal-1",
        { ...profile, toolIds: ["read_file"] },
    );
    await store.save(initial);
    const tool: Tool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputSchema: { type: "object" },
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
        checkpoint: "准备读取文件",
        action: {
            actionId: "action-tool-infrastructure",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    });

    const result = await new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
    const tool: Tool = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputSchema: { type: "object" },
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
    const executor: StepExecutor = {
        async execute(_goal, tools) {
            events.push(`executor:${tools.length}`);

            if (executorCalls++ > 0) {
                return {
                    kind: "complete",
                    checkpoint: "已吸收读取结果",
                    summary: "完成",
                };
            }

            return {
                kind: "tool_call",
                checkpoint: "准备读取文件",
                action: {
                    actionId: "action-policy-order",
                    toolId: "read_file",
                    input: { path: "README.md" },
                },
            };
        },
    };
    const registry: ToolRegistry = {
        get: (toolId) => {
            events.push(`registry:${toolId}`);
            return tool;
        },
    };
    const policy: ToolPolicy = {
        evaluate: () => {
            events.push("policy");
            return "allow";
        },
    };

    const result = await new Runner({
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
            checkpoint: "已吸收读取结果",
            summary: "完成",
        },
    });
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
            checkpoint: "准备读取文件",
            action: {
                actionId: "action-auto",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "complete",
            checkpoint: "已吸收读取结果",
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
        store,
        executor,
        toolRegistry: { get: () => tool },
        toolPolicy: { evaluate: () => "allow" },
    }).run(createRef(initial, "run-auto-action"));

    const state = requireSuccessfulState(result);
    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:running:0",
        "executor:0",
        "save:goal-1:running:0",
        "tool:action-auto",
        "save:goal-1:running:1",
        "executor:1",
        "save:goal-1:completed:2",
    ]);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(executor.receivedGoals[1]?.state.run, {
        id: "run-auto-action",
        status: "running",
        stepCount: 1,
        checkpoint: "准备读取文件",
        lastStep: {
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
            checkpoint: "准备执行 Agent 选择的 Bash 搜索",
            action: {
                actionId: "action-bash-command",
                toolId: "bash",
                input: { command },
            },
        },
        {
            kind: "complete",
            checkpoint: "已吸收 Bash 搜索结果",
            summary: "完成",
        },
    ]);
    const tool: Tool = {
        definition: {
            id: "bash",
            description: "执行 Bash 命令",
            inputSchema: { type: "object" },
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
        store,
        executor,
        toolRegistry: { get: (toolId) => toolId === "bash" ? tool : undefined },
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
        checkpoint: "等待确认后读取文件",
        action: {
            actionId: "action-approval",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);

    const result = await new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
        checkpoint: "已批准读取文件",
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
        checkpoint: "已完成任务",
        summary: "任务完成",
    }]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
        checkpoint: "已保存读取意图",
        action,
        status: "approved",
    }));
    const store = new InMemoryGoalStore();
    await store.save(interrupted);
    const actionIds: string[] = [];
    const tool = createRunnerTool(async ({ actionId }) => {
        actionIds.push(actionId);
        return { kind: "success", output: "内容", summary: "读取完成" };
    });
    const executor = new SequenceDecisionExecutor([{
        kind: "complete",
        checkpoint: "已吸收重放结果",
        summary: "任务完成",
    }]);

    const result = await new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
        checkpoint: "已保存人工确认 Action",
        action,
        status: "approved",
    }));
    const store = new InMemoryGoalStore();
    await store.save(interrupted);
    let toolCalls = 0;
    const tool = {
        ...createRunnerTool(async () => {
            toolCalls += 1;
            return { kind: "success", output: "不应执行", summary: "不应执行" };
        }),
        definition: {
            id: "manual_tool",
            description: "需要人工确认的 Tool",
            inputSchema: { type: "object" },
        },
        replayPolicy: "manual" as const,
    };
    const executor = new SequenceDecisionExecutor([]);

    const result = await new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
        checkpoint: "读取文件",
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
        store,
        executor,
        toolRegistry: { get: () => tool },
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
            checkpoint: "第一次读取",
            action: {
                actionId: "action-unlimited-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "tool_call",
            checkpoint: "第二次读取",
            action: {
                actionId: "action-unlimited-2",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "complete",
            checkpoint: "已完成连续读取",
            summary: "任务完成",
        },
    ]);
    const actionIds: string[] = [];
    const tool = createRunnerTool(async ({ actionId }) => {
        actionIds.push(actionId);
        return { kind: "success", output: "内容", summary: "读取完成" };
    });

    const result = await new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
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
            checkpoint: "尝试读取缺失文件",
            action: {
                actionId: "action-domain-failure",
                toolId: "read_file",
                input: { path: "missing.txt" },
            },
        },
        {
            kind: "complete",
            checkpoint: "已吸收文件不存在结果",
            summary: "采用替代方案完成",
        },
    ]);
    const tool = createRunnerTool(async () => ({
        kind: "failure",
        code: "FILE_NOT_FOUND",
        message: "文件不存在",
        retryable: true,
    }));

    const result = await new Runner({
        store,
        executor,
        toolRegistry: { get: () => tool },
    }).run(createRef(initial, "run-domain-failure"));

    const state = requireSuccessfulState(result);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
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
        checkpoint: "准备读取文件",
        action: {
            actionId: "action-pending-save-failure",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);

    await assertRejectsWithSameError(
        () => new Runner({
            store: control.store,
            executor,
            toolRegistry: { get: () => tool },
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
    const control = createSaveFailingStore(3, saveError);
    await control.delegate.save(initial);
    let toolCalls = 0;
    const tool = createRunnerTool(async () => {
        toolCalls += 1;
        return { kind: "success", output: "文件内容", summary: "读取完成" };
    });
    const executor = new SequenceDecisionExecutor([{
        kind: "tool_call",
        checkpoint: "准备读取文件",
        action: {
            actionId: "action-observation-save-failure",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }]);

    await assertRejectsWithSameError(
        () => new Runner({
            store: control.store,
            executor,
            toolRegistry: { get: () => tool },
        }).run(createRef(initial, "run-observation-save-failure")),
        saveError,
    );

    assert.equal(control.saveCalls(), 3);
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
        checkpoint: "准备读取文件",
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
        store,
        executor,
        toolRegistry: { get: () => tool },
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
        checkpoint: "",
        summary: "完成",
    } as unknown as AgentDecision);

    const result = await new Runner({ store, executor }).run(
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
