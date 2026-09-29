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
    type ToolGrant,
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
                phase: "executing",
            },
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "plan",
                    questions: [
                        {
                            id: "q-1",
                            header: "Database Choice",
                            question: "Which database should be used?",
                            options: [
                                { id: "opt-1", label: "PostgreSQL" },
                                { id: "opt-2", label: "SQLite" },
                            ],
                            multiSelect: false,
                        },
                    ],
                },
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

function waitingResult(goal: Goal): GoalProgressResult {
    return {
        ok: true,
        kind: "waiting",
        phase: "executing",
        waitingFor: "ask_user",
        goal,
    };
}

function completedGoal(id = "goal-completed"): Goal {
    const waiting = createWaitingGoal(id);
    const { pendingInteraction: _pendingInteraction, ...runWithoutInteraction } = waiting.state.run;
    return {
        ...waiting,
        state: {
            ...waiting.state,
            run: {
                ...runWithoutInteraction,
                status: "completed",
                stepCount: 2,
            },
        },
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
    readonly planModeRefs: Array<{ readonly goalId: string; readonly runId: string }> = [];
    readonly resumeRequests: ResumeGoalRequest[] = [];
    readonly continueRequests: Array<{
        readonly ref: { readonly goalId: string; readonly runId: string };
        readonly newInput: string;
    }> = [];

    constructor(
        private readonly advanceResult: GoalProgressResult,
        private readonly resumeResult: GoalProgressResult = advanceResult,
        private readonly continueResult: GoalProgressResult = advanceResult,
    ) {}

    async advance(
        ref: { readonly goalId: string; readonly runId: string },
    ): Promise<GoalProgressResult> {
        this.advanceRefs.push(ref);
        return this.advanceResult;
    }

    async enterPlanMode(
        ref: { readonly goalId: string; readonly runId: string },
    ): Promise<GoalProgressResult> {
        this.planModeRefs.push(ref);
        return this.advanceResult;
    }

    async resume(request: ResumeGoalRequest): Promise<GoalProgressResult> {
        this.resumeRequests.push(request);
        return this.resumeResult;
    }

    async continue(
        ref: { readonly goalId: string; readonly runId: string },
        newInput: string,
    ): Promise<GoalProgressResult> {
        this.continueRequests.push({ ref, newInput });
        return this.continueResult;
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
    assert.equal(view.waitingFor, "ask_user");
    assert.equal(view.askUser?.questions[0]?.question, "Which database should be used?");
    assert.equal(view.busy, false);
    assert.ok(notifications.length >= 2);
});

test("/plan is consumed by one new Goal or selects the next Run after completion", async () => {
    const launchedGoal = createWaitingGoal("goal-created");
    const launcher = new FakeLauncher(waitingResult(launchedGoal));
    const coordinator = new FakeCoordinator(waitingResult(launchedGoal));
    const controller = new SessionController(
        dependencies(launcher, coordinator, new FakeStore([]), new FakeCatalog([])),
    );

    await controller.dispatch({ kind: "enterPlanMode" });
    assert.equal(controller.getSnapshot().screen, "intent_input");
    await controller.dispatch({ kind: "create", intent: "Plan this work" });
    await controller.dispatch({ kind: "openHome" });
    await controller.dispatch({ kind: "create", intent: "Run normally" });

    assert.equal(launcher.requests[0]?.mode, "plan");
    assert.equal(launcher.requests[1]?.mode, undefined);

    const completed = completedGoal("goal-next-plan");
    const nextRunGoal: Goal = {
        ...completed,
        state: { ...completed.state, nextRunMode: "plan" },
    };
    const completedCoordinator = new FakeCoordinator({
        ok: true,
        kind: "terminal",
        phase: "executing",
        goal: nextRunGoal,
    });
    const completedController = new SessionController({
        ...dependencies(
            launcher,
            completedCoordinator,
            new FakeStore([completed]),
            new FakeCatalog([]),
        ),
        initialGoal: completed,
    });

    await completedController.dispatch({ kind: "enterPlanMode" });
    assert.deepEqual(completedCoordinator.planModeRefs, [{
        goalId: completed.id,
        runId: completed.state.run.id,
    }]);
    assert.equal(sessionView(completedController).goal.state.nextRunMode, "plan");
});

test("a persisted Plan launch consumes the pending mode even if the first Run reports an error", async () => {
    const savedGoal = createWaitingGoal("goal-created");
    const launcher = new FakeLauncher({
        ok: false,
        error: { code: "RUN_NOT_FOUND", message: "Run could not be advanced" },
    });
    const controller = new SessionController(
        dependencies(
            launcher,
            new FakeCoordinator(waitingResult(savedGoal)),
            new FakeStore([savedGoal]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "enterPlanMode" });
    await controller.dispatch({ kind: "create", intent: "Plan once" });
    await controller.dispatch({ kind: "openHome" });
    await controller.dispatch({ kind: "create", intent: "Run normally next time" });

    assert.equal(launcher.requests[0]?.mode, "plan");
    assert.equal(launcher.requests[1]?.mode, undefined);
});

test("普通只读 Action 通过 Goal 快照提交后固化步骤", async () => {
    const goal = createWaitingGoal("goal-pretask-read-tracking");
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
    controller.onGoalCommitted({
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                stepCount: 1,
                lastStep: {
                    kind: "action",
                    action: {
                        actionId: "read-1",
                        toolId: "read_file",
                        input: { path: "src/types.ts" },
                    },
                    observation: {
                        kind: "success",
                        output: {},
                        summary: "Read 120 lines",
                    },
                },
            },
        },
    });
    const view = sessionView(controller);
    assert.equal(view.committedSteps?.[0]?.actionId, "read-1");
    assert.equal(view.committedSteps?.[0]?.outputSummary, "Read 120 lines");
    controller.dispose();
});

test("continueLatest lists candidates, restores the newest Goal, and advances it", async () => {
    const goal = createWaitingGoal("goal-latest");
    const entry: GoalCatalogEntry = {
        goalId: goal.id,
        runId: goal.state.run.id,
        intent: goal.definition.intent,
        workflowPhase: "executing",
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
        workflowPhase: "executing",
        runStatus: "waiting",
        updatedAt: "2026-08-17T02:00:00.000Z",
    };
    const older: GoalCatalogEntry = {
        goalId: "goal-older",
        runId: "run-older",
        intent: "Older resumable Goal",
        workflowPhase: "executing",
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
        workflowPhase: "executing",
        runStatus: "waiting",
        updatedAt: "2026-08-17T02:00:00.000Z",
    };
    const secondEntry: GoalCatalogEntry = {
        goalId: second.id,
        runId: second.state.run.id,
        intent: second.definition.intent,
        workflowPhase: "executing",
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
    await controller.dispatch({ kind: "approveTask", requestId: "prop-1" });
    await controller.dispatch({ kind: "feedbackTask", requestId: "prop-1", feedback: "Modify criteria" });
    await controller.dispatch({
        kind: "answerAskUser",
        requestId: "ask-1",
        answers: [{ questionId: "q-1", optionIds: ["opt-1"] }],
    });
    await controller.dispatch({ kind: "approveAction", actionId: "action-1", scope: "goal" });
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
            action: { kind: "approve_task", requestId: "prop-1" },
        },
        {
            ref: { goalId: goal.id, runId: goal.state.run.id },
            action: { kind: "feedback_task", requestId: "prop-1", feedback: "Modify criteria" },
        },
        {
            ref: { goalId: goal.id, runId: goal.state.run.id },
            action: {
                kind: "answer_ask_user",
                requestId: "ask-1",
                answers: [{ questionId: "q-1", optionIds: ["opt-1"] }],
            },
        },
        {
            ref: { goalId: goal.id, runId: goal.state.run.id },
            action: { kind: "approve_action", actionId: "action-1", scope: "goal" },
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

test("Tool permissions screen lists the current scope, revokes it, and returns to session", async () => {
    const goal = createWaitingGoal("goal-permissions");
    let grant: ToolGrant = {
        id: "grant-1",
        scope: "goal",
        workspaceId: "workspace-1",
        goalId: goal.id,
        source: { goalId: goal.id, runId: goal.state.run.id, actionId: "action-1" },
        matcher: { kind: "target_path", toolId: "write_file", version: 1, path: "src/app.ts" },
        status: "active",
    };
    const coordinator: SessionCoordinator = {
        async advance() { return waitingResult(goal); },
        async resume() { return waitingResult(goal); },
        async listToolGrants(ref) {
            assert.deepEqual(ref, { goalId: goal.id, runId: goal.state.run.id });
            return [grant];
        },
        async revokeToolGrant(request) {
            assert.deepEqual(request, {
                ref: { goalId: goal.id, runId: goal.state.run.id },
                grantId: "grant-1",
                scope: "goal",
            });
            grant = { ...grant, status: "revoked" };
            return grant;
        },
    };
    const controller = new SessionController({
        ...dependencies(new FakeLauncher(waitingResult(goal)), coordinator, new FakeStore([goal]), new FakeCatalog([])),
        initialGoal: goal,
    });

    await controller.dispatch({ kind: "openToolPermissions" });
    let view = controller.getSnapshot();
    assert.equal(view.screen, "tool_permissions");
    if (view.screen !== "tool_permissions") assert.fail("Tool permissions screen did not open");
    assert.deepEqual(view.grants, [{
        grantId: "grant-1",
        scope: "goal",
        toolId: "write_file",
        status: "active",
        targetPath: "src/app.ts",
    }]);

    await controller.dispatch({ kind: "revokeToolGrant", grantId: "grant-1", scope: "goal" });
    view = controller.getSnapshot();
    assert.equal(view.screen, "tool_permissions");
    if (view.screen !== "tool_permissions") assert.fail("Tool permissions screen closed unexpectedly");
    assert.equal(view.grants[0]?.status, "revoked");
    await controller.dispatch({ kind: "closeToolPermissions" });
    view = controller.getSnapshot();
    assert.equal(view.screen, "session");
    if (view.screen === "session") assert.equal(view.toolGrants?.[0]?.status, "revoked");
});

test("completed Run message routes to Coordinator continue and keeps the new Run identity", async () => {
    const completed = completedGoal("goal-completed-session");
    const nextGoal: Goal = {
        ...completed,
        state: {
            ...completed.state,
            messages: [...completed.state.messages, { role: "user", content: "下一项工作" }],
            run: {
                ...completed.state.run,
                id: "run-next",
                status: "running",
                stepCount: 0,
            },
        },
    };
    const continueResult: GoalProgressResult = {
        ok: true,
        kind: "terminal",
        phase: "executing",
        goal: {
            ...nextGoal,
            state: {
                ...nextGoal.state,
                run: { ...nextGoal.state.run, status: "completed" },
            },
        },
    };
    const coordinator = new FakeCoordinator(
        continueResult,
        continueResult,
        continueResult,
    );
    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(continueResult),
            coordinator,
            new FakeStore([completed]),
            new FakeCatalog([]),
        ),
        initialGoal: completed,
    });

    await controller.dispatch({ kind: "submitMessage", content: "下一项工作" });

    assert.deepEqual(coordinator.continueRequests, [{
        ref: { goalId: completed.id, runId: completed.state.run.id },
        newInput: "下一项工作",
    }]);
    const view = sessionView(controller);
    assert.equal(view.goal.state.run.id, "run-next");
    assert.equal(view.goal.state.run.status, "completed");
});

test("new Run resets local step ordering while late old Run commits are ignored", async () => {
    const completed = completedGoal("goal-run-identity");
    const oldRun: Goal = {
        ...completed,
        state: {
            ...completed.state,
            run: {
                ...completed.state.run,
                stepCount: 1,
                lastStep: {
                    kind: "action",
                    action: {
                        actionId: "old-action",
                        toolId: "read_file",
                        input: { path: "old.ts" },
                    },
                    observation: {
                        kind: "success",
                        output: "old",
                        summary: "old run",
                    },
                },
            },
        },
    };
    const nextRun: Goal = {
        ...oldRun,
        state: {
            ...oldRun.state,
            messages: [...oldRun.state.messages, { role: "user", content: "new run" }],
            run: {
                ...oldRun.state.run,
                id: "run-new-identity",
                status: "completed",
                stepCount: 1,
                lastStep: {
                    kind: "action",
                    action: {
                        actionId: "new-action",
                        toolId: "write_file",
                        input: { path: "new.ts" },
                    },
                    observation: {
                        kind: "success",
                        output: "new",
                        summary: "new run",
                    },
                },
            },
        },
    };
    const coordinator = new FakeCoordinator({
        ok: true,
        kind: "terminal",
        phase: "executing",
        goal: nextRun,
    });
    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher({ ok: true, kind: "terminal", phase: "executing", goal: nextRun }),
            coordinator,
            new FakeStore([oldRun]),
            new FakeCatalog([]),
        ),
        initialGoal: oldRun,
    });

    await controller.dispatch({ kind: "submitMessage", content: "new run" });
    let view = sessionView(controller);
    assert.equal(view.goal.state.run.id, "run-new-identity");
    assert.equal(view.committedSteps?.filter((step) => step.stepNumber === 1).length, 2);

    controller.onGoalCommitted(oldRun);
    view = sessionView(controller);
    assert.equal(view.goal.state.run.id, "run-new-identity");
    assert.equal(view.committedSteps?.filter((step) => step.stepNumber === 1).length, 2);
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
            message: "Agent decision did not match the current execution lifecycle",
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

test("session derives askUser request and mode from pendingInteraction", async () => {
    const goal = createWaitingGoal("goal-ask-derive");
    const coordinator = new FakeCoordinator(waitingResult(goal));
    const store = new FakeStore([goal]);
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(waitingResult(goal)),
            coordinator,
            store,
            new FakeCatalog([]),
        ),
    );
    await controller.dispatch({ kind: "create", intent: "Start" });

    const view = sessionView(controller);
    assert.equal(view.waitingFor, "ask_user");
    assert.equal(view.interactionMode, "plan");
    assert.equal(view.askUser?.requestId, "ask-1");
    assert.equal(view.askUser?.questions.length, 1);
    assert.equal(view.askUser?.questions[0]?.header, "Database Choice");
});

test("session derives proposal and approvalRequest from task_approval pendingInteraction", async () => {
    const base = createWaitingGoal("goal-prop-derive");
    const proposalGoal: Goal = {
        ...base,
        state: {
            ...base.state,
            run: {
                ...base.state.run,
                mode: "plan",
                status: "waiting",
                pendingInteraction: {
                    kind: "task_approval",
                    requestId: "prop-99",
                    proposal: {
                        objective: "Deploy service to staging",
                        completionCriteria: [{ text: "Service healthcheck is 200" }],
                    },
                    approvalRequest: "Please approve deployment plan",
                },
            },
        },
    };
    const progressResult: GoalProgressResult = {
        ok: true,
        kind: "waiting",
        phase: "executing",
        waitingFor: "task_approval",
        goal: proposalGoal,
    };
    const controller = new SessionController(
        dependencies(
            new FakeLauncher(progressResult),
            new FakeCoordinator(progressResult),
            new FakeStore([proposalGoal]),
            new FakeCatalog([]),
        ),
    );

    await controller.dispatch({ kind: "create", intent: "Start" });

    const view = sessionView(controller);
    assert.equal(view.waitingFor, "task_approval");
    assert.equal(view.proposal?.objective, "Deploy service to staging");
    assert.equal(view.proposalRequestId, "prop-99");
    assert.equal(view.approvalRequest, "Please approve deployment plan");
});

test("session projects a committed GoalPlan while the current Run is normal", () => {
    const base = createWaitingGoal("goal-normal-with-plan");
    const goal: Goal = {
        ...base,
        state: {
            ...base.state,
            goalPlan: {
                revision: 2,
                items: [{ id: "todo-1", content: "Committed plan item", position: 0, status: "pending" }],
            },
            run: { ...base.state.run, mode: "normal" },
        },
    };
    const controller = new SessionController({
        ...dependencies(
            new FakeLauncher(waitingResult(goal)),
            new FakeCoordinator(waitingResult(goal)),
            new FakeStore([goal]),
            new FakeCatalog([]),
        ),
        initialGoal: goal,
    });

    assert.deepEqual(sessionView(controller).goalPlan, goal.state.goalPlan);
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
            },
            run: {
                ...pendingGoal.state.run,
                status: "waiting",
                pendingAction: {
                    status: "awaiting_approval",
                    action: { actionId: "act-99", toolId: "bash", input: {} },
                },

                mode: "plan", approvedTask: { objective: "Execute", completionCriteria: [] },
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
    const { pendingInteraction: _pendingInteraction, ...runWithoutPendingInteraction } = base.state.run;
    const goal: Goal = { ...base, state: { ...base.state,
        workflow: { phase: "executing",
},
        run: { ...runWithoutPendingInteraction, status: "waiting", pendingAction: {
            status: "awaiting_approval",
            action: { actionId: "act-1", toolId: "bash", input: {} },
        } , mode: "plan", approvedTask: { objective: "Review files", completionCriteria: [] } },
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
            workflow: { phase: "executing",
},
            run: { ...base.state.run, status: "waiting", stepCount: index, pendingAction: {
                status: "awaiting_approval", action: { actionId: `act-${index}`, toolId: "bash", input: {} },
            } , mode: "plan", approvedTask: { objective: "Review files", completionCriteria: [] } },
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
        assert.equal(view.steps[0]?.title, "Step 1: Goal Initialized");
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
