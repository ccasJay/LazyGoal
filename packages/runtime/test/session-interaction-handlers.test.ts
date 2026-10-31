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
    type GoalInteractionView,
    type InteractionHandlerCall,
    type SessionInteractionHandlers,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { contract } from "../../contracts/src/index";
import { createToolRegistration, type Tool } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

const profile: AgentProfile = { id: "handler-profile", systemPrompt: "Test", instructions: [], toolIds: [] };
const toolProfile: AgentProfile = { id: "handler-tool-profile", systemPrompt: "Test", instructions: [], toolIds: ["write_probe"] };
const profiles: AgentProfileRegistry = {
    get: (id) => id === profile.id ? profile : id === toolProfile.id ? toolProfile : undefined,
};

/** 处理器投递取决于提交核对周期：确定性等待条件成立而不是固定睡眠。 */
async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached before the test deadline");
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

let harnessCounter = 0;

interface HandlerHarness {
    readonly sessions: SessionManager;
    readonly store: InMemoryGoalStore;
    readonly calls: () => number;
    readonly failures: () => readonly unknown[];
}

function createHarness(options: {
    readonly store: InMemoryGoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => AgentDecision;
    readonly tool?: Tool;
    readonly requireApproval?: boolean;
}): HandlerHarness {
    const trajectory = trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: trajectory });
    let calls = 0;
    harnessCounter += 1;
    const harnessId = harnessCounter;
    let runCounter = 0;
    const nextRunId = (): string => `run-handler-${harnessId}-${++runCounter}`;
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
        ...(options.requireApproval === true ? { toolPolicy: { evaluate: () => "require_approval" as const } } : {}),
    });
    const coordinator = new GoalCoordinator({
        store: options.store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: nextRunId,
    });
    const failures: unknown[] = [];
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        // 测试使用短核对周期，确定性等待处理器投递而不是固定睡眠。
        resyncIntervalMs: 20,
        onBackgroundFailure: (_goalId, error) => { failures.push(error); },
    });
    return { sessions, store: options.store, calls: () => calls, failures: () => [...failures] };
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

async function settle(sessions: SessionManager): Promise<void> {
    await sessions.waitForIdle();
    // 处理器投递与结果受理都是受追踪的后台任务：双重等待保证结果已结算。
    await sessions.waitForIdle();
}

test("按交互种类分派：匹配函数处理，缺少函数或 unhandled 保持等待", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("是否继续执行？")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const created = await harness.sessions.create({
        goalId: "goal-handler-question",
        inputId: "input-first",
        content: "需要问答的任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await settle(harness.sessions);

    const questionCalls: InteractionHandlerCall[] = [];
    const otherCalls: string[] = [];
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async (call) => {
            questionCalls.push(call);
            const detail = await call.readDetail();
            assert.equal(detail.ok, true);
            return { kind: "unhandled" };
        },
        onTaskApproval: async () => { otherCalls.push("task"); return { kind: "unhandled" }; },
        onActionApproval: async () => { otherCalls.push("action"); return { kind: "unhandled" }; },
        onActionRecovery: async () => { otherCalls.push("recovery"); return { kind: "unhandled" }; },
    });
    assert.equal(attached.ok, true);

    // 连接时已有的等待是历史请求：只有显式恢复才解锁。
    await settle(harness.sessions);
    assert.equal(questionCalls.length, 0, "注册处理器不自动回答历史等待");
    const resumed = await created.session.send({ kind: "resume", inputId: "resume-1", runId: (await store.restore("goal-handler-question"))!.state.run.id, commitRevision: (await created.session.read())!.commitRevision });
    assert.equal(resumed.ok, false);
    await waitFor(() => questionCalls.length === 1);
    assert.equal(otherCalls.length, 0, "只调用匹配种类的函数");
    assert.equal(questionCalls[0]!.request.kind, "question");
    assert.equal(questionCalls[0]!.signal.aborted, false);

    // unhandled 保持等待且不重复调用。
    const state = await created.session.read();
    assert.equal(state?.waitingFor, "ask_user");
    assert.equal(questionCalls.length, 1);
});

test("程序化回答通过统一 send 受理并结算原 Run", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("第一问")
            : callIndex === 2
                ? askUser("第二问")
                : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const created = await harness.sessions.create({
        goalId: "goal-handler-answer",
        inputId: "input-first",
        content: "程序化回答",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await settle(harness.sessions);

    const answeredQuestions: string[] = [];
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async ({ readDetail }) => {
            const detail = await readDetail();
            assert.equal(detail.ok, true);
            if (!detail.ok || detail.detail.kind !== "question") return { kind: "unhandled" };
            answeredQuestions.push(detail.detail.questions[0]!.question);
            return {
                kind: "respond",
                response: {
                    kind: "answer_ask_user",
                    answers: [{ questionId: detail.detail.questions[0]!.id, optionIds: [detail.detail.questions[0]!.options[0]!.id] }],
                },
            };
        },
    });
    assert.equal(attached.ok, true);
    await settle(harness.sessions);

    // 新产生的第二个等待被自动回答，第一个历史等待保持由真人处理。
    const second = await created.session.send({
        kind: "respond",
        inputId: "human-answer-first",
        runId: (await store.restore("goal-handler-answer"))!.state.run.id,
        requestId: (await store.restore("goal-handler-answer"))!.state.run.pendingInteraction!.requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(second.ok, true);
    await waitFor(() => answeredQuestions.length === 1);

    const goal = (await store.restore("goal-handler-answer"))!;
    assert.equal(goal.state.run.status, "completed");
    assert.deepEqual(answeredQuestions, ["第二问"]);
    assert.ok(goal.state.messages.some((message) => message.content.includes("Answer: Continue")), "程序化答案作为真实用户消息进入历史");
    const receipt = goal.state.inputLedger?.find((record) => record.kind === "respond" && record.inputId.startsWith("handler-"));
    assert.ok(receipt !== undefined);
    assert.equal(receipt.status, "applied");
    assert.equal(goal.state.messages.some((message) => message.content.includes("did not answer")), true, "真人跳过仍然生效");
});

test("同一 Goal 只允许一个自动所有者，第二连接明确冲突且不替换原处理器", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("谁处理？")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const created = await harness.sessions.create({
        goalId: "goal-handler-owner",
        inputId: "input-first",
        content: "所有者冲突",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await settle(harness.sessions);

    const first = created.session.attachInteractionHandlers({ onQuestion: async () => ({ kind: "unhandled" }) });
    assert.equal(first.ok, true);
    const opened = await harness.sessions.open("goal-handler-owner");
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const second = opened.session.attachInteractionHandlers({ onQuestion: async () => ({ kind: "unhandled" }) });
    assert.equal(second.ok, false);
    assert.equal(second.ok === false && second.code, "HANDLER_CONFLICT");

    // 其他句柄仍可观察与提交真人决定；解除后可以重新连接。
    const state = await opened.session.read();
    assert.equal(state?.waitingFor, "ask_user");
    if (first.ok) first.handle.detach();
    const reattached = opened.session.attachInteractionHandlers({ onQuestion: async () => ({ kind: "unhandled" }) });
    assert.equal(reattached.ok, true);
    if (reattached.ok) reattached.handle.detach();
});

test("自动放行的工具不触发审批处理器，恢复请求不落入普通工具函数", async () => {
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
    const goalId = "goal-handler-auto-allow";
    const fixture = withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "自动放行",
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
                decision: calls === 1
                    ? { kind: "tool_call" as const, action: { actionId: "act-1", toolId: "write_probe", input: { value: "x" } } }
                    : { kind: "wait" as const, reason: "等待后续输入" },
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
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
        toolRegistry: { get: (toolId) => toolId === "write_probe" ? createTestToolRegistration(tool) : undefined },
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => "run-handler-auto-allow-next",
    });
    const sessions = new SessionManager({
        store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => "run-handler-auto-allow-next",
        resyncIntervalMs: 20,
    });

    const approvalCalls: string[] = [];
    const recoveryCalls: string[] = [];
    const opened = await sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const attached = opened.session.attachInteractionHandlers({
        onActionApproval: async () => { approvalCalls.push("approval"); return { kind: "unhandled" }; },
        onActionRecovery: async () => { recoveryCalls.push("recovery"); return { kind: "unhandled" }; },
    });
    assert.equal(attached.ok, true);

    // 工具由既有授权规则自动放行：不产生审批等待，也不调用任何审批函数。
    const result = await runner.runUntilBlocked({ goalId, runId: fixture.state.run.id });
    assert.equal(result.ok, true);
    await sessions.waitForIdle();
    assert.equal(toolCalls, 1, "自动放行的工具直接执行，不产生审批等待");
    assert.equal(approvalCalls.length, 0);
    assert.equal(recoveryCalls.length, 0);
    const goal = (await store.restore(goalId))!;
    assert.equal(goal.state.run.status, "waiting", "自动放行后按既有决策进入普通等待");
    assert.equal(goal.state.run.pendingAction, undefined, "没有审批等待，也没有恢复等待");
    assert.equal(goal.state.run.pendingInteraction, undefined);
});

test("处理函数在 Gate 外运行：等待期间仍可读取状态、真人响应与停止", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("等待真人还是停止？")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const created = await harness.sessions.create({
        goalId: "goal-handler-human-race",
        inputId: "input-first",
        content: "处理器等待真人",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await settle(harness.sessions);

    const entered = deferred();
    let aborted = false;
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async ({ signal }) => {
            entered.resolve();
            return new Promise((resolve) => {
                signal.addEventListener("abort", () => {
                    aborted = true;
                    resolve({ kind: "unhandled" });
                }, { once: true });
            });
        },
    });
    assert.equal(attached.ok, true);
    // 先用普通消息解锁不了等待；用显式恢复解锁历史请求，触发处理器调用。
    const goal = (await store.restore("goal-handler-human-race"))!;
    await created.session.send({ kind: "resume", inputId: "resume-unlock", runId: goal.state.run.id, commitRevision: (await created.session.read())!.commitRevision });
    await entered.promise;

    // 更长的等待期间：读取与其他控制不被阻塞。
    const state = await created.session.read();
    assert.equal(state?.waitingFor, "ask_user");
    const interrupted = await created.session.send({ kind: "interrupt", inputId: "interrupt-while-handler", runId: goal.state.run.id });
    assert.equal(interrupted.ok, true);
    await waitFor(() => aborted);
    const settled = await store.restore("goal-handler-human-race");
    assert.equal(settled?.state.run.status, "cancelled");
    assert.equal(settled?.state.messages.some((message) => message.content.includes("Answer: ")), false);
    assert.equal(harness.failures().length, 0);
});

test("未实现 View 取消信号的处理函数返回时，请求已变化的结果不再提交", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("迟到结果？")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const created = await harness.sessions.create({
        goalId: "goal-handler-late",
        inputId: "input-first",
        content: "迟到结果",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await settle(harness.sessions);

    const entered = deferred();
    const release = deferred();
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async () => {
            entered.resolve();
            await release.promise;
            return { kind: "respond", response: { kind: "skip_question" } };
        },
    });
    assert.equal(attached.ok, true);
    const goal = (await store.restore("goal-handler-late"))!;
    await created.session.send({ kind: "resume", inputId: "resume-unlock", runId: goal.state.run.id, commitRevision: (await created.session.read())!.commitRevision });
    await entered.promise;

    const human = await created.session.send({
        kind: "respond",
        inputId: "human-skip",
        runId: goal.state.run.id,
        requestId: goal.state.run.pendingInteraction!.requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(human.ok, true);
    await settle(harness.sessions);
    release.resolve();
    await settle(harness.sessions);

    const settled = (await store.restore("goal-handler-late"))!;
    const skipMessages = settled.state.messages.filter((message) => message.content.includes("did not answer"));
    assert.equal(skipMessages.length, 1, "迟到处理器结果不重复结算同一等待");
});

test("只读订阅与处理函数并存时，公开投影不泄露完整参数", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("只读观察与处理并存？")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const created = await harness.sessions.create({
        goalId: "goal-handler-observer",
        inputId: "input-first",
        content: "只读观察",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await settle(harness.sessions);

    const attached = created.session.attachInteractionHandlers({ onQuestion: async () => ({ kind: "unhandled" }) });
    assert.equal(attached.ok, true);
    const view = await created.session.interaction();
    assert.ok(view !== undefined);
    assert.equal(Object.hasOwn(view!, "questions"), false, "投影只携带身份与决定，不复制请求正文");
    const detail = await created.session.interactionDetail({ runId: view!.runId, interactionId: view!.interactionId });
    assert.equal(detail.ok, true);
    assert.equal(detail.ok && detail.detail.kind === "question", true);

    // 处理函数连接不影响其他只读消费者：另一种等待种类仍可通过同一读取入口查看。
    const readOnlyView: GoalInteractionView | undefined = await openedView(harness, "goal-handler-observer");
    assert.equal(readOnlyView?.interactionId, view!.interactionId);
});

async function openedView(harness: HandlerHarness, goalId: string): Promise<GoalInteractionView | undefined> {
    const opened = await harness.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return undefined;
    return opened.session.interaction();
}

test("未知结果恢复请求只由 onActionRecovery 处理，不落入普通工具审批函数", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const goalId = "goal-handler-recovery";
    const fixture = withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "未知结果恢复",
        profile: toolProfile,
        runId: `run-${goalId}`,
    }));
    const waiting = {
        ...fixture,
        state: {
            ...fixture.state,
            run: {
                ...fixture.state.run,
                status: "waiting" as const,
                pendingAction: {
                    action: { actionId: "act-recovery", toolId: "write_probe", input: { value: "x" } },
                    status: "outcome_unknown" as const,
                    attemptsStarted: 1,
                },
            },
        },
    };
    await store.save(waiting);

    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: {
            async reviewCompletion() { return { kind: "accept" as const }; },
            async decide() { return { kind: "decision" as const, decision: { kind: "wait" as const, reason: "等待恢复决定" }, modelContextFrame: { stage: "decide" as const, epochNumber: 1, conversationPosition: waiting.state.messages.length, sections: [] } }; },
            async think() { throw new Error("unexpected Think call"); },
        },
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => "run-handler-recovery-next",
    });
    const sessions = new SessionManager({
        store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => "run-handler-recovery-next",
        resyncIntervalMs: 20,
    });
    const opened = await sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const approvalCalls: string[] = [];
    const recoveryRequests: string[] = [];
    const attached = opened.session.attachInteractionHandlers({
        onActionApproval: async () => { approvalCalls.push("approval"); return { kind: "unhandled" }; },
        onActionRecovery: async ({ request }) => {
            recoveryRequests.push(request.kind);
            assert.ok(request.kind === "action_recovery");
            return {
                kind: "respond",
                response: {
                    kind: "decline_unknown_action_retry",
                    actionId: "act-recovery",
                    recoveryRef: request.recoveryRef,
                    reason: "拒绝再次执行",
                },
            };
        },
    });
    assert.equal(attached.ok, true);
    // 历史恢复等待需要显式恢复才解锁投递。
    await opened.session.send({
        kind: "resume",
        inputId: "resume-recovery",
        runId: waiting.state.run.id,
        commitRevision: (await opened.session.read())!.commitRevision,
    });
    await waitFor(() => recoveryRequests.length === 1);
    await waitFor(async () => (await store.restore(goalId))!.state.run.pendingAction === undefined);

    assert.deepEqual(recoveryRequests, ["action_recovery"]);
    assert.equal(approvalCalls.length, 0, "恢复请求不被普通工具审批函数代答");
    const settled = (await store.restore(goalId))!;
    assert.equal(settled.state.run.pendingAction, undefined);
    assert.equal(settled.state.messages.some((message) => message.content.includes("拒绝再次执行")), false, "拒绝通过 Action 事实结算而不是伪造用户消息");
});
