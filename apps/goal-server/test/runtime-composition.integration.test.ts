import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { toolCallResponse } from "../../../packages/llm-core/test/response-fixtures";
import type { LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
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
            return toolCallResponse({
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
            });
        }
        return toolCallResponse({
            callId: "fixture-wait",
            toolId: "system_wait_for_input",
            argumentsJson: JSON.stringify({ reason: "等待用户确认" }),
        });
    }
}

/** 连续提出三张问卷，之后进入 blocked 等待；用于交互处理端口用例。 */
class RepeatingAskUserAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode = "strict" as const;
    modelId = "model-runtime-composition";
    readonly calls: LLMRequest[] = [];

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls.push(request);
        if (this.calls.length <= 3) {
            return toolCallResponse({
                callId: "fixture-ask-user",
                toolId: "ask_user",
                argumentsJson: JSON.stringify({
                    questions: [
                        {
                            header: `继续方式 ${this.calls.length}`,
                            question: "Which path should be taken?",
                            options: [{ label: "Path A" }, { label: "Path B" }],
                            multiSelect: false,
                        },
                    ],
                }),
            });
        }
        return toolCallResponse({
            callId: "fixture-wait",
            toolId: "system_wait_for_input",
            argumentsJson: JSON.stringify({ reason: "等待用户确认" }),
        });
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

test("目录入口的交互端口完成程序化决定、真人接手与重建后显式恢复", async () => {
    const fixture = await setupFixture();
    const adapter = new RepeatingAskUserAdapter();
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter,
        profile,
        toolRegistry: new InMemoryToolRegistry([]),
    });
    const goalId = "goal-interaction-port";

    try {
        const created = await runtime.sessions.create({
            goalId,
            inputId: "port-input-1",
            content: "通过交互端口处理问答",
            profileId: profile.id,
        });
        assert.equal(created.ok, true);
        // 等待第一个问卷成为已提交的历史等待。
        await waitForCondition(async () => (await runtime.interactions.read(goalId))?.kind === "question");
        await runtime.sessions.waitForIdle();
        assert.equal((await runtime.interactions.read(goalId))?.kind, "question");

        // 连接前已有的历史等待不会被自动回答。
        const handledIds: string[] = [];
        const attached = await runtime.interactions.attach(goalId, {
            onQuestion: async ({ request, readDetail }) => {
                handledIds.push(request.interactionId);
                if (handledIds.length > 1 || request.kind !== "question") return { kind: "unhandled" };
                const detail = await readDetail();
                if (!detail.ok || detail.detail.kind !== "question") return { kind: "unhandled" };
                return {
                    kind: "respond",
                    response: {
                        kind: "answer_ask_user",
                        answers: detail.detail.questions.map((question) => ({
                            questionId: question.id,
                            optionIds: [question.options[0]!.id],
                        })),
                    },
                };
            },
        });
        assert.equal(attached.ok, true);
        if (!attached.ok) return;
        await runtime.sessions.waitForIdle();
        assert.deepEqual(handledIds, [], "attaching never answers a historical wait");
        assert.equal(adapter.calls.length, 1);

        // 显式恢复只解锁当前历史请求，不代替真人回答；处理函数随后按统一 send 提交。
        const opened = await runtime.sessions.open(goalId);
        assert.equal(opened.ok, true);
        if (!opened.ok) return;
        const resumed = await opened.session.send({
            kind: "resume",
            inputId: "port-resume-1",
            runId: opened.state.runId,
            commitRevision: opened.state.commitRevision,
        });
        assert.equal(resumed.ok, false);
        assert.equal(resumed.ok ? undefined : resumed.code, "INTERACTION_REQUIRED");
        await waitForCondition(() => handledIds.length === 1 && adapter.calls.length === 2);
        await runtime.sessions.waitForIdle();
        assert.equal(handledIds.length, 1, "explicit resume unlocks exactly the current wait");
        assert.equal(adapter.calls.length, 2, "the programmatic decision continues the same Run");

        await waitForCondition(async () => (await runtime.workspaceGoalStore.restore(goalId))?.state.run.status === "waiting");
        const saved = await runtime.workspaceGoalStore.restore(goalId);
        assert.ok(saved);
        assert.equal(saved.state.run.status, "waiting");
        assert.equal(
            saved.state.messages.some((message) => message.role === "user" && message.content.includes("Answer: Path A")),
            true,
            "the handler decision is committed as a real model-visible answer",
        );

        // 真人接手：第二个等待由宿主显式响应，处理函数不重复调用。
        await waitForCondition(async () => (await runtime.interactions.read(goalId))?.kind === "question");
        const waiting = await runtime.interactions.read(goalId);
        assert.equal(waiting?.kind, "question");
        if (waiting === undefined || waiting.kind !== "question") return;
        const human = await opened.session.send({
            kind: "respond",
            inputId: "port-human-1",
            runId: waiting.runId,
            requestId: waiting.requestId,
            response: { kind: "skip_question" },
        });
        assert.equal(human.ok, true);
        // 每个等待至多投递一次；同一请求不会因未处理结果反复调用。
        assert.equal(new Set(handledIds).size, handledIds.length, "each wait is delivered to the handler at most once");
        await waitForCondition(async () => {
            const next = await runtime.interactions.read(goalId);
            return next !== undefined && next.interactionId !== waiting.interactionId;
        });
        const nextWait = await runtime.interactions.read(goalId);
        assert.notEqual(nextWait?.interactionId, waiting.interactionId, "the settled wait is never re-delivered");
        assert.equal(new Set(handledIds).size, handledIds.length);
        await waitForCondition(async () => (await runtime.workspaceGoalStore.restore(goalId))?.state.messages
            .some((message) => message.role === "user" && message.content.includes("did not answer")) === true);
        const afterHuman = await runtime.workspaceGoalStore.restore(goalId);
        assert.equal(
            afterHuman?.state.messages.some((message) => message.role === "user" && message.content.includes("did not answer")),
            true,
            "the human skip is committed as an explicit control message",
        );

        // 第二次连接同一 Goal 被拒绝；解除后可以重新连接。
        const conflict = await runtime.interactions.attach(goalId, {});
        assert.deepEqual(conflict.ok ? undefined : conflict.code, "HANDLER_CONFLICT");
        attached.handle.detach();
        assert.equal(attached.handle.detached, true);
        const reattached = await runtime.interactions.attach(goalId, {});
        assert.equal(reattached.ok, true);
        reattached.ok && reattached.handle.detach();
    } finally {
        await runtime.lifecycle.close();
    }

    // 重建实例：只读连接不推进，显式恢复才允许已注册处理器处理历史等待。
    const rebuiltAdapter = new RepeatingAskUserAdapter();
    const rebuilt = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: rebuiltAdapter,
        profile,
        toolRegistry: new InMemoryToolRegistry([]),
    });
    try {
        let rebuiltHandled = 0;
        const attached = await rebuilt.interactions.attach(goalId, {
            onQuestion: async ({ readDetail }) => {
                rebuiltHandled += 1;
                const detail = await readDetail();
                if (!detail.ok || detail.detail.kind !== "question") return { kind: "unhandled" };
                return {
                    kind: "respond",
                    response: {
                        kind: "answer_ask_user",
                        answers: detail.detail.questions.map((question) => ({
                            questionId: question.id,
                            optionIds: [question.options[0]!.id],
                        })),
                    },
                };
            },
        });
        assert.equal(attached.ok, true);
        if (!attached.ok) return;
        assert.equal(rebuiltAdapter.calls.length, 0, "打开与注册不调用模型");
        assert.equal(rebuiltHandled, 0, "重建后的历史等待不会被自动回答");
        const opened = await rebuilt.sessions.open(goalId);
        assert.equal(opened.ok, true);
        if (!opened.ok) return;
        const resumed = await opened.session.send({
            kind: "resume",
            inputId: "port-resume-2",
            runId: opened.state.runId,
            commitRevision: opened.state.commitRevision,
        });
        assert.equal(resumed.ok ? undefined : resumed.code, "INTERACTION_REQUIRED");
        await waitForCondition(() => rebuiltHandled === 1);
        await rebuilt.sessions.waitForIdle();
        assert.equal(rebuiltHandled, 1, "显式恢复后重新投递仍未结算的历史等待");
        attached.handle.detach();
    } finally {
        await rebuilt.lifecycle.close();
    }
    await fixture.cleanup();
});

test("目录入口暴露的 sessions 完成创建、流式交互、问答、关闭与重建恢复", async () => {
    const fixture = await setupFixture();
    const adapter = new AskUserAdapter();
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter,
        profile,
        toolRegistry: new InMemoryToolRegistry([]),
    });

    // 创建：先持久化 Goal、首条消息、Run 与收据，再返回句柄；不启动 HTTP。
    const created = await runtime.sessions.create({
        goalId: "goal-session-entry",
        inputId: "input-first",
        content: "通过目录入口创建会话",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.existing, false);
    assert.equal(created.receipt.status, "applied");
    assert.equal((runtime as { httpService?: unknown }).httpService, undefined);

    // 流式交互：等待问答后以匹配身份回答，同一 Run 继续并在无输入时进入等待。
    await runtime.sessions.waitForIdle();
    const waiting = await created.session.read();
    assert.equal(waiting?.runStatus, "waiting");
    assert.equal(waiting?.waitingFor, "ask_user");
    const saved = await runtime.workspaceGoalStore.restore("goal-session-entry");
    assert.ok(saved);
    const answer = answersFor(saved);
    const runId = saved.state.run.id;
    const responded = await created.session.send({
        kind: "respond",
        inputId: "respond-1",
        runId,
        requestId: answer.requestId,
        response: {
            kind: "answer_ask_user",
            answers: [{ questionId: answer.questionId, optionIds: [answer.optionId] }],
        },
    });
    assert.equal(responded.ok, true);
    await runtime.sessions.waitForIdle();
    const afterAnswer = await runtime.workspaceGoalStore.restore("goal-session-entry");
    assert.equal(afterAnswer?.state.run.id, runId);
    assert.equal(afterAnswer?.state.run.status, "waiting");

    // 订阅输出：首项是一致状态同步，其后包含输入结果。
    const events: unknown[] = [];
    const stream = created.session.events();
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    for (let tick = 0; tick < 50 && events.length === 0; tick += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal((events[0] as { type?: string }).type, "state_sync");
    const queued = await created.session.send({ kind: "message", inputId: "input-queued", content: "等待后的后续任务" });
    assert.equal(queued.ok, true);
    for (let tick = 0; tick < 50 && !events.some((event) => (event as { type?: string }).type === "input_result"); tick += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(events.some((event) => (event as { type?: string }).type === "input_result"));
    stream.close();
    await consumed;

    // 关闭实例：会话订阅、输入消费与自有资源参与关闭结算。
    await runtime.lifecycle.close();

    // 重建实例：只读连接不推进、不调用模型；显式恢复继续已受理工作。
    const adapterAfterRestart = new AskUserAdapter();
    const rebuilt = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: adapterAfterRestart,
        profile,
        toolRegistry: new InMemoryToolRegistry([]),
    });
    try {
        const opened = await rebuilt.sessions.open("goal-session-entry");
        assert.equal(opened.ok, true);
        if (!opened.ok) return;
        assert.equal(adapterAfterRestart.calls.length, 0);
        assert.equal(opened.state.pendingMessageCount, 1);
        const resumed = await opened.session.send({
            kind: "resume",
            inputId: "resume-1",
            runId: opened.state.runId,
            commitRevision: opened.state.commitRevision,
            content: "继续执行已受理任务",
        });
        assert.equal(resumed.ok, true);
        await rebuilt.sessions.waitForIdle();
        // 显式恢复只推进当前 Run：恢复文本成为真实用户消息，模型恰好被调用一次。
        assert.equal(adapterAfterRestart.calls.length, 1);
        const finished = await rebuilt.workspaceGoalStore.restore("goal-session-entry");
        assert.equal(finished?.state.run.id, opened.state.runId);
        assert.equal(finished?.state.run.status, "waiting");
        assert.ok(
            finished?.state.messages.some((message) => message.role === "user" && message.content === "继续执行已受理任务"),
        );
        assert.equal(
            finished?.state.inputLedger?.find((record) => record.inputId === "resume-1")?.status,
            "applied",
        );
        // blocked 等待不消费队列：已受理的普通消息保留到显式继续。
        assert.deepEqual(finished?.state.messageQueue?.items.map((item) => item.inputId), ["input-queued"]);
    } finally {
        await rebuilt.lifecycle.close();
    }
    await fixture.cleanup();
});

/** 有界等待宿主处理函数完成；处理调用在提交 Gate 外异步运行。 */
async function waitForCondition(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
    const startedAt = Date.now();
    while (!(await predicate()) && Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
