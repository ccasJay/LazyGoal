import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalCoordinator,
    InMemoryGoalStore,
    transition,
} from "../src/index";
import type {
    AgentProfile,
    Goal,
    GoalProgressResult,
    GoalStore,
    PreparationExecutor,
    PreparationResult,
    RunnerResult,
    RunInput,
    RunRef,
    RunScheduler,
    RunState,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Prepare before execution."],
    toolIds: [],
};

type PreparationAction =
    | PreparationResult
    | ((goal: Goal) => PreparationResult | Promise<PreparationResult>);

class FakePreparationExecutor implements PreparationExecutor {
    readonly receivedGoals: Goal[] = [];

    constructor(
        private readonly actions: readonly PreparationAction[],
        private readonly events: string[] = [],
    ) {}

    async execute(goal: Goal): Promise<PreparationResult> {
        const action = this.actions[this.receivedGoals.length];
        this.receivedGoals.push(goal);
        this.events.push(`execute:${goal.state.workflow.phase}`);

        if (action === undefined) {
            throw new Error("Unexpected PreparationExecutor call");
        }

        return typeof action === "function" ? action(goal) : action;
    }
}

class RecordingGoalStore implements GoalStore {
    readonly savedGoals: Goal[] = [];
    private readonly delegate = new InMemoryGoalStore();

    constructor(
        private readonly events: string[] = [],
        private readonly saveFailure?: { readonly call: number; readonly error: Error },
    ) {}

    async seed(goal: Goal): Promise<void> {
        await this.delegate.save(goal);
    }

    async save(goal: Goal): Promise<void> {
        const call = this.savedGoals.length + 1;
        this.events.push(`save:${goal.state.workflow.phase}`);

        if (this.saveFailure?.call === call) {
            throw this.saveFailure.error;
        }

        this.savedGoals.push(goal);
        await this.delegate.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        this.events.push(`restore:${goalId}`);
        return this.delegate.restore(goalId);
    }
}

class FakeScheduler implements RunScheduler {
    readonly receivedRefs: RunRef[] = [];

    constructor(
        private readonly scheduleAction: (ref: RunRef) => Promise<RunnerResult>,
    ) {}

    async schedule(ref: RunRef): Promise<RunnerResult> {
        this.receivedRefs.push(ref);
        return this.scheduleAction(ref);
    }
}

function createPreparationGoal(): Goal {
    return createGoal({
        id: "goal-1",
        intent: "Build a resumable workflow",
        profile,
        runId: "run-1",
    });
}

function createUnusedScheduler(): RunScheduler {
    return new FakeScheduler(async () => {
        throw new Error("Unexpected Scheduler call");
    });
}

function requireSuccess(
    result: GoalProgressResult,
): Extract<GoalProgressResult, { readonly ok: true }> {
    if (!result.ok) {
        assert.fail(`Expected success, received ${result.error.code}`);
    }

    return result;
}

function requireFailure(
    result: GoalProgressResult,
): Extract<GoalProgressResult, { readonly ok: false }> {
    if (result.ok) {
        assert.fail("Expected a GoalCoordinator failure");
    }

    return result;
}

function applyRunTransition(
    state: RunState,
    input: RunInput,
): RunState {
    const result = transition(state, input);

    if (!result.ok) {
        assert.fail(result.error.message);
    }

    return result.state;
}

test("persists a gathering question as a real assistant message without consuming a Step", async () => {
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore();
    await store.seed(initial);
    const executor = new FakePreparationExecutor([
        { kind: "question", question: "Which database should be used?" },
    ]);
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: initial.id,
        runId: initial.state.run.id,
    }));

    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "gathering_context");
    assert.equal(result.waitingFor, "question");
    assert.deepEqual(result.goal.state.workflow, {
        phase: "gathering_context",
        preparation: { status: "waiting_input" },
    });
    assert.deepEqual(result.goal.state.run, initial.state.run);
    assert.deepEqual(result.goal.state.messages, [
        { role: "user", content: "Build a resumable workflow" },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "Which database should be used?",
        },
    ]);
    assert.deepEqual(store.savedGoals, [result.goal]);
});

test("saves planning before the next model call and persists the complete proposal", async () => {
    const events: string[] = [];
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(initial);
    events.length = 0;
    const task = {
        objective: "Implement GoalCoordinator",
        completionCriteria: ["Questions are persisted", "Execution is delegated"],
    } as const;
    const executor = new FakePreparationExecutor([
        { kind: "context_ready" },
        (goal) => {
            assert.equal(goal.state.workflow.phase, "planning");
            assert.equal(goal.state.run.stepCount, 0);
            return {
                kind: "task_proposal",
                task,
                approvalRequest: "Approve this task?",
            };
        },
    ], events);
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: initial.id,
        runId: initial.state.run.id,
    }));

    assert.deepEqual(events, [
        "restore:goal-1",
        "execute:gathering_context",
        "save:planning",
        "execute:planning",
        "save:planning",
    ]);
    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "planning");
    assert.equal(result.waitingFor, "approval");
    assert.deepEqual(result.goal.state.workflow, {
        phase: "planning",
        preparation: {
            status: "waiting_approval",
            proposal: task,
        },
    });
    assert.deepEqual(result.goal.state.messages.at(-1), {
        role: "assistant",
        assistant: { profileId: "profile-1" },
        content: [
            "Objective: Implement GoalCoordinator",
            "Completion criteria:",
            "1. Questions are persisted",
            "2. Execution is delegated",
            "Approval request: Approve this task?",
        ].join("\n"),
    });
    assert.deepEqual(result.goal.state.run, initial.state.run);
    assert.deepEqual(store.savedGoals.at(-1), result.goal);
});

test("stops before the planning call when saving the phase transition fails", async () => {
    const saveError = new Error("save failed");
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore([], { call: 1, error: saveError });
    await store.seed(initial);
    const executor = new FakePreparationExecutor([
        { kind: "context_ready" },
        {
            kind: "task_proposal",
            task: { objective: "Must not run", completionCriteria: [] },
            approvalRequest: "Must not run",
        },
    ]);
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    await assert.rejects(
        () => coordinator.advance({ goalId: "goal-1", runId: "run-1" }),
        (error: unknown) => {
            assert.strictEqual(error, saveError);
            return true;
        },
    );
    assert.equal(executor.receivedGoals.length, 1);

    const persisted = await store.restore(initial.id);
    assert.deepEqual(persisted, initial);
});

test("rejects a Preparation result that does not match the current phase without saving", async () => {
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore();
    await store.seed(initial);
    const invalidResult = {
        kind: "task_proposal",
        task: { objective: "Invalid", completionCriteria: [] },
        approvalRequest: "Invalid",
    } as const;
    const executor = new FakePreparationExecutor([invalidResult]);
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireFailure(await coordinator.advance({
        goalId: initial.id,
        runId: initial.state.run.id,
    }));

    assert.equal(result.error.code, "INVALID_PHASE_RESULT");
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(await store.restore(initial.id), initial);
});

test("returns an existing preparation waiting point without executing or saving", async () => {
    const initial = createPreparationGoal();
    const waiting: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
        },
    };
    const store = new RecordingGoalStore();
    await store.seed(waiting);
    const executor = new FakePreparationExecutor([]);
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: waiting.id,
        runId: waiting.state.run.id,
    }));

    assert.equal(result.kind, "waiting");
    assert.deepEqual(result.goal, waiting);
    assert.deepEqual(executor.receivedGoals, []);
    assert.deepEqual(store.savedGoals, []);
});

test("delegates an executing Goal and returns the latest persisted terminal snapshot", async () => {
    const executing = createGoal({
        id: "goal-executing",
        task: { objective: "Execute", completionCriteria: ["Done"] },
        profile,
        runId: "run-executing",
    });
    const store = new RecordingGoalStore();
    await store.seed(executing);
    const completedRun = applyRunTransition(
        applyRunTransition(executing.state.run, { kind: "start" }),
        { kind: "step", result: { kind: "complete", summary: "Done" } },
    );
    const completedGoal: Goal = {
        ...executing,
        state: { ...executing.state, run: completedRun },
    };
    const scheduler = new FakeScheduler(async () => {
        await store.save(completedGoal);
        return { ok: true, state: completedRun };
    });
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: executing.id,
        runId: executing.state.run.id,
    }));

    assert.equal(result.kind, "terminal");
    assert.deepEqual(result.goal, completedGoal);
    assert.deepEqual(scheduler.receivedRefs, [
        { goalId: "goal-executing", runId: "run-executing" },
    ]);
});

test("returns an executing blocked Goal without scheduling it again", async () => {
    const executing = createGoal({
        id: "goal-blocked",
        task: { objective: "Execute", completionCriteria: [] },
        profile,
        runId: "run-blocked",
    });
    const waitingRun = applyRunTransition(
        applyRunTransition(executing.state.run, { kind: "start" }),
        { kind: "step", result: { kind: "wait", reason: "Permission required" } },
    );
    const blockedGoal: Goal = {
        ...executing,
        state: { ...executing.state, run: waitingRun },
    };
    const store = new RecordingGoalStore();
    await store.seed(blockedGoal);
    const scheduler = new FakeScheduler(async () => {
        throw new Error("Unexpected Scheduler call");
    });
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: blockedGoal.id,
        runId: blockedGoal.state.run.id,
    }));

    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "executing");
    assert.equal(result.waitingFor, "blocked");
    assert.deepEqual(result.goal, blockedGoal);
    assert.deepEqual(scheduler.receivedRefs, []);
});

test("returns RUN_NOT_FOUND for a missing Goal or mismatched runId", async () => {
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore();
    await store.seed(initial);
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler: createUnusedScheduler(),
    });

    for (const ref of [
        { goalId: "missing", runId: "run-1" },
        { goalId: "goal-1", runId: "other-run" },
    ]) {
        const result = requireFailure(await coordinator.advance(ref));
        assert.equal(result.error.code, "RUN_NOT_FOUND");
    }
});
