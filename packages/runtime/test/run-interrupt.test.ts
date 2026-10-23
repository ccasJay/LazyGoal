import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentProfile,
    type AgentProfileRegistry,
    type StepExecutor,
} from "../src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { contract } from "../../contracts/src/index";
import { createToolRegistration, type Tool } from "../../tool-core/src/index";
import { InMemoryGoalStore, goalSnapshotCodec } from "../../storage/src/index";
import { hasPendingSessionInputs } from "../src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = { id: "interrupt-profile", systemPrompt: "test", instructions: [], toolIds: [] };

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

test("Interrupt persists intent, stops only the active Run, and settles it as cancelled", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: "goal-interrupt", intent: "interrupt", profile, runId: "run-interrupt" });
    await store.save(initial);
    const entered = deferred();
    let calls = 0;
    const executor: StepExecutor = {
        async decide({ control }) {
            calls += 1;
            entered.resolve();
            return new Promise((_, reject) => {
                const signal = control?.signal;
                if (signal === undefined) return reject(new Error("missing cancellation signal"));
                signal.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true });
            });
        },
        async think() { throw new Error("unexpected Think call"); },
        async reviewCompletion() { return { kind: "accept" }; },
    };
    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;

    const accepted = await runner.interrupt({ goalId: initial.id, runId: initial.state.run.id }, "interrupt-request-1");
    assert.deepEqual(accepted, {
        ok: true,
        goalId: initial.id,
        runId: initial.state.run.id,
        requestId: "interrupt-request-1",
        existing: false,
    });
    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 1);

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.equal(saved.state.run.status, "cancelled");
    assert.deepEqual(saved.state.run.interruption, {
        requestId: "interrupt-request-1",
        status: "finished",
    });
    assert.deepEqual(trajectory.events.filter((event) => event.eventType.startsWith("run_interrupt") || event.eventType === "run_cancelled").map((event) => event.eventType), [
        "run_interrupt_requested", "run_cancelled",
    ]);
    assert.deepEqual(await runner.interrupt({ goalId: initial.id, runId: initial.state.run.id }, "interrupt-request-1"), {
        ok: true, goalId: initial.id, runId: initial.state.run.id, requestId: "interrupt-request-1", existing: true,
    });
});

test("Interrupted Tool cancels without another model call and preserves its unknown outcome", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const toolProfile: AgentProfile = { ...profile, toolIds: ["write_probe"] };
    const created = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: "goal-interrupt-tool", intent: "inspect interrupted write", profile: toolProfile, runId: "run-interrupt-tool" });
    const initial = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                status: "running" as const,
                exposedToolIds: ["write_probe"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "inspect interrupted write",
                    acceptanceCriteria: ["完成测试"],
                },
            },
        },
    };
    await store.save(initial);
    const entered = deferred();
    let calls = 0;
    let toolCalls = 0;
    const executor: StepExecutor = {
        async decide() {
            calls += 1;
            return { kind: "decision", decision: { kind: "tool_call", action: { actionId: `action-write-${calls}`, toolId: "write_probe", input: { value: "x" } } } };
        },
        async think() { throw new Error("unexpected Think call"); },
        async reviewCompletion() { return { kind: "accept" }; },
    };
    const tool: Tool = {
        definition: { id: "write_probe", description: "May write externally", inputContract: contract.record(contract.string()), isReadOnly: false },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(_request, control) {
            toolCalls += 1;
            entered.resolve();
            return new Promise((_, reject) => control?.signal?.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true }));
        },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        toolRegistry: { get: (toolId) => toolId === "write_probe" ? createToolRegistration(tool) : undefined },
    });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;
    const accepted = await runner.interrupt({ goalId: initial.id, runId: initial.state.run.id }, "interrupt-write");
    assert.equal(accepted.ok, true);
    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    assert.equal(toolCalls, 1);

    const latest = await store.restore(initial.id);
    assert.equal(latest?.state.run.status, "cancelled");
    assert.equal(latest?.state.run.interruption?.outcomeUnknown, true);
    assert.equal(latest?.state.run.interruption?.status, "finished");
    assert.equal(latest?.state.messages.some(message => message.source?.kind === "runtime_notice"), false);
    const unknown = trajectory.events.find((event) => event.eventType === "observation_recorded" && event.payload.actionId === "action-write-1");
    assert.equal(unknown?.eventType, "observation_recorded", JSON.stringify(trajectory.events.map((event) => [event.eventType, event.actionId])));
    if (unknown?.eventType === "observation_recorded") {
        assert.equal(unknown.payload.observation.kind, "failure");
        if (unknown.payload.observation.kind === "failure") {
            assert.equal(unknown.payload.observation.code, "TOOL_INTERRUPTED_OUTCOME_UNKNOWN");
            assert.equal(unknown.payload.observation.retryable, false);
        }
    }
    assert.equal(trajectory.events.some((event) => event.eventType === "tool_finished" && event.actionId === "action-write-1"), false);
});

test("recovered accepted Interrupt cancels without another model call", async () => {
    const store = new InMemoryGoalStore();
    const created = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: "goal-interrupt-budget", intent: "repair budget", profile, runId: "run-interrupt-budget" });
    const initial = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                status: "running" as const,
                interruption: { requestId: "interrupt-budget", status: "requested" as const, interruptedActions: [{ actionId: "action-1", toolId: "probe", input: {} }], outcomeUnknown: true },
            },
        },
    };
    await store.save(initial);
    let calls = 0;
    const runner = new Runner({ store, executor: {
        async decide() { calls += 1; return { kind: "decision", decision: { kind: "fail", error: "should not run" } }; },
        async think() { throw new Error("unexpected Think call"); },
        async reviewCompletion() { return { kind: "accept" }; },
    } });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(calls, 0);
    const latest = await store.restore(initial.id);
    assert.equal(latest?.state.run.status, "cancelled");
});

function createInterruptSessions(input: {
    readonly store: InMemoryGoalStore;
    readonly onDecide: (
        goal: { readonly state: { readonly messages: readonly { readonly content: string }[]; readonly run: { readonly id: string } } },
        callIndex: number,
        control: { readonly signal?: AbortSignal } | undefined,
    ) => unknown;
}): { readonly sessions: SessionManager; readonly calls: () => number } {
    const trajectory = trajectoryStoreFor(input.store);
    const committer = new TrajectoryCheckpointCommitter({ store: input.store, trajectoryStore: trajectory });
    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal, control }) {
            calls += 1;
            return input.onDecide(goal, calls, control) as never;
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
        runIdGenerator: () => `run-interrupt-session-${calls + 1}`,
    });
    const profiles: AgentProfileRegistry = {
        get: (profileId) => profileId === profile.id ? profile : undefined,
    };
    const sessions = new SessionManager({
        store: input.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => `run-interrupt-session-${calls + 1}`,
    });
    return { sessions, calls: () => calls };
}


test("已受理但尚未处理的停止使旧等待失效，迟到回答不再被接受", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const goalId = "goal-interrupt-pending-wait";
    const base = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: goalId, intent: "interrupt pending wait", profile, runId: "run-interrupt-pending-wait" });
    // 真实持久化的中间状态：停止已受理但收尾尚未开始。
    const interruptedWaiting: Goal = {
        ...base,
        state: {
            ...base.state,
            messageQueue: { revision: 1, items: [], pause: { reason: "user_interrupt", runId: base.state.run.id } },
            run: {
                ...base.state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-pending",
                    mode: "execution",
                    questions: [{
                        id: "q-1",
                        header: "继续吗",
                        question: "是否继续执行？",
                        options: [{ id: "o-1", label: "是" }, { id: "o-2", label: "否" }],
                        multiSelect: false,
                    }],
                },
                interruption: { requestId: "interrupt-pending", status: "requested" },
            },
        },
    };
    // 手写状态必须是当前协议下的合法快照。
    const restored = goalSnapshotCodec.decode(goalSnapshotCodec.encode(interruptedWaiting));
    await store.save(restored);

    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: { async reviewCompletion() { return { kind: "accept" }; }, async decide() { throw new Error("late response must not call the model"); }, async think() { throw new Error("unexpected Think call"); } },
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => "run-unused",
    });
    const ref = { goalId, runId: restored.state.run.id };
    const answered = await coordinator.resume({
        ref,
        action: { kind: "answer_ask_user", requestId: "ask-pending", answers: [{ questionId: "q-1", optionIds: ["o-1"] }] },
    });
    assert.equal(answered.ok, false);
    assert.equal(answered.ok === false && answered.error.code, "INVALID_GOAL_INPUT");
    const replied = await coordinator.resume({
        ref,
        action: { kind: "reply_to_question", requestId: "ask-pending", content: "迟到的整体回复" },
    });
    assert.equal(replied.ok, false);
    const skipped = await coordinator.resume({ ref, action: { kind: "skip_question", requestId: "ask-pending" } });
    assert.equal(skipped.ok, false);

    const saved = await store.restore(goalId);
    assert.deepEqual(saved, restored, "失效响应不改变已持久化的等待与停止事实");
});

test("session Interrupt persists the receipt and queue pause in one commit and settles as cancelled", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const harness = createInterruptSessions({
        store,
        onDecide: (_goal, callIndex, control) => new Promise((_resolve, reject) => {
            if (callIndex !== 1) return reject(new Error("unexpected extra model call"));
            entered.resolve();
            const signal = control?.signal;
            if (signal === undefined) return reject(new Error("missing cancellation signal"));
            signal.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true });
        }),
    });

    const created = await harness.sessions.create({
        goalId: "goal-session-interrupt",
        inputId: "input-first",
        content: "需要取消的任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;
    await created.session.send({ kind: "message", inputId: "input-queued", content: "中断后保留的任务" });
    const runId = (await store.restore("goal-session-interrupt"))!.state.run.id;

    const accepted = await created.session.send({
        kind: "interrupt",
        inputId: "interrupt-1",
        runId,
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.receipt.status, "applied");
    assert.equal(accepted.receipt.targetRunId, runId);

    // 受理已在同一提交中暂停队列，且不等待停止完成。
    const afterAccept = (await store.restore("goal-session-interrupt"))!;
    assert.equal(afterAccept.state.messageQueue?.pause?.reason, "user_interrupt");
    assert.equal(afterAccept.state.messageQueue?.pause?.runId, runId);
    assert.deepEqual(
        afterAccept.state.inputLedger?.map((record) => [record.inputId, record.status]),
        [["input-first", "applied"], ["input-queued", "pending"], ["interrupt-1", "applied"]],
    );
    const acceptedState = await created.session.read();
    assert.equal(acceptedState?.interruption?.requestId, "interrupt-1");
    assert.ok(acceptedState?.interruption?.status === "requested" || acceptedState?.interruption?.status === "finished");

    await harness.sessions.waitForIdle();
    const cancelled = await store.restore("goal-session-interrupt")!;
    assert.ok(cancelled);
    assert.equal(cancelled.state.run.status, "cancelled");
    assert.deepEqual(cancelled.state.run.interruption, {
        requestId: "interrupt-1",
        status: "finished",
    });
    const cancelledState = await created.session.read();
    assert.equal(cancelledState?.runStatus, "cancelled");
    assert.equal(cancelledState?.interruption?.status, "finished");
    assert.equal(cancelledState?.queuePaused, true);
    assert.equal(cancelledState?.pendingMessageCount, 1);

    // 重复身份返回原收据；其他中断请求明确拒绝。
    const repeated = await created.session.send({
        kind: "interrupt",
        inputId: "interrupt-1",
        runId,
    });
    assert.equal(repeated.ok, true);
    assert.equal(repeated.ok && repeated.existing, true);
    const conflicting = await created.session.send({
        kind: "interrupt",
        inputId: "interrupt-2",
        runId,
    });
    assert.equal(conflicting.ok, false);
    // 已存在另一条中断记录时返回稳定拒绝，不覆盖既有中断记录。
    assert.equal(conflicting.ok === false && conflicting.code, "INTERRUPT_CONFLICT");
    const interruptedAgain = await created.session.send({
        kind: "interrupt",
        inputId: "interrupt-1",
        runId,
    });
    assert.equal(interruptedAgain.ok && interruptedAgain.existing, true);
    // 已进入中断／取消的 Run 不再接受 Steer，也不降级为队列消息。
    const steerAfterInterrupt = await created.session.send({
        kind: "steer",
        inputId: "steer-after-interrupt",
        runId,
        content: "取消后的补充",
    });
    assert.equal(steerAfterInterrupt.ok, false);
    assert.equal(steerAfterInterrupt.ok === false && steerAfterInterrupt.code, "RUN_NOT_RUNNING");
    const finalGoal = (await store.restore("goal-session-interrupt"))!;
    assert.equal(finalGoal.state.messageQueue?.items.length, 1);
    assert.equal(harness.calls(), 1);

    // 重建实例只读不收尾：不产生新的模型调用，暂停与收据仍然有效。
    const rebuilt = createInterruptSessions({
        store,
        onDecide: () => { throw new Error("rebuilt instance must not settle or call the model"); },
    });
    const opened = await rebuilt.sessions.open("goal-session-interrupt");
    assert.equal(opened.ok, true);
    assert.equal(opened.ok && opened.state.runStatus, "cancelled");
    assert.equal(opened.ok && opened.state.queuePaused, true);
    assert.equal(await rebuilt.calls(), 0);
    assert.equal(rebuilt.sessions.activeGoal, undefined);
    assert.equal(hasPendingSessionInputs(finalGoal), true);
});
