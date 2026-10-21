import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
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

class MemoryStore implements GoalStore {
    private readonly goals = new Map<string, Goal>();

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }
}

function goalAwaitingAction(goalId: string): Goal {
    const goal = createGoal({
        ...protocols,
        id: goalId,
        intent: "审批 Action",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: `run-${goalId}`,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingAction: {
                    action: { actionId: "action-1", toolId: "write_file", input: { path: "a.txt", content: "private" } },
                    status: "awaiting_approval",
                },
            },
        },
    };
}

test("完整 Action 详情只对当前等待中的 Goal/Run/Action 身份开放", async () => {
    const goal = goalAwaitingAction("goal-action-details-1");
    const fullInput = { path: "a.txt", content: "private complete content", metadata: { mode: 0o600 } };
    const waitingGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                pendingAction: {
                    action: { actionId: "action-1", toolId: "write_file", input: fullInput },
                    status: "awaiting_approval",
                },
            },
        },
    };
    const store = new MemoryStore();
    await store.save(waitingGoal);
    const service = new BrowserGoalCommandService({
        store,
        coordinator: {
            async enterPlanMode() { throw new Error("plan mode is not used here"); },
        },
    });

    assert.deepEqual(await service.readActionDetails(
        waitingGoal.id,
        waitingGoal.state.run.id,
        "action-1",
    ), {
        ok: true,
        goalId: waitingGoal.id,
        runId: waitingGoal.state.run.id,
        actionId: "action-1",
        toolId: "write_file",
        input: fullInput,
    });
    assert.deepEqual(await service.readActionDetails(waitingGoal.id, "stale-run", "action-1"), {
        ok: false,
        error: "stale_run",
    });
    assert.deepEqual(await service.readActionDetails(waitingGoal.id, waitingGoal.state.run.id, "stale-action"), {
        ok: false,
        error: "action_not_waiting",
    });

    await store.save({
        ...waitingGoal,
        state: { ...waitingGoal.state, run: { ...waitingGoal.state.run, status: "running" } },
    });
    assert.deepEqual(await service.readActionDetails(waitingGoal.id, waitingGoal.state.run.id, "action-1"), {
        ok: false,
        error: "action_not_waiting",
    });
});

/** 只挂载 Action 详情读取的最小 Goal API。 */
function actionDetailsPort(readActionDetails: NonNullable<BrowserGoalApiPort["readActionDetails"]>): BrowserGoalApiPort {
    return {
        list: async () => [],
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        readActionDetails,
    };
}

test("Action 详情路由验证身份参数并只返回服务端授权读取结果", async () => {
    const requests: string[] = [];
    const routes = createBrowserGoalRoutes(actionDetailsPort(async (goalId, runId, actionId) => {
        requests.push(`${goalId}:${runId}:${actionId}`);
        return runId === "run-old"
            ? { ok: false, error: "stale_run" }
            : {
                ok: true,
                goalId,
                runId,
                actionId,
                toolId: "write_file",
                input: { path: "src/a.ts", content: "private" },
            };
    }));

    const details = await routes.request("http://localhost/api/goals/goal-1/actions/action-1?runId=run-1");
    assert.equal(details.status, 200);
    assert.deepEqual(await details.json(), {
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        actionId: "action-1",
        toolId: "write_file",
        input: { path: "src/a.ts", content: "private" },
    });
    const stale = await routes.request("http://localhost/api/goals/goal-1/actions/action-1?runId=run-old");
    assert.equal(stale.status, 409);
    const invalid = await routes.request("http://localhost/api/goals/goal%20bad/actions/action-1?runId=run-1");
    assert.equal(invalid.status, 400);
    assert.deepEqual(requests, ["goal-1:run-1:action-1", "goal-1:run-old:action-1"]);
});

test("Action 详情路由在未接线时返回稳定不可用码", async () => {
    const routes = createBrowserGoalRoutes(actionDetailsPort(async () => ({ ok: false, error: "action_not_waiting" })));
    const response = await routes.request("http://localhost/api/goals/goal-1/actions/action-1?runId=run-1");
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "action_not_waiting" });
});
