import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../../packages/llm/src/core/types";
import type {
    PermissionMode,
    ProjectPermissionMode,
    ProjectPermissionModeStore,
} from "../../../packages/permission/src/index";
import {
    ManagedResourceRegistry,
    RuntimeLifecycleUnavailableError,
    type AgentProfile,
    type GoalModelSelection,
} from "../../../packages/runtime/src/index";
import { AgentProfileConfigurationError } from "../../../packages/storage/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type Tool,
} from "../../../packages/tool-core/src/index";
import { contract } from "../../../packages/contracts/src/index";
import { createRuntimeComposition } from "../src/runtime/index";

const profile: AgentProfile = {
    id: "profile-runtime-composition",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Ask once, then wait."],
    toolIds: [],
};

class AskUserAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode = "strict" as const;
    modelId = "model-runtime-composition";
    readonly calls: LLMRequest[] = [];

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls.push(request);
        if (this.calls.length === 1) {
            return {
                content: "",
                toolCalls: [{
                    callId: "fixture-ask-user",
                    toolId: "ask_user",
                    argumentsJson: JSON.stringify({
                        questions: [
                            {
                                header: "继续方式",
                                question: "Which path should be taken?",
                                options: [{ label: "Path A" }, { label: "Path B" }],
                                multiSelect: false,
                            },
                        ],
                    }),
                }],
            };
        }
        return {
            content: "",
            toolCalls: [{
                callId: "fixture-wait",
                toolId: "system_wait_for_input",
                argumentsJson: JSON.stringify({ reason: "等待用户确认" }),
            }],
        };
    }
}

function readFileTool(): Tool {
    return {
        definition: {
            id: "read_file",
            description: "Read a file",
            inputContract: contract.object({ path: contract.string() }),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            return { kind: "success", output: {}, summary: "Read" };
        },
    };
}

/** 正常阶段阻塞的权限模式存储，用于制造在途写操作。 */
class BlockingPermissionModeStore implements ProjectPermissionModeStore {
    private releaseSet!: () => void;
    private resolveEntered!: () => void;
    private current: ProjectPermissionMode | undefined;
    readonly entered = new Promise<void>((resolve) => {
        this.resolveEntered = resolve;
    });
    private readonly released = new Promise<void>((resolve) => {
        this.releaseSet = resolve;
    });

    async get(workspaceId: string): Promise<ProjectPermissionMode> {
        return this.current ?? { workspaceId, mode: "default", revision: 0 };
    }

    async set(
        workspaceId: string,
        mode: PermissionMode,
        expectedRevision: number,
    ): Promise<ProjectPermissionMode> {
        this.resolveEntered();
        await this.released;
        this.current = { workspaceId, mode, revision: expectedRevision + 1 };
        return this.current;
    }

    release(): void {
        this.releaseSet();
    }
}

async function setupFixture(): Promise<{
    readonly workspace: string;
    readonly home: string;
    readonly dataDirectory: string;
    readonly cleanup: () => Promise<void>;
}> {
    const root = await mkdtemp(join(tmpdir(), "lg-runtime-composition-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(home, { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    return {
        workspace,
        home,
        dataDirectory,
        cleanup: async () => {
            await rm(root, { recursive: true, force: true });
        },
    };
}

function answersFor(goal: {
    readonly state: { readonly run: { readonly pendingInteraction?: unknown } };
}): {
    readonly requestId: string;
    readonly questionId: string;
    readonly optionId: string;
} {
    const pending = goal.state.run.pendingInteraction;
    if (typeof pending !== "object" || pending === null || !("questions" in pending)) {
        throw new Error("Expected a pending ask_user interaction");
    }
    const interaction = pending as {
        readonly requestId: string;
        readonly questions: readonly {
            readonly id: string;
            readonly options: readonly { readonly id: string }[];
        }[];
    };
    const question = interaction.questions[0]!;
    return {
        requestId: interaction.requestId,
        questionId: question.id,
        optionId: question.options[0]!.id,
    };
}

test("经目录入口构造无界面运行时：无 HTTP、无进程信号、只读恢复不推进、保存后通知", async () => {
    const fixture = await setupFixture();
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const adapter = new AskUserAdapter();
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter,
        profile,
        toolRegistry: new InMemoryToolRegistry([]),
    });
    try {
        // 无界面装配不创建 HTTP、不注册进程信号。
        assert.equal((runtime as { httpService?: unknown }).httpService, undefined);
        assert.equal(process.listenerCount("SIGINT"), sigintBefore);
        assert.equal(process.listenerCount("SIGTERM"), sigtermBefore);

        // 配置路径与优先级保持：注入适配器时使用调用方模型，数据写入显式目录。
        assert.equal(runtime.dataDirectory, fixture.dataDirectory);
        assert.equal(runtime.llmConfig, undefined);
        assert.equal(runtime.defaultModelSelection.modelId, adapter.modelId);

        const goalId = "goal-runtime-composition";
        const launched = await runtime.commands.launch({
            goalId,
            intent: "走到等待点",
            profileId: profile.id,
        });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(launched.kind, "waiting");
        assert.equal(launched.waitingFor, "ask_user");
        assert.equal(adapter.calls.length, 1);
        assert.equal(runtime.checkpointStore.isFrozen, false);
        assert.deepEqual(
            await readdir(runtime.goalsDirectory),
            [`${Buffer.from(goalId, "utf8").toString("base64url")}.json`],
        );
        assert.equal(existsSync(join(fixture.home, "config.toml")), false);
        const callsAfterLaunch = adapter.calls.length;

        // 只读恢复不推进，也不调用模型或工具。
        const restored = await runtime.workspaceGoalStore.restore(goalId);
        assert.deepEqual(restored, launched.goal);
        assert.equal(adapter.calls.length, callsAfterLaunch);

        // 成功保存后通知；订阅者异常不取消执行。
        const notifications: string[] = [];
        const unsubscribe = runtime.notifyingStore.onSave((goal) => {
            notifications.push(goal.id);
            throw new Error("subscriber failed");
        });
        const answer = answersFor(launched.goal);
        const ref = { goalId, runId: launched.goal.state.run.id };
        const resumed = await runtime.commands.resume({
            ref,
            action: {
                kind: "answer_ask_user",
                requestId: answer.requestId,
                answers: [{ questionId: answer.questionId, optionIds: [answer.optionId] }],
            },
        });
        if (!resumed.ok) assert.fail(`${resumed.error.code}: ${resumed.error.message}`);
        assert.equal(resumed.kind, "waiting");
        assert.equal(resumed.waitingFor, "blocked");
        assert.ok(notifications.length > 0);

        // 解除订阅后不再收到通知，执行事实仍来自已提交快照。
        unsubscribe();
        const notifiedBefore = notifications.length;
        const continued = await runtime.commands.resume({
            ref,
            action: { kind: "message", content: "继续执行" },
        });
        if (!continued.ok) assert.fail(`${continued.error.code}: ${continued.error.message}`);
        assert.equal(notifications.length, notifiedBefore);
        assert.ok(await runtime.workspaceGoalStore.restore(goalId));

        await runtime.lifecycle.close();
        assert.equal(runtime.lifecycle.state, "closed");
        assert.equal(runtime.checkpointStore.isFrozen, true);
    } finally {
        await runtime.lifecycle.close().catch(() => undefined);
        await fixture.cleanup();
    }
});

test("构造中途失败结算自有资源、保留初始故障且不关闭借用依赖", async () => {
    const fixture = await setupFixture();
    const resources = new ManagedResourceRegistry();
    const abortController = new AbortController();
    const borrowedRegistry = new InMemoryToolRegistry([createToolRegistration(readFileTool())]);
    try {
        await assert.rejects(
            createRuntimeComposition({
                cwd: fixture.workspace,
                env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
                dataDirectory: fixture.dataDirectory,
                adapter: new AskUserAdapter(),
                profile: { ...profile, toolIds: ["missing_tool"] },
                toolRegistry: borrowedRegistry,
                resources,
                abortController,
            }),
            (error: unknown) => error instanceof AgentProfileConfigurationError,
        );

        // 装配层自有的 ProcessManager 已结算；借出的控制器与 Registry 保持原状。
        assert.equal(resources.size, 0);
        assert.equal(resources.failures.length, 0);
        assert.equal(abortController.signal.aborted, false);
        assert.equal(borrowedRegistry.get("read_file")?.definition.id, "read_file");
    } finally {
        await fixture.cleanup();
    }
});

test("在途权限、模型与归档删除操作参与关闭结算，关闭后写控制拒绝而读取可用", async () => {
    const fixture = await setupFixture();
    const permissionModeStore = new BlockingPermissionModeStore();
    const adapter = new AskUserAdapter();
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter,
        profile,
        toolRegistry: new InMemoryToolRegistry([]),
        permissionModeStore,
        goalIdGenerator: () => "goal-tracking",
        runIdGenerator: () => "run-1",
    });
    try {
        const ref = { goalId: "goal-tracking", runId: "run-1" };
        const launched = await runtime.commands.launch({
            goalId: ref.goalId,
            intent: "走到等待点",
            profileId: profile.id,
        });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(runtime.lifecycle.activeOperationCount, 0);

        // 等待点上的模型选择与归档在受理边界内结算。
        const selection: GoalModelSelection = {
            ...runtime.defaultModelSelection,
            modelId: "model-runtime-composition",
        };
        const updated = await runtime.goalModelSelectionCoordinator.updateModelSelection({ ref, selection });
        assert.equal(updated.ok, true);
        assert.equal(runtime.lifecycle.activeOperationCount, 0);
        assert.equal(await runtime.manageGoal.setArchived(ref.goalId, true), "goal_not_terminal");
        assert.equal(runtime.lifecycle.activeOperationCount, 0);
        assert.equal(await runtime.manageGoal.delete(ref.goalId), "goal_not_terminal");
        assert.equal(runtime.lifecycle.activeOperationCount, 0);

        // 在途权限写入阻塞时，关闭等待其结算并保持 closing。
        const pendingPermission = runtime.commands.setPermissionMode("yolo", 0);
        await permissionModeStore.entered;
        const closing = runtime.lifecycle.close();
        assert.equal(runtime.lifecycle.state, "closing");
        assert.equal(runtime.lifecycle.activeOperationCount, 1);

        // 关闭中拒绝新的执行与写控制，读取仍可用。
        await assert.rejects(
            runtime.commands.launch({ goalId: "goal-blocked", intent: "不应受理", profileId: profile.id }),
            RuntimeLifecycleUnavailableError,
        );
        await assert.rejects(
            runtime.manageGoal.setArchived(ref.goalId, true),
            RuntimeLifecycleUnavailableError,
        );
        await assert.rejects(
            runtime.manageGoal.delete(ref.goalId),
            RuntimeLifecycleUnavailableError,
        );
        await assert.rejects(
            runtime.goalModelSelectionCoordinator.updateModelSelection({ ref, selection }),
            RuntimeLifecycleUnavailableError,
        );
        const mode = await runtime.commands.getPermissionMode();
        assert.equal(mode.mode, "default");
        assert.ok(await runtime.workspaceGoalStore.restore(ref.goalId));

        permissionModeStore.release();
        const completedPermission = await pendingPermission;
        assert.equal(completedPermission.mode, "yolo");
        await closing;
        assert.equal(runtime.lifecycle.state, "closed");
    } finally {
        permissionModeStore.release();
        await runtime.lifecycle.close().catch(() => undefined);
        await fixture.cleanup();
    }
});
