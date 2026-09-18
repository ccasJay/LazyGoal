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
    SessionController,
    TuiApp,
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
                            id: "q1",
                            header: "数据库",
                            question: "Which database should be used?",
                            options: [{ id: "opt1", label: "SQLite" }, { id: "opt2", label: "PostgreSQL" }],
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

/** 轮询等待 frame 中出现 pattern;超时以最终 frame 断言失败并展示实际内容。 */
async function waitForFrame(
    instance: { lastFrame(): string | undefined },
    pattern: RegExp,
    timeoutMs = 2000,
): Promise<string> {
    const start = Date.now();
    for (;;) {
        const frame = instance.lastFrame() ?? "";
        if (pattern.test(frame)) {
            // frame 更新先于 React passive effect(ink 的 useInput handler 重注册);
            // yield 一个 setImmediate 保证后续 stdin 写入打到最新 handler。
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            return instance.lastFrame() ?? "";
        }
        if (Date.now() - start >= timeoutMs) {
            assert.match(frame, pattern);
        }
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
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
    await waitForFrame(instance, /Intent must not be empty/);

    assert.deepEqual(submitted, []);
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
    await waitForFrame(instance, /Build the TUI/);
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
    await waitForFrame(instance, /Build once/);
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
    await waitForFrame(instance, /Creating goal/);
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(submitted, []);
});

test("TuiApp subscribes to Controller and moves from intent to question", async () => {
    const goal = questionGoal("goal-app");
    const { controller, launcherRequests } = controllerForApp(goal);
    const instance = render(<TuiApp controller={controller} />);

    assert.match(instance.lastFrame() ?? "", /What would you like to accomplish/);
    instance.stdin.write("Start a session");
    await waitForFrame(instance, /Start a session/);
    instance.stdin.write("\r");
    await waitForFrame(instance, /\[PLANNING\] Question 1 of 1/);
    await waitForFrame(instance, /Which database should be used/);

    assert.deepEqual(launcherRequests, [{
        goalId: "goal-app",
        intent: "Start a session",
        profileId: "profile-1",
    }]);
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

test("TuiApp exits the Inspector normally and releases keyboard listeners", async () => {
    const { controller } = controllerForApp(questionGoal("goal-inspector-exit"));
    await controller.dispatch({
        kind: "openInspector",
        goalId: "goal-inspector-exit",
        steps: [{ index: 0, totalSteps: 1, messages: [], rawJson: "{}" }],
    });

    let shutdownRequests = 0;
    const instance = render(
        <TuiApp
            controller={controller}
            onShutdown={() => {
                shutdownRequests += 1;
            }}
        />,
    );

    instance.stdin.write("q");
    await nextFrame();

    assert.equal(shutdownRequests, 0);
    assert.equal(instance.stdin.listenerCount("readable"), 0);
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
        await waitForFrame(instance, /Start a session/);
        instance.stdin.write("\r");
        await nextFrame();

        assert.equal(warnings.length, 1);
        assert.match(String(warnings[0]?.[0]), /Unexpected UI dispatch failure/);
    } finally {
        console.warn = originalWarn;
    }
});

test("TuiApp returns from Inspector to history and from history to the main menu", async () => {
    const { controller } = controllerForApp(questionGoal("goal-history-back"));
    await controller.dispatch({ kind: "openInspector", goalId: "goal-history-back",
        steps: [{ index: 0, totalSteps: 1, messages: [], rawJson: "{}" }] });
    const instance = render(<TuiApp controller={controller} />);
    instance.stdin.write("\u001b");
    await nextFrame();
    assert.equal(controller.getSnapshot().screen, "goal_select");
    assert.match(instance.lastFrame() ?? "", /Inspect Goal Trajectory/);
    instance.stdin.write("\u001b");
    await nextFrame();
    assert.equal(controller.getSnapshot().screen, "home");
    instance.stdin.write("\r");
    await nextFrame();
    assert.equal(controller.getSnapshot().screen, "intent_input");
    instance.stdin.write("\u001b");
    await nextFrame();
    assert.equal(controller.getSnapshot().screen, "home");
});
