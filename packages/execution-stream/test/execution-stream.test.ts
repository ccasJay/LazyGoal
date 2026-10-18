import assert from "node:assert/strict";
import test from "node:test";

import {
    InMemoryExecutionStreamPublisher,
    type ExecutionStreamEvent,
} from "../src/index";

const ref = { goalId: "goal-1", runId: "run-1" };

function draft(overrides: Partial<Parameters<InMemoryExecutionStreamPublisher["publish"]>[0]> = {}) {
    return {
        ...ref,
        kind: "text_stream_delta",
        visibility: "public" as const,
        durability: "live" as const,
        delivery: "delta" as const,
        coalescingKey: "text:step-1",
        payload: { text: "hello" },
        ...overrides,
    };
}

async function readOne(subscription: AsyncIterable<ExecutionStreamEvent>): Promise<ExecutionStreamEvent> {
    const iterator = subscription[Symbol.asyncIterator]();
    const result = await iterator.next();
    assert.equal(result.done, false);
    return result.value;
}

test("按 Goal/Run 分配单调 cursor 并保持控制事件顺序", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref);

    publisher.publish(draft({ payload: { text: "a" } }));
    publisher.publish({
        ...ref,
        kind: "step_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { executionUnitId: "step-1" },
    });

    const first = await readOne(subscription);
    const second = await readOne(subscription);
    assert.equal(first.cursor, 1);
    assert.equal(second.cursor, 2);
    assert.equal(second.kind, "step_started");
});

test("连续文本增量在订阅队列中合并并保留 cursor 范围", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref, { maxQueueSize: 1 });

    publisher.publish(draft({ payload: { text: "a" } }));
    publisher.publish(draft({ payload: { text: "b" } }));

    const event = await readOne(subscription);
    assert.deepEqual(event.payload, { text: "ab" });
    assert.equal(event.cursor, 2);
    assert.equal(event.coalescedFrom, 1);
});

test("可见性默认过滤，受限内容须显式订阅", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref);
    publisher.publish({
        ...ref,
        kind: "model_block_delta",
        visibility: "restricted",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:call-1:1",
        payload: { deltaKind: "reasoning", delta: "secret" },
    });
    publisher.publish({
        ...ref,
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:call-1:0",
        payload: { deltaKind: "text", delta: "visible" },
    });

    const event = await readOne(subscription);
    assert.equal(event.kind, "model_block_delta");
    subscription.close();
});

test("慢订阅者无法保留控制事件时被关闭", () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref, { maxQueueSize: 1 });
    publisher.publish({
        ...ref,
        kind: "step_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { executionUnitId: "step-1" },
    });
    publisher.publish({
        ...ref,
        kind: "tool_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { toolId: "bash" },
    });
    assert.equal(subscription.closed, true);
    assert.equal(subscription.closeReason, "backpressure");
});

test("按 Goal/Run 隔离事件并支持 dispose", () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const first = publisher.subscribe(ref);
    const second = publisher.subscribe({ goalId: "goal-2", runId: "run-2" });
    publisher.publish(draft({ payload: { text: "only first" } }));
    publisher.dispose();
    assert.equal(first.closed, true);
    assert.equal(second.closed, true);
    assert.equal(first.closeReason, "publisher_closed");
});

test("晚加入的订阅者收到 live gap 通知并可用回调消费", () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    publisher.publish(draft({ payload: { text: "already happened" } }));
    const subscription = publisher.subscribe(ref);
    const events: string[] = [];
    const unsubscribe = subscription.onEvent((event) => events.push(event.kind));
    assert.deepEqual(events, ["live_gap"]);

    publisher.publish({
        ...ref,
        kind: "step_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    assert.deepEqual(events, ["live_gap", "step_started"]);
    unsubscribe();
    subscription.close();
    assert.equal(subscription.closed, true);
});

test("事件 Envelope 可安全 JSON 序列化", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref);
    publisher.publish({
        ...ref,
        executionUnitId: "step-1",
        actionId: "action-1",
        kind: "tool_finished",
        visibility: "public",
        durability: "trajectory",
        delivery: "control",
        payload: { output: ["ok", 1, true, null] },
    });
    const event = await readOne(subscription);
    const parsed = JSON.parse(JSON.stringify(event)) as typeof event;
    assert.deepEqual(parsed, event);
});

test("增量合并只连接同一块同一字段的增量，跨块与跨调用不合并", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref);
    const delta = (coalescingKey: string, payload: Record<string, string | number>) => draft({
        kind: "model_block_delta",
        delivery: "delta" as const,
        coalescingKey,
        payload,
    });

    publisher.publish(delta("model-block:call-1:0", { blockIndex: 0, deltaKind: "text", delta: "第一" }));
    publisher.publish(delta("model-block:call-1:0", { blockIndex: 0, deltaKind: "text", delta: "段" }));
    publisher.publish(delta("model-block:call-1:1", { blockIndex: 1, deltaKind: "text", delta: "第二块" }));
    publisher.publish(delta("model-block:call-2:0", { blockIndex: 0, deltaKind: "text", delta: "下一次调用" }));

    const first = await readOne(subscription);
    assert.equal(first.coalescedFrom, 1);
    assert.deepEqual(first.payload, { blockIndex: 0, deltaKind: "text", delta: "第一段" });
    assert.deepEqual((await readOne(subscription)).payload, { blockIndex: 1, deltaKind: "text", delta: "第二块" });
    assert.deepEqual((await readOne(subscription)).payload, { blockIndex: 0, deltaKind: "text", delta: "下一次调用" });
    subscription.close();
});

test("类型不同的增量与其它字段变化不参与合并", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref, { minimumVisibility: "diagnostic" });
    const delta = (payload: Record<string, string | number>) => draft({
        kind: "model_block_delta",
        visibility: "diagnostic" as const,
        delivery: "delta" as const,
        coalescingKey: "model-block:call-1:1",
        payload,
    });

    publisher.publish(delta({ blockIndex: 1, deltaKind: "tool_arguments", delta: '{"a"' }));
    publisher.publish(delta({ blockIndex: 1, deltaKind: "reasoning", delta: "not the same kind" }));
    publisher.publish(delta({ blockIndex: 1, deltaKind: "tool_arguments", delta: ":1}" }));

    const first = await readOne(subscription);
    assert.deepEqual(first.payload, { blockIndex: 1, deltaKind: "tool_arguments", delta: '{"a"' });
    assert.equal(first.coalescedFrom, undefined);
    assert.deepEqual((await readOne(subscription)).payload, { blockIndex: 1, deltaKind: "reasoning", delta: "not the same kind" });
    assert.deepEqual((await readOne(subscription)).payload, { blockIndex: 1, deltaKind: "tool_arguments", delta: ":1}" });
    subscription.close();
});

test("慢订阅者因背压关闭时不影响快订阅者与控制事件保留", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const slow = publisher.subscribe(ref, { maxQueueSize: 2 });
    const fast = publisher.subscribe(ref, { maxQueueSize: 32 });
    const fastPayloads: unknown[] = [];
    fast.onEvent(event => { fastPayloads.push(event.payload); });

    const delta = (text: string) => draft({
        kind: "model_block_delta",
        delivery: "delta" as const,
        coalescingKey: `model-block:call-1:${text}`,
        payload: { deltaKind: "text", delta: text },
    });
    for (const text of ["a", "b", "c", "d"]) publisher.publish(delta(text));
    publisher.publish({ ...ref, kind: "model_completed", visibility: "public", durability: "live", delivery: "control", payload: { hasToolCalls: false } });

    // 慢订阅者因背压关闭，快订阅者仍收到控制事件。
    assert.equal(slow.closed, true);
    assert.equal(fast.closed, false);
    assert.deepEqual(fastPayloads.at(-1), { hasToolCalls: false });
    assert.equal(fastPayloads.length, 5);
    slow.close();
    fast.close();
});

test("Goal 范围订阅覆盖后继 Run 且不合并跨 Run 的增量", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const goalSubscription = publisher.subscribeGoal("goal-scope", { maxQueueSize: 32 });
    const runSubscription = publisher.subscribe({ goalId: "goal-scope", runId: "run-1" }, { maxQueueSize: 32 });

    publisher.publish({
        goalId: "goal-scope",
        runId: "run-1",
        kind: "run_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    publisher.publish({
        goalId: "goal-scope",
        runId: "run-1",
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:call-1",
        payload: { deltaKind: "text", delta: "第一段" },
    });
    // 后继 Run 的事件同样进入 Goal 订阅，Run 仍是来源身份。
    publisher.publish({
        goalId: "goal-scope",
        runId: "run-2",
        kind: "run_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    publisher.publish({
        goalId: "goal-scope",
        runId: "run-2",
        kind: "model_block_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "model-block:call-1",
        payload: { deltaKind: "text", delta: "第二段" },
    });

    const goalEvents: Array<[string, string]> = [];
    goalSubscription.onEvent(event => { goalEvents.push([event.runId, event.kind]); });
    assert.deepEqual(goalEvents, [
        ["run-1", "run_started"],
        ["run-1", "model_block_delta"],
        ["run-2", "run_started"],
        ["run-2", "model_block_delta"],
    ]);
    // Run 范围订阅只看到自己的 Run，且没有被关闭。
    const runEvents: Array<[string, string]> = [];
    runSubscription.onEvent(event => { runEvents.push([event.runId, event.kind]); });
    assert.deepEqual(runEvents, [
        ["run-1", "run_started"],
        ["run-1", "model_block_delta"],
    ]);
    assert.equal(runSubscription.closed, false);

    publisher.closeGoal("goal-scope", "closed");
    assert.equal(goalSubscription.closed, true);
    assert.equal(runSubscription.closed, false);
    runSubscription.close();
    publisher.dispose();
});
