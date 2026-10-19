import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type GoalStore,
    type InteractionHandlerFailure,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = { id: "handler-recovery-profile", systemPrompt: "Test", instructions: [], toolIds: [] };
const profiles: AgentProfileRegistry = { get: (id) => id === profile.id ? profile : undefined };

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

/** 宿主回调收到的处理故障；每个用例开始前清空。 */
const handlerReports: InteractionHandlerFailure[] = [];

function takeReports(): InteractionHandlerFailure[] {
    return handlerReports.splice(0, handlerReports.length);
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached before the test deadline");
}

/** 可注入一次保存失败的 Store 包装；其余调用委托原 Store。 */
class FailingSaveStore implements GoalStore {
    failNextSave = false;

    constructor(private readonly inner: InMemoryGoalStore) {}

    save(goal: Goal): Promise<void> {
        if (this.failNextSave) {
            this.failNextSave = false;
            return Promise.reject(new Error("injected save failure"));
        }
        return this.inner.save(goal);
    }

    restore(goalId: string): Promise<Goal | undefined> {
        return this.inner.restore(goalId);
    }
}

let harnessCounter = 0;

interface RecoveryHarness {
    readonly sessions: SessionManager;
    readonly failures: () => readonly InteractionHandlerFailure[];
    readonly ids: () => readonly string[];
}

function createHarness(options: {
    readonly store: GoalStore;
    readonly trajectoryStore: ReturnType<typeof trajectoryStoreFor>;
    readonly decide: (callIndex: number) => AgentDecision;
    readonly failNextSave?: { current: boolean };
}): RecoveryHarness {
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: options.trajectoryStore });
    let calls = 0;
    harnessCounter += 1;
    const harnessId = harnessCounter;
    let runCounter = 0;
    const nextRunId = (): string => `run-handler-recovery-${harnessId}-${++runCounter}`;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            return {
                kind: "decision",
                decision: options.decide(calls),
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
        store: options.store,
        trajectoryStore: options.trajectoryStore,
        executor,
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store: options.store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: nextRunId,
    });
    const failures: InteractionHandlerFailure[] = [];
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        resyncIntervalMs: 20,
    });
    return {
        sessions,
        failures: () => [...failures],
        ids: () => [...failures.map((failure) => failure.interactionId)],
    };
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

/** 建立问答等待并返回稳定身份。 */
async function reachQuestion(
    harness: RecoveryHarness,
    goalId: string,
    inner: InMemoryGoalStore,
): Promise<{ readonly runId: string; readonly requestId: string }> {
    const created = await harness.sessions.create({ goalId, inputId: "input-first", content: "宿主处理", profileId: profile.id });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    return questionIdentity(goalId, inner);
}

async function questionIdentity(
    goalId: string,
    inner: InMemoryGoalStore,
): Promise<{ readonly runId: string; readonly requestId: string }> {
    const goal = (await inner.restore(goalId))!;
    const pending = goal.state.run.pendingInteraction;
    assert.ok(pending !== undefined && pending.kind === "ask_user");
    return { runId: goal.state.run.id, requestId: pending.requestId };
}

/** 显式恢复解锁历史请求投递；等待中的交互本身仍保持等待。 */
async function unlockHistory(
    harness: RecoveryHarness,
    goalId: string,
    runId: string,
    commitRevision: number,
): Promise<void> {
    await harness.sessions.sendSessionInput(goalId, {
        kind: "resume",
        inputId: `resume-${Math.random().toString(36).slice(2)}`,
        runId,
        commitRevision,
    });
}

test("处理函数抛错：报告可定位故障、保留等待且不重调函数", async () => {
    const inner = new InMemoryGoalStore();
    const harness = createHarness({
        store: inner,
        trajectoryStore: trajectoryStoreFor(inner),
        decide: (callIndex) => callIndex === 1 ? askUser("会抛错吗？") : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-handler-throw";
    const identity = await reachQuestion(harness, goalId, inner);

    let calls = 0;
    const opened = await harness.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const attached = opened.session.attachInteractionHandlers({
        onQuestion: async () => {
            calls += 1;
            throw new Error("host function exploded");
        },
    }, { onFailure: (failure) => { handlerReports.push(failure); } });
    assert.equal(attached.ok, true);
    await unlockHistory(harness, goalId, identity.runId, (await opened.session.read())!.commitRevision);
    await waitFor(() => handlerReports.length === 1);

    const reports = takeReports();
    assert.equal(calls, 1, "故障后不重复调用函数");
    assert.equal(reports.length, 1);
    assert.equal(reports[0]!.phase, "handler");
    assert.equal(reports[0]!.code, "HANDLER_FAILED");
    assert.equal(reports[0]!.goalId, goalId);
    assert.match(reports[0]!.message, /host function exploded/);

    const goal = (await inner.restore(goalId))!;
    assert.equal(goal.state.run.status, "waiting", "抛错不默认批准或拒绝，等待保持不变");
    assert.equal(goal.state.run.pendingInteraction?.requestId, identity.requestId);
});

test("业务拒绝：报告受理拒绝并保留原等待", async () => {
    const inner = new InMemoryGoalStore();
    const harness = createHarness({
        store: inner,
        trajectoryStore: trajectoryStoreFor(inner),
        decide: (callIndex) => callIndex === 1 ? askUser("会不会被拒绝？") : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-handler-rejected";
    const identity = await reachQuestion(harness, goalId, inner);
    const opened = await harness.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;

    const attached = opened.session.attachInteractionHandlers({
        // 错误的响应种类：问答等待不接受任务批准。
        onQuestion: async () => ({ kind: "respond", response: { kind: "approve_task" } }),
    }, { onFailure: (failure) => { handlerReports.push(failure); } });
    assert.equal(attached.ok, true);
    await unlockHistory(harness, goalId, identity.runId, (await opened.session.read())!.commitRevision);
    await waitFor(() => handlerReports.length === 1);
    const failure = takeReports()[0]!;
    assert.equal(failure.phase, "admission");
    assert.equal(failure.code, "ADMISSION_REJECTED");
    assert.equal(failure.kind, "question");
    assert.ok(failure.inputId !== undefined);

    const goal = (await inner.restore(goalId))!;
    assert.equal(goal.state.run.status, "waiting");
    assert.equal(goal.state.run.pendingInteraction?.requestId, identity.requestId);
    const receipt = await harness.sessions.querySessionInput(goalId, failure.inputId!);
    assert.equal(receipt.ok && receipt.found, false, "业务拒绝不写入受理账本");
});

test("提交结果不明：查询原身份收据后报告未知，不伪造收据也不重调函数", async () => {
    const inner = new InMemoryGoalStore();
    const store = new FailingSaveStore(inner);
    const harness = createHarness({
        store,
        trajectoryStore: trajectoryStoreFor(inner),
        decide: (callIndex) => callIndex === 1 ? askUser("保存会失败吗？") : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-handler-unknown";
    const identity = await reachQuestion(harness, goalId, inner);
    const opened = await harness.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;

    let calls = 0;
    const attached = opened.session.attachInteractionHandlers({
        onQuestion: async () => {
            calls += 1;
            const pending = (await inner.restore(goalId))!.state.run.pendingInteraction;
            return {
                kind: "respond",
                response: {
                    kind: "answer_ask_user",
                    answers: [{
                        questionId: pending?.kind === "ask_user" ? pending.questions[0]!.id : "q-1",
                        optionIds: ["o-1"],
                    }],
                },
            };
        },
    }, { onFailure: (failure) => { handlerReports.push(failure); } });
    assert.equal(attached.ok, true);
    store.failNextSave = true;
    await unlockHistory(harness, goalId, identity.runId, (await opened.session.read())!.commitRevision);
    await waitFor(() => handlerReports.length === 1);
    const failure = takeReports()[0]!;
    assert.equal(failure.phase, "admission");
    assert.equal(failure.code, "ADMISSION_UNKNOWN");
    assert.ok(failure.inputId !== undefined);
    assert.equal(calls, 1, "结果不明不重新调用函数产生第二个决定");
    const receipt = await harness.sessions.querySessionInput(goalId, failure.inputId!);
    assert.equal(receipt.ok && receipt.found, false, "未提交时不伪造收据");

    const goal = (await inner.restore(goalId))!;
    assert.equal(goal.state.run.status, "waiting");
    assert.equal(goal.state.run.pendingInteraction?.requestId, identity.requestId);
});

test("解除连接中止在途调用，迟到的结果不再提交也不撤销已受理决定", async () => {
    const inner = new InMemoryGoalStore();
    const harness = createHarness({
        store: inner,
        trajectoryStore: trajectoryStoreFor(inner),
        decide: (callIndex) => callIndex === 1 ? askUser("解除会中止吗？") : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-handler-detach";
    const identity = await reachQuestion(harness, goalId, inner);
    const opened = await harness.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;

    const entered = deferred();
    const release = deferred();
    let aborted = false;
    let calls = 0;
    const attached = opened.session.attachInteractionHandlers({
        onQuestion: async ({ signal }) => {
            calls += 1;
            entered.resolve();
            return new Promise((resolve) => {
                signal.addEventListener("abort", () => {
                    aborted = true;
                    resolve({ kind: "respond", response: { kind: "skip_question" } });
                }, { once: true });
                void release.promise.then(() => resolve({ kind: "respond", response: { kind: "skip_question" } }));
            });
        },
    });
    assert.equal(attached.ok, true);
    await unlockHistory(harness, goalId, identity.runId, (await opened.session.read())!.commitRevision);
    await entered.promise;
    if (attached.ok) attached.handle.detach();
    await waitFor(() => aborted);
    release.resolve();
    await harness.sessions.waitForIdle();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 解除不取消 Goal，也不解除等待；迟到结果不提交。
    const goal = (await inner.restore(goalId))!;
    assert.equal(goal.state.run.status, "waiting");
    assert.equal(goal.state.run.pendingInteraction?.requestId, identity.requestId);
    assert.equal(goal.state.messages.some((message) => message.content.includes("did not answer")), false);
    assert.equal(calls, 1);

    // 显式重新连接并处理仍未结算的请求：解除后可再次投递。
    const reattached = opened.session.attachInteractionHandlers({
        onQuestion: async () => ({ kind: "respond", response: { kind: "skip_question" } }),
    });
    assert.equal(reattached.ok, true);
    await unlockHistory(harness, goalId, identity.runId, (await opened.session.read())!.commitRevision);
    await waitFor(async () => (await inner.restore(goalId))!.state.messages.some((message) => message.content.includes("did not answer")));
    if (reattached.ok) reattached.handle.detach();
});

test("永不结束的处理 Promise 不拖住有界关闭", async () => {
    const inner = new InMemoryGoalStore();
    const harness = createHarness({
        store: inner,
        trajectoryStore: trajectoryStoreFor(inner),
        decide: (callIndex) => callIndex === 1 ? askUser("会不会一直挂着？") : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-handler-hanging";
    const identity = await reachQuestion(harness, goalId, inner);
    const opened = await harness.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const entered = deferred();
    const attached = opened.session.attachInteractionHandlers({
        onQuestion: async () => {
            entered.resolve();
            return new Promise(() => undefined);
        },
    });
    assert.equal(attached.ok, true);
    await unlockHistory(harness, goalId, identity.runId, (await opened.session.read())!.commitRevision);
    await entered.promise;

    await harness.sessions.close({ timeoutMs: 1_000 });
    assert.equal((await inner.restore(goalId))!.state.run.status, "waiting", "关闭不取消 Goal，也不伪造取消");
});

test("重建实例后注册处理器不投递历史等待；busy 不解锁，显式恢复才投递", async () => {
    const inner = new InMemoryGoalStore();
    const first = createHarness({
        store: inner,
        trajectoryStore: trajectoryStoreFor(inner),
        decide: (callIndex) => callIndex === 1 ? askUser("历史等待") : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-handler-rebuild";
    const identity = await reachQuestion(first, goalId, inner);

    // 重建实例：只读打开并注册处理器不回答历史等待。
    const rebuilt = createHarness({
        store: inner,
        trajectoryStore: trajectoryStoreFor(inner),
        decide: () => ({ kind: "complete", summary: "重建后完成", evidenceSequences: [] }),
    });
    const calls = { count: 0 };
    const opened = await rebuilt.sessions.open(goalId);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const attached = opened.session.attachInteractionHandlers({
        onQuestion: async () => {
            calls.count += 1;
            return { kind: "unhandled" };
        },
    });
    assert.equal(attached.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(calls.count, 0, "注册处理器不自动处理历史等待");
    assert.equal((await inner.restore(goalId))!.state.run.status, "waiting");

    // 另一个 Goal 占用实例名额时恢复被拒绝：不解锁自动投递。
    const busy = await rebuilt.sessions.create({ goalId: "goal-handler-busy", inputId: "input-busy", content: "占用名额", profileId: profile.id });
    assert.equal(busy.ok, true);
    // 另一个 Goal 占用名额：恢复被 BUSY 拒绝，不解锁自动投递。
    const busyHarness = rebuilt;
    await busyHarness.sessions.create({ goalId: "goal-handler-busy", inputId: "input-busy", content: "占用名额", profileId: profile.id });
    const busyResume = await rebuilt.sessions.sendSessionInput(goalId, {
        kind: "resume",
        inputId: "resume-busy",
        runId: identity.runId,
        commitRevision: (await opened.session.read())!.commitRevision,
    });
    assert.equal(busyResume.ok, false);
    assert.equal(busyResume.ok === false && busyResume.code, "BUSY");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(calls.count, 0, "busy 恢复失败不解锁自动投递");

    // 显式恢复成功后投递当前历史请求。
    const resumed = await rebuilt.sessions.sendSessionInput(goalId, {
        kind: "resume",
        inputId: "resume-explicit",
        runId: identity.runId,
        commitRevision: (await opened.session.read())!.commitRevision,
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.ok === false && resumed.code, "INTERACTION_REQUIRED");
    await waitFor(() => calls.count === 1);
    if (attached.ok) attached.handle.detach();
});

