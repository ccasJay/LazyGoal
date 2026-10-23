import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    computeSessionInputDigest,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type GoalModelSelection,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    currentProtocols,
    trajectoryStoreFor,
} from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-recovery-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

const profiles: AgentProfileRegistry = {
    get(profileId: string): AgentProfile | undefined {
        return profileId === profile.id ? profile : undefined;
    },
};

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

let harnessCounter = 0;

interface RecoveryHarness {
    readonly sessions: SessionManager;
    readonly calls: () => number;
    readonly aligned: () => readonly string[];
    readonly failures: () => readonly unknown[];
}

function createHarness(options: {
    readonly store: InMemoryGoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => Promise<AgentDecision> | AgentDecision;
    readonly onAlign?: (selection: GoalModelSelection) => void;
}): RecoveryHarness {
    const trajectory = trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: trajectory });
    let calls = 0;
    let runCounter = 0;
    harnessCounter += 1;
    const harnessId = harnessCounter;
    const nextRunId = (): string => {
        runCounter += 1;
        return `run-recovery-${harnessId}-${runCounter}`;
    };
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
        runIdGenerator: nextRunId,
    });
    const aligned: string[] = [];
    const failures: unknown[] = [];
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        onBackgroundFailure: (_goalId, error) => { failures.push(error); },
        alignModelBinding: (selection) => {
            aligned.push(selection.modelId);
            options.onAlign?.(selection);
        },
    });
    return {
        sessions,
        calls: () => calls,
        aligned: () => [...aligned],
        failures: () => [...failures],
    };
}

test("explicit recovery finishes an accepted interruption without unpausing the message queue", async () => {
    const store = new InMemoryGoalStore();
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-interruption-recovery",
        intent: "finish an accepted stop after process recovery",
        profile,
        runId: "run-interruption-recovery",
    });
    const interrupted: Goal = {
        ...created,
        state: {
            ...created.state,
            commitRevision: 2,
            inputLedger: [{
                inputId: "queued-follow-up",
                kind: "message",
                digest: computeSessionInputDigest({ kind: "message", inputId: "queued-follow-up", content: "Keep this queued" }),
                sequence: 1,
                status: "pending",
                admittedAtRevision: 2,
            }],
            run: {
                ...created.state.run,
                status: "running",
                interruption: { requestId: "interrupt-before-recovery", status: "requested" },
            },
            messageQueue: {
                revision: 1,
                items: [{ inputId: "queued-follow-up", content: "Keep this queued", sequence: 1 }],
                pause: { reason: "user_interrupt", runId: created.state.run.id },
            },
        },
    };
    await store.save(interrupted);

    const harness = createHarness({ store, decide: () => {
        throw new Error("A recovered interruption without unknown effects must not call the model");
    } });
    const opened = await harness.sessions.open(created.id);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.equal(opened.state.needsRecovery, true);

    const resumed = await opened.session.send({
        kind: "resume",
        inputId: "resume-stop-recovery",
        runId: created.state.run.id,
        commitRevision: opened.state.commitRevision,
    });
    assert.equal(resumed.ok, true);
    await harness.sessions.waitForIdle();

    const settled = (await store.restore(created.id))!;
    assert.equal(settled.state.run.status, "cancelled");
    assert.equal(settled.state.run.interruption?.status, "finished");
    assert.equal(settled.state.messageQueue?.pause?.reason, "user_interrupt");
    assert.deepEqual(settled.state.messageQueue?.items.map((item) => item.content), ["Keep this queued"]);
    assert.equal(harness.calls(), 0);
});

test("a persisted ask_user wait survives a rebuild and only a matching response resumes the same Run", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => callIndex === 1
            ? {
                kind: "ask_user",
                questions: [{
                    header: "范围",
                    question: "交付范围？",
                    options: [{ label: "最小" }, { label: "完整" }],
                    multiSelect: false,
                }],
            }
            : { kind: "complete", summary: "完成", evidenceSequences: [] },
    });

    const created = await harness.sessions.create({
        goalId: "goal-ask-user",
        inputId: "input-first",
        content: "需要问答的任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();
    const waiting = await created.session.read();
    assert.equal(waiting?.runStatus, "waiting");
    assert.equal(waiting?.waitingFor, "ask_user");
    const waitingGoal = (await store.restore("goal-ask-user"))!;
    const runId = waitingGoal.state.run.id;
    const requestId = waitingGoal.state.run.pendingInteraction?.requestId;
    assert.ok(requestId);
    const pendingQuestion = waitingGoal.state.run.pendingInteraction?.kind === "ask_user"
        ? waitingGoal.state.run.pendingInteraction.questions[0]
        : undefined;
    assert.ok(pendingQuestion);
    const answerQuestionId = pendingQuestion!.id;
    const answerOptionId = pendingQuestion!.options[0]!.id;

    // 重建实例：只读连接不代答、不推进；普通消息也不解除等待。
    const rebuilt = createHarness({
        store,
        decide: () => ({ kind: "complete", summary: "重建后完成", evidenceSequences: [] }),
    });
    const opened = await rebuilt.sessions.open("goal-ask-user");
    assert.equal(opened.ok, true);
    assert.equal(opened.ok && opened.state.waitingFor, "ask_user");
    assert.equal(rebuilt.calls(), 0);
    const queued = opened.ok ? await opened.session.send({ kind: "message", inputId: "input-queued", content: "普通消息" }) : undefined;
    assert.equal(queued?.ok, true);
    await rebuilt.sessions.waitForIdle();
    const stillWaiting = (await store.restore("goal-ask-user"))!;
    assert.equal(stillWaiting.state.run.status, "waiting");
    assert.equal(stillWaiting.state.run.pendingInteraction?.kind, "ask_user");
    assert.equal(stillWaiting.state.messageQueue?.items.length, 1);
    assert.equal(rebuilt.calls(), 0);

    // 错 requestId 与错身份拒绝，且不产生收据。
    const wrongRequest = await opened!.session.send({
        kind: "respond",
        inputId: "respond-wrong",
        runId,
        requestId: "other-request",
        response: { kind: "skip_question" },
    });
    assert.equal(wrongRequest.ok, false);
    assert.equal(wrongRequest.ok === false && wrongRequest.code, "INTERACTION_MISMATCH");
    const staleRun = await opened!.session.send({
        kind: "respond",
        inputId: "respond-stale",
        runId: "run-unknown",
        requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(staleRun.ok, false);
    assert.equal(staleRun.ok === false && staleRun.code, "RUN_NOT_FOUND");
    const afterRejections = (await store.restore("goal-ask-user"))!;
    assert.deepEqual(afterRejections.state.inputLedger?.map((record) => record.inputId), ["input-first", "input-queued"]);
    assert.equal(afterRejections.state.commitRevision, stillWaiting.state.commitRevision);

    // 匹配回答只恢复同一 Run 并继续执行。
    const answered = await opened!.session.send({
        kind: "respond",
        inputId: "respond-1",
        runId,
        requestId,
        response: { kind: "answer_ask_user", answers: [{ questionId: answerQuestionId, optionIds: [answerOptionId] }] },
    });
    assert.equal(answered.ok, true);
    if (!answered.ok) return;
    assert.equal(answered.receipt.status, "applied");
    assert.equal(answered.receipt.targetRunId, runId);
    await rebuilt.sessions.waitForIdle();
    // 回答恢复同一 Run 完成一次，随后队列中的普通消息由后继 Run 消费一次。
    assert.equal(rebuilt.calls(), 2);
    const completed = (await store.restore("goal-ask-user"))!;
    assert.equal(completed.state.run.status, "completed");
    assert.ok(completed.state.messages.some((message) => message.role === "user" && message.content.includes("最小")));
    assert.equal(completed.state.messageQueue?.items.length, 0);
    assert.deepEqual(rebuilt.failures(), []);

    // 已结算的旧请求不能再次解除等待或重复执行。
    const replayed = await opened!.session.send({
        kind: "respond",
        inputId: "respond-1",
        runId,
        requestId,
        response: { kind: "answer_ask_user", answers: [{ questionId: answerQuestionId, optionIds: [answerOptionId] }] },
    });
    assert.equal(replayed.ok, true);
    assert.equal(replayed.ok && replayed.existing, true);
    const differentPayload = await opened!.session.send({
        kind: "respond",
        inputId: "respond-1",
        runId,
        requestId,
        response: { kind: "answer_ask_user", answers: [{ questionId: answerQuestionId, optionIds: [pendingQuestion!.options[1]!.id] }] },
    });
    assert.equal(differentPayload.ok, false);
    assert.equal(differentPayload.ok === false && differentPayload.code, "INPUT_CONFLICT");
    // 等待已结算且 Run 已切换：旧请求与旧 Run 都不能再次推进，也不产生新收据。
    const newRespond = await opened!.session.send({
        kind: "respond",
        inputId: "respond-2",
        runId,
        requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(newRespond.ok, false);
    assert.ok(
        newRespond.ok === false
            && (newRespond.code === "INTERACTION_MISMATCH" || newRespond.code === "RUN_NOT_FOUND"),
        JSON.stringify(newRespond),
    );
    assert.equal(
        (await store.restore("goal-ask-user"))!.state.inputLedger?.some((record) => record.inputId === "respond-2"),
        false,
    );
});

test("explicit resume matches the latest Run and commit revision and never lifts queue pauses", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        decide: async (_input, callIndex) => {
            if (callIndex === 1) {
                entered.resolve();
                await release.promise;
                return { kind: "fail", error: "首个任务失败" };
            }
            return { kind: "complete", summary: `后继 ${callIndex}`, evidenceSequences: [] };
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-resume",
        inputId: "input-first",
        content: "恢复任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;
    await created.session.send({ kind: "message", inputId: "input-queued", content: "排队的后续任务" });
    release.resolve();
    await harness.sessions.waitForIdle();
    const failed = (await store.restore("goal-resume"))!;
    assert.equal(failed.state.run.status, "failed");
    const runId = failed.state.run.id;
    const queued = (await store.restore("goal-resume"))!;

    // 恢复不会自动解除暂停队列，也不会代答等待。
    const blockedByPause = await created.session.send({
        kind: "resume",
        inputId: "resume-paused",
        runId,
        commitRevision: queued.state.commitRevision ?? 0,
    });
    assert.equal(blockedByPause.ok, false);
    assert.equal(blockedByPause.ok === false && blockedByPause.code, "QUEUE_PAUSED");
    const afterBlocked = (await store.restore("goal-resume"))!;
    assert.equal(afterBlocked.state.messageQueue?.pause?.reason, "run_failed");
    assert.equal(
        afterBlocked.state.inputLedger?.some((record) => record.inputId === "resume-paused"),
        false,
    );

    // 修订失配与旧 Run 明确拒绝。
    const staleRevision = await created.session.send({
        kind: "resume",
        inputId: "resume-stale",
        runId,
        commitRevision: (afterBlocked.state.commitRevision ?? 0) + 5,
    });
    assert.equal(staleRevision.ok, false);
    assert.equal(staleRevision.ok === false && staleRevision.code, "STALE_REVISION");
    const staleRun = await created.session.send({
        kind: "resume",
        inputId: "resume-stale-run",
        runId: "run-unknown",
        commitRevision: afterBlocked.state.commitRevision ?? 0,
    });
    assert.equal(staleRun.ok, false);
    assert.equal(staleRun.ok === false && staleRun.code, "RUN_NOT_FOUND");

    // 显式继续队列后，队首消息按 FIFO 启动后继 Run。
    const continuing = await created.session.send({
        kind: "queue_control",
        inputId: "control-continue",
        action: "continue",
        queueRevision: afterBlocked.state.messageQueue?.revision ?? 0,
    });
    assert.equal(continuing.ok, true);
    await harness.sessions.waitForIdle();
    const resumed = (await store.restore("goal-resume"))!;
    assert.equal(resumed.state.messageQueue?.items.length, 0);
    assert.ok(resumed.state.messages.some((message) => message.role === "user" && message.content === "排队的后续任务"));
});

test("a rebuilt instance requires an explicit matching resume before running again", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const blocking = createHarness({
        store,
        decide: async (_input, callIndex) => {
            if (callIndex === 1) {
                entered.resolve();
                await release.promise;
            }
            return { kind: "complete", summary: `完成 ${callIndex}`, evidenceSequences: [] };
        },
    });
    const created = await blocking.sessions.create({
        goalId: "goal-explicit-resume",
        inputId: "input-first",
        content: "重启前未完成",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;
    const interruptedRunId = (await store.restore("goal-explicit-resume"))!.state.run.id;

    // 模拟进程退出：放弃阻塞中的执行，重建实例。
    const rebuilt = createHarness({
        store,
        decide: () => ({ kind: "complete", summary: "重建后完成", evidenceSequences: [] }),
    });
    const opened = await rebuilt.sessions.open("goal-explicit-resume");
    assert.equal(opened.ok, true);
    assert.equal(opened.ok && opened.state.needsRecovery, true);
    assert.equal(opened.ok && opened.state.executionOwner, false);
    await rebuilt.sessions.waitForIdle();
    assert.equal(rebuilt.calls(), 0);
    const abandoned = (await store.restore("goal-explicit-resume"))!;
    assert.equal(abandoned.state.run.status, "running");

    // 新普通消息不会隐式恢复。
    const queued = await opened!.session.send({ kind: "message", inputId: "input-queued", content: "重启后的消息" });
    assert.equal(queued.ok, true);
    await rebuilt.sessions.waitForIdle();
    assert.equal(rebuilt.calls(), 0);
    assert.equal((await store.restore("goal-explicit-resume"))!.state.run.status, "running");

    // 显式 resume 匹配最新 Run 与修订后恢复执行。
    const beforeResume = (await store.restore("goal-explicit-resume"))!;
    const resume = await opened!.session.send({
        kind: "resume",
        inputId: "resume-1",
        runId: interruptedRunId,
        commitRevision: beforeResume.state.commitRevision ?? 0,
    });
    assert.equal(resume.ok, true);
    if (!resume.ok) return;
    assert.equal(resume.receipt.status, "applied");
    assert.equal(resume.receipt.targetRunId, interruptedRunId);
    await rebuilt.sessions.waitForIdle();
    // 显式恢复完成后，同一执行所有者继续消费已受理队列：每项只应用一次。
    assert.equal(rebuilt.calls(), 2);
    const finished = (await store.restore("goal-explicit-resume"))!;
    assert.equal(finished.state.run.status, "completed");
    assert.equal(finished.state.messageQueue?.items.length, 0);
    assert.deepEqual(
        finished.state.inputLedger?.map((record) => [record.inputId, record.status]),
        [["input-first", "applied"], ["input-queued", "applied"], ["resume-1", "applied"]],
    );
    assert.equal(
        finished.state.messages.filter((message) => message.role === "user").filter((message) => message.content === "重启后的消息").length,
        1,
    );
});

test("each Goal aligns the model binding to its own latest selection before running", async () => {
    const store = new InMemoryGoalStore();
    const firstSelection: GoalModelSelection = {
        provider: "test",
        modelId: "model-first",
        inputEstimator: { kind: "character-v1" },
    };
    const secondSelection: GoalModelSelection = {
        provider: "test",
        modelId: "model-second",
        inputEstimator: { kind: "character-v1" },
    } as unknown as GoalModelSelection;
    const harness = createHarness({
        store,
        decide: () => ({ kind: "complete", summary: "完成", evidenceSequences: [] }),
    });

    const createdFirst = await harness.sessions.create({
        goalId: "goal-binding-first",
        inputId: "input-first",
        content: "第一个 Goal",
        profileId: profile.id,
        modelSelection: firstSelection,
    });
    assert.equal(createdFirst.ok, true);
    await harness.sessions.waitForIdle();
    const createdSecond = await harness.sessions.create({
        goalId: "goal-binding-second",
        inputId: "input-second",
        content: "第二个 Goal",
        profileId: profile.id,
        modelSelection: secondSelection,
    });
    assert.equal(createdSecond.ok, true);
    await harness.sessions.waitForIdle();

    assert.deepEqual(harness.aligned(), ["model-first", "model-second"]);
    const firstSaved = (await store.restore("goal-binding-first"))!;
    const secondSaved = (await store.restore("goal-binding-second"))!;
    assert.equal(firstSaved.state.modelSelection.modelId, "model-first");
    assert.equal(secondSaved.state.modelSelection.modelId, "model-second");
    assert.deepEqual(harness.failures(), []);
});
