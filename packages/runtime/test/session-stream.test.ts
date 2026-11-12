import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalCoordinator,
    GoalRevisionMonitor,
    GoalSessionStream,
    InlineScheduler,
    projectGoalSessionState,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type SessionOutputEvent,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-stream-profile",
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

async function tick(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached before the test deadline");
}

function standaloneGoal(goalId: string): Goal {
    return createGoal({
        ...currentProtocols,
        id: goalId,
        runId: `${goalId}-run`,
        intent: "会话输出",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
    });
}

function openBoundedStream(options: {
    readonly store: InMemoryGoalStore;
    readonly publisher: InMemoryExecutionStreamPublisher;
    readonly goalId: string;
    readonly maxQueueSize: number;
}): GoalSessionStream {
    return new GoalSessionStream({
        publisher: options.publisher,
        goalId: options.goalId,
        policy: { maxQueueSize: options.maxQueueSize },
        readState: async (target) => {
            const goal = await options.store.restore(target);
            return goal === undefined ? undefined : projectGoalSessionState({ goal, executionOwner: true });
        },
    });
}

function textDelta(goalId: string, runId: string, text: string, key: string) {
    return {
        goalId,
        runId,
        kind: "model_block_delta",
        visibility: "public" as const,
        durability: "live" as const,
        delivery: "delta" as const,
        coalescingKey: `model-block:${key}`,
        payload: { modelCallId: `call-${key}`, deltaKind: "text", delta: text },
    };
}

/** 可控 fake clock：只执行显式推进的定时器回调。 */
function createFakeClock() {
    const intervalHandlers = new Map<number, () => void>();
    let nextHandle = 1;
    return {
        setIntervalFn: (handler: () => void, _timeout: number): unknown => {
            const handle = nextHandle;
            nextHandle += 1;
            intervalHandlers.set(handle, handler);
            return handle;
        },
        clearIntervalFn: (handle: unknown): void => {
            intervalHandlers.delete(handle as number);
        },
        /** 执行所有已注册的周期回调，模拟时间推进。 */
        tick(): void {
            for (const handler of [...intervalHandlers.values()]) handler();
        },
        activeCount: (): number => intervalHandlers.size,
    };
}

interface StreamHarness {
    readonly sessions: SessionManager;
    readonly publisher: InMemoryExecutionStreamPublisher;
    readonly calls: () => number;
}

function createHarness(options: {
    readonly store: InMemoryGoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => Promise<ReturnType<StepExecutor["decide"]> extends never ? never : never> | unknown;
    readonly prefix: string;
    readonly clock?: ReturnType<typeof createFakeClock>;
}): StreamHarness {
    const trajectory = trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: trajectory });
    const publisher = new InMemoryExecutionStreamPublisher();
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
            return options.decide(input, calls) as never;
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store: options.store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
        executionStream: publisher,
    });
    const coordinator = new GoalCoordinator({
        store: options.store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: nextRunId,
        executionStream: publisher,
    });
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        executionStream: publisher,
        ...(options.clock === undefined
            ? {}
            : { setInterval: options.clock.setIntervalFn, clearInterval: options.clock.clearIntervalFn }),
    });
    return { sessions, publisher, calls: () => calls };
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

test("a Goal subscription starts with state_sync and survives successor Runs without losing start events", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        prefix: "run-stream",
        decide: async (input, callIndex) => {
            if (callIndex === 1) {
                entered.resolve();
                await release.promise;
            }
            return completeDecision(input);
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-stream",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;

    const events: SessionOutputEvent[] = [];
    const stream = created.session.events();
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();

    // 首项是一致快照，且订阅在首次 next() 前已经建立。
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events[0]?.type, "state_sync");
    const firstSync = events[0];
    assert.ok(firstSync?.type === "state_sync");
    assert.equal(firstSync.state.runStatus === "created" || firstSync.state.runStatus === "running", true);

    // 受理结果以 input_result 控制事件发布，并按 inputId 关联。
    const queued = await created.session.send({ kind: "message", inputId: "input-queued", content: "后继任务" });
    assert.equal(queued.ok, true);
    await new Promise((resolve) => setImmediate(resolve));
    const inputResults = events.filter((event) => event.type === "input_result");
    assert.deepEqual(inputResults.map((event) => event.type === "input_result" ? [event.outcome.inputId, event.outcome.ok] : []), [
        ["input-queued", true],
    ]);

    // 释放首个 Run：完成、后继 Run 启动，订阅不关闭且不遗漏后继开始事件。
    release.resolve();
    await harness.sessions.waitForIdle();
    await new Promise((resolve) => setImmediate(resolve));

    const runIds = new Set(
        events
            .filter((event) => event.type === "generation_event" || event.type === "state_sync")
            .map((event) => event.type === "generation_event" ? event.event.source.runId : event.state.runId),
    );
    assert.ok(runIds.size >= 2, `expected multiple Runs, got ${JSON.stringify([...runIds])}`);
    assert.equal(stream.closed, false);

    stream.close();
    await consumed;
    const last = events.at(-1);
    assert.equal(last?.type, "closed");
    assert.equal(last?.type === "closed" && last.reason, "closed");
});

test("buffered handoff drops stale deltas from previous Runs and keeps the current Run fragments", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        prefix: "run-handoff",
        decide: (input) => completeDecision(input),
    });

    const created = await harness.sessions.create({
        goalId: "goal-handoff",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();
    const currentRunId = (await store.restore("goal-handoff"))!.state.run.id;

    const events: SessionOutputEvent[] = [];
    const stream = created.session.events();
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    // 订阅已注册但一致快照仍在读取：此时到达的旧 Run 增量必须被丢弃，
    // 当前 Run 的临时增量按来源顺序交接。
    harness.publisher.publish({
        goalId: "goal-handoff",
        runId: "run-handoff-stale",
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:stale",
        payload: { modelCallId: "call-stale", deltaKind: "text", delta: "旧回复" },
    });
    harness.publisher.publish({
        goalId: "goal-handoff",
        runId: currentRunId,
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:current",
        payload: { modelCallId: "call-current", deltaKind: "text", delta: "当前片段" },
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(events[0]?.type, "state_sync");
    const activities = events.filter((event) => event.type === "generation_event");
    assert.deepEqual(
        activities.map((event) => event.type === "generation_event" ? event.event.source.runId : ""),
        [currentRunId],
    );
    assert.deepEqual(
        activities.map((event) => event.type === "generation_event" ? event.event.kind : ""),
        ["text_delta"],
    );

    stream.close();
    await consumed;
});

test("a lost final notification is reconciled by the merged revision check within one second", async () => {
    const store = new InMemoryGoalStore();
    const clock = createFakeClock();
    const harness = createHarness({
        store,
        prefix: "run-notify",
        clock,
        decide: (input) => completeDecision(input),
    });

    const created = await harness.sessions.create({
        goalId: "goal-notify",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();

    const events: SessionOutputEvent[] = [];
    const stream = created.session.events();
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events[0]?.type, "state_sync");
    // 存在观察者时启动了核对任务；默认间隔不超过一秒。
    assert.ok(clock.activeCount() >= 1);

    // 直接写快照但不发布任何实时通知：模拟末次提交通知丢失。
    const goal = (await store.restore("goal-notify"))!;
    const silent = {
        ...goal,
        state: {
            ...goal.state,
            commitRevision: (goal.state.commitRevision ?? 0) + 1,
        },
    };
    await store.save(silent);

    clock.tick();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const syncs = events.filter((event) => event.type === "state_sync");
    assert.ok(syncs.length >= 2, `expected a reconciliation sync, got ${syncs.length}`);
    const lastSync = syncs.at(-1);
    assert.equal(lastSync?.type === "state_sync" && lastSync.state.commitRevision, silent.state.commitRevision);

    stream.close();
    await consumed;
    assert.equal(clock.activeCount(), 0);
});

test("a failing snapshot read reports a sync fault instead of a fabricated result", async () => {
    const store = new InMemoryGoalStore();
    const clock = createFakeClock();
    const harness = createHarness({
        store,
        prefix: "run-fault",
        clock,
        decide: (input) => completeDecision(input),
    });
    const created = await harness.sessions.create({
        goalId: "goal-fault",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();

    // 初始读取正常；建立订阅后底层读取开始失败。
    let failing = false;
    const flaky: InMemoryGoalStore = {
        save: (goal) => store.save(goal),
        restore: async (goalId: string) => {
            if (failing) throw new Error("simulated read failure");
            return store.restore(goalId);
        },
        // 保持原型链上的其它能力（如快照 key 访问）不可用即视为不需要。
    } as InMemoryGoalStore;
    const flakyHarness = createHarness({
        store: flaky,
        prefix: "run-fault-2",
        clock,
        decide: (input) => completeDecision(input),
    });
    const opened = await flakyHarness.sessions.open("goal-fault");
    assert.equal(opened.ok, true);
    if (!opened.ok) return;

    const events: SessionOutputEvent[] = [];
    const stream = opened.session.events();
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events[0]?.type, "state_sync");

    failing = true;
    clock.tick();
    for (let tick = 0; tick < 4 && !events.some((event) => event.type === "stream_fault"); tick += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    const syncErrors = events.filter((event) => event.type === "stream_fault");
    assert.ok(syncErrors.length >= 1, JSON.stringify(events.map((event) => event.type)));
    assert.ok(syncErrors[0]?.type === "stream_fault"
        && syncErrors[0].event.kind === "read_failed"
        && syncErrors[0].event.message.includes("simulated read failure"));
    // 读取故障不会被伪装成业务终态。
    assert.equal(events.some((event) => event.type === "state_sync" && event.state.runStatus === "cancelled"), false);

    stream.close();
    await consumed;
});

test("a slow consumer is closed with a backpressure reason while execution continues", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        prefix: "run-slow",
        decide: (input) => completeDecision(input),
    });
    const created = await harness.sessions.create({
        goalId: "goal-slow",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();

    const stream = created.session.events();
    // 不消费任何事件，直接制造超过队列上限的控制事件。
    for (let index = 0; index < 500; index += 1) {
        harness.publisher.publish({
            goalId: "goal-slow",
            runId: created.receipt.appliedRunId ?? "run-slow-1",
            kind: "step_started",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: { step: index },
        });
    }
    for (let tick = 0; tick < 5 && !stream.closed; tick += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(stream.closed, true);
    assert.equal(stream.closeReason, "backpressure");
    // 订阅关闭不改变执行：Goal 仍处于终态且可继续受理新的显式指令。
    const state = await created.session.read();
    assert.equal(state?.runStatus, "completed");
    const accepted = await created.session.send({ kind: "message", inputId: "input-after", content: "背压后的任务" });
    assert.equal(accepted.ok, true);
    await harness.sessions.waitForIdle();
    assert.ok(harness.calls() >= 2);
});

test("detaching a handle releases only its own subscriptions", async () => {
    const store = new InMemoryGoalStore();
    const clock = createFakeClock();
    const harness = createHarness({
        store,
        prefix: "run-detach",
        clock,
        decide: (input) => completeDecision(input),
    });
    const created = await harness.sessions.create({
        goalId: "goal-detach",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();

    const first = created.session.events();
    const secondOpen = await harness.sessions.open("goal-detach");
    assert.equal(secondOpen.ok, true);
    if (!secondOpen.ok) return;
    const second = secondOpen.session.events();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.closed, false);
    assert.equal(second.closed, false);

    created.session.detach();
    assert.equal(first.closed, true);
    assert.equal(second.closed, false);
    assert.equal(clock.activeCount() >= 1, true);

    secondOpen.session.detach();
    assert.equal(second.closed, true);
    assert.equal(clock.activeCount(), 0);
    // Goal 与执行不受解除连接影响。
    const state = await harness.sessions.readSessionState("goal-detach");
    assert.equal(state?.runStatus, "completed");
});

test("GoalRevisionMonitor 使用 readRevision，仅在实际变化时通知", async () => {
    const clock = createFakeClock();
    let revision = 1;
    let goalReads = 0;
    let revisionReads = 0;
    const signals: number[] = [];
    const monitor = new GoalRevisionMonitor({
        readGoal: async () => {
            goalReads += 1;
            return undefined;
        },
        readRevision: async () => {
            revisionReads += 1;
            return revision;
        },
        setInterval: clock.setIntervalFn,
        clearInterval: clock.clearIntervalFn,
    });
    const unsubscribe = monitor.observe("goal-revision", (signal) => {
        if (signal.kind === "revision_changed") signals.push(signal.revision);
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(revisionReads, 1);
    assert.equal(goalReads, 0);

    clock.tick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(revisionReads, 2);
    assert.equal(goalReads, 0);
    assert.deepEqual(signals, []);

    revision = 2;
    clock.tick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(signals, [2]);
    unsubscribe();
});

test("successor Run 的首个实时片段在原订阅上交付，迟到的前一 Run 增量被过滤", async () => {
    const store = new InMemoryGoalStore();
    const clock = createFakeClock();
    const firstGate = deferred();
    const secondGate = deferred();
    const harness = createHarness({
        store,
        prefix: "run-successor",
        clock,
        decide: async (input, callIndex) => {
            if (callIndex === 1) await firstGate.promise;
            if (callIndex === 2) await secondGate.promise;
            return completeDecision(input);
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-successor",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const events: SessionOutputEvent[] = [];
    const stream = created.session.events();
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await waitFor(() => events.some((event) => event.type === "state_sync"));
    const firstSync = events.find((event) => event.type === "state_sync");
    assert.ok(firstSync?.type === "state_sync");
    const firstRunId = firstSync.state.runId;

    // 真实 Session FIFO：排入的消息在首个 Run 结束后启动后继 Run。
    const queued = await created.session.send({ kind: "message", inputId: "input-next", content: "后继任务" });
    assert.equal(queued.ok, true);
    firstGate.resolve();

    // 后继 Run 已提交成为当前 Run；这里不推进任何定时核对。
    await waitFor(async () => {
        const goal = await store.restore("goal-successor");
        return goal !== undefined && goal.state.run.id !== firstRunId && goal.state.run.status === "running";
    });
    const secondRunId = (await store.restore("goal-successor"))!.state.run.id;

    harness.publisher.publish(textDelta("goal-successor", secondRunId, "后继片段", "successor"));
    harness.publisher.publish(textDelta("goal-successor", firstRunId, "迟到旧片段", "stale"));
    harness.publisher.publish({
        goalId: "goal-successor",
        runId: firstRunId,
        kind: "run_waiting",
        visibility: "public",
        durability: "checkpoint",
        delivery: "control",
        payload: {},
    });
    await waitFor(() => events.some((event) => event.type === "run_status"
        && event.event.kind === "waiting"
        && event.event.source.runId === firstRunId
        && event.event.source.durability === "checkpoint"));

    // 后继 Run 的片段先于定时核对交付，未确认的旧 Run 增量不冒充当前进度。
    const deltas = events.filter((event) => event.type === "generation_event" && event.event.kind === "text_delta");
    assert.deepEqual(
        deltas.map((event) => event.type === "generation_event" && event.event.kind === "text_delta"
            ? [event.event.source.runId, event.event.text] : []),
        [[secondRunId, "后继片段"]],
    );
    // 前一 Run 已提交的控制事实仍按来源交付。
    const deltaIndex = events.findIndex((event) => event.type === "generation_event"
        && event.event.kind === "text_delta"
        && event.event.source.runId === secondRunId);
    const lateControlIndex = events.findIndex((event) => event.type === "run_status"
        && event.event.kind === "waiting"
        && event.event.source.runId === firstRunId
        && event.event.source.durability === "checkpoint");
    assert.ok(deltaIndex >= 0, JSON.stringify(events.map((event) => event.type)));
    assert.ok(lateControlIndex > deltaIndex, "previous Run control fact must follow the successor fragment");
    assert.equal(clock.activeCount() >= 1, true);
    assert.equal(stream.closed, false);

    secondGate.resolve();
    await harness.sessions.waitForIdle();
    stream.close();
    await consumed;
});

test("最终消费者缓冲有固定上限：相邻片段合并，临时内容缺口显式报告且不关闭订阅", async () => {
    const store = new InMemoryGoalStore();
    const goal = standaloneGoal("goal-bounded");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const stream = openBoundedStream({ store, publisher, goalId: goal.id, maxQueueSize: 4 });
    const initial = await stream.next();
    assert.equal(initial.done, false);
    assert.equal(initial.value?.type, "state_sync");

    // 分六批生产同 Run 的公开正文：队列从未超过固定上限，正文按顺序保留。
    for (let index = 0; index < 6; index += 1) {
        publisher.publish(textDelta(goal.id, goal.state.run.id, `${index}`, `text-${index}`));
        await tick();
    }
    assert.ok(stream.pending <= 4, `queue exceeded its bound: ${stream.pending}`);
    const merged: SessionOutputEvent[] = [];
    while (stream.pending > 0) {
        const result = await stream.next();
        if (result.done) break;
        merged.push(result.value);
    }
    assert.ok(merged.length <= 4, `delivered more than the bound: ${merged.length}`);
    assert.equal(
        merged.map((event) => event.type === "generation_event" && event.event.kind === "text_delta"
            ? event.event.text : "").join(""),
        "012345",
    );
    assert.equal(merged.some((event) => event.type === "stream_fault"), false);

    // 无法合并的临时内容：报告一次缺口并保持订阅开放。
    for (let index = 0; index < 6; index += 1) {
        publisher.publish({
            goalId: goal.id,
            runId: goal.state.run.id,
            kind: "candidate_preview",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: { candidateId: `candidate-${index}`, text: `${index}`, startOffset: 0, truncated: false, complete: false },
        });
        await tick();
    }
    assert.ok(stream.pending <= 5, `queue exceeded its bound: ${stream.pending}`);
    const afterGap: SessionOutputEvent[] = [];
    while (stream.pending > 0) {
        const result = await stream.next();
        if (result.done) break;
        afterGap.push(result.value);
    }
    assert.equal(stream.closed, false);
    assert.ok(afterGap.some((event) => event.type === "stream_fault" && event.event.kind === "gap"));
    // 缺口后在容量恢复时重新核对。
    await tick();
    while (stream.pending > 0) {
        const result = await stream.next();
        if (result.done) break;
        afterGap.push(result.value);
    }
    assert.ok(afterGap.some((event) => event.type === "state_sync"));

    stream.close();
});

test("控制事件无法保留时只结束该订阅，其他订阅与执行继续", async () => {
    const store = new InMemoryGoalStore();
    const goal = standaloneGoal("goal-control-bound");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const slow = openBoundedStream({ store, publisher, goalId: goal.id, maxQueueSize: 4 });
    const fast = openBoundedStream({ store, publisher, goalId: goal.id, maxQueueSize: 4 });
    assert.equal((await slow.next()).value?.type, "state_sync");
    assert.equal((await fast.next()).value?.type, "state_sync");

    const fastEvents: SessionOutputEvent[] = [];
    const draining = (async () => {
        while (true) {
            const result = await fast.next();
            if (result.done) return;
            fastEvents.push(result.value);
        }
    })();

    for (let index = 0; index < 6; index += 1) {
        publisher.publish({
            goalId: goal.id,
            runId: goal.state.run.id,
            kind: "run_waiting",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: {},
        });
        await tick();
    }

    assert.equal(slow.closed, true);
    assert.equal(slow.closeReason, "backpressure");
    const terminal = await slow.next();
    assert.equal(terminal.done, false);
    assert.equal(terminal.value?.type, "closed");
    if (terminal.value?.type === "closed") assert.equal(terminal.value.reason, "backpressure");
    assert.equal((await slow.next()).done, true);

    // 另一订阅仍完整收到控制事件。
    assert.equal(
        fastEvents.filter((event) => event.type === "run_status" && event.event.kind === "waiting").length,
        6,
    );
    fast.close();
    await draining;
});

test("关闭释放积压与挂起读取，迟到的同步结果不再派生输出", async () => {
    const store = new InMemoryGoalStore();
    const goal = standaloneGoal("goal-close-release");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const pending: Array<(state: ReturnType<typeof projectGoalSessionState> | undefined) => void> = [];
    const stream = new GoalSessionStream({
        publisher,
        goalId: goal.id,
        readState: () => new Promise((resolve) => { pending.push(resolve); }),
    });
    await tick();
    assert.equal(pending.length, 1);
    const projected = projectGoalSessionState({ goal, executionOwner: true });
    pending[0]!(projected);
    await tick();
    assert.equal(stream.pending, 1);

    publisher.publish(textDelta(goal.id, goal.state.run.id, "积压片段", "close"));
    await tick();
    const late = stream.resync();
    await tick();
    assert.equal(pending.length, 2);

    stream.close();
    stream.close();
    assert.equal(stream.closeReason, "closed");
    pending[1]!(projected);
    await late;
    await tick();

    // 积压已释放，只保留一次可观察的终止结果。
    assert.equal(stream.pending, 1);
    const terminal = await stream.next();
    assert.equal(terminal.value?.type, "closed");
    assert.equal((await stream.next()).done, true);
});
