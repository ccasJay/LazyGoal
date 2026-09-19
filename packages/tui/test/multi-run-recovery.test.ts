import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
    createGoal,
    transition,
    type AgentProfile,
    type Goal,
    type GoalCatalog,
    type GoalCatalogEntry,
    type GoalProgressResult,
    type LaunchResult,
    type ResumeGoalRequest,
} from "../../runtime/src/index";
import { JsonFileGoalStore } from "../../storage/src/index";
import {
    NotifyingGoalStore,
    SessionController,
    type SessionControllerDependencies,
    type SessionLauncher,
    type SessionCoordinator,
} from "../src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";

const profile: AgentProfile = {
    id: "tui-recovery-profile",
    systemPrompt: "Recover the current Goal Run.",
    instructions: [],
    toolIds: [],
};

function completedGoal(id: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        intent: "首轮输入",
        promptBundleVersion: 1,
        profile,
        runId: "run-1",
    });
    const started = transition(created.state.run, { kind: "start" });
    if (!started.ok) throw new Error(started.error.message);
    const completed = transition(started.state, {
        kind: "decision",
        decision: { kind: "complete", summary: "首轮完成", completionEvidence: [] },
    });
    if (!completed.ok) throw new Error(completed.error.message);
    return {
        ...created,
        state: { ...created.state, run: completed.state },
    };
}

class EmptyCatalog implements GoalCatalog {
    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return [];
    }
}

class NoopLauncher implements SessionLauncher {
    async launch(): Promise<LaunchResult> {
        throw new Error("launch is not used in this recovery test");
    }
}

class PersistThenFailCoordinator implements SessionCoordinator {
    constructor(
        private readonly store: NotifyingGoalStore,
        private readonly nextGoal: Goal,
    ) {}

    async advance(): Promise<GoalProgressResult> {
        throw new Error("advance is not used in this recovery test");
    }

    async resume(_request: ResumeGoalRequest): Promise<GoalProgressResult> {
        throw new Error("resume is not used in this recovery test");
    }

    async continue(): Promise<GoalProgressResult> {
        await this.store.save(this.nextGoal);
        throw new Error("scheduler unavailable after the new Run was committed");
    }
}

test("TUI accepts the committed successor Run after a scheduler failure and ignores the old notification", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-tui-multi-run-recovery-"));
    try {
        const baseStore = new JsonFileGoalStore(join(directory, "goals"));
        const initial = completedGoal("goal-tui-recovery");
        await baseStore.save(initial);
        const notifyingStore = new NotifyingGoalStore(baseStore);
        const { lastStep: _lastStep, ...runWithoutLastStep } = initial.state.run;
        const nextGoal: Goal = {
            ...initial,
            state: {
                ...initial.state,
                messages: [...initial.state.messages, { role: "user", content: "下一轮输入" }],
                completedRuns: [{
                    runId: initial.state.run.id,
                    stepCount: initial.state.run.stepCount,
                    committedThroughSequence: initial.state.run.committedThroughSequence,
                    messageRange: { start: 0, end: initial.state.messages.length },
                }],
                run: {
                    ...runWithoutLastStep,
                    id: "run-2",
                    status: "created",
                    stepCount: 0,
                },
            },
        };
        const coordinator = new PersistThenFailCoordinator(notifyingStore, nextGoal);
        const dependencies: SessionControllerDependencies = {
            launcher: new NoopLauncher(),
            coordinator,
            store: notifyingStore,
            catalog: new EmptyCatalog(),
            profileId: profile.id,
            goalIdGenerator: () => "unused",
            initialGoal: initial,
            notifyingStore,
        };
        const controller = new SessionController(dependencies);

        await controller.dispatch({ kind: "submitMessage", content: "下一轮输入" });
        const afterFailure = controller.getSnapshot();
        assert.equal(afterFailure.screen, "session");
        if (afterFailure.screen !== "session") return;
        assert.equal(afterFailure.goal.state.run.id, "run-2");
        assert.equal(afterFailure.goal.state.run.status, "created");
        assert.ok(afterFailure.error);

        controller.onGoalCommitted(initial);
        const afterLateOldRun = controller.getSnapshot();
        assert.equal(afterLateOldRun.screen, "session");
        if (afterLateOldRun.screen !== "session") return;
        assert.equal(afterLateOldRun.goal.state.run.id, "run-2");
        assert.equal(afterLateOldRun.messages.at(-1)?.content, "下一轮输入");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
