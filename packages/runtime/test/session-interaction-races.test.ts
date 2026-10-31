import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
    type TrajectoryEvent,
} from "../src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { createToolRegistration, type Tool } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

const profile: AgentProfile = {
    id: "session-races-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

const toolProfile: AgentProfile = {
    id: "session-races-tool-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: ["write_probe"],
};

const repairProfile: AgentProfile = {
    id: "session-races-repair-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: ["write_probe", "inspect_probe"],
};

const profiles: AgentProfileRegistry = {
    get(profileId: string): AgentProfile | undefined {
        return profileId === profile.id ? profile
            : profileId === toolProfile.id ? toolProfile
                : profileId === repairProfile.id ? repairProfile : undefined;
    },
};

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

let harnessCounter = 0;

interface RaceHarness {
    readonly sessions: SessionManager;
    readonly store: InMemoryGoalStore;
    readonly calls: () => number;
    readonly events: () => readonly TrajectoryEvent[];
}

function createHarness(options: {
    readonly store: InMemoryGoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => AgentDecision;
    readonly tool?: Tool;
    readonly requireApproval?: boolean;
}): RaceHarness {
    const trajectory = trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: trajectory });
    let calls = 0;
    harnessCounter += 1;
    const harnessId = harnessCounter;
    let runCounter = 0;
    const nextRunId = (): string => `run-races-${harnessId}-${++runCounter}`;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            return {
                kind: "decision",
                decision: options.decide(input, calls),
                modelContextFrame: {
                    stage: "decide",
                    epochNumber: input.goal.state.run.contextEpoch.number,
                    conversationPosition: input.goal.state.messages.length,
                    sections: [],
                },
            };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const tool = options.tool;
    const runner = new Runner({
        store: options.store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
        ...(tool === undefined
            ? {}
            : {
                toolRegistry: {
                    get: (toolId: string) => toolId === tool.definition.id
                        ? createTestToolRegistration(tool)
                        : undefined,
                },
            }),
        ...(options.requireApproval === true
            ? { toolPolicy: { evaluate: () => "require_approval" as const } }
            : {}),
    });
    const coordinator = new GoalCoordinator({
        store: options.store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: nextRunId,
    });
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        onBackgroundFailure: () => undefined,
    });
    return { sessions, store: options.store, calls: () => calls, events: () => [...trajectory.events] };
}

const askUser = (questionText: string): AgentDecision => ({
    kind: "ask_user",
    questions: [{
        header: "Next step",
        question: questionText,
        options: [{ label: "Continue" }, { label: "Stop" }],
        multiSelect: false,
    }],
});

async function waitingIdentity(
    harness: RaceHarness,
    goalId: string,
): Promise<{ readonly runId: string; readonly goal: Goal }> {
    const state = await harness.sessions.readSessionState(goalId);
    assert.ok(state !== undefined);
    const goal = await readGoal(harness, goalId);
    return { runId: state.runId, goal };
}

/** 读取测试与 Runtime 共享 Store 实例中的最新已提交快照。 */
async function readGoal(harness: RaceHarness, goalId: string): Promise<Goal> {
    const goal = await harness.store.restore(goalId);
    assert.ok(goal !== undefined);
    return goal;
}

test("问答等待：Interrupt 先受理后迟到回答与整体回复均失效", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("是否继续执行？")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-race-question";
    const created = await harness.sessions.create({
        goalId,
        inputId: "input-first",
        content: "需要问答的任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const waiting = await waitingIdentity(harness, goalId);
    const pending = waiting.goal.state.run.pendingInteraction;
    assert.ok(pending !== undefined && pending.kind === "ask_user");
    const messageCount = waiting.goal.state.messages.length;

    const interrupted = await harness.sessions.sendSessionInput(goalId, {
        kind: "interrupt",
        inputId: "interrupt-question",
        runId: waiting.runId,
    });
    assert.equal(interrupted.ok, true);

    // 中断受理后，旧交互引用立即失效、队列已暂停，且停止状态真实可见。
    const afterInterrupt = await readGoal(harness, goalId);
    assert.equal(afterInterrupt.state.messageQueue?.pause?.reason, "user_interrupt");
    assert.equal(afterInterrupt.state.run.pendingInteraction, undefined, "被中断的问答等待在同一提交中失效");
    const state = await harness.sessions.readSessionState(goalId);
    assert.equal(state?.interruption?.requestId, "interrupt-question");
    assert.equal(state?.runStatus, "cancelled");
    assert.equal(state?.waitingFor, undefined);

    const lateAnswer = await harness.sessions.sendSessionInput(goalId, {
        kind: "respond",
        inputId: "late-answer",
        runId: waiting.runId,
        requestId: pending.requestId,
        response: { kind: "answer_ask_user", answers: [{ questionId: pending.questions[0]!.id, optionIds: [pending.questions[0]!.options[0]!.id] }] },
    });
    assert.equal(lateAnswer.ok, false);
    assert.equal(lateAnswer.ok === false && lateAnswer.code, "INTERACTION_MISMATCH");
    const lateReply = await harness.sessions.sendSessionInput(goalId, {
        kind: "respond",
        inputId: "late-reply",
        runId: waiting.runId,
        requestId: pending.requestId,
        response: { kind: "reply_to_question", content: "迟到的整体回复" },
    });
    assert.equal(lateReply.ok, false);

    await harness.sessions.waitForIdle();
    const settled = await readGoal(harness, goalId);
    assert.equal(settled.state.messages.length, messageCount, "迟到的回答不追加消息");
    assert.equal(settled.state.messages.some((message) => message.content.includes("迟到的整体回复")), false);
    for (const inputId of ["late-answer", "late-reply"]) {
        const queried = await harness.sessions.querySessionInput(goalId, inputId);
        assert.equal(queried.ok && queried.found, false, "失效回答不写入受理账本");
    }
    assert.equal(harness.calls(), 1, "失效回答不触发新的模型阶段");
});

test("任务审批等待：Interrupt 先受理后迟到批准与反馈不改变提案", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? {
                kind: "task_proposal",
                task: { objective: "实现导入", completionCriteria: [{ text: "导入成功" }] },
                planRoute: { stages: [{ target: "解析", acceptanceCriteria: ["覆盖主要格式"] }] },
                approvalRequest: "请确认任务目标",
            }
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-race-task-approval";
    const created = await harness.sessions.create({
        goalId,
        inputId: "input-first",
        content: "需要任务审批的任务",
        profileId: profile.id,
        mode: "plan",
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const waiting = await waitingIdentity(harness, goalId);
    const pending = waiting.goal.state.run.pendingInteraction;
    assert.ok(pending !== undefined && pending.kind === "task_approval");

    const interrupted = await harness.sessions.sendSessionInput(goalId, {
        kind: "interrupt",
        inputId: "interrupt-task",
        runId: waiting.runId,
    });
    assert.equal(interrupted.ok, true);
    await harness.sessions.waitForIdle();

    const lateApprove = await harness.sessions.sendSessionInput(goalId, {
        kind: "respond",
        inputId: "late-approve-task",
        runId: waiting.runId,
        requestId: pending.requestId,
        response: { kind: "approve_task" },
    });
    assert.equal(lateApprove.ok, false);
    const lateFeedback = await harness.sessions.sendSessionInput(goalId, {
        kind: "respond",
        inputId: "late-feedback-task",
        runId: waiting.runId,
        requestId: pending.requestId,
        response: { kind: "feedback_task", feedback: "改一下范围" },
    });
    assert.equal(lateFeedback.ok, false);

    const settled = await readGoal(harness, goalId);
    assert.equal(settled.state.run.approvedTask, undefined, "迟到批准不改变任务提案状态");
    assert.equal(settled.state.run.status, "cancelled");
    assert.equal(settled.state.run.pendingInteraction, undefined);
});

test("工具审批等待：Interrupt 先受理后迟到批准不执行工具", async () => {
    let toolCalls = 0;
    const tool: Tool = {
        definition: {
            id: "write_probe",
            description: "May write externally",
            inputBinding: createTestBinding("test.tool", openObjectSchema()),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute() {
            toolCalls += 1;
            return { kind: "success", output: { success: true }, summary: "ok" };
        },
    };
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const goalId = "goal-race-action-approval";
    const fixture = withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "需要工具审批的任务",
        profile: toolProfile,
        runId: `run-${goalId}`,
    }));
    await store.save(fixture);

    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            return {
                kind: "decision",
                decision: { kind: "tool_call", action: { actionId: "act-1", toolId: "write_probe", input: { value: "x" } } },
                modelContextFrame: {
                    stage: "decide" as const,
                    epochNumber: input.goal.state.run.contextEpoch.number,
                    conversationPosition: input.goal.state.messages.length,
                    sections: [],
                },
            };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
        toolRegistry: { get: (toolId) => toolId === "write_probe" ? createTestToolRegistration(tool) : undefined },
        toolPolicy: { evaluate: () => "require_approval" },
    });
    const waiting = await runner.runUntilBlocked({ goalId, runId: fixture.state.run.id });
    assert.equal(waiting.ok, true);
    const pendingGoal = (await store.restore(goalId))!;
    const pending = pendingGoal.state.run.pendingAction;
    assert.ok(pending !== undefined && pending.status === "awaiting_approval");

    const accepted = await runner.interrupt({ goalId, runId: pendingGoal.state.run.id }, "interrupt-action");
    assert.equal(accepted.ok, true);
    const interrupted = (await store.restore(goalId))!;
    assert.equal(interrupted.state.run.pendingAction, undefined, "被中断的审批等待在同一提交中失效");

    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => "run-races-action-next",
    });
    const sessions = new SessionManager({
        store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => "run-races-action-next",
    });
    for (const response of [
        { kind: "approve_action" as const, actionId: pending.action.actionId, scope: "action" as const },
        { kind: "reject_action" as const, actionId: pending.action.actionId, reason: "迟到的拒绝" },
    ]) {
        const late = await sessions.sendSessionInput(goalId, {
            kind: "respond",
            inputId: `late-${response.kind}`,
            runId: interrupted.state.run.id,
            requestId: pending.action.actionId,
            response,
        });
        assert.equal(late.ok, false);
    }
    await sessions.waitForIdle();
    assert.equal(toolCalls, 0, "被中断的审批等待不执行工具");
    assert.equal(calls, 1, "失效批准不调用模型");
    assert.equal((await store.restore(goalId))?.state.run.status, "cancelled");
});

test("回答先受理：Interrupt 仍按最新 Run 状态生效且不回滚已提交回答", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("第一问")
            : callIndex === 2
                ? askUser("第二问")
                : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-race-answer-first";
    const created = await harness.sessions.create({
        goalId,
        inputId: "input-first",
        content: "先回答再停止",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const first = await waitingIdentity(harness, goalId);
    const firstPending = first.goal.state.run.pendingInteraction;
    assert.ok(firstPending !== undefined && firstPending.kind === "ask_user");

    const answered = await harness.sessions.sendSessionInput(goalId, {
        kind: "respond",
        inputId: "answer-first",
        runId: first.runId,
        requestId: firstPending.requestId,
        response: {
            kind: "answer_ask_user",
            answers: [{ questionId: firstPending.questions[0]!.id, optionIds: [firstPending.questions[0]!.options[0]!.id] }],
        },
    });
    assert.equal(answered.ok, true);
    assert.equal(answered.ok && answered.receipt.status, "applied");
    await harness.sessions.waitForIdle();

    const second = await waitingIdentity(harness, goalId);
    assert.equal(second.runId, first.runId, "回答继续原 Run");
    assert.ok(second.goal.state.messages.some((message) => message.content.includes("Answer: Continue")));

    const interrupted = await harness.sessions.sendSessionInput(goalId, {
        kind: "interrupt",
        inputId: "interrupt-after-answer",
        runId: second.runId,
    });
    assert.equal(interrupted.ok, true);
    await harness.sessions.waitForIdle();

    const settled = await readGoal(harness, goalId);
    assert.equal(settled.state.run.status, "cancelled");
    assert.equal(settled.state.messages.some((message) => message.content.includes("Answer: Continue")), true, "已提交回答不被回滚");
    const receipt = await harness.sessions.querySessionInput(goalId, "answer-first");
    assert.equal(receipt.ok && receipt.found && receipt.receipt.status, "applied");
});

test("未知效果中断直接取消，不调用模型或提出新的审批请求", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const goalId = "goal-race-repair";
    const fixture = withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "中断未知写入",
        profile: repairProfile,
        runId: `run-${goalId}`,
    }));
    await store.save(fixture);
    const entered = deferred();
    let calls = 0;
    let toolCalls = 0;
    let inspectCalls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            if (calls === 1) {
                return {
                    kind: "decision",
                    decision: { kind: "tool_call", action: { actionId: "act-write-1", toolId: "write_probe", input: { value: "x" } } },
                    modelContextFrame: { stage: "decide" as const, epochNumber: input.goal.state.run.contextEpoch.number, conversationPosition: input.goal.state.messages.length, sections: [] },
                };
            }
            throw new Error("Interrupt must not call the model again");
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const tool: Tool = {
        definition: {
            id: "write_probe",
            description: "May write externally",
            inputBinding: createTestBinding("test.tool", openObjectSchema()),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(_request, control) {
            toolCalls += 1;
            entered.resolve();
            return new Promise((_, reject) => control?.signal?.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true }));
        },
    };
    const inspectTool: Tool = {
        definition: {
            id: "inspect_probe",
            description: "Inspect safely",
            inputBinding: createTestBinding("test.tool", openObjectSchema()),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            inspectCalls += 1;
            return { kind: "success", output: { success: true }, summary: "inspected" };
        },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
        toolRegistry: {
            get: (toolId) => toolId === "write_probe" ? createTestToolRegistration(tool)
                : toolId === "inspect_probe" ? createTestToolRegistration(inspectTool) : undefined,
        },
        // 允许写入探针执行；中断后不得再提出检查工具审批。
        toolPolicy: { evaluate: ({ action }) => action.toolId === "inspect_probe" ? "require_approval" : "allow" },
    });
    const execution = runner.runUntilBlocked({ goalId, runId: fixture.state.run.id });
    await entered.promise;
    const accepted = await runner.interrupt({ goalId, runId: fixture.state.run.id }, "interrupt-repair");
    assert.equal(accepted.ok, true);
    await execution;

    const settled = (await store.restore(goalId))!;
    assert.equal(settled.state.run.status, "cancelled");
    assert.equal(settled.state.run.interruption?.status, "finished");
    assert.equal(settled.state.run.interruption?.outcomeUnknown, true);
    assert.equal(settled.state.run.pendingAction, undefined);
    assert.equal(calls, 1);
    assert.equal(toolCalls, 1);
    assert.equal(inspectCalls, 0);
    assert.equal(settled.state.messageQueue?.pause?.reason, "user_interrupt");
    assert.equal(trajectory.events.some((event) =>
        event.eventType === "run_interrupted_action_unknown" && event.payload.actionId === "act-write-1"), true);
    assert.equal(trajectory.events.some((event) =>
        event.eventType === "tool_finished" && event.actionId === "act-write-1"), false);
});

test("读取、解除句柄与普通消息不会产生用户 Interrupt 事实", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("等待回答")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-race-no-interrupt";
    const created = await harness.sessions.create({
        goalId,
        inputId: "input-first",
        content: "只读操作不应停止任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const waiting = await waitingIdentity(harness, goalId);

    await harness.sessions.readSessionState(goalId);
    const opened = await harness.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (opened.ok) {
        const stream = opened.session.events();
        stream.close();
        opened.session.detach();
    }
    if (created.ok) {
        created.session.detach();
        const queued = await harness.sessions.sendSessionInput(goalId, {
            kind: "message",
            inputId: "queued-plain",
            content: "后续任务",
        });
        assert.equal(queued.ok, true);
    }
    await harness.sessions.waitForIdle();

    const goal = await readGoal(harness, goalId);
    assert.equal(goal.state.run.status, "waiting");
    assert.equal(goal.state.run.interruption, undefined);
    assert.equal(goal.state.messageQueue?.pause, undefined);
    assert.equal(harness.events().some((event) => event.eventType === "run_interrupt_requested"), false);
    assert.equal(waiting.runId, goal.state.run.id);
});
