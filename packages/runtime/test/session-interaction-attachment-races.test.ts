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
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "attachment-race-profile",
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
        tick(): void {
            for (const handler of [...intervalHandlers.values()]) handler();
        },
    };
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

/** 可在指定阶段挂起或失败的 Store 包装；其余调用委托内层 Store。 */
class ControllableStore implements GoalStore {
    readonly inner = new InMemoryGoalStore();
    blockNextRestore = false;
    failNextRestore = false;
    gate = deferred();

    save(goal: Goal): Promise<void> {
        return this.inner.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        if (this.blockNextRestore) {
            this.blockNextRestore = false;
            await this.gate.promise;
        }
        if (this.failNextRestore) {
            this.failNextRestore = false;
            throw new Error("injected restore failure");
        }
        return this.inner.restore(goalId);
    }

    readRevision(goalId: string): Promise<number | undefined> {
        return this.inner.readRevision(goalId);
    }

    releaseGate(): void {
        this.gate.resolve();
    }

    resetGate(): void {
        this.gate = deferred();
    }
}

interface AttachmentHarness {
    readonly sessions: SessionManager;
    readonly failures: Array<{ readonly goalId: string; readonly message: string }>;
}

async function pendingInteractionId(sessions: SessionManager, goalId: string): Promise<string | undefined> {
    const state = await sessions.readSessionState(goalId);
    return state?.interaction?.interactionId;
}

function createHarness(options: {
    readonly store: ControllableStore;
    readonly clock: ReturnType<typeof createFakeClock>;
    readonly decide: (callIndex: number) => AgentDecision | Promise<AgentDecision>;
}): AttachmentHarness {
    const trajectory = trajectoryStoreFor(options.store.inner);
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: trajectory });
    const failures: Array<{ readonly goalId: string; readonly message: string }> = [];
    let calls = 0;
    let runCounter = 0;
    const nextRunId = (): string => {
        runCounter += 1;
        return `run-attachment-race-${runCounter}`;
    };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            return {
                kind: "decision",
                decision: await options.decide(calls),
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
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        setInterval: options.clock.setIntervalFn,
        clearInterval: options.clock.clearIntervalFn,
        onBackgroundFailure: (goalId, error) => {
            failures.push({ goalId, message: error instanceof Error ? error.message : String(error) });
        },
    });
    return { sessions, failures };
}

const askUser = (questionText: string): AgentDecision => ({
    kind: "ask_user",
    questions: [{
        header: "Next step",
        question: questionText,
        multiSelect: false,
        options: [{ label: "Continue" }, { label: "Stop" }],
    }],
});

const complete = (): AgentDecision => ({ kind: "complete", summary: "完成", evidenceSequences: [] });

test("基线建立前不投递历史等待，初始化期间的显式解锁只投递一次", async () => {
    const store = new ControllableStore();
    const clock = createFakeClock();
    const harness = createHarness({
        store,
        clock,
        decide: (callIndex) => callIndex === 1 ? askUser("基线竞态？") : complete(),
    });
    const created = await harness.sessions.create({
        goalId: "goal-baseline-race",
        inputId: "input-first",
        content: "基线竞态",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();
    const state = await created.session.read();
    assert.ok(state?.interaction !== undefined);
    const runId = state!.runId;
    const goalId = state!.goalId;
    const baseRevision = state!.commitRevision;

    let calls = 0;
    store.blockNextRestore = true;
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async () => {
            calls += 1;
            return { kind: "respond", response: { kind: "skip_question" } };
        },
    });
    assert.equal(attached.ok, true);
    await tick();
    // 连接之前的等待是历史请求：基线读取在途时不启动宿主函数。
    assert.equal(calls, 0);

    // 通知先于基线读取返回：仍然不启动宿主函数。
    const goal = await store.inner.restore(goalId);
    await store.inner.save({
        ...goal!,
        state: { ...goal!.state, commitRevision: baseRevision + 1 },
    });
    clock.tick();
    await tick();
    assert.equal(calls, 0);

    // 初始化期间显式解锁：保持 INTERACTION_REQUIRED，并只投递一次。
    const resumed = await harness.sessions.sendSessionInput(goalId, {
        kind: "resume",
        inputId: "resume-baseline",
        runId,
        commitRevision: baseRevision + 1,
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.ok === false ? resumed.code : "", "INTERACTION_REQUIRED");
    await waitFor(() => calls === 1);
    await tick();

    // 释放被挂起的初始读取：基线重算不影响已投递的请求。
    store.releaseGate();
    await tick();
    await tick();
    assert.equal(calls, 1);
    await harness.sessions.waitForIdle();
    await harness.sessions.close();
});

test("基线读取失败不被当成空历史，显式解锁仍只投递一次", async () => {
    const store = new ControllableStore();
    const clock = createFakeClock();
    const harness = createHarness({
        store,
        clock,
        decide: (callIndex) => callIndex === 1 ? askUser("读取失败基线？") : complete(),
    });
    const created = await harness.sessions.create({
        goalId: "goal-baseline-failure",
        inputId: "input-first",
        content: "读取失败基线",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await harness.sessions.waitForIdle();
    const state = await created.session.read();
    assert.ok(state?.interaction !== undefined);
    const goalId = state!.goalId;
    const runId = state!.runId;
    const baseRevision = state!.commitRevision;

    let calls = 0;
    store.failNextRestore = true;
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async () => {
            calls += 1;
            return { kind: "respond", response: { kind: "skip_question" } };
        },
    });
    assert.equal(attached.ok, true);
    await tick();
    assert.equal(calls, 0);

    // 失败后的通知触发重试：基线成功后历史等待仍不会被自动回答。
    const goal = await store.inner.restore(goalId);
    await store.inner.save({
        ...goal!,
        state: { ...goal!.state, commitRevision: baseRevision + 1 },
    });
    clock.tick();
    await tick();
    await tick();
    assert.equal(calls, 0);

    const resumed = await harness.sessions.sendSessionInput(goalId, {
        kind: "resume",
        inputId: "resume-baseline-failure",
        runId,
        commitRevision: baseRevision + 1,
    });
    assert.equal(resumed.ok === false ? resumed.code : "", "INTERACTION_REQUIRED");
    await waitFor(() => calls === 1);
    await tick();
    assert.equal(calls, 1);
    await harness.sessions.waitForIdle();
    await harness.sessions.close();
});

test("派发读取在途时解除连接，读取完成后不再启动宿主函数", async () => {
    const store = new ControllableStore();
    const clock = createFakeClock();
    const firstGate = deferred();
    const harness = createHarness({
        store,
        clock,
        decide: async (callIndex) => {
            if (callIndex === 1) await firstGate.promise;
            return callIndex === 2 ? askUser("读取在途解除？") : complete();
        },
    });
    const created = await harness.sessions.create({
        goalId: "goal-dispatch-detach",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    let calls = 0;
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async () => {
            calls += 1;
            return { kind: "respond", response: { kind: "skip_question" } };
        },
    });
    assert.equal(attached.ok, true);
    await tick();

    // 首 Run 结束前排队，后继 Run 随后建立新的等待。
    const accepted = await created.session.send({ kind: "message", inputId: "input-second", content: "继续" });
    assert.equal(accepted.ok, true);
    firstGate.resolve();
    await harness.sessions.waitForIdle();
    await waitFor(async () => (await pendingInteractionId(harness.sessions, "goal-dispatch-detach")) !== undefined);

    store.blockNextRestore = true;
    clock.tick();
    await tick();
    attached.handle.detach();
    store.releaseGate();
    await tick();
    await tick();
    assert.equal(calls, 0);
    assert.notEqual(await pendingInteractionId(harness.sessions, "goal-dispatch-detach"), undefined);
    await harness.sessions.close();
});

test("已启动的宿主函数在解除连接时收到中止信号，迟到结果不改变等待", async () => {
    const store = new ControllableStore();
    const clock = createFakeClock();
    const firstGate = deferred();
    const harness = createHarness({
        store,
        clock,
        decide: async (callIndex) => {
            if (callIndex === 1) await firstGate.promise;
            return callIndex === 2 ? askUser("中止信号？") : complete();
        },
    });
    const created = await harness.sessions.create({
        goalId: "goal-handler-abort",
        inputId: "input-first",
        content: "首个任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const entered = deferred();
    const release = deferred();
    let aborted = false;
    const attached = created.session.attachInteractionHandlers({
        onQuestion: async ({ signal }) => {
            entered.resolve();
            signal.addEventListener("abort", () => { aborted = true; }, { once: true });
            await release.promise;
            return { kind: "respond", response: { kind: "skip_question" } };
        },
    });
    assert.equal(attached.ok, true);
    await tick();

    const accepted = await created.session.send({ kind: "message", inputId: "input-second", content: "继续" });
    assert.equal(accepted.ok, true);
    firstGate.resolve();
    await harness.sessions.waitForIdle();
    await waitFor(async () => (await pendingInteractionId(harness.sessions, "goal-handler-abort")) !== undefined);

    clock.tick();
    await entered.promise;
    const waiting = await pendingInteractionId(harness.sessions, "goal-handler-abort");
    assert.notEqual(waiting, undefined);
    attached.handle.detach();
    assert.equal(aborted, true);

    release.resolve();
    await tick();
    await tick();
    // 迟到结果不提交新决定，原等待保持不变。
    assert.equal(await pendingInteractionId(harness.sessions, "goal-handler-abort"), waiting);
    await harness.sessions.close();
});
