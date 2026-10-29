import assert from "node:assert/strict";
import { test } from "node:test";

import { KeyedSerialQueue } from "../src/keyed-serial-queue";

function deferred<T>(): {
    readonly promise: Promise<T>;
    readonly resolve: (value: T) => void;
    readonly reject: (reason: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

test("KeyedSerialQueue 在同一 key 上按提交顺序串行执行", async () => {
    const queue = new KeyedSerialQueue();
    const events: string[] = [];
    const gate = deferred<void>();

    const first = queue.run("goal-1", async () => {
        events.push("first:start");
        await gate.promise;
        events.push("first:end");
        return 1;
    });
    const second = queue.run("goal-1", async () => {
        events.push("second:start");
        return 2;
    });
    const third = queue.run("goal-1", async () => {
        events.push("third:start");
        return 3;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["first:start"]);
    gate.resolve();

    assert.deepEqual(await Promise.all([first, second, third]), [1, 2, 3]);
    assert.deepEqual(events, [
        "first:start",
        "first:end",
        "second:start",
        "third:start",
    ]);
});

test("KeyedSerialQueue 只拒绝失败操作本身并继续后续同 key 操作", async () => {
    const queue = new KeyedSerialQueue();

    const failed = queue.run("goal-1", async () => {
        throw new Error("expected failure");
    });
    const next = queue.run("goal-1", async () => "recovered");

    await assert.rejects(failed, /expected failure/);
    assert.equal(await next, "recovered");
});

test("KeyedSerialQueue 不在不同 key 之间互相阻塞", async () => {
    const queue = new KeyedSerialQueue();
    const slowGate = deferred<void>();
    const events: string[] = [];

    const slow = queue.run("goal-slow", async () => {
        events.push("slow:start");
        await slowGate.promise;
        events.push("slow:end");
    });
    const fast = queue.run("goal-fast", async () => {
        events.push("fast:start");
    });

    await fast;
    assert.deepEqual(events, ["slow:start", "fast:start"]);

    slowGate.resolve();
    await slow;
    assert.deepEqual(events, ["slow:start", "fast:start", "slow:end"]);
});

test("KeyedSerialQueue 结算后释放键簿记并支持 drain 读己之写", async () => {
    const queue = new KeyedSerialQueue();
    let stored: string | undefined;

    const write = queue.run("goal-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        stored = "written";
    });

    assert.equal(queue.pendingKeyCount, 1);
    await queue.drain("goal-1");
    assert.equal(stored, "written");

    await write;
    assert.equal(queue.pendingKeyCount, 0);
    await queue.drain("missing-key");
});

test("KeyedSerialQueue 的簿记不产生未处理拒绝", async () => {
    const queue = new KeyedSerialQueue();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
    };

    process.on("unhandledRejection", onUnhandled);

    try {
        const result = queue.run("goal-1", async () => {
            throw new Error("handled by caller");
        });

        await assert.rejects(result, /handled by caller/);
        await queue.drain("goal-1");
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(unhandled, []);
        assert.equal(queue.pendingKeyCount, 0);
    } finally {
        process.off("unhandledRejection", onUnhandled);
    }
});

test("KeyedSerialQueue 在失败簿记释放后仍接受同 key 新操作", async () => {
    const queue = new KeyedSerialQueue();

    await assert.rejects(
        queue.run("goal-1", async () => {
            throw new Error("first failure");
        }),
        /first failure/,
    );
    assert.equal(queue.pendingKeyCount, 0);
    assert.equal(await queue.run("goal-1", async () => "next"), "next");
});
