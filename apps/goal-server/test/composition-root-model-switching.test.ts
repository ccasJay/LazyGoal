import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../../packages/llm/src/core/types";
import { BrowserGoalCommandService } from "../../../packages/browser/src/index";
import type { LlmModelCatalog, LlmModelDescriptor } from "../../../packages/llm/src/model-catalog";
import {
    createGoal,
    type GoalModelSelection,
} from "../../../packages/runtime/src/index";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import {
    createCompositionRoot,
    createDefaultToolPolicy,
} from "../src/composition-root";

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
            content: JSON.stringify({
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
            }),
        };
    }
}

class FakeCatalog implements LlmModelCatalog {
    constructor(private readonly models: readonly LlmModelDescriptor[]) {}

    async list(): Promise<readonly LlmModelDescriptor[]> {
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

async function setupTestWorkspace(): Promise<{ workspace: string; dataDirectory: string; cleanup: () => Promise<void> }> {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cm-root-test-"));
    const dataDirectory = join(workspace, "lazygoal-data");
    return {
        workspace,
        dataDirectory,
        cleanup: async () => {
            await rm(workspace, { recursive: true, force: true });
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

        const commands = new BrowserGoalCommandService({
            store: root.workspaceGoalStore,
            saveNotifications: root.notifyingStore,
            profileId: "default",
            launcher: root.browserLauncher,
            coordinator: root.coordinator,
            restoreModelBinding: async (g) => {
                if (g.state.modelSelection.provider !== root.defaultModelSelection.provider) return false;
                try { root.alignModelBinding(g.state.modelSelection); return true; } catch { return false; }
            },
        });

        const resumeResult = await commands.resume("goal-incompatible", {
            runId: "run-1",
            expectedCommittedThroughSequence: 0,
        });
        assert.equal(resumeResult.ok, false);
        assert.equal(resumeResult.error, "model_restore_failed");
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
        const first = await root.browserLauncher.launch({
            goalId: "goal-first", intent: "First goal", profileId: "default", modelSelection: firstSelection,
        });
        const second = await root.browserLauncher.launch({
            goalId: "goal-second", intent: "Second goal", profileId: "default", modelSelection: secondSelection,
        });
        assert.equal(first.ok, true);
        assert.equal(second.ok, true);
        assert.equal(root.modelBinding.current().selection.modelId, "model-second");

        const commands = new BrowserGoalCommandService({
            store: root.workspaceGoalStore,
            saveNotifications: root.notifyingStore,
            profileId: "default",
            launcher: root.browserLauncher,
            coordinator: root.coordinator,
            restoreModelBinding: async (goal) => {
                if (goal.state.modelSelection.provider !== root.defaultModelSelection.provider) return false;
                try { root.alignModelBinding(goal.state.modelSelection); return true; } catch { return false; }
            },
        });
        const firstGoal = await root.workspaceGoalStore.restore("goal-first");
        const secondGoal = await root.workspaceGoalStore.restore("goal-second");
        assert.ok(firstGoal && secondGoal);
        const firstNext = await commands.message(firstGoal.id, {
            runId: firstGoal.state.run.id, messageId: "continue-first", content: "Continue first goal",
        });
        assert.equal(firstNext.ok, true);
        assert.equal(root.modelBinding.current().selection.modelId, "model-first");
        await waitForCompletedRun(root.workspaceGoalStore, firstGoal.id);
        assert.ok(adapters.filter((adapter) => adapter.modelId === "model-first").reduce((total, adapter) => total + adapter.calls.length, 0) >= 2, JSON.stringify(adapters.map((adapter) => [adapter.modelId, adapter.calls.length])));

        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const secondNext = await commands.message(secondGoal.id, {
            runId: secondGoal.state.run.id, messageId: "continue-second", content: "Continue second goal",
        });
        assert.equal(secondNext.ok, true);
        assert.equal(root.modelBinding.current().selection.modelId, "model-second");
        await waitForCompletedRun(root.workspaceGoalStore, secondGoal.id);
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
        if (request.tools?.[0]?.id === "system_review_completion") return { content: JSON.stringify({ result: { kind: "accept" } }) };
        return { content: JSON.stringify({ result: { kind: "complete", summary: `done by ${this.modelId}`, evidenceSequences: [], memoryPatch: null } }) };
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
        const commands = new BrowserGoalCommandService({
            store: restoredRoot.workspaceGoalStore,
            saveNotifications: restoredRoot.notifyingStore,
            profileId: "default",
            launcher: restoredRoot.browserLauncher,
            coordinator: restoredRoot.coordinator,
            restoreModelBinding: async (goal) => {
                if (goal.state.modelSelection.provider !== restoredRoot.defaultModelSelection.provider) return false;
                try { restoredRoot.alignModelBinding(goal.state.modelSelection); return true; } catch { return false; }
            },
        });
        const goal = await restoredRoot.workspaceGoalStore.restore("goal-after-restart");
        assert.ok(goal);
        const next = await commands.message(goal.id, { runId: goal.state.run.id, messageId: "continue-after-restart", content: "Continue after restart" });
        assert.equal(next.ok, true);
        assert.equal(restoredRoot.modelBinding.current().selection.modelId, "model-saved");
        await waitForCompletedRun(restoredRoot.workspaceGoalStore, goal.id);
        assert.ok(restoredAdapters.some((adapter) => adapter.modelId === "model-saved" && adapter.calls.length > 0));
    } finally {
        await closeRoot?.();
        await cleanup();
    }
});
