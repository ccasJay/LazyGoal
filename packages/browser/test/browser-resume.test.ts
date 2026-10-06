import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalStore,
    type GoalProgressResult,
} from "../../runtime/src/index";
import {
    BrowserGoalCommandService,
    createBrowserGoalRoutes,
    type BrowserGoalSaveNotifications,
    type BrowserGoalCoordinator,
    type BrowserGoalLauncher,
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

function goalFor(goalId: string, intent: string, status: "created" | "running" | "completed" = "running", sequence = 5): Goal {
    const goal = createGoal({
        ...protocols,
        id: goalId,
        intent,
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: `run-${goalId}`,
        mode: "normal",
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status,
                committedThroughSequence: sequence,
            },
        },
    };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

test("Web 显式恢复：仅在未终态且未活动时受理，按提交边界校验，并复用在途请求", async () => {
    const store = new NotifyingMemoryStore();
    const initialGoal = goalFor("goal-1", "恢复测试", "running", 10);
    await store.save(initialGoal);

    const advanceGate = deferred<GoalProgressResult>();
    let advanceCalled = 0;

    const coordinator: BrowserGoalCoordinator = {
        resume: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        continue: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        enterPlanMode: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        advance: async (ref) => {
            advanceCalled++;
            assert.equal(ref.goalId, "goal-1");
            assert.equal(ref.runId, "run-goal-1");
            return advanceGate.promise;
        },
    };

    const launcher: BrowserGoalLauncher = {
        launch: async () => { throw new Error("not implemented"); },
    };

    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        launcher,
        coordinator,
        profileId: "default",
    });

    // 1. 提交边界过旧或过新均拒绝 stale_recovery
    const staleResult = await service.resume("goal-1", {
        runId: "run-goal-1",
        expectedCommittedThroughSequence: 9, // snapshot 实际是 10
    });
    assert.deepEqual(staleResult, { ok: false, error: "stale_recovery" });
    assert.equal(advanceCalled, 0);

    // 2. 匹配边界成功发起恢复
    const resumePromise = service.resume("goal-1", {
        runId: "run-goal-1",
        expectedCommittedThroughSequence: 10,
    });
    // 等待微任务让 withReservationLock 内设置 activeGoalId
    await new Promise((r) => setImmediate(r));
    assert.equal(service.getActiveGoalId(), "goal-1");

    // 3. 活动期间另一个恢复请求被拒绝 goal_busy
    const busyResult = await service.resume("goal-2", {
        runId: "run-goal-2",
        expectedCommittedThroughSequence: 0,
    });
    assert.deepEqual(busyResult, { ok: false, error: "goal_busy" });

    // 4. 同一 Goal/Run 与边界的在途重试复用 existing: true
    const dupPromise = service.resume("goal-1", {
        runId: "run-goal-1",
        expectedCommittedThroughSequence: 10,
    });

    // 模拟推进产生新快照保存 (sequence 11)
    const updatedGoal = {
        ...initialGoal,
        state: {
            ...initialGoal.state,
            run: {
                ...initialGoal.state.run,
                committedThroughSequence: 11,
            },
        },
    };
    await store.save(updatedGoal);

    const firstResult = await resumePromise;
    assert.deepEqual(firstResult, {
        ok: true,
        goalId: "goal-1",
        runId: "run-goal-1",
        existing: false,
    });

    const dupResult = await dupPromise;
    assert.deepEqual(dupResult, {
        ok: true,
        goalId: "goal-1",
        runId: "run-goal-1",
        existing: true,
    });

    // 完成后释放活动锁
    advanceGate.resolve({ ok: true, kind: "terminal", phase: "executing", goal: updatedGoal });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(service.getActiveGoalId(), undefined);
});

test("Web 显式恢复：终态 Run 拒绝 resume_not_allowed，模型恢复失败时清理活动锁", async () => {
    const store = new NotifyingMemoryStore();
    const completedGoal = goalFor("goal-completed", "已完成", "completed", 5);
    await store.save(completedGoal);

    const coordinator: BrowserGoalCoordinator = {
        resume: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        continue: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        enterPlanMode: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        advance: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
    };

    const launcher: BrowserGoalLauncher = {
        launch: async () => { throw new Error("not implemented"); },
    };

    let modelRestoreSuccess = false;
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        launcher,
        coordinator,
        restoreModelBinding: async () => modelRestoreSuccess,
        profileId: "default",
    });

    // 终态 Run 拒绝
    const terminalResult = await service.resume("goal-completed", {
        runId: "run-goal-completed",
        expectedCommittedThroughSequence: 5,
    });
    assert.deepEqual(terminalResult, { ok: false, error: "resume_not_allowed" });

    // 模型恢复失败
    const runningGoal = goalFor("goal-model-fail", "运行中", "running", 2);
    await store.save(runningGoal);

    const modelFailResult = await service.resume("goal-model-fail", {
        runId: "run-goal-model-fail",
        expectedCommittedThroughSequence: 2,
    });
    assert.deepEqual(modelFailResult, { ok: false, error: "model_restore_failed" });
    assert.equal(service.getActiveGoalId(), undefined);
});

test("POST /api/goals/:goalId/resume 路由校验与错误状态映射", async () => {
    const store = new NotifyingMemoryStore();
    const initialGoal = goalFor("goal-route", "路由测试", "running", 8);
    await store.save(initialGoal);

    const coordinator: BrowserGoalCoordinator = {
        resume: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        continue: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        enterPlanMode: async () => ({ ok: false, error: { code: "RUN_NOT_FOUND", message: "not_supported" } }),
        advance: async () => ({ ok: true, kind: "terminal", phase: "executing", goal: initialGoal }),
    };

    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        launcher: { launch: async () => { throw new Error(); } },
        coordinator,
        profileId: "default",
    });

    const routes = createBrowserGoalRoutes({
        list: async () => [],
        read: async () => undefined,
        create: async () => ({ ok: false, error: "goal_create_failed" }),
        interact: async () => ({ ok: false, error: "interaction_failed" }),
        message: async () => ({ ok: false, error: "message_failed" }),
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        resume: (goalId, cmd) => service.resume(goalId, cmd),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        openStream: async () => ({ ok: false, error: "goal_not_found" }),
    });

    // 1. 非法输入 400
    const badRes = await routes.request("/api/goals/goal-route/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "bad", expectedCommittedThroughSequence: -1 }),
    });
    assert.equal(badRes.status, 400);

    // 2. 边界不匹配 409 stale_recovery
    const staleRes = await routes.request("/api/goals/goal-route/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-goal-route", expectedCommittedThroughSequence: 1 }),
    });
    assert.equal(staleRes.status, 409);
    const staleBody = await staleRes.json() as { error: string };
    assert.equal(staleBody.error, "stale_recovery");
});
