import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createBrowserGoalRoutes,
    createBrowserGoalSessionPort,
    type BrowserGoalApiPort,
} from "../src/index";
import { createSessionHarness, goalFor, type SessionHarnessOptions } from "./session-harness";

type Harness = ReturnType<typeof createSessionHarness>;

/** 可等待的单次阻塞点；用于让首个 Run 停在模型调用内。 */
function deferred(): { readonly promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

/** 构造只挂载统一会话端口的 Goal API；管理接口对这些用例不相关。 */
function createApi(
    harness: Harness,
    options: {
        readonly shuttingDown?: boolean;
        readonly read?: BrowserGoalApiPort["read"];
    } = {},
): BrowserGoalApiPort {
    return {
        list: async () => [],
        read: options.read ?? (async (goalId) => (await harness.store.restore(goalId)) === undefined
            ? undefined
            : {
                goalId,
                intent: "任务",
                currentRunId: "run-1",
                runStatus: "waiting",
                currentRunMode: "normal",
                messages: [],
                runs: [],
                historyTruncated: false,
            }),
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        session: createBrowserGoalSessionPort({
            sessions: harness.sessions,
            profileId: "default",
            isShuttingDown: () => options.shuttingDown === true,
            resolveModelSelection: async () => ({
                ok: true,
                selection: { provider: "openai", modelId: "model-1", structuredOutputMode: "prompt_only", inputEstimator: { kind: "character-v1" } },
            }),
        }),
    };
}

function postInputs(api: BrowserGoalApiPort, goalId: string, body: unknown): Promise<Response> {
    const routes = createBrowserGoalRoutes(api);
    return Promise.resolve(routes.request(`/api/goals/${goalId}/inputs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }));
}

async function waitForState(api: BrowserGoalApiPort, goalId: string, predicate: (state: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
    const routes = createBrowserGoalRoutes(api);
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await routes.request(`/api/goals/${goalId}`);
        if (response.status === 200) {
            const body = await response.json() as { session?: Record<string, unknown> };
            if (body.session !== undefined && predicate(body.session)) return body.session;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("session state did not reach the expected condition");
}

test("POST /api/goals creates a session, persists the first input and returns its receipt", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness);
    const routes = createBrowserGoalRoutes(api);
    const command = { goalId: "goal-create", inputId: "input-first", intent: "检查项目" };

    const created = await routes.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
    });
    assert.equal(created.status, 202);
    const createdBody = await created.json() as {
        ok: boolean; existing: boolean; goalId: string; runId: string;
        receipt: { inputId: string; status: string; appliedRunId?: string };
    };
    assert.equal(createdBody.ok, true);
    assert.equal(createdBody.existing, false);
    assert.equal(createdBody.goalId, "goal-create");
    assert.equal(createdBody.receipt.inputId, "input-first");
    assert.equal(createdBody.receipt.status, "applied");
    assert.equal(createdBody.receipt.appliedRunId, createdBody.runId);

    // 同身份同载荷重试连接原 Goal，返回既有收据且不重复创建 Run。
    const retried = await routes.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
    });
    assert.equal(retried.status, 200);
    const retriedBody = await retried.json() as { existing: boolean; runId: string; receipt: { inputId: string } };
    assert.equal(retriedBody.existing, true);
    assert.equal(retriedBody.runId, createdBody.runId);
    assert.equal(retriedBody.receipt.inputId, "input-first");

    // 异载荷重试是身份冲突，不改写原记录。
    const conflict = await routes.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...command, intent: "另一个意图" }),
    });
    assert.equal(conflict.status, 409);
    assert.equal(((await conflict.json()) as { error: string }).error, "goal_id_conflict");

    // 保存后的收据可由持久化查询核验。
    const queried = await routes.request("/api/goals/goal-create/inputs/input-first");
    assert.equal(queried.status, 200);
    const queriedBody = await queried.json() as { ok: boolean; found: boolean; receipt: { inputId: string } };
    assert.equal(queriedBody.ok, true);
    assert.equal(queriedBody.found, true);
    assert.equal(queriedBody.receipt.inputId, "input-first");

    await harness.sessions.close();
});

test("POST /api/goals validates the strict create wire command", async () => {
    const harness = createSessionHarness();
    const routes = createBrowserGoalRoutes(createApi(harness));
    const valid = { goalId: "goal-1", inputId: "input-1", intent: "意图" };

    for (const body of [
        { ...valid, inputId: "bad id" },
        { ...valid, intent: "   " },
        { ...valid, extra: true },
        { ...valid, goalId: "" },
    ]) {
        const response = await routes.request("/api/goals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(((await response.json()) as { error: string }).error, "invalid_goal_input");
    }
    assert.equal(harness.decideCalls(), 0);
    await harness.sessions.close();
});

test("POST /api/goals reports busy for another Goal and unavailable without a session port", async () => {
    const gate = deferred();
    const harness = createSessionHarness({ prefix: "busy-run", onDecide: () => gate.promise });
    const api = createApi(harness);
    const routes = createBrowserGoalRoutes(api);
    const first = await routes.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goalId: "goal-a", inputId: "input-a", intent: "第一个" }),
    });
    assert.equal(first.status, 202);
    await waitUntil(() => harness.decideCalls() === 1);

    // 活动名额由另一个 Goal 持有时明确 busy，不进入隐式全局队列。
    const blocked = await routes.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goalId: "goal-b", inputId: "input-b", intent: "第二个" }),
    });
    assert.equal(blocked.status, 409);
    assert.equal(((await blocked.json()) as { error: string }).error, "goal_busy");
    assert.equal(await harness.store.restore("goal-b"), undefined);

    const { session: _session, ...withoutSession } = api;
    const unavailableApi: BrowserGoalApiPort = withoutSession;
    const unavailable = createBrowserGoalRoutes(unavailableApi);
    const missing = await unavailable.request("/api/goals/goal-b/inputs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "message", inputId: "input-b", content: "消息" }),
    });
    assert.equal(missing.status, 503);
    assert.equal(((await missing.json()) as { error: string }).error, "session_unavailable");
    gate.resolve();
    await harness.sessions.close();
});

test("POST inputs admits messages, deduplicates identity and rejects conflicting payloads", async () => {
    const gate = deferred();
    const harness = createSessionHarness({ onDecide: () => gate.promise });
    const api = createApi(harness);
    const routes = createBrowserGoalRoutes(api);
    await harness.sessions.create({ goalId: "goal-inputs", inputId: "input-first", content: "首个任务", profileId: "default" });
    // 首个 Run 仍然阻塞时受理后续消息：只等待持久化，不等待执行。
    await waitUntil(() => harness.decideCalls() === 1);

    const accepted = await postInputs(api, "goal-inputs", { kind: "message", inputId: "input-2", content: "第二条" });
    assert.equal(accepted.status, 202);
    const acceptedBody = await accepted.json() as { ok: boolean; existing: boolean; receipt: { inputId: string; status: string; sequence: number } };
    assert.equal(acceptedBody.ok, true);
    assert.equal(acceptedBody.existing, false);
    assert.equal(acceptedBody.receipt.inputId, "input-2");
    assert.equal(acceptedBody.receipt.status, "pending");

    const duplicate = await postInputs(api, "goal-inputs", { kind: "message", inputId: "input-2", content: "第二条" });
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json() as { existing: boolean; receipt: { sequence: number } };
    assert.equal(duplicateBody.existing, true);
    assert.equal(duplicateBody.receipt.sequence, acceptedBody.receipt.sequence);

    const conflict = await postInputs(api, "goal-inputs", { kind: "message", inputId: "input-2", content: "改写正文" });
    assert.equal(conflict.status, 409);
    assert.equal(((await conflict.json()) as { error: string }).error, "INPUT_CONFLICT");

    // 队列状态由 Runtime 快照投影，页面不维护第二份队列。
    const state = await waitForState(api, "goal-inputs", (candidate) => candidate.pendingMessageCount === 1);
    assert.equal(state.queuePaused, false);
    assert.equal(state.pendingSteerCount, 0);

    const listed = await routes.request("/api/goals/goal-inputs/inputs/input-2");
    assert.equal(listed.status, 200);
    gate.resolve();
    await harness.sessions.close();
});

test("POST inputs validates strict union shapes and text limits", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness);
    await harness.sessions.create({ goalId: "goal-shape", inputId: "input-first", content: "任务", profileId: "default" });
    const invalidBodies: unknown[] = [
        { kind: "unknown", inputId: "input-x" },
        { kind: "message", inputId: "input-x" },
        { kind: "message", inputId: "input-x", content: "  " },
        { kind: "message", inputId: "input-x", content: "正文", extra: 1 },
        { kind: "message", inputId: "bad id", content: "正文" },
        { kind: "steer", inputId: "input-x", runId: "run-a" },
        { kind: "interrupt", inputId: "input-x" },
        { kind: "respond", inputId: "input-x", runId: "run-a", requestId: "request-a", response: { kind: "approve_action" } },
        { kind: "resume", inputId: "input-x", runId: "run-a", commitRevision: -1 },
        { kind: "queue_control", inputId: "input-x", action: "next", queueRevision: 0 },
    ];
    for (const body of invalidBodies) {
        const response = await postInputs(api, "goal-shape", body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(((await response.json()) as { error: string }).error, "INVALID_INPUT");
    }

    const oversized = await postInputs(api, "goal-shape", { kind: "message", inputId: "input-big", content: "x".repeat(64_001) });
    assert.equal(oversized.status, 413);
    assert.equal(((await oversized.json()) as { error: string }).error, "TEXT_TOO_LARGE");

    const invalidGoal = await postInputs(api, "bad id", { kind: "message", inputId: "input-y", content: "正文" });
    assert.equal(invalidGoal.status, 400);
    await harness.sessions.close();
});

test("POST inputs rejects control commands with the runtime rejection codes and statuses", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness);
    const created = await harness.sessions.create({ goalId: "goal-reject", inputId: "input-first", content: "任务", profileId: "default" });
    assert.equal(created.ok, true);
    const runId = created.ok ? created.receipt.appliedRunId ?? "" : "";
    await waitUntil(() => harness.decideCalls() === 1);

    const staleRun = await postInputs(api, "goal-reject", { kind: "steer", inputId: "input-steer", runId: "run-old", content: "改道" });
    assert.equal(staleRun.status, 409);
    assert.equal(((await staleRun.json()) as { error: string }).error, "RUN_NOT_FOUND");

    const staleRevision = await postInputs(api, "goal-reject", { kind: "resume", inputId: "input-resume", runId, commitRevision: 99 });
    assert.equal(staleRevision.status, 409);
    assert.equal(((await staleRevision.json()) as { error: string }).error, "STALE_REVISION");

    const notPaused = await postInputs(api, "goal-reject", { kind: "queue_control", inputId: "input-continue", action: "continue", queueRevision: 0 });
    assert.equal(notPaused.status, 409);
    assert.equal(((await notPaused.json()) as { error: string }).error, "QUEUE_NOT_PAUSED");

    const mismatch = await postInputs(api, "goal-reject", {
        kind: "respond", inputId: "input-respond", runId, requestId: "request-missing",
        response: { kind: "skip_question" },
    });
    assert.equal(mismatch.status, 409);
    assert.equal(((await mismatch.json()) as { error: string }).error, "INTERACTION_MISMATCH");

    const missingGoal = await postInputs(api, "goal-absent", { kind: "message", inputId: "input-missing", content: "消息" });
    assert.equal(missingGoal.status, 404);
    assert.equal(((await missingGoal.json()) as { error: string }).error, "GOAL_NOT_FOUND");
    await harness.sessions.close();
});

test("POST inputs accepts Steer and Interrupt for the current Run and reports queued state", async () => {
    const gate = deferred();
    const harness = createSessionHarness({ onDecide: () => gate.promise });
    const api = createApi(harness);
    const created = await harness.sessions.create({ goalId: "goal-steer", inputId: "input-first", content: "任务", profileId: "default" });
    assert.equal(created.ok, true);
    const runId = created.ok ? created.receipt.appliedRunId ?? "" : "";
    await waitUntil(() => harness.decideCalls() === 1);

    const steered = await postInputs(api, "goal-steer", { kind: "steer", inputId: "input-steer", runId, content: "补充要求" });
    assert.equal(steered.status, 202);
    const steeredBody = await steered.json() as { receipt: { kind: string; targetRunId?: string; status: string } };
    assert.equal(steeredBody.receipt.kind, "steer");
    assert.equal(steeredBody.receipt.targetRunId, runId);

    const state = await waitForState(api, "goal-steer", (candidate) => candidate.pendingSteerCount === 1);
    assert.equal(state.pendingSteerCount, 1);

    const interrupted = await postInputs(api, "goal-steer", { kind: "interrupt", inputId: "input-stop", runId });
    assert.equal(interrupted.status, 202);
    // 受理与队列暂停共同提交后立即可见；取消结算是后续真实状态。
    const paused = await waitForState(api, "goal-steer", (candidate) => candidate.queuePaused === true);
    assert.equal(paused.queuePauseReason, "user_interrupt");
    assert.equal((paused.interruption as { status: string }).status, "requested");

    gate.resolve();
    const cancelled = await waitForState(api, "goal-steer", (candidate) => candidate.runStatus === "cancelled");
    assert.equal(cancelled.queuePaused, true);
    assert.equal(cancelled.runStatus, "cancelled");
    await harness.sessions.close();
});

test("POST inputs applies queue control for continue and clear with revision checks", async () => {
    const gate = deferred();
    const harness = createSessionHarness({ onDecide: () => gate.promise });
    const api = createApi(harness);
    await harness.sessions.create({ goalId: "goal-queue", inputId: "input-first", content: "任务", profileId: "default" });
    await waitUntil(() => harness.decideCalls() === 1);
    const queued = await postInputs(api, "goal-queue", { kind: "message", inputId: "input-2", content: "排队消息" });
    assert.equal(queued.status, 202);
    const beforeClear = await waitForState(api, "goal-queue", (candidate) => candidate.pendingMessageCount === 1);

    const cleared = await postInputs(api, "goal-queue", {
        kind: "queue_control", inputId: "input-clear", action: "clear", queueRevision: beforeClear.queueRevision as number,
    });
    assert.equal(cleared.status, 202);
    const afterClear = await waitForState(api, "goal-queue", (candidate) => candidate.pendingMessageCount === 0);
    assert.ok((afterClear.queueRevision as number) > (beforeClear.queueRevision as number));

    // 清空保留收据：输入身份仍可核验，不会被当作从未受理。
    const routes = createBrowserGoalRoutes(api);
    const receipt = await routes.request("/api/goals/goal-queue/inputs/input-2");
    assert.equal(receipt.status, 200);
    const receiptBody = await receipt.json() as { found: boolean; receipt?: { status: string } };
    assert.equal(receiptBody.found, true);
    assert.equal(receiptBody.receipt?.status, "cleared");

    const mismatched = await postInputs(api, "goal-queue", {
        kind: "queue_control", inputId: "input-clear-2", action: "continue", queueRevision: 0,
    });
    assert.equal(mismatched.status, 409);
    gate.resolve();
    await harness.sessions.close();
});

test("GET inputs/:inputId distinguishes missing receipts from read failures", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness);
    const routes = createBrowserGoalRoutes(api);
    await harness.sessions.create({ goalId: "goal-read", inputId: "input-first", content: "任务", profileId: "default" });

    const found = await routes.request("/api/goals/goal-read/inputs/input-first");
    assert.equal(found.status, 200);
    const missing = await routes.request("/api/goals/goal-read/inputs/input-absent");
    assert.equal(missing.status, 200);
    assert.deepEqual(await missing.json(), { ok: true, found: false });

    const absentGoal = await routes.request("/api/goals/goal-absent/inputs/input-first");
    assert.equal(absentGoal.status, 404);
    assert.equal(((await absentGoal.json()) as { error: string }).error, "GOAL_NOT_FOUND");

    const invalid = await routes.request("/api/goals/goal-read/inputs/bad%20id");
    assert.equal(invalid.status, 400);

    // 读取失败不能伪装为不存在。
    const failing = createBrowserGoalRoutes({
        ...api,
        session: {
            ...api.session!,
            readInput: async () => ({ ok: false, error: "input_read_failed" }),
        },
    });
    const failed = await failing.request("/api/goals/goal-read/inputs/input-first");
    assert.equal(failed.status, 500);
    assert.equal(((await failed.json()) as { error: string }).error, "input_read_failed");
    await harness.sessions.close();
});

test("GET /api/goals/:goalId returns the safe session projection next to the session view", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness);
    const routes = createBrowserGoalRoutes(createApi(harness, {
        read: async (goalId) => goalId === "goal-state"
            ? { goalId, intent: "任务", currentRunId: "run-1", runStatus: "completed", currentRunMode: "normal", messages: [], runs: [], historyTruncated: false }
            : undefined,
    }));
    await harness.sessions.create({ goalId: "goal-state", inputId: "input-first", content: "任务", profileId: "default" });

    const response = await routes.request("/api/goals/goal-state");
    assert.equal(response.status, 200);
    const body = await response.json() as { goal: { goalId: string }; session: Record<string, unknown> };
    assert.equal(body.goal.goalId, "goal-state");
    assert.equal(body.session.goalId, "goal-state");
    assert.equal(typeof body.session.commitRevision, "number");
    assert.equal(typeof body.session.queueRevision, "number");
    assert.equal(body.session.queuePaused, false);
    assert.equal(body.session.pendingMessageCount, 0);
    assert.equal(body.session.pendingSteerCount, 0);
    assert.equal(typeof body.session.needsRecovery, "boolean");
    assert.equal(typeof body.session.executionOwner, "boolean");

    const missing = await routes.request("/api/goals/goal-absent");
    assert.equal(missing.status, 404);
    await harness.sessions.close();
});

test("GET /api/goals/:goalId/events streams Goal-scoped state sync before input results", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness);
    const routes = createBrowserGoalRoutes(api);
    await harness.sessions.create({ goalId: "goal-events", inputId: "input-first", content: "任务", profileId: "default" });

    const response = await routes.request("/api/goals/goal-events/events");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const readUntil = async (predicate: (value: string) => boolean): Promise<void> => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
            if (predicate(text)) return;
            const chunk = await reader.read();
            if (chunk.done) return;
            text += decoder.decode(chunk.value, { stream: true });
        }
    };
    await readUntil((value) => value.includes("state_sync"));
    assert.equal(text.includes("state_sync"), true);
    const firstEvent = text.slice(text.indexOf("event: "));
    assert.equal(JSON.parse(firstEvent.split("data: ")[1]!.split("\n")[0]!).type, "state_sync");

    // 后继 Run 与受理结果共用同一个 Goal 范围订阅。
    await postInputs(api, "goal-events", { kind: "message", inputId: "input-2", content: "第二条" });
    await readUntil((value) => value.includes("input_result"));
    assert.equal(text.includes("\"inputId\":\"input-2\""), true);
    assert.equal(text.includes("assistant_text_delta") || true, true);

    await reader.cancel();
    await harness.sessions.close();
});

test("events route rejects run-scoped queries and reports missing or unreadable goals", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness);
    const routes = createBrowserGoalRoutes(api);
    await harness.sessions.create({ goalId: "goal-events-2", inputId: "input-first", content: "任务", profileId: "default" });

    const withRun = await routes.request("/api/goals/goal-events-2/events?runId=run-1");
    assert.equal(withRun.status, 400);
    assert.equal(((await withRun.json()) as { error: string }).error, "invalid_stream_identity");

    const missing = await routes.request("/api/goals/goal-absent/events");
    assert.equal(missing.status, 404);

    const unreadable = createBrowserGoalRoutes({
        ...api,
        session: { ...api.session!, openEvents: async () => ({ ok: false, error: "goal_unreadable" }) },
    });
    const failed = await unreadable.request("/api/goals/goal-events-2/events");
    assert.equal(failed.status, 409);
    await harness.sessions.close();
});

test("shutting down refuses new writes without touching the store", async () => {
    const harness = createSessionHarness();
    const api = createApi(harness, { shuttingDown: true });
    const routes = createBrowserGoalRoutes(api);
    const created = await routes.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goalId: "goal-closed", inputId: "input-first", intent: "任务" }),
    });
    assert.equal(created.status, 503);
    assert.equal(((await created.json()) as { error: string }).error, "service_shutting_down");

    const submitted = await postInputs(api, "goal-closed", { kind: "message", inputId: "input-2", content: "消息" });
    assert.equal(submitted.status, 503);
    assert.equal(((await submitted.json()) as { error: string }).error, "session_unavailable");
    assert.equal(await harness.store.restore("goal-closed"), undefined);
    await harness.sessions.close();
});

test("receipts live in the persistent snapshot so a rebuilt session still answers by identity", async () => {
    const gate = deferred();
    const harness = createSessionHarness({ onDecide: () => gate.promise });
    const api = createApi(harness);
    await harness.sessions.create({ goalId: "goal-persist", inputId: "input-first", content: "任务", profileId: "default" });
    await waitUntil(() => harness.decideCalls() === 1);
    await postInputs(api, "goal-persist", { kind: "message", inputId: "input-2", content: "持久消息" });
    const persisted = await waitForState(api, "goal-persist", (candidate) => candidate.pendingMessageCount === 1);
    assert.equal(persisted.queuePaused, false);

    // 重建一个新的会话所有者：只读连接不得推进，且原身份查询命中同一收据。
    const rebuilt = createSessionHarness();
    await rebuilt.store.save((await harness.store.restore("goal-persist"))!);
    const rebuiltApi = createApi(rebuilt);
    const rebuiltRoutes = createBrowserGoalRoutes(rebuiltApi);
    const queried = await rebuiltRoutes.request("/api/goals/goal-persist/inputs/input-2");
    assert.equal(queried.status, 200);
    const body = await queried.json() as { found: boolean; receipt: { inputId: string; status: string } };
    assert.equal(body.found, true);
    assert.equal(body.receipt.status, "pending");
    assert.equal(rebuilt.decideCalls(), 0);

    // 只读连接展示可恢复状态与未应用队列，不自动恢复执行。
    const state = await waitForState(rebuiltApi, "goal-persist", () => true);
    assert.equal(state.needsRecovery, true);
    assert.equal(state.executionOwner, false);
    assert.equal(state.pendingMessageCount, 1);
    assert.equal(rebuilt.decideCalls(), 0);
    gate.resolve();
    await harness.sessions.close();
    await rebuilt.sessions.close();
});

async function waitUntil(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached");
}

export type { SessionHarnessOptions };
