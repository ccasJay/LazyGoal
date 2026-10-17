import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm/src/core/adapter";
import { createGoal } from "../../../packages/runtime/src/index";
import { createBrowserSessionAccess } from "../../../packages/browser/src/index";
import { JsonFileModelPreferenceStore } from "../../../packages/storage/src/index";
import { runServerSession } from "../src/cli";
import { createCompositionRoot } from "../src/composition-root";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 5_000); }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

function fixtureGoal(
    id: string,
    root: Awaited<ReturnType<typeof createCompositionRoot>>,
    status: "running" | "completed",
) {
    const goal = createGoal({
        id,
        intent: "Integration fixture",
        runId: `run-${id}`,
        profile: root.profile,
        modelSelection: root.defaultModelSelection,
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status,
                committedThroughSequence: 0,
                ...(status === "completed" ? {
                    stepCount: 1,
                    lastStep: {
                        kind: "decision" as const,
                        result: { kind: "complete" as const, summary: "Fixture complete", evidenceSequences: [] },
                    },
                } : {}),
            },
        },
    };
}

/** 轮询等待持久化事实满足条件；仅用于真实服务路径的确定性收敛。 */
async function waitForGoal(
    root: Awaited<ReturnType<typeof createCompositionRoot>>,
    goalId: string,
    predicate: (goal: { readonly state: { readonly run: { readonly status: string } } }) => boolean,
): Promise<void> {
    for (let attempt = 0; attempt < 250; attempt++) {
        const goal = await root.workspaceGoalStore.restore(goalId);
        if (goal !== undefined && predicate(goal as { readonly state: { readonly run: { readonly status: string } } })) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Goal ${goalId} did not reach the expected state`);
}

test("真实服务路径：断连与 SSE 关闭不取消执行，busy/旧 Run 拒绝，权限、归档删除与历史指标可用", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-browser-session-"));
    const access = createBrowserSessionAccess();
    const modelStarted = deferred<void>();
    const releaseModel = deferred<void>();
    let modelCallCount = 0;
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let serving: Promise<number> | undefined;

    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(_request: LLMRequest): Promise<LLMResponse> {
            modelCallCount += 1;
            modelStarted.resolve(undefined);
            await releaseModel.promise;
            return {
                content: "",
                toolCalls: [{
                    callId: "fixture-wait",
                    toolId: "system_wait_for_input",
                    argumentsJson: JSON.stringify({ reason: "等待用户确认" }),
                }],
            };
        },
    };

    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory: join(workspace, "data"),
            env: { LAZYGOAL_HOME: join(workspace, "home") },
            profile: { id: "integration", systemPrompt: "Use the supplied deterministic response.", instructions: [], toolIds: [] },
            adapter,
            httpMiddleware: access.middleware,
            exitPort: { exit() {} },
        });
        await root.checkpointStore.save(fixtureGoal("disconnect-target", root, "running"));
        await root.checkpointStore.save(fixtureGoal("busy-target", root, "running"));
        await root.checkpointStore.save(fixtureGoal("archive-target", root, "completed"));

        const launchReady = deferred<string>();
        serving = runServerSession(root, access, (url) => launchReady.resolve(url));
        const launchUrl = new URL(await withTimeout(launchReady.promise, "Web server did not start"));
        const origin = launchUrl.origin;
        const token = launchUrl.hash.slice(1);
        const request = async (path: string, method: string, body?: unknown, signal?: AbortSignal) => {
            const response = await fetch(`${origin}${path}`, {
                method,
                headers: {
                    authorization: `Bearer ${token}`,
                    origin,
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                ...(signal === undefined ? {} : { signal }),
            });
            const text = await response.text();
            return { status: response.status, body: text.length === 0 ? {} : JSON.parse(text) as Record<string, any> };
        };

        // 受理后模型阻塞：执行已进入 Runtime。
        const accepted = await request("/api/goals/disconnect-target/resume", "POST", {
            runId: "run-disconnect-target",
            expectedCommittedThroughSequence: 0,
        });
        assert.equal(accepted.status, 202);
        await withTimeout(modelStarted.promise, "Coordinator did not call the model");

        // 另一 Goal 的冲突推进明确拒绝；同一命令的稳定身份重试返回既有受理结果。
        const busy = await request("/api/goals/busy-target/resume", "POST", {
            runId: "run-busy-target",
            expectedCommittedThroughSequence: 0,
        });
        assert.equal(busy.status, 409);
        assert.equal(busy.body.error, "goal_busy");
        const retried = await request("/api/goals/disconnect-target/resume", "POST", {
            runId: "run-disconnect-target",
            expectedCommittedThroughSequence: 0,
        });
        assert.equal(retried.status, 200);
        assert.equal(retried.body.existing, true);
        assert.equal(retried.body.runId, "run-disconnect-target");

        // SSE 订阅成功后由客户端断开，以及普通读取请求中途断连，都不取消已受理执行。
        const streamController = new AbortController();
        const stream = await fetch(`${origin}/api/goals/disconnect-target/events?runId=run-disconnect-target`, {
            headers: { authorization: `Bearer ${token}`, origin },
            signal: streamController.signal,
        });
        assert.equal(stream.status, 200);
        streamController.abort();
        await stream.body?.cancel().catch(() => undefined);

        const readController = new AbortController();
        const abortedRead = fetch(`${origin}/api/goals/disconnect-target`, {
            headers: { authorization: `Bearer ${token}`, origin },
            signal: readController.signal,
        }).catch(() => undefined);
        readController.abort();
        await abortedRead;

        releaseModel.resolve(undefined);
        await waitForGoal(root, "disconnect-target", (goal) => goal.state.run.status === "waiting");
        assert.equal(modelCallCount, 1);

        // 结算后旧 Run 身份明确拒绝。
        const stale = await request("/api/goals/disconnect-target/resume", "POST", {
            runId: "run-other",
            expectedCommittedThroughSequence: 0,
        });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.error, "stale_run");

        // 权限模式读取与写入走真实服务路径。
        const permissionMode = await request("/api/project/permission-mode", "GET");
        assert.equal(permissionMode.status, 200);
        assert.equal(permissionMode.body.mode, "default");
        const setMode = await request("/api/project/permission-mode", "POST", { mode: "yolo", expectedRevision: 0 });
        assert.equal(setMode.status, 200);
        assert.equal(setMode.body.mode, "yolo");

        // 授权查询与撤销路径可调用；未知授权按现有规则稳定拒绝。
        const grants = await request("/api/goals/disconnect-target/grants?runId=run-disconnect-target", "GET");
        assert.equal(grants.status, 200);
        assert.equal(grants.body.ok, true);
        const revoke = await request("/api/goals/disconnect-target/grants/unknown-grant", "DELETE", {
            runId: "run-disconnect-target",
            scope: "goal",
        });
        assert.equal(revoke.status, 500);
        assert.equal(revoke.body.error, "grant_failed");

        // 历史、轨迹与指标读取。
        const history = await request("/api/goals", "GET");
        assert.equal(history.status, 200);
        assert.ok((history.body.goals as Array<Record<string, any>>).some((goal) => goal.goalId === "disconnect-target"));
        const runs = await request("/api/goals/disconnect-target/trajectory/runs", "GET");
        assert.equal(runs.status, 200);
        const metrics = await request("/goals/disconnect-target/metrics", "GET");
        assert.equal(metrics.status, 200);

        // 终态归档与删除走真实服务路径。
        const archive = await request("/api/goals/archive-target/archive", "POST", { archived: true });
        assert.equal(archive.status, 200);
        assert.equal(archive.body.ok, true);
        const archivedList = await request("/api/goals", "GET");
        const archivedItem = (archivedList.body.goals as Array<Record<string, any>>).find((goal) => goal.goalId === "archive-target");
        assert.equal(archivedItem?.archived, true);
        const deleted = await request("/api/goals/archive-target", "DELETE", { expectedRunId: "run-archive-target", expectedCommittedThroughSequence: 0 });
        assert.equal(deleted.status, 200);
        assert.equal(deleted.body.ok, true);
        const missing = await request("/api/goals/archive-target", "GET");
        assert.equal(missing.status, 404);

        // SIGINT 释放应用资源：退出码 130 且 HTTP 不再监听。
        process.emit("SIGINT");
        assert.equal(await serving, 130);
        serving = undefined;
        await assert.rejects(fetch(`${origin}/api/goals`, {
            headers: { authorization: `Bearer ${token}`, origin },
        }));
    } finally {
        releaseModel.resolve(undefined);
        if (serving !== undefined) {
            process.emit("SIGINT");
            await serving.catch(() => undefined);
        }
        await root?.lifecycle.close().catch(() => undefined);
        await root?.httpService.close().catch(() => undefined);
        await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("真实 Web 服务恢复保留 Coordinator 接收者、展示活动状态并关闭写入入口", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-browser-session-"));
    const access = createBrowserSessionAccess();
    const modelStarted = deferred<void>();
    const releaseModel = deferred<void>();
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let serving: Promise<number> | undefined;

    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(_request: LLMRequest): Promise<LLMResponse> {
            modelStarted.resolve(undefined);
            await releaseModel.promise;
            return {
                content: JSON.stringify({
                    result: {
                        kind: "ask_user",
                        questions: [{
                            header: "Source",
                            question: "Which source should I use?",
                            options: [
                                { label: "First", description: null },
                                { label: "Second", description: null },
                            ],
                            multiSelect: false,
                        }],
                        memoryPatch: null,
                    },
                }),
            };
        },
    };

    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory: join(workspace, "data"),
            env: { LAZYGOAL_HOME: join(workspace, "home") },
            profile: { id: "integration", systemPrompt: "Use the supplied deterministic response.", instructions: [], toolIds: [] },
            adapter,
            httpMiddleware: access.middleware,
            exitPort: { exit() {} },
        });
        await root.checkpointStore.save(fixtureGoal("interrupted", root, "running"));
        await root.checkpointStore.save(fixtureGoal("archive-target", root, "completed"));

        const launchReady = deferred<string>();
        serving = runServerSession(root, access, (url) => launchReady.resolve(url));
        const launchUrl = new URL(await withTimeout(launchReady.promise, "Web server did not start"));
        const origin = launchUrl.origin;
        const token = launchUrl.hash.slice(1);
        const request = async (path: string, method: string, body?: unknown) => {
            const response = await fetch(`${origin}${path}`, {
                method,
                headers: {
                    authorization: `Bearer ${token}`,
                    origin,
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            const text = await response.text();
            return { status: response.status, body: text.length === 0 ? {} : JSON.parse(text) as Record<string, any> };
        };

        const resumed = await request("/api/goals/interrupted/resume", "POST", {
            runId: "run-interrupted",
            expectedCommittedThroughSequence: 0,
        });
        assert.equal(resumed.status, 202);
        assert.equal(resumed.body.runId, "run-interrupted");
        await withTimeout(modelStarted.promise, "Coordinator did not call the model");

        const list = await request("/api/goals", "GET");
        const listItem = (list.body.goals as Array<Record<string, any>>).find((goal) => goal.goalId === "interrupted");
        assert.equal(listItem?.execution.state, "active");
        const session = await request("/api/goals/interrupted", "GET");
        assert.equal(session.body.goal.execution.state, "active");

        root.checkpointStore.freeze();
        root.abortController.abort();
        releaseModel.resolve(undefined);

        const archive = await request("/api/goals/archive-target/archive", "POST", { archived: true });
        assert.equal(archive.status, 503);
        assert.equal(archive.body.error, "service_shutting_down");
        const preference = await request("/api/project/model-preference", "POST", { modelId: "model-after-shutdown" });
        assert.equal(preference.status, 503);
        assert.equal(preference.body.error, "service_shutting_down");
        assert.notEqual(
            (await root.workspaceGoalStore.listHistory!()).find((goal) => goal.goalId === "archive-target")?.archived,
            true,
        );
        assert.equal(await new JsonFileModelPreferenceStore(root.workspaceHomeDirectory).get(), undefined);

        process.emit("SIGINT");
        assert.equal(await serving, 130);
        serving = undefined;
    } finally {
        releaseModel.resolve(undefined);
        if (serving !== undefined) {
            root?.checkpointStore.freeze();
            root?.abortController.abort();
            process.emit("SIGINT");
            await serving.catch(() => undefined);
        }
        if (root !== undefined) {
            root.checkpointStore.freeze();
            root.abortController.abort();
            await root.resources.closeAll().catch(() => undefined);
        }
        await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
