import assert from "node:assert/strict";
import { test } from "node:test";

import { createBrowserGoalRoutes, type BrowserGoalApiPort } from "../src/index";

function port(): BrowserGoalApiPort {
    return {
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        setArchived: async (goalId, archived) => goalId === "missing" ? { ok: false, error: "goal_not_found" }
            : archived ? { ok: true } : { ok: false, error: "goal_not_terminal" },
        deleteGoal: async (goalId) => goalId === "terminal" ? { ok: true }
            : { ok: false, error: "goal_not_terminal" },
        revokePermissionExemption: async () => ({ ok: false as const, error: "service_shutting_down" as const }),
    };
}

test("Goal 管理路由校验输入并区分成功、缺失与非终态", async () => {
    const routes = createBrowserGoalRoutes(port());
    const archive = (id: string, body: unknown) => routes.request(`/api/goals/${id}/archive`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await archive("terminal", { archived: true })).status, 200);
    assert.equal((await archive("terminal", { archived: false })).status, 409);
    assert.equal((await archive("missing", { archived: true })).status, 404);
    assert.equal((await archive("terminal", { archived: "yes" })).status, 400);
    assert.equal((await routes.request("/api/goals/terminal", { method: "DELETE" })).status, 200);
    assert.equal((await routes.request("/api/goals/running", { method: "DELETE" })).status, 409);
    const revoke = await routes.request("/api/goals/terminal/exemptions/exemption-1", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1" }),
    });
    assert.equal(revoke.status, 503);
    assert.deepEqual(await revoke.json(), { error: "service_shutting_down" });
});

test("豁免撤销只从路径读取 exemptionId 并剥离请求体同名字段", async () => {
    let received: { readonly runId: string; readonly exemptionId: string } | undefined;
    const api = port();
    const routes = createBrowserGoalRoutes({
        ...api,
        revokePermissionExemption: async (_goalId, command) => {
            received = command;
            return { ok: false, error: "service_shutting_down" };
        },
    });
    const revoke = (body: unknown) => routes.request("/api/goals/terminal/exemptions/exemption-1", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    assert.equal((await revoke({ runId: "run-1", exemptionId: "body-value" })).status, 503);
    assert.deepEqual(received, { runId: "run-1", exemptionId: "exemption-1" });
    assert.equal((await revoke({})).status, 400);
    assert.equal((await revoke({ runId: "" })).status, 400);
    assert.equal((await revoke({ runId: 1 })).status, 400);
});
