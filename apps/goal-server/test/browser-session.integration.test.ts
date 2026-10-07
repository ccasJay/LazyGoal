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
        } else if (root !== undefined) {
            root.checkpointStore.freeze();
            root.abortController.abort();
            await root.resources.closeAll();
        }
        await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
