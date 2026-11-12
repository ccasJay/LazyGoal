import assert from "node:assert/strict";
import { test } from "node:test";
import { GitMutex } from "../src/git-runner";

function deferred() {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = () => resolvePromise();
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

function lockRecords(): Map<string, Promise<void>> {
    return Reflect.get(GitMutex, "locks") as Map<string, Promise<void>>;
}

test("GitMutex 对同一键按顺序执行并保持回调互斥", async () => {
    const key = "git-mutex-order";
    const firstGate = deferred();
    const secondGate = deferred();
    const firstStarted = deferred();
    const secondStarted = deferred();
    const thirdStarted = deferred();
    const order: string[] = [];
    let active = 0;
    let maximumActive = 0;

    const run = async (name: string, gate: ReturnType<typeof deferred>, started: ReturnType<typeof deferred>) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        order.push(name);
        started.resolve();
        await gate.promise;
        active -= 1;
    };

    const first = GitMutex.withLock(key, () => run("first", firstGate, firstStarted));
    const second = GitMutex.withLock(key, () => run("second", secondGate, secondStarted));
    const third = GitMutex.withLock(key, async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        order.push("third");
        thirdStarted.resolve();
        active -= 1;
    });

    await firstStarted.promise;
    firstGate.resolve();
    await secondStarted.promise;
    assert.deepEqual(order, ["first", "second"]);
    assert.equal(maximumActive, 1);

    secondGate.resolve();
    await thirdStarted.promise;
    await Promise.all([first, second, third]);
    assert.deepEqual(order, ["first", "second", "third"]);
    assert.equal(maximumActive, 1);
});

test("GitMutex 允许不同键并行并只回收已结算的键", async () => {
    const firstKey = "git-mutex-independent-a";
    const secondKey = "git-mutex-independent-b";
    const firstGate = deferred();
    const firstStarted = deferred();

    const first = GitMutex.withLock(firstKey, async () => {
        firstStarted.resolve();
        await firstGate.promise;
    });
    await firstStarted.promise;

    await GitMutex.withLock(secondKey, async () => undefined);
    assert.equal(lockRecords().has(firstKey), true);
    assert.equal(lockRecords().has(secondKey), false);

    firstGate.resolve();
    await first;
    assert.equal(lockRecords().has(firstKey), false);
});

test("GitMutex 在回调拒绝后保留原错误并继续执行等待者", async () => {
    const key = "git-mutex-rejection";
    const firstGate = deferred();
    const firstStarted = deferred();
    const order: string[] = [];
    const expectedError = new Error("first callback failed");

    const first = GitMutex.withLock(key, async () => {
        order.push("first");
        firstStarted.resolve();
        await firstGate.promise;
        throw expectedError;
    });
    const second = GitMutex.withLock(key, async () => {
        order.push("second");
        return "completed";
    });

    await firstStarted.promise;
    firstGate.resolve();

    await assert.rejects(first, (error) => error === expectedError);
    assert.equal(await second, "completed");
    assert.deepEqual(order, ["first", "second"]);
    assert.equal(lockRecords().has(key), false);
});

test("GitMutex 清理时保留当前队尾并将晚到请求排在队尾之后", async () => {
    const key = "git-mutex-tail-identity";
    const firstGate = deferred();
    const secondGate = deferred();
    const firstStarted = deferred();
    const secondStarted = deferred();
    const thirdStarted = deferred();
    const order: string[] = [];

    const first = GitMutex.withLock(key, async () => {
        order.push("first");
        firstStarted.resolve();
        await firstGate.promise;
    });
    await firstStarted.promise;

    const second = GitMutex.withLock(key, async () => {
        order.push("second");
        secondStarted.resolve();
        await secondGate.promise;
    });
    const secondTail = lockRecords().get(key);
    assert.ok(secondTail);

    firstGate.resolve();
    await secondStarted.promise;
    assert.equal(lockRecords().get(key), secondTail);

    const third = GitMutex.withLock(key, async () => {
        order.push("third");
        thirdStarted.resolve();
    });
    assert.notEqual(lockRecords().get(key), secondTail);
    assert.deepEqual(order, ["first", "second"]);

    secondGate.resolve();
    await thirdStarted.promise;
    await Promise.all([first, second, third]);
    assert.deepEqual(order, ["first", "second", "third"]);
    assert.equal(lockRecords().has(key), false);
});

test("GitMutex 成功或拒绝后回收空闲键并允许再次使用", async () => {
    const successfulKey = "git-mutex-idle-success";
    const rejectedKey = "git-mutex-idle-rejection";
    const expectedError = new Error("callback failed");

    assert.equal(await GitMutex.withLock(successfulKey, async () => "done"), "done");
    assert.equal(lockRecords().has(successfulKey), false);
    assert.equal(await GitMutex.withLock(successfulKey, async () => "again"), "again");
    assert.equal(lockRecords().has(successfulKey), false);

    await assert.rejects(
        GitMutex.withLock(rejectedKey, async () => {
            throw expectedError;
        }),
        (error) => error === expectedError,
    );
    assert.equal(lockRecords().has(rejectedKey), false);
    assert.equal(await GitMutex.withLock(rejectedKey, async () => "again"), "again");
    assert.equal(lockRecords().has(rejectedKey), false);
});
