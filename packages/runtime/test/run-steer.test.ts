import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentProfile,
    type AgentProfileRegistry,
    type GoalMessage,
    type StepExecutor,
} from "../src/index";
import { contract } from "../../contracts/src/index";
import { createToolRegistration, type Tool } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";
import { createTransitionalToolInputBinding } from "../../tool-core/test/transitional-binding";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

const profile: AgentProfile = {
    id: "steer-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

test("Steer is durably accepted during a model call and applied once in order on the same Run", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-steer",
        intent: "test steer",
        profile,
        runId: "run-steer",
        maxSteps: 3,
    });
    await store.save(initial);

    const entered = deferred();
    const release = deferred();
    const sampledMessages: string[][] = [];
    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal }) {
            calls += 1;
            sampledMessages.push(goal.state.messages.map((message) => message.content));
            if (calls === 1) {
                entered.resolve();
                await release.promise;
            }
            return { kind: "decision", decision: { kind: "fail", error: "test terminal" }, modelContextFrame: { stage: "decide", epochNumber: goal.state.run.contextEpoch.number, conversationPosition: goal.state.messages.length, sections: [] } };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;

    const first = await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-1", "first steer");
    const second = await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-2", "second steer");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.existing, false);
    assert.equal(second.existing, false);
    release.resolve();

    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 2, JSON.stringify({ result, snapshot: await store.restore(initial.id), sampledMessages }));
    assert.deepEqual(sampledMessages[1], ["test steer", "first steer", "second steer"]);

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.equal(saved.state.run.id, initial.state.run.id);
    assert.deepEqual(saved.state.messages.map((message) => message.content), ["test steer", "first steer", "second steer", "test terminal"]);
    const failedNotice = saved.state.messages.at(-1);
    const failedFact = trajectory.events.find((event) => event.payload.type === "run_failed");
    assert.ok(failedNotice?.role === "assistant" && failedNotice.purpose === "notice");
    assert.ok(failedFact);
    assert.deepEqual(failedNotice.position, { afterSequence: failedFact.sequence, order: 0 });
    assert.deepEqual(saved.state.run.steerInputs, [
        { messageId: "steer-1", status: "applied", messageIndex: 1 },
        { messageId: "steer-2", status: "applied", messageIndex: 2 },
    ]);
    assert.deepEqual(trajectory.events.filter((event) => event.eventType.startsWith("steer_input_")).map((event) => event.eventType), [
        "steer_input_received", "steer_input_received", "steer_input_applied", "steer_input_applied",
    ]);

    for (const steerId of ["steer-1", "steer-2"]) {
        const appliedFact = trajectory.events.find((event) =>
            event.payload.type === "steer_input_applied" && event.payload.messageId === steerId);
        assert.ok(appliedFact?.payload.type === "steer_input_applied");
        const steerMessage: GoalMessage | undefined = saved.state.messages[appliedFact.payload.messageIndex];
        assert.equal(steerMessage?.runId, initial.state.run.id);
        assert.equal(steerMessage?.role, "user");
        assert.ok(steerMessage?.source.kind === "user_input");
        assert.equal(steerMessage.source.inputId, steerId);
        assert.deepEqual(steerMessage?.position, { afterSequence: appliedFact.sequence, order: 0 });
    }

    assert.deepEqual(await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-1", "first steer"), {
        ok: true, goalId: initial.id, runId: initial.state.run.id, messageId: "steer-1", existing: true,
    });
    assert.deepEqual(await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-1", "different text"), {
        ok: false, error: "STEER_CONFLICT",
    });
});


test("Steer received during a Tool waits for its committed Observation before entering model history", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const toolProfile: AgentProfile = { ...profile, toolIds: ["probe"] };
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-steer-tool",
        intent: "test tool steer",
        profile: toolProfile,
        runId: "run-steer-tool",
        maxSteps: 3,
    });
    const prepared = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["probe"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "test tool steer",
                    acceptanceCriteria: ["完成测试"],
                },
            },
        },
    };
    await store.save(prepared);
    const entered = deferred();
    const release = deferred();
    const tool: Tool = {
        definition: {
            id: "probe",
            description: "Test tool",
            inputBinding: createTransitionalToolInputBinding({ contractId: "test.tool", version: 1, contract: contract.record(contract.string()) }),
            inputContract: contract.record(contract.string()),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            entered.resolve();
            await release.promise;
            return { kind: "success", output: "effect confirmed", summary: "tool done" };
        },
    };
    const sampledMessages: string[][] = [];
    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal }) {
            calls += 1;
            sampledMessages.push(goal.state.messages.map((message) => message.content));
            return calls === 1
                ? { kind: "decision", decision: { kind: "tool_call", action: { actionId: "action-1", toolId: "probe", input: {} } } }
                : { kind: "decision", decision: { kind: "fail", error: "test terminal" } };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        toolRegistry: { get: () => createTestToolRegistration(tool) },
    });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;
    const accepted = await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "during-tool", "tool 完成后应用");
    assert.equal(accepted.ok, true);
    release.resolve();

    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(sampledMessages[1], ["test tool steer", "tool 完成后应用"]);
    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.ok(saved.state.messages.some((message) => message.content === "tool 完成后应用"));
    assert.equal(saved.state.run.stepCount, 2);
});

test("accepted Steer survives an execution restart and is injected once", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-steer-restart",
        intent: "test steer recovery",
        profile,
        runId: "run-steer-restart",
        maxSteps: 3,
    });
    await store.save(initial);
    const entered = deferred();
    const release = deferred();
    const firstRunner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: {
            async reviewCompletion() { return { kind: "accept" }; },
            async decide() {
                entered.resolve();
                await release.promise;
                return { kind: "decision", decision: { kind: "fail", error: "obsolete response" } };
            },
            async think() { throw new Error("unexpected Think call"); },
        },
    });
    const controller = new AbortController();
    const execution = firstRunner.runUntilBlocked(
        { goalId: initial.id, runId: initial.state.run.id },
        {},
        { signal: controller.signal },
    );
    await entered.promise;
    assert.equal((await firstRunner.steer({ goalId: initial.id, runId: initial.state.run.id }, "survives-restart", "恢复后输入")).ok, true);
    controller.abort();
    release.resolve();
    await assert.rejects(execution);

    let recoveredMessages: string[] = [];
    const resumedRunner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: {
            async reviewCompletion() { return { kind: "accept" }; },
            async decide({ goal }) {
                recoveredMessages = goal.state.messages.map((message) => message.content);
                return { kind: "decision", decision: { kind: "fail", error: "recovered response" } };
            },
            async think() { throw new Error("unexpected Think call"); },
        },
    });
    const resumed = await resumedRunner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(resumed.ok, true);
    assert.deepEqual(recoveredMessages, ["test steer recovery", "恢复后输入"]);
    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.deepEqual(saved.state.run.steerInputs, [
        { messageId: "survives-restart", status: "applied", messageIndex: 1 },
    ]);
});

function createSteerSessions(input: {
    readonly store: InMemoryGoalStore;
    readonly onDecide: (
        goal: { readonly state: { readonly messages: readonly { readonly content: string }[] } },
        callIndex: number,
    ) => unknown;
}): { readonly sessions: SessionManager; readonly calls: () => number } {
    const trajectory = trajectoryStoreFor(input.store);
    const committer = new TrajectoryCheckpointCommitter({ store: input.store, trajectoryStore: trajectory });
    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal }) {
            calls += 1;
            return input.onDecide(goal, calls) as never;
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store: input.store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store: input.store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => `run-session-steer-${calls + 1}`,
    });
    const profiles: AgentProfileRegistry = {
        get: (profileId) => profileId === profile.id ? profile : undefined,
    };
    const sessions = new SessionManager({
        store: input.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => `run-session-steer-${calls + 1}`,
    });
    return { sessions, calls: () => calls };
}

test("session Steer writes a durable receipt, keeps the run alive and never duplicates the body", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const sampled: string[][] = [];
    const harness = createSteerSessions({
        store,
        onDecide: async (goal, callIndex) => {
            sampled.push(goal.state.messages.map((message) => message.content));
            if (callIndex === 1) {
                entered.resolve();
                await release.promise;
            }
            return {
                kind: "decision",
                decision: { kind: "fail", error: `terminal ${callIndex}` },
                modelContextFrame: {
                    stage: "decide",
                    epochNumber: 0,
                    conversationPosition: goal.state.messages.length,
                    sections: [],
                },
            };
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-session-steer",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;
    const runId = (await store.restore("goal-session-steer"))!.state.run.id;

    const accepted = await created.session.send({
        kind: "steer",
        inputId: "steer-1",
        runId,
        content: "补充约束",
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.existing, false);
    assert.equal(accepted.receipt.status, "pending");
    assert.equal(accepted.receipt.targetRunId, runId);
    // 受理不取消在途模型调用，也不把 Steer 降级为普通队列消息。
    assert.equal(harness.calls(), 1);
    const afterAccept = (await store.restore("goal-session-steer"))!;
    assert.equal(afterAccept.state.messageQueue?.items.length ?? 0, 0);
    assert.deepEqual(afterAccept.state.run.steerInputs, [
        { messageId: "steer-1", status: "pending", content: "补充约束" },
    ]);
    assert.equal(afterAccept.state.messages.some((message) =>
        message.source.kind === "user_input" && message.source.inputId === "steer-1"), false);
    assert.deepEqual(
        afterAccept.state.inputLedger?.map((record) => [record.inputId, record.kind, record.status]),
        [["input-first", "message", "applied"], ["steer-1", "steer", "pending"]],
    );

    // 同身份同载荷重试返回原收据；异载荷身份冲突且不改写原记录。
    const retried = await created.session.send({
        kind: "steer",
        inputId: "steer-1",
        runId,
        content: "补充约束",
    });
    assert.equal(retried.ok, true);
    assert.equal(retried.ok && retried.existing, true);
    assert.equal(retried.ok && retried.receipt.sequence, accepted.receipt.sequence);
    const conflicted = await created.session.send({
        kind: "steer",
        inputId: "steer-1",
        runId,
        content: "改写后的补充",
    });
    assert.equal(conflicted.ok, false);
    assert.equal(conflicted.ok === false && conflicted.code, "INPUT_CONFLICT");
    const afterConflict = (await store.restore("goal-session-steer"))!;
    assert.deepEqual(afterConflict.state.run.steerInputs, [
        { messageId: "steer-1", status: "pending", content: "补充约束" },
    ]);
    assert.deepEqual(afterConflict.state.inputLedger?.length, 2);

    release.resolve();
    await harness.sessions.waitForIdle();

    const applied = (await store.restore("goal-session-steer"))!;
    assert.deepEqual(
        applied.state.messages.filter((message) => message.role === "user").map((message) => message.content),
        ["首个任务", "补充约束"],
    );
    assert.deepEqual(applied.state.run.steerInputs, [
        { messageId: "steer-1", status: "applied", messageIndex: 1 },
    ]);
    assert.deepEqual(
        applied.state.inputLedger?.map((record) => [record.inputId, record.status, record.messageIndex]),
        [["input-first", "applied", 0], ["steer-1", "applied", 1]],
    );
    assert.deepEqual(sampled.at(-1), ["首个任务", "补充约束"]);

    // 重建后同身份重试只返回已应用的原收据，不重复追加正文。
    const rebuilt = createSteerSessions({
        store,
        onDecide: () => { throw new Error("rebuilt instance must not call the model"); },
    });
    const reopened = await rebuilt.sessions.open("goal-session-steer");
    assert.equal(reopened.ok, true);
    if (!reopened.ok) return;
    const replayed = await reopened.session.send({
        kind: "steer",
        inputId: "steer-1",
        runId,
        content: "补充约束",
    });
    assert.equal(replayed.ok, true);
    assert.equal(replayed.ok && replayed.existing, true);
    assert.equal(replayed.ok && replayed.receipt.status, "applied");
    const finalGoal = (await store.restore("goal-session-steer"))!;
    assert.equal(finalGoal.state.messages.filter((message) => message.content === "补充约束").length, 1);
    assert.equal(rebuilt.calls(), 0);
});

test("converting a queued message to Steer atomically consumes its queue entry", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createSteerSessions({
        store,
        onDecide: async (_goal, callIndex) => {
            if (callIndex === 1) {
                entered.resolve();
                await release.promise;
            }
            return { kind: "decision", decision: { kind: "fail", error: `terminal ${callIndex}` } };
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-session-queued-steer",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;
    const runId = (await store.restore("goal-session-queued-steer"))!.state.run.id;

    const queued = await created.session.send({
        kind: "message",
        inputId: "queued-message",
        content: "转入当前 Run",
    });
    assert.equal(queued.ok, true);
    const queuedGoal = (await store.restore("goal-session-queued-steer"))!;
    const queueRevision = queuedGoal.state.messageQueue!.revision;
    assert.deepEqual(queuedGoal.state.messageQueue?.items.map((item) => item.inputId), ["queued-message"]);

    const stale = await created.session.send({
        kind: "steer",
        inputId: "steer-stale",
        runId,
        content: "转入当前 Run",
        queueBinding: { messageId: "queued-message", queueRevision: queueRevision - 1 },
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.ok === false && stale.code, "QUEUE_REVISION_MISMATCH");
    assert.deepEqual((await store.restore("goal-session-queued-steer"))!.state.messageQueue?.items.map((item) => item.inputId), ["queued-message"]);

    const steered = await created.session.send({
        kind: "steer",
        inputId: "steer-from-queue",
        runId,
        content: "转入当前 Run",
        queueBinding: { messageId: "queued-message", queueRevision },
    });
    assert.equal(steered.ok, true);
    if (!steered.ok) return;
    const converted = (await store.restore("goal-session-queued-steer"))!;
    assert.equal(converted.state.messageQueue?.revision, queueRevision + 1);
    assert.deepEqual(converted.state.messageQueue?.items, []);
    assert.deepEqual(converted.state.run.steerInputs, [
        { messageId: "steer-from-queue", status: "pending", content: "转入当前 Run" },
    ]);
    assert.deepEqual(
        converted.state.inputLedger?.map((record) => [record.inputId, record.kind, record.status]),
        [["input-first", "message", "applied"], ["queued-message", "message", "cleared"], ["steer-from-queue", "steer", "pending"]],
    );

    release.resolve();
    await harness.sessions.waitForIdle();
    const finished = (await store.restore("goal-session-queued-steer"))!;
    assert.deepEqual(finished.state.messages.filter((message) => message.role === "user").map((message) => message.content), [
        "首个任务",
        "转入当前 Run",
    ]);
});

test("session Steer rejects stale or non-running targets without queueing the message", async () => {
    const store = new InMemoryGoalStore();
    const harness = createSteerSessions({
        store,
        onDecide: (goal, callIndex) => ({
            kind: "decision",
            decision: { kind: "fail", error: `terminal ${callIndex}` },
            modelContextFrame: {
                stage: "decide",
                epochNumber: 0,
                conversationPosition: goal.state.messages.length,
                sections: [],
            },
        }),
    });

    const created = await harness.sessions.create({
        goalId: "goal-session-steer-reject",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();
    const finished = (await store.restore("goal-session-steer-reject"))!;
    assert.equal(finished.state.run.status, "failed");
    const runId = finished.state.run.id;

    const notRunning = await created.session.send({
        kind: "steer",
        inputId: "steer-late",
        runId,
        content: "完成后的补充",
    });
    assert.equal(notRunning.ok, false);
    assert.equal(notRunning.ok === false && notRunning.code, "RUN_NOT_RUNNING");

    const staleRun = await created.session.send({
        kind: "steer",
        inputId: "steer-stale",
        runId: "run-unknown",
        content: "旧 Run 的补充",
    });
    assert.equal(staleRun.ok, false);
    assert.equal(staleRun.ok === false && staleRun.code, "RUN_NOT_FOUND");

    const afterRejections = (await store.restore("goal-session-steer-reject"))!;
    // 拒绝不写入收据，也不会静默降级为普通队列消息。
    assert.deepEqual(
        afterRejections.state.inputLedger?.map((record) => record.inputId),
        ["input-first"],
    );
    assert.equal(afterRejections.state.messageQueue?.items.length ?? 0, 0);
    assert.equal(harness.calls(), 1);
});
