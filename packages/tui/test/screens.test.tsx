import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    createGoal,
    type Goal,
    type GoalCatalog,
    type GoalProgressResult,
    type GoalStore,
    type LaunchRequest,
    type LaunchResult,
    type ResumeGoalRequest,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import {
    IntentScreen,
    PreparationScreen,
    SessionController,
    TuiApp,
    type PreparationScreenProps,
    type SessionControllerDependencies,
    type SessionCoordinator,
    type SessionLauncher,
    type UiSessionViewModel,
} from "../src/index";

afterEach(() => {
    cleanup();
});

const profile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Prepare before execution."],
    toolIds: [],
};

function createGoalSnapshot(id = "goal-1"): Goal {
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Build a resumable workflow",
        profile,
        runId: `run-${id}`,
    });
}

function questionGoal(id = "goal-question"): Goal {
    const goal = createGoalSnapshot(id);
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

function proposalGoal(id = "goal-proposal"): Goal {
    const goal = createGoalSnapshot(id);
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal: {
                        objective: "Implement persistence",
                        completionCriteria: ["Snapshots can be restored"],
                    },
                },
            },
        },
    };
}

function stalledGoal(id = "goal-stalled"): Goal {
    const goal = createGoalSnapshot(id);
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

function stalledSession(
    goal = stalledGoal(),
    overrides: Partial<UiSessionViewModel> = {},
): UiSessionViewModel {
    return {
        screen: "session",
        busy: false,
        goal,
        phase: "gathering_context",
        runStatus: goal.state.run.status,
        stepCount: goal.state.run.stepCount,
        messages: goal.state.messages,
        preparationStalled: true,
        ...overrides,
    };
}

function questionSession(goal = questionGoal()): UiSessionViewModel {
    return {
        screen: "session",
        busy: false,
        goal,
        phase: "gathering_context",
        runStatus: goal.state.run.status,
        stepCount: goal.state.run.stepCount,
        messages: goal.state.messages,
        waitingFor: "question",
        question: "Which database should be used?",
    };
}

function proposalSession(goal = proposalGoal()): UiSessionViewModel {
    const proposal = goal.state.workflow.phase === "planning"
        && goal.state.workflow.preparation.status === "waiting_approval"
        ? goal.state.workflow.preparation.proposal
        : undefined;

    return {
        screen: "session",
        busy: false,
        goal,
        phase: "planning",
        runStatus: goal.state.run.status,
        stepCount: goal.state.run.stepCount,
        messages: goal.state.messages,
        waitingFor: "approval",
        ...(proposal === undefined ? {} : { proposal }),
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

function controllerForApp(goal: Goal): {
    controller: SessionController;
    launcherRequests: LaunchRequest[];
} {
    const launcherRequests: LaunchRequest[] = [];
    const launcher: SessionLauncher = {
        async launch(request: LaunchRequest): Promise<LaunchResult> {
            launcherRequests.push(request);
            return waitingResult(goal);
        },
    };
    const coordinator: SessionCoordinator = {
        async advance(): Promise<GoalProgressResult> {
            return waitingResult(goal);
        },
        async resume(_request: ResumeGoalRequest): Promise<GoalProgressResult> {
            return waitingResult(goal);
        },
    };
    const store: Pick<GoalStore, "restore"> = {
        async restore(): Promise<Goal | undefined> {
            return undefined;
        },
    };
    const catalog: GoalCatalog = {
        async listResumable() {
            return [];
        },
    };
    const dependencies: SessionControllerDependencies = {
        launcher,
        coordinator,
        store,
        catalog,
        profileId: profile.id,
        goalIdGenerator: () => goal.id,
    };

    return {
        controller: new SessionController(dependencies),
        launcherRequests,
    };
}

async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
    });
}

test("IntentScreen rejects blank input and keeps the input screen", async () => {
    const submitted: string[] = [];
    const instance = render(
        <IntentScreen
            busy={false}
            onSubmit={(intent) => {
                submitted.push(intent);
            }}
        />,
    );

    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, []);
    assert.match(instance.lastFrame() ?? "", /Intent must not be empty/);
});

test("IntentScreen dispatches one semantic command for a valid intent", async () => {
    const submitted: string[] = [];
    const instance = render(
        <IntentScreen
            busy={false}
            onSubmit={(intent) => {
                submitted.push(intent);
            }}
        />,
    );

    instance.stdin.write("Build the TUI");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, ["Build the TUI"]);
});

test("IntentScreen ignores a repeated submit before the parent rerenders busy", async () => {
    const submitted: string[] = [];
    const instance = render(
        <IntentScreen
            busy={false}
            onSubmit={(intent) => {
                submitted.push(intent);
            }}
        />,
    );

    instance.stdin.write("Build once");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, ["Build once"]);
});

test("IntentScreen disables input and shows progress while busy", async () => {
    const submitted: string[] = [];
    const instance = render(
        <IntentScreen
            busy
            onSubmit={(intent) => {
                submitted.push(intent);
            }}
        />,
    );

    instance.stdin.write("Should not submit");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, []);
    assert.match(instance.lastFrame() ?? "", /Creating goal/);
});

test("PreparationScreen displays an Agent question and submits a message", async () => {
    const submitted: string[] = [];
    const props: PreparationScreenProps = {
        session: questionSession(),
        onSubmitMessage: (content) => {
            submitted.push(content);
        },
        onApproveTask: () => undefined,
        onRetry: () => undefined,
    };
    const instance = render(<PreparationScreen {...props} />);

    assert.match(instance.lastFrame() ?? "", /Agent question/);
    assert.match(instance.lastFrame() ?? "", /Which database should be used/);
    instance.stdin.write("Use SQLite");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, ["Use SQLite"]);
    assert.match(instance.lastFrame() ?? "", /Type your answer/);
});

test("PreparationScreen shows phase-specific progress and business error format", () => {
    const gathering = render(
        <PreparationScreen
            session={{
                ...questionSession(),
                busy: true,
                error: { code: "PREPARATION_FAILED", message: "Context lookup failed" },
            }}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    assert.match(gathering.lastFrame() ?? "", /Gathering context/);
    assert.match(gathering.lastFrame() ?? "", /Error \[PREPARATION_FAILED\]: Context lookup failed/);

    const planning = render(
        <PreparationScreen
            session={{ ...proposalSession(), busy: true }}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );
    assert.match(planning.lastFrame() ?? "", /Planning/);
});

test("PreparationScreen rejects blank question answers", async () => {
    const submitted: string[] = [];
    const instance = render(
        <PreparationScreen
            session={questionSession()}
            onSubmitMessage={(content) => {
                submitted.push(content);
            }}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );

    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, []);
    assert.match(instance.lastFrame() ?? "", /Error: Message must not be empty/);
});

test("PreparationScreen supports proposal approval and non-empty feedback", async () => {
    const submitted: string[] = [];
    let approved = 0;
    const instance = render(
        <PreparationScreen
            session={proposalSession()}
            onSubmitMessage={(content) => {
                submitted.push(content);
            }}
            onApproveTask={() => {
                approved += 1;
            }}
            onRetry={() => undefined}
        />,
    );

    assert.match(instance.lastFrame() ?? "", /Task proposal/);
    assert.match(instance.lastFrame() ?? "", /Implement persistence/);
    instance.stdin.write("\r");
    await nextFrame();
    assert.equal(approved, 0);
    instance.stdin.write("y");
    await nextFrame();
    assert.equal(approved, 1);

    const feedbackInstance = render(
        <PreparationScreen
            session={proposalSession(proposalGoal("goal-feedback"))}
            onSubmitMessage={(content) => {
                submitted.push(content);
            }}
            onApproveTask={() => {
                approved += 1;
            }}
            onRetry={() => undefined}
        />,
    );
    feedbackInstance.stdin.write("n");
    await nextFrame();
    assert.match(feedbackInstance.lastFrame() ?? "", /Describe the changes/);
    feedbackInstance.stdin.write("Add a migration test");
    await nextFrame();
    feedbackInstance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, ["Add a migration test"]);
    assert.match(feedbackInstance.lastFrame() ?? "", /Provide non-empty feedback/);
    assert.equal(approved, 1);
});

test("PreparationScreen offers a retry entry point when preparation is stalled", async () => {
    let retried = 0;
    const instance = render(
        <PreparationScreen
            session={stalledSession()}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => {
                retried += 1;
            }}
        />,
    );

    assert.match(instance.lastFrame() ?? "", /Preparation was interrupted/);
    assert.match(instance.lastFrame() ?? "", /Press Y to retry/);
    instance.stdin.write("y");
    await nextFrame();

    assert.equal(retried, 1);
});

test("PreparationScreen ignores other keys in the stalled panel", async () => {
    let retried = 0;
    const idle = render(
        <PreparationScreen
            session={stalledSession()}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => {
                retried += 1;
            }}
        />,
    );
    idle.stdin.write("n");
    await nextFrame();

    assert.equal(retried, 0);
});

test("PreparationScreen hides the stalled panel while a retry is in flight", async () => {
    let retried = 0;
    const busy = render(
        <PreparationScreen
            session={stalledSession(stalledGoal("goal-stalled-busy"), { busy: true })}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => {
                retried += 1;
            }}
        />,
    );
    busy.stdin.write("y");
    await nextFrame();

    assert.doesNotMatch(busy.lastFrame() ?? "", /Press Y to retry/);
    assert.equal(retried, 0);
});

test("PreparationScreen hides the stalled panel for waiting states", () => {
    const instance = render(
        <PreparationScreen
            session={questionSession()}
            onSubmitMessage={() => undefined}
            onApproveTask={() => undefined}
            onRetry={() => undefined}
        />,
    );

    assert.doesNotMatch(instance.lastFrame() ?? "", /Preparation was interrupted/);
});

test("TuiApp subscribes to Controller and moves from intent to question", async () => {
    const goal = questionGoal("goal-app");
    const { controller, launcherRequests } = controllerForApp(goal);
    const instance = render(<TuiApp controller={controller} />);

    assert.match(instance.lastFrame() ?? "", /What would you like to accomplish/);
    instance.stdin.write("Start a session");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();
    await nextFrame();

    assert.deepEqual(launcherRequests, [{
        goalId: "goal-app",
        intent: "Start a session",
        profileId: "profile-1",
    }]);
    assert.match(instance.lastFrame() ?? "", /Agent question/);
    assert.match(instance.lastFrame() ?? "", /Which database should be used/);
});

test("TuiApp routes the first raw-mode Ctrl+C to the shutdown callback once", async () => {
    const goal = questionGoal("goal-ctrl-c");
    const { controller } = controllerForApp(goal);
    let shutdownRequests = 0;
    const instance = render(
        <TuiApp
            controller={controller}
            onShutdown={() => {
                shutdownRequests += 1;
            }}
        />,
    );

    instance.stdin.write("\u0003");
    instance.stdin.write("\u0003");
    await nextFrame();

    assert.equal(shutdownRequests, 1);
});

test("TuiApp reports unexpected dispatch failures instead of swallowing them", async () => {
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
        warnings.push(args);
    };

    try {
        const snapshot = { screen: "intent_input" as const, busy: false };
        const controller = {
            getSnapshot: () => snapshot,
            subscribe: () => () => undefined,
            dispatch: async () => {
                throw new Error("dispatch failed");
            },
        } as unknown as SessionController;
        const instance = render(<TuiApp controller={controller} />);
        instance.stdin.write("Start a session");
        await nextFrame();
        instance.stdin.write("\r");
        await nextFrame();

        assert.equal(warnings.length, 1);
        assert.match(String(warnings[0]?.[0]), /Unexpected UI dispatch failure/);
    } finally {
        console.warn = originalWarn;
    }
});
