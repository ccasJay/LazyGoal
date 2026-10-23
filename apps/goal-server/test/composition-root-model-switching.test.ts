import { toolResponseFixture } from "../../../packages/agent/test/tool-response-fixture";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter, LLMConfig } from "../../../packages/llm-core/src/index";
import type { LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import type { LlmModelCatalog, LlmModelDescriptor } from "../../../packages/model-catalog/src/index";
import { createBrowserSessionAccess } from "../../../packages/browser/src/index";
import {
    createGoal,
    type GoalModelSelection,
} from "../../../packages/runtime/src/index";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import {
    createCompositionRoot,
    createDefaultToolPolicy,
} from "../src/composition-root";
import { runServerSession } from "../src/cli";

class FakeAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode: "strict" | "prompt_only";
    readonly calls: LLMRequest[] = [];

    constructor(
        public modelId: string = "model-initial",
        structuredOutputMode: "strict" | "prompt_only" = "strict",
    ) {
        this.structuredOutputMode = structuredOutputMode;
    }

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls.push(request);
        return {
            ...toolResponseFixture(JSON.stringify({
                result: {
                    kind: "ask_user",
                    questions: [
                        {
                            header: "Database Selection",
                            question: "What feature should be built?",
                            options: [
                                { label: "Postgres", description: null },
                                { label: "SQLite", description: null },
                            ],
                            multiSelect: false,
                        },
                    ],
                    memoryPatch: null,
                },
            })),
        };
    }
}

class FakeCatalog implements LlmModelCatalog {
    readonly requests: LLMConfig[] = [];

    constructor(private readonly models: readonly LlmModelDescriptor[]) {}

    async list(config: LLMConfig): Promise<readonly LlmModelDescriptor[]> {
        this.requests.push(config);
        return this.models;
    }
}

function createDescriptor(
    id: string,
    displayName: string,
    selectable = true,
): LlmModelDescriptor {
    return {
        id,
        displayName,
        provider: "openai",
        selectable,
        availabilitySource: "live",
        metadataSource: "catalog",
        contextWindowTokens: 128_000,
        maxOutputTokens: 4096,
    };
}

function createOpenCodeGoDynamicDescriptor(): LlmModelDescriptor {
    return {
        provider: "opencode-go",
        id: "minimax-m3.1-flash-free",
        displayName: "MiniMax M3.1 Flash Free",
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 524_288,
        executionApi: "openai-completions",
        reasoning: true,
        vision: false,
        availabilitySource: "live",
        metadataSource: "execution",
        selectable: true,
    };
}

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

async function setupTestWorkspace(): Promise<{ workspace: string; dataDirectory: string; cleanup: () => Promise<void> }> {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cm-root-test-"));
    const dataDirectory = join(workspace, "lazygoal-data");
    return {
        workspace,
        dataDirectory,
        cleanup: async () => {
            // 后台诊断写入可能在 Run 结束后短暂继续；重试以避开目录非空的瞬时竞争。
            for (let attempt = 0; attempt < 50; attempt += 1) {
                try {
                    await rm(workspace, { recursive: true, force: true });
                    return;
                } catch (error) {
                    if (attempt === 49) throw error;
                    await new Promise<void>((resolve) => setTimeout(resolve, 20));
                }
            }
        },
    };
}

test("Intent 阶段选择模型后，创建新 Goal 使用所选模型并冻结到快照", async () => {
    const { workspace, dataDirectory, cleanup } = await setupTestWorkspace();
    try {
        const initialAdapter = new FakeAdapter("model-default");
        const catalogModels = [
            createDescriptor("model-default", "Model Default"),
            createDescriptor("model-upgraded", "Model Upgraded"),
        ];

        const root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            adapter: initialAdapter,
            modelCatalog: new FakeCatalog(catalogModels),
            adapterFactory: (sel) => new FakeAdapter(sel.modelId),
            profile: {
                id: "default",
                systemPrompt: "System prompt",
                instructions: [],
                toolIds: [],
            },
            toolPolicy: createDefaultToolPolicy(),
        });
        const chosen: GoalModelSelection = { ...root.defaultModelSelection, modelId: "model-upgraded" };
        const created = await root.browserLauncher.launch({
            goalId: "goal-1", intent: "Build new feature", profileId: "default",
            modelSelection: chosen,
        });
        assert.equal(created.ok, true);
        const savedGoal = await root.workspaceGoalStore.restore("goal-1");
        assert.equal(savedGoal?.state.modelSelection.modelId, "model-upgraded");
        assert.equal(root.modelBinding.current().selection.modelId, "model-upgraded");
    } finally {
        await cleanup();
    }
});

test("浏览器只提交模型 ID，服务端目录生成并保存 OpenCode Go 执行契约", async () => {
    const { workspace, dataDirectory, cleanup } = await setupTestWorkspace();
    const access = createBrowserSessionAccess();
    const ready = deferred<string>();
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let serving: Promise<number> | undefined;
    const alignedSelections: GoalModelSelection[] = [];
    const beamDescriptor: LlmModelDescriptor = {
        ...createOpenCodeGoDynamicDescriptor(),
        id: "beam-free",
        displayName: "Beam Free",
        maxOutputTokens: 131_072,
    };
    const catalog = new FakeCatalog([createOpenCodeGoDynamicDescriptor(), beamDescriptor]);
    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: {
                LAZYGOAL_HOME: join(workspace, "home"),
                LLM_PROVIDER: "opencode-go",
                LLM_MODEL: "kimi-k3",
                LLM_API_KEY: "sk-server-only",
            },
            profile: { id: "default", systemPrompt: "System prompt", instructions: [], toolIds: [] },
            modelCatalog: catalog,
            adapterFactory: (selection) => {
                alignedSelections.push(selection);
                return new FakeAdapter(selection.modelId);
            },
            exitPort: { exit() {} },
        });
        assert.equal(root.llmConfig?.provider, "opencode-go");
        assert.equal(root.defaultModelSelection.profileId, undefined);
        const base = createGoal({
            ...currentProtocols,
            id: "goal-dynamic-browser",
            intent: "Select a registered dynamic model",
            promptBundleVersion: 1,
            profile: root.profile,
            runId: "run-dynamic-browser",
            modelSelection: root.defaultModelSelection,
        });
        await root.checkpointStore.save({
            ...base,
            state: {
                ...base.state,
                run: {
                    ...base.state.run,
                    status: "completed",
                    committedThroughSequence: 0,
                    stepCount: 1,
                    lastStep: {
                        kind: "decision",
                        result: { kind: "complete", summary: "Fixture complete", evidenceSequences: [] },
                    },
                },
            },
        });

        serving = runServerSession(root, access, (url) => ready.resolve(url));
        const launchUrl = new URL(await withTimeout(ready.promise, "Web server did not start"));
        const token = launchUrl.hash.slice(1);
        const request = async (body: unknown) => fetch(`${launchUrl.origin}/api/goals/goal-dynamic-browser/model-selection`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                origin: launchUrl.origin,
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        });
        for (const forged of [
            { executionApi: "openai-completions" },
            { baseURL: "https://attacker.invalid/v1" },
            { contextWindowTokens: 1_000_000 },
            { maxOutputTokens: 524_288 },
        ]) {
            const response = await request({ runId: "run-dynamic-browser", modelId: "minimax-m3.1-flash-free", ...forged });
            assert.equal(response.status, 400);
        }
        assert.equal((await root.workspaceGoalStore.restore("goal-dynamic-browser"))?.state.modelSelection.modelId, "kimi-k3");

        const selected = await request({ runId: "run-dynamic-browser", modelId: "minimax-m3.1-flash-free" });
        assert.ok(catalog.requests.length > 0, "selection resolves its model from the injected server catalog");
        assert.equal(selected.status, 200, await selected.clone().text());
        assert.deepEqual(await selected.json(), {
            ok: true,
            goalId: "goal-dynamic-browser",
            runId: "run-dynamic-browser",
            modelId: "minimax-m3.1-flash-free",
            defaultModelSaved: true,
        });
        const saved = await root.workspaceGoalStore.restore("goal-dynamic-browser");
        assert.deepEqual(saved?.state.modelSelection, {
            provider: "opencode-go",
            modelId: "minimax-m3.1-flash-free",
            structuredOutputMode: "prompt_only",
            contextWindowTokens: 1_000_000,
            maxOutputTokens: 524_288,
            executionApi: "openai-completions",
            inputEstimator: { kind: "character-v1" },
        });
        assert.doesNotMatch(JSON.stringify(saved?.state.modelSelection), /sk-server-only|baseURL|apiKey|endpoint/i);
        root.alignModelBinding(saved!.state.modelSelection);
        assert.ok(alignedSelections.some((selection) =>
            selection.modelId === "minimax-m3.1-flash-free"
            && selection.executionApi === "openai-completions"
            && selection.contextWindowTokens === 1_000_000
            && selection.maxOutputTokens === 524_288));

        const beamSelected = await request({ runId: "run-dynamic-browser", modelId: "beam-free" });
        assert.equal(beamSelected.status, 200, await beamSelected.clone().text());
        const beamSaved = await root.workspaceGoalStore.restore("goal-dynamic-browser");
        assert.deepEqual(beamSaved?.state.modelSelection, {
            provider: "opencode-go",
            modelId: "beam-free",
            structuredOutputMode: "prompt_only",
            contextWindowTokens: 1_000_000,
            maxOutputTokens: 131_072,
            executionApi: "openai-completions",
            inputEstimator: { kind: "character-v1" },
        });
        root.alignModelBinding(beamSaved!.state.modelSelection);
        assert.ok(alignedSelections.some((selection) =>
            selection.modelId === "beam-free"
            && selection.executionApi === "openai-completions"
            && selection.contextWindowTokens === 1_000_000
            && selection.maxOutputTokens === 131_072));
    } finally {
        if (serving !== undefined) {
            process.emit("SIGINT");
            await serving.catch(() => undefined);
        } else if (root !== undefined) {
            await root.resources.closeAll().catch(() => undefined);
        }
        await cleanup();
    }
});

test("显式 CLI 配置的登记模型使用服务端执行元数据构造动态默认 Binding", async () => {
    const { workspace, dataDirectory, cleanup } = await setupTestWorkspace();
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: {
                LAZYGOAL_HOME: join(workspace, "home"),
                LLM_PROVIDER: "opencode-go",
                LLM_MODEL: "minimax-m3.1-flash-free",
                LLM_API_KEY: "sk-explicit-config",
            },
            profile: { id: "default", systemPrompt: "System prompt", instructions: [], toolIds: [] },
            toolPolicy: createDefaultToolPolicy(),
        });
        assert.equal(root.defaultModelSelection.provider, "opencode-go");
        assert.equal(root.defaultModelSelection.modelId, "minimax-m3.1-flash-free");
        assert.equal(root.defaultModelSelection.executionApi, "openai-completions");
        assert.equal(root.defaultModelSelection.contextWindowTokens, 1_000_000);
        assert.equal(root.defaultModelSelection.maxOutputTokens, 524_288);
        assert.equal("availabilitySource" in root.defaultModelSelection, false, "configured ID is not represented as an online availability claim");

        const adapterConfig = (root.modelBinding.current().decideAdapter as unknown as {
            readonly config: { readonly apiKey: string; readonly model: string; readonly executionApi?: string };
        }).config;
        assert.equal(adapterConfig.apiKey, "sk-explicit-config");
        assert.equal(adapterConfig.model, "minimax-m3.1-flash-free");
        assert.equal(adapterConfig.executionApi, "openai-completions");
    } finally {
        await root?.resources.closeAll();
        await cleanup();
    }
});

test("新进程从 Snapshot 恢复动态模型 API 与容量，并使用当前 Provider Key", async () => {
    const { workspace, cleanup } = await setupTestWorkspace();
    const dataDirectory = join(workspace, "restart-dynamic-data");
    const home = join(workspace, "home");
    const agentProfile = { id: "default", systemPrompt: "System prompt", instructions: [], toolIds: [] };
    let firstRoot: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let restoredRoot: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    const originalFetch = globalThis.fetch;
    const transport = deferred<{ readonly url: string; readonly headers: Headers }>();
    try {
        const firstEnv = {
            LAZYGOAL_HOME: home,
            LLM_PROVIDER: "opencode-go",
            LLM_MODEL: "kimi-k3",
            LLM_API_KEY: "sk-old-provider-key",
        };
        firstRoot = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: firstEnv,
            profile: agentProfile,
            adapter: new CompleteAdapter("kimi-k3"),
            adapterFactory: (selection, stage) => new CompleteAdapter(selection.modelId, stage === "think" ? "prompt_only" : "strict"),
        });
        const savedSelection: GoalModelSelection = {
            ...firstRoot.defaultModelSelection,
            modelId: "minimax-m3.1-flash-free",
            executionApi: "openai-completions",
            contextWindowTokens: 1_000_000,
            maxOutputTokens: 524_288,
        };
        const created = await firstRoot.browserLauncher.launch({
            goalId: "goal-dynamic-after-restart",
            intent: "Persist dynamic execution metadata",
            profileId: "default",
            modelSelection: savedSelection,
        });
        assert.equal(created.ok, true);
        await waitForCompletedRun(firstRoot.workspaceGoalStore, "goal-dynamic-after-restart");
        await firstRoot.resources.closeAll();
        firstRoot = undefined;

        globalThis.fetch = async (input, init) => {
            transport.resolve({
                url: typeof input === "string" ? input : input.toString(),
                headers: new Headers(init?.headers),
            });
            throw new Error("Blocked test transport after request capture");
        };
        restoredRoot = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: { ...firstEnv, LLM_API_KEY: "sk-current-provider-key" },
            profile: agentProfile,
        });
        const savedGoal = await restoredRoot.workspaceGoalStore.restore("goal-dynamic-after-restart");
        assert.ok(savedGoal);
        assert.deepEqual(savedGoal.state.modelSelection, savedSelection);
        const accepted = await restoredRoot.sessions.sendSessionInput(savedGoal.id, {
            kind: "message",
            inputId: "continue-dynamic-after-restart",
            content: "Continue with the saved model",
        });
        assert.equal(accepted.ok, true);
        const request = await withTimeout(transport.promise, "Restored dynamic binding did not call its transport");
        assert.equal(request.url, "https://opencode.ai/inference/go/openai/v1/chat/completions");
        assert.equal(request.headers.get("authorization"), "Bearer sk-current-provider-key");
        assert.equal(request.headers.get("user-agent"), "lazygoal");
        assert.ok(request.headers.get("x-opencode-session"));
        assert.equal(restoredRoot.modelBinding.current().selection.executionApi, "openai-completions");
        assert.equal(restoredRoot.modelBinding.current().selection.contextWindowTokens, 1_000_000);
        assert.equal(restoredRoot.modelBinding.current().selection.maxOutputTokens, 524_288);
        await waitForSessionIdle(restoredRoot);
    } finally {
        globalThis.fetch = originalFetch;
        await firstRoot?.resources.closeAll().catch(() => undefined);
        await restoredRoot?.resources.closeAll().catch(() => undefined);
        await cleanup();
    }
});

test("活动 Goal 在安全等待点切换模型：保存成功后发布新 Binding，后续执行采用新模型", async () => {
    const { workspace, dataDirectory, cleanup } = await setupTestWorkspace();
    try {
        const adapterInstances: FakeAdapter[] = [];
        const catalogModels = [
            createDescriptor("model-initial", "Model Initial"),
            createDescriptor("model-switched", "Model Switched"),
        ];

        const initialAdapter = new FakeAdapter("model-initial");
        adapterInstances.push(initialAdapter);

        const root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            adapter: initialAdapter,
            modelCatalog: new FakeCatalog(catalogModels),
            adapterFactory: (sel, stage) => {
                const adp = new FakeAdapter(sel.modelId, stage === "think" ? "prompt_only" : "strict");
                adapterInstances.push(adp);
                return adp;
            },
            profile: {
                id: "default",
                systemPrompt: "System prompt",
                instructions: [],
                toolIds: [],
            },
            toolPolicy: createDefaultToolPolicy(),
        });

        const created = await root.browserLauncher.launch({
            goalId: "goal-1", intent: "Prepare task", profileId: "default",
            modelSelection: { ...root.defaultModelSelection, modelId: "model-initial" },
        });
        assert.equal(created.ok, true);

        const savedGoal = await root.workspaceGoalStore.restore("goal-1");
        assert.ok(savedGoal);
        const initialGen = root.modelBinding.current().generation;
        const switched = await root.goalModelSelectionCoordinator.updateModelSelection({
            ref: { goalId: "goal-1", runId: savedGoal.state.run.id },
            selection: { ...root.defaultModelSelection, modelId: "model-switched" },
        });
        assert.equal(switched.ok, true);
        root.alignModelBinding({ ...root.defaultModelSelection, modelId: "model-switched" });

        assert.equal(root.modelBinding.current().generation, initialGen + 1);
        assert.equal(root.modelBinding.current().selection.modelId, "model-switched");
    } finally {
        await cleanup();
    }
});

test("活动 Goal 保存失败时维持旧选择与旧 Binding", async () => {
    const { workspace, dataDirectory, cleanup } = await setupTestWorkspace();
    try {
        const catalogModels = [
            createDescriptor("model-initial", "Model Initial"),
            createDescriptor("model-target", "Model Target"),
        ];
        const initialAdapter = new FakeAdapter("model-initial");

        const root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            adapter: initialAdapter,
            modelCatalog: new FakeCatalog(catalogModels),
            profile: {
                id: "default",
                systemPrompt: "System prompt",
                instructions: [],
                toolIds: [],
            },
            toolPolicy: createDefaultToolPolicy(),
            // 注入必定失败的 selection coordinator
            goalModelSelectionCoordinator: {
                async updateModelSelection() {
                    return {
                        ok: false,
                        error: {
                            code: "SAVE_FAILED",
                            message: "Disk write error",
                        },
                    };
                },
            },
        });

        const created = await root.browserLauncher.launch({
            goalId: "goal-1", intent: "Build feature", profileId: "default",
            modelSelection: { ...root.defaultModelSelection, modelId: "model-initial" },
        });
        assert.equal(created.ok, true);

        const preBinding = root.modelBinding.current();

        const switched = await root.goalModelSelectionCoordinator.updateModelSelection({
            ref: { goalId: "goal-1", runId: "run-1" },
            selection: { ...root.defaultModelSelection, modelId: "model-target" },
        });

        assert.equal(switched.ok, false);
        // Binding 保持原样，未被发布新代号
        assert.equal(root.modelBinding.current().generation, preBinding.generation);
        assert.equal(root.modelBinding.current().selection.modelId, "model-initial");
    } finally {
        await cleanup();
    }
});

test("恢复 Goal 时，若快照 Provider 与当前环境不兼容，则阻止推进并进入 model_select 错误态", async () => {
    const { workspace, dataDirectory, cleanup } = await setupTestWorkspace();
    try {
        const initialAdapter = new FakeAdapter("model-initial");
        const root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            adapter: initialAdapter,
            profile: {
                id: "default",
                systemPrompt: "System prompt",
                instructions: [],
                toolIds: [],
            },
            toolPolicy: createDefaultToolPolicy(),
        });

        // 在 store 中预置一个 Provider 不匹配的 Goal（如 anthropic）
        const incompatibleSelection: GoalModelSelection = {
            provider: "anthropic",
            modelId: "claude-3-5-sonnet",
            structuredOutputMode: "strict",
            contextWindowTokens: 200_000,
            maxOutputTokens: 8192,
            inputEstimator: { kind: "character-v1" },
        };

        const goal = createGoal({
            ...currentProtocols,
            promptBundleVersion: 1,
            id: "goal-incompatible",
            intent: "Restore incompatible goal",
            profile: root.profile,
            runId: "run-1",
            modelSelection: incompatibleSelection,
        });
        await root.store.save(goal);

        // 显式恢复被受理，但本进程无法服务该 Provider：执行必须中止在发布 Binding 之前，
        // 不得回退进程默认 Provider，也不得产生模型调用。
        const resumed = await root.sessions.sendSessionInput("goal-incompatible", {
            kind: "resume",
            inputId: "input-resume",
            runId: "run-1",
            commitRevision: goal.state.commitRevision ?? 0,
        });
        assert.equal(resumed.ok, true, JSON.stringify(resumed));
        for (let attempt = 0; attempt < 75; attempt += 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
            if (root.modelBinding.current().selection.modelId !== "model-initial") break;
        }
        assert.equal(initialAdapter.calls.length, 0);
        assert.equal(root.modelBinding.current().selection.provider, "openai");
        const recovered = await root.workspaceGoalStore.restore("goal-incompatible");
        assert.ok(recovered);
        assert.equal(recovered.state.modelSelection.provider, "anthropic");
        assert.equal(recovered.state.run.status !== "completed" && recovered.state.run.status !== "cancelled", true);
    } finally {
        await cleanup();
    }
});

test("浏览器 Launcher 在首次调用前对齐模型，并在初始保存前失败时回滚绑定", async () => {
    const { workspace, dataDirectory, cleanup } = await setupTestWorkspace();
    try {
        const adapters: FakeAdapter[] = [];
        const root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            adapter: new FakeAdapter("model-default"),
            adapterFactory: (selection, stage) => {
                const adapter = new FakeAdapter(selection.modelId, stage === "think" ? "prompt_only" : "strict");
                adapters.push(adapter);
                return adapter;
            },
            profile: {
                id: "default",
                systemPrompt: "System prompt",
                instructions: [],
                toolIds: [],
            },
            toolPolicy: createDefaultToolPolicy(),
        });
        const oldSelection = root.modelBinding.current().selection;
        const chosen: GoalModelSelection = { ...oldSelection, modelId: "model-selected" };
        const created = await root.browserLauncher.launch({
            goalId: "goal-browser-selected", intent: "Inspect this project", profileId: "default",
            modelSelection: chosen,
        });
        assert.equal(created.ok, true);
        assert.equal((await root.workspaceGoalStore.restore("goal-browser-selected"))?.state.modelSelection.modelId, "model-selected");
        assert.equal(root.modelBinding.current().selection.modelId, "model-selected");
        assert.ok(adapters.some((adapter) => adapter.modelId === "model-selected" && adapter.calls.length > 0));

        const failed = await root.browserLauncher.launch({
            goalId: "goal-browser-failed", intent: "Inspect another project", profileId: "missing-profile",
            modelSelection: { ...oldSelection, modelId: "model-temporary" },
        });
        assert.equal(failed.ok, false);
        assert.equal(await root.workspaceGoalStore.restore("goal-browser-failed"), undefined);
        assert.equal(root.modelBinding.current().selection.modelId, "model-selected");
    } finally {
        await cleanup();
    }
});

test("浏览器推进交替恢复各 Goal 的模型绑定，不串用上一个 Goal 的模型", async () => {
    const { workspace, cleanup } = await setupTestWorkspace();
    let closeRoot: (() => Promise<void>) | undefined;
    try {
        const adapters: CompleteAdapter[] = [];
        const root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory: join(workspace, "lazygoal-data"),
            adapter: new CompleteAdapter("model-default"),
            adapterFactory: (selection, stage) => {
                const adapter = new CompleteAdapter(selection.modelId, stage === "think" ? "prompt_only" : "strict");
                adapters.push(adapter);
                return adapter;
            },
            profile: { id: "default", systemPrompt: "System prompt", instructions: [], toolIds: [] },
            toolPolicy: createDefaultToolPolicy(),
        });
        closeRoot = () => root.resources.closeAll();
        const firstSelection: GoalModelSelection = { ...root.defaultModelSelection, modelId: "model-first" };
        const secondSelection: GoalModelSelection = { ...root.defaultModelSelection, modelId: "model-second" };
        const first = await root.sessions.create({
            goalId: "goal-first", inputId: "input-first-1", content: "First goal", profileId: "default", modelSelection: firstSelection,
        });
        assert.equal(first.ok, true, JSON.stringify(first));
        await waitForSessionIdle(root);
        const second = await root.sessions.create({
            goalId: "goal-second", inputId: "input-second-1", content: "Second goal", profileId: "default", modelSelection: secondSelection,
        });
        assert.equal(second.ok, true, JSON.stringify(second));
        await waitForSessionIdle(root);
        assert.equal(root.modelBinding.current().selection.modelId, "model-second");

        const firstGoal = await root.workspaceGoalStore.restore("goal-first");
        const secondGoal = await root.workspaceGoalStore.restore("goal-second");
        assert.ok(firstGoal && secondGoal);
        // 每个 Goal 的后继 Run 都在启动前按自己的快照重新对齐 Binding，不继承另一个 Goal。
        const secondCallsBefore = adapters.filter((adapter) => adapter.modelId === "model-second").reduce((total, adapter) => total + adapter.calls.length, 0);
        const firstNext = await root.sessions.sendSessionInput("goal-first", {
            kind: "message", inputId: "continue-first", content: "Continue first goal",
        });
        assert.equal(firstNext.ok, true, JSON.stringify(firstNext));
        await waitForNextCompletedRun(root.workspaceGoalStore, firstGoal.id, firstGoal.state.run.id);
        assert.equal(root.modelBinding.current().selection.modelId, "model-first");
        assert.ok(adapters.filter((adapter) => adapter.modelId === "model-first").reduce((total, adapter) => total + adapter.calls.length, 0) >= 2, JSON.stringify(adapters.map((adapter) => [adapter.modelId, adapter.calls.length])));
        assert.equal(adapters.filter((adapter) => adapter.modelId === "model-second").reduce((total, adapter) => total + adapter.calls.length, 0), secondCallsBefore);

        await waitForSessionIdle(root);
        const secondNext = await root.sessions.sendSessionInput("goal-second", {
            kind: "message", inputId: "continue-second", content: "Continue second goal",
        });
        assert.equal(secondNext.ok, true, JSON.stringify(secondNext));
        await waitForNextCompletedRun(root.workspaceGoalStore, secondGoal.id, secondGoal.state.run.id);
        assert.equal(root.modelBinding.current().selection.modelId, "model-second");
        assert.ok(adapters.filter((adapter) => adapter.modelId === "model-second").reduce((total, adapter) => total + adapter.calls.length, 0) >= 2);
    } finally {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        await closeRoot?.();
        await cleanup();
    }
});

class CompleteAdapter extends FakeAdapter {
    override async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls.push(request);
        if (request.tools?.[0]?.id === "system_review_completion") return { ...toolResponseFixture(JSON.stringify({ result: { kind: "accept" } })) };
        return { ...toolResponseFixture(JSON.stringify({ result: { kind: "complete", summary: `done by ${this.modelId}`, evidenceSequences: [], memoryPatch: null, contextNotes: null } })) };
    }
}

async function waitForCompletedRun(store: { restore(goalId: string): Promise<import("../../../packages/runtime/src/index").Goal | undefined> }, goalId: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const goal = await store.restore(goalId);
        if (goal?.state.run.status === "completed" || goal?.state.run.status === "failed") {
            assert.equal(goal.state.run.status, "completed", JSON.stringify(goal.state.run));
            return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    assert.fail(`Goal ${goalId} did not complete`);
}

/** 等待实例释放活动执行名额；受理与执行所有权分离。 */
async function waitForSessionIdle(root: { sessions: { activeGoal: string | undefined } }): Promise<void> {
    for (let attempt = 0; attempt < 750 && root.sessions.activeGoal !== undefined; attempt += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(root.sessions.activeGoal, undefined, "Expected the session execution slot to be released");
}

/** 等待后继 Run 创建并完成：受理只保证持久化，不等待执行。 */
async function waitForNextCompletedRun(
    store: { restore(goalId: string): Promise<import("../../../packages/runtime/src/index").Goal | undefined> },
    goalId: string,
    previousRunId: string,
): Promise<void> {
    for (let attempt = 0; attempt < 750; attempt += 1) {
        const goal = await store.restore(goalId);
        if (goal !== undefined && goal.state.run.id !== previousRunId
            && (goal.state.run.status === "completed" || goal.state.run.status === "failed")) {
            assert.equal(goal.state.run.status, "completed", JSON.stringify(goal.state.run));
            return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`Goal ${goalId} did not start and complete a successor Run`);
}

test("服务重启后首次 Web 推进从 Snapshot 恢复模型而不回退默认模型", async () => {
    const { workspace, cleanup } = await setupTestWorkspace();
    let closeRoot: (() => Promise<void>) | undefined;
    try {
        const dataDirectory = join(workspace, "restart-data");
        const profile = { id: "default", systemPrompt: "System prompt", instructions: [], toolIds: [] };
        const firstAdapters: CompleteAdapter[] = [];
        const firstRoot = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            adapter: new CompleteAdapter("model-default"),
            adapterFactory: (selection, stage) => {
                const adapter = new CompleteAdapter(selection.modelId, stage === "think" ? "prompt_only" : "strict");
                firstAdapters.push(adapter);
                return adapter;
            },
            profile,
            toolPolicy: createDefaultToolPolicy(),
        });
        closeRoot = () => firstRoot.resources.closeAll();
        const savedSelection: GoalModelSelection = { ...firstRoot.defaultModelSelection, modelId: "model-saved" };
        const launched = await firstRoot.browserLauncher.launch({
            goalId: "goal-after-restart", intent: "Persist selected model", profileId: "default", modelSelection: savedSelection,
        });
        assert.equal(launched.ok, true);
        assert.equal((await firstRoot.workspaceGoalStore.restore("goal-after-restart"))?.state.run.status, "completed");
        await firstRoot.resources.closeAll();
        closeRoot = undefined;

        const restoredAdapters: CompleteAdapter[] = [];
        const restoredRoot = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            adapter: new CompleteAdapter("model-default"),
            adapterFactory: (selection, stage) => {
                const adapter = new CompleteAdapter(selection.modelId, stage === "think" ? "prompt_only" : "strict");
                restoredAdapters.push(adapter);
                return adapter;
            },
            profile,
            toolPolicy: createDefaultToolPolicy(),
        });
        closeRoot = () => restoredRoot.resources.closeAll();
        assert.equal(restoredRoot.modelBinding.current().selection.modelId, "model-default");
        const goal = await restoredRoot.workspaceGoalStore.restore("goal-after-restart");
        assert.ok(goal);
        const next = await restoredRoot.sessions.sendSessionInput("goal-after-restart", {
            kind: "message", inputId: "continue-after-restart", content: "Continue after restart",
        });
        assert.equal(next.ok, true);
        await waitForNextCompletedRun(restoredRoot.workspaceGoalStore, goal.id, goal.state.run.id);
        assert.equal(restoredRoot.modelBinding.current().selection.modelId, "model-saved");
        assert.ok(restoredAdapters.some((adapter) => adapter.modelId === "model-saved" && adapter.calls.length > 0));
    } finally {
        await closeRoot?.();
        await cleanup();
    }
});
