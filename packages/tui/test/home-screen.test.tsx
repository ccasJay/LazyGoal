import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    HomeScreen,
    LAZYGOAL_ASCII_BANNER,
    SettingsScreen,
    SessionController,
    TuiApp,
} from "../src/index";
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

afterEach(() => {
    cleanup();
});

async function waitForFrame(
    instance: { lastFrame(): string | undefined },
    pattern: RegExp,
    timeoutMs = 2000,
): Promise<string> {
    const start = Date.now();
    for (;;) {
        const frame = instance.lastFrame() ?? "";
        if (pattern.test(frame)) {
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

test("HomeScreen renders ASCII banner, environment summary, and official select options", () => {
    const instance = render(
        <HomeScreen
            busy={false}
            environmentSummary={{
                workspaceRoot: "/path/to/workspace",
                profileId: "default-profile",
            }}
            onSelectNewGoal={() => undefined}
            onSelectViewHistory={() => undefined}
            onSelectSettings={() => undefined}
            onExit={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.ok(frame.includes("LazyGoal") || frame.includes("____"));
    assert.match(frame, /Workspace: \/path\/to\/workspace/);
    assert.match(frame, /Profile: default-profile/);
    assert.match(frame, /New Goal/);
    assert.match(frame, /View History/);
    assert.match(frame, /Settings/);
    assert.match(frame, /Exit/);
    assert.match(frame, /↑\/↓ Navigate  Enter Select  q Exit/);
});

test("HomeScreen triggers onExit when pressing 'q'", async () => {
    let exited = false;
    const instance = render(
        <HomeScreen
            busy={false}
            onSelectNewGoal={() => undefined}
            onSelectViewHistory={() => undefined}
            onSelectSettings={() => undefined}
            onExit={() => {
                exited = true;
            }}
        />,
    );

    instance.stdin.write("q");
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    assert.equal(exited, true);
});

test("SettingsScreen displays environment details and triggers onBack when pressing Enter or q", async () => {
    let backCalled = false;
    const instance = render(
        <SettingsScreen
            settings={{
                workspaceRoot: "/repo/LazyGoal",
                profileId: "test-profile",
                modelName: "claude-3-sonnet",
                dataDirectory: "/repo/LazyGoal/.lazygoal",
            }}
            busy={false}
            onBack={() => {
                backCalled = true;
            }}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Settings & Environment/);
    assert.match(frame, /Workspace Root:.*\/repo\/LazyGoal/);
    assert.match(frame, /Active Profile:.*test-profile/);
    assert.match(frame, /Model Name:.*claude-3-sonnet/);
    assert.match(frame, /Data Directory:.*\.lazygoal/);

    instance.stdin.write("q");
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    assert.equal(backCalled, true);
});

const dummyProfile = {
    id: "p1",
    systemPrompt: "sys",
    instructions: [],
    toolIds: [],
};

function createDummyGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "g1",
        intent: "dummy",
        profile: dummyProfile,
        runId: "r1",
    });
}

test("TuiApp with initialScreen: home renders HomeScreen and transitions to intent on New Goal", async () => {
    const goal = createDummyGoal();
    const progress: GoalProgressResult = {
        ok: true,
        kind: "waiting",
        phase: "gathering_context",
        waitingFor: "question",
        goal,
    };
    const controller = new SessionController({
        launcher: {
            launch: async () => progress,
        },
        coordinator: {
            advance: async () => progress,
            resume: async () => progress,
        },
        store: {
            restore: async () => goal,
        },
        catalog: {
            listResumable: async () => [],
        },
        profileId: "p1",
        goalIdGenerator: () => "g1",
        initialScreen: "home",
    });

    const instance = render(<TuiApp controller={controller} />);
    await waitForFrame(instance, /Main Menu:/);
    assert.match(instance.lastFrame() ?? "", /New Goal/);

    // 选中第一项 (New Goal) 并回车
    instance.stdin.write("\r");
    await waitForFrame(instance, /What would you like to accomplish/);
});
