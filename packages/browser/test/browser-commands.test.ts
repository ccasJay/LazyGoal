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

function goalFor(goalId: string, intent: string, mode: "normal" | "plan" = "normal"): Goal {
    return createGoal({
        ...protocols,
        id: goalId,
        intent,
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: `run-${goalId}`,
        mode,
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
        coordinator: {
            async resume() { throw new Error("interaction is not used in this case"); },
            async continue() { throw new Error("messages are not used in this case"); },
            async enterPlanMode() { throw new Error("plan mode is not used in this case"); },
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
    assert.deepEqual(await service.create({ ...command, mode: "plan" }), {
        ok: false,
        error: "goal_id_conflict",
    });
    assert.deepEqual(launched, ["goal-create-1"]);

    releaseLauncher.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(await service.create(command), { ...first, existing: true });
    assert.deepEqual(await service.create({ ...command, mode: "plan" }), {
        ok: false,
        error: "goal_id_conflict",
    });
    assert.deepEqual(launched, ["goal-create-1"]);
});

test("Plan Mode 创建模式传给 Launcher，且 Goal/Run 身份在服务端重新校验", async () => {
    const store = new NotifyingMemoryStore();
    const launches: Array<{ goalId: string; mode: string | undefined }> = [];
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: {
            async launch(request) {
                launches.push({ goalId: request.goalId, mode: request.mode });
                const goal = goalFor(request.goalId, request.intent, request.mode);
                await store.save(goal);
                return terminal(goal);
            },
        },
        coordinator: {
            async resume() { throw new Error("interactions are not used in this case"); },
            async continue() { throw new Error("messages are not used in this case"); },
            async enterPlanMode(ref) {
                const goal = await store.restore(ref.goalId);
                assert.ok(goal);
                if (goal.state.run.id !== ref.runId) {
                    return { ok: false as const, error: { code: "RUN_NOT_FOUND" as const, message: "stale run" } };
                }
                const updated = {
                    ...goal,
                    state: { ...goal.state, run: { ...goal.state.run, mode: "plan" as const } },
                };
                await store.save(updated);
                return { ok: true as const, kind: "terminal" as const, phase: "executing" as const, goal: updated };
            },
        },
    });

    const created = await service.create({ goalId: "goal-plan-created", intent: "显式计划", mode: "plan" });
    assert.deepEqual(created, {
        ok: true,
        goalId: "goal-plan-created",
        runId: "run-goal-plan-created",
        existing: false,
    });
    assert.deepEqual(launches, [{ goalId: "goal-plan-created", mode: "plan" }]);

    assert.deepEqual(await service.enterPlanMode("goal-plan-created", { runId: "stale-run" }), {
        ok: false,
        error: "stale_run",
    });
    assert.deepEqual(await service.enterPlanMode("goal-plan-created", { runId: "run-goal-plan-created" }), {
        ok: true,
        goalId: "goal-plan-created",
        runId: "run-goal-plan-created",
        existing: false,
    });
    assert.equal((await store.restore("goal-plan-created"))?.state.run.mode, "plan");
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
        coordinator: {
            async resume() { throw new Error("interaction is not used in this case"); },
            async continue() { throw new Error("messages are not used in this case"); },
            async enterPlanMode() { throw new Error("plan mode is not used in this case"); },
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
        coordinator: {
            async resume() { throw new Error("interaction is not used in this case"); },
            async continue() { throw new Error("messages are not used in this case"); },
            async enterPlanMode() { throw new Error("plan mode is not used in this case"); },
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

test("草稿模型由服务端验证，创建快照使用已确认选择且冲突重试被拒绝", async () => {
    const store = new NotifyingMemoryStore();
    const selection = {
        provider: "openai",
        modelId: "gpt-selected",
        structuredOutputMode: "two_stage" as const,
        inputEstimator: { kind: "character-v1" as const },
    };
    const launches: Array<string | undefined> = [];
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        defaultModelSelection: { ...selection, modelId: "gpt-default" },
        resolveModelSelection: async (modelId) => modelId === "gpt-selected" ? selection : undefined,
        launcher: {
            async launch(request) {
                launches.push(request.modelSelection?.modelId);
                const base = goalFor(request.goalId, request.intent);
                const goal: Goal = {
                    ...base,
                    state: { ...base.state, modelSelection: request.modelSelection! },
                };
                await store.save(goal);
                return terminal(goal);
            },
        },
        coordinator: {
            async resume() { throw new Error("unused"); },
            async continue() { throw new Error("unused"); },
            async enterPlanMode() { throw new Error("unused"); },
        },
    });
    assert.deepEqual(await service.create({ goalId: "goal-1", intent: "Inspect", modelId: "other" }), {
        ok: false, error: "model_not_selectable",
    });
    assert.deepEqual(launches, []);
    assert.equal((await service.create({ goalId: "goal-1", intent: "Inspect", modelId: "gpt-selected" })).ok, true);
    assert.equal((await store.restore("goal-1"))?.state.modelSelection.modelId, "gpt-selected");
    assert.deepEqual(await service.create({ goalId: "goal-1", intent: "Inspect", modelId: "gpt-default" }), {
        ok: false, error: "goal_id_conflict",
    });
    assert.deepEqual(launches, ["gpt-selected"]);
});

test("省略模型的创建首次冻结偏好，相同 Goal ID 重试不因偏好变化冲突", async () => {
    const store = new NotifyingMemoryStore();
    const first = { provider: "openai", modelId: "model-a", structuredOutputMode: "two_stage" as const, inputEstimator: { kind: "character-v1" as const } };
    const second = { ...first, modelId: "model-b" };
    let preference = first;
    const launches: string[] = [];
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        defaultModelSelection: first,
        resolveDefaultModelSelection: async () => preference,
        launcher: {
            async launch(request) {
                launches.push(request.modelSelection!.modelId);
                const base = goalFor(request.goalId, request.intent);
                const goal: Goal = { ...base, state: { ...base.state, modelSelection: request.modelSelection! } };
                await store.save(goal);
                return terminal(goal);
            },
        },
        coordinator: {
            async resume() { throw new Error("unused"); },
            async continue() { throw new Error("unused"); },
            async enterPlanMode() { throw new Error("unused"); },
        },
    });
    assert.equal((await service.create({ goalId: "goal-1", intent: "Inspect" })).ok, true);
    preference = second;
    assert.deepEqual(await service.create({ goalId: "goal-1", intent: "Inspect" }), {
        ok: true, goalId: "goal-1", runId: "run-goal-1", existing: true,
    });
    assert.deepEqual(launches, ["model-a"]);
});
