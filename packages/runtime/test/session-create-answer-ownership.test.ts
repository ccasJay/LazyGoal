import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    SessionManagerCloseError,
    TrajectoryCheckpointCommitter,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type GoalStore,
    type StepExecutionInput,
    type StepExecutor,
    type TrajectoryStore,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-ownership-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

const profiles: AgentProfileRegistry = {
    get(profileId: string): AgentProfile | undefined {
        return profileId === profile.id ? profile : undefined;
    },
};

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function withDeadline<T>(promise: Promise<T>, label: string, ms = 2000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`${label} did not settle within ${ms}ms`)), ms);
        }),
    ]);
}

/** 只拦截 Snapshot 写入的 Store 包装；读取与修订保持内层语义。 */
class BlockingGoalStore implements GoalStore {
    private readonly inner = new InMemoryGoalStore();
    private readonly gate = deferred();

    async save(goal: Goal): Promise<void> {
        await this.gate.promise;
        await this.inner.save(goal);
    }

    restore(goalId: string): Promise<Goal | undefined> {
        return this.inner.restore(goalId);
    }

    readRevision(goalId: string): Promise<number | undefined> {
        return this.inner.readRevision(goalId);
    }

    release(): void {
        this.gate.resolve();
    }
}

interface OwnershipHarness {
    readonly sessions: SessionManager;
    readonly coordinator: GoalCoordinator;
    readonly calls: () => number;
    readonly store: GoalStore;
}

function createHarness(options: {
    readonly store: GoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => AgentDecision | Promise<AgentDecision>;
    readonly runIdPrefix: string;
    readonly trajectoryStore?: TrajectoryStore;
    /** 仅创建边界使用给定 Trajectory，用于验证提交 marker 故障。 */
    readonly createTrajectory?: TrajectoryStore;
}): OwnershipHarness {
    const trajectory = options.trajectoryStore ?? trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({
        store: options.store,
        trajectoryStore: trajectory,
    });
    let calls = 0;
    let runCounter = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            const decision = await options.decide(input, calls);
            return {
                kind: "decision",
                decision,
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
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store: options.store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => {
            runCounter += 1;
            return `${options.runIdPrefix}-${runCounter}`;
        },
    });
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => {
            runCounter += 1;
            return `${options.runIdPrefix}-${runCounter}`;
        },
        ...(options.createTrajectory === undefined
            ? {}
            : { trajectoryStore: options.createTrajectory }),
    });
    return { sessions, coordinator, calls: () => calls, store: options.store };
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

async function readGoal(store: GoalStore, goalId: string): Promise<Goal> {
    const goal = await store.restore(goalId);
    assert.ok(goal !== undefined, `Goal "${goalId}" must exist`);
    return goal;
}

async function reachQuestion(
    harness: OwnershipHarness,
    goalId: string,
): Promise<{ readonly runId: string; readonly requestId: string; readonly questionId: string; readonly optionId: string }> {
    const created = await harness.sessions.create({
        goalId,
        inputId: "input-first",
        content: "需要回答的任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const goal = await readGoal(harness.store, goalId);
    assert.equal(goal.state.run.status, "waiting");
    const pending = goal.state.run.pendingInteraction;
    assert.ok(pending !== undefined && pending.kind === "ask_user");
    return {
        runId: goal.state.run.id,
        requestId: pending.requestId,
        questionId: pending.questions[0]!.id,
        optionId: pending.questions[0]!.options[0]!.id,
    };
}

function answerInput(
    runId: string,
    requestId: string,
    questionId: string,
    optionId: string,
    inputId = "input-answer",
) {
    return {
        kind: "respond" as const,
        inputId,
        runId,
        requestId,
        response: {
            kind: "answer_ask_user" as const,
            answers: [{ questionId, optionIds: [optionId] }],
        },
    };
}

// ---------------------------------------------------------------------------
// 创建：同一 Goal 的并发首次创建只提交一个首 Run。
// ---------------------------------------------------------------------------

test("并发首次创建只提交一个首 Run，同身份重复请求返回原收据", async () => {
    const store = new BlockingGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-create-race",
        decide: () => ({ kind: "wait", reason: "等待创建测试" }),
    });

    const request = {
        goalId: "goal-create-race",
        inputId: "input-first",
        content: "只创建一次",
        profileId: profile.id,
    };
    const first = harness.sessions.create(request);
    // 让首次保存停住，第二个同身份创建在 Gate 上排队。
    await new Promise((resolve) => setImmediate(resolve));
    const second = harness.sessions.create(request);

    store.release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;

    const created = [a, b].filter((result) => !result.existing);
    const replayed = [a, b].filter((result) => result.existing);
    assert.equal(created.length, 1);
    assert.equal(replayed.length, 1);
    assert.equal(replayed[0]!.receipt.inputId, "input-first");
    assert.equal(replayed[0]!.receipt.appliedRunId, created[0]!.receipt.appliedRunId);

    await harness.sessions.waitForIdle();
    const goal = await readGoal(store, "goal-create-race");
    assert.equal(goal.state.run.id, created[0]!.receipt.appliedRunId);
    assert.deepEqual(
        goal.state.messages
            .filter((message) => message.role === "user")
            .map((message) => ({ role: message.role, content: message.content })),
        [{ role: "user", content: "只创建一次" }],
    );
    assert.equal(goal.state.inputLedger?.length, 1);
    assert.equal(harness.calls(), 1);
});

test("创建冲突：不同 inputId、同身份不同正文、后续消息冒充首条输入都被拒绝", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-create-conflict",
        decide: () => ({ kind: "wait", reason: "等待冲突测试" }),
    });
    const created = await harness.sessions.create({
        goalId: "goal-create-conflict",
        inputId: "input-first",
        content: "原始创建载荷",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();

    const differentId = await harness.sessions.create({
        goalId: "goal-create-conflict",
        inputId: "input-other",
        content: "原始创建载荷",
        profileId: profile.id,
    });
    assert.equal(differentId.ok, false);
    assert.equal(differentId.ok === false && differentId.error.code, "INPUT_CONFLICT");

    const differentPayload = await harness.sessions.create({
        goalId: "goal-create-conflict",
        inputId: "input-first",
        content: "改写的创建载荷",
        profileId: profile.id,
    });
    assert.equal(differentPayload.ok, false);
    assert.equal(differentPayload.ok === false && differentPayload.error.code, "INPUT_CONFLICT");

    // 后续普通消息不能充当创建凭据。
    const opened = await harness.sessions.open("goal-create-conflict");
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const queued = await opened.session.send({
        kind: "message",
        inputId: "input-later",
        content: "后续消息",
    });
    assert.equal(queued.ok, true);
    const impersonated = await harness.sessions.create({
        goalId: "goal-create-conflict",
        inputId: "input-later",
        content: "后续消息",
        profileId: profile.id,
    });
    assert.equal(impersonated.ok, false);
    assert.equal(impersonated.ok === false && impersonated.error.code, "INPUT_CONFLICT");

    const goal = await readGoal(store, "goal-create-conflict");
    assert.equal(goal.state.commitRevision !== undefined, true);
    assert.deepEqual(
        goal.state.messages.filter((message) => message.role === "user").map((message) => message.content),
        ["原始创建载荷"],
    );
    assert.equal(harness.calls(), 1);
});

test("创建在提交 marker 失败后保留首 Run：重试连接原收据且不隐式推进", async () => {
    const inner = new InMemoryGoalStore();
    const realTrajectory = trajectoryStoreFor(inner);
    let appends = 0;
    const trajectory: TrajectoryStore = Object.assign(
        Object.create(realTrajectory) as TrajectoryStore,
        {
            append: async (draft: Parameters<TrajectoryStore["append"]>[0]) => {
                appends += 1;
                // 首个 goal_created 成功，随后的 state_committed marker 失败。
                if (appends === 2) throw new Error("simulated commit marker failure");
                return realTrajectory.append(draft);
            },
        },
    );

    const harness = createHarness({
        store: inner,
        runIdPrefix: "run-create-marker",
        decide: () => ({ kind: "wait", reason: "不应推进" }),
        createTrajectory: trajectory,
    });

    await assert.rejects(() => harness.sessions.create({
        goalId: "goal-create-marker",
        inputId: "input-first",
        content: "marker 失败",
        profileId: profile.id,
    }));
    assert.equal(harness.sessions.activeGoal, undefined);

    // 已验证的 Snapshot 仍在：原身份重试只连接，不推进，也不调用模型。
    const replayed = await harness.sessions.create({
        goalId: "goal-create-marker",
        inputId: "input-first",
        content: "marker 失败",
        profileId: profile.id,
    });
    assert.equal(replayed.ok, true);
    assert.equal(replayed.ok && replayed.existing, true);
    assert.equal(harness.sessions.activeGoal, undefined);
    await harness.sessions.waitForIdle();
    assert.equal(harness.calls(), 0);
});

// ---------------------------------------------------------------------------
// 回答：收据与等待解除同一次提交，下一轮挂起时即可查询。
// ---------------------------------------------------------------------------

test("回答在下一轮模型挂起前返回收据，且运行期间不报告 needsRecovery", async () => {
    const store = new InMemoryGoalStore();
    const secondEntered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-answer-receipt",
        decide: async (_input, callIndex) => {
            if (callIndex === 1) return askUser("继续吗");
            secondEntered.resolve();
            await release.promise;
            return { kind: "complete", summary: "完成", evidenceSequences: [] };
        },
    });
    const question = await reachQuestion(harness, "goal-answer-receipt");

    const sending = harness.sessions.sendSessionInput(
        "goal-answer-receipt",
        answerInput(question.runId, question.requestId, question.questionId, question.optionId),
    );
    const sent = await withDeadline(sending, "respond admission");
    // 受理返回时下一轮模型已挂起。
    await secondEntered.promise;

    assert.equal(sent.ok, true);
    assert.equal(sent.ok && sent.receipt.status, "applied");
    assert.equal(sent.ok && sent.receipt.targetRunId, question.runId);

    // 模型仍挂起时收据已可查询，等待已解除，状态投影仍是执行所有者。
    const receipt = await harness.sessions.querySessionInput("goal-answer-receipt", "input-answer");
    assert.equal(receipt.ok && receipt.found, true);
    const goal = await readGoal(store, "goal-answer-receipt");
    assert.equal(goal.state.run.pendingInteraction, undefined);
    assert.equal(goal.state.run.status, "running");
    assert.equal(goal.state.inputLedger?.some((record) => record.inputId === "input-answer"), true);
    const state = await harness.sessions.readSessionState("goal-answer-receipt");
    assert.equal(state?.executionOwner, true);
    assert.equal(state?.needsRecovery, false);

    release.resolve();
    await harness.sessions.waitForIdle();
    const settled = await readGoal(store, "goal-answer-receipt");
    assert.equal(settled.state.run.status, "completed");
    assert.equal(harness.calls(), 2);
});

test("回答载荷冲突与重复身份：同载荷返回原收据，异载荷与过期身份被拒绝", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-answer-duplicate",
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("第一问")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const question = await reachQuestion(harness, "goal-answer-duplicate");
    const input = answerInput(question.runId, question.requestId, question.questionId, question.optionId);

    const first = await harness.sessions.sendSessionInput("goal-answer-duplicate", input);
    assert.equal(first.ok, true);
    assert.equal(first.ok && first.existing, false);
    await harness.sessions.waitForIdle();

    // 等待已解除后，同身份同载荷仍返回原收据。
    const replayed = await harness.sessions.sendSessionInput("goal-answer-duplicate", input);
    assert.equal(replayed.ok, true);
    assert.equal(replayed.ok && replayed.existing, true);
    assert.equal(
        replayed.ok && first.ok && replayed.receipt.admittedAtRevision,
        first.ok ? first.receipt.admittedAtRevision : undefined,
    );

    // 载荷冲突。
    const conflicted = await harness.sessions.sendSessionInput("goal-answer-duplicate", {
        ...input,
        response: { kind: "reply_to_question", content: "不同载荷" },
    });
    assert.equal(conflicted.ok, false);
    assert.equal(conflicted.ok === false && conflicted.code, "INPUT_CONFLICT");

    // 新身份面对已解除的等待：按最新等待裁决，不再接受。
    const stale = await harness.sessions.sendSessionInput("goal-answer-duplicate", {
        ...input,
        inputId: "input-answer-late",
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.ok === false && stale.code, "INTERACTION_MISMATCH");

    const goal = await readGoal(store, "goal-answer-duplicate");
    assert.equal(
        goal.state.inputLedger?.filter((record) => record.inputId === "input-answer").length,
        1,
    );
    assert.equal(harness.calls(), 2);
});

test("并发双回答只产生一个有效决定与唯一收据", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-answer-race",
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("继续吗")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const question = await reachQuestion(harness, "goal-answer-race");

    const [a, b] = await Promise.all([
        harness.sessions.sendSessionInput(
            "goal-answer-race",
            answerInput(question.runId, question.requestId, question.questionId, question.optionId, "input-answer-a"),
        ),
        harness.sessions.sendSessionInput(
            "goal-answer-race",
            answerInput(question.runId, question.requestId, question.questionId, question.optionId, "input-answer-b"),
        ),
    ]);

    assert.equal([a, b].filter((result) => result.ok).length, 1);
    await harness.sessions.waitForIdle();
    const goal = await readGoal(store, "goal-answer-race");
    const applied = goal.state.inputLedger?.filter(
        (record) => record.inputId === "input-answer-a" || record.inputId === "input-answer-b",
    ) ?? [];
    assert.equal(applied.length, 1);
    assert.equal(applied[0]!.status, "applied");
    assert.equal(harness.calls(), 2);
    const answerMessages = goal.state.messages.filter((message) => message.content.includes("Answer: Continue"));
    assert.equal(answerMessages.length, 1);
});

test("回答提交失败保留原等待且无收据，按原身份重试生效", async () => {
    const inner = new InMemoryGoalStore();
    let failing = false;
    const store: GoalStore = {
        save: async (goal) => {
            if (failing) throw new Error("simulated answer save failure");
            await inner.save(goal);
        },
        restore: (goalId) => inner.restore(goalId),
        readRevision: (goalId) => inner.readRevision(goalId),
    };
    const harness = createHarness({
        store,
        runIdPrefix: "run-answer-failure",
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("继续吗")
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const question = await reachQuestion(harness, "goal-answer-failure");
    const input = answerInput(question.runId, question.requestId, question.questionId, question.optionId);

    failing = true;
    await assert.rejects(() => harness.sessions.sendSessionInput("goal-answer-failure", input));
    const failed = await readGoal(inner, "goal-answer-failure");
    assert.equal(failed.state.run.pendingInteraction?.requestId, question.requestId);
    assert.equal(failed.state.inputLedger?.some((record) => record.inputId === "input-answer"), false);
    assert.equal(harness.sessions.activeGoal, undefined);

    failing = false;
    const retried = await harness.sessions.sendSessionInput("goal-answer-failure", input);
    assert.equal(retried.ok, true);
    assert.equal(retried.ok && retried.existing, false);
    await harness.sessions.waitForIdle();
    assert.equal(harness.calls(), 2);
});

// ---------------------------------------------------------------------------
// 执行名额：受理前取得、后台结算、关闭可定位。
// ---------------------------------------------------------------------------

test("回答推进期间另一 Goal 的创建返回 BUSY 且无部分受理", async () => {
    const store = new InMemoryGoalStore();
    const secondEntered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-slot",
        decide: async (_input, callIndex) => {
            if (callIndex === 1) return askUser("继续吗");
            secondEntered.resolve();
            await release.promise;
            return { kind: "complete", summary: "完成", evidenceSequences: [] };
        },
    });
    const question = await reachQuestion(harness, "goal-slot-active");

    const sending = harness.sessions.sendSessionInput(
        "goal-slot-active",
        answerInput(question.runId, question.requestId, question.questionId, question.optionId),
    );
    await secondEntered.promise;
    await withDeadline(sending, "respond admission");
    assert.equal(harness.sessions.activeGoal, "goal-slot-active");

    const other = await harness.sessions.create({
        goalId: "goal-slot-other",
        inputId: "input-other",
        content: "不应创建",
        profileId: profile.id,
    });
    assert.equal(other.ok, false);
    assert.equal(other.ok === false && other.error.code, "BUSY");
    assert.equal(await store.restore("goal-slot-other"), undefined);

    release.resolve();
    await harness.sessions.waitForIdle();
    assert.equal(harness.sessions.activeGoal, undefined);
});

test("另一 Goal 占用名额时，原身份重试仍返回已存收据", async () => {
    const store = new InMemoryGoalStore();
    const release = deferred();
    let calls = 0;
    const harness = createHarness({
        store,
        runIdPrefix: "run-replay-busy",
        decide: async (_input, callIndex) => {
            calls = callIndex;
            if (callIndex === 1) return askUser("继续吗");
            if (callIndex === 2) return { kind: "wait", reason: "等待另一 Goal" };
            await release.promise;
            return { kind: "complete", summary: "完成", evidenceSequences: [] };
        },
    });
    const question = await reachQuestion(harness, "goal-replay-busy");
    const input = answerInput(question.runId, question.requestId, question.questionId, question.optionId);
    const applied = await harness.sessions.sendSessionInput("goal-replay-busy", input);
    assert.equal(applied.ok, true);
    await harness.sessions.waitForIdle();
    assert.equal(calls, 2);

    // 另一 Goal 占用执行名额。
    const other = await harness.sessions.create({
        goalId: "goal-replay-busy-other",
        inputId: "input-other",
        content: "占用名额",
        profileId: profile.id,
    });
    assert.equal(other.ok, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.sessions.activeGoal, "goal-replay-busy-other");

    // 原身份重试仍然读取原收据，而不是 BUSY。
    const replayed = await harness.sessions.sendSessionInput("goal-replay-busy", input);
    assert.equal(replayed.ok, true);
    assert.equal(replayed.ok && replayed.existing, true);
    assert.equal(replayed.ok && replayed.receipt.inputId, "input-answer");

    // 新身份仍按名额拒绝。
    const fresh = await harness.sessions.sendSessionInput("goal-replay-busy", {
        kind: "message",
        inputId: "input-fresh",
        content: "新消息",
    });
    assert.equal(fresh.ok, false);
    assert.equal(fresh.ok === false && fresh.code, "BUSY");

    release.resolve();
    await harness.sessions.waitForIdle();
});

test("关闭期限到达时报告仍持有名额的 Goal，并拒绝新的推进受理", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-close",
        decide: async () => {
            entered.resolve();
            await release.promise;
            return { kind: "complete", summary: "完成", evidenceSequences: [] };
        },
    });
    const created = await harness.sessions.create({
        goalId: "goal-close",
        inputId: "input-first",
        content: "关闭测试",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await entered.promise;

    await assert.rejects(
        () => harness.sessions.close({ timeoutMs: 20 }),
        (error: unknown) => {
            assert.ok(error instanceof SessionManagerCloseError);
            assert.deepEqual(error.unsettledGoalIds, ["goal-close"]);
            return true;
        },
    );

    const rejected = await harness.sessions.create({
        goalId: "goal-close-other",
        inputId: "input-other",
        content: "关闭后不得创建",
        profileId: profile.id,
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.ok === false && rejected.error.code, "BUSY");
    assert.equal(await store.restore("goal-close-other"), undefined);

    release.resolve();
    await harness.sessions.waitForIdle();
});

test("直接调用 Coordinator resume 仍等待推进结果，显式恢复不受 Session 收据路径影响", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-coordinator",
        decide: (_input, callIndex) => callIndex === 1
            ? askUser("继续吗")
            : { kind: "wait", reason: "blocked after answer" },
    });
    const question = await reachQuestion(harness, "goal-coordinator-resume");

    const progress = await harness.coordinator.resume({
        ref: { goalId: "goal-coordinator-resume", runId: question.runId },
        action: {
            kind: "answer_ask_user",
            requestId: question.requestId,
            answers: [{ questionId: question.questionId, optionIds: [question.optionId] }],
        },
    });
    // 公开 resume 仍返回推进后的等待点，而不是仅返回受理。
    assert.equal(progress.ok, true);
    assert.equal(progress.ok && progress.kind, "waiting");
    assert.equal(progress.ok && progress.kind === "waiting" ? progress.waitingFor : undefined, "blocked");
    assert.equal(harness.calls(), 2);
});

test("blocked 等待的显式恢复把正文与收据放在同一次提交", async () => {
    const store = new InMemoryGoalStore();
    const secondEntered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-blocked",
        decide: async (_input, callIndex) => {
            if (callIndex === 1) return { kind: "wait", reason: "需要补充输入" };
            secondEntered.resolve();
            await release.promise;
            return { kind: "complete", summary: "完成", evidenceSequences: [] };
        },
    });
    const created = await harness.sessions.create({
        goalId: "goal-blocked",
        inputId: "input-first",
        content: "blocked 恢复",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const waiting = await readGoal(store, "goal-blocked");
    assert.equal(waiting.state.run.status, "waiting");
    assert.equal(waiting.state.run.pendingInteraction, undefined);

    const sending = harness.sessions.sendSessionInput("goal-blocked", {
        kind: "resume",
        inputId: "resume-1",
        runId: waiting.state.run.id,
        commitRevision: waiting.state.commitRevision ?? 0,
        content: "补充正文",
    });
    await secondEntered.promise;
    const resumed = await withDeadline(sending, "blocked resume admission");
    assert.equal(resumed.ok, true);
    assert.equal(resumed.ok && resumed.receipt.status, "applied");

    const receipt = await harness.sessions.querySessionInput("goal-blocked", "resume-1");
    assert.equal(receipt.ok && receipt.found, true);
    const goal = await readGoal(store, "goal-blocked");
    assert.equal(goal.state.run.status, "running");
    assert.equal(
        goal.state.messages.filter((message) => message.content === "补充正文").length,
        1,
    );

    release.resolve();
    await harness.sessions.waitForIdle();
    assert.equal(harness.calls(), 2);
});

