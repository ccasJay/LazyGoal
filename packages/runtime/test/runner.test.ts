import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    Runner,
    transition,
} from "../src/index";
import { InMemoryGoalStore } from "../src/goal-store";
import type {
    AgentProfile,
    Goal,
    GoalDefinition,
    GoalMessage,
    GoalStore,
    RunInput,
    RunnerResult,
    RunRef,
    RunState,
    StepExecutionResult,
    StepExecutor,
    StepResult,
} from "../src/index";

const goalDefinition: GoalDefinition = {
    id: "goal-1",
    objective: "完成最小同步 Goal Loop",
    completionCriteria: ["Run 进入终态或等待状态"],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["逐步完成目标"],
    toolIds: [],
};

type ExecuteAction = (
    goal: Goal,
) => StepResult | StepExecutionResult | Promise<StepResult | StepExecutionResult>;

class FakeStepExecutor implements StepExecutor {
    readonly receivedGoals: Goal[] = [];

    constructor(
        private readonly actions: readonly ExecuteAction[],
        private readonly events: string[] = [],
    ) {}

    async execute(goal: Goal): Promise<StepExecutionResult> {
        const action = this.actions[this.receivedGoals.length];
        this.receivedGoals.push(goal);
        this.events.push(`execute:${goal.run.status}:${goal.run.stepCount}`);

        if (action === undefined) {
            throw new Error("Unexpected StepExecutor call");
        }

        const outcome = await action(goal);
        return "result" in outcome
            ? outcome
            : { result: outcome, appendedMessages: [] };
    }
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
        this.events.push(`save:${goal.id}:${goal.run.status}:${goal.run.stepCount}`);
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
    goalId = goalDefinition.id,
    runProfile: AgentProfile = profile,
    messages: readonly GoalMessage[] = [],
): Goal {
    return createGoal({
        id: goalId,
        task: goalDefinition,
        profile: runProfile,
        messages,
        runId,
    });
}

function withRun(goal: Goal, run: RunState): Goal {
    return { ...goal, run };
}

function createRunningGoal(runId = "run-1"): Goal {
    const goal = createInitialGoal(runId);
    return withRun(goal, applyTransition(goal.run, { kind: "start" }));
}

function createWaitingGoal(runId = "run-1"): Goal {
    const running = createRunningGoal(runId);
    return withRun(
        running,
        applyTransition(running.run, {
            kind: "step",
            result: { kind: "wait", reason: "等待外部输入" },
        }),
    );
}

function createRef(goal: Goal, runId = goal.run.id): RunRef {
    return { goalId: goal.id, runId };
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
    const initial = createInitialGoal();
    await store.seed(initial);
    const continueResult = { kind: "continue", summary: "继续执行" } as const;
    const completeResult = { kind: "complete", summary: "目标完成" } as const;
    const executor = new FakeStepExecutor([
        (goal) => ({
            result: continueResult,
            appendedMessages: [
                { role: "user", content: `step-${goal.run.stepCount}` },
                { role: "assistant", content: "继续执行" },
            ],
        }),
        () => completeResult,
    ], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:running:1",
        "execute:running:1",
        "save:goal-1:completed:2",
    ]);
    assert.deepEqual(
        store.savedGoals.map(({ run: { status, stepCount } }) => ({
            status,
            stepCount,
        })),
        [
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 1 },
            { status: "completed", stepCount: 2 },
        ],
    );
    assert.strictEqual(executor.receivedGoals[0], store.savedGoals[0]);
    assert.strictEqual(executor.receivedGoals[1], store.savedGoals[1]);
    assert.deepEqual(state, store.savedGoals[2]?.run);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(state.lastResult, completeResult);

    const persisted = await store.peek(initial.id);
    assert.ok(persisted);
    assert.deepEqual(persisted.messages, [
        { role: "user", content: "step-0" },
        { role: "assistant", content: "继续执行" },
    ]);
    assert.deepEqual(persisted.task, initial.task);
    assert.deepEqual(persisted.profile, initial.profile);
    assert.deepEqual(persisted.run, state);
});

test("stops on wait and resumes the same Goal after saving running first", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const initial = createInitialGoal();
    await store.seed(initial);
    const waitResult = { kind: "wait", reason: "等待批准" } as const;
    const completeResult = { kind: "complete", summary: "批准后完成" } as const;
    const executor = new FakeStepExecutor([
        () => waitResult,
        () => completeResult,
    ], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });
    const ref = createRef(initial);

    const waiting = requireSuccessfulState(
        await runner.runUntilBlocked(ref),
    );
    const completed = requireSuccessfulState(await runner.resume(ref));

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
        "save:goal-1:running:1",
        "execute:running:1",
        "save:goal-1:completed:2",
    ]);
    assert.deepEqual(
        store.savedGoals.map(({ run: { status, stepCount } }) => ({
            status,
            stepCount,
        })),
        [
            { status: "running", stepCount: 0 },
            { status: "waiting", stepCount: 1 },
            { status: "running", stepCount: 1 },
            { status: "completed", stepCount: 2 },
        ],
    );
    assert.strictEqual(executor.receivedGoals[1], store.savedGoals[2]);
    assert.deepEqual((await store.peek(initial.id))?.run, completed);
});

test("从 InMemoryGoalStore 恢复 created 和 running Goal 时保留累计进度", async () => {
    const initialMessages: readonly GoalMessage[] = [
        { role: "user", content: "已保存的用户输入" },
        { role: "assistant", content: "已保存的模型响应" },
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
                    applyTransition(created.run, { kind: "start" }),
                );

                return withRun(
                    running,
                    applyTransition(running.run, {
                        kind: "step",
                        result: {
                            kind: "continue",
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
                assert.equal(goal.run.stepCount, scenario.expectedStepCount);
                assert.deepEqual(goal.messages, initialMessages);
                assert.deepEqual(goal.profile, scenario.goal.profile);
                return {
                    kind: "complete",
                    summary: `${scenario.label} 恢复后完成`,
                };
            },
        ]);
        const runner = new Runner({ store, executor, maxSteps: 3 });

        const state = requireSuccessfulState(
            await runner.runUntilBlocked(createRef(scenario.goal)),
        );

        assert.equal(executor.receivedGoals.length, 1);
        assert.equal(state.status, "completed");
        assert.equal(state.stepCount, scenario.expectedStepCount + 1);
        assert.deepEqual((await store.restore(scenario.goal.id))?.run, state);
    }
});

test("从 InMemoryGoalStore 恢复 waiting Goal 需要 resume，终态 Goal 直接短路", async () => {
    const waiting = createWaitingGoal("run-waiting-recovery");
    const waitingStore = new InMemoryGoalStore();
    await waitingStore.save(waiting);
    const waitingExecutor = new FakeStepExecutor([
        () => ({ kind: "complete", summary: "恢复后完成" }),
    ]);
    const waitingRunner = new Runner({
        store: waitingStore,
        executor: waitingExecutor,
        maxSteps: 3,
    });
    const waitingRef = createRef(waiting);

    const blocked = requireSuccessfulState(
        await waitingRunner.runUntilBlocked(waitingRef),
    );

    assert.deepEqual(blocked, waiting.run);
    assert.equal(waitingExecutor.receivedGoals.length, 0);
    assert.deepEqual(await waitingStore.restore(waiting.id), waiting);

    const resumed = requireSuccessfulState(
        await waitingRunner.resume(waitingRef),
    );

    assert.equal(resumed.status, "completed");
    assert.equal(resumed.stepCount, waiting.run.stepCount + 1);
    assert.equal(waitingExecutor.receivedGoals.length, 1);
    assert.equal(waitingExecutor.receivedGoals[0]?.run.stepCount, 1);
    assert.deepEqual((await waitingStore.restore(waiting.id))?.run, resumed);

    for (const inactive of inactiveGoals) {
        const store = new InMemoryGoalStore();
        await store.save(inactive.goal);
        const executor = new FakeStepExecutor([]);
        const runner = new Runner({ store, executor, maxSteps: 3 });

        const state = requireSuccessfulState(
            await runner.runUntilBlocked(createRef(inactive.goal)),
        );

        assert.deepEqual(state, inactive.goal.run);
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
            applyTransition(createRunningGoal("run-completed").run, {
                kind: "step",
                result: { kind: "complete", summary: "已完成" },
            }),
        ),
    },
    {
        label: "failed",
        goal: withRun(
            createRunningGoal("run-failed"),
            applyTransition(createRunningGoal("run-failed").run, {
                kind: "step",
                result: { kind: "fail", error: "已失败" },
            }),
        ),
    },
    {
        label: "cancelled",
        goal: withRun(
            createInitialGoal("run-cancelled"),
            applyTransition(createInitialGoal("run-cancelled").run, {
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
        const runner = new Runner({ store, executor, maxSteps: 3 });

        const state = requireSuccessfulState(
            await runner.runUntilBlocked(createRef(inactive.goal)),
        );

        assert.deepEqual(state, inactive.goal.run);
        assert.deepEqual(events, [`restore:${inactive.goal.id}`]);
        assert.deepEqual(store.savedGoals, []);
        assert.deepEqual(executor.receivedGoals, []);
    });
}

test("returns RUN_NOT_FOUND without executing or saving when Goal is missing", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });
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
    const runner = new Runner({ store, executor, maxSteps: 3 });

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

test("resume returns RUN_NOT_FOUND without executing or saving when Goal is missing", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const result = requireFailedResult(await runner.resume({
        goalId: "goal-1",
        runId: "missing-run",
    }));

    assert.equal(result.error.code, "RUN_NOT_FOUND");
    assert.match(result.error.message, /missing-run/);
    assert.deepEqual(events, ["restore:goal-1"]);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(executor.receivedGoals, []);
});

test("resume rejects a Goal that is not waiting without side effects", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const created = createInitialGoal();
    await store.seed(created);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const result = requireFailedResult(await runner.resume(createRef(created)));

    assert.equal(result.error.code, "RUN_NOT_WAITING");
    assert.match(result.error.message, /run-1/);
    assert.deepEqual(events, ["restore:goal-1"]);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(executor.receivedGoals, []);
    assert.deepEqual((await store.peek(created.id))?.run, created.run);
});

test("fails at maxSteps without an extra executor call or step count", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const initial = createInitialGoal();
    await store.seed(initial);
    const executor = new FakeStepExecutor([
        () => ({ kind: "continue", summary: "第一次" }),
        () => ({ kind: "continue", summary: "第二次" }),
    ], events);
    const runner = new Runner({ store, executor, maxSteps: 2 });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.equal(executor.receivedGoals.length, 2);
    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 2);
    assert.equal(state.lastResult?.kind, "fail");
    if (state.lastResult?.kind !== "fail") {
        assert.fail("expected a maxSteps failure result");
    }
    assert.match(state.lastResult.error, /MAX_STEPS_EXCEEDED/);
    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:running:1",
        "execute:running:1",
        "save:goal-1:running:2",
        "save:goal-1:failed:2",
    ]);
    assert.deepEqual((await store.peek(initial.id))?.run, state);
});

test("uses the persisted step count as the maxSteps budget after resume", async () => {
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const firstStep = withRun(
        createRunningGoal(),
        applyTransition(createRunningGoal().run, {
            kind: "step",
            result: { kind: "continue", summary: "已执行一步" },
        }),
    );
    const waitingAtLimit = withRun(
        firstStep,
        applyTransition(firstStep.run, {
            kind: "step",
            result: { kind: "wait", reason: "等待恢复" },
        }),
    );
    await store.seed(waitingAtLimit);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 2 });

    const state = requireSuccessfulState(await runner.resume(createRef(waitingAtLimit)));

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 2);
    assert.equal(state.lastResult?.kind, "fail");
    if (state.lastResult?.kind !== "fail") {
        assert.fail("expected a maxSteps failure result");
    }
    assert.match(state.lastResult.error, /MAX_STEPS_EXCEEDED/);
    assert.deepEqual(executor.receivedGoals, []);
    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:running:2",
        "save:goal-1:failed:2",
    ]);
});

test("converts an executor exception into a persisted step failure", async () => {
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
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked(createRef(initial)),
    );

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 1);
    assert.equal(state.lastResult?.kind, "fail");
    if (state.lastResult?.kind !== "fail") {
        assert.fail("expected an executor failure result");
    }
    assert.match(state.lastResult.error, /executor failed/);
    assert.deepEqual(events, [
        "restore:goal-1",
        "save:goal-1:running:0",
        "execute:running:0",
        "save:goal-1:failed:1",
    ]);
    assert.deepEqual((await store.peek(initial.id))?.run, state);
});

test("rejects maxSteps values that are not positive integers", () => {
    const store = new InMemoryGoalStore();
    const executor = new FakeStepExecutor([]);

    for (const maxSteps of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(
            () => new Runner({ store, executor, maxSteps }),
            /maxSteps/i,
        );
    }
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
    const runner = new Runner({ store, executor, maxSteps: 3 });

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
    const runner = new Runner({ store, executor, maxSteps: 3 });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked(createRef(created)),
        saveError,
    );

    assert.equal(savedGoals.length, 1);
    assert.equal(savedGoals[0]?.run.status, "running");
    assert.deepEqual(executor.receivedGoals, []);
});

test("propagates a recovered step save error and does not execute another step", async () => {
    const saveError = new Error("step save failed");
    const running = createRunningGoal();
    const persisted = withRun(
        running,
        applyTransition(running.run, {
            kind: "step",
            result: { kind: "continue", summary: "已持久化的一步" },
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
    const executor = new FakeStepExecutor([
        () => ({ kind: "continue", summary: "恢复后继续" }),
        () => ({ kind: "complete", summary: "不应执行" }),
    ]);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked(createRef(persisted)),
        saveError,
    );

    assert.deepEqual(
        savedGoals.map(({ run: { status, stepCount } }) => ({
            status,
            stepCount,
        })),
        [
            { status: "running", stepCount: 2 },
        ],
    );
    assert.equal(executor.receivedGoals.length, 1);
    assert.equal(executor.receivedGoals[0]?.run.stepCount, 1);
    assert.strictEqual(latestGoal, persisted);
});
