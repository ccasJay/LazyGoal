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
} from "../../runtime/src/index";
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
