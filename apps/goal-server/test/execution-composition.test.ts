import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    createGoal,
    createStepExecutor,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type GoalStore,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryStore,
} from "../../../packages/runtime/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type Tool,
} from "../../../packages/tool-core/src/index";
import { contract } from "../../../packages/contracts/src/index";
import {
    InMemoryGoalStore,
    JsonFileGoalStore,
    JsonFileTrajectoryStore,
} from "../../../packages/storage/src/index";
import {
    createExecutionComponents,
    type ExecutionComponentDependencies,
} from "../src/runtime/index";

const profile: AgentProfile = {
    id: "profile-execution-composition",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Reach a waiting point, then finish the goal."],
    toolIds: ["read_file"],
};

class SingleProfileRegistry implements AgentProfileRegistry {
    get(profileId: string): AgentProfile | undefined {
        return profileId === profile.id ? profile : undefined;
    }
}

/** 记录写入次数的借用 Store；组件不得在关闭意义上拥有它。 */
class RecordingGoalStore implements GoalStore {
    readonly saved: Goal[] = [];
    private readonly delegate = new InMemoryGoalStore();

    save(goal: Goal): Promise<void> {
        this.saved.push(goal);
        return this.delegate.save(goal);
    }

    restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }
}

class RecordingTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(
            draft,
            this.events.length === 0 ? 1 : this.events[this.events.length - 1]!.sequence + 1,
        );
        this.events.push(event);
        return Promise.resolve(event);
    }

    read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return Promise.resolve(this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence)));
    }

    readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<{
        readonly committed: readonly TrajectoryEvent[];
        readonly uncommittedTail: readonly TrajectoryEvent[];
    }> {
        const events = this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence));
        return Promise.resolve({
            committed: events.filter((event) => event.sequence <= committedThroughSequence),
            uncommittedTail: events.filter((event) => event.sequence > committedThroughSequence),
        });
    }
}

function readFileTool(onExecute?: () => void): Tool {
    return {
        definition: {
            id: "read_file",
            description: "Read a file",
            inputContract: contract.object({ path: contract.string() }),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            onExecute?.();
            return {
                kind: "success",
                output: { path: (input as { readonly path: string }).path, content: "composition facts" },
                summary: "Read composition facts",
            };
        },
    };
}

class ScriptedExecutor {
    calls = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {}

    readonly executor = createStepExecutor(async () => {
        const decision = this.decisions[this.calls];
        this.calls += 1;

        if (decision === undefined) {
            throw new Error("Unexpected StepExecutor call");
        }

        return decision;
    }, async () => ({ kind: "accept" as const }));
}

function createDependencies(options: {
    readonly store: GoalStore;
    readonly executor: ExecutionComponentDependencies["executor"];
    readonly trajectoryStore?: TrajectoryStore;
    readonly toolRegistry?: InMemoryToolRegistry;
    readonly runIdGenerator: () => string;
}): ExecutionComponentDependencies {
    return {
        store: options.store,
        executor: options.executor,
        profiles: new SingleProfileRegistry(),
        toolRegistry: options.toolRegistry ?? new InMemoryToolRegistry([createToolRegistration(readFileTool())]),
        toolPolicy: { evaluate: () => "allow" },
        ...(options.trajectoryStore === undefined ? {} : { trajectoryStore: options.trajectoryStore }),
        runIdGenerator: options.runIdGenerator,
    };
}

test("仅注入现有 Port 即可推进到等待点、只读恢复与终态后后继 Run", async () => {
    const store = new RecordingGoalStore();
    const trajectoryStore = new RecordingTrajectoryStore();
    const executor = new ScriptedExecutor([
        {
            kind: "ask_user",
            questions: [
                {
                    header: "持久化后端",
                    question: "Which persistence backend should be used?",
                    options: [{ label: "JSON" }, { label: "SQLite" }],
                    multiSelect: false,
                },
            ],
        },
        { kind: "fail", error: "第二次推进按脚本失败" },
        { kind: "wait", reason: "后继 Run 等待用户确认" },
    ]);
    const toolRegistry = new InMemoryToolRegistry([createToolRegistration(readFileTool())]);
    let runCounter = 0;
    const components = createExecutionComponents(createDependencies({
        store,
        executor: executor.executor,
        trajectoryStore,
        toolRegistry,
        runIdGenerator: () => `run-${++runCounter}`,
    }));

    // 组件只返回调用方需要的命令 Port，不暴露 Runner、提交器或 Coordinator。
    assert.deepEqual(Object.keys(components), ["commands"]);

    const launched = await components.commands.launch({
        goalId: "goal-composition",
        intent: "走到等待点",
        profileId: profile.id,
    });

    if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
    assert.equal(launched.kind, "waiting");
    assert.equal(launched.waitingFor, "ask_user");
    assert.equal(executor.calls, 1);
    assert.equal(launched.goal.state.run.id, "run-1");

    // Launcher、Runner 与 Coordinator 共用同一 Store 与 Trajectory 提交边界。
    const runEvents = trajectoryStore.events.filter((event) => event.runId === "run-1");
    assert.ok(runEvents.length > 0);
    const boundary = launched.goal.state.run.committedThroughSequence;
    const committed = runEvents.filter((event) => event.sequence <= boundary);
    assert.ok(committed.length > 0);
    assert.equal(Math.max(...committed.map((event) => event.sequence)), boundary);
    assert.deepEqual(
        runEvents.filter((event) => event.sequence > boundary).map((event) => event.eventType),
        ["state_committed"],
    );
    assert.ok(store.saved.length > 0);
    assert.equal(
        store.saved[store.saved.length - 1]!.state.run.committedThroughSequence,
        boundary,
    );

    // 只读恢复不推进：读取快照不触发模型或工具调用。
    const restored = await store.restore("goal-composition");
    assert.deepEqual(restored, launched.goal);
    assert.equal(restored?.state.run.pendingInteraction?.kind, "ask_user");
    assert.equal(executor.calls, 1);

    const pendingInteraction = launched.goal.state.run.pendingInteraction;
    assert.equal(pendingInteraction?.kind, "ask_user");
    if (pendingInteraction?.kind !== "ask_user") assert.fail("Expected a pending ask_user interaction");
    const question = pendingInteraction.questions[0]!;
    const option = question.options[0]!;

    const resumed = await components.commands.resume({
        ref: { goalId: "goal-composition", runId: "run-1" },
        action: {
            kind: "answer_ask_user",
            requestId: pendingInteraction.requestId,
            answers: [{ questionId: question.id, optionIds: [option.id] }],
        },
    });

    if (!resumed.ok) assert.fail(`${resumed.error.code}: ${resumed.error.message}`);
    assert.equal(resumed.kind, "terminal");
    assert.equal(resumed.goal.state.run.status, "failed");
    assert.equal(executor.calls, 2);
    assert.equal(resumed.goal.state.run.id, "run-1");

    // 终态后的显式 continue 存档旧 Run 并创建后继 Run。
    const continued = await components.commands.continue(
        { goalId: "goal-composition", runId: "run-1" },
        "请在新 Run 继续",
    );

    if (!continued.ok) assert.fail(`${continued.error.code}: ${continued.error.message}`);
    assert.equal(continued.kind, "waiting");
    assert.equal(continued.waitingFor, "blocked");
    assert.equal(continued.goal.state.run.id, "run-2");
    assert.equal(continued.goal.state.run.status, "waiting");
    assert.equal(executor.calls, 3);
    assert.ok(
        continued.goal.state.completedRuns?.some(
            (record) => record.runId === "run-1" && record.status === "failed",
        ),
    );

    // 输入依赖仍归调用方拥有：继续可用且未被组件关闭。
    assert.equal(toolRegistry.get("read_file")?.definition.id, "read_file");
    assert.deepEqual(await store.restore("goal-composition"), continued.goal);
});

test("构造组件不注册进程信号，也不接管调用方依赖", async () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const store = new RecordingGoalStore();
    const toolRegistry = new InMemoryToolRegistry([createToolRegistration(readFileTool())]);
    const components = createExecutionComponents(createDependencies({
        store,
        executor: new ScriptedExecutor([{ kind: "wait", reason: "未推进" }]).executor,
        toolRegistry,
        runIdGenerator: () => "run-1",
    }));

    assert.equal(process.listenerCount("SIGINT"), sigintBefore);
    assert.equal(process.listenerCount("SIGTERM"), sigtermBefore);
    assert.deepEqual(Object.keys(components.commands).sort(), [
        "advance",
        "continue",
        "enterPlanMode",
        "getPermissionMode",
        "interrupt",
        "launch",
        "listGrants",
        "listToolGrants",
        "resume",
        "reviewActionApproval",
        "revokeGrant",
        "revokeToolGrant",
        "setPermissionMode",
        "steer",
    ]);
});

test("初始保存失败不会调用执行器或工具，也不破坏借用的 Store", async () => {
    let toolCalls = 0;
    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(readFileTool(() => {
            toolCalls += 1;
        })),
    ]);
    const executor = new ScriptedExecutor([{ kind: "wait", reason: "不应被调用" }]);
    const delegate = new InMemoryGoalStore();
    let failNextSave = true;
    const store: GoalStore = {
        async save(goal) {
            if (failNextSave) {
                failNextSave = false;
                throw new Error("initial save failed");
            }
            await delegate.save(goal);
        },
        restore: (goalId) => delegate.restore(goalId),
    };
    const components = createExecutionComponents(createDependencies({
        store,
        executor: executor.executor,
        toolRegistry,
        runIdGenerator: () => "run-1",
    }));

    await assert.rejects(
        components.commands.launch({
            goalId: "goal-save-failure",
            intent: "初始保存失败",
            profileId: profile.id,
        }),
        /initial save failed/,
    );

    assert.equal(executor.calls, 0);
    assert.equal(toolCalls, 0);

    // 借用 Store 的后续使用仍由调用方决定。
    await store.save(createInitialGoalForTest());
    assert.ok(await store.restore("goal-save-failure-seed"));
});

test("替换为文件 Store 与另一执行器可继续同一等待点，无需修改组件", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lg-execution-composition-"));
    try {
        const store = new JsonFileGoalStore(directory);
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "trajectories"));
        const firstExecutor = new ScriptedExecutor([
            {
                kind: "ask_user",
                questions: [
                    {
                        header: "继续方式",
                        question: "Continue with the file store?",
                        options: [{ label: "Yes" }, { label: "No" }],
                        multiSelect: false,
                    },
                ],
            },
        ]);
        const first = createExecutionComponents(createDependencies({
            store,
            executor: firstExecutor.executor,
            trajectoryStore,
            runIdGenerator: () => "run-1",
        }));

        const launched = await first.commands.launch({
            goalId: "goal-file-store",
            intent: "使用文件 Store",
            profileId: profile.id,
        });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(launched.kind, "waiting");

        // 第二个组件实例使用同一持久化位置和另一执行器继续，原等待点可读。
        const secondExecutor = new ScriptedExecutor([{ kind: "wait", reason: "后继 Run 等待" }]);
        const second = createExecutionComponents(createDependencies({
            store,
            executor: secondExecutor.executor,
            trajectoryStore,
            runIdGenerator: () => "run-2",
        }));
        const restored = await store.restore("goal-file-store");
        assert.equal(restored?.state.run.id, "run-1");

        const pendingInteraction = restored!.state.run.pendingInteraction;
        if (pendingInteraction?.kind !== "ask_user") assert.fail("Expected a pending ask_user interaction");
        const question = pendingInteraction.questions[0]!;
        const option = question.options[0]!;

        const resumed = await second.commands.resume({
            ref: { goalId: "goal-file-store", runId: "run-1" },
            action: {
                kind: "answer_ask_user",
                requestId: pendingInteraction.requestId,
                answers: [{ questionId: question.id, optionIds: [option.id] }],
            },
        });

        if (!resumed.ok) assert.fail(`${resumed.error.code}: ${resumed.error.message}`);
        assert.equal(resumed.kind, "waiting");
        assert.equal(resumed.waitingFor, "blocked");
        assert.equal(resumed.goal.state.run.id, "run-1");
        assert.equal(secondExecutor.calls, 1);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

function createInitialGoalForTest(): Goal {
    return createGoal({
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        promptBundleVersion: 1,
        id: "goal-save-failure-seed",
        intent: "借用 Store 后续可用",
        profile,
        runId: "run-seed",
    });
}
