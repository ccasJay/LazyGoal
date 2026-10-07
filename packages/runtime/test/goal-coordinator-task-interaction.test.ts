import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    createGoal as createUnexposedGoal,
    createToolRegistration,
    InMemoryToolRegistry,
    type AgentDecision,
    type AgentProfile,
    type StepExecutionInput,
    type StepExecutor,
    type Tool,
    type ToolDefinition,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { BaseTestStepExecutor, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";
import { contract } from "../../contracts/src/index";
import type { AskUserQuestionInput } from "../../model-contracts/src/index";

function createGoal(input: Parameters<typeof createUnexposedGoal>[0]) {
    return withDiscoveredProfileTools(createUnexposedGoal(input));
}

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a helpful assistant.",
    instructions: ["Clarify plan, propose task, then execute."],
    toolIds: ["read_file", "write_file"],
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

function createMockTool(definition: ToolDefinition): Tool {
    return {
        definition,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute(input) {
            return {
                kind: "success",
                output: { executed: true, actionId: input.actionId, input: input.input },
                summary: `Executed ${definition.id}`,
            };
        },
    };
}

class QueueStepExecutor extends BaseTestStepExecutor {
    private queue: AgentDecision[] = [];
    calls = 0;

    constructor() {
        super();
    }

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

class GoalPlanCompletionExecutor extends BaseTestStepExecutor {
    private index = 0;

    constructor(private readonly trajectoryStore: ReturnType<typeof trajectoryStoreFor>) {
        super();
    }

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) {
            return {
                kind: "goal_plan_update",
                baseRevision: goal.state.goalPlan?.revision ?? 0,
                operations: [{ type: "add", content: "完成当前 Run 的计划项" }],
            };
        }
        if (this.index === 2) {
            return {
                kind: "tool_call",
                action: {
                    actionId: "integrated-write",
                    toolId: "write_file",
                    input: { path: "run.txt", content: "completed" },
                },
            };
        }
        if (this.index === 3) {
            const observation = [...this.trajectoryStore.events].reverse().find((event) =>
                event.goalId === goal.id
                && event.runId === goal.state.run.id
                && event.eventType === "observation_recorded");
            if (observation === undefined) throw new Error("current Run Observation was not committed");
            return {
                kind: "goal_plan_update",
                baseRevision: goal.state.goalPlan?.revision ?? 0,
                operations: [
                    { type: "update", id: "todo-1-1", status: "in_progress" },
                    {
                        type: "update",
                        id: "todo-1-1",
                        status: "completed",
                        evidenceSequences: [observation.sequence],
                    },
                ],
            };
        }
        if (this.index === 4) {
            return { kind: "complete", summary: "Run 与计划项完成", completionEvidence: [] };
        }
        throw new Error("GoalPlanCompletionExecutor received an unexpected call");
    }
}

function createCoordinatorTestRig(mode: "normal" | "plan" = "plan") {
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
        trajectoryStore,
        toolRegistry,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store,
        scheduler,
        trajectoryStore,
        toolRegistry,
    });

    const goal = createGoal({
        id: "goal-test-unified-1",
        intent: "完成用户需求",
        promptBundleVersion: 1,
        profile,
        runId: "run-test-unified-1",
        mode,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    });

    return {
        store,
        trajectoryStore,
        stepExecutor,
        toolRegistry,
        coordinator,
        goal,
        ref: { goalId: goal.id, runId: goal.state.run.id },
    };
}

test("统一执行生命周期: 新 Goal 直接推进，ask_user 请求进入等待且不计 Step", async () => {
    const { store, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);

    const questions: AskUserQuestionInput[] = [
        {
            header: "架构风格",
            question: "请选择架构风格？",
            options: [
                { label: "Monolith" },
                { label: "Microservices" },
            ],
            multiSelect: false,
        },
    ];

    stepExecutor.enqueue({
        kind: "ask_user",
        questions,
    });

    const result = await coordinator.advance(ref);
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "waiting") {
        assert.fail("Expected waiting result");
    }

    assert.equal(result.phase, "executing");
    assert.equal(result.waitingFor, "ask_user");
    assert.equal(result.goal.state.run.stepCount, 0);
    assert.equal(result.goal.state.run.approvedTask, undefined);

    const pending = result.goal.state.run.pendingInteraction;
    assert.ok(pending);
    assert.equal(pending.kind, "ask_user");
    if (pending.kind === "ask_user") {
        assert.equal(pending.mode, "plan");
        assert.equal(pending.questions.length, 1);
        assert.equal(pending.questions[0]?.header, "架构风格");
    }

    // 验证快照也是最新的 waiting 状态
    const saved = await store.restore(goal.id);
    assert.equal(saved?.state.run.status, "waiting");
    assert.equal(saved?.state.run.pendingInteraction?.kind, "ask_user");
});

test("取消 AskUser 询问后保留当前 Run 并继续执行", async () => {
    const { store, trajectoryStore, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);
    stepExecutor.enqueue({
        kind: "ask_user",
        questions: [{
            header: "继续吗？",
            question: "是否继续执行？",
            options: [{ label: "是" }, { label: "否" }],
            multiSelect: false,
        }],
    }, {
        kind: "task_proposal",
        task: {
            objective: "继续当前任务",
            completionCriteria: [{ text: "完成后续工作" }],
        },
        approvalRequest: "请批准继续执行。",
    });

    const waiting = await coordinator.advance(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok || waiting.kind !== "waiting") assert.fail("Expected AskUser waiting point");
    const pending = waiting.goal.state.run.pendingInteraction;
    assert.ok(pending?.kind === "ask_user");
    if (pending?.kind !== "ask_user") assert.fail("Expected AskUser request");
    const resumed = await coordinator.resume({
        ref,
        action: { kind: "cancel_ask_user", requestId: pending.requestId },
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok || resumed.kind !== "waiting") assert.fail("Expected the same Run to continue to its next wait point");
    assert.equal(resumed.goal.state.run.status, "waiting");
    assert.equal(resumed.goal.state.run.pendingInteraction?.kind, "task_approval");
    assert.equal(resumed.goal.state.messages.some((message) => message.content.includes("I cancelled this question")), true);

    const saved = await store.restore(goal.id);
    assert.equal(saved?.state.run.status, "waiting");
    assert.equal(saved?.state.run.id, ref.runId);
    assert.equal(saved?.state.run.pendingInteraction?.kind, "task_approval");
    const events = await trajectoryStore.read(ref);
    assert.ok(events.some((event) => event.eventType === "ask_user_cancelled"
        && event.payload.type === "ask_user_cancelled"
        && event.payload.requestId === pending.requestId));
    assert.equal(events.some((event) => event.eventType === "run_cancelled"), false);
});

test("ask_user 恢复: 校验 requestId 与 answers，合法提交后追加用户消息并推进下一轮", async () => {
    const { store, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);

    stepExecutor.enqueue({
        kind: "ask_user",
        questions: [
            {
                header: "数据库选择",
                question: "使用哪种数据库？",
                options: [
                    { label: "PostgreSQL" },
                    { label: "SQLite" },
                ],
                multiSelect: false,
            },
        ],
    });

    const firstAdvance = await coordinator.advance(ref);
    assert.equal(firstAdvance.ok, true);
    if (!firstAdvance.ok || firstAdvance.kind !== "waiting") assert.fail();
    const pending = firstAdvance.goal.state.run.pendingInteraction;
    assert.equal(pending?.kind, "ask_user");
    if (pending?.kind !== "ask_user") return;

    const reqId = pending.requestId;
    const q1 = pending.questions[0];
    assert.ok(q1);
    const optPg = q1.options[0];
    assert.ok(optPg);
    const optSqlite = q1.options[1];
    assert.ok(optSqlite);

    // 1. 失配 requestId 测试 (Req 6.3)
    const mismatchResult = await coordinator.resume({
        ref,
        action: {
            kind: "answer_ask_user",
            requestId: "wrong-req-id",
            answers: [{ questionId: q1.id, optionIds: [optPg.id] }],
        },
    });
    assert.equal(mismatchResult.ok, false);
    if (!mismatchResult.ok) {
        assert.equal(mismatchResult.error.code, "INVALID_GOAL_INPUT");
    }
    // 验证状态未改变
    const afterMismatch = await store.restore(goal.id);
    assert.equal(afterMismatch?.state.run.status, "waiting");

    // 2. 非法答案结构测试 (单选传入多项)
    const invalidAnswerResult = await coordinator.resume({
        ref,
        action: {
            kind: "answer_ask_user",
            requestId: reqId,
            answers: [{ questionId: q1.id, optionIds: [optPg.id, optSqlite.id] }],
        },
    });
    assert.equal(invalidAnswerResult.ok, false);
    if (!invalidAnswerResult.ok) {
        assert.equal(invalidAnswerResult.error.code, "INVALID_GOAL_INPUT");
    }

    // 3. 准备下一轮模型的决策：返回 task_proposal
    stepExecutor.enqueue({
        kind: "task_proposal",
        task: {
            objective: "使用 PostgreSQL 构建系统",
            completionCriteria: [{ text: "数据库连接正常" }],
        },
        approvalRequest: "请批准任务提案",
    });

    // 4. 合法提交问答
    const resumedResult = await coordinator.resume({
        ref,
        action: {
            kind: "answer_ask_user",
            requestId: reqId,
            answers: [{ questionId: q1.id, optionIds: [optPg.id] }],
        },
    });

    assert.equal(resumedResult.ok, true);
    if (!resumedResult.ok || resumedResult.kind !== "waiting") assert.fail();

    // 此时 Goal 推进到了 task_proposal 等待
    assert.equal(resumedResult.waitingFor, "task_approval");
    assert.equal(resumedResult.goal.state.run.stepCount, 0);

    // 验证消息列表包含了回答格式化文本
    const userMsg = resumedResult.goal.state.messages.find(
        (m) => m.role === "user" && m.content.includes("PostgreSQL"),
    );
    assert.ok(userMsg);
});

test("Plan 提案前可按既有授权执行写工具，再持久化提案等待", async () => {
    const { store, trajectoryStore, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);

    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "act-write-1",
                toolId: "write_file",
                input: { path: "hello.txt", content: "authorized" },
            },
        },
        {
            kind: "task_proposal",
            task: { objective: "继续处理请求", completionCriteria: [{ text: "写入完成" }] },
            approvalRequest: "请批准继续执行",
        },
    );

    const result = await coordinator.advance(ref);
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "waiting") assert.fail("Expected task approval waiting point");
    assert.equal(result.waitingFor, "task_approval");
    assert.equal(result.goal.state.run.pendingAction, undefined);
    assert.equal(result.goal.state.run.pendingInteraction?.kind, "task_approval");
    const events = await trajectoryStore.read(ref);
    assert.ok(events.some((event) => event.eventType === "tool_finished"));
    const proposalRequestId = result.goal.state.run.pendingInteraction?.kind === "task_approval"
        ? result.goal.state.run.pendingInteraction.requestId
        : undefined;
    const waitingEvent = events.find((event) => event.payload.type === "run_waiting");
    assert.ok(proposalRequestId);
    assert.equal(
        waitingEvent?.payload.type === "run_waiting" ? waitingEvent.payload.requestId : undefined,
        proposalRequestId,
    );
});

test("任务提案反馈: feedback_task 使旧提案失效，追加反馈消息并重新规划 (不计 Step)", async () => {
    const { store, trajectoryStore, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);

    stepExecutor.enqueue({
        kind: "task_proposal",
        task: {
            objective: "初步方案",
            completionCriteria: [{ text: "初步条件" }],
        },
        approvalRequest: "请审核初步方案",
    });

    const first = await coordinator.advance(ref);
    assert.equal(first.ok, true);
    if (!first.ok || first.kind !== "waiting") assert.fail();
    assert.equal(first.waitingFor, "task_approval");

    const proposalReqId = first.goal.state.run.pendingInteraction?.kind === "task_approval"
        ? first.goal.state.run.pendingInteraction.requestId
        : undefined;
    assert.ok(proposalReqId);

    // 下一轮模型根据反馈重新给出提案
    stepExecutor.enqueue({
        kind: "task_proposal",
        task: {
            objective: "调整后的优化方案",
            completionCriteria: [{ text: "优化条件" }],
        },
        approvalRequest: "请审核新方案",
    });

    // 用户提供反馈
    const feedbackResult = await coordinator.resume({
        ref,
        action: {
            kind: "feedback_task",
            requestId: proposalReqId,
            feedback: "请不要使用外部依赖，改为原生实现",
        },
    });

    assert.equal(feedbackResult.ok, true);
    if (!feedbackResult.ok || feedbackResult.kind !== "waiting") assert.fail();
    assert.equal(feedbackResult.waitingFor, "task_approval");
    assert.equal(feedbackResult.goal.state.run.stepCount, 0);
    assert.equal(feedbackResult.goal.state.run.id, ref.runId);
    assert.equal(feedbackResult.goal.state.run.approvedTask, undefined);

    // 检查反馈消息已追加
    const messages = feedbackResult.goal.state.messages;
    const userFeedback = messages.find((m) => m.content === "请不要使用外部依赖，改为原生实现");
    assert.ok(userFeedback);
    const revisedRequestId = feedbackResult.goal.state.run.pendingInteraction?.kind === "task_approval"
        ? feedbackResult.goal.state.run.pendingInteraction.requestId
        : undefined;
    assert.ok(revisedRequestId);
    assert.notEqual(revisedRequestId, proposalReqId);

    const trajectoryBeforeStaleFeedback = await trajectoryStore.read(ref);
    const staleFeedback = await coordinator.resume({
        ref,
        action: {
            kind: "feedback_task",
            requestId: proposalReqId,
            feedback: "迟到的旧提案反馈",
        },
    });
    assert.equal(staleFeedback.ok, false);
    if (!staleFeedback.ok) assert.equal(staleFeedback.error.code, "INVALID_GOAL_INPUT");
    assert.deepEqual(await trajectoryStore.read(ref), trajectoryBeforeStaleFeedback);
    const afterStaleFeedback = await store.restore(goal.id);
    assert.equal(afterStaleFeedback?.state.run.pendingInteraction?.kind, "task_approval");
    if (afterStaleFeedback?.state.run.pendingInteraction?.kind === "task_approval") {
        assert.equal(afterStaleFeedback.state.run.pendingInteraction.requestId, revisedRequestId);
    }
});

test("任务提案批准: approve_task 固定任务并推进 ContextEpoch，后续 Tool 执行增加 Step", async () => {
    const { store, trajectoryStore, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);

    stepExecutor.enqueue({
        kind: "task_proposal",
        task: {
            objective: "最终方案",
            completionCriteria: [],
        },
        approvalRequest: "请批准最终方案",
    });

    const first = await coordinator.advance(ref);
    assert.equal(first.ok, true);
    if (!first.ok || first.kind !== "waiting") assert.fail();
    assert.equal(first.waitingFor, "task_approval");

    const proposalPending = first.goal.state.run.pendingInteraction;
    assert.equal(proposalPending?.kind, "task_approval");
    const proposalReqId = proposalPending?.kind === "task_approval" ? proposalPending.requestId : undefined;
    assert.ok(proposalReqId);
    const eventsBeforeStaleApproval = await trajectoryStore.read(ref);

    const unboundFeedback = await coordinator.resume({
        ref,
        action: { kind: "message", content: "不能绕过 requestId 的任务反馈" },
    });
    assert.equal(unboundFeedback.ok, false);
    if (!unboundFeedback.ok) assert.equal(unboundFeedback.error.code, "INVALID_GOAL_INPUT");
    assert.deepEqual(await trajectoryStore.read(ref), eventsBeforeStaleApproval);

    const staleApproval = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: "stale-proposal-id" },
    });
    assert.equal(staleApproval.ok, false);
    if (!staleApproval.ok) assert.equal(staleApproval.error.code, "INVALID_GOAL_INPUT");
    const stillWaiting = await store.restore(goal.id);
    assert.equal(stillWaiting?.state.run.pendingInteraction?.kind, "task_approval");
    if (stillWaiting?.state.run.pendingInteraction?.kind === "task_approval") {
        assert.equal(stillWaiting.state.run.pendingInteraction.requestId, proposalReqId);
    }
    assert.deepEqual(eventsBeforeStaleApproval, await trajectoryStore.read(ref));
    const waitingEvents = eventsBeforeStaleApproval;

    const crossRunApproval = await coordinator.resume({
        ref: { goalId: ref.goalId, runId: "stale-run-id" },
        action: { kind: "approve_task", requestId: proposalReqId },
    });
    assert.equal(crossRunApproval.ok, false);
    if (!crossRunApproval.ok) assert.equal(crossRunApproval.error.code, "RUN_NOT_FOUND");
    assert.deepEqual(await store.restore(goal.id), stillWaiting);
    assert.deepEqual(await trajectoryStore.read(ref), waitingEvents);

    // 批准后模型执行只读查询，随后完成
    stepExecutor.enqueue(
        {
            kind: "tool_call",
            action: {
                actionId: "act-read-1",
                toolId: "read_file",
                input: { path: "src/index.ts" },
            },
        },
        {
            kind: "complete",
            summary: "任务圆满完成",
            completionEvidence: [],
        },
    );

    const approveResult = await coordinator.resume({
        ref,
        action: {
            kind: "approve_task",
            requestId: proposalReqId,
        },
    });

    assert.equal(approveResult.ok, true);
    if (!approveResult.ok || approveResult.kind !== "terminal") {
        assert.fail("Expected terminal result after task completion");
    }

    // 任务被固定
    assert.equal(approveResult.goal.state.run.approvedTask?.objective, "最终方案");
    assert.equal(approveResult.goal.state.run.id, ref.runId);
    // pendingInteraction 已被清除
    assert.equal(approveResult.goal.state.run.pendingInteraction, undefined);
    // 批准后执行了一步工具调用与一次完成决策，stepCount 增加了 2
    assert.equal(approveResult.goal.state.run.stepCount, 2);
    assert.equal(approveResult.goal.state.run.status, "completed");
    const approvedEvent = (await trajectoryStore.read(ref)).find((event) => event.payload.type === "task_approved");
    assert.equal(
        approvedEvent?.payload.type === "task_approved" ? approvedEvent.payload.requestId : undefined,
        proposalReqId,
    );
});

test("跨重启恢复 Plan 选择、任务审批与 GoalPlan Run 执行", async () => {
    const { store, trajectoryStore, stepExecutor, toolRegistry, coordinator, goal, ref } = createCoordinatorTestRig("normal");
    await store.save(goal);
    const selected = await coordinator.enterPlanMode(ref);
    assert.equal(selected.ok, true);
    if (!selected.ok) assert.fail("Expected Plan mode selection");
    assert.equal(selected.goal.state.run.mode, "plan");
    assert.equal(selected.goal.state.goalPlan, undefined);
    stepExecutor.enqueue({
        kind: "task_proposal",
        task: { objective: "恢复后继续的计划任务", completionCriteria: [] },
        approvalRequest: "请批准计划任务",
    });

    const waiting = await coordinator.advance(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok || waiting.kind !== "waiting") assert.fail("Expected task approval waiting point");
    assert.equal(waiting.waitingFor, "task_approval");
    const pending = waiting.goal.state.run.pendingInteraction;
    assert.equal(pending?.kind, "task_approval");
    if (pending?.kind !== "task_approval") return;

    const restored = await store.restore(goal.id);
    assert.equal(restored?.state.run.id, ref.runId);
    assert.equal(restored?.state.run.mode, "plan");
    assert.deepEqual(restored?.state.run.pendingInteraction, pending);
    const eventsAtRestart = await trajectoryStore.read(ref);
    const resumedExecutor = new GoalPlanCompletionExecutor(trajectoryStore);
    const resumedCoordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(new Runner({
            store,
            executor: resumedExecutor,
            trajectoryStore,
            toolRegistry,
        })),
        trajectoryStore,
    });

    const stale = await resumedCoordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: "expired-request" },
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error.code, "INVALID_GOAL_INPUT");
    assert.deepEqual(await store.restore(goal.id), restored);
    assert.deepEqual(await trajectoryStore.read(ref), eventsAtRestart);

    const resumed = await resumedCoordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: pending.requestId },
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok || resumed.kind !== "terminal") assert.fail("Expected the restored Run to complete");
    assert.equal(resumed.goal.state.run.id, ref.runId);
    assert.equal(resumed.goal.state.run.mode, "plan");
    assert.equal(resumed.goal.state.run.approvedTask?.objective, "恢复后继续的计划任务");
    assert.equal(resumed.goal.state.run.pendingInteraction, undefined);
    assert.equal(resumed.goal.state.run.status, "completed");
    assert.equal(resumed.goal.state.run.stepCount, 4);
    assert.deepEqual(resumed.goal.state.goalPlan?.items, [{
        id: "todo-1-1",
        content: "完成当前 Run 的计划项",
        position: 0,
        status: "completed",
    }]);
    const finalEvents = await trajectoryStore.read(ref);
    assert.equal(finalEvents.filter((event) => event.eventType === "goal_plan_updated").length, 2);
    assert.equal(finalEvents.filter((event) => event.eventType === "tool_finished").length, 1);
    assert.ok(finalEvents.every((event) => event.runId === ref.runId));
});

test("失配操作安全边界: 状态不匹配时拒绝且不改变快照或状态", async () => {
    const { store, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);

    stepExecutor.enqueue({
        kind: "ask_user",
        questions: [
            {
                header: "模式",
                question: "选择模式？",
                options: [{ label: "A" }, { label: "B" }],
                multiSelect: false,
            },
        ],
    });

    const first = await coordinator.advance(ref);
    assert.equal(first.ok, true);
    if (!first.ok || first.kind !== "waiting") assert.fail();

    // 在 ask_user 等待下尝试提交 approve_task
    const rejectApprove = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: "stale-proposal-id" },
    });
    assert.equal(rejectApprove.ok, false);
    if (!rejectApprove.ok) {
        assert.equal(rejectApprove.error.code, "INVALID_GOAL_INPUT");
    }

    // 检查快照未被污染
    const restored = await store.restore(goal.id);
    assert.equal(restored?.state.run.status, "waiting");
    assert.equal(restored?.state.run.pendingInteraction?.kind, "ask_user");
});

test("保存失败原子性: 快照保存故障时异常原样传播且不改变最后状态", async () => {
    const { store, stepExecutor, coordinator, goal, ref } = createCoordinatorTestRig();
    await store.save(goal);

    stepExecutor.enqueue({
        kind: "ask_user",
        questions: [
            {
                header: "模式",
                question: "选择模式？",
                options: [{ label: "A" }, { label: "B" }],
                multiSelect: false,
            },
        ],
    });

    const first = await coordinator.advance(ref);
    assert.equal(first.ok, true);
    if (!first.ok || first.kind !== "waiting") assert.fail();
    const reqId = first.goal.state.run.pendingInteraction?.kind === "ask_user"
        ? first.goal.state.run.pendingInteraction.requestId
        : undefined;
    assert.ok(reqId);

    // 模拟 store.save 抛出磁盘/网络异常
    const originalSave = store.save.bind(store);
    store.save = async () => {
        throw new Error("DISK_FULL_SIMULATION");
    };

    await assert.rejects(
        async () => {
            await coordinator.resume({
                ref,
                action: {
                    kind: "answer_ask_user",
                    requestId: reqId,
                    answers: [{ questionId: "q-1", optionIds: ["o-1"] }],
                },
            });
        },
        /DISK_FULL_SIMULATION/,
    );

    // 恢复正常 save 并验证当前存储仍是上次成功的 waiting 快照
    store.save = originalSave;
    const restored = await store.restore(goal.id);
    assert.equal(restored?.state.run.status, "waiting");
    assert.equal(restored?.state.run.pendingInteraction?.kind, "ask_user");
});
