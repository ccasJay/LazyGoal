import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalSessionStream,
    projectGoalSessionState,
    type Goal,
    type GoalStore,
    type SessionOutputEvent,
} from "../src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import { currentProtocols } from "./current-fixtures";

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
        ...currentProtocols,
        id: goalId,
        runId,
        intent: "恢复会话输出",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
    });
}

function openStream(options: {
    readonly store: GoalStore;
    readonly publisher: InMemoryExecutionStreamPublisher;
    readonly goalId: string;
}): GoalSessionStream {
    return new GoalSessionStream({
        publisher: options.publisher,
        goalId: options.goalId,
        readState: async (target) => {
            const goal = await options.store.restore(target);
            return goal === undefined ? undefined : projectGoalSessionState({ goal, executionOwner: true });
        },
    });
}

async function drain(stream: GoalSessionStream): Promise<SessionOutputEvent[]> {
    const events: SessionOutputEvent[] = [];
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));
    stream.close();
    await consumed;
    return events;
}

test("重建订阅先给出一致状态与消息范围，不重放旧候选", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-reconnect");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const first = openStream({ store, publisher, goalId: goal.id });
    await new Promise((resolve) => setImmediate(resolve));
    first.close();

    // 断开期间保存了一条正式消息；重连后由状态范围表达，不重放旧预览。
    const saved: Goal = {
        ...goal,
        state: {
            ...goal.state,
            commitRevision: 5,
            messages: [...goal.state.messages, {
                role: "assistant",
                assistant: { profileId: "default" },
                content: "断线期间保存的答复",
                messageId: "msg-offline",
                runId: goal.state.run.id,
                position: { afterSequence: 0, order: 1 },
                purpose: "answer",
                source: { kind: "completion_candidate", candidateId: "candidate-offline" },
            }],
        },
    };
    await store.save(saved);

    const second = openStream({ store, publisher, goalId: goal.id });
    const events = await drain(second);
    assert.equal(events[0]?.type, "state_sync");
    const state = events[0]?.type === "state_sync" ? events[0].state : undefined;
    assert.equal(state?.messages.count, 2);
    assert.equal(state?.messages.throughMessageId, "msg-offline");
    assert.equal(state?.messages.recent.at(-1)?.sourceKind, "completion_candidate");
    // 未确认预览不跨连接重放。
    assert.equal(events.some((event) => event.type === "generation_event"), false);
});

test("末次通知丢失且没有新事件时，只读核对仍发现已提交消息", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-lost-notification");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const stream = openStream({ store, publisher, goalId: goal.id });
    const events: SessionOutputEvent[] = [];
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events[0]?.type, "state_sync");

    // 直接写快照但不发布任何实时通知：模拟末次提交通知丢失。
    const silent: Goal = {
        ...goal,
        state: {
            ...goal.state,
            commitRevision: 9,
            messages: [...goal.state.messages, {
                role: "assistant",
                assistant: { profileId: "default" },
                content: "通知丢失但已提交",
                messageId: "msg-lost",
                runId: goal.state.run.id,
                position: { afterSequence: 0, order: 1 },
                purpose: "answer",
                source: { kind: "completion_candidate", candidateId: "candidate-lost" },
            }],
        },
    };
    await store.save(silent);
    await stream.resync();
    await new Promise((resolve) => setImmediate(resolve));

    const committed = events.filter((event) => event.type === "message_committed");
    assert.equal(committed.length, 1);
    assert.equal(committed[0]?.type === "message_committed" ? committed[0].event.messageId : "", "msg-lost");
    assert.equal(committed[0]?.type === "message_committed" ? committed[0].event.previewId : "", "candidate-lost");
    // 读取故障不得被伪装成业务终态。
    assert.equal(events.some((event) => event.type === "state_sync" && event.state.runStatus === "cancelled"), false);
    stream.close();
    await consumed;
});

test("多个客户端看到同一消息身份与顺序，快速后继 Run 不覆盖当前 Run", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-multi-client");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const clientA = openStream({ store, publisher, goalId: goal.id });
    const clientB = openStream({ store, publisher, goalId: goal.id });
    const eventsA: SessionOutputEvent[] = [];
    const eventsB: SessionOutputEvent[] = [];
    const consumeA = (async () => { for await (const event of clientA) eventsA.push(event); })();
    const consumeB = (async () => { for await (const event of clientB) eventsB.push(event); })();
    await new Promise((resolve) => setImmediate(resolve));

    publisher.publish({
        goalId: goal.id,
        runId: "old-run",
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:old:0",
        payload: { blockIndex: 0, deltaKind: "text", delta: "旧 Run 片段" },
    });
    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:current:0",
        payload: { blockIndex: 0, deltaKind: "text", delta: "当前 Run 片段" },
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const textsA = eventsA
        .filter((event) => event.type === "generation_event")
        .map((event) => event.type === "generation_event" ? event.event.source.runId : "");
    const textsB = eventsB
        .filter((event) => event.type === "generation_event")
        .map((event) => event.type === "generation_event" ? event.event.source.runId : "");
    assert.deepEqual(textsA, [goal.state.run.id]);
    assert.deepEqual(textsB, textsA);
    assert.equal(JSON.stringify(eventsA).includes("旧 Run 片段"), false);

    clientA.close();
    clientB.close();
    await Promise.all([consumeA, consumeB]);
});

test("读取故障报告流故障，背压与发布端关闭都结束订阅且不伪造结果", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-fault-recovery");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    let failing = false;
    const stream = new GoalSessionStream({
        publisher,
        goalId: goal.id,
        readState: async (target) => {
            if (failing) throw new Error("simulated read failure");
            const current = await store.restore(target);
            return current === undefined ? undefined : projectGoalSessionState({ goal: current, executionOwner: true });
        },
    });
    const events: SessionOutputEvent[] = [];
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events[0]?.type, "state_sync");

    failing = true;
    await stream.resync();
    const faults = events.filter((event) => event.type === "stream_fault");
    assert.equal(faults.length, 1);
    assert.equal(faults[0]?.type === "stream_fault" ? faults[0].event.kind : "", "read_failed");
    assert.equal(events.some((event) => event.type === "state_sync" && event.state.runStatus === "cancelled"), false);

    publisher.closeGoal(goal.id, "publisher_closed");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stream.closed, true);
    assert.equal(stream.closeReason, "publisher_closed");
    await consumed;
});

test("缺失前缀的候选增量带位置，不会被当作完整回答", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-missing-prefix");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const stream = openStream({ store, publisher, goalId: goal.id });
    const events: SessionOutputEvent[] = [];
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));

    publisher.publish({
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "candidate_preview",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {
            candidateId: "candidate-gap",
            modelCallId: "call-gap",
            blockIndex: 0,
            text: "后半段",
            startOffset: 12,
            truncated: false,
            complete: false,
        },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const preview = events.find((event) => event.type === "generation_event");
    assert.equal(preview?.type === "generation_event" ? preview.event.kind : "", "candidate_preview");
    assert.equal(preview?.type === "generation_event" && preview.event.kind === "candidate_preview"
        ? preview.event.startOffset
        : -1, 12);
    assert.equal(preview?.type === "generation_event" && preview.event.kind === "candidate_preview"
        ? preview.event.complete
        : true, false);
    stream.close();
    await consumed;
});

test("乱序完成的同步读取不撤回已显示的 Run 与状态", async () => {
    const store = new MemoryStore();
    const base = goalFor("goal-sync-order", "run-a");
    await store.save(base);
    const publisher = new InMemoryExecutionStreamPublisher();
    const pending: Array<(state: ReturnType<typeof projectGoalSessionState> | undefined) => void> = [];
    const stream = new GoalSessionStream({
        publisher,
        goalId: base.id,
        readState: () => new Promise((resolve) => { pending.push(resolve); }),
    });
    const events: SessionOutputEvent[] = [];
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();

    const variant = (revision: number, runId: string): ReturnType<typeof projectGoalSessionState> => projectGoalSessionState({
        goal: {
            ...base,
            state: { ...base.state, commitRevision: revision, run: { ...base.state.run, id: runId } },
        },
        executionOwner: true,
    });
    const baseline = variant(4, "run-a");
    const newer = variant(9, "run-c");
    const older = variant(5, "run-b");

    // 初始读取在途时，两次并发核对已各自开始读取。
    const firstCheck = stream.resync();
    const secondCheck = stream.resync();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(pending.length, 3);
    pending[0]!(baseline);
    await new Promise((resolve) => setImmediate(resolve));

    // 较新的读取先完成，较旧的读取晚到。
    pending[2]!(newer);
    await new Promise((resolve) => setImmediate(resolve));
    pending[1]!(older);
    await Promise.all([firstCheck, secondCheck]);
    await new Promise((resolve) => setImmediate(resolve));

    const syncs = events.filter((event) => event.type === "state_sync");
    assert.deepEqual(
        syncs.map((event) => event.type === "state_sync" ? [event.state.runId, event.state.commitRevision] : []),
        [["run-a", 4], ["run-c", 9]],
    );

    // 旧快照不能把观察身份切回前一 Run：迟到的 run-b 增量仍被过滤。
    publisher.publish({
        goalId: base.id,
        runId: "run-c",
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:current",
        payload: { modelCallId: "call-current", deltaKind: "text", delta: "当前片段" },
    });
    publisher.publish({
        goalId: base.id,
        runId: "run-b",
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:superseded",
        payload: { modelCallId: "call-superseded", deltaKind: "text", delta: "已撤回片段" },
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
        events.filter((event) => event.type === "generation_event")
            .map((event) => event.type === "generation_event" ? event.event.source.runId : ""),
        ["run-c"],
    );

    stream.close();
    await consumed;
});
