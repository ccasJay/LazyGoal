import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    SessionManagerCloseError,
    TrajectoryCheckpointCommitter,
    type AgentProfile,
    type AgentProfileRegistry,
    type GoalStore,
    type SessionInput,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-input-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

const profiles: AgentProfileRegistry = {
    get: (profileId) => profileId === profile.id ? profile : undefined,
};

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

interface InputHarness {
    readonly sessions: SessionManager;
    readonly calls: () => number;
}

function createHarness(options: {
    readonly store: GoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => Promise<unknown> | unknown;
    readonly prefix: string;
    readonly onDecide?: () => Promise<void>;
}): InputHarness {
    const trajectory = trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: trajectory });
    let calls = 0;
    let runCounter = 0;
    const nextRunId = (): string => {
        runCounter += 1;
        return `${options.prefix}-${runCounter}`;
    };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            if (options.onDecide !== undefined) await options.onDecide();
            return options.decide(input, calls) as never;
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
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
    });
    return { sessions, calls: () => calls };
}

function completeDecision(input: StepExecutionInput) {
    return {
        kind: "decision",
        decision: { kind: "complete", summary: "完成", evidenceSequences: [] },
        modelContextFrame: {
            stage: "decide",
            epochNumber: input.goal.state.run.contextEpoch.number,
            conversationPosition: input.goal.state.messages.length,
            sections: [],
        },
    };
}

/** 可计数、可阻塞的异步输入来源；每次 next() 都记录调用次数。 */
function createSource(inputs: readonly SessionInput[], options?: {
    readonly blockAfter?: number;
    readonly release?: Promise<void>;
    readonly failAt?: number;
    readonly throwAt?: number;
    readonly hangReturn?: boolean;
}) {
    let produced = 0;
    let nextCalls = 0;
    let returnCalls = 0;
    const iterator: AsyncIterator<SessionInput> = {
        async next() {
            nextCalls += 1;
            if (options?.throwAt !== undefined && produced === options.throwAt) {
                throw new Error("simulated source failure");
            }
            if (options?.failAt !== undefined && produced === options.failAt) {
                throw new Error("simulated source failure");
            }
            if (options?.blockAfter !== undefined && produced === options.blockAfter) {
                await options.release;
            }
            if (produced >= inputs.length) {
                return { value: undefined, done: true };
            }
            const value = inputs[produced]!;
            produced += 1;
            return { value, done: false };
        },
        async return() {
            returnCalls += 1;
            // 不合作的 return() 不能阻塞停止消费。
            if (options?.hangReturn === true) await new Promise<void>(() => undefined);
            return { value: undefined, done: true };
        },
    };
    return {
        source: { [Symbol.asyncIterator]: () => iterator } as AsyncIterable<SessionInput>,
        nextCalls: () => nextCalls,
        returnCalls: () => returnCalls,
        produced: () => produced,
    };
}

test("consume waits only for durable admission and keeps reading while the Run is blocked", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        prefix: "run-consume",
        decide: async (input) => {
            entered.resolve();
            await release.promise;
            return completeDecision(input);
        },
    });
    const created = await harness.sessions.create({
        goalId: "goal-consume",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;

    // 第二次 decide 会阻塞在同一个 release；这里只验证受理不等待执行。
    const source = createSource([
        { kind: "message", inputId: "input-a", content: "任务 A" },
        { kind: "message", inputId: "input-b", content: "任务 B" },
        { kind: "steer", inputId: "input-steer", runId: "run-consume-1", content: "补充" },
    ]);
    const consumption = created.session.consume(source.source);
    // 执行仍被屏障阻塞，但三条输入都已按顺序持久化受理。
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const during = (await store.restore("goal-consume"))!;
    assert.deepEqual(
        during.state.inputLedger?.map((record) => record.inputId),
        ["input-first", "input-a", "input-b", "input-steer"],
    );
    assert.equal(harness.calls(), 1);
    assert.equal(source.returnCalls(), 0);

    const result = await consumption;
    assert.deepEqual(result, { reason: "completed" });
    assert.equal(harness.calls(), 1);

    release.resolve();
    await harness.sessions.waitForIdle();
    const finished = (await store.restore("goal-consume"))!;
    assert.equal(finished.state.messageQueue?.items.length, 0);
    assert.deepEqual(
        finished.state.inputLedger?.filter((record) => record.status === "applied").map((record) => record.inputId),
        ["input-first", "input-a", "input-b", "input-steer"],
    );
});

test("business rejections keep consuming while infrastructure failures stop the source", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        prefix: "run-reject",
        decide: (input) => completeDecision(input),
    });
    const created = await harness.sessions.create({
        goalId: "goal-reject",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();

    // 业务拒绝：目标 Run 已终态，Steer 被拒绝后来源继续读取。
    const source = createSource([
        { kind: "steer", inputId: "steer-late", runId: "run-reject-1", content: "拒绝的补充" },
        { kind: "message", inputId: "input-after-rejection", content: "拒绝后的任务" },
    ]);
    const result = await created.session.consume(source.source);
    assert.deepEqual(result, { reason: "completed" });
    assert.equal(source.nextCalls(), 3);
    const afterBusinessRejection = (await store.restore("goal-reject"))!;
    assert.equal(
        afterBusinessRejection.state.inputLedger?.some((record) => record.inputId === "steer-late"),
        false,
    );

    // 基础设施失败：保存失败立即停止消费，不预取后续项。
    let failing = false;
    const flaky: GoalStore = {
        save: async (goal) => {
            if (failing) throw new Error("simulated save failure");
            await store.save(goal);
        },
        restore: (goalId) => store.restore(goalId),
    };
    const flakyHarness = createHarness({ store: flaky, prefix: "run-reject-2", decide: (input) => completeDecision(input) });
    const opened = await flakyHarness.sessions.open("goal-reject");
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    failing = true;
    const failingSource = createSource([
        { kind: "message", inputId: "input-fail-1", content: "失败 1" },
        { kind: "message", inputId: "input-fail-2", content: "失败 2" },
    ]);
    const failed = await opened.session.consume(failingSource.source);
    assert.equal(failed.reason, "failed");
    assert.equal(failingSource.nextCalls(), 1);
    assert.equal(failingSource.returnCalls(), 1);
    assert.equal(failingSource.produced(), 1);
});

test("EOF, source exceptions and stopped consumption only end that source", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        prefix: "run-eof",
        decide: (input) => completeDecision(input),
    });
    const created = await harness.sessions.create({
        goalId: "goal-eof",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();

    const empty = createSource([]);
    assert.deepEqual(await created.session.consume(empty.source), { reason: "completed" });

    const throwing = createSource(
        [{ kind: "message", inputId: "input-throw", content: "异常来源" }],
        { throwAt: 1 },
    );
    const failed = await created.session.consume(throwing.source);
    assert.equal(failed.reason, "failed");

    const blocked = createSource(
        [{ kind: "message", inputId: "input-stopped", content: "停止来源" }],
        { blockAfter: 0, release: new Promise<void>(() => undefined), hangReturn: true },
    );
    const consumption = created.session.consume(blocked.source);
    await new Promise((resolve) => setImmediate(resolve));
    /// 解除句柄停止消费：迟到的 next() 结果不会被受理，来源被要求释放。
    created.session.detach();
    const stopped = await consumption;
    assert.equal(stopped.reason, "stopped");
    assert.equal(blocked.returnCalls(), 1);
    const saved = (await store.restore("goal-eof"))!;
    assert.equal(saved.state.inputLedger?.some((record) => record.inputId === "input-stopped"), false);
    assert.equal(saved.state.run.status, "completed");
});

test("two sources and two subscriptions stay independent and a detached handle stops only its own", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        prefix: "run-multi",
        decide: (input) => completeDecision(input),
    });
    const created = await harness.sessions.create({
        goalId: "goal-multi",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();

    const opened = await harness.sessions.open("goal-multi");
    assert.equal(opened.ok, true);
    if (!opened.ok) return;

    const sourceA = createSource([{ kind: "message", inputId: "input-a", content: "A" }]);
    const sourceB = createSource([{ kind: "message", inputId: "input-b", content: "B" }]);
    const [resultA, resultB] = await Promise.all([
        created.session.consume(sourceA.source),
        opened.session.consume(sourceB.source),
    ]);
    assert.deepEqual(resultA, { reason: "completed" });
    assert.deepEqual(resultB, { reason: "completed" });

    const streamA = created.session.events();
    const streamB = opened.session.events();
    created.session.detach();
    assert.equal(streamA.closed, true);
    assert.equal(streamB.closed, false);
    opened.session.detach();
    assert.equal(streamB.closed, true);
    // 两个来源独立受理；执行所有者随后按 FIFO 消费每条消息一次。
    await harness.sessions.waitForIdle();
    const state = await harness.sessions.readSessionState("goal-multi");
    assert.equal(state?.pendingMessageCount, 0);
    const stored = (await store.restore("goal-multi"))!;
    assert.deepEqual(
        stored.state.inputLedger?.filter((record) => record.status === "applied").map((record) => record.inputId),
        ["input-first", "input-a", "input-b"],
    );
    assert.equal(stored.state.messages.filter((message) => message.role === "user").length, 3);
});

test("query returns the real outcome for each Run state and releases its own resources", async () => {
    const store = new InMemoryGoalStore();
    const outcomes: Array<"completed" | "failed" | "cancelled" | "waiting"> = ["completed", "failed", "waiting"];
    let index = 0;
    const harness = createHarness({
        store,
        prefix: "run-query",
        decide: (input) => {
            const outcome = outcomes[index] ?? "completed";
            index += 1;
            return outcome === "completed"
                ? completeDecision(input)
                : { kind: "decision", decision: outcome === "failed"
                    ? { kind: "fail", error: "查询失败" }
                    : { kind: "wait", reason: "等待输入" },
                modelContextFrame: {
                    stage: "decide",
                    epochNumber: 0,
                    conversationPosition: input.goal.state.messages.length,
                    sections: [],
                } };
        },
    });

    const completed = await harness.sessions.query({
        goalId: "goal-query-completed",
        inputId: "input-1",
        content: "完成任务",
        profileId: profile.id,
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.outcome, "completed");
    assert.equal(completed.runId, completed.receipt.appliedRunId);
    assert.equal(completed.state.runStatus, "completed");
    completed.session.detach();

    const failed = await harness.sessions.query({
        goalId: "goal-query-failed",
        inputId: "input-1",
        content: "失败任务",
        profileId: profile.id,
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.ok && failed.outcome, "failed");

    const waiting = await harness.sessions.query({
        goalId: "goal-query-waiting",
        inputId: "input-1",
        content: "等待任务",
        profileId: profile.id,
    });
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.outcome, "waiting");
    // 等待交互时返回可恢复身份，不永久挂起等待尚未实现的回答。
    assert.equal(waiting.state.waitingFor, "blocked");
    assert.equal(waiting.session.detached, false);
    // 借用实例未被封装关闭：仍可继续读取与受理。
    assert.equal((await waiting.session.read())?.runStatus, "waiting");
    const accepted = await waiting.session.send({ kind: "message", inputId: "input-2", content: "等待后的消息" });
    assert.equal(accepted.ok, true);

    const conflict = await harness.sessions.query({
        goalId: "goal-query-waiting",
        inputId: "input-1",
        content: "不同载荷",
        profileId: profile.id,
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.ok === false && conflict.error.code, "INPUT_CONFLICT");
});

test("bounded close reports unsettled work instead of claiming a safe shutdown", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        prefix: "run-close",
        decide: async (input) => {
            entered.resolve();
            await release.promise;
            return completeDecision(input);
        },
    });
    const created = await harness.sessions.create({
        goalId: "goal-close",
        inputId: "input-first",
        content: "长时间任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;

    await assert.rejects(
        () => harness.sessions.close({ timeoutMs: 10 }),
        (error: unknown) => {
            assert.ok(error instanceof SessionManagerCloseError);
            assert.deepEqual(error.unsettledGoalIds, ["goal-close"]);
            return true;
        },
    );
    // 关闭不取消执行、不伪造终态：目标 Run 仍保持真实状态。
    const state = await harness.sessions.readSessionState("goal-close");
    assert.equal(state?.runStatus === "created" || state?.runStatus === "running", true);

    // 释放后关闭成功结算；订阅与核对任务停止。
    release.resolve();
    await harness.sessions.close({ timeoutMs: 5000 });
    assert.equal((await store.restore("goal-close"))?.state.run.status, "completed");
});
