import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    type Goal,
    type GoalStore,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore, JsonFileGoalStore } from "../../storage/src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-execution-profile",
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
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((done, failed) => {
        resolve = done;
        reject = failed;
    });
    return { promise, resolve, reject };
}

interface ExecutionHarness {
    readonly sessions: SessionManager;
    readonly coordinator: GoalCoordinator;
    readonly calls: () => number;
    readonly started: () => number;
    dispose(): void;
}

function createHarness(options: {
    readonly store: GoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => Promise<AgentDecision> | AgentDecision;
    readonly runIdPrefix: string;
}): ExecutionHarness {
    const trajectory = trajectoryStoreFor(options.store);
    const committer = new TrajectoryCheckpointCommitter({
        store: options.store,
        trajectoryStore: trajectory,
    });
    let calls = 0;
    let started = 0;
    let runCounter = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            started += 1;
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
    });
    return {
        sessions,
        coordinator,
        calls: () => calls,
        started: () => started,
        dispose: () => undefined,
    };
}

test("create persists the first input before returning and keeps executing in the background", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-create",
        decide: async (input) => {
            entered.resolve();
            await release.promise;
            return { kind: "fail", error: "test terminal" };
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-create",
        inputId: "input-first",
        content: "首次任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.existing, false);
    assert.equal(created.receipt.status, "applied");
    assert.equal(created.receipt.messageIndex, 0);
    assert.equal(created.receipt.sequence, 1);

    // 创建返回时已经持久化 Goal、首条消息、Run 与收据，且后台执行仍在进行。
    await entered.promise;
    const persisted = await store.restore("goal-create");
    assert.ok(persisted);
    assert.deepEqual(persisted.state.messages, [{ role: "user", content: "首次任务" }]);
    assert.ok((persisted.state.commitRevision ?? 0) >= 1);
    assert.equal(await store.restore("goal-create") === undefined, false);
    const duringRun = await created.session.read();
    assert.ok(duringRun);
    assert.ok(duringRun.runStatus === "created" || duringRun.runStatus === "running");
    assert.equal(duringRun.executionOwner, true);
    assert.equal(duringRun.needsRecovery, false);

    release.resolve();
    await harness.sessions.waitForIdle();
    const finished = await created.session.read();
    assert.equal(finished?.runStatus, "failed");
    const afterRun = await store.restore("goal-create");
    assert.ok(afterRun);
    assert.ok(CASE(afterRun).includes("首次任务"));
});

function CASE(goal: Goal): readonly string[] {
    return goal.state.messages.map((message) => message.content);
}

test("a failed first save rejects creation without calling the model", async () => {
    const inner = new InMemoryGoalStore();
    let failing = true;
    const store: GoalStore = {
        save: async (goal) => {
            if (failing) throw new Error("simulated first save failure");
            await inner.save(goal);
        },
        restore: (goalId) => inner.restore(goalId),
    };
    const harness = createHarness({
        store,
        runIdPrefix: "run-fail",
        decide: () => ({ kind: "fail", error: "unreachable" }),
    });

    await assert.rejects(() => harness.sessions.create({
        goalId: "goal-fail",
        inputId: "input-fail",
        content: "不会执行",
        profileId: profile.id,
    }));
    assert.equal(harness.started(), 0);
    assert.equal(await inner.restore("goal-fail"), undefined);
    assert.equal(harness.sessions.activeGoal, undefined);

    failing = false;
    const retried = await harness.sessions.create({
        goalId: "goal-fail",
        inputId: "input-fail",
        content: "不会执行",
        profileId: profile.id,
    });
    assert.equal(retried.ok, true);
    await harness.sessions.waitForIdle();
    assert.equal(harness.started(), 1);
});

test("two handles and a creation retry share one executor and never resume implicitly", async () => {
    const store = new InMemoryGoalStore();
    const entered = deferred();
    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-handles",
        decide: async () => {
            entered.resolve();
            await release.promise;
            return { kind: "wait", reason: "test waiting" };
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-handles",
        inputId: "input-1",
        content: "共享执行者",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await entered.promise;
    const first = await harness.sessions.open("goal-handles");
    const second = await harness.sessions.open("goal-handles");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.notEqual(first.session.sessionId, second.session.sessionId);
    assert.equal(first.state.runStatus === "created" || first.state.runStatus === "running", true);

    // 重建实例后只读连接不推进执行。
    const rebuilt = createHarness({
        store,
        runIdPrefix: "run-rebuilt",
        decide: () => { throw new Error("rebuilt instance must not call the model"); },
    });
    const rebuiltOpen = await rebuilt.sessions.open("goal-handles");
    assert.equal(rebuiltOpen.ok, true);
    assert.equal(rebuilt.sessions.activeGoal, undefined);
    assert.equal(rebuiltOpen.ok && rebuiltOpen.state.executionOwner, false);
    assert.equal(rebuiltOpen.ok && rebuiltOpen.state.needsRecovery, true);

    // 原创建身份重试只连接原 Goal，不创建第二个执行器，也不当作恢复指令。
    const retried = await rebuilt.sessions.create({
        goalId: "goal-handles",
        inputId: "input-1",
        content: "共享执行者",
        profileId: profile.id,
    });
    assert.equal(retried.ok, true);
    assert.equal(retried.ok && retried.existing, true);
    assert.equal(rebuilt.sessions.activeGoal, undefined);
    assert.equal(harness.started(), 1);

    const conflicted = await rebuilt.sessions.create({
        goalId: "goal-handles",
        inputId: "input-1",
        content: "改写后的创建载荷",
        profileId: profile.id,
    });
    assert.equal(conflicted.ok, false);
    assert.equal(conflicted.ok === false && conflicted.error.code, "INPUT_CONFLICT");

    release.resolve();
    await harness.sessions.waitForIdle();
    const waiting = await created.session.read();
    assert.equal(waiting?.runStatus, "waiting");
    assert.equal(waiting?.waitingFor, "blocked");
    assert.equal(harness.started(), 1);
});

test("another Goal is busy for execution and input while the active slot is held", async () => {
    const store = new InMemoryGoalStore();
    const otherGoal: Goal = {
        ...createGoal({
            ...currentProtocols,
            promptBundleVersion: 1,
            id: "goal-other",
            intent: "另一个 Goal",
            profile,
            runId: "run-other",
        }),
        state: {
            ...createGoal({
                ...currentProtocols,
                promptBundleVersion: 1,
                id: "goal-other",
                intent: "另一个 Goal",
                profile,
                runId: "run-other",
            }).state,
            commitRevision: 1,
        },
    };
    await store.save(otherGoal);

    const release = deferred();
    const harness = createHarness({
        store,
        runIdPrefix: "run-busy",
        decide: async () => {
            await release.promise;
            return { kind: "fail", error: "test terminal" };
        },
    });

    const created = await harness.sessions.create({
        goalId: "goal-active",
        inputId: "input-active",
        content: "占用活动名额",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    assert.equal(harness.sessions.activeGoal, "goal-active");

    const otherCreate = await harness.sessions.create({
        goalId: "goal-second",
        inputId: "input-second",
        content: "不应启动",
        profileId: profile.id,
    });
    assert.equal(otherCreate.ok, false);
    assert.equal(otherCreate.ok === false && otherCreate.error.code, "BUSY");
    assert.equal(await store.restore("goal-second"), undefined);

    const opened = await harness.sessions.open("goal-other");
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const sent = await opened.session.send({
        kind: "message",
        inputId: "input-other",
        content: "另一个 Goal 的消息",
    });
    assert.equal(sent.ok, false);
    assert.equal(sent.ok === false && sent.code, "BUSY");
    const otherState = await store.restore("goal-other");
    assert.equal(otherState?.state.messageQueue, undefined);
    assert.equal(otherState?.state.inputLedger, undefined);

    release.resolve();
    await harness.sessions.waitForIdle();
    // 名额释放后其他 Goal 仍不会偷偷进入调度；其运行状态保持原样。
    const afterRelease = await store.restore("goal-other");
    assert.equal(afterRelease?.state.run.status, "created");
    assert.equal(harness.started(), 1);
});

test("missing and unreadable Goals fail explicitly on open", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-session-execution-"));
    try {
        const store = new JsonFileGoalStore(directory);
        const harness = createHarness({
            store,
            runIdPrefix: "run-open",
            decide: () => { throw new Error("open must not call the model"); },
        });

        const missing = await harness.sessions.open("goal-missing");
        assert.equal(missing.ok, false);
        assert.equal(missing.ok === false && missing.error.code, "GOAL_NOT_FOUND");

        const encoded = Buffer.from("goal-corrupt", "utf8").toString("base64url");
        await writeFile(join(directory, `${encoded}.json`), "{ not json", "utf8");
        const corrupt = await harness.sessions.open("goal-corrupt");
        assert.equal(corrupt.ok, false);
        assert.equal(corrupt.ok === false && corrupt.error.code, "GOAL_UNREADABLE");
        await assert.rejects(() => harness.sessions.readSessionState("goal-corrupt"));
        assert.equal(harness.started(), 0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("terminal and waiting Runs keep their Session open and report the real status", async () => {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        runIdPrefix: "run-status",
        decide: (input) => input.goal.id === "goal-completed"
            ? { kind: "complete", summary: "done", evidenceSequences: [] }
            : { kind: "fail", error: "test terminal" },
    });

    const completed = await harness.sessions.create({
        goalId: "goal-completed",
        inputId: "input-completed",
        content: "完成这个任务",
        profileId: profile.id,
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    await harness.sessions.waitForIdle();
    const completedState = await completed.session.read();
    assert.equal(completedState?.runStatus, "completed");
    assert.equal(completed.session.detached, false);

    const failed = await harness.sessions.create({
        goalId: "goal-failed",
        inputId: "input-failed",
        content: "失败的任务",
        profileId: profile.id,
    });
    assert.equal(failed.ok, true);
    if (!failed.ok) return;
    await harness.sessions.waitForIdle();
    assert.equal((await failed.session.read())?.runStatus, "failed");
    assert.equal(failed.session.detached, false);

    // cancelled 由真实 Interrupt 结算产生；Session 不因 Run 终态而关闭。
    const cancelEntered = deferred();
    const cancelling = createHarness({
        store,
        runIdPrefix: "run-cancel",
        decide: ({ control }) => new Promise<AgentDecision>((_resolve, reject) => {
            cancelEntered.resolve();
            const signal = control?.signal;
            if (signal === undefined) return reject(new Error("missing cancellation signal"));
            signal.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true });
        }),
    });
    const cancellingCreated = await cancelling.sessions.create({
        goalId: "goal-cancelled",
        inputId: "input-cancelled",
        content: "需要取消的任务",
        profileId: profile.id,
    });
    assert.equal(cancellingCreated.ok, true);
    if (!cancellingCreated.ok) return;
    await cancelEntered.promise;
    const cancelledRunId = (await store.restore("goal-cancelled"))?.state.run.id;
    assert.ok(cancelledRunId);
    const interruptAccepted = await cancelling.coordinator.interrupt(
        { goalId: "goal-cancelled", runId: cancelledRunId },
        "interrupt-cancelled-1",
    );
    assert.equal(interruptAccepted.ok, true);
    await cancelling.sessions.waitForIdle();
    const cancelledState = await cancellingCreated.session.read();
    assert.equal(cancelledState?.runStatus, "cancelled");
    assert.equal(cancellingCreated.session.detached, false);

    const waiting = createHarness({
        store,
        runIdPrefix: "run-wait",
        decide: () => ({ kind: "wait", reason: "等待输入" }),
    });
    const waitingCreated = await waiting.sessions.create({
        goalId: "goal-waiting",
        inputId: "input-waiting",
        content: "等待型任务",
        profileId: profile.id,
    });
    assert.equal(waitingCreated.ok, true);
    if (!waitingCreated.ok) return;
    await waiting.sessions.waitForIdle();
    assert.equal((await waitingCreated.session.read())?.runStatus, "waiting");
    assert.equal(waitingCreated.session.detached, false);
    assert.equal(waitingCreated.session.goalId, "goal-waiting");

    // 已解除连接的句柄拒绝后续调用，但不影响其他句柄或 Goal。
    const detached = harness.sessions;
    assert.equal(completed.session.detached, false);
    completed.session.detach();
    assert.equal(completed.session.detached, true);
    await assert.rejects(() => completed.session.read());
    const stillOpen = await detached.open("goal-completed");
    assert.equal(stillOpen.ok, true);
    assert.equal((await detached.readSessionState("goal-completed"))?.runStatus, "completed");
});
