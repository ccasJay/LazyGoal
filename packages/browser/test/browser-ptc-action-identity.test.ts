import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createBrowserGoalRoutes,
    type BrowserGoalApiPort,
} from "../src/index";

/**
 * PTC 子操作身份在浏览器 wire 上的可寻址性回归。
 *
 * @remarks
 * PTC 子调用以 `父程序身份:调用序号` 作为自身 Action 身份。wire 必须原样承载
 * 这一真实身份：交互详情、Action 详情与交互决定都不能因为身份含分隔符而拒绝
 * 当前真实等待，也不能把它截断成父程序身份。
 */

const CHILD_ACTION_ID = "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c:0";
const CHILD_INTERACTION_ID = `action_approval:${CHILD_ACTION_ID}`;

/** 构造只承载被测读端口的 Goal API。 */
function createApi(port: Partial<BrowserGoalApiPort>): BrowserGoalApiPort {
    return {
        list: async () => [],
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        ...port,
    };
}

test("交互详情按 PTC 子操作身份寻址，并原样转发该身份", async () => {
    const requests: string[] = [];
    const routes = createBrowserGoalRoutes(createApi({
        readInteractionDetails: async (goalId, runId, interactionId) => {
            requests.push(`${goalId}:${runId}:${interactionId}`);
            return {
                ok: true,
                goalId,
                runId,
                interactionId,
                detail: {
                    kind: "action_approval",
                    actionId: CHILD_ACTION_ID,
                    toolId: "write_file",
                    input: { path: "a.txt", content: "original" },
                    parentProgram: { actionId: "call-program", callNumber: 1 },
                },
            };
        },
    }));

    const response = await routes.request(
        `http://localhost/api/goals/goal-1/interaction-details?runId=run-1&interactionId=${encodeURIComponent(CHILD_INTERACTION_ID)}`,
    );
    assert.equal(response.status, 200);
    const body = await response.json() as {
        readonly detail: {
            readonly actionId: string;
            readonly parentProgram?: { readonly actionId: string; readonly callNumber: number };
        };
    };
    assert.equal(body.detail.actionId, CHILD_ACTION_ID);
    assert.equal(body.detail.parentProgram?.actionId, "call-program");
    assert.equal(body.detail.parentProgram?.callNumber, 1);
    assert.deepEqual(requests, [`goal-1:run-1:${CHILD_INTERACTION_ID}`]);
});

test("Action 详情按 PTC 子操作身份寻址，并原样转发该身份", async () => {
    const requests: string[] = [];
    const routes = createBrowserGoalRoutes(createApi({
        readActionDetails: async (goalId, runId, actionId) => {
            requests.push(`${goalId}:${runId}:${actionId}`);
            return {
                ok: true,
                goalId,
                runId,
                actionId,
                toolId: "write_file",
                input: { path: "a.txt", content: "original" },
            };
        },
    }));

    const response = await routes.request(
        `http://localhost/api/goals/goal-1/actions/${encodeURIComponent(CHILD_ACTION_ID)}?runId=run-1`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(requests, [`goal-1:run-1:${CHILD_ACTION_ID}`]);
});

test("Action 类交互决定以 PTC 子操作身份作为请求引用时被 wire 接受", async () => {
    const routes = createBrowserGoalRoutes(createApi({}));
    const response = await routes.request("/api/goals/goal-1/inputs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            kind: "respond",
            inputId: "input-1",
            runId: "run-1",
            requestId: CHILD_ACTION_ID,
            response: { kind: "approve_action", actionId: CHILD_ACTION_ID },
        }),
    });
    // 请求已通过 wire 校验；缺会话端口时由会话层给出稳定不可用码。
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "session_unavailable" });
});

test("问答类交互决定仍只接受普通 wire 身份", async () => {
    const routes = createBrowserGoalRoutes(createApi({}));
    const response = await routes.request("/api/goals/goal-1/inputs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            kind: "respond",
            inputId: "input-1",
            runId: "run-1",
            requestId: CHILD_ACTION_ID,
            response: { kind: "answer_ask_user", answers: { source: "a" } },
        }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "INVALID_INPUT" });
});
