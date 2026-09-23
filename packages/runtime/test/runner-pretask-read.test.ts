import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    createGoal,
    createToolRegistration,
    InMemoryToolRegistry,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
    type Tool,
    type ToolDefinition,
    type ToolPolicy,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { trajectoryStoreFor } from "./current-fixtures";
import { contract } from "../../contracts/src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a helpful assistant.",
    instructions: ["Read only the necessary facts, propose a task, then execute it."],
    toolIds: ["read_file", "write_file", "failing_read", "throwing_read"],
};

const READ_FILE_DEFINITION: ToolDefinition = {
    id: "read_file",
    description: "Read file content",
    inputContract: contract.object({ path: contract.string() }),
    isReadOnly: true,
};

const WRITE_FILE_DEFINITION: ToolDefinition = {
    id: "write_file",
    description: "Write file content",
    inputContract: contract.object({ path: contract.string(), content: contract.string() }),
    isReadOnly: false,
};

const FAILING_READ_DEFINITION: ToolDefinition = {
    id: "failing_read",
    description: "Read that returns domain failure",
    inputContract: contract.object({ path: contract.string() }),
    isReadOnly: true,
};

const THROWING_READ_DEFINITION: ToolDefinition = {
    id: "throwing_read",
    description: "Read that throws unexpected error",
    inputContract: contract.object({ path: contract.string() }),
    isReadOnly: true,
};

function createMockTool(
    definition: ToolDefinition,
    impl?: {
        execute?: (input: unknown) => Promise<any>;
    },
): Tool {
    return {
        definition,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute(input) {
            if (impl?.execute) {
                return impl.execute(input);
            }
            return {
                kind: "success",
                output: { executed: true, input },
                summary: `Executed ${definition.id}`,
            };
        },
    };
}

class QueueStepExecutor implements StepExecutor {
    private queue: AgentDecision[] = [];
    calls = 0;

    enqueue(...decisions: AgentDecision[]): void {
        this.queue.push(...decisions);
    }

    async execute({ goal: _goal }: StepExecutionInput): Promise<AgentDecision> {
        this.calls += 1;
        const next = this.queue.shift();
        if (next === undefined) {
            throw new Error("QueueStepExecutor: no queued decision available");
        }
        return next;
    }
}

test("无任务只读 Action: 使用普通生命周期计 Step，并在同一次推进中提交任务提案", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(createMockTool(READ_FILE_DEFINITION)),
        createToolRegistration(createMockTool(WRITE_FILE_DEFINITION)),
    ]);

    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
        trajectoryStore,
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-pretask-read-1",
        intent: "读取并规划",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-pretask-read-1",
        mode: "plan",
    });
    await store.save(goal);

    // 第一步：模型返回普通只读 Action
    // 第二步：模型返回任务提案
    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-read-1",
                toolId: "read_file",
                input: { path: "package.json" },
            },
        },
        {
            kind: "task_proposal",
            task: {
                objective: "基于读取结果实现目标",
                completionCriteria: [{ text: "读取完成" }],
            },
            approvalRequest: "请批准任务",
        },
    );

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });

    // 推进结果为等待任务批准
    assert.equal(result.ok, true);
    assert.equal(result.kind, "waiting");
    if (result.kind === "waiting") {
        assert.equal(result.waitingFor, "task_approval");
    }

    // 验证快照：普通只读 Action 必须计为一个 Step。
    const latestGoal = await store.restore(goal.id);
    assert.ok(latestGoal !== undefined);
    assert.equal(latestGoal.state.run.stepCount, 1);
    assert.equal(latestGoal.state.run.pendingAction, undefined);
    assert.equal(latestGoal.state.run.lastStep?.kind, "action");
    assert.equal(latestGoal.state.run.lastStep?.action.actionId, "action-read-1");

    // 验证 Trajectory 统一事件流
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    const eventTypes = events.map((e) => e.eventType);
    assert.ok(eventTypes.includes("tool_started"));
    assert.ok(eventTypes.includes("tool_finished"));
    assert.ok(eventTypes.includes("observation_recorded"));
    assert.ok(eventTypes.includes("decision_received"));

    assert.ok(eventTypes.includes("action_staged"));
    // 确保没有阶段专属事件
    assert.equal(eventTypes.includes("preparation_result" as any), false);
});

test("无任务只读 Action: require_approval 使用普通 pendingAction 恢复路径", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();
    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(createMockTool(READ_FILE_DEFINITION)),
    ]);
    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
        toolPolicy: { evaluate: () => "require_approval" },
        trajectoryStore,
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        trajectoryStore,
    });
    const goal = createGoal({
        id: "goal-pretask-read-approval",
        intent: "批准只读读取",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-pretask-read-approval",
        mode: "plan",
    });
    await store.save(goal);
    stepExecutor.enqueue({
        kind: "tool_call",
        action: {
            actionId: "action-read-approval",
            toolId: "read_file",
            input: { path: "package.json" },
        },
    });

    const waiting = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(waiting.ok, true);
    assert.equal(waiting.kind, "waiting");
    if (waiting.kind === "waiting") {
        assert.equal(waiting.waitingFor, "action_approval");
    }

    const pending = await store.restore(goal.id);
    assert.ok(pending !== undefined);
    assert.equal(pending.state.run.stepCount, 0);
    assert.deepEqual(pending.state.run.pendingAction, {
        action: {
            actionId: "action-read-approval",
            toolId: "read_file",
            input: { path: "package.json" },
        },
        status: "awaiting_approval",
    });

    stepExecutor.enqueue({
        kind: "task_proposal",
        task: {
            objective: "基于读取结果执行目标",
            completionCriteria: [{ text: "读取已纳入任务上下文" }],
        },
        approvalRequest: "请批准任务",
    });
    const resumed = await coordinator.resume({
        ref: { goalId: goal.id, runId: goal.state.run.id },
        action: { kind: "approve_action", actionId: "action-read-approval" },
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.kind, "waiting");
    if (resumed.kind === "waiting") {
        assert.equal(resumed.waitingFor, "task_approval");
    }

    const completedRead = await store.restore(goal.id);
    assert.ok(completedRead !== undefined);
    assert.equal(completedRead.state.run.stepCount, 1);
    assert.equal(completedRead.state.run.pendingAction, undefined);
});

test("无任务只读 Action: maxSteps 统一计入前置读取", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();
    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry: new InMemoryToolRegistry([
            createToolRegistration(createMockTool(READ_FILE_DEFINITION)),
        ]),
        trajectoryStore,
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        trajectoryStore,
    });
    const goal = createGoal({
        id: "goal-pretask-read-budget",
        intent: "读取并限制预算",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-pretask-read-budget",
        mode: "plan",
        maxSteps: 1,
    });
    await store.save(goal);
    stepExecutor.enqueue({
        kind: "tool_call",
        action: {
            actionId: "action-read-budget",
            toolId: "read_file",
            input: { path: "package.json" },
        },
    });

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "terminal");
    if (result.kind === "terminal") {
        assert.equal(result.goal.state.run.status, "failed");
        assert.deepEqual(result.goal.state.run.stopReason, { kind: "max_steps_exceeded" });
    }
    assert.equal(stepExecutor.calls, 1);

    const latestGoal = await store.restore(goal.id);
    assert.ok(latestGoal !== undefined);
    assert.equal(latestGoal.state.run.stepCount, 1);
    assert.equal(latestGoal.state.run.lastStep?.kind, "action");
});

test("无任务只读 Action: 领域 failure 也通过普通 Observation 计 Step", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();

    const failingReadTool = createMockTool(FAILING_READ_DEFINITION, {
        async execute() {
            return {
                kind: "failure",
                code: "FILE_NOT_FOUND",
                message: "File not found",
                retryable: false,
            };
        },
    });

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(failingReadTool),
    ]);

    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
        trajectoryStore,
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-pretask-read-failure",
        intent: "处理读取失败",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-pretask-read-failure",
        mode: "plan",
    });
    await store.save(goal);

    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-read-fail",
                toolId: "failing_read",
                input: { path: "missing.json" },
            },
        },
        {
            kind: "task_proposal",
            task: {
                objective: "根据缺失文件制定补救计划",
                completionCriteria: [{ text: "计划确认" }],
            },
            approvalRequest: "文件缺失，是否继续？",
        },
    );

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "waiting");
    if (result.kind === "waiting") {
        assert.equal(result.waitingFor, "task_approval");
    }

    const latestGoal = await store.restore(goal.id);
    assert.ok(latestGoal !== undefined);
    assert.equal(latestGoal.state.run.stepCount, 1);
    assert.equal(latestGoal.state.run.lastStep?.kind, "action");
    if (latestGoal.state.run.lastStep?.kind === "action") {
        assert.equal(latestGoal.state.run.lastStep.observation.kind, "failure");
    }
});

test("无任务只读 Action: 工具运行时异常停止为 TOOL_EXECUTION_ERROR", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();

    const throwingReadTool = createMockTool(THROWING_READ_DEFINITION, {
        async execute() {
            throw new Error("Disk hardware failure");
        },
    });

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(throwingReadTool),
    ]);

    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
        trajectoryStore,
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-pretask-read-crash",
        intent: "测试读取崩溃",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-pretask-read-crash",
        mode: "plan",
    });
    await store.save(goal);

    stepExecutor.enqueue({
        kind: "tool_call",
        action: {
            actionId: "action-crash",
            toolId: "throwing_read",
            input: { path: "corrupted.json" },
        },
    });

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "terminal");
    if (result.kind === "terminal") {
        assert.equal(result.goal.state.run.status, "failed");
    }

});

test("Plan 提案未批准时不按 isReadOnly 新增 Tool 门控，仍由 Tool Policy 决定", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();
    let writeExecuted = false;
    let policyEvaluated = false;

    const writeTool = createMockTool(WRITE_FILE_DEFINITION, {
        async execute(input) {
            writeExecuted = true;
            return { kind: "success", output: input, summary: "wrote file" };
        },
    });

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(writeTool),
    ]);

    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
        toolPolicy: {
            evaluate: () => {
                policyEvaluated = true;
                return "allow";
            },
        },
        trajectoryStore,
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-write-intercept",
        intent: "试图未批准写文件",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-write-intercept",
        mode: "plan",
    });
    await store.save(goal);

    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-write-before-proposal",
                toolId: "write_file",
                input: { path: "hello.txt", content: "authorized by policy" },
            },
        },
        {
            kind: "task_proposal",
            task: { objective: "继续完成请求", completionCriteria: [{ text: "文件已写入" }] },
            approvalRequest: "请批准后续任务",
        },
    );

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "waiting");
    if (result.kind === "waiting") {
        assert.equal(result.waitingFor, "task_approval");
    }

    assert.equal(writeExecuted, true);
    assert.equal(policyEvaluated, true);

    // 工具结果已提交，提案等待点随后持久化；模式本身不授予或撤销 Tool 权限。
    const latestGoal = await store.restore(goal.id);
    assert.ok(latestGoal !== undefined);
    assert.equal(latestGoal.state.run.stepCount, 1);
    assert.equal(latestGoal.state.run.pendingAction, undefined);
    assert.equal(latestGoal.state.run.pendingInteraction?.kind, "task_approval");
});

test("普通 Run 直接调用已授权写工具并用当前 Run Observation 完成", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    let writeExecuted = false;
    let policyEvaluated = false;
    let step = 0;
    const executor: StepExecutor = {
        async execute({ goal: currentGoal }) {
            step += 1;
            if (step === 1) {
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "action-normal-write",
                        toolId: "write_file",
                        input: { path: "direct.txt", content: "normal run" },
                    },
                };
            }
            const evidenceSequence = currentGoal.state.run.committedThroughSequence;
            assert.ok(evidenceSequence !== undefined && evidenceSequence > 0);
            return {
                kind: "complete",
                summary: "当前请求已完成",
                evidenceSequences: [evidenceSequence],
            };
        },
    };
    const runner = new Runner({
        store,
        executor,
        toolRegistry: new InMemoryToolRegistry([
            createToolRegistration(createMockTool(WRITE_FILE_DEFINITION, {
                async execute(input) {
                    writeExecuted = true;
                    return { kind: "success", output: input, summary: "wrote file" };
                },
            })),
        ]),
        toolPolicy: {
            evaluate: () => {
                policyEvaluated = true;
                return "allow";
            },
        },
        trajectoryStore,
    });
    const coordinator = new GoalCoordinator({ store, scheduler: new InlineScheduler(runner), trajectoryStore });
    const goal = createGoal({
        id: "goal-normal-direct-execution",
        intent: "直接写入并验证请求",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-normal-direct-execution",
    });
    await store.save(goal);

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "terminal");
    if (result.kind === "terminal") assert.equal(result.goal.state.run.status, "completed");
    assert.equal(writeExecuted, true);
    assert.equal(policyEvaluated, true);
    const persisted = await store.restore(goal.id);
    assert.ok(persisted !== undefined);
    assert.equal(persisted.state.run.mode, "normal");
    assert.equal(persisted.state.run.approvedTask, undefined);
    assert.equal(persisted.state.run.pendingInteraction, undefined);
});

test("普通 Run 允许无 Tool 的空证据回答，但有业务 Observation 时要求引用证据", async () => {
    const pureStore = new InMemoryGoalStore();
    const pureTrajectory = trajectoryStoreFor(pureStore);
    const pureExecutor = new QueueStepExecutor();
    pureExecutor.enqueue({ kind: "complete", summary: "无需外部工具即可回答", evidenceSequences: [] });
    const pureRunner = new Runner({ store: pureStore, executor: pureExecutor, trajectoryStore: pureTrajectory });
    const pureCoordinator = new GoalCoordinator({
        store: pureStore,
        scheduler: new InlineScheduler(pureRunner),
        trajectoryStore: pureTrajectory,
    });
    const pureGoal = createGoal({
        id: "goal-normal-pure-answer",
        intent: "回答简单问题",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-normal-pure-answer",
    });
    await pureStore.save(pureGoal);
    const pureResult = await pureCoordinator.advance({ goalId: pureGoal.id, runId: pureGoal.state.run.id });
    assert.equal(pureResult.ok, true);
    assert.equal(pureResult.kind, "terminal");
    if (pureResult.kind === "terminal") assert.equal(pureResult.goal.state.run.status, "completed");

    const observedStore = new InMemoryGoalStore();
    const observedTrajectory = trajectoryStoreFor(observedStore);
    const observedExecutor = new QueueStepExecutor();
    observedExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-normal-unreferenced",
                toolId: "write_file",
                input: { path: "observed.txt", content: "written" },
            },
        },
        { kind: "complete", summary: "未引用工具结果", evidenceSequences: [] },
    );
    const observedRunner = new Runner({
        store: observedStore,
        executor: observedExecutor,
        toolRegistry: new InMemoryToolRegistry([
            createToolRegistration(createMockTool(WRITE_FILE_DEFINITION)),
        ]),
        toolPolicy: { evaluate: () => "allow" },
        trajectoryStore: observedTrajectory,
    });
    const observedCoordinator = new GoalCoordinator({
        store: observedStore,
        scheduler: new InlineScheduler(observedRunner),
        trajectoryStore: observedTrajectory,
    });
    const observedGoal = createGoal({
        id: "goal-normal-missing-evidence",
        intent: "调用工具后完成",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-normal-missing-evidence",
    });
    await observedStore.save(observedGoal);
    const observedResult = await observedCoordinator.advance({ goalId: observedGoal.id, runId: observedGoal.state.run.id });
    assert.equal(observedResult.ok, true);
    assert.equal(observedResult.kind, "terminal");
    if (observedResult.kind === "terminal") {
        assert.equal(observedResult.goal.state.run.status, "failed");
        assert.equal(observedResult.goal.state.run.stopReason?.kind, "execution_error");
        if (observedResult.goal.state.run.stopReason?.kind === "execution_error") {
            assert.equal(observedResult.goal.state.run.stopReason.code, "INVALID_AGENT_DECISION");
            assert.match(observedResult.goal.state.run.stopReason.message, /must cite current Run Tool\/Observation evidence/);
        }
    }
});

test("普通 Run 继续允许 ask_user 形成可恢复等待点", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const executor = new QueueStepExecutor();
    executor.enqueue({
        kind: "ask_user",
        questions: [{
            header: "部署环境",
            question: "目标环境是什么？",
            multiSelect: false,
            options: [{ label: "测试" }, { label: "生产" }],
        }],
    });
    const runner = new Runner({ store, executor, trajectoryStore });
    const coordinator = new GoalCoordinator({ store, scheduler: new InlineScheduler(runner), trajectoryStore });
    const goal = createGoal({
        id: "goal-normal-ask-user",
        intent: "部署应用",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-normal-ask-user",
    });
    await store.save(goal);

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "waiting");
    if (result.kind === "waiting") assert.equal(result.waitingFor, "ask_user");
    const persisted = await store.restore(goal.id);
    assert.ok(persisted !== undefined);
    assert.equal(persisted.state.run.approvedTask, undefined);
    assert.equal(persisted.state.run.pendingInteraction?.kind, "ask_user");
});

test("Runtime 按 Run 模式拒绝普通提案、普通 GoalPlan 更新与未批准 Plan 完成", async () => {
    const runDecision = async (
        id: string,
        mode: "normal" | "plan",
        decision: AgentDecision,
        goalPlan?: Goal["state"]["goalPlan"],
    ) => {
        const store = new InMemoryGoalStore();
        const trajectoryStore = trajectoryStoreFor(store);
        const executor = new QueueStepExecutor();
        executor.enqueue(decision);
        const runner = new Runner({ store, executor, trajectoryStore });
        const coordinator = new GoalCoordinator({ store, scheduler: new InlineScheduler(runner), trajectoryStore });
        const created = createGoal({
            id,
            intent: "校验 Run 决策权限",
            promptBundleVersion: 1,
            profile,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
            runId: `${id}-run`,
            mode,
        });
        const goal = goalPlan === undefined
            ? created
            : { ...created, state: { ...created.state, goalPlan } };
        await store.save(goal);
        const result = await coordinator.advance({ goalId: id, runId: goal.state.run.id });
        assert.equal(result.ok, true);
        assert.equal(result.kind, "terminal");
        const persisted = await store.restore(id);
        assert.ok(persisted !== undefined);
        assert.equal(persisted.state.run.status, "failed");
        return persisted;
    };

    const proposal = await runDecision("goal-normal-proposal-rejected", "normal", {
        kind: "task_proposal",
        task: { objective: "不应生成审批", completionCriteria: [] },
        approvalRequest: "请批准",
    });
    assert.equal(proposal.state.run.pendingInteraction, undefined);
    assert.equal(proposal.state.run.approvedTask, undefined);

    const existingPlan = {
        revision: 1,
        items: [{ id: "todo-existing", content: "保持原样", position: 0, status: "pending" as const }],
    };
    const planUpdate = await runDecision("goal-normal-plan-update-rejected", "normal", {
        kind: "goal_plan_update",
        baseRevision: 1,
        operations: [{ type: "add", content: "未授权修改" }],
    }, existingPlan);
    assert.deepEqual(planUpdate.state.goalPlan, existingPlan);

    const earlyComplete = await runDecision("goal-plan-early-complete-rejected", "plan", {
        kind: "complete",
        summary: "未批准却完成",
        completionEvidence: [],
    });
    assert.equal(earlyComplete.state.run.approvedTask, undefined);
    assert.equal(earlyComplete.state.run.pendingInteraction, undefined);
});

test("YOLO 模式边界: 任务批准后 YOLO 自动放行写工具并计 Step，但 ask_user 依然等待用户", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();
    let writeExecuted = false;

    const writeTool = createMockTool(WRITE_FILE_DEFINITION, {
        async execute(input) {
            writeExecuted = true;
            return { kind: "success", output: input, summary: "wrote file" };
        },
    });

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(writeTool),
    ]);

    // YOLO 模式策略：对所有工具调用均返回 allow
    const yoloToolPolicy: ToolPolicy = {
        evaluate: () => "allow",
    };

    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
        toolPolicy: yoloToolPolicy,
        trajectoryStore,
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-yolo-mode",
        intent: "YOLO 执行与提问",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-yolo-mode",
        mode: "plan",
    });
    await store.save(goal);

    // 1. 任务提案
    stepExecutor.enqueue({
        kind: "task_proposal",
        task: {
            objective: "YOLO 执行目标",
            completionCriteria: [{ text: "写文件" }],
        },
        approvalRequest: "请批准 YOLO 执行",
    });

    const initialResult = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(initialResult.ok, true);
    assert.equal(initialResult.kind, "waiting");

    // 2. 用户批准任务
    // 模型在此后执行：首先写文件（YOLO 自动放行），然后发起 ask_user 提问
    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-yolo-write",
                toolId: "write_file",
                input: { path: "output.txt", content: "yolo data" },
            },
        },
        {
            kind: "ask_user",
            questions: [
                {
                    header: "确认",
                    question: "文件已写入，是否发布？",
                    multiSelect: false,
                    options: [
                        { label: "是" },
                        { label: "否" },
                    ],
                },
            ],
        },
    );

    const afterApproveResult = await coordinator.resume({
        ref: { goalId: goal.id, runId: goal.state.run.id },
        action: { kind: "approve_task" },
    });

    // 验证写工具在 YOLO 下已被执行且已累加 Step
    assert.equal(writeExecuted, true);

    // 验证 YOLO 绝不自动放行 ask_user：系统必须停在 ask_user 等待
    assert.equal(afterApproveResult.ok, true);
    assert.equal(afterApproveResult.kind, "waiting");
    if (afterApproveResult.kind === "waiting") {
        assert.equal(afterApproveResult.waitingFor, "ask_user");
    }

    // 验证 stepCount 增加到 1
    const latestGoal = await store.restore(goal.id);
    assert.ok(latestGoal !== undefined);
    assert.equal(latestGoal.state.run.stepCount, 1);
    assert.equal(latestGoal.state.run.pendingInteraction?.kind, "ask_user");
});

test("普通只读 Action 重启恢复: 读取后的 Step 可恢复并继续推进", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor1 = new QueueStepExecutor();

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(createMockTool(READ_FILE_DEFINITION)),
    ]);

    const runner1 = new Runner({
        store,
        executor: stepExecutor1,
        toolRegistry,
        trajectoryStore,
    });

    const scheduler1 = new InlineScheduler(runner1);
    const coordinator1 = new GoalCoordinator({ store, scheduler: scheduler1, trajectoryStore });

    const goal = createGoal({
        id: "goal-pretask-read-resume",
        intent: "跨重启读取",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-pretask-read-resume",
        mode: "plan",
    });
    await store.save(goal);

    // 第一次读取后挂起等待用户回答
    stepExecutor1.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-read-r1",
                toolId: "read_file",
                input: { path: "first.json" },
            },
        },
        {
            kind: "ask_user",
            questions: [
                {
                    header: "方向",
                    question: "需要继续读取更多信息吗？",
                    multiSelect: false,
                    options: [{ label: "继续" }, { label: "停止" }],
                },
            ],
        },
    );

    const firstResult = await coordinator1.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(firstResult.ok, true);
    assert.equal(firstResult.kind, "waiting");

    // 模拟进程重启：新建 Executor、Runner 和 Coordinator
    const stepExecutor2 = new QueueStepExecutor();
    const runner2 = new Runner({
        store,
        executor: stepExecutor2,
        toolRegistry,
        trajectoryStore,
    });
    const scheduler2 = new InlineScheduler(runner2);
    const coordinator2 = new GoalCoordinator({ store, scheduler: scheduler2, trajectoryStore });

    const waitingGoal = await store.restore(goal.id);
    assert.ok(waitingGoal !== undefined);
    assert.equal(waitingGoal.state.run.stepCount, 1);
    assert.equal(waitingGoal.state.run.lastStep?.kind, "action");
    assert.equal(waitingGoal.state.run.pendingInteraction?.kind, "ask_user");
    const interaction = waitingGoal.state.run.pendingInteraction as any;

    // 第二轮：用户回答继续，Agent 再次读取，然后提交提案
    stepExecutor2.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-read-r2",
                toolId: "read_file",
                input: { path: "second.json" },
            },
        },
        {
            kind: "task_proposal",
            task: {
                objective: "基于两次读取结果规划任务",
                completionCriteria: [{ text: "两次读取完成" }],
            },
            approvalRequest: "读取已全部完成，请批准任务",
        },
    );

    const secondResult = await coordinator2.resume({
        ref: { goalId: goal.id, runId: goal.state.run.id },
        action: {
            kind: "answer_ask_user",
            requestId: interaction.requestId,
            answers: [
                {
                    questionId: interaction.questions[0].id,
                    optionIds: [interaction.questions[0].options[0].id],
                },
            ],
        },
    });

    assert.equal(secondResult.ok, true);
    assert.equal(secondResult.kind, "waiting");
    if (secondResult.kind === "waiting") {
        assert.equal(secondResult.waitingFor, "task_approval");
    }

    // 验证整个过程中两个普通只读 Step 都被持久化。
    const finalGoal = await store.restore(goal.id);
    assert.ok(finalGoal !== undefined);
    assert.equal(finalGoal.state.run.stepCount, 2);
    assert.equal(finalGoal.state.run.lastStep?.kind, "action");
    assert.equal(finalGoal.state.run.lastStep?.action.actionId, "action-read-r2");
});
