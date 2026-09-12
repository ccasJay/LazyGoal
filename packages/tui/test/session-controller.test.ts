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
    type ResumeGoalRequest,
    type TrajectoryEvent,
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

    constructor(
        private readonly advanceResult: GoalProgressResult,
        private readonly resumeResult: GoalProgressResult = advanceResult,
    ) {}

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

test("initialScreen: home initializes snapshot with home screen and environment summary", () => {
    const goal = createWaitingGoal();
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
        initialScreen: "home",
        environmentSummary: {
            workspaceRoot: "/test/workspace",
            profileId: "profile-1",
            modelName: "claude-3-5",
            dataDirectory: "/test/data",
        },
    });

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.screen, "home");
    assert.equal(snapshot.busy, false);
    if (snapshot.screen === "home") {
        assert.deepEqual(snapshot.environmentSummary, {
            workspaceRoot: "/test/workspace",
            profileId: "profile-1",
            modelName: "claude-3-5",
            dataDirectory: "/test/data",
        });
    }
});

test("initial inspect selection allows its first history load without a busy deadlock", async () => {
    const goal = createWaitingGoal();
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
        initialScreen: "goal_select",
        initialGoalSelectMode: "inspect",
    });

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.screen, "goal_select");
    assert.equal(snapshot.busy, false);
    if (snapshot.screen === "goal_select") {
        assert.equal(snapshot.mode, "inspect");
    }
    await controller.dispatch({ kind: "openHistory" });
    const loaded = controller.getSnapshot();
    assert.equal(loaded.screen, "goal_select");
    assert.equal(loaded.busy, false);
    assert.equal(loaded.error, undefined);
    if (loaded.screen === "goal_select") assert.equal(loaded.mode, "inspect");
});

test("openHome, openIntentInput, and openSettings switch views predictably", async () => {
    const goal = createWaitingGoal();
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
        environmentSummary: {
            workspaceRoot: "/workspace",
            profileId: "profile-1",
            modelName: "test-model",
        },
    });

    assert.equal(controller.getSnapshot().screen, "intent_input");

    await controller.dispatch({ kind: "openHome" });
    assert.equal(controller.getSnapshot().screen, "home");

    await controller.dispatch({ kind: "openSettings" });
    const settingsView = controller.getSnapshot();
    assert.equal(settingsView.screen, "settings");
    if (settingsView.screen === "settings") {
        assert.equal(settingsView.settings.workspaceRoot, "/workspace");
        assert.equal(settingsView.settings.profileId, "profile-1");
        assert.equal(settingsView.settings.modelName, "test-model");
    }

    await controller.dispatch({ kind: "openIntentInput" });
    assert.equal(controller.getSnapshot().screen, "intent_input");
});

test("executionMode defaults to confirm, reflects in session, and toggles seamlessly", async () => {
    const goal = createWaitingGoal();
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Build feature" });
    assert.equal(sessionView(controller).executionMode, "confirm");

    await controller.dispatch({ kind: "toggleExecutionMode" });
    assert.equal(sessionView(controller).executionMode, "yolo");

    await controller.dispatch({ kind: "toggleExecutionMode" });
    assert.equal(sessionView(controller).executionMode, "confirm");

    await controller.dispatch({ kind: "setExecutionMode", mode: "yolo" });
    assert.equal(sessionView(controller).executionMode, "yolo");
});

test("switching to yolo mode auto-approves pending action waiting in session", async () => {
    const pendingGoal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-pending-act",
        intent: "Run script",
        profile,
        runId: "run-pending-act",
    });
    const awaitingGoal: Goal = {
        ...pendingGoal,
        state: {
            ...pendingGoal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: { objective: "Execute", completionCriteria: [] },
            },
            run: {
                ...pendingGoal.state.run,
                status: "waiting",
                pendingAction: {
                    status: "awaiting_approval",
                    action: { actionId: "act-99", toolId: "bash", input: {} },
                },
            },
        },
    };

    const { pendingAction: _pendingAction, ...runWithoutPendingAction } = awaitingGoal.state.run;
    const completedGoal: Goal = {
        ...awaitingGoal,
        state: {
            ...awaitingGoal.state,
            run: {
                ...runWithoutPendingAction,
                status: "completed",
            },
        },
    };

    const advanceResult: GoalProgressResult = {
        ok: true,
        kind: "waiting",
        phase: "executing",
        waitingFor: "action_approval",
        goal: awaitingGoal,
    };

    const resumeResult: GoalProgressResult = {
        ok: true,
        kind: "terminal",
        phase: "executing",
        goal: completedGoal,
    };

    const coordinator = new FakeCoordinator(advanceResult, resumeResult);
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(advanceResult),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Run script" });
    assert.equal(sessionView(controller).waitingFor, "action_approval");
    assert.equal(coordinator.resumeRequests.length, 0);

    // 切到 yolo，触发自动放行
    await controller.dispatch({ kind: "toggleExecutionMode" });
    assert.equal(sessionView(controller).executionMode, "yolo");
    assert.equal(coordinator.resumeRequests.length, 1);
    assert.deepEqual(coordinator.resumeRequests[0], {
        ref: { goalId: "goal-pending-act", runId: "run-pending-act" },
        action: { kind: "approve_action", actionId: "act-99" },
    });
    assert.equal(sessionView(controller).runStatus, "completed");
});

test("YOLO keeps advancement serialized and switches to Confirm during an in-flight action", async () => {
    const base = createWaitingGoal("goal-live-mode");
    const goal: Goal = { ...base, state: { ...base.state,
        workflow: { phase: "executing", preparation: { status: "completed" },
            task: { objective: "Review files", completionCriteria: [] } },
        run: { ...base.state.run, status: "waiting", pendingAction: {
            status: "awaiting_approval",
            action: { actionId: "act-1", toolId: "bash", input: {} },
        } },
    } };
    const result: GoalProgressResult = { ok: true, kind: "waiting", phase: "executing",
        waitingFor: "action_approval", goal };
    let resolvePending!: (val: GoalProgressResult) => void;
    const pendingPromise = new Promise<GoalProgressResult>((resolve) => {
        resolvePending = resolve;
    });
    const pending = {
        promise: pendingPromise,
        resolve: resolvePending,
    };
    const requests: ResumeGoalRequest[] = [];
    const coordinator: SessionCoordinator = {
        advance: async () => result,
        resume: async request => { requests.push(request); return pending.promise; },
    };
    const controller = new SessionController({
        ...dependencies(new FakeLauncher(result), coordinator, new FakeStore([]), new FakeCatalog([])),
        initialGoal: goal,
    });
    const running = controller.dispatch({ kind: "setExecutionMode", mode: "yolo" });
    assert.equal(sessionView(controller).busy, true);
    assert.equal(requests.length, 1);
    await controller.dispatch({ kind: "setExecutionMode", mode: "yolo" });
    assert.equal(requests.length, 1, "setting the mode while busy must not approve twice");
    await controller.dispatch({ kind: "toggleExecutionMode" });
    assert.equal(sessionView(controller).executionMode, "confirm");
    assert.equal(sessionView(controller).busy, true);
    await assert.rejects(controller.dispatch({ kind: "approveAction", actionId: "act-1" }),
        error => error instanceof UiDispatchRejectedError && error.code === "UI_BUSY");
    resolvePending({ ...result, goal: { ...goal, state: { ...goal.state,
        run: { ...goal.state.run, pendingAction: { status: "awaiting_approval",
            action: { actionId: "act-2", toolId: "bash", input: {} } } },
    } } });
    await running;
    assert.equal(requests.length, 1, "Confirm must leave the next action for the user");
    assert.equal(sessionView(controller).pendingAction?.action.actionId, "act-2");
    assert.equal(sessionView(controller).busy, false);
});

test("YOLO publishes busy snapshots throughout consecutive approvals", async () => {
    const base = createWaitingGoal("goal-auto-chain");
    const resultAt = (index: number): GoalProgressResult => ({
        ok: true, kind: "waiting", phase: "executing", waitingFor: "action_approval",
        goal: { ...base, state: { ...base.state,
            workflow: { phase: "executing", preparation: { status: "completed" },
                task: { objective: "Review files", completionCriteria: [] } },
            run: { ...base.state.run, status: "waiting", stepCount: index, pendingAction: {
                status: "awaiting_approval", action: { actionId: `act-${index}`, toolId: "bash", input: {} },
            } },
        } },
    });
    let count = 0;
    const coordinator: SessionCoordinator = {
        advance: async () => resultAt(0),
        resume: async () => resultAt(++count),
    };
    const controller = new SessionController({
        ...dependencies(new FakeLauncher(resultAt(0)), coordinator, new FakeStore([]), new FakeCatalog([])),
        initialExecutionMode: "yolo",
    });
    const states: boolean[] = [];
    controller.subscribe(() => {
        const view = controller.getSnapshot();
        if (view.screen !== "session") return;
        states.push(view.busy);
        if (view.stepCount === 100 && view.executionMode === "yolo") {
            void controller.dispatch({ kind: "setExecutionMode", mode: "confirm" });
        }
    });
    await controller.dispatch({ kind: "create", intent: "Review files" });
    assert.equal(count, 100);
    assert.equal(states.at(-1), false);
    assert.ok(states.slice(0, -1).every(Boolean), "the lock is released only after the chain ends");
});

test("openInspector, inspectStep, and toggleReasoning manage inspector state", async () => {
    const goal = createWaitingGoal();
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([]),
            new FakeCatalog([]),
        ),
    );

    const steps = [
        { index: 0, totalSteps: 3, messages: [], rawJson: "{}" },
        { index: 1, totalSteps: 3, messages: [], rawJson: "{}", reasoning: "Thinking..." },
        { index: 2, totalSteps: 3, messages: [], rawJson: "{}" },
    ];

    await controller.dispatch({
        kind: "openInspector",
        goalId: "goal-inspect-1",
        steps,
    });

    let view = controller.getSnapshot();
    assert.equal(view.screen, "inspector");
    if (view.screen === "inspector") {
        assert.equal(view.goalId, "goal-inspect-1");
        assert.equal(view.currentStepIndex, 0);
        assert.equal(view.totalSteps, 3);
        assert.equal(view.showReasoning, false);
    }

    await Promise.all([
        controller.dispatch({ kind: "inspectStep", stepIndex: 1 }),
        controller.dispatch({ kind: "inspectStep", stepIndex: 2 }),
    ]);
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.currentStepIndex, 2);
        assert.equal(view.busy, false);
    }

    await controller.dispatch({ kind: "inspectStep", stepIndex: 1 });
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.currentStepIndex, 1);
    }

    // 越界保护
    await controller.dispatch({ kind: "inspectStep", stepIndex: 99 });
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.currentStepIndex, 2);
    }

    await controller.dispatch({ kind: "inspectStep", stepIndex: -5 });
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.currentStepIndex, 0);
    }

    // 翻转 reasoning
    await controller.dispatch({ kind: "toggleReasoning" });
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.showReasoning, true);
    }
    await controller.dispatch({ kind: "toggleReasoning" });
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.showReasoning, false);
    }

    // 翻转 observation
    await controller.dispatch({ kind: "toggleObservation" });
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.expandObservation, true);
    }
    await controller.dispatch({ kind: "toggleObservation" });
    view = controller.getSnapshot();
    if (view.screen === "inspector") {
        assert.equal(view.expandObservation, false);
    }
});

test("inspect mode selectGoal orchestrates trajectory loading and event projection", async () => {
    const goal = createWaitingGoal("goal-inspect-ok");
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const events: TrajectoryEvent[] = [
        {
            eventSchemaVersion: 1,
            eventId: "evt-1",
            sequence: 1,
            occurredAt: "2026-09-11T12:00:00.000Z",
            goalId: "goal-inspect-ok",
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "decision_received",
            executionUnitId: "unit-1",
            stepIndex: 1,
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "Inspection done",
                    completionEvidence: [],
                },
            },
        },
    ];

    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
        initialScreen: "goal_select",
        initialGoalSelectMode: "inspect",
        readTrajectory: async (query) => {
            assert.equal(query.goalId, "goal-inspect-ok");
            assert.equal(query.runId, goal.state.run.id);
            return {
                committed: events,
                uncommittedTail: [],
            };
        },
    });

    await controller.dispatch({ kind: "selectGoal", goalId: "goal-inspect-ok" });
    const view = controller.getSnapshot();
    assert.equal(view.screen, "inspector");
    if (view.screen === "inspector") {
        assert.equal(view.goalId, "goal-inspect-ok");
        assert.equal(view.totalSteps, 2);
        assert.equal(view.steps[0]?.title, "Step 1: Preparation & Planning");
        assert.equal(view.steps[1]?.title, "Step 2: Execution (unit-1)");
        assert.equal(view.steps[1]?.decision?.summary, "Inspection done");
    }
});

test("inspect mode selectGoal reports TRAJECTORY_NOT_FOUND when readTrajectory is missing or returns empty", async () => {
    const goal = createWaitingGoal("goal-no-traj");
    const coordinator = new FakeCoordinator(waitingResult(goal));

    // 1. 未配置 readTrajectory
    const controllerNoReader = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
        initialScreen: "goal_select",
        initialGoalSelectMode: "inspect",
    });

    await controllerNoReader.dispatch({ kind: "selectGoal", goalId: "goal-no-traj" });
    let view = controllerNoReader.getSnapshot();
    assert.equal(view.screen, "goal_select");
    assert.equal(view.error?.code, "TRAJECTORY_NOT_FOUND");

    // 2. 返回空事件
    const controllerEmpty = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
        initialScreen: "goal_select",
        initialGoalSelectMode: "inspect",
        readTrajectory: async () => ({
            committed: [],
            uncommittedTail: [],
        }),
    });

    await controllerEmpty.dispatch({ kind: "selectGoal", goalId: "goal-no-traj" });
    view = controllerEmpty.getSnapshot();
    assert.equal(view.screen, "goal_select");
    assert.equal(view.error?.code, "TRAJECTORY_NOT_FOUND");

    // 3. 读取抛错
    const controllerError = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
        initialScreen: "goal_select",
        initialGoalSelectMode: "inspect",
        readTrajectory: async () => {
            throw new Error("File corrupted or missing");
        },
    });

    await controllerError.dispatch({ kind: "selectGoal", goalId: "goal-no-traj" });
    view = controllerError.getSnapshot();
    assert.equal(view.screen, "goal_select");
    assert.equal(view.error?.code, "TRAJECTORY_NOT_FOUND");
});
