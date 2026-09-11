import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    parseCliArgs,
    runCli,
} from "../src/cli";
import {
    SessionController,
    type SessionLauncher,
    type SessionCoordinator,
} from "../src/index";
import {
    createGoal,
    type Goal,
    type GoalCatalog,
    type GoalCatalogEntry,
    type GoalProgressResult,
    type GoalStore,
    type LaunchResult,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { writeDefaultProfile } from "./profile-fixture";

class MemoryGoalStore implements GoalStore {
    readonly goals = new Map<string, Goal>();

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
    }
}

class MemoryGoalCatalog implements GoalCatalog {
    constructor(private readonly entries: readonly GoalCatalogEntry[]) {}

    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return this.entries;
    }
}

class FakeLauncher implements SessionLauncher {
    async launch(): Promise<LaunchResult> {
        return { ok: false, error: { code: "PROFILE_NOT_FOUND", message: "fail" } };
    }
}

class FakeCoordinator implements SessionCoordinator {
    async advance(): Promise<GoalProgressResult> {
        return { ok: false, error: { code: "RUN_NOT_FOUND", message: "fail" } };
    }

    async resume(): Promise<GoalProgressResult> {
        return { ok: false, error: { code: "RUN_NOT_FOUND", message: "fail" } };
    }
}

function createTestGoal(id: string, intent: string): Goal {
    const profile = {
        id: "default",
        name: "Default",
        description: "Default",
        systemPrompt: "Default",
        instructions: [],
        toolIds: [],
    };
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent,
        profile,
        runId: `run-${id}`,
    });
}

test("parseCliArgs parses inspect and inspect [goalId] commands", () => {
    assert.deepEqual(parseCliArgs(["inspect"]), { kind: "inspect" });
    assert.deepEqual(parseCliArgs(["inspect", "goal-42"]), {
        kind: "inspect",
        goalId: "goal-42",
    });

    assert.throws(
        () => parseCliArgs(["inspect", "goal-1", "unexpected"]),
        /Invalid command line arguments: Usage: lazygoal inspect \[goalId\]/,
    );
});

test("SessionController openHistory transitions to goal_select with mode: inspect", async () => {
    const entry: GoalCatalogEntry = {
        goalId: "goal-hist-1",
        runId: "run-goal-hist-1",
        intent: "Inspect historical trajectory",
        workflowPhase: "executing",
        runStatus: "completed",
        updatedAt: new Date().toISOString(),
    };
    const store = new MemoryGoalStore();
    const catalog = new MemoryGoalCatalog([entry]);

    const controller = new SessionController({
        launcher: new FakeLauncher(),
        coordinator: new FakeCoordinator(),
        store,
        catalog,
        profileId: "default",
        goalIdGenerator: () => "gen-1",
    });

    await controller.dispatch({ kind: "openHistory" });
    const snapshot = controller.getSnapshot();

    assert.equal(snapshot.screen, "goal_select");
    if (snapshot.screen === "goal_select") {
        assert.equal(snapshot.mode, "inspect");
        assert.equal(snapshot.goals.length, 1);
        assert.equal(snapshot.goals[0]?.goalId, "goal-hist-1");
    }
});

test("SessionController selectGoal in inspect mode restores Goal and opens inspector", async () => {
    const goal = createTestGoal("goal-inspect-select", "Analyze system logs");
    const updatedGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            messages: [
                { role: "user", content: "Analyze system logs" },
                {
                    role: "assistant",
                    assistant: { profileId: "default" },
                    content: "<thought>Checking log files</thought>No errors found.",
                },
            ],
        },
    };

    const store = new MemoryGoalStore();
    await store.save(updatedGoal);

    const entry: GoalCatalogEntry = {
        goalId: "goal-inspect-select",
        runId: "run-goal-inspect-select",
        intent: "Analyze system logs",
        workflowPhase: "executing",
        runStatus: "completed",
        updatedAt: new Date().toISOString(),
    };
    const catalog = new MemoryGoalCatalog([entry]);

    const controller = new SessionController({
        launcher: new FakeLauncher(),
        coordinator: new FakeCoordinator(),
        store,
        catalog,
        profileId: "default",
        goalIdGenerator: () => "gen-1",
    });

    await controller.dispatch({ kind: "openHistory" });
    await controller.dispatch({ kind: "selectGoal", goalId: "goal-inspect-select" });

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.screen, "inspector");
    if (snapshot.screen === "inspector") {
        assert.equal(snapshot.goalId, "goal-inspect-select");
        assert.equal(snapshot.totalSteps, 1);
        assert.equal(snapshot.steps[0]?.reasoning, "Checking log files");
    }
});

test("runCli with inspect non-existent goalId returns error code 1", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-inspect-missing-"));
    try {
        await writeDefaultProfile(workspace);
        const errors: string[] = [];

        const exitCode = await runCli(["inspect", "non-existent-goal"], {
            cwd: workspace,
            env: {
                LLM_PROVIDER: "openai",
                LLM_API_KEY: "test",
                LLM_MODEL: "model",
                LLM_STRUCTURED_OUTPUT_MODE: "strict",
            },
            writeError: (msg) => errors.push(msg),
            render: (() => ({
                unmount: () => {},
                waitUntilExit: async () => {},
            })) as never,
        });

        assert.equal(exitCode, 1);
        assert.ok(errors.some((err) => err.includes("Goal not found: non-existent-goal")));
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});
