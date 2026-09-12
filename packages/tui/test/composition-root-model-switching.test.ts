import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import type { LlmModelCatalog, LlmModelDescriptor } from "../../llm/src/model-catalog";
import {
    createGoal,
    type GoalModelSelection,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import {
    createCompositionRoot,
    createDefaultToolPolicy,
} from "../src/cli";

class FakeAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode = "strict" as const;
    readonly calls: LLMRequest[] = [];

    constructor(public modelId: string = "model-initial") {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls.push(request);
        return {
            content: JSON.stringify({
                result: {
                    kind: "question",
                    question: "What feature should be built?",
                    memoryPatch: null,
                },
            }),
            raw: {},
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

async function setupTestWorkspace(): Promise<{ workspace: string; cleanup: () => Promise<void> }> {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cm-root-test-"));
    return {
        workspace,
        cleanup: async () => {
            await rm(workspace, { recursive: true, force: true });
        },
    };
}

test("Intent 阶段选择模型后，创建新 Goal 使用所选模型并冻结到快照", async () => {
    const { workspace, cleanup } = await setupTestWorkspace();
    try {
        const initialAdapter = new FakeAdapter("model-default");
        const catalogModels = [
            createDescriptor("model-default", "Model Default"),
            createDescriptor("model-upgraded", "Model Upgraded"),
        ];

        const root = await createCompositionRoot({
            cwd: workspace,
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

        assert.equal(root.controller.getSnapshot().screen, "intent_input");

        // 打开模型选择器并选择 upgraded 模型
        await root.controller.dispatch({ kind: "openModelSelector" });
        await root.controller.dispatch({
            kind: "selectModel",
            model: catalogModels[1]!,
        });

        // 切换后返回 intent_input 界面，notice 显示切换成功
        const intentView = root.controller.getSnapshot();
        assert.equal(intentView.screen, "intent_input");
        assert.match(intentView.notice?.message ?? "", /Model switched to Model Upgraded/);

        // 创建 Goal
        await root.controller.dispatch({
            kind: "create",
            intent: "Build new feature",
        });

        const sessionView = root.controller.getSnapshot();
        assert.equal(sessionView.screen, "session");
        if (sessionView.screen === "session") {
            // 快照中的 modelSelection 必须是所选的 upgraded 模型
            assert.equal(sessionView.goal.state.modelSelection?.modelId, "model-upgraded");
        }

        // Binding 也已经切换为新模型
        assert.equal(root.modelBinding.current().selection.modelId, "model-upgraded");
    } finally {
        await cleanup();
    }
});

test("活动 Goal 在安全等待点切换模型：保存成功后发布新 Binding，后续执行采用新模型", async () => {
    const { workspace, cleanup } = await setupTestWorkspace();
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
            adapter: initialAdapter,
            modelCatalog: new FakeCatalog(catalogModels),
            adapterFactory: (sel) => {
                const adp = new FakeAdapter(sel.modelId);
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

        // 创建 Goal
        await root.controller.dispatch({
            kind: "create",
            intent: "Prepare task",
        });

        const initialSession = root.controller.getSnapshot();
        assert.equal(initialSession.screen, "session");
        assert.equal(initialSession.waitingFor, "question");
        const initialGen = root.modelBinding.current().generation;

        // 打开模型选择器并切换模型
        await root.controller.dispatch({ kind: "openModelSelector" });
        await root.controller.dispatch({
            kind: "selectModel",
            model: catalogModels[1]!,
        });

        // 切换后 Binding 同步发布且代号递增
        assert.equal(root.modelBinding.current().generation, initialGen + 1);
        assert.equal(root.modelBinding.current().selection.modelId, "model-switched");

        // 检查磁盘上的 Goal 快照
        const savedGoal = await root.store.restore(root.controller.getSnapshot().screen === "session" ? (root.controller.getSnapshot() as any).goal.id : "");
        assert.equal(savedGoal?.state.modelSelection?.modelId, "model-switched");

        // 提交后续交互消息，推进下一步
        await root.controller.dispatch({
            kind: "submitMessage",
            content: "Use Postgres",
        });

        // 验证第二代适配器收到了模型调用
        const latestAdapter = adapterInstances.find((adp) => adp.modelId === "model-switched");
        assert.ok(latestAdapter !== undefined);
        assert.ok(latestAdapter.calls.length >= 1);
    } finally {
        await cleanup();
    }
});

test("活动 Goal 保存失败时维持旧选择与旧 Binding", async () => {
    const { workspace, cleanup } = await setupTestWorkspace();
    try {
        const catalogModels = [
            createDescriptor("model-initial", "Model Initial"),
            createDescriptor("model-target", "Model Target"),
        ];
        const initialAdapter = new FakeAdapter("model-initial");

        const root = await createCompositionRoot({
            cwd: workspace,
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
                            code: "SNAPSHOT_PERSISTENCE_FAILED",
                            message: "Disk write error",
                        },
                    };
                },
            },
        });

        await root.controller.dispatch({
            kind: "create",
            intent: "Build feature",
        });

        const initialSession = root.controller.getSnapshot();
        assert.equal(initialSession.screen, "session");
        assert.equal(initialSession.waitingFor, "question");

        const preBinding = root.modelBinding.current();

        // 尝试切换模型
        await root.controller.dispatch({ kind: "openModelSelector" });
        await root.controller.dispatch({
            kind: "selectModel",
            model: catalogModels[1]!,
        });

        // 界面停留在 model_select 并显示错误
        const view = root.controller.getSnapshot();
        assert.equal(view.screen, "model_select");
        assert.equal(view.error?.code, "SNAPSHOT_PERSISTENCE_FAILED");

        // Binding 保持原样，未被发布新代号
        assert.equal(root.modelBinding.current().generation, preBinding.generation);
        assert.equal(root.modelBinding.current().selection.modelId, "model-initial");
    } finally {
        await cleanup();
    }
});

test("恢复 Goal 时，若快照 Provider 与当前环境不兼容，则阻止推进并进入 model_select 错误态", async () => {
    const { workspace, cleanup } = await setupTestWorkspace();
    try {
        const initialAdapter = new FakeAdapter("model-initial");
        const root = await createCompositionRoot({
            cwd: workspace,
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

        // 触发 resume 恢复
        await root.controller.dispatch({
            kind: "selectGoal",
            goalId: "goal-incompatible",
        });

        // 视图被拦截进入 model_select 错误态，未推进 advance
        const view = root.controller.getSnapshot();
        assert.equal(view.screen, "model_select");
        assert.equal(view.error?.code, "RESTORE_PROVIDER_MISMATCH");
    } finally {
        await cleanup();
    }
});
