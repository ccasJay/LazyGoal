import assert from "node:assert/strict";
import { test } from "node:test";

import { createBrowserGoalRoutes, type BrowserGoalApiPort } from "../src/index";

function port(): BrowserGoalApiPort {
    return {
        list: async () => [],
        read: async () => undefined,
        create: async () => ({ ok: false, error: "goal_create_failed" }),
        interact: async () => ({ ok: false, error: "interaction_failed" }),
        message: async () => ({ ok: false, error: "message_failed" }),
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        openStream: async () => ({ ok: false, error: "goal_not_found" }),
        setArchived: async (goalId, archived) => goalId === "missing" ? { ok: false, error: "goal_not_found" }
            : archived ? { ok: true } : { ok: false, error: "goal_not_terminal" },
        deleteGoal: async (goalId) => goalId === "terminal" ? { ok: true }
            : { ok: false, error: "goal_not_terminal" },
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
});
