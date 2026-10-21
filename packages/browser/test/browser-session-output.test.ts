import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalSessionStream,
    projectGoalSessionState,
    type Goal,
    type GoalStore,
    type SessionOutputEvent,
} from "../../runtime/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import {
    createBrowserGoalRoutes,
    createBrowserSessionFeed,
    type BrowserGoalLiveEvent,
} from "../src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

class MemoryStore implements GoalStore {
    private readonly goals = new Map<string, Goal>();

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }
}

function goalFor(goalId: string): Goal {
    return createGoal({
        ...protocols,
        id: goalId,
        runId: "run-1",
        intent: "观察会话输出协议",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
    });
}

function openFeed(store: GoalStore, publisher: InMemoryExecutionStreamPublisher, goalId: string) {
    const stream = new GoalSessionStream({
        publisher,
        goalId,
        readState: async (target) => {
            const goal = await store.restore(target);
            return goal === undefined ? undefined : projectGoalSessionState({ goal, executionOwner: true });
        },
    });
    return createBrowserSessionFeed({
        goalId,
        sessionId: "s1",
        detach: () => undefined,
    } as never, stream);
}

test("内部句柄与真实 SSE 对同一受控会话输出一致公开语义", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-session-output");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const feed = openFeed(store, publisher, goal.id);
    const iterator = feed.events[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.value?.type, "state_sync");

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "candidate_preview",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {
            candidateId: "candidate-1",
            modelCallId: "call-1",
            blockIndex: 0,
            text: "候选正文",
            startOffset: 0,
            truncated: false,
            complete: true,
        },
    });
    const preview = await iterator.next();
    assert.equal(preview.value?.type, "activity");
    assert.deepEqual(preview.value, {
        type: "activity",
        goalId: goal.id,
        runId: goal.state.run.id,
        activity: {
            kind: "candidate_preview",
            sourceEventId: "event-1",
            sourceCursor: 1,
            candidateId: "candidate-1",
            text: "候选正文",
            startOffset: 0,
            truncated: false,
            complete: true,
        },
    });

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "candidate_invalidated",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { candidateId: "candidate-1", reason: "rejected" },
    });
    const invalidated = await iterator.next();
    assert.equal(invalidated.value?.type, "activity");
    assert.equal(invalidated.value?.type === "activity" ? invalidated.value.activity.kind : "", "candidate_invalidated");
    feed.close();
});

test("跨 Goal 的迟到输出被忽略，不覆盖当前 Goal 的活动", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-session-output-own");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const feed = openFeed(store, publisher, goal.id);
    const iterator = feed.events[Symbol.asyncIterator]();
    await iterator.next();

    publisher.publish({
        goalId: "goal-other",
        runId: "run-other",
        kind: "candidate_preview",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {
            candidateId: "candidate-other",
            modelCallId: "call-other",
            blockIndex: 0,
            text: "其它 Goal 的正文",
            startOffset: 0,
            truncated: false,
            complete: true,
        },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "model_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    const next = await iterator.next();
    assert.equal(next.value?.type, "activity");
    assert.equal(next.value?.type === "activity" ? next.value.activity.kind : "", "model_started");
    feed.close();
});

test("公开序列只含允许字段，不泄漏工具参数、reasoning 与原始观察", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-session-output-safe");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const feed = openFeed(store, publisher, goal.id);
    const iterator = feed.events[Symbol.asyncIterator]();
    await iterator.next();

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:reasoning",
        payload: { blockIndex: 0, deltaKind: "reasoning", delta: "PRIVATE_REASONING" },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        actionId: "action-1",
        executionUnitId: "unit-1",
        kind: "tool_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { toolId: "read_file", input: { path: "src/a.ts", secret: "PRIVATE_ARGUMENT" } },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "observation_recorded",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { observation: { kind: "success", output: "PRIVATE_OBSERVATION" } },
    });
    const next = await iterator.next();
    assert.equal(next.value?.type, "activity");
    const serialized = JSON.stringify(next.value);
    assert.equal(serialized.includes("PRIVATE_REASONING"), false);
    assert.equal(serialized.includes("PRIVATE_ARGUMENT"), false);
    assert.equal(serialized.includes("PRIVATE_OBSERVATION"), false);
    feed.close();
});

test("真实 SSE 端点输出单一会话协议事件，不保留第二条旧事件流", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-session-output-sse");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const events: BrowserGoalLiveEvent[] = [];
    const routes = createBrowserGoalRoutes({
        async list() { return []; },
        async read() { return undefined; },
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        session: {
            async create() { return { ok: false as const, error: "create_failed" as const }; },
            async submit() { return { ok: false as const, error: "session_unavailable" as const }; },
            async readInput() { return { ok: true as const, found: false as const }; },
            async readState() { return undefined; },
            async openEvents() {
                return {
                    ok: true as const,
                    feed: {
                        events: {
                            async *[Symbol.asyncIterator]() {
                                for (const event of events) yield event;
                            },
                        },
                        close() { /* no-op */ },
                    },
                };
            },
            async listMessages() { return { ok: true as const, messages: [], total: 0 }; },
            async readMessage() { return { ok: false as const, error: "message_not_found" as const }; },
        },
    });
    events.push({ type: "state_sync", goalId: goal.id, state: { goalId: goal.id, runId: goal.state.run.id, runStatus: "running", mode: "normal", commitRevision: 1, queueRevision: 0, queuePaused: false, pendingMessageCount: 0, pendingSteerCount: 0, needsRecovery: false, executionOwner: true, messages: { count: 0, recent: [] } } });
    const response = await routes.request(`http://localhost/api/goals/${goal.id}/events`);
    assert.equal(response.status, 200);
    const reader = response.body?.getReader();
    assert.ok(reader);
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    assert.match(text, /^event: update\ndata: /);
    assert.equal(text.includes("PRIVATE"), false);
});
