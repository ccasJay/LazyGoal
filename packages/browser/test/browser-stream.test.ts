import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalSessionStream,
    projectGoalSessionState,
    projectInteractionView,
    readInteractionDetail,
    Session,
    type Goal,
    type GoalStore,
    type SessionHandlePort,
    type SessionOutputStream,
} from "../../runtime/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { LLMAdapter, LLMResponse, LLMStreamEvent } from "../../llm-core/src/index";
import { blockResponse } from "../../llm-core/test/response-fixtures";
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

/** 打开一个覆盖整个 Goal 的浏览器安全事件流。 */
function openFeed(store: GoalStore, publisher: InMemoryExecutionStreamPublisher, goalId: string) {
    const stream = new GoalSessionStream({
        publisher,
        goalId,
        readState: async (target) => {
            const goal = await store.restore(target);
            return goal === undefined ? undefined : projectGoalSessionState({ goal, executionOwner: true });
        },
    });
    const port: SessionHandlePort = {
        readSessionState: async (target) => {
            const goal = await store.restore(target);
            return goal === undefined ? undefined : projectGoalSessionState({ goal, executionOwner: true });
        },
        readSessionInteraction: async (target) => {
            const goal = await store.restore(target);
            return goal === undefined ? undefined : projectInteractionView(goal);
        },
        readSessionInteractionDetail: async (target, ref) => {
            const goal = await store.restore(target);
            return goal === undefined
                ? { ok: false, code: "INTERACTION_NOT_WAITING", message: `Goal "${target}" was not found` }
                : readInteractionDetail(goal, ref);
        },
        attachSessionInteractionHandlers: () => ({ ok: false, code: "HANDLER_CONFLICT", message: "unused" }),
        detachSessionInteractionHandlers: () => undefined,
        sendSessionInput: async () => ({ ok: false, code: "RUN_CONTROL_UNAVAILABLE", message: "unused" }),
        querySessionInput: async () => ({ ok: true, found: false }),
        openSessionEvents: () => stream,
        consumeSessionInputs: async () => ({ reason: "completed" }),
        detachSession: () => undefined,
    };
    let detached = false;
    const session = new Session(goalId, "session-stream-test", {
        ...port,
        detachSession: () => { detached = true; },
    });
    return {
        feed: createBrowserSessionFeed(session, stream),
        detached: () => detached,
    };
}

/** 读取若干条事件，直到观察到指定数量的公开活动；同步与刷新通知单独归类。 */
async function collectActivities(
    iterator: AsyncIterator<BrowserGoalLiveEvent>,
    observed: BrowserGoalLiveEvent[],
    expected: number,
): Promise<BrowserGoalLiveEvent[]> {
    const activities: BrowserGoalLiveEvent[] = [];
    while (activities.length < expected) {
        const next = await nextEvent(iterator);
        if (next.done === true) break;
        observed.push(next.value);
        if (next.value.type === "activity") activities.push(next.value);
    }
    return activities;
}

test("Goal 范围事件流先同步状态，再按白名单投影活动并覆盖后继 Run", async () => {
    const goal = goalFor("goal-stream-1");
    const store = new MemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    // 订阅建立前发布的旧 Run 暂时增量必须丢弃，不能重放为当前回复。
    publisher.publish({
        goalId: goal.id,
        runId: "old-run",
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:old:0",
        payload: { blockIndex: 0, deltaKind: "text", delta: "旧 Run" },
    });
    const opened = openFeed(store, publisher, goal.id);
    const iterator = opened.feed.events[Symbol.asyncIterator]();

    const sync = (await nextEvent(iterator)).value;
    assert.equal(sync?.type, "state_sync");
    assert.equal(sync?.type === "state_sync" ? sync.state.runId : undefined, goal.state.run.id);
    assert.equal(sync?.type === "state_sync" ? sync.state.commitRevision : undefined, 0);
    const observed: BrowserGoalLiveEvent[] = [sync!];

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "model_block_delta",
        visibility: "restricted",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:step:2",
        payload: { blockIndex: 2, deltaKind: "reasoning", delta: "private reasoning" },
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
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:step:0",
        payload: { blockIndex: 0, deltaKind: "text", delta: "x".repeat(2_500), thought: "do not leak" },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "model_block_delta",
        visibility: "diagnostic",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:step:1",
        payload: { blockIndex: 1, deltaKind: "text", delta: '{"result":"private"}' },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "model_block_completed",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { blockIndex: 0, blockType: "text", delivery: "whole", format: "plain", text: "整块正文" },
    });
    const activities = await collectActivities(iterator, observed, 2);
    assert.deepEqual(activities, [{
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
    }, {
        // 诊断 JSON 增量不产生公开活动；整块交付只呈现一次正文。
        type: "activity",
        goalId: goal.id,
        runId: goal.state.run.id,
        activity: {
            kind: "assistant_text_delta",
            text: "整块正文",
            truncated: false,
            sourceEventId: "event-6",
            sourceCursor: 6,
        },
    }]);
    assert.equal(JSON.stringify(observed).includes("旧 Run"), false);

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

    // 后继 Run 的公开活动仍由同一个 Goal 订阅覆盖，不关闭、不遗漏。
    publisher.publish({
        goalId: goal.id,
        runId: "run-2",
        kind: "model_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    assert.deepEqual((await nextEvent(iterator)).value, {
        type: "activity",
        goalId: goal.id,
        runId: "run-2",
        activity: { kind: "model_started" },
    });

    publisher.closeGoal(goal.id, "publisher_closed");
    while (true) {
        const next = await nextEvent(iterator);
        if (next.done === true) break;
        observed.push(next.value);
    }
    assert.equal(observed.some((event) => event.type === "refresh_required"), true);
});

test("实时工具活动携带独立来源身份并仅投影白名单输入摘要", async () => {
    const goal = goalFor("goal-stream-tools");
    const store = new MemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const opened = openFeed(store, publisher, goal.id);
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
    assert.equal(opened.detached(), true);
});

test("实时公开回复、等待、阶段、终态、失败与未知活动映射为分组边界", async () => {
    const goal = goalFor("goal-stream-boundaries");
    const store = new MemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const opened = openFeed(store, publisher, goal.id);
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

test("事件缺口与同步读取失败都只要求刷新，不伪装运行终态", async () => {
    const goal = goalFor("goal-stream-2");
    const store = new MemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const opened = openFeed(store, publisher, goal.id);
    const iterator = opened.feed.events[Symbol.asyncIterator]();
    await nextEvent(iterator);

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "live_gap",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    // 发现缺口时重新读取最新 Snapshot，输出新的同步状态而不是猜测缺失增量。
    const resynced = (await nextEvent(iterator)).value;
    assert.equal(resynced?.type, "state_sync");
    assert.equal(resynced?.type === "state_sync" ? resynced.state.runId : undefined, goal.state.run.id);

    // 同步读取失败报告同步故障，不伪造 Run 终态。
    const missing = openFeed(store, publisher, "goal-absent");
    const missingIterator = missing.feed.events[Symbol.asyncIterator]();
    const event = (await nextEvent(missingIterator)).value;
    assert.deepEqual(event, { type: "refresh_required", goalId: "goal-absent" });
    missing.feed.close();
    opened.feed.close();
});

test("末次提交通知丢失后仍以权威读取结算等待，公开同步不含决定内容", async () => {
    const store = new MemoryStore();
    const publisher = new InMemoryExecutionStreamPublisher();
    const created = goalFor("goal-stream-settle");
    const waiting: Goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-settle-1",
                    mode: "execution",
                    questions: [{
                        id: "source",
                        header: "Choose a source",
                        question: "Which notes should I include?",
                        multiSelect: false,
                        options: [{ id: "approved", label: "Approved notes" }],
                    }],
                },
            },
        },
    };
    await store.save(waiting);
    const opened = openFeed(store, publisher, waiting.id);
    const iterator = opened.feed.events[Symbol.asyncIterator]();
    const sync = (await nextEvent(iterator)).value;
    assert.equal(sync?.type, "state_sync");
    assert.equal(sync?.type === "state_sync" ? sync.state.waitingFor : undefined, "ask_user");
    // 公开同步只包含等待种类，不镜像问题选项或任何答案内容。
    assert.equal(JSON.stringify(sync).includes("Approved notes"), false);
    assert.equal(JSON.stringify(sync).includes("optionIds"), false);

    // 其他客户端结算并提交：通知丢失，只有权威快照变化。
    const { pendingInteraction: _clearedInteraction, ...settledRun } = waiting.state.run;
    await store.save({
        ...waiting,
        state: { ...waiting.state, run: { ...settledRun, status: "completed" } },
    });
    publisher.publish({
        goalId: waiting.id,
        runId: waiting.state.run.id,
        kind: "live_gap",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    const resynced = (await nextEvent(iterator)).value;
    assert.equal(resynced?.type, "state_sync");
    assert.equal(resynced?.type === "state_sync" ? resynced.state.runStatus : undefined, "completed");
    assert.equal(resynced?.type === "state_sync" ? resynced.state.waitingFor : undefined, undefined);
    // 重新同步只报告真实等待已解除，不宣称工具已完成或镜像已提交内容。
    assert.equal(JSON.stringify(resynced).includes("Approved notes"), false);
    opened.feed.close();
});

test("HTTP 事件流是 Goal 范围事件，拒绝 run 绑定参数并在取消时清理订阅", async () => {
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
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        session: {
            async create() { return { ok: false as const, error: "create_failed" as const }; },
            async submit() { return { ok: false as const, error: "session_unavailable" as const }; },
            async readInput() { return { ok: true as const, found: false as const }; },
            async readState() { return undefined; },
            async openEvents(goalId: string) {
                if (goalId !== "goal-stream-3") return { ok: false as const, error: "goal_not_found" as const };
                return {
                    ok: true as const,
                    feed: {
                        events: {
                            async *[Symbol.asyncIterator]() {
                                for (const event of events) yield event;
                            },
                        },
                        close() { closeCalls += 1; },
                    },
                };
            },
        },
    });

    const bound = await routes.request("http://localhost/api/goals/goal-stream-3/events?runId=run-1");
    assert.equal(bound.status, 400);
    const missing = await routes.request("http://localhost/api/goals/goal-not-found/events");
    assert.equal(missing.status, 404);

    const response = await routes.request("http://localhost/api/goals/goal-stream-3/events");
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

test("真实模型调用链下的浏览器活动只包含公开正文与调用提示", async () => {
    const goal = goalFor("goal-stream-real");
    const store = new MemoryStore();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const opened = openFeed(store, publisher, goal.id);
    const iterator = opened.feed.events[Symbol.asyncIterator]();
    await nextEvent(iterator);

    const PLAIN_MARKER = "PUBLIC_ANSWER";
    const JSON_MARKER = "PRIVATE_JSON";
    const ARGUMENT_MARKER = "PRIVATE_ARGUMENT";
    const REASONING_MARKER = "PRIVATE_REASONING";
    const METADATA_MARKER = "PRIVATE_METADATA";
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> { throw new Error("stream adapter must not call generate"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: PLAIN_MARKER };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: PLAIN_MARKER } };
            yield { kind: "content_block_started", index: 1, blockType: "text", delivery: "whole", format: "json" };
            yield { kind: "content_block_completed", delivery: "whole", block: { index: 1, type: "text", format: "json", text: `{"summary":"${JSON_MARKER}"}` } };
            yield { kind: "content_block_started", index: 2, blockType: "tool_call", delivery: "whole" };
            yield { kind: "content_block_completed", delivery: "whole", block: { index: 2, type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: `{"path":"${ARGUMENT_MARKER}"}` } };
            yield { kind: "content_block_started", index: 3, blockType: "reasoning", delivery: "whole" };
            yield { kind: "content_block_completed", delivery: "whole", block: { index: 3, type: "reasoning", text: REASONING_MARKER } };
            yield { kind: "completed", response: { ...blockResponse(
                { type: "text", text: PLAIN_MARKER },
                { type: "text", format: "json", text: `{"summary":"${JSON_MARKER}"}` },
                { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: `{"path":"${ARGUMENT_MARKER}"}` },
                { type: "reasoning", text: REASONING_MARKER },
            ), providerMetadata: { marker: METADATA_MARKER } } };
        },
    };

    const { callModel } = await import("../../model-call/src/index");
    await callModel({ adapter, executionStream: publisher }, {
        context: {
            goalId: goal.id, runId: goal.state.run.id, stepIndex: 1, modelId: "test-model",
            conversationMessages: [], sections: [],
        },
        request: { messages: [{ role: "user", content: "hi" }] },
        stage: "decide",
    });

    const activities: BrowserGoalLiveEvent[] = [];
    while (true) {
        const next = await nextEvent(iterator);
        if (next.done === true) break;
        activities.push(next.value);
        if (next.value.type === "activity" && next.value.activity.kind === "model_completed") break;
    }
    opened.feed.close();

    const projected = activities.filter((event): event is Extract<BrowserGoalLiveEvent, { type: "activity" }> => event.type === "activity");
    assert.deepEqual(projected.map(event => event.activity.kind), ["model_started", "assistant_text_delta", "model_completed"]);
    const text = projected.find(event => event.activity.kind === "assistant_text_delta");
    assert.equal(text?.activity.kind === "assistant_text_delta" ? text.activity.text : undefined, PLAIN_MARKER);
    for (const marker of [JSON_MARKER, ARGUMENT_MARKER, REASONING_MARKER, METADATA_MARKER]) {
        assert.equal(JSON.stringify(activities).includes(marker), false, marker);
    }
});
