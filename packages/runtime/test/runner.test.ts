import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createRun,
    Runner,
    transition,
} from "../src/index";
import { InMemoryRunStore } from "../src/run-store";
import type {
    AgentProfile,
    GoalDefinition,
    RunInput,
    RunnerResult,
    RunState,
    StepExecutor,
    StepResult,
} from "../src/index";
import type { RunStore } from "../src/run-store";

const goal: GoalDefinition = {
    id: "goal-1",
    objective: "完成最小同步 Run Loop",
    completionCriteria: ["Run 进入终态或等待状态"],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["逐步完成目标"],
    toolIds: [],
};

type ExecuteAction = (
    state: RunState,
) => StepResult | Promise<StepResult>;

class FakeStepExecutor implements StepExecutor {
    readonly receivedStates: RunState[] = [];

    constructor(
        private readonly actions: readonly ExecuteAction[],
        private readonly events: string[] = [],
    ) {}

    async execute(state: RunState): Promise<StepResult> {
        const action = this.actions[this.receivedStates.length];
        this.receivedStates.push(state);
        this.events.push(`execute:${state.status}:${state.stepCount}`);

        if (action === undefined) {
            throw new Error("Unexpected StepExecutor call");
        }

        return action(state);
    }
}

class RecordingRunStore extends InMemoryRunStore {
    readonly savedStates: RunState[] = [];

    constructor(private readonly events: string[] = []) {
        super();
    }

    async seed(state: RunState): Promise<void> {
        await super.save(state);
    }

    override async load(runId: string): Promise<RunState | undefined> {
        this.events.push(`load:${runId}`);
        return super.load(runId);
    }

    override async save(state: RunState): Promise<void> {
        this.events.push(`save:${state.status}:${state.stepCount}`);
        this.savedStates.push(state);
        await super.save(state);
    }
}

function applyTransition(state: RunState, input: RunInput): RunState {
    const result = transition(state, input);

    if (!result.ok) {
        assert.fail(`expected a successful transition: ${result.error.message}`);
    }

    return result.state;
}

function createInitialState(runId = "run-1"): RunState {
    return createRun(goal, runId, profile);
}

function createRunningState(runId = "run-1"): RunState {
    return applyTransition(createInitialState(runId), { kind: "start" });
}

function createWaitingState(runId = "run-1"): RunState {
    return applyTransition(createRunningState(runId), {
        kind: "step",
        result: { kind: "wait", reason: "等待外部输入" },
    });
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

test("starts a created run, saves every transition, and executes until completed", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    await store.seed(createInitialState());
    const continueResult = { kind: "continue", summary: "继续执行" } as const;
    const completeResult = { kind: "complete", summary: "目标完成" } as const;
    const executor = new FakeStepExecutor([
        () => continueResult,
        () => completeResult,
    ], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked("run-1"),
    );

    assert.deepEqual(events, [
        "load:run-1",
        "save:running:0",
        "execute:running:0",
        "save:running:1",
        "execute:running:1",
        "save:completed:2",
    ]);
    assert.deepEqual(
        store.savedStates.map(({ status, stepCount }) => ({ status, stepCount })),
        [
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 1 },
            { status: "completed", stepCount: 2 },
        ],
    );
    assert.strictEqual(executor.receivedStates[0], store.savedStates[0]);
    assert.strictEqual(executor.receivedStates[1], store.savedStates[1]);
    assert.deepEqual(state, store.savedStates[2]);
    assert.equal(state.status, "completed");
    assert.equal(state.stepCount, 2);
    assert.deepEqual(state.lastResult, completeResult);
    assert.deepEqual(await store.load("run-1"), state);
});

test("stops on wait and resumes the same run after saving running first", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    await store.seed(createInitialState());
    const waitResult = { kind: "wait", reason: "等待批准" } as const;
    const completeResult = { kind: "complete", summary: "批准后完成" } as const;
    const executor = new FakeStepExecutor([
        () => waitResult,
        () => completeResult,
    ], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const waiting = requireSuccessfulState(
        await runner.runUntilBlocked("run-1"),
    );
    const completed = requireSuccessfulState(await runner.resume("run-1"));

    assert.equal(waiting.status, "waiting");
    assert.equal(waiting.stepCount, 1);
    assert.equal(completed.status, "completed");
    assert.equal(completed.stepCount, 2);
    assert.deepEqual(events, [
        "load:run-1",
        "save:running:0",
        "execute:running:0",
        "save:waiting:1",
        "load:run-1",
        "save:running:1",
        "execute:running:1",
        "save:completed:2",
    ]);
    assert.deepEqual(
        store.savedStates.map(({ status, stepCount }) => ({ status, stepCount })),
        [
            { status: "running", stepCount: 0 },
            { status: "waiting", stepCount: 1 },
            { status: "running", stepCount: 1 },
            { status: "completed", stepCount: 2 },
        ],
    );
    assert.strictEqual(executor.receivedStates[1], store.savedStates[2]);
    assert.deepEqual(await store.load("run-1"), completed);
});

const inactiveStates: ReadonlyArray<{
    readonly label: string;
    readonly state: RunState;
}> = [
    {
        label: "waiting",
        state: createWaitingState("run-waiting"),
    },
    {
        label: "completed",
        state: applyTransition(createRunningState("run-completed"), {
            kind: "step",
            result: { kind: "complete", summary: "已完成" },
        }),
    },
    {
        label: "failed",
        state: applyTransition(createRunningState("run-failed"), {
            kind: "step",
            result: { kind: "fail", error: "已失败" },
        }),
    },
    {
        label: "cancelled",
        state: applyTransition(createInitialState("run-cancelled"), {
            kind: "cancel",
        }),
    },
];

for (const inactive of inactiveStates) {
    test(`returns an existing ${inactive.label} run without side effects`, async () => {
        const events: string[] = [];
        const store = new RecordingRunStore(events);
        await store.seed(inactive.state);
        const executor = new FakeStepExecutor([], events);
        const runner = new Runner({ store, executor, maxSteps: 3 });

        const state = requireSuccessfulState(
            await runner.runUntilBlocked(inactive.state.id),
        );

        assert.strictEqual(state, inactive.state);
        assert.deepEqual(events, [`load:${inactive.state.id}`]);
        assert.deepEqual(store.savedStates, []);
        assert.deepEqual(executor.receivedStates, []);
    });
}

test("returns RUN_NOT_FOUND without executing or saving", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const result = requireFailedResult(
        await runner.runUntilBlocked("missing-run"),
    );

    assert.equal(result.error.code, "RUN_NOT_FOUND");
    assert.match(result.error.message, /missing-run/);
    assert.deepEqual(events, ["load:missing-run"]);
    assert.deepEqual(store.savedStates, []);
    assert.deepEqual(executor.receivedStates, []);
});

test("resume returns RUN_NOT_FOUND without executing or saving", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const result = requireFailedResult(await runner.resume("missing-run"));

    assert.equal(result.error.code, "RUN_NOT_FOUND");
    assert.match(result.error.message, /missing-run/);
    assert.deepEqual(events, ["load:missing-run"]);
    assert.deepEqual(store.savedStates, []);
    assert.deepEqual(executor.receivedStates, []);
});

test("resume rejects a run that is not waiting without side effects", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    const created = createInitialState();
    await store.seed(created);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const result = requireFailedResult(await runner.resume(created.id));

    assert.equal(result.error.code, "RUN_NOT_WAITING");
    assert.match(result.error.message, /run-1/);
    assert.deepEqual(events, ["load:run-1"]);
    assert.deepEqual(store.savedStates, []);
    assert.deepEqual(executor.receivedStates, []);
    assert.strictEqual(await store.load(created.id), created);
});

test("fails at maxSteps without an extra executor call or step count", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    await store.seed(createInitialState());
    const executor = new FakeStepExecutor([
        () => ({ kind: "continue", summary: "第一次" }),
        () => ({ kind: "continue", summary: "第二次" }),
    ], events);
    const runner = new Runner({ store, executor, maxSteps: 2 });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked("run-1"),
    );

    assert.equal(executor.receivedStates.length, 2);
    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 2);
    assert.equal(state.lastResult?.kind, "fail");
    if (state.lastResult?.kind !== "fail") {
        assert.fail("expected a maxSteps failure result");
    }
    assert.match(state.lastResult.error, /MAX_STEPS_EXCEEDED/);
    assert.deepEqual(events, [
        "load:run-1",
        "save:running:0",
        "execute:running:0",
        "save:running:1",
        "execute:running:1",
        "save:running:2",
        "save:failed:2",
    ]);
    assert.deepEqual(await store.load("run-1"), state);
});

test("uses the persisted step count as the maxSteps budget after resume", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    const firstStep = applyTransition(createRunningState(), {
        kind: "step",
        result: { kind: "continue", summary: "已执行一步" },
    });
    const waitingAtLimit = applyTransition(firstStep, {
        kind: "step",
        result: { kind: "wait", reason: "等待恢复" },
    });
    await store.seed(waitingAtLimit);
    const executor = new FakeStepExecutor([], events);
    const runner = new Runner({ store, executor, maxSteps: 2 });

    const state = requireSuccessfulState(await runner.resume("run-1"));

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 2);
    assert.equal(state.lastResult?.kind, "fail");
    if (state.lastResult?.kind !== "fail") {
        assert.fail("expected a maxSteps failure result");
    }
    assert.match(state.lastResult.error, /MAX_STEPS_EXCEEDED/);
    assert.deepEqual(executor.receivedStates, []);
    assert.deepEqual(events, [
        "load:run-1",
        "save:running:2",
        "save:failed:2",
    ]);
});

test("converts an executor exception into a persisted step failure", async () => {
    const events: string[] = [];
    const store = new RecordingRunStore(events);
    await store.seed(createInitialState());
    const executorError = new Error("executor failed");
    const executor = new FakeStepExecutor([
        () => {
            throw executorError;
        },
    ], events);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    const state = requireSuccessfulState(
        await runner.runUntilBlocked("run-1"),
    );

    assert.equal(state.status, "failed");
    assert.equal(state.stepCount, 1);
    assert.equal(state.lastResult?.kind, "fail");
    if (state.lastResult?.kind !== "fail") {
        assert.fail("expected an executor failure result");
    }
    assert.match(state.lastResult.error, /executor failed/);
    assert.deepEqual(events, [
        "load:run-1",
        "save:running:0",
        "execute:running:0",
        "save:failed:1",
    ]);
    assert.deepEqual(await store.load("run-1"), state);
});

test("rejects maxSteps values that are not positive integers", () => {
    const store = new InMemoryRunStore();
    const executor = new FakeStepExecutor([]);

    for (const maxSteps of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(
            () => new Runner({ store, executor, maxSteps }),
            /maxSteps/i,
        );
    }
});

test("propagates a load error without saving or executing", async () => {
    const loadError = new Error("load failed");
    let saveCalls = 0;
    const store: RunStore = {
        async load(): Promise<RunState | undefined> {
            throw loadError;
        },
        async save(): Promise<void> {
            saveCalls += 1;
        },
    };
    const executor = new FakeStepExecutor([]);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked("run-1"),
        loadError,
    );

    assert.equal(saveCalls, 0);
    assert.deepEqual(executor.receivedStates, []);
});

test("propagates the start save error without executing", async () => {
    const saveError = new Error("start save failed");
    const created = createInitialState();
    const savedStates: RunState[] = [];
    const store: RunStore = {
        async load(): Promise<RunState | undefined> {
            return created;
        },
        async save(state): Promise<void> {
            savedStates.push(state);
            throw saveError;
        },
    };
    const executor = new FakeStepExecutor([]);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked(created.id),
        saveError,
    );

    assert.equal(savedStates.length, 1);
    assert.equal(savedStates[0]?.status, "running");
    assert.deepEqual(executor.receivedStates, []);
});

test("propagates a step save error and does not execute another step", async () => {
    const saveError = new Error("step save failed");
    const created = createInitialState();
    let latestState = created;
    const savedStates: RunState[] = [];
    const store: RunStore = {
        async load(): Promise<RunState | undefined> {
            return latestState;
        },
        async save(state): Promise<void> {
            savedStates.push(state);
            if (savedStates.length === 2) {
                throw saveError;
            }
            latestState = state;
        },
    };
    const executor = new FakeStepExecutor([
        () => ({ kind: "continue", summary: "继续" }),
        () => ({ kind: "complete", summary: "不应执行" }),
    ]);
    const runner = new Runner({ store, executor, maxSteps: 3 });

    await assertRejectsWithSameError(
        () => runner.runUntilBlocked(created.id),
        saveError,
    );

    assert.deepEqual(
        savedStates.map(({ status, stepCount }) => ({ status, stepCount })),
        [
            { status: "running", stepCount: 0 },
            { status: "running", stepCount: 1 },
        ],
    );
    assert.equal(executor.receivedStates.length, 1);
    assert.strictEqual(latestState, savedStates[0]);
});
