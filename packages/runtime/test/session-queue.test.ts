import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionInputAdmission,
    SessionManager,
    TrajectoryCheckpointCommitter,
    createGoal,
    hasPendingSessionInputs,
    hasUnsettledSessionWork,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type GoalStore,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-queue-profile",
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

interface QueueHarness {
    readonly sessions: SessionManager;
    readonly started: () => number;
    readonly runIds: () => readonly string[];
    readonly failures: () => readonly unknown[];
    dispose(): void;
}

function createHarness(options: {
    readonly store: GoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => Promise<AgentDecision> | AgentDecision;
    readonly runIdPrefix: string;
}): QueueHarness {
    const trajectory = trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({
        store: options.store,
        trajectoryStore: trajectory,
    });
    let calls = 0;
    const startedRunIds: string[] = [];
    let runCounter = 0;
    const nextRunId = (): string => {
        runCounter += 1;
        return `${options.runIdPrefix}-${runCounter}`;
    };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            startedRunIds.push(input.goal.state.run.id);
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
    const failures: unknown[] = [];
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        onBackgroundFailure: (_goalId, error) => { failures.push(error); },
    });
    return {
        sessions,
        started: () => calls,
        runIds: () => [...startedRunIds],
        failures: () => [...failures],
        dispose: () => undefined,
    };
}

async function createSession(
    harness: QueueHarness,
    options: { readonly goalId: string; readonly inputId: string; readonly content: string },
) {
    const created = await harness.sessions.create({
        goalId: options.goalId,
        inputId: options.inputId,
        content: options.content,
        profileId: profile.id,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    if (!created.ok) throw new Error("session creation failed");
    return created;
}

test("two queued messages each start exactly one successor Run in FIFO order", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-queue",
        decide: async (_input, callIndex) => {
            if (callIndex === 1) {
                entered.resolve();
                await release.promise;
            }
            return { kind: "complete", summary: `完成 ${callIndex}`, evidenceSequences: [] };
        },
    });

    const created = await createSession(harness, {
        goalId: "goal-queue",
        inputId: "input-first",
        content: "首个任务",
    });
    await entered.promise;

    const first = await created.session.send({ kind: "message", inputId: "input-a", content: "后续任务 A" });
    const second = await created.session.send({ kind: "message", inputId: "input-b", content: "后续任务 B" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(harness.started(), 1);
    const whileRunning = await created.session.read();
    assert.equal(whileRunning?.pendingMessageCount, 2);

    release.resolve();
    await harness.sessions.waitForIdle();

    const saved = await store.restore("goal-queue");
    assert.ok(saved);
    assert.equal(saved.state.run.status, "completed");
    assert.deepEqual(saved.state.messages.filter((message) => message.role === "user").map((message) => message.content), [
        "首个任务", "后续任务 A", "后续任务 B",
    ]);
    assert.equal(saved.state.messageQueue?.items.length, 0);
    assert.equal(saved.state.completedRuns?.length, 2);
    assert.deepEqual(saved.state.completedRuns?.map((record) => record.status), ["completed", "completed"]);
    const ledger = saved.state.inputLedger ?? [];
    assert.deepEqual(ledger.map((record) => [record.inputId, record.status]), [
        ["input-first", "applied"], ["input-a", "applied"], ["input-b", "applied"],
    ]);
    const appliedRuns = ledger.map((record) => record.appliedRunId);
    assert.equal(new Set(appliedRuns).size, 3);
    assert.deepEqual(harness.runIds(), [appliedRuns[0], appliedRuns[1], appliedRuns[2]]);
    assert.deepEqual(
        ledger.map((record) => record.messageIndex),
        [
            saved.state.messages.findIndex((message) => message.content === "首个任务"),
            saved.state.messages.findIndex((message) => message.content === "后续任务 A"),
            saved.state.messages.findIndex((message) => message.content === "后续任务 B"),
        ],
    );
    assert.deepEqual(
        trajectory.events
            .filter((event) => event.payload.type === "session_input_applied")
            .map((event) => event.payload.type === "session_input_applied"
                ? [event.payload.inputId, event.runId, event.payload.messageIndex]
                : []),
        [
            ["input-a", appliedRuns[1], saved.state.messages.findIndex((message) => message.content === "后续任务 A")],
            ["input-b", appliedRuns[2], saved.state.messages.findIndex((message) => message.content === "后续任务 B")],
        ],
    );
});

test("a message saved before the wake is applied exactly once after an explicit instruction", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const harness = createHarness({
        store,
        runIdPrefix: "run-crash",
        decide: () => ({ kind: "complete", summary: "完成", evidenceSequences: [] }),
    });

    const created = await createSession(harness, {
        goalId: "goal-crash",
        inputId: "input-first",
        content: "首个任务",
    });
    await harness.sessions.waitForIdle();
    assert.equal(harness.started(), 1);

    // 模拟“保存后崩溃、未唤醒”：受理写入落盘，但没有执行所有者接手队列。
    const admissionOnly = new SessionInputAdmission({ store, committer });
    const savedInput = await admissionOnly.admit("goal-crash", {
        kind: "message",
        inputId: "input-saved",
        content: "崩溃前保存的任务",
    });
    assert.equal(savedInput.ok, true);

    // 重建实例后只读连接与查询都不推进执行。
    const rebuilt = createHarness({
        store,
        runIdPrefix: "run-rebuilt",
        decide: () => ({ kind: "complete", summary: "重建成", evidenceSequences: [] }),
    });
    const opened = await rebuilt.sessions.open("goal-crash");
    assert.equal(opened.ok, true);
    assert.equal(rebuilt.sessions.activeGoal, undefined);
    assert.equal(harness.started(), 1);
    assert.equal(await rebuilt.sessions.waitForIdle(), undefined);

    // 显式的新消息是新的执行指令：先从原队首启动，再处理新消息。
    const reopened = await rebuilt.sessions.open("goal-crash");
    assert.equal(reopened.ok, true);
    if (!reopened.ok) return;
    assert.equal(rebuilt.started(), 0);
    const explicit = await reopened.session.send({
        kind: "message",
        inputId: "input-new",
        content: "新的执行指令",
    });
    assert.equal(explicit.ok, true);
    await rebuilt.sessions.waitForIdle();

    const saved = await store.restore("goal-crash");
    assert.ok(saved);
    assert.deepEqual(saved.state.messages.filter((message) => message.role === "user").map((message) => message.content), [
        "首个任务", "崩溃前保存的任务", "新的执行指令",
    ]);
    const ledger = saved.state.inputLedger ?? [];
    assert.deepEqual(ledger.map((record) => record.status), ["applied", "applied", "applied"]);
    assert.deepEqual(
        trajectory.events.filter((event) => event.payload.type === "session_input_applied").length,
        2,
    );
    assert.equal(saved.state.messageQueue?.items.length, 0);
    assert.equal(saved.state.run.status, "completed");
    assert.equal(rebuilt.started(), 2);
    assert.deepEqual(rebuilt.failures(), []);
});

test("a successor Run created before its model call never duplicates its message", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const successorEntered = deferred();
    const releaseSuccessor = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-successor",
        decide: async (_input, callIndex) => {
            if (callIndex === 1) return { kind: "complete", summary: "完成", evidenceSequences: [] };
            successorEntered.resolve();
            await releaseSuccessor.promise;
            return { kind: "complete", summary: "后继完成", evidenceSequences: [] };
        },
    });

    const created = await createSession(harness, {
        goalId: "goal-successor",
        inputId: "input-first",
        content: "首个任务",
    });
    await harness.sessions.waitForIdle();
    const queued = await created.session.send({ kind: "message", inputId: "input-next", content: "后继任务" });
    assert.equal(queued.ok, true);
    await successorEntered.promise;

    const duringSuccessor = await store.restore("goal-successor");
    assert.ok(duringSuccessor);
    const successorRunId = duringSuccessor.state.run.id;
    assert.deepEqual(duringSuccessor.state.messages.filter((message) => message.role === "user").map((message) => message.content), [
        "首个任务", "后继任务",
    ]);
    assert.equal(duringSuccessor.state.messageQueue?.items.length, 0);
    assert.equal(
        duringSuccessor.state.inputLedger?.find((record) => record.inputId === "input-next")?.appliedRunId,
        successorRunId,
    );

    // 重建实例不会重复应用已绑定的队首，也不会再创建第二个后继 Run。
    const rebuilt = createHarness({
        store,
        runIdPrefix: "run-successor-rebuilt",
        decide: () => { throw new Error("no automatic execution after rebuild"); },
    });
    const opened = await rebuilt.sessions.open("goal-successor");
    assert.equal(opened.ok, true);
    assert.equal(opened.ok && opened.state.runStatus, "running");
    assert.equal(opened.ok && opened.state.needsRecovery, true);
    await rebuilt.sessions.waitForIdle();
    const afterRebuild = await store.restore("goal-successor");
    assert.equal(afterRebuild?.state.run.id, successorRunId);
    assert.equal(afterRebuild?.state.completedRuns?.length, 1);
    assert.equal(
        trajectory.events.filter((event) => event.payload.type === "session_input_applied").length,
        1,
    );

    releaseSuccessor.resolve();
    await harness.sessions.waitForIdle();
});

test("a waiting Run keeps queued messages without starting successors", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-waiting",
        decide: (_input, callIndex) => callIndex === 1
            ? { kind: "wait", reason: "等待用户输入" }
            : { kind: "fail", error: "unexpected successor" },
    });

    const created = await createSession(harness, {
        goalId: "goal-waiting-queue",
        inputId: "input-first",
        content: "首个任务",
    });
    await harness.sessions.waitForIdle();
    const queued = await created.session.send({ kind: "message", inputId: "input-queued", content: "等待中的任务" });
    assert.equal(queued.ok, true);
    await harness.sessions.waitForIdle();

    const saved = await store.restore("goal-waiting-queue");
    assert.ok(saved);
    assert.equal(saved.state.run.status, "waiting");
    assert.equal(saved.state.run.pendingInteraction, undefined);
    assert.deepEqual(saved.state.messageQueue?.items.map((item) => item.inputId), ["input-queued"]);
    assert.equal(saved.state.inputLedger?.find((record) => record.inputId === "input-queued")?.status, "pending");
    assert.equal(saved.state.completedRuns?.length ?? 0, 0);
    assert.equal(harness.started(), 1);
});

test("a failed Run pauses the queue, and only an explicit continue restarts from the old head", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-failed",
        decide: async (_input, callIndex) => {
            if (callIndex === 1) {
                entered.resolve();
                await release.promise;
                return { kind: "fail", error: "首个任务失败" };
            }
            return { kind: "complete", summary: `后继 ${callIndex}`, evidenceSequences: [] };
        },
    });

    const created = await createSession(harness, {
        goalId: "goal-failed-queue",
        inputId: "input-first",
        content: "首个任务",
    });
    await entered.promise;
    await created.session.send({ kind: "message", inputId: "input-a", content: "任务 A" });
    await created.session.send({ kind: "message", inputId: "input-b", content: "任务 B" });
    release.resolve();
    await harness.sessions.waitForIdle();

    const failed = await store.restore("goal-failed-queue");
    assert.ok(failed);
    assert.equal(failed.state.run.status, "failed");
    assert.equal(failed.state.messageQueue?.pause?.reason, "run_failed");
    assert.deepEqual(failed.state.messageQueue?.items.map((item) => item.inputId), ["input-a", "input-b"]);
    const pausedRevision = failed.state.messageQueue?.revision;
    assert.equal(harness.started(), 1);

    // 新消息保留暂停并把新项追加到队尾。
    const appended = await created.session.send({ kind: "message", inputId: "input-c", content: "任务 C" });
    assert.equal(appended.ok, true);
    await harness.sessions.waitForIdle();
    const stillPaused = await store.restore("goal-failed-queue");
    assert.equal(stillPaused?.state.messageQueue?.pause?.reason, "run_failed");
    assert.deepEqual(stillPaused?.state.messageQueue?.items.map((item) => item.inputId), ["input-a", "input-b", "input-c"]);
    assert.equal(harness.started(), 1);

    // 失配的队列修订不解除暂停。
    const mismatched = await created.session.send({
        kind: "queue_control",
        inputId: "control-mismatch",
        action: "continue",
        queueRevision: 0,
    });
    assert.equal(mismatched.ok, false);
    assert.equal(mismatched.ok === false && mismatched.code, "QUEUE_REVISION_MISMATCH");

    const continuing = await created.session.send({
        kind: "queue_control",
        inputId: "control-continue",
        action: "continue",
        queueRevision: pausedRevision + 1,
    });
    assert.equal(continuing.ok, true);
    await harness.sessions.waitForIdle();

    const resumed = await store.restore("goal-failed-queue");
    assert.ok(resumed);
    assert.equal(resumed.state.messageQueue?.pause, undefined);
    assert.deepEqual(resumed.state.messages.filter((message) => message.role === "user").map((message) => message.content), [
        "首个任务", "任务 A", "任务 B", "任务 C",
    ]);
    assert.deepEqual(
        resumed.state.inputLedger?.filter((record) => record.status === "applied").map((record) => record.inputId),
        ["input-first", "input-a", "input-b", "input-c", "control-continue"],
    );
    assert.equal(resumed.state.messageQueue?.items.length, 0);
    assert.equal(harness.started(), 4);
});

test("clearing the queue only drops unapplied messages and keeps receipts and runs", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-clear",
        decide: (_input, callIndex) => callIndex === 1
            ? { kind: "fail", error: "首个任务失败" }
            : { kind: "complete", summary: `后继 ${callIndex}`, evidenceSequences: [] },
    });

    const created = await createSession(harness, {
        goalId: "goal-clear",
        inputId: "input-first",
        content: "首个任务",
    });
    await harness.sessions.waitForIdle();
    await created.session.send({ kind: "message", inputId: "input-a", content: "任务 A" });
    await created.session.send({ kind: "message", inputId: "input-b", content: "任务 B" });
    await harness.sessions.waitForIdle();

    const beforeClear = await store.restore("goal-clear");
    assert.ok(beforeClear);
    assert.equal(beforeClear.state.run.status, "failed");
    assert.equal(beforeClear.state.messageQueue?.pause?.reason, "run_failed");
    const queueRevision = beforeClear.state.messageQueue?.revision ?? 0;
    const firstReceipt = await created.session.getInput("input-first");
    assert.equal(firstReceipt.ok && firstReceipt.found, true);
    const conversationBefore = beforeClear.state.messages.filter((message) => message.role === "user").map((message) => message.content);

    const cleared = await created.session.send({
        kind: "queue_control",
        inputId: "control-clear",
        action: "clear",
        queueRevision,
    });
    assert.equal(cleared.ok, true);
    await harness.sessions.waitForIdle();

    const afterClear = await store.restore("goal-clear");
    assert.ok(afterClear);
    assert.equal(afterClear.state.messageQueue?.items.length, 0);
    // 清空只影响尚未应用的普通消息：暂停状态保留，控制输入已应用。
    assert.equal(afterClear.state.messageQueue?.pause?.reason, "run_failed");
    assert.deepEqual(
        afterClear.state.inputLedger?.map((record) => [record.inputId, record.status]),
        [
            ["input-first", "applied"], ["input-a", "cleared"], ["input-b", "cleared"],
            ["control-clear", "applied"],
        ],
    );
    // 收据保留：查询仍能按原身份核验被清空项。
    const clearedReceipt = await created.session.getInput("input-a");
    assert.equal(clearedReceipt.ok && clearedReceipt.found, true);
    assert.equal(clearedReceipt.ok && clearedReceipt.found && clearedReceipt.receipt.status, "cleared");
    // 真实对话与当前 Run 不受清空影响。
    assert.deepEqual(
        afterClear.state.messages.filter((message) => message.role === "user").map((message) => message.content),
        conversationBefore,
    );
    assert.equal(afterClear.state.run.status, "failed");
    assert.equal(afterClear.state.completedRuns?.length ?? 0, 0);
    assert.equal(harness.started(), 1);
    assert.deepEqual(
        afterClear.state.inputLedger?.filter((record) => record.status === "pending").map((record) => record.inputId),
        [],
    );
    assert.equal(hasPendingSessionInputs(afterClear), false);
    assert.equal(hasUnsettledSessionWork(afterClear), false);

    // 清空不会被跳过的旧项：显式继续后只执行清空后新增的消息。
    const next = await created.session.send({ kind: "message", inputId: "input-d", content: "任务 D" });
    assert.equal(next.ok, true);
    await harness.sessions.waitForIdle();
    assert.equal(harness.started(), 1);
    const continuing = await created.session.send({
        kind: "queue_control",
        inputId: "control-continue",
        action: "continue",
        queueRevision: afterClear.state.messageQueue!.revision + 1,
    });
    assert.equal(continuing.ok, true);
    await harness.sessions.waitForIdle();
    const finalGoal = await store.restore("goal-clear");
    assert.deepEqual(
        finalGoal?.state.messages.filter((message) => message.role === "user").map((message) => message.content),
        ["首个任务", "任务 D"],
    );
    assert.deepEqual(
        [...(finalGoal?.state.inputLedger ?? [])]
            .filter((record) => record.status === "applied")
            .map((record) => record.inputId)
            .sort(),
        ["control-clear", "control-continue", "input-d", "input-first"],
    );
});

test("pending session work blocks terminal management", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-management",
        decide: (_input, callIndex) => callIndex === 1
            ? { kind: "wait", reason: "等待输入" }
            : { kind: "complete", summary: "后继", evidenceSequences: [] },
    });

    const created = await createSession(harness, {
        goalId: "goal-management",
        inputId: "input-first",
        content: "首个任务",
    });
    await harness.sessions.waitForIdle();
    const idle: Goal = (await store.restore("goal-management"))!;
    assert.equal(idle.state.run.status, "waiting");
    assert.equal(idle.state.messageQueue?.items.length ?? 0, 0);
    assert.equal(hasPendingSessionInputs(idle), false);
    assert.equal(hasUnsettledSessionWork(idle), false);

    // 等待中的 Run 不消费队列：待处理输入阻止归档与删除。
    await created.session.send({ kind: "message", inputId: "input-pending", content: "待处理任务" });
    const withPending = (await store.restore("goal-management"))!;
    assert.equal(hasPendingSessionInputs(withPending), true);
    assert.equal(hasUnsettledSessionWork(withPending), true);
    await harness.sessions.waitForIdle();
    assert.deepEqual(
        (await store.restore("goal-management"))?.state.messageQueue?.items.map((item) => item.inputId),
        ["input-pending"],
    );

    // 未结算的用户中断同样阻止终态管理。
    const interrupted: Goal = {
        ...idle,
        state: {
            ...idle.state,
            messageQueue: { revision: 9, items: [] },
            run: {
                ...idle.state.run,
                interruption: { requestId: "interrupt-1", status: "repairing", repairCallsStarted: 1 },
            },
        },
    };
    assert.equal(hasPendingSessionInputs(interrupted), false);
    assert.equal(hasUnsettledSessionWork(interrupted), true);
});
