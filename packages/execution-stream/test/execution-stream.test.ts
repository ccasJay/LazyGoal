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
        kind: "assistant_text_delta",
        visibility: "public" as const,
        durability: "live" as const,
        delivery: "delta" as const,
        coalescingKey: "assistant:step-1",
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

test("可见性和 reasoning 默认过滤", async () => {
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(ref);
    publisher.publish({
        ...ref,
        kind: "reasoning_delta",
        visibility: "restricted",
        durability: "live",
        delivery: "delta",
        coalescingKey: "reasoning:step-1",
        payload: { text: "secret" },
    });
    publisher.publish({
        ...ref,
        kind: "assistant_text_delta",
        visibility: "public",
        durability: "live",
        delivery: "delta",
        coalescingKey: "assistant:step-1",
        payload: { text: "visible" },
    });

    const event = await readOne(subscription);
    assert.equal(event.kind, "assistant_text_delta");
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
