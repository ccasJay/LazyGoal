import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { createGoal } from "../../../packages/runtime/src/index";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { createBrowserSessionAccess } from "../../../packages/browser/src/index";
import { runServerSession } from "../src/cli";
import { createCompositionRoot } from "../src/composition-root";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 10_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

async function waitFor(predicate: () => boolean | Promise<boolean>, message: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!await predicate()) {
        if (Date.now() >= deadline) throw new Error(message);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

function blockingModelServer(expectedCalls: number): {
    readonly server: Server;
    readonly baseURL: string;
    readonly started: Promise<void>;
    readonly closed: Promise<void>;
    readonly close: () => Promise<void>;
} {
    const started = deferred<void>();
    const closed = deferred<void>();
    let calls = 0;
    let closedResponses = 0;
    const server = createServer((request, response) => {
        if (request.method === "GET" && request.url === "/v1/models") {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ data: ["test-model"] }));
            return;
        }
        if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
            response.writeHead(404);
            response.end();
            return;
        }
        request.resume();
        request.on("end", () => {
            calls += 1;
            if (calls >= expectedCalls) started.resolve(undefined);
            response.writeHead(200, { "content-type": "text/event-stream" });
            response.flushHeaders();
            response.on("close", () => {
                closedResponses += 1;
                if (closedResponses >= expectedCalls) closed.resolve(undefined);
            });
        });
    });
    return {
        server,
        get baseURL() {
            const address = server.address();
            assert.ok(address !== null && typeof address !== "string");
            return `http://127.0.0.1:${address.port}/v1`;
        },
        started: started.promise,
        closed: closed.promise,
        close: async () => {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}

function saveWorkerEnvironment(values: Readonly<Record<string, string>>): () => void {
    const previous = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(values)) {
        previous.set(key, process.env[key]);
        process.env[key] = value;
    }
    return () => {
        for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
}

function fixtureGoal(
    id: string,
    root: Awaited<ReturnType<typeof createCompositionRoot>>,
    status: "running" | "completed",
) {
    const goal = createGoal({
        id,
        intent: "Legacy data fixture",
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

const inactiveAdapter: LLMAdapter = {
    structuredOutputMode: "prompt_only",
    async generate() { throw new Error("This test does not use Supervisor model decisions"); },
};

function createRetryingWorkNameAdapter(): { readonly adapter: LLMAdapter; readonly calls: () => number } {
    let calls = 0;
    return {
        adapter: {
            structuredOutputMode: "strict",
            async generate(request) {
                calls += 1;
                assert.equal(request.structuredOutput?.name, "trigger_name_summary");
                assert.equal(request.messages[1]?.role, "user");
                const submittedText = calls <= 2 ? "Wait until the user cancels this Goal." : "Wait independently for cancellation.";
                assert.equal(request.messages[1]?.content, submittedText);
                if (calls === 1) throw new Error("Injected name-generation failure");
                const name = calls === 2 ? "Wait for user cancellation" : "Wait independently for cancellation";
                return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ name }) }] };
            },
        },
        calls: () => calls,
    };
}

function assertOnlyCreationTimestamp(trigger: { readonly sentAt: string }): void {
    assert.deepEqual(Object.keys(trigger).filter((key) => key.endsWith("At")), ["sentAt"]);
    assert.ok(Number.isFinite(Date.parse(trigger.sentAt)));
}

test("真实 Web 入口使用 Trigger 并行启动 Worker、观察状态、拒绝续聊并安全取消", { timeout: 40_000 }, async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-trigger-browser-"));
    const home = join(workspace, "home");
    const dataDirectory = join(workspace, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(join(home, "agent-profiles"), { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    const modelServer = blockingModelServer(2);
    await new Promise<void>((resolve) => modelServer.server.listen(0, "127.0.0.1", resolve));
    const environment = {
        LAZYGOAL_HOME: home,
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "test-model",
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: modelServer.baseURL,
        LLM_CONTEXT_WINDOW_TOKENS: "16000",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_TOKENIZER_ENCODING: "cl100k_base",
    };
    const restoreEnvironment = saveWorkerEnvironment(environment);
    const profile = {
        id: "default",
        name: "Integration",
        description: "Controlled Worker integration profile",
        systemPrompt: "Follow the test instruction.",
        instructions: ["Wait for the user to stop this Run."],
        toolIds: [],
    };
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({ schemaVersion: 1, ...profile }));
    const access = createBrowserSessionAccess();
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let serving: Promise<number> | undefined;
    let triggerStore: TriggerStore | undefined;
    const nameModel = createRetryingWorkNameAdapter();

    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: environment,
            profile,
            adapter: nameModel.adapter,
            httpMiddleware: access.middleware,
            exitPort: { exit() {} },
        });
        const launchReady = deferred<string>();
        serving = runServerSession(root, access, (url) => launchReady.resolve(url));
        const launchUrl = new URL(await withTimeout(launchReady.promise, "Web server did not start"));
        const origin = launchUrl.origin;
        const token = launchUrl.hash.slice(1);
        const persistedTriggers = new TriggerStore(join(dataDirectory, "triggers.db"));
        triggerStore = persistedTriggers;
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
            return {
                status: response.status,
                body: text.length === 0 || !text.startsWith("{") ? {} : JSON.parse(text) as Record<string, any>,
            };
        };

        const alphaCommand = {
            kind: "create_session",
            intentId: "work-alpha",
            goalId: "goal-alpha",
            inputId: "work-alpha",
            intent: "Wait until the user cancels this Goal.",
            modelId: "test-model",
        } as const;
        const failedName = await request("/api/control", "POST", alphaCommand);
        assert.equal(failedName.status, 500);
        assert.deepEqual(failedName.body, { intentId: "work-alpha", status: "rejected", error: "create_failed" });
        assert.equal(persistedTriggers.read(alphaCommand.inputId), undefined);
        const createAlphaControl = await request("/api/control", "POST", alphaCommand);
        assert.equal(createAlphaControl.status, 202, JSON.stringify(createAlphaControl.body));
        assert.equal(createAlphaControl.body.status, "accepted");
        const createAlpha = { body: createAlphaControl.body.result.result as Record<string, any> };
        assert.equal(createAlpha.body.goalId, "goal-alpha");
        const alphaWork = persistedTriggers.read(alphaCommand.inputId);
        assert.ok(alphaWork !== undefined && alphaWork.type === "work");
        assert.equal(alphaWork.name, "Wait for user cancellation");
        assert.deepEqual(alphaWork.payload, { action: "submitted", material: { kind: "text", text: alphaCommand.intent } });
        assert.deepEqual(Object.keys(alphaWork).sort(), ["id", "name", "payload", "sentAt", "source", "target", "type"]);
        assertOnlyCreationTimestamp(alphaWork);
        const repeatedCreateAlpha = await request("/api/goals", "POST", {
            goalId: alphaCommand.goalId,
            inputId: alphaCommand.inputId,
            intent: alphaCommand.intent,
            modelId: alphaCommand.modelId,
        });
        assert.equal(repeatedCreateAlpha.status, 409, JSON.stringify(repeatedCreateAlpha.body));
        assert.equal(repeatedCreateAlpha.body.error, "input_conflict");
        assert.equal(nameModel.calls(), 2);
        const betaCommand = {
            kind: "create_session",
            intentId: "work-beta",
            goalId: "goal-beta",
            inputId: "work-beta",
            intent: "Wait independently for cancellation.",
            modelId: "test-model",
        } as const;
        const createBetaControl = await request("/api/control", "POST", betaCommand);
        assert.equal(createBetaControl.status, 202, JSON.stringify(createBetaControl.body));
        assert.equal(createBetaControl.body.status, "accepted");
        const createBeta = { body: createBetaControl.body.result.result as Record<string, any> };
        const betaWork = persistedTriggers.read(betaCommand.inputId);
        assert.ok(betaWork !== undefined && betaWork.type === "work");
        assert.equal(betaWork.name, "Wait independently for cancellation");
        assert.equal(nameModel.calls(), 3);
        await withTimeout(modelServer.started, "Both independent Workers did not enter the model", 15_000);

        const list = await request("/api/goals", "GET");
        assert.equal(list.status, 200);
        const listGoals = list.body.goals as Array<Record<string, any>>;
        for (const goalId of ["goal-alpha", "goal-beta"]) {
            assert.equal(listGoals.find((goal) => goal.goalId === goalId)?.execution.state, "active");
            const detail = await request(`/api/goals/${goalId}`, "GET");
            assert.equal(detail.status, 200);
            assert.equal(detail.body.goal.execution.state, "active");
            assert.equal(detail.body.session.executionOwner, true);
        }

        const stream = await fetch(`${origin}/api/goals/goal-alpha/events`, {
            headers: { authorization: `Bearer ${token}`, origin },
        });
        assert.equal(stream.status, 200);
        const reader = stream.body?.getReader();
        assert.ok(reader);
        const firstEvent = await withTimeout(reader.read(), "Goal event stream did not synchronize");
        assert.equal(firstEvent.done, false);
        assert.match(new TextDecoder().decode(firstEvent.value), /"type":"state_sync"/);
        await reader.cancel().catch(() => undefined);

        const unsupportedMessage = await request("/api/goals/goal-alpha/inputs", "POST", {
            kind: "message",
            inputId: "follow-up-alpha",
            content: "Continue the Goal with another message.",
        });
        assert.equal(unsupportedMessage.status, 409);
        assert.equal(unsupportedMessage.body.error, "RUN_CONTROL_UNAVAILABLE");
        const unchangedAfterUnsupportedMessage = await request("/api/goals/goal-alpha", "GET");
        assert.equal(unchangedAfterUnsupportedMessage.status, 200);
        assert.equal(unchangedAfterUnsupportedMessage.body.goal.currentRunId, createAlpha.body.runId);
        assert.deepEqual(unchangedAfterUnsupportedMessage.body.goal.pendingMessages ?? [], []);
        assert.equal(unchangedAfterUnsupportedMessage.body.goal.messages.some((message: { content: string }) =>
            message.content === "Continue the Goal with another message."), false);

        const stopAlpha = await request("/api/goals/goal-alpha/inputs", "POST", {
            kind: "interrupt",
            inputId: "cancel-alpha",
            runId: createAlpha.body.runId,
        });
        assert.equal(stopAlpha.status, 202, JSON.stringify(stopAlpha.body));
        const cancelAlpha = persistedTriggers.read("cancel-alpha");
        assert.ok(cancelAlpha !== undefined && cancelAlpha.type === "instruction");
        assert.equal(cancelAlpha.name, "Cancel Goal run");
        assert.deepEqual(cancelAlpha.payload, { action: "cancel", runId: createAlpha.body.runId });
        assertOnlyCreationTimestamp(cancelAlpha);
        const stopBeta = await request("/api/goals/goal-beta/inputs", "POST", {
            kind: "interrupt",
            inputId: "cancel-beta",
            runId: createBeta.body.runId,
        });
        assert.equal(stopBeta.status, 202, JSON.stringify(stopBeta.body));
        await withTimeout(modelServer.closed, "Worker model requests did not stop", 15_000);
        await waitFor(async () => {
            const [alpha, beta] = await Promise.all([
                root!.workspaceGoalStore.restore("goal-alpha"),
                root!.workspaceGoalStore.restore("goal-beta"),
            ]);
            return alpha?.state.run.status === "cancelled" && beta?.state.run.status === "cancelled";
        }, "Cancelled Goal snapshots did not persist");

        const stopped = await request("/api/goals/goal-alpha", "GET");
        assert.equal(stopped.body.goal.runStatus, "cancelled");
        assert.equal(stopped.body.goal.execution.state, "inactive");
        const permissionMode = await request("/api/project/permission-mode", "GET");
        assert.equal(permissionMode.status, 200);
        assert.equal(permissionMode.body.mode, "default");
        const setMode = await request("/api/project/permission-mode", "POST", { mode: "yolo", expectedRevision: 0 });
        assert.equal(setMode.status, 200);
        const grants = await request(`/api/goals/goal-alpha/grants?runId=${String(createAlpha.body.runId)}`, "GET");
        assert.equal(grants.status, 200);
        const history = await request("/api/goals", "GET");
        assert.ok((history.body.goals as Array<Record<string, any>>).some((goal) => goal.goalId === "goal-alpha"));
        const runs = await request("/api/goals/goal-alpha/trajectory/runs", "GET");
        assert.equal(runs.status, 200);
        const metrics = await request("/goals/goal-alpha/metrics", "GET");
        assert.equal(metrics.status, 200);

        await root.checkpointStore.save(fixtureGoal("archive-target", root, "completed"));
        const archive = await request("/api/goals/archive-target/archive", "POST", { archived: true });
        assert.equal(archive.status, 200);
        assert.equal(archive.body.ok, true);
        const deleted = await request("/api/goals/archive-target", "DELETE", {
            expectedRunId: "run-archive-target",
            expectedCommittedThroughSequence: 0,
        });
        assert.equal(deleted.status, 200);
        assert.equal(deleted.body.ok, true);

        process.emit("SIGINT");
        assert.equal(await serving, 130);
        serving = undefined;
    } finally {
        if (serving !== undefined) {
            process.emit("SIGINT");
            await serving.catch(() => undefined);
        }
        triggerStore?.close();
        await root?.lifecycle.close().catch(() => undefined);
        await root?.httpService.close().catch(() => undefined);
        await modelServer.close();
        restoreEnvironment();
        await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("旧的运行中快照保留但不经旧执行链恢复", { timeout: 20_000 }, async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-trigger-old-data-"));
    const home = join(workspace, "home");
    const dataDirectory = join(workspace, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(join(home, "agent-profiles"), { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    const environment = {
        LAZYGOAL_HOME: home,
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o-mini",
        LLM_API_KEY: "test-key",
    };
    const access = createBrowserSessionAccess();
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let serving: Promise<number> | undefined;
    const profile = {
        id: "default",
        name: "Integration",
        description: "Legacy snapshot integration profile",
        systemPrompt: "Test.",
        instructions: ["Test."],
        toolIds: [],
    };
    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: environment,
            profile,
            adapter: inactiveAdapter,
            httpMiddleware: access.middleware,
            exitPort: { exit() {} },
        });
        await root.checkpointStore.save(fixtureGoal("legacy-running", root, "running"));
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
            return { status: response.status, body: await response.json() as Record<string, any> };
        };

        const detail = await request("/api/goals/legacy-running", "GET");
        assert.equal(detail.status, 200);
        assert.equal(detail.body.goal.runStatus, "running");
        assert.equal(detail.body.goal.execution.state, "inactive");
        assert.equal(detail.body.session.needsRecovery, false);
        const resume = await request("/api/goals/legacy-running/inputs", "POST", {
            kind: "resume",
            inputId: "legacy-resume",
            runId: "run-legacy-running",
            commitRevision: 0,
            acknowledgeUnknownEffects: true,
        });
        assert.equal(resume.status, 409);
        assert.equal(resume.body.error, "RUN_CONTROL_UNAVAILABLE");
        assert.equal((await root.workspaceGoalStore.restore("legacy-running"))?.state.run.status, "running");

        process.emit("SIGINT");
        assert.equal(await serving, 130);
        serving = undefined;
    } finally {
        if (serving !== undefined) {
            process.emit("SIGINT");
            await serving.catch(() => undefined);
        }
        await root?.lifecycle.close().catch(() => undefined);
        await root?.httpService.close().catch(() => undefined);
        await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
