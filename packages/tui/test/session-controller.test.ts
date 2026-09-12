import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalCatalog,
    type GoalCatalogEntry,
    type GoalProgressResult,
    type GoalStore,
    type LaunchRequest,
    type LaunchResult,
    type PreparationProbeProgressEvent,
    type ResumeGoalRequest,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import {
    SessionController,
    UiDispatchRejectedError,
    type SessionControllerDependencies,
    type SessionCoordinator,
    type SessionLauncher,
    type UiViewModel,
} from "../src/index";

const profile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Prepare before execution."],
    toolIds: [],
};

function createWaitingGoal(id = "goal-1"): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Build a resumable workflow",
        profile,
        runId: `run-${id}`,
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
            messages: [
                ...goal.state.messages,
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "Which database should be used?",
                },
            ],
        },
    };
}

function createStalledGoal(id = "goal-stalled"): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Build a resumable workflow",
        profile,
        runId: `run-${id}`,
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "active" },
            },
        },
    };
}

function waitingResult(goal: Goal): GoalProgressResult {
    return {
        ok: true,
        kind: "waiting",
        phase: "gathering_context",
        waitingFor: "question",
        goal,
    };
}

class FakeLauncher implements SessionLauncher {
    readonly requests: LaunchRequest[] = [];

    constructor(private readonly result: LaunchResult) {}

    async launch(request: LaunchRequest): Promise<LaunchResult> {
        this.requests.push(request);
        return this.result;
    }
}

class FakeCoordinator implements SessionCoordinator {
    readonly advanceRefs: Array<{ readonly goalId: string; readonly runId: string }> = [];
    readonly resumeRequests: ResumeGoalRequest[] = [];
    private probeListener: ((event: PreparationProbeProgressEvent) => void) | undefined;

    constructor(
        private readonly advanceResult: GoalProgressResult,
        private readonly resumeResult: GoalProgressResult = advanceResult,
    ) {}

    onProbeProgress(listener: (event: PreparationProbeProgressEvent) => void): () => void {
        this.probeListener = listener;
        return () => {
            if (this.probeListener === listener) {
                this.probeListener = undefined;
            }
        };
    }

    emitProbeProgress(event: PreparationProbeProgressEvent): void {
        this.probeListener?.(event);
    }

    async advance(
        ref: { readonly goalId: string; readonly runId: string },
    ): Promise<GoalProgressResult> {
        this.advanceRefs.push(ref);
        return this.advanceResult;
    }

    async resume(request: ResumeGoalRequest): Promise<GoalProgressResult> {
        this.resumeRequests.push(request);
        return this.resumeResult;
    }
}

class FakeStore implements Pick<GoalStore, "restore"> {
    readonly requestedGoalIds: string[] = [];

    constructor(private readonly goals: readonly Goal[]) {}

    async restore(goalId: string): Promise<Goal | undefined> {
        this.requestedGoalIds.push(goalId);
        const goal = this.goals.find((candidate) => candidate.id === goalId);
        return goal === undefined ? undefined : structuredClone(goal);
    }
}

class FakeCatalog implements GoalCatalog {
    constructor(private readonly entries: readonly GoalCatalogEntry[]) {}

    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return structuredClone(this.entries);
    }
}

class ThrowingCatalog implements GoalCatalog {
    constructor(private readonly error: unknown) {}

    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        throw this.error;
    }
}

function dependencies(
    launcher: SessionLauncher,
    coordinator: SessionCoordinator,
    store: Pick<GoalStore, "restore">,
    catalog: GoalCatalog,
): SessionControllerDependencies {
    return {
        launcher,
        coordinator,
        store,
        catalog,
        profileId: profile.id,
        goalIdGenerator: () => "goal-created",
        maxSteps: 4,
    };
}

function sessionView(controller: SessionController): Extract<
    UiViewModel,
    { readonly screen: "session" }
> {
    const view = controller.getSnapshot();
    assert.equal(view.screen, "session");
    return view;
}

test("create maps Launcher result into a session ViewModel", async () => {
    const goal = createWaitingGoal("goal-created");
    const launcher = new FakeLauncher(waitingResult(goal));
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator(waitingResult(goal)),
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );
    const notifications: number[] = [];
    controller.subscribe(() => notifications.push(1));

    await controller.dispatch({ kind: "create", intent: "Inspect the repository" });

    assert.deepEqual(launcher.requests, [{
        goalId: "goal-created",
        intent: "Inspect the repository",
        profileId: "profile-1",
        maxSteps: 4,
    }]);
    const view = sessionView(controller);
    assert.equal(view.goal.id, "goal-created");
    assert.equal(view.waitingFor, "question");
    assert.equal(view.question, "Which database should be used?");
    assert.equal(view.busy, false);
    assert.ok(notifications.length >= 2);
});

test("continueLatest lists candidates, restores the newest Goal, and advances it", async () => {
    const goal = createWaitingGoal("goal-latest");
    const entry: GoalCatalogEntry = {
        goalId: goal.id,
        runId: goal.state.run.id,
        intent: goal.definition.intent,
        workflowPhase: "gathering_context",
        runStatus: "waiting",
        updatedAt: "2026-08-17T00:00:00.000Z",
    };
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const store = new FakeStore([goal]);
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            store,
            new FakeCatalog([entry]),
        ),
    );

    await controller.dispatch({ kind: "continueLatest" });

    assert.deepEqual(store.requestedGoalIds, [goal.id]);
    assert.deepEqual(coordinator.advanceRefs, [{
        goalId: goal.id,
        runId: goal.state.run.id,
    }]);
    assert.equal(sessionView(controller).goal.id, goal.id);
});

test("resume opens the ordered Goal selector without restoring or creating a Goal", async () => {
    const newest: GoalCatalogEntry = {
        goalId: "goal-newest",
        runId: "run-newest",
        intent: "Newest resumable Goal",
        workflowPhase: "planning",
        runStatus: "waiting",
        updatedAt: "2026-08-17T02:00:00.000Z",
    };
    const older: GoalCatalogEntry = {
        goalId: "goal-older",
        runId: "run-older",
        intent: "Older resumable Goal",
        workflowPhase: "gathering_context",
        runStatus: "running",
        updatedAt: "2026-08-17T01:00:00.000Z",
    };
    const launcher = new FakeLauncher({
        ok: false,
        error: { code: "PROFILE_NOT_FOUND", message: "not called" },
    });
    const store = new FakeStore([]);
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator({
                ok: false,
                error: { code: "RUN_NOT_FOUND", message: "not called" },
            }),
            store,
            new FakeCatalog([newest, older]),
        ),
    );

    await controller.dispatch({ kind: "resume" });

    assert.deepEqual(controller.getSnapshot(), {
        screen: "goal_select",
        busy: false,
        goals: [newest, older],
    });
    assert.deepEqual(launcher.requests, []);
    assert.deepEqual(store.requestedGoalIds, []);
});

test("resume surfaces a damaged Catalog snapshot without creating a Goal", async () => {
    const launcher = new FakeLauncher({
        ok: false,
        error: { code: "PROFILE_NOT_FOUND", message: "not called" },
    });
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator({
                ok: false,
                error: { code: "RUN_NOT_FOUND", message: "not called" },
            }),
            new FakeStore([]),
            new ThrowingCatalog({
                code: "INVALID_GOAL_SNAPSHOT",
                message: "Goal snapshot is invalid",
            }),
        ),
    );

    await controller.dispatch({ kind: "resume" });

    assert.deepEqual(launcher.requests, []);
    assert.deepEqual(controller.getSnapshot(), {
        screen: "goal_select",
        busy: false,
        goals: [],
        error: {
            code: "INVALID_GOAL_SNAPSHOT",
            message: "Goal snapshot is invalid",
        },
    });
});

test("continueLatest selects the first Catalog entry for -c semantics", async () => {
    const first = createWaitingGoal("goal-first");
    const second = createWaitingGoal("goal-second");
    const firstEntry: GoalCatalogEntry = {
        goalId: first.id,
        runId: first.state.run.id,
        intent: first.definition.intent,
        workflowPhase: "gathering_context",
        runStatus: "waiting",
        updatedAt: "2026-08-17T02:00:00.000Z",
    };
    const secondEntry: GoalCatalogEntry = {
        goalId: second.id,
        runId: second.state.run.id,
        intent: second.definition.intent,
        workflowPhase: "gathering_context",
        runStatus: "waiting",
        updatedAt: "2026-08-17T01:00:00.000Z",
    };
    const store = new FakeStore([first, second]);
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(first)),
            new FakeCoordinator(waitingResult(first)),
            store,
            new FakeCatalog([firstEntry, secondEntry]),
        ),
    );

    await controller.dispatch({ kind: "continueLatest" });

    assert.deepEqual(store.requestedGoalIds, [first.id]);
    assert.equal(sessionView(controller).goal.id, first.id);
});

test("selectGoal reports a stable error without creating a replacement Goal", async () => {
    const launcher = new FakeLauncher({
        ok: false,
        error: { code: "PROFILE_NOT_FOUND", message: "profile missing" },
    });
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator({
                ok: false,
                error: { code: "RUN_NOT_FOUND", message: "not called" },
            }),
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "selectGoal", goalId: "missing" });

    assert.deepEqual(launcher.requests, []);
    assert.deepEqual(controller.getSnapshot(), {
        screen: "goal_select",
        busy: false,
        goals: [],
        error: {
            code: "RUN_NOT_FOUND",
            message: 'Goal "missing" was not found',
        },
    });
});

test("empty continueLatest leaves an actionable empty selection error", async () => {
    const controller = new SessionController(
        dependencies(
            new FakeLauncher({
                ok: false,
                error: { code: "PROFILE_NOT_FOUND", message: "not called" },
            }),
            new FakeCoordinator({
                ok: false,
                error: { code: "RUN_NOT_FOUND", message: "not called" },
            }),
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "continueLatest" });

    const view = controller.getSnapshot();
    assert.equal(view.screen, "goal_select");
    assert.equal(view.error?.code, "NO_RESUMABLE_GOAL");
});

test("session commands map to Coordinator resume actions", async () => {
    const goal = createWaitingGoal("goal-session");
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );
    await controller.dispatch({ kind: "create", intent: "Start" });

    await controller.dispatch({ kind: "submitMessage", content: "Use SQLite" });
    await controller.dispatch({ kind: "approveTask" });
    await controller.dispatch({ kind: "approveAction", actionId: "action-1" });
    await controller.dispatch({
        kind: "rejectAction",
        actionId: "action-2",
        reason: "Requires confirmation",
    });

    assert.deepEqual(coordinator.resumeRequests.map(({ ref, action }) => ({
        ref,
        action,
    })), [
        {
            ref: { goalId: goal.id, runId: goal.state.run.id },
            action: { kind: "message", content: "Use SQLite" },
        },
        {
            ref: { goalId: goal.id, runId: goal.state.run.id },
            action: { kind: "approve" },
        },
        {
            ref: { goalId: goal.id, runId: goal.state.run.id },
            action: { kind: "approve_action", actionId: "action-1" },
        },
        {
            ref: { goalId: goal.id, runId: goal.state.run.id },
            action: {
                kind: "reject_action",
                actionId: "action-2",
                reason: "Requires confirmation",
            },
        },
    ]);
});

test("invalid session input is visible and does not call Runtime", async () => {
    const goal = createWaitingGoal("goal-invalid-input");
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );
    await controller.dispatch({ kind: "create", intent: "Start" });

    await controller.dispatch({ kind: "submitMessage", content: "   " });

    const view = sessionView(controller);
    assert.equal(view.error?.code, "INVALID_GOAL_INPUT");
    assert.equal(coordinator.resumeRequests.length, 0);
    assert.equal(view.goal.id, goal.id);
});

test("business errors preserve the latest session snapshot", async () => {
    const goal = createWaitingGoal("goal-error");
    const coordinator = new FakeCoordinator({
        ok: false,
        error: {
            code: "GOAL_NOT_WAITING",
            message: "The Goal is not waiting for input",
        },
    });
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );
    await controller.dispatch({ kind: "create", intent: "Start" });

    await controller.dispatch({ kind: "submitMessage", content: "Continue" });

    const view = sessionView(controller);
    assert.equal(view.goal.id, goal.id);
    assert.equal(view.error?.code, "GOAL_NOT_WAITING");
    assert.equal(view.busy, false);
});

test("a launch failure after persistence keeps the claimed Goal active", async () => {
    const goal = createWaitingGoal("goal-created");
    const launcher = new FakeLauncher({
        ok: false,
        error: {
            code: "INVALID_PHASE_RESULT",
            message: "Preparation result did not match the current phase",
        },
    });
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator(waitingResult(goal)),
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Start" });

    const view = sessionView(controller);
    assert.equal(view.goal.id, goal.id);
    assert.equal(view.error?.code, "INVALID_PHASE_RESULT");
    await controller.dispatch({ kind: "create", intent: "Do not replace" });
    assert.equal(sessionView(controller).error?.code, "CREATE_NOT_ALLOWED");
    assert.equal(launcher.requests.length, 1);
});

test("a second dispatch is rejected while the first command is in progress", async () => {
    const goal = createWaitingGoal("goal-busy");
    let release!: () => void;
    let started = false;
    const launcher: SessionLauncher = {
        launch: async () => {
            started = true;
            await new Promise<void>((resolve) => {
                release = resolve;
            });
            return waitingResult(goal);
        },
    };
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator(waitingResult(goal)),
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    const first = controller.dispatch({ kind: "create", intent: "First" });
    assert.equal(started, true);
    await assert.rejects(
        controller.dispatch({ kind: "create", intent: "Second" }),
        (error: unknown) => {
            assert.ok(error instanceof UiDispatchRejectedError);
            assert.equal(error.code, "UI_BUSY");
            return true;
        },
    );

    release();
    await first;
    assert.equal(sessionView(controller).goal.id, goal.id);
});

test("beginShutdown freezes the UI around the latest Goal and rejects later commands", async () => {
    const goal = createWaitingGoal("goal-shutdown-ui");
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            new FakeCoordinator(waitingResult(goal)),
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Start" });
    controller.beginShutdown();
    controller.beginShutdown();

    assert.deepEqual(controller.getSnapshot(), {
        screen: "shutting_down",
        busy: true,
        goal,
    });
    await assert.rejects(
        controller.dispatch({ kind: "create", intent: "Do not start" }),
        (error: unknown) => {
            assert.ok(error instanceof UiDispatchRejectedError);
            assert.equal(error.code, "UI_SHUTTING_DOWN");
            return true;
        },
    );
});

test("a result that races with shutdown cannot resurrect the session screen", async () => {
    const goal = createWaitingGoal("goal-shutdown-race");
    let release!: () => void;
    const launcher: SessionLauncher = {
        launch: async () => {
            await new Promise<void>((resolve) => {
                release = resolve;
            });
            return waitingResult(goal);
        },
    };
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator(waitingResult(goal)),
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    const pending = controller.dispatch({ kind: "create", intent: "Start" });
    controller.beginShutdown();
    release();
    await pending;

    assert.equal(controller.getSnapshot().screen, "shutting_down");
});

test("retryPreparation recovers an interrupted preparation without restoring from the store", async () => {
    const stalled = createStalledGoal("goal-created");
    const recovered = createWaitingGoal("goal-created");
    const coordinator = new FakeCoordinator(waitingResult(recovered));
    const store = new FakeStore([stalled]);
    const controller = new SessionController(
        dependencies(
            new FakeLauncher({
                ok: false,
                error: {
                    code: "INVALID_CONTEXT_LOOKUP",
                    message: "Preparation was interrupted",
                },
            }),
            coordinator,
            store,
            new FakeCatalog([]),
        ),
    );
    await controller.dispatch({ kind: "create", intent: "Start" });
    store.requestedGoalIds.length = 0;
    assert.equal(sessionView(controller).preparationStalled, true);

    await controller.dispatch({ kind: "retryPreparation" });

    assert.deepEqual(coordinator.advanceRefs, [{
        goalId: stalled.id,
        runId: stalled.state.run.id,
    }]);
    assert.deepEqual(store.requestedGoalIds, []);
    const view = sessionView(controller);
    assert.equal(view.waitingFor, "question");
    assert.equal(view.preparationStalled, undefined);
    assert.equal(view.error, undefined);
});

test("an interrupted preparation is exposed as a retryable session state", async () => {
    const goal = createStalledGoal("goal-created");
    const controller = new SessionController(
        dependencies(
            new FakeLauncher({
                ok: false,
                error: {
                    code: "INVALID_CONTEXT_LOOKUP",
                    message: "Preparation was interrupted",
                },
            }),
            new FakeCoordinator(waitingResult(goal)),
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Start" });

    const view = sessionView(controller);
    assert.equal(view.preparationStalled, true);
    assert.equal(view.waitingFor, undefined);
    assert.equal(view.error?.code, "INVALID_CONTEXT_LOOKUP");
    assert.equal(view.busy, false);
});

test("a planning goal interrupted before a proposal is also retryable", async () => {
    const base = createStalledGoal("goal-created");
    const planning: Goal = {
        ...base,
        state: {
            ...base.state,
            workflow: { phase: "planning", preparation: { status: "active" } },
        },
    };
    const controller = new SessionController(
        dependencies(
            new FakeLauncher({
                ok: false,
                error: {
                    code: "INVALID_CONTEXT_LOOKUP",
                    message: "Preparation was interrupted",
                },
            }),
            new FakeCoordinator(waitingResult(planning)),
            new FakeStore([planning]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Start" });

    assert.equal(sessionView(controller).preparationStalled, true);
});

test("a goal waiting for user input is never marked as stalled", async () => {
    const waiting = createWaitingGoal("goal-not-stalled");
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(waiting)),
            new FakeCoordinator(waitingResult(waiting)),
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Start" });

    assert.equal(sessionView(controller).preparationStalled, undefined);
    assert.equal(sessionView(controller).waitingFor, "question");
});

test("retryPreparation reports a stable error without an active session", async () => {
    const goal = createWaitingGoal("goal-retry-no-session");
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "retryPreparation" });

    const view = controller.getSnapshot();
    assert.equal(view.screen, "intent_input");
    assert.equal(view.error?.code, "NO_ACTIVE_SESSION");
    assert.deepEqual(coordinator.advanceRefs, []);
});

function createExecutingGoal(id: string, stepCount: number, lastStep?: Goal["state"]["run"]["lastStep"]): Goal {
    const waiting = createWaitingGoal(id);
    return {
        ...waiting,
        state: {
            ...waiting.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "Test objective",
                    completionCriteria: [{ text: "Criteria 1" }],
                },
            },
            run: {
                ...waiting.state.run,
                status: "running",
                stepCount,
                ...(lastStep !== undefined ? { lastStep } : {}),
            },
        },
    };
}

test("committedSteps 时间线：连续提交时按单调顺序累积且去重", async () => {
    const goal = createWaitingGoal("goal-steps-timeline");
    const coordinator = new FakeCoordinator(waitingResult(goal));
    let notifyListener: ((savedGoal: Goal) => void) | undefined;
    const fakeNotifyingStore = {
        onSave(listener: (savedGoal: Goal) => void) {
            notifyListener = listener;
            return () => {};
        },
    };

    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
        notifyingStore: fakeNotifyingStore,
    });

    await controller.dispatch({ kind: "create", intent: "Start" });
    let view = sessionView(controller);
    assert.deepEqual(view.committedSteps, []);

    // 提交 Step 1
    const step1Goal = createExecutingGoal("goal-steps-timeline", 1, {
        kind: "action",
        action: { actionId: "act-1", toolId: "read_file", input: { path: "src/index.ts" } },
        observation: { kind: "success", output: { lines: 100 }, summary: "Read 100 lines" },
    });
    notifyListener?.(step1Goal);

    view = sessionView(controller);
    assert.equal(view.committedSteps?.length, 1);
    assert.equal(view.committedSteps[0]?.stepNumber, 1);
    assert.equal(view.committedSteps[0]?.toolId, "read_file");
    assert.equal(view.committedSteps[0]?.inputSummary, "src/index.ts");
    assert.equal(view.committedSteps[0]?.outputSummary, "Read 100 lines");
    assert.equal(view.committedSteps[0]?.status, "success");

    // 提交 Step 2
    const step2Goal = createExecutingGoal("goal-steps-timeline", 2, {
        kind: "action",
        action: { actionId: "act-2", toolId: "bash", input: { command: "npm test" } },
        observation: { kind: "failure", code: "COMMAND_FAILED", message: "1 test failed", retryable: false },
    });
    notifyListener?.(step2Goal);

    view = sessionView(controller);
    assert.equal(view.committedSteps?.length, 2);
    assert.equal(view.committedSteps[1]?.stepNumber, 2);
    assert.equal(view.committedSteps[1]?.toolId, "bash");
    assert.equal(view.committedSteps[1]?.inputSummary, "npm test");
    assert.equal(view.committedSteps[1]?.outputSummary, "1 test failed");
    assert.equal(view.committedSteps[1]?.status, "failure");

    // 重复提交 Step 2（幂等去重）
    notifyListener?.(step2Goal);
    view = sessionView(controller);
    assert.equal(view.committedSteps?.length, 2);

    // 迟到的旧 Step 1（忽略）
    notifyListener?.(step1Goal);
    view = sessionView(controller);
    assert.equal(view.committedSteps?.length, 2);

    controller.dispose();
});

test("committedSteps 时间线：通过 initialGoal 初始化恢复时正确还原步骤", async () => {
    const existingGoal = createExecutingGoal("goal-restored", 3, {
        kind: "action",
        action: { actionId: "act-3", toolId: "grep", input: { query: "export" } },
        observation: { kind: "success", output: {}, summary: "found 5 matches" },
    });

    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(existingGoal)),
            new FakeCoordinator(waitingResult(existingGoal)),
            new FakeStore([existingGoal]),
            new FakeCatalog([]),
        ),
        initialGoal: existingGoal,
    });

    const view = sessionView(controller);
    assert.equal(view.stepCount, 3);
    assert.equal(view.committedSteps?.length, 1);
    assert.equal(view.committedSteps[0]?.stepNumber, 3);
    assert.equal(view.committedSteps[0]?.toolId, "grep");
    assert.equal(view.committedSteps[0]?.inputSummary, "export");
    assert.equal(view.committedSteps[0]?.outputSummary, "found 5 matches");

    controller.dispose();
});

test("preparationSteps 时间线与 activeProbeDescription 状态随探查生命周期事件更新", async () => {
    const goal = createWaitingGoal("goal-probe-tracking");
    const coordinator = new FakeCoordinator(waitingResult(goal));

    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
    });

    await controller.dispatch({ kind: "create", intent: "Investigate problem" });
    let view = sessionView(controller);
    assert.equal(view.activeProbeDescription, undefined);
    assert.deepEqual(view.preparationSteps, undefined);

    // 触发 probe 1 开始 (read_file)
    coordinator.emitProbeProgress({
        kind: "started",
        goalId: "goal-probe-tracking",
        toolId: "read_file",
        input: { path: "src/types.ts" },
        probeNumber: 1,
    });
    view = sessionView(controller);
    assert.equal(view.activeProbeDescription, "Reading file src/types.ts...");

    // 触发 probe 1 完成
    coordinator.emitProbeProgress({
        kind: "finished",
        goalId: "goal-probe-tracking",
        toolId: "read_file",
        input: { path: "src/types.ts" },
        observation: { kind: "success", output: {}, summary: "Read 120 lines" },
        probeNumber: 1,
    });
    view = sessionView(controller);
    assert.equal(view.activeProbeDescription, undefined);
    assert.equal(view.preparationSteps?.length, 1);
    assert.equal(view.preparationSteps[0]?.toolId, "read_file");
    assert.equal(view.preparationSteps[0]?.inputSummary, "src/types.ts");
    assert.equal(view.preparationSteps[0]?.outputSummary, "Read 120 lines");
    assert.equal(view.preparationSteps[0]?.status, "success");

    // 触发 probe 2 开始 (grep)
    coordinator.emitProbeProgress({
        kind: "started",
        goalId: "goal-probe-tracking",
        toolId: "grep",
        input: { query: "export interface" },
        probeNumber: 2,
    });
    view = sessionView(controller);
    assert.equal(view.activeProbeDescription, "Searching for \"export interface\"...");

    // 触发 probe 2 完成 (grep)
    coordinator.emitProbeProgress({
        kind: "finished",
        goalId: "goal-probe-tracking",
        toolId: "grep",
        input: { query: "export interface" },
        observation: { kind: "success", output: {}, summary: "3 matches found" },
        probeNumber: 2,
    });
    view = sessionView(controller);
    assert.equal(view.activeProbeDescription, undefined);
    assert.equal(view.preparationSteps?.length, 2);
    assert.equal(view.preparationSteps[1]?.toolId, "grep");
    assert.equal(view.preparationSteps[1]?.inputSummary, "export interface");
    assert.equal(view.preparationSteps[1]?.outputSummary, "3 matches found");
    assert.equal(view.preparationSteps[1]?.status, "success");

    controller.dispose();
});
