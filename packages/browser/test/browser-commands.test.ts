import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalStore,
    type LaunchResult,
} from "../../runtime/src/index";
import {
    BrowserGoalCommandService,
    type BrowserGoalSaveNotifications,
} from "../src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

class NotifyingMemoryStore implements GoalStore, BrowserGoalSaveNotifications {
    private readonly goals = new Map<string, Goal>();
    private readonly listeners = new Set<(goal: Goal) => void>();

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
        for (const listener of this.listeners) listener(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }

    onSave(listener: (goal: Goal) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

function goalFor(goalId: string, intent: string): Goal {
    return createGoal({
        ...protocols,
        id: goalId,
        intent,
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: `run-${goalId}`,
    });
}

function terminal(goal: Goal): LaunchResult {
    return { ok: true, kind: "terminal", phase: "executing", goal };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

test("稳定 ID 的并发重试只启动一次，活动 Goal 期间拒绝另一个创建", async () => {
    const store = new NotifyingMemoryStore();
    const releaseLauncher = deferred<void>();
    const launched: string[] = [];
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: {
            async launch(request) {
                launched.push(request.goalId);
                const goal = goalFor(request.goalId, request.intent);
                await store.save(goal);
                if (request.goalId === "goal-create-1") await releaseLauncher.promise;
                return terminal(goal);
            },
        },
    });

    const command = { goalId: "goal-create-1", intent: "检查项目" };
    const firstPromise = service.create(command);
    const retryPromise = service.create(command);
    const first = await firstPromise;
    assert.deepEqual(first, {
        ok: true,
        goalId: "goal-create-1",
        runId: "run-goal-create-1",
        existing: false,
    });
    assert.deepEqual(await retryPromise, { ...first, existing: true });
    assert.deepEqual(await service.create({ goalId: "goal-create-2", intent: "另一个 Goal" }), {
        ok: false,
        error: "goal_busy",
    });
    assert.deepEqual(await service.create({ goalId: "goal-create-1", intent: "不同意图" }), {
        ok: false,
        error: "goal_id_conflict",
    });
    assert.deepEqual(launched, ["goal-create-1"]);

    releaseLauncher.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(await service.create(command), { ...first, existing: true });
    assert.deepEqual(launched, ["goal-create-1"]);
});

test("Launcher 在保存初始 Goal 前失败时返回错误且不留下假快照", async () => {
    const store = new NotifyingMemoryStore();
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "missing-profile",
        launcher: {
            async launch(): Promise<LaunchResult> {
                return {
                    ok: false,
                    error: { code: "PROFILE_NOT_FOUND", message: "profile unavailable" },
                };
            },
        },
    });

    assert.deepEqual(await service.create({ goalId: "goal-invalid-1", intent: "测试失败" }), {
        ok: false,
        error: "goal_create_failed",
    });
    assert.equal(await store.restore("goal-invalid-1"), undefined);
});

test("已存在相同 ID 和意图时只返回已有快照，不再次启动 Launcher", async () => {
    const store = new NotifyingMemoryStore();
    const existing = goalFor("goal-existing-1", "原始意图");
    await store.save(existing);
    let launchCount = 0;
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: {
            async launch() {
                launchCount += 1;
                return terminal(existing);
            },
        },
    });

    assert.deepEqual(await service.create({ goalId: existing.id, intent: existing.definition.intent }), {
        ok: true,
        goalId: existing.id,
        runId: existing.state.run.id,
        existing: true,
    });
    assert.deepEqual(await service.create({ goalId: existing.id, intent: "不同意图" }), {
        ok: false,
        error: "goal_id_conflict",
    });
    assert.equal(launchCount, 0);
});
