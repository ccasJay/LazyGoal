import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalStore,
} from "../../runtime/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import {
    BrowserGoalStreamService,
    createBrowserGoalRoutes,
    type BrowserGoalLiveEvent,
    type BrowserGoalSaveNotifications,
} from "../src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

class NotifyingMemoryStore implements GoalStore, BrowserGoalSaveNotifications {
    private readonly goals = new Map<string, Goal>();
    private readonly listeners = new Set<(goal: Goal) => void>();

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
        for (const listener of this.listeners) listener(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }

    onSave(listener: (goal: Goal) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

function goalFor(goalId: string, runId = "run-1"): Goal {
    return createGoal({
        ...protocols,
        id: goalId,
        intent: "观察实时流",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId,
    });
}

function nextEvent<T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>> {
    return iterator.next();
}

test("实时流按 Goal/Run 隔离，白名单裁剪载荷并将提交变化转换为刷新通知", async () => {
    const goal = goalFor("goal-stream-1");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const streams = new BrowserGoalStreamService({
        store,
        saveNotifications: store,
        publisher,
    });
    const opened = await streams.open(goal.id, goal.state.run.id);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const iterator = opened.feed.events[Symbol.asyncIterator]();

    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "snapshot_changed",
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    publisher.publish({
        goalId: goal.id,
        runId: "old-run",
        kind: "assistant_text_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "assistant:old",
        payload: { text: "旧 Run" },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "reasoning_delta",
        visibility: "restricted",
        durability: "live",
        delivery: "delta",
        coalescingKey: "reasoning:step",
        payload: { text: "private reasoning" },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "tool_output_delta",
        visibility: "diagnostic",
        durability: "live",
        delivery: "delta",
        coalescingKey: "tool:secret",
        payload: { text: "private tool output" },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "decision_received",
        visibility: "public",
        durability: "trajectory",
        delivery: "control",
        payload: { thought: "private detail", decision: { kind: "tool_call" } },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "assistant_text_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "assistant:step",
        payload: { text: "x".repeat(2_500), thought: "do not leak" },
    });
    const activity = await nextEvent(iterator);
    assert.deepEqual(activity.value, {
        type: "activity",
        goalId: goal.id,
        runId: goal.state.run.id,
        activity: {
            kind: "assistant_text_delta",
            text: "x".repeat(2_000),
            truncated: true,
            sourceEventId: "event-4",
            sourceCursor: 4,
        },
    });

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "step_committed",
        visibility: "public",
        durability: "checkpoint",
        delivery: "control",
        payload: { eventIds: ["secret-id"], eventTypes: ["decision_received"] },
    });
    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "snapshot_changed",
        goalId: goal.id,
        runId: goal.state.run.id,
    });

    const completed: Goal = {
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, status: "completed" } },
    };
    await store.save(completed);
    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "snapshot_changed",
        goalId: goal.id,
        runId: goal.state.run.id,
    });

    publisher.close({ goalId: goal.id, runId: goal.state.run.id }, "publisher_closed");
    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "refresh_required",
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    assert.equal((await nextEvent(iterator)).done, true);
});

test("实时工具活动携带独立来源身份并仅投影白名单输入摘要", async () => {
    const goal = goalFor("goal-stream-tools");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const streams = new BrowserGoalStreamService({ store, saveNotifications: store, publisher });
    const opened = await streams.open(goal.id, goal.state.run.id);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const iterator = opened.feed.events[Symbol.asyncIterator]();
    await nextEvent(iterator);

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        executionUnitId: "unit-1",
        actionId: "action-1",
        kind: "tool_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { toolId: "read_file", input: { path: "src/example.ts", secret: "never expose" } },
    });
    const started = (await nextEvent(iterator)).value;
    assert.deepEqual(started, {
        type: "activity",
        goalId: goal.id,
        runId: goal.state.run.id,
        activity: {
            kind: "tool_started",
            sourceEventId: "event-1",
            sourceCursor: 1,
            actionId: "action-1",
            executionUnitId: "unit-1",
            toolId: "read_file",
            inputSummary: "src/example.ts",
        },
    });
    assert.equal(JSON.stringify(started).includes("never expose"), false);

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        actionId: "action-1",
        kind: "tool_attempt_failed",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { attempt: 1, reason: "retryable error" },
    });
    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "activity", goalId: goal.id, runId: goal.state.run.id,
        activity: { kind: "tool_attempt_failed", sourceEventId: "event-2", sourceCursor: 2, actionId: "action-1", attempt: 1, reason: "retryable error" },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        actionId: "action-1",
        kind: "tool_finished",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { toolId: "read_file", observation: { kind: "success", output: "secret content", summary: "Read file" } },
    });
    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "activity", goalId: goal.id, runId: goal.state.run.id,
        activity: { kind: "tool_finished", sourceEventId: "event-3", sourceCursor: 3, actionId: "action-1", toolId: "read_file", outcome: "success", summary: "Read file" },
    });
    opened.feed.close();
});

test("实时公开回复、等待、阶段、终态、失败与未知活动映射为分组边界", async () => {
    const goal = goalFor("goal-stream-boundaries");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const streams = new BrowserGoalStreamService({ store, saveNotifications: store, publisher });
    const opened = await streams.open(goal.id, goal.state.run.id);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const iterator = opened.feed.events[Symbol.asyncIterator]();
    await nextEvent(iterator);

    const cases = [
        ["decision_received", "assistant_reply", { decision: { kind: "complete" } }],
        ["run_waiting", "user_wait", {}],
        ["run_stage_declared", "stage_change", {}],
        ["run_completed", "terminal", {}],
        ["execution_error", "failure", {}],
        ["future_public_event", "unknown", {}],
    ] as const;
    for (const [index, [kind, reason, payload]] of cases.entries()) {
        publisher.publish({
            goalId: goal.id,
            runId: goal.state.run.id,
            kind,
            visibility: "public",
            durability: "trajectory",
            delivery: "control",
            payload,
        });
        assert.deepEqual((await nextEvent(iterator)).value, {
            type: "activity", goalId: goal.id, runId: goal.state.run.id,
            activity: { kind: "activity_boundary", sourceEventId: `event-${index + 1}`, sourceCursor: index + 1, reason },
        });
    }
    opened.feed.close();
});

test("过期 Run 与缺失 Goal 无法打开实时流，队列缺口要求刷新", async () => {
    const goal = goalFor("goal-stream-2");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "model_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    const streams = new BrowserGoalStreamService({ store, saveNotifications: store, publisher });
    assert.deepEqual(await streams.open(goal.id, "stale-run"), { ok: false, error: "stale_run" });
    assert.deepEqual(await streams.open("missing", "run-1"), { ok: false, error: "goal_not_found" });

    const opened = await streams.open(goal.id, goal.state.run.id);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const iterator = opened.feed.events[Symbol.asyncIterator]();
    await nextEvent(iterator);
    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "refresh_required",
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    opened.feed.close();
});

test("HTTP 事件流只接受单一 Goal/Run 身份并关闭时清理订阅", async () => {
    const events: BrowserGoalLiveEvent[] = [{
        type: "activity",
        goalId: "goal-stream-3",
        runId: "run-1",
        activity: { kind: "model_started" },
    }];
    let closeCalls = 0;
    const routes = createBrowserGoalRoutes({
        async list() { return []; },
        async read() { return undefined; },
        async create() { return { ok: false as const, error: "goal_create_failed" as const }; },
        async interact() { return { ok: false as const, error: "interaction_failed" as const }; },
        async message() { return { ok: false as const, error: "message_failed" as const }; },
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        async openStream() {
            let index = 0;
            return {
                ok: true as const,
                feed: {
                    events: {
                        async *[Symbol.asyncIterator]() {
                            while (index < events.length) yield events[index++]!;
                        },
                    },
                    close() { closeCalls += 1; },
                },
            };
        },
    });

    const invalid = await routes.request("http://localhost/api/goals/goal-stream-3/events?runId=run-1&extra=1");
    assert.equal(invalid.status, 400);
    const response = await routes.request("http://localhost/api/goals/goal-stream-3/events?runId=run-1");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = response.body?.getReader();
    assert.ok(reader);
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value),
        `event: update\ndata: ${JSON.stringify(events[0])}\n\n`);
    assert.equal((await reader.read()).done, true);
    assert.equal(closeCalls, 1);
});
