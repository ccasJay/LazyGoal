import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createRun,
    DefaultGoalModelSelectionCoordinator,
    type Goal,
    type GoalModelSelection,
    type GoalStore,
} from "../../runtime/src/index";
import {
    BrowserGoalCommandService,
    createBrowserGoalRoutes,
    type BrowserGoalApiPort,
} from "../src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

class Store implements GoalStore {
    goal: Goal | undefined;
    failSave = false;
    saves = 0;
    private readonly listeners = new Set<(goal: Goal) => void>();

    onSave(listener: (goal: Goal) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goal?.id === goalId ? structuredClone(this.goal) : undefined;
    }

    async save(goal: Goal): Promise<void> {
        if (this.failSave) throw new Error("PRIVATE_STORAGE_DETAIL");
        this.goal = structuredClone(goal);
        this.saves += 1;
        for (const listener of this.listeners) listener(this.goal);
    }
}

function goalFor(status: "waiting" | "completed" | "failed" | "cancelled" = "waiting", pendingAction?: Goal["state"]["run"]["pendingAction"]): Goal {
    const base = createGoal({
        ...protocols,
        id: "goal-1",
        intent: "Inspect code",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: "run-1",
        modelSelection: {
            provider: "openai",
            modelId: "gpt-old",
            structuredOutputMode: "two_stage",
            inputEstimator: { kind: "character-v1" },
        },
    });
    return {
        ...base,
        state: {
            ...base.state,
            run: { ...base.state.run, status, ...(pendingAction === undefined ? {} : { pendingAction }) },
        },
    };
}

const chosen: GoalModelSelection = {
    provider: "openai",
    modelId: "gpt-new",
    structuredOutputMode: "two_stage",
    contextWindowTokens: 128000,
    maxOutputTokens: 4096,
    inputEstimator: { kind: "character-v1" },
};

function serviceFor(store: Store, resolve = async (modelId: string, current: GoalModelSelection): Promise<GoalModelSelection | undefined> =>
    modelId === "gpt-new" && current.provider === "openai" ? chosen : undefined,
    restoreModelBinding?: (goal: Goal) => Promise<boolean>,
): BrowserGoalCommandService {
    return new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("unused"); } },
        coordinator: {
            async resume() { throw new Error("unused"); },
            async continue() { throw new Error("unused"); },
            async enterPlanMode() { throw new Error("unused"); },
        },
        modelSelectionCoordinator: new DefaultGoalModelSelectionCoordinator({ store }),
        resolveModelSelection: resolve,
        ...(restoreModelBinding === undefined ? {} : { restoreModelBinding }),
    });
}

test("安全等待点保存服务端目录验证后的模型，旧 Run 与不可选 ID 不改快照", async () => {
    const store = new Store();
    store.goal = goalFor();
    const service = serviceFor(store);
    assert.deepEqual(await service.selectModel("goal-1", { runId: "old", modelId: "gpt-new" }), {
        ok: false, error: "stale_run",
    });
    assert.deepEqual(await service.selectModel("goal-1", { runId: "run-1", modelId: "google/gemini" }), {
        ok: false, error: "model_not_selectable",
    });
    assert.equal(store.saves, 0);
    assert.deepEqual(await service.selectModel("goal-1", { runId: "run-1", modelId: "gpt-new" }), {
        ok: true, goalId: "goal-1", runId: "run-1", modelId: "gpt-new",
    });
    assert.deepEqual(store.goal?.state.modelSelection, chosen);
    assert.equal(store.saves, 1);
});

test("Action 审批和取消态拒绝选模；保存失败保留原选择", async () => {
    const store = new Store();
    store.goal = goalFor("waiting", {
        action: { actionId: "action-1", toolId: "bash", input: { command: "pwd" } },
        status: "awaiting_approval",
    } as Goal["state"]["run"]["pendingAction"]);
    const service = serviceFor(store);
    assert.deepEqual(await service.selectModel("goal-1", { runId: "run-1", modelId: "gpt-new" }), {
        ok: false, error: "model_switch_not_allowed",
    });
    store.goal = goalFor("cancelled");
    assert.deepEqual(await service.selectModel("goal-1", { runId: "run-1", modelId: "gpt-new" }), {
        ok: false, error: "model_switch_not_allowed",
    });
    store.goal = goalFor();
    store.failSave = true;
    assert.deepEqual(await service.selectModel("goal-1", { runId: "run-1", modelId: "gpt-new" }), {
        ok: false, error: "model_selection_failed",
    });
    assert.equal(store.goal.state.modelSelection.modelId, "gpt-old");
});

test("模型提交只接受精确 wire 字段，并隐藏服务端错误内容", async () => {
    const store = new Store();
    store.goal = goalFor();
    const service = serviceFor(store);
    const port: BrowserGoalApiPort = {
        list: async () => [],
        read: async () => undefined,
        create: async () => ({ ok: false, error: "goal_create_failed" }),
        interact: async () => ({ ok: false, error: "interaction_failed" }),
        message: async () => ({ ok: false, error: "message_failed" }),
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: (goalId, command) => service.selectModel(goalId, command),
        openStream: async () => ({ ok: false, error: "goal_not_found" }),
    };
    const route = createBrowserGoalRoutes(port);
    const send = (body: unknown) => route.request("http://localhost/api/goals/goal-1/model-selection", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const invalid = await send({ runId: "run-1", modelId: "gpt-new", provider: "google" });
    assert.equal(invalid.status, 400);
    assert.equal(store.saves, 0);
    store.failSave = true;
    const failed = await send({ runId: "run-1", modelId: "gpt-new" });
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: "model_selection_failed", refresh: false });
});

test("终态预选与下一 Run 串行，下一 Run 继承新选择且旧请求被拒绝", async () => {
    const store = new Store();
    store.goal = goalFor("completed");
    let releaseResolution!: () => void;
    const resolution = new Promise<void>((resolve) => { releaseResolution = resolve; });
    let resolving = false;
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("unused"); } },
        coordinator: {
            async resume() { throw new Error("unused"); },
            async enterPlanMode() { throw new Error("unused"); },
            async continue(ref, content) {
                const goal = await store.restore(ref.goalId);
                assert.ok(goal);
                assert.equal(goal.state.modelSelection.modelId, "gpt-new");
                const updated: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        messages: [...goal.state.messages, { role: "user", content }],
                        completedRuns: [{
                            runId: ref.runId,
                            status: "completed",
                            stepCount: goal.state.run.stepCount,
                            committedThroughSequence: goal.state.run.committedThroughSequence,
                            messageRange: { start: 0, end: goal.state.messages.length },
                        }],
                        run: createRun("run-2"),
                    },
                };
                await store.save(updated);
                return { ok: true as const, kind: "waiting" as const, phase: "executing" as const, waitingFor: "blocked" as const, goal: updated };
            },
        },
        modelSelectionCoordinator: new DefaultGoalModelSelectionCoordinator({ store }),
        resolveModelSelection: async () => {
            resolving = true;
            await resolution;
            return chosen;
        },
    });

    const select = service.selectModel("goal-1", { runId: "run-1", modelId: "gpt-new" });
    while (!resolving) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const next = service.message("goal-1", { runId: "run-1", content: "Continue" });
    releaseResolution();
    assert.equal((await select).ok, true);
    assert.deepEqual(await next, { ok: true, goalId: "goal-1", runId: "run-2", existing: false });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(await service.selectModel("goal-1", { runId: "run-1", modelId: "gpt-new" }), {
        ok: false, error: "stale_run",
    });
    assert.equal(store.goal?.state.modelSelection.modelId, "gpt-new");
});

test("无法重建 Snapshot 模型绑定时不调用 Runtime 推进", async () => {
    const store = new Store();
    store.goal = goalFor();
    const service = serviceFor(store, undefined, async () => false);
    assert.deepEqual(await service.message("goal-1", { runId: "run-1", content: "Continue" }), {
        ok: false, error: "model_restore_failed",
    });
    assert.equal(store.saves, 0);
    assert.equal(store.goal.state.modelSelection.modelId, "gpt-old");

    store.goal = goalFor("waiting", {
        action: { actionId: "action-1", toolId: "bash", input: { command: "pwd" } },
        status: "awaiting_approval",
    } as Goal["state"]["run"]["pendingAction"]);
    assert.deepEqual(await service.interact("goal-1", {
        kind: "reject_action", runId: "run-1", actionId: "action-1", reason: "Stop",
    }), { ok: false, error: "model_restore_failed" });
    assert.equal(store.saves, 0);
});
