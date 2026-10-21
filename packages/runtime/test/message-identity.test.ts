import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    appendGoalMessage,
    createRuntimeNoticeSource,
    findGoalMessageBySource,
    GoalMessageSourceConflictError,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    createGoal,
    goalMessageSourceKey,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore, JsonFileGoalStore } from "../../storage/src/index";
import { currentProtocols, messageOutline, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "message-identity-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

const profiles: AgentProfileRegistry = {
    get(profileId: string): AgentProfile | undefined {
        return profileId === profile.id ? profile : undefined;
    },
};

function createBaseGoal(id: string, runId: string): Goal {
    return createGoal({
        ...currentProtocols,
        id,
        runId,
        intent: `目标 ${id}`,
        promptBundleVersion: 1,
        profile,
        maxSteps: 10,
    });
}

interface RuntimeHarness {
    readonly sessions: SessionManager;
    readonly store: InMemoryGoalStore;
    readonly failures: () => readonly unknown[];
}

/** 用真实 Coordinator／Runner 装配一个只按脚本返回决策的会话运行时。 */
function createRuntimeHarness(
    store: InMemoryGoalStore,
    decide: () => AgentDecision,
): RuntimeHarness {
    const trajectory = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide() {
            return { kind: "decision", decision: decide() };
        },
        async think(): Promise<never> { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => "run-identity",
    });
    const failures: unknown[] = [];
    const sessions = new SessionManager({
        store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => "run-identity",
        onBackgroundFailure: (_goalId, error) => { failures.push(error); },
    });
    return { sessions, store, failures: () => [...failures] };
}

test("Goal 意图消息在创建时获得稳定身份、Run 归属与真实来源", () => {
    const goal = createBaseGoal("goal-intent", "run-intent");
    const intent = goal.state.messages[0];
    assert.ok(intent !== undefined && intent.role === "user");
    assert.equal(intent.messageId, "msg-intent-goal-intent");
    assert.equal(intent.runId, "run-intent");
    assert.deepEqual(intent.source, { kind: "goal_intent", goalId: "goal-intent" });
    assert.equal(goalMessageSourceKey(intent.source), "goal_intent:goal-intent");
});

test("同源重试返回原消息身份，不追加第二条；不同来源的相同正文保留两条", () => {
    const goal = createBaseGoal("goal-retry", "run-retry");
    const base = goal.state.messages.length;
    const source = { kind: "user_input", inputId: "input-1" } as const;

    const first = appendGoalMessage(goal, {
        role: "user",
        content: "同样的正文",
        runId: "run-retry",
        source,
    });
    assert.equal(first.reused, false);
    assert.equal(first.goal.state.messages.length, base + 1);

    const retry = appendGoalMessage(first.goal, {
        role: "user",
        content: "同样的正文",
        runId: "run-retry",
        source,
    });
    assert.equal(retry.reused, true);
    assert.equal(retry.message.messageId, first.message.messageId);
    assert.equal(retry.goal.state.messages.length, base + 1);

    const other = appendGoalMessage(first.goal, {
        role: "user",
        content: "同样的正文",
        runId: "run-retry",
        source: { kind: "user_input", inputId: "input-2" },
    });
    assert.equal(other.reused, false);
    assert.equal(other.goal.state.messages.length, base + 2);
    assert.notEqual(other.message.messageId, first.message.messageId);
    assert.equal(findGoalMessageBySource(other.goal.state.messages, source)?.messageId, first.message.messageId);
});

test("同一来源出现不一致正文时明确失败，不覆盖已提交正文", () => {
    const goal = createBaseGoal("goal-conflict", "run-conflict");
    const source = { kind: "user_input", inputId: "input-1" } as const;
    const first = appendGoalMessage(goal, {
        role: "user",
        content: "原始正文",
        runId: "run-conflict",
        source,
    });

    assert.throws(
        () => appendGoalMessage(first.goal, {
            role: "user",
            content: "被改写的正文",
            runId: "run-conflict",
            source,
        }),
        (error: unknown) => error instanceof GoalMessageSourceConflictError
            && error.code === "GOAL_MESSAGE_SOURCE_CONFLICT"
            && error.existingContent === "原始正文",
    );
    assert.equal(first.goal.state.messages.at(-1)?.content, "原始正文");
});

test("保存成功后抛错时，文件重建不重复消息也不改写正文", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-message-identity-"));
    try {
        const store = new JsonFileGoalStore(directory);

        let saves = 0;
        const failingStore = {
            async save(next: Goal): Promise<void> {
                // 只在提交最终答复时制造“已落盘但调用报错”的不确定结果。
                if (next.state.messages.some((message) => message.role === "assistant")) {
                    await store.save(next);
                    saves += 1;
                    throw new Error("保存结果不明");
                }
                await store.save(next);
            },
            async restore(goalId: string): Promise<Goal | undefined> {
                return store.restore(goalId);
            },
        };
        const committer = new TrajectoryCheckpointCommitter({
            store: failingStore,
            trajectoryStore: trajectoryStoreFor(store),
        });
        const executor: StepExecutor = {
            async reviewCompletion() { return { kind: "accept" }; },
            async decide() {
                return { kind: "decision", decision: { kind: "complete", summary: "完成", evidenceSequences: [] } };
            },
            async think(): Promise<never> { throw new Error("unexpected Think call"); },
        };
        const runner = new Runner({
            store: failingStore,
            trajectoryStore: trajectoryStoreFor(store),
            executor,
            checkpointCommitter: committer,
        });
        const coordinator = new GoalCoordinator({
            store: failingStore,
            scheduler: new InlineScheduler(runner),
            checkpointCommitter: committer,
            runIdGenerator: () => "run-save-then-throw",
        });
        const sessions = new SessionManager({
            store: failingStore,
            committer,
            coordinator,
            profiles,
            runIdGenerator: () => "run-save-then-throw",
            onBackgroundFailure: () => undefined,
        });

        const created = await sessions.create({
            goalId: "goal-save-then-throw",
            inputId: "input-first",
            content: "首条输入",
            profileId: profile.id,
        });
        assert.equal(created.ok, true);
        await sessions.waitForIdle();

        const rebuilt = new JsonFileGoalStore(directory);
        const restored = await rebuilt.restore("goal-save-then-throw");
        assert.ok(restored);
        const userMessages = restored.state.messages.filter((message) => message.role === "user");
        assert.equal(userMessages.length, 1);
        assert.equal(userMessages[0]?.content, "首条输入");
        assert.equal(userMessages[0]?.source.kind, "user_input");
        const answer = restored.state.messages.find((message) => message.role === "assistant");
        assert.ok(answer !== undefined && answer.role === "assistant");
        assert.equal(answer.purpose, "answer");
        assert.equal(answer.source.kind, "completion_candidate");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("未应用的队列项不产生伪消息，受理输入只留在账本与队列中", async () => {
    const store = new InMemoryGoalStore();
    const harness = createRuntimeHarness(store, () => {
        throw new Error("unexpected Decide call");
    });

    const created = await harness.sessions.create({
        goalId: "goal-queue",
        inputId: "input-first",
        content: "首条输入",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);

    const admitted = await harness.sessions.sendSessionInput("goal-queue", {
        kind: "message",
        inputId: "input-queued",
        content: "排队中的输入",
    });
    assert.equal(admitted.ok, true);

    const persisted = await store.restore("goal-queue");
    assert.ok(persisted);
    const userMessages = persisted.state.messages.filter((message) => message.role === "user");
    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0]?.content, "首条输入");
    assert.equal(persisted.state.messageQueue?.items.length, 1);
    const queuedInput = persisted.state.inputLedger?.find((record) => record.inputId === "input-queued");
    assert.equal(queuedInput?.status, "pending");
    assert.equal(queuedInput?.messageIndex, undefined);
});

test("等待通知标记为 notice 且保留 Runtime 来源", async () => {
    const store = new InMemoryGoalStore();
    const harness = createRuntimeHarness(store, () => ({ kind: "wait", reason: "需要更多时间" }));

    const created = await harness.sessions.create({
        goalId: "goal-wait",
        inputId: "input-first",
        content: "首条输入",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();

    const persisted = await store.restore("goal-wait");
    assert.ok(persisted);
    assert.deepEqual(messageOutline(persisted.state.messages), [
        { role: "user", content: "首条输入" },
        { role: "assistant", content: "需要更多时间", purpose: "notice" },
    ]);
    const notice = persisted.state.messages.find((message) => message.role === "assistant");
    assert.ok(notice !== undefined && notice.role === "assistant");
    assert.equal(notice.source.kind, "runtime_notice");
    assert.equal(notice.runId, "run-identity");
});

test("完成答复标记为 answer 且来源指向被接受的完成候选", async () => {
    const store = new InMemoryGoalStore();
    const harness = createRuntimeHarness(store, () => ({
        kind: "complete",
        summary: "已完成",
        evidenceSequences: [],
    }));

    const created = await harness.sessions.create({
        goalId: "goal-answer",
        inputId: "input-first",
        content: "首条输入",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();

    const persisted = await store.restore("goal-answer");
    assert.ok(persisted);
    assert.deepEqual(harness.failures().map((error) => error instanceof Error ? error.message : String(error)), []);
    assert.deepEqual(messageOutline(persisted.state.messages), [
        { role: "user", content: "首条输入" },
        { role: "assistant", content: "已完成", purpose: "answer" },
    ]);
    const answer = persisted.state.messages.find((message) => message.role === "assistant");
    assert.ok(answer !== undefined && answer.role === "assistant");
    assert.equal(answer.source.kind, "completion_candidate");
    assert.equal(answer.runId, "run-identity");
});

test("Runtime 通知来源的稳定键不与正文或数组位置相关", () => {
    const first = createRuntimeNoticeSource("notice-1");
    const second = createRuntimeNoticeSource("notice-2");
    assert.equal(goalMessageSourceKey(first), "runtime_notice:notice-1");
    assert.notEqual(goalMessageSourceKey(first), goalMessageSourceKey(second));
});

test("保存前失败不会留下半条消息", async () => {
    const store = new InMemoryGoalStore();

    let attempts = 0;
    const failingStore = {
        async save(next: Goal): Promise<void> {
            // 只在提交最终答复时失败：正文从未落盘，快照不得留下半条消息。
            if (next.state.messages.some((message) => message.role === "assistant")) {
                attempts += 1;
                throw new Error("保存失败");
            }
            await store.save(next);
        },
        async restore(goalId: string): Promise<Goal | undefined> {
            return store.restore(goalId);
        },
    };
    const committer = new TrajectoryCheckpointCommitter({
        store: failingStore,
        trajectoryStore: trajectoryStoreFor(store),
    });
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide() {
            return { kind: "decision", decision: { kind: "complete", summary: "完成", evidenceSequences: [] } };
        },
        async think(): Promise<never> { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store: failingStore,
        trajectoryStore: trajectoryStoreFor(store),
        executor,
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store: failingStore,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: () => "run-pre-save",
    });
    const sessions = new SessionManager({
        store: failingStore,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => "run-pre-save",
        onBackgroundFailure: () => undefined,
    });

    const created = await sessions.create({
        goalId: "goal-pre-save",
        inputId: "input-first",
        content: "首条输入",
        profileId: profile.id,
    });
    assert.equal(created.ok, true, created.ok ? "" : JSON.stringify(created));
    await sessions.waitForIdle();

    const persisted = await store.restore("goal-pre-save");
    assert.ok(persisted);
    assert.ok(attempts > 0);
    assert.deepEqual(messageOutline(persisted.state.messages), [
        { role: "user", content: "首条输入" },
    ]);
});
