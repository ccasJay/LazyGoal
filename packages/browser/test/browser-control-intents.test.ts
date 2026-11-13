import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createBrowserGoalRoutes,
    type BrowserGoalApiPort,
} from "../src/index";

function createApi(overrides: Partial<BrowserGoalApiPort> = {}): BrowserGoalApiPort {
    return {
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async (goalId, command) => ({
            ok: true,
            goalId,
            runId: command.runId,
            existing: false,
        }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        ...overrides,
    };
}

function postControl(api: BrowserGoalApiPort, body: unknown): Promise<Response> {
    const routes = createBrowserGoalRoutes(api);
    return Promise.resolve(routes.request("/api/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }));
}

test("control intent returns a receipt with the client intent identity", async () => {
    const response = await postControl(createApi(), {
        kind: "plan_mode",
        intentId: "intent-plan-1",
        goalId: "goal-1",
        runId: "run-1",
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
        intentId: "intent-plan-1",
        status: "accepted",
        result: { kind: "plan_mode", result: { ok: true, goalId: "goal-1", runId: "run-1", existing: false } },
    });
});

test("control intent reports an unavailable command as a rejected receipt", async () => {
    const response = await postControl(createApi(), {
        kind: "permission_profile",
        intentId: "intent-permission-1",
        profile: { sandbox: "workspace-write", approvals: "on-request", reviewer: "auto_review", writableRoots: [] },
        expectedRevision: 1,
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
        intentId: "intent-permission-1",
        status: "rejected",
        error: "permissions_unavailable",
    });
});

test("session input intent must reuse its input identity", async () => {
    const response = await postControl(createApi(), {
        kind: "session_input",
        intentId: "intent-input-1",
        goalId: "goal-1",
        input: { kind: "message", inputId: "input-1", content: "continue", runId: "run-1" },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        intentId: "intent-input-1",
        status: "rejected",
        error: "intent_id_mismatch",
    });
});

test("invalid control intent is rejected before dispatch", async () => {
    const response = await postControl(createApi(), {
        kind: "not_a_control_intent",
        intentId: "intent-invalid-1",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        intentId: "intent-invalid-1",
        status: "rejected",
        error: "invalid_control_command",
    });
});
