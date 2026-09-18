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
    type PreparationProbeProgressEvent,
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
    instructions: ["Clarify plan, probe if needed, propose task, then execute."],
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

    enqueue(...decisions: AgentDecision[]): void {
        this.queue.push(...decisions);
    }

    async execute({ goal: _goal }: StepExecutionInput): Promise<AgentDecision> {
        const next = this.queue.shift();
        if (next === undefined) {
            throw new Error("QueueStepExecutor: no queued decision available");
        }
        return next;
    }
}

test("计划期只读探查: 探查成功不计 Step，不产生 pendingAction，同一次推进继续且记录进度与 Trajectory", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();
    const probeEvents: PreparationProbeProgressEvent[] = [];

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(createMockTool(READ_FILE_DEFINITION)),
        createToolRegistration(createMockTool(WRITE_FILE_DEFINITION)),
    ]);

    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
        trajectoryStore,
        onProbeProgress: (event) => probeEvents.push(event),
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-probe-1",
        intent: "探查并规划",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-probe-1",
    });
    await store.save(goal);

    // 第一步：模型返回只读探查
    // 第二步：模型返回任务提案
    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-probe-1",
                toolId: "read_file",
                input: { path: "package.json" },
            },
        },
        {
            kind: "task_proposal",
            task: {
                objective: "基于探查结果实现目标",
                completionCriteria: [{ text: "探查完成" }],
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

    // 验证快照：stepCount 必须保持为 0，pendingAction 必须为 undefined
    const latestGoal = await store.restore(goal.id);
    assert.ok(latestGoal !== undefined);
    assert.equal(latestGoal.state.run.stepCount, 0);
    assert.equal(latestGoal.state.run.pendingAction, undefined);
    assert.equal(latestGoal.state.run.lastStep, undefined);

    // 验证探查进度回调
    assert.equal(probeEvents.length, 2);
    assert.equal(probeEvents[0]?.kind, "started");
    assert.equal(probeEvents[0]?.actionId, "action-probe-1");
    assert.equal(probeEvents[0]?.probeNumber, 1);
    assert.equal(probeEvents[1]?.kind, "finished");
    assert.equal(probeEvents[1]?.actionId, "action-probe-1");
    assert.equal(probeEvents[1]?.probeNumber, 1);

    // 验证 Trajectory 统一事件流
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    const eventTypes = events.map((e) => e.eventType);
    assert.ok(eventTypes.includes("tool_started"));
    assert.ok(eventTypes.includes("tool_finished"));
    assert.ok(eventTypes.includes("observation_recorded"));
    assert.ok(eventTypes.includes("decision_received"));

    // 确保没有旧的 preparation 事件
    assert.equal(eventTypes.includes("preparation_result" as any), false);
});

test("计划期只读探查: 领域 failure 正常记录且不增 Step，继续下一轮规划", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();
    const probeEvents: PreparationProbeProgressEvent[] = [];

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
        onProbeProgress: (event) => probeEvents.push(event),
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-probe-failure",
        intent: "处理失败探查",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-probe-failure",
    });
    await store.save(goal);

    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-probe-fail",
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
    assert.equal(latestGoal.state.run.stepCount, 0);
    assert.equal(latestGoal.state.run.lastStep, undefined);

    assert.equal(probeEvents.length, 2);
    assert.equal(probeEvents[1]?.kind, "finished");
    if (probeEvents[1]?.kind === "finished") {
        assert.equal(probeEvents[1].observation.kind, "failure");
    }
});

test("计划期只读探查: 工具运行时异常触发 failed 事件并停止为 TOOL_EXECUTION_ERROR", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor = new QueueStepExecutor();
    const probeEvents: PreparationProbeProgressEvent[] = [];

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
        onProbeProgress: (event) => probeEvents.push(event),
    });

    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({ store, scheduler, trajectoryStore });

    const goal = createGoal({
        id: "goal-probe-crash",
        intent: "测试探查崩溃",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-probe-crash",
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

    assert.equal(probeEvents.length, 2);
    assert.equal(probeEvents[0]?.kind, "started");
    assert.equal(probeEvents[1]?.kind, "failed");
    if (probeEvents[1]?.kind === "failed") {
        assert.match(probeEvents[1].message, /Disk hardware failure/);
    }
});

test("安全拦截: 任务未批准时非只读工具被拒绝，零副作用且无 pendingAction", async () => {
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

    const runner = new Runner({
        store,
        executor: stepExecutor,
        toolRegistry,
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
    });
    await store.save(goal);

    stepExecutor.enqueue({
        kind: "tool_call",
        action: {
            actionId: "action-write-forbidden",
            toolId: "write_file",
            input: { path: "hello.txt", content: "forbidden" },
        },
    });

    const result = await coordinator.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "terminal");
    if (result.kind === "terminal") {
        assert.equal(result.goal.state.run.status, "failed");
    }

    // 零副作用验证
    assert.equal(writeExecuted, false);

    // 验证持久化快照无 pendingAction 且 stepCount 为 0
    const latestGoal = await store.restore(goal.id);
    assert.ok(latestGoal !== undefined);
    assert.equal(latestGoal.state.run.stepCount, 0);
    assert.equal(latestGoal.state.run.pendingAction, undefined);
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

test("探查重启恢复: 探查后保存快照，恢复后再次探查 probeNumber 正确累进且 stepCount 保持为 0", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const stepExecutor1 = new QueueStepExecutor();
    const probeEvents: PreparationProbeProgressEvent[] = [];

    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(createMockTool(READ_FILE_DEFINITION)),
    ]);

    const runner1 = new Runner({
        store,
        executor: stepExecutor1,
        toolRegistry,
        trajectoryStore,
        onProbeProgress: (event) => probeEvents.push(event),
    });

    const scheduler1 = new InlineScheduler(runner1);
    const coordinator1 = new GoalCoordinator({ store, scheduler: scheduler1, trajectoryStore });

    const goal = createGoal({
        id: "goal-probe-resume",
        intent: "跨重启探查",
        promptBundleVersion: 1,
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        runId: "run-probe-resume",
    });
    await store.save(goal);

    // 第一次探查后挂起等待用户回答
    stepExecutor1.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-probe-r1",
                toolId: "read_file",
                input: { path: "first.json" },
            },
        },
        {
            kind: "ask_user",
            questions: [
                {
                    header: "方向",
                    question: "需要继续深入探查吗？",
                    multiSelect: false,
                    options: [{ label: "继续" }, { label: "停止" }],
                },
            ],
        },
    );

    const firstResult = await coordinator1.advance({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(firstResult.ok, true);
    assert.equal(firstResult.kind, "waiting");
    assert.equal(probeEvents[0]?.probeNumber, 1);

    // 模拟进程重启：新建 Executor、Runner 和 Coordinator
    const stepExecutor2 = new QueueStepExecutor();
    const runner2 = new Runner({
        store,
        executor: stepExecutor2,
        toolRegistry,
        trajectoryStore,
        onProbeProgress: (event) => probeEvents.push(event),
    });
    const scheduler2 = new InlineScheduler(runner2);
    const coordinator2 = new GoalCoordinator({ store, scheduler: scheduler2, trajectoryStore });

    const waitingGoal = await store.restore(goal.id);
    assert.ok(waitingGoal !== undefined);
    assert.equal(waitingGoal.state.run.stepCount, 0);
    assert.equal(waitingGoal.state.run.pendingInteraction?.kind, "ask_user");
    const interaction = waitingGoal.state.run.pendingInteraction as any;

    // 第二轮：用户回答继续，Agent 再次进行探查（第 2 次探查），然后提交提案
    stepExecutor2.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "action-probe-r2",
                toolId: "read_file",
                input: { path: "second.json" },
            },
        },
        {
            kind: "task_proposal",
            task: {
                objective: "基于两次探查结果规划任务",
                completionCriteria: [{ text: "两次探查完成" }],
            },
            approvalRequest: "探查已全部完成，请批准任务",
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

    // 验证第二次探查的 probeNumber 累进为 2
    const secondProbeStarted = probeEvents.find((e) => e.actionId === "action-probe-r2" && e.kind === "started");
    assert.ok(secondProbeStarted !== undefined);
    assert.equal(secondProbeStarted.probeNumber, 2);

    // 验证整个过程中 stepCount 保持为 0
    const finalGoal = await store.restore(goal.id);
    assert.ok(finalGoal !== undefined);
    assert.equal(finalGoal.state.run.stepCount, 0);
});
