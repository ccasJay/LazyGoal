import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, transition, type AgentProfile, type Goal, type GoalStore } from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { BrowserGoalCommandService, readBrowserGoalSession, type BrowserGoalSaveNotifications } from "../src/index";

const profile: AgentProfile = { id: "browser-control", systemPrompt: "test", instructions: [], toolIds: [] };

class Store implements GoalStore, BrowserGoalSaveNotifications {
    constructor(private goal: Goal) {}
    async restore(goalId: string) { return goalId === this.goal.id ? this.goal : undefined; }
    async save(goal: Goal) { this.goal = goal; }
    onSave(_listener: (goal: Goal) => void) { return () => undefined; }
}

test("Browser accepts Steer for the matching running Run and preserves idempotent identity", async () => {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-browser-steer",
        intent: "test browser steer",
        profile,
        runId: "run-browser-steer",
    });
    const started = transition(created.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const goal = { ...created, state: { ...created.state, run: started.state } };
    const store = new Store(goal);
    const accepted: string[] = [];
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: profile.id,
        launcher: { async launch() { throw new Error("not used"); } },
        coordinator: {
            async resume() { throw new Error("not used"); },
            async continue() { throw new Error("not used"); },
            async enterPlanMode() { throw new Error("not used"); },
            async steer(ref, messageId, content) {
                accepted.push(`${ref.runId}:${messageId}:${content}`);
                return { ok: true, goalId: ref.goalId, runId: ref.runId, messageId, existing: false };
            },
        },
    });

    const result = await service.steer(goal.id, {
        runId: goal.state.run.id,
        messageId: "message-1",
        content: "补充要求",
    });
    assert.deepEqual(result, {
        ok: true,
        goalId: goal.id,
        runId: goal.state.run.id,
        messageId: "message-1",
        existing: false,
    });
    assert.deepEqual(accepted, ["run-browser-steer:message-1:补充要求"]);

    assert.deepEqual(await service.steer(goal.id, {
        runId: "stale-run", messageId: "message-2", content: "late",
    }), { ok: false, error: "stale_run" });
});

test("Browser session exposes pending Steer in acceptance order", async () => {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-browser-pending",
        intent: "test pending projection",
        profile,
        runId: "run-browser-pending",
    });
    const withPending = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                steerInputs: [
                    { messageId: "steer-1", status: "pending" as const, content: "first" },
                    { messageId: "steer-2", status: "pending" as const, content: "second" },
                ],
            },
        },
    };
    const store = new Store(withPending);
    const session = await readBrowserGoalSession(withPending.id, store, async () => ({ committed: [], uncommittedTail: [] }));
    assert.deepEqual(session?.pendingSteers, [
        { messageId: "steer-1", content: "first" },
        { messageId: "steer-2", content: "second" },
    ]);
});
