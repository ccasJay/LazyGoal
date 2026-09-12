import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createToolRegistration,
    GoalCoordinator,
    InlineScheduler,
    InMemoryToolRegistry,
    resolveAuthorizedToolDefinitions,
    type AgentProfile,
    type Goal,
    type GoalStore,
    type PreparationExecutionInput,
    type PreparationExecutor,
    type PreparationProbeResult,
    type PreparationProbeProgressEvent,
    type PreparationResult,
    type RunScheduler,
    type Tool,
    type ToolDefinition,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { contract } from "../../contracts/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const TEST_INPUT_CONTRACT = contract.record(contract.string());

function createUnusedScheduler(): RunScheduler {
    return new InlineScheduler({
        runUntilBlocked: async () => {
            throw new Error("Unexpected Scheduler call");
        },
    });
}

class RecordingPreparationExecutor implements PreparationExecutor {
    readonly receivedInputs: PreparationExecutionInput[] = [];

    constructor(private readonly decisions: readonly PreparationResult[]) {}

    async execute(input: PreparationExecutionInput): Promise<PreparationResult> {
        const decision = this.decisions[this.receivedInputs.length];
        this.receivedInputs.push(structuredClone({
            ...input,
            // 复制引用避免后续污染
            authorizedTools: [...input.authorizedTools],
        }));

        if (decision === undefined) {
            throw new Error(`Unexpected PreparationExecutor call at index ${this.receivedInputs.length - 1}`);
        }

        return decision;
    }
}

test("gathering 阶段自主发起只读探查并接收观察，最后产出 question (Req 2.1)", async () => {
    const profile: AgentProfile = {
        id: "profile-probe-1",
        systemPrompt: "You are a focused agent.",
        instructions: ["Prepare before execution."],
        toolIds: ["read_file"],
    };

    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-probe-gathering",
        intent: "澄清并调研代码库结构",
        profile,
        runId: "run-probe-gathering",
    });

    const store = new InMemoryGoalStore();
    await store.save(initial);
    const trajectoryStore = trajectoryStoreFor(store);

    let executedProbeCount = 0;
    const readDefinition: ToolDefinition<typeof TEST_INPUT_CONTRACT> = {
        id: "read_file",
        description: "读取文件",
        inputContract: TEST_INPUT_CONTRACT,
        isReadOnly: true,
    };
    const readTool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: readDefinition,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute(actionId, control) {
            executedProbeCount++;
            return {
                kind: "success",
                output: { content: "# Project Readme\nVersion 1.0" },
                summary: "读取 package.json 成功",
            };
        },
    };

    const executor = new RecordingPreparationExecutor([
        // 第 1 轮：发起只读探查
        {
            kind: "probe_action",
            action: { toolId: "read_file", input: { path: "README.md" } },
        },
        // 第 2 轮：基于探查结果向用户提问
        {
            kind: "question",
            question: "README 显示为 1.0 版本，是否继续？",
        },
    ]);

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: {
            get: (toolId) => toolId === "read_file" ? createToolRegistration(readTool) : undefined,
        },
    });

    const result = await coordinator.advance({ goalId: initial.id, runId: initial.state.run.id });

    // 1. 探查工具实际被调用了一次
    assert.equal(executedProbeCount, 1);

    // 2. 最终进入 question 等待态
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.kind, "waiting");
        assert.equal(result.phase, "gathering_context");
        assert.equal(result.waitingFor, "question");
    }

    // 3. Executor 共被调用 2 轮；第 2 轮输入携带了第 1 轮的 lastProbeResult
    assert.equal(executor.receivedInputs.length, 2);
    assert.equal(executor.receivedInputs[0]?.lastProbeResult, undefined);
    assert.notEqual(executor.receivedInputs[1]?.lastProbeResult, undefined);
    assert.equal(executor.receivedInputs[1]?.lastProbeResult?.action.toolId, "read_file");
    assert.equal(executor.receivedInputs[1]?.lastProbeResult?.observation.kind, "success");
    assert.match(executor.receivedInputs[1]?.lastProbeResult?.actionId ?? "", /^probe-goal-probe-gathering-/);
    assert.equal(typeof executor.receivedInputs[1]?.lastProbeResult?.observationSequence, "number");

    // 4. Trajectory 完整记录了 probe_action 的事实事件
    const events = await trajectoryStore.read({ goalId: initial.id, runId: initial.state.run.id });
    const probeResults = events.filter((e) => e.eventType === "preparation_result" && (e.payload as any).result === "probe_action");
    assert.equal(probeResults.length, 1);
    const toolStarted = events.filter((e) => e.eventType === "tool_started");
    assert.equal(toolStarted.length, 1);
    assert.equal((toolStarted[0]?.payload as any).toolId, "read_file");
    const toolFinished = events.filter((e) => e.eventType === "tool_finished");
    assert.equal(toolFinished.length, 1);
});

test("planning 阶段自主发起只读探查并最终收敛为 task_proposal (Req 2.2)", async () => {
    const profile: AgentProfile = {
        id: "profile-probe-planning",
        systemPrompt: "You are a focused agent.",
        instructions: ["Prepare before execution."],
        toolIds: ["grep"],
    };

    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-probe-planning",
        intent: "设计重构方案",
        profile,
        runId: "run-probe-planning",
    });

    const planningGoal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
        },
    };

    const store = new InMemoryGoalStore();
    await store.save(planningGoal);
    const trajectoryStore = trajectoryStoreFor(store);

    let grepCount = 0;
    const grepTool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "grep",
            description: "搜索代码",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            grepCount++;
            return {
                kind: "success",
                output: { matches: 5 },
                summary: "找到 5 处匹配",
            };
        },
    };

    const executor = new RecordingPreparationExecutor([
        // 第 1 轮：发起只读探查
        {
            kind: "probe_action",
            action: { toolId: "grep", input: { pattern: "deprecated" } },
        },
        // 第 2 轮：产出正式 proposal
        {
            kind: "task_proposal",
            task: {
                objective: "清理 5 处 deprecated 调用",
                completionCriteria: [{ text: "无剩余 deprecated" }],
            },
            approvalRequest: "是否批准执行？",
        },
    ]);

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: {
            get: (toolId) => toolId === "grep" ? createToolRegistration(grepTool) : undefined,
        },
    });

    const result = await coordinator.advance({ goalId: planningGoal.id, runId: planningGoal.state.run.id });

    assert.equal(grepCount, 1);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.kind, "waiting");
        assert.equal(result.phase, "planning");
        assert.equal(result.waitingFor, "approval");
    }

    // 检查 planning 阶段的探查事实是否完整写入 Trajectory
    const events = await trajectoryStore.read({ goalId: planningGoal.id, runId: planningGoal.state.run.id });
    const grepStarted = events.filter((e) => e.eventType === "tool_started" && (e.payload as any).toolId === "grep");
    assert.equal(grepStarted.length, 1);
    const grepFinished = events.filter((e) => e.eventType === "tool_finished" && (e.payload as any).toolId === "grep");
    assert.equal(grepFinished.length, 1);
    assert.equal((grepFinished[0]?.payload as any).observation.kind, "success");
});

test("安全拦截：准备阶段尝试调用非只读工具（如 write_file）立即拦截并拒绝 (Req 3.1, 3.2)", async () => {
    const profile: AgentProfile = {
        id: "profile-probe-write",
        systemPrompt: "You are a focused agent.",
        instructions: ["Prepare before execution."],
        toolIds: ["write_file"],
    };

    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-probe-write-block",
        intent: "试图在准备阶段写入文件",
        profile,
        runId: "run-probe-write-block",
    });

    const store = new InMemoryGoalStore();
    await store.save(initial);
    const trajectoryStore = trajectoryStoreFor(store);

    let writeExecuted = false;
    const writeTool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "write_file",
            description: "写入文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false, // 显式非只读
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            writeExecuted = true;
            return {
                kind: "success",
                output: null,
                summary: "写入完成",
            };
        },
    };

    const executor = new RecordingPreparationExecutor([
        {
            kind: "probe_action",
            action: { toolId: "write_file", input: { path: "bad.txt", content: "malicious" } },
        },
    ]);

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: {
            get: (toolId) => toolId === "write_file" ? createToolRegistration(writeTool) : undefined,
        },
    });

    const result = await coordinator.advance({ goalId: initial.id, runId: initial.state.run.id });

    // 1. 动作被立即拦截，返回 PREPARATION_READ_ONLY_VIOLATION
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, "PREPARATION_READ_ONLY_VIOLATION");
    }

    // 2. 写工具绝对未执行（工作区零写入零副作用）
    assert.equal(writeExecuted, false);
});

test("熔断保护：准备阶段达到 5 步后要求 Executor 收敛为阶段结果 (Req 2.3)", async () => {
    const profile: AgentProfile = {
        id: "profile-probe-limit",
        systemPrompt: "You are a focused agent.",
        instructions: ["Prepare before execution."],
        toolIds: ["read_file"],
    };

    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-probe-limit",
        intent: "无休止探查",
        profile,
        runId: "run-probe-limit",
    });

    const store = new InMemoryGoalStore();
    await store.save(initial);
    const trajectoryStore = trajectoryStoreFor(store);

    let probeCount = 0;
    const readTool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            probeCount++;
            return {
                kind: "success",
                output: { step: probeCount },
                summary: `第 ${probeCount} 步完成`,
            };
        },
    };

    const decisions: PreparationResult[] = Array.from({ length: 5 }, (_, i) => ({
        kind: "probe_action" as const,
        action: { toolId: "read_file", input: { step: String(i + 1) } },
    }));
    decisions.push({ kind: "question", question: "请确认调查范围" });

    const executor = new RecordingPreparationExecutor(decisions);

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: {
            get: (toolId) => toolId === "read_file" ? createToolRegistration(readTool) : undefined,
        },
    });

    const result = await coordinator.advance({ goalId: initial.id, runId: initial.state.run.id });

    // 1. 探查刚好执行了 5 次
    assert.equal(probeCount, 5);

    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.kind, "waiting");
    }
    assert.equal(executor.receivedInputs.length, 6);
    assert.equal(executor.receivedInputs[5]?.probeLimitReached, true);
    assert.deepEqual(executor.receivedInputs[5]?.authorizedTools, []);
});

test("探查工具未授权或未注册时被严格拦截", async () => {
    const profile: AgentProfile = {
        id: "profile-probe-unauth",
        systemPrompt: "You are a focused agent.",
        instructions: ["Prepare before execution."],
        toolIds: ["read_file"], // 仅授权了 read_file
    };

    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-probe-unauth",
        intent: "调用未授权工具",
        profile,
        runId: "run-probe-unauth",
    });

    const store = new InMemoryGoalStore();
    await store.save(initial);
    const trajectoryStore = trajectoryStoreFor(store);

    const executor = new RecordingPreparationExecutor([
        {
            kind: "probe_action",
            action: { toolId: "unauthorized_tool", input: {} },
        },
    ]);

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: {
            get: () => undefined,
        },
    });

    const result = await coordinator.advance({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, "TOOL_NOT_AUTHORIZED");
    }
});

test("用户回答后再次探查会生成新的稳定 actionId", async () => {
    const profile: AgentProfile = {
        id: "profile-probe-resume",
        systemPrompt: "You are a focused agent.",
        instructions: ["Prepare before execution."],
        toolIds: ["read_file"],
    };
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-probe-resume",
        intent: "分两轮调查",
        profile,
        runId: "run-probe-resume",
    });
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const trajectoryStore = trajectoryStoreFor(store);
    const readTool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => ({ kind: "success", output: "ok", summary: "读取成功" }),
    };
    const executor = new RecordingPreparationExecutor([
        { kind: "probe_action", action: { toolId: "read_file", input: { path: "a" } } },
        { kind: "question", question: "继续吗？" },
        { kind: "probe_action", action: { toolId: "read_file", input: { path: "b" } } },
        { kind: "question", question: "还继续吗？" },
    ]);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: { get: () => createToolRegistration(readTool) },
    });

    const first = await coordinator.advance({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(first.ok && first.kind, "waiting");
    const second = await coordinator.resume({
        ref: { goalId: initial.id, runId: initial.state.run.id },
        action: { kind: "message", content: "继续" },
    });
    assert.equal(second.ok && second.kind, "waiting");

    const events = await trajectoryStore.read({ goalId: initial.id, runId: initial.state.run.id });
    const actionIds = events
        .filter((event) => event.eventType === "tool_finished")
        .map((event) => event.actionId);
    assert.equal(actionIds.length, 2);
    assert.notEqual(actionIds[0], actionIds[1]);
});

test("探查执行失败会发送与 started 配对的 failed 进度事件", async () => {
    const profile: AgentProfile = {
        id: "profile-probe-failure",
        systemPrompt: "You are a focused agent.",
        instructions: ["Prepare before execution."],
        toolIds: ["read_file"],
    };
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-probe-failure",
        intent: "读取失败",
        profile,
        runId: "run-probe-failure",
    });
    const store = new InMemoryGoalStore();
    await store.save(initial);
    const progress: PreparationProbeProgressEvent[] = [];
    const tool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => {
            throw new Error("read failed");
        },
    };
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        preparationExecutor: new RecordingPreparationExecutor([
            { kind: "probe_action", action: { toolId: "read_file", input: { path: "missing" } } },
        ]),
        scheduler: createUnusedScheduler(),
        toolRegistry: { get: () => createToolRegistration(tool) },
        onProbeProgress: (event) => progress.push(event),
    });

    const result = await coordinator.advance({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, false);
    assert.deepEqual(progress.map((event) => event.kind), ["started", "failed"]);
    assert.equal(progress[0]?.actionId, progress[1]?.actionId);
});

test("resolveAuthorizedToolDefinitions 完整保留工具定义的 isReadOnly 属性", () => {
    const readOnlyTool: Tool = {
        definition: {
            id: "read_file",
            description: "Read file content",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => ({ kind: "success", output: "ok", summary: "ok" }),
    };

    const modifyingTool: Tool = {
        definition: {
            id: "write_file",
            description: "Write file content",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => ({ kind: "success", output: "ok", summary: "ok" }),
    };

    const defaultTool: Tool = {
        definition: {
            id: "bash",
            description: "Execute bash command",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => ({ kind: "success", output: "ok", summary: "ok" }),
    };

    const registry = new InMemoryToolRegistry([
        createToolRegistration(readOnlyTool),
        createToolRegistration(modifyingTool),
        createToolRegistration(defaultTool),
    ]);
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-resolve-tools",
        intent: "测试工具解析",
        profile: {
            id: "profile-test",
            name: "Test Profile",
            description: "Test",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["read_file", "write_file", "bash"],
        },
        runId: "run-resolve-tools",
    });

    const resolved = resolveAuthorizedToolDefinitions(goal, registry);
    assert.equal(resolved.length, 3);
    assert.equal(resolved[0]?.id, "read_file");
    assert.equal(resolved[0]?.isReadOnly, true);

    assert.equal(resolved[1]?.id, "write_file");
    assert.equal(resolved[1]?.isReadOnly, false);

    assert.equal(resolved[2]?.id, "bash");
    assert.equal(resolved[2]?.isReadOnly, false);
});
