import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileProcessSessionStore } from "../../storage/src/index";
import type {
    ProcessOutputChannel,
    ProcessOutputChunk,
    ProcessSessionRecord,
    ProcessSessionStore,
} from "../../runtime/src/index";
import { ProcessManager, ProcessSessionError } from "../src/index";

class Deferred {
    private resolveFn!: () => void;
    readonly promise = new Promise<void>((resolve) => {
        this.resolveFn = resolve;
    });

    resolve(): void {
        this.resolveFn();
    }
}

/**
 * 可控输出存储：按通道记录追加调用顺序，并可注入等待点与失败，用于验证写入结算语义。
 */
class OutputSessionStore implements ProcessSessionStore {
    private static readonly instances: OutputSessionStore[] = [];

    /** 释放全部实例的等待点，保证断言失败时清理路径不会挂起。 */
    static releaseAllHolds(): void {
        for (const instance of OutputSessionStore.instances) {
            instance.releaseAllHolds();
        }
    }

    private readonly sessions = new Map<string, ProcessSessionRecord>();
    private readonly outputs = new Map<string, Buffer>();
    private readonly holds: Array<{ readonly channel: ProcessOutputChannel; readonly deferred: Deferred; released: boolean }> = [];
    private readonly failures: Array<{ readonly channel: ProcessOutputChannel; readonly error: Error }> = [];

    readonly appendStarted: Array<{ readonly channel: ProcessOutputChannel; readonly text: string }> = [];

    constructor() {
        OutputSessionStore.instances.push(this);
    }

    private sessionKey(goalId: string, processId: string): string {
        return `${goalId}:${processId}`;
    }

    private outputKey(goalId: string, processId: string, channel: ProcessOutputChannel): string {
        return `${goalId}:${processId}:${channel}`;
    }

    holdNextAppend(channel: ProcessOutputChannel): void {
        this.holds.push({ channel, deferred: new Deferred(), released: false });
    }

    releaseNextAppend(channel: ProcessOutputChannel): void {
        const hold = this.holds.find((candidate) => candidate.channel === channel && !candidate.released);
        if (hold === undefined) {
            throw new Error(`没有等待中的 ${channel} 追加`);
        }
        hold.released = true;
        hold.deferred.resolve();
    }

    failNextAppend(channel: ProcessOutputChannel, message: string): void {
        this.failures.push({ channel, error: new Error(message) });
    }

    /** 释放全部未结算的等待点，保证断言失败时清理路径不会挂起。 */
    releaseAllHolds(): void {
        for (const hold of this.holds) {
            if (!hold.released) {
                hold.released = true;
                hold.deferred.resolve();
            }
        }
    }

    startedTexts(channel: ProcessOutputChannel): readonly string[] {
        return this.appendStarted.filter((entry) => entry.channel === channel).map((entry) => entry.text);
    }

    text(goalId: string, processId: string, channel: ProcessOutputChannel): string {
        return (this.outputs.get(this.outputKey(goalId, processId, channel)) ?? Buffer.alloc(0)).toString("utf8");
    }

    records(goalId: string): readonly ProcessSessionRecord[] {
        return [...this.sessions.values()].filter((record) => record.goalId === goalId);
    }

    async saveSession(session: ProcessSessionRecord): Promise<void> {
        this.sessions.set(this.sessionKey(session.goalId, session.processId), { ...session });
    }

    async getSession(goalId: string, processId: string): Promise<ProcessSessionRecord | undefined> {
        return this.sessions.get(this.sessionKey(goalId, processId));
    }

    async listSessions(goalId: string): Promise<readonly ProcessSessionRecord[]> {
        return [...this.sessions.values()].filter((record) => record.goalId === goalId);
    }

    async appendOutput(
        goalId: string,
        processId: string,
        channel: ProcessOutputChannel,
        text: string,
    ): Promise<void> {
        this.appendStarted.push({ channel, text });
        const hold = this.holds.find((candidate) => candidate.channel === channel && !candidate.released);
        if (hold !== undefined) {
            await hold.deferred.promise;
        }
        const failureIndex = this.failures.findIndex((failure) => failure.channel === channel);
        if (failureIndex >= 0) {
            const [failure] = this.failures.splice(failureIndex, 1);
            throw failure!.error;
        }
        const key = this.outputKey(goalId, processId, channel);
        this.outputs.set(
            key,
            Buffer.concat([this.outputs.get(key) ?? Buffer.alloc(0), Buffer.from(text, "utf8")]),
        );
    }

    async readOutput(
        goalId: string,
        processId: string,
        channel: ProcessOutputChannel,
        cursor = 0,
        maxBytes = 64 * 1024,
    ): Promise<ProcessOutputChunk> {
        const buffer = this.outputs.get(this.outputKey(goalId, processId, channel)) ?? Buffer.alloc(0);
        const start = Math.max(0, cursor);
        const slice = buffer.subarray(start, start + maxBytes);
        return {
            text: slice.toString("utf8"),
            nextCursor: start + slice.length,
            headCursor: 0,
            gap: false,
        };
    }

    async deleteGoalSessions(goalId: string): Promise<void> {
        for (const key of [...this.sessions.keys()]) {
            if (key.startsWith(`${goalId}:`)) {
                this.sessions.delete(key);
            }
        }
    }
}

/** 轮询等待谓词返回非 undefined 值；支持异步谓词；超时抛出错误。 */
async function waitFor<T>(
    probe: () => T | undefined | Promise<T | undefined>,
    description: string,
    timeoutMs = 5_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await probe();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() > deadline) {
            throw new Error(`等待条件超时：${description}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

async function nextTick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 当前进程活跃 Timeout 资源数，用于验证等待定时器被释放。 */
function activeTimeouts(): number {
    return process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
}

/** 记录管理器为 output/close 事件注册与注销的监听器数量。 */
async function withEmitterAccounting(run: () => Promise<void>): Promise<void> {
    const originalOnce = EventEmitter.prototype.once;
    const originalOff = EventEmitter.prototype.off;
    let added = 0;
    let removed = 0;
    EventEmitter.prototype.once = function (this: EventEmitter, event: string | symbol, listener: (...args: unknown[]) => void) {
        if (event === "output" || event === "close") added += 1;
        return originalOnce.call(this, event, listener);
    };
    EventEmitter.prototype.off = function (this: EventEmitter, event: string | symbol, listener: (...args: unknown[]) => void) {
        if (event === "output" || event === "close") removed += 1;
        return originalOff.call(this, event, listener);
    };

    try {
        await run();
    } finally {
        EventEmitter.prototype.once = originalOnce;
        EventEmitter.prototype.off = originalOff;
    }

    assert.equal(added, removed, `监听器未全部释放：注册 ${added}，注销 ${removed}`);
}

test("每通道按接收顺序串行追加，前序写入未结算时不越过", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    const store = new OutputSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-output" });
    try {
        store.holdNextAppend("stdout");
        const started = await manager.startProcess({
            goalId: "goal-order",
            command: "node -e 'process.stdout.write(\"out-a\\n\"); process.stdout.write(\"out-b\\n\");'",
            cwd: tmpDir,
        });

        // 进程退出意味着两段输出都已交付管理器，此时仍只有首个分片开始结算
        await waitFor(
            () => store.records("goal-order")[0]?.status === "exited" ? true : undefined,
            "进程退出",
        );
        assert.deepEqual(store.startedTexts("stdout"), ["out-a\n"]);

        store.releaseNextAppend("stdout");
        await waitFor(
            () => store.text("goal-order", started.processId, "stdout") === "out-a\nout-b\n" ? true : undefined,
            "stdout 顺序结算",
        );
        assert.deepEqual(store.startedTexts("stdout"), ["out-a\n", "out-b\n"]);
    } finally {
        OutputSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("stdout 与 stderr 各自独立结算，互不阻塞", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    const store = new OutputSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-output" });
    try {
        store.holdNextAppend("stderr");
        const started = await manager.startProcess({
            goalId: "goal-channels",
            command: "node -e 'process.stdout.write(\"only-out\\n\"); process.stderr.write(\"only-err\\n\"); setTimeout(() => {}, 15000);'",
            cwd: tmpDir,
        });

        // 两个通道的分片都已到达并各自开始结算
        await waitFor(
            () => store.startedTexts("stderr").length >= 1 ? true : undefined,
            "stderr 追加开始",
        );
        await waitFor(
            () => store.text("goal-channels", started.processId, "stdout") === "only-out\n" ? true : undefined,
            "stdout 独立结算",
        );
        assert.equal(store.text("goal-channels", started.processId, "stderr"), "");
        assert.deepEqual(store.startedTexts("stderr"), ["only-err\n"]);

        store.releaseNextAppend("stderr");
        await waitFor(
            () => store.text("goal-channels", started.processId, "stderr") === "only-err\n" ? true : undefined,
            "stderr 结算",
        );
    } finally {
        OutputSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("等待者只在写入结算后唤醒，超时唤醒不改变进程状态", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    const store = new OutputSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-output" });
    try {
        const started = await manager.startProcess({
            goalId: "goal-wait",
            command: "node -e 'setTimeout(() => { process.stdout.write(\"late-out\\n\"); }, 100); setTimeout(() => {}, 15000);'",
            cwd: tmpDir,
        });

        const timeoutsBefore = activeTimeouts();
        await withEmitterAccounting(async () => {
            let settled = false;
            const waitPromise = manager.waitForOutput("goal-wait", started.processId, 3_000).then(() => {
                settled = true;
            });
            await nextTick();
            // 尚未产生输出时不提前唤醒
            assert.equal(settled, false);
            await waitPromise;
        });
        assert.equal(activeTimeouts() <= timeoutsBefore, true);

        // 读取仍以 Store 为准
        const chunk = await store.readOutput("goal-wait", started.processId, "stdout", 0);
        assert.equal(chunk.text, "late-out\n");

        // 超时唤醒：进程保持运行，等待定时器被释放
        const timeoutBefore = activeTimeouts();
        await manager.waitForOutput("goal-wait", started.processId, 50);
        assert.equal(activeTimeouts() <= timeoutBefore, true);
        assert.equal(manager.getRunningCount("goal-wait"), 1);
        const record = await store.getSession("goal-wait", started.processId);
        assert.equal(record?.status, "running");
    } finally {
        OutputSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("进程退出与关闭都会唤醒等待者", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    const store = new OutputSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-output" });
    try {
        // 退出唤醒
        const quick = await manager.startProcess({
            goalId: "goal-exit-wait",
            command: "node -e 'setTimeout(() => {}, 100);'",
            cwd: tmpDir,
        });
        await manager.waitForOutput("goal-exit-wait", quick.processId, 3_000);
        await waitFor(
            () => store.records("goal-exit-wait")[0]?.status === "exited" ? true : undefined,
            "快速进程退出",
        );

        // 关闭唤醒
        const held = await manager.startProcess({
            goalId: "goal-close-wait",
            command: "node -e 'setTimeout(() => {}, 15000);'",
            cwd: tmpDir,
        });
        const waitPromise = manager.waitForOutput("goal-close-wait", held.processId, 30_000);
        await manager.close();
        await waitPromise;
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        OutputSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("进程退出后关闭仍等待已接收写入结算", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    const store = new OutputSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-output" });
    try {
        store.holdNextAppend("stdout");
        const started = await manager.startProcess({
            goalId: "goal-settle-exit",
            command: "node -e 'process.stdout.write(\"settle-me\\n\");'",
            cwd: tmpDir,
        });

        // 进程真实退出且终态记录已写入，但已接收的输出写入仍未结算
        await waitFor(
            () => store.records("goal-settle-exit")[0]?.status === "exited" ? true : undefined,
            "进程退出",
        );
        assert.equal(manager.getTotalRunningCount(), 1);

        let closed = false;
        const closePromise = manager.close().then(() => {
            closed = true;
        });
        await nextTick();
        assert.equal(closed, false);
        assert.equal(store.text("goal-settle-exit", started.processId, "stdout"), "");

        store.releaseNextAppend("stdout");
        await closePromise;
        assert.equal(closed, true);
        assert.equal(store.text("goal-settle-exit", started.processId, "stdout"), "settle-me\n");
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        OutputSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("关闭等待在途输出写入，不提前报告成功", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    const store = new OutputSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-output" });
    try {
        store.holdNextAppend("stdout");
        const started = await manager.startProcess({
            goalId: "goal-close-write",
            command: "node -e 'process.stdout.write(\"before-close\\n\"); setTimeout(() => {}, 15000);'",
            cwd: tmpDir,
        });
        await waitFor(
            () => store.startedTexts("stdout").length >= 1 ? true : undefined,
            "写入开始",
        );

        let closed = false;
        const closePromise = manager.close().then(() => {
            closed = true;
        });
        await nextTick();
        assert.equal(closed, false);

        store.releaseNextAppend("stdout");
        await closePromise;
        assert.equal(closed, true);
        assert.equal(store.text("goal-close-write", started.processId, "stdout"), "before-close\n");
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        OutputSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("追加失败不丢弃后续写入或终态结算，也不产生未处理拒绝", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    const store = new OutputSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-output" });
    try {
        store.failNextAppend("stdout", "append failed");
        const started = await manager.startProcess({
            goalId: "goal-append-fail",
            command: "node -e 'process.stdout.write(\"lost-line\\n\"); process.stdout.write(\"kept-line\\n\");'",
            cwd: tmpDir,
        });

        await waitFor(
            () => store.records("goal-append-fail")[0]?.status === "exited" ? true : undefined,
            "终态结算",
        );
        await waitFor(
            () => manager.getTotalRunningCount() === 0 ? true : undefined,
            "会话释放",
        );

        // 失败分片被丢弃，但后续写入与终态记录仍然结算
        assert.equal(store.text("goal-append-fail", started.processId, "stdout"), "kept-line\n");
        assert.equal((await store.getSession("goal-append-fail", started.processId))?.status, "exited");

        // 已知写入失败通过类型化错误报告，不被关闭吞掉
        await assert.rejects(manager.close(), (error: unknown) => {
            assert.equal(error instanceof ProcessSessionError, true);
            const failure = error as ProcessSessionError;
            assert.equal(failure.stage, "output");
            assert.equal(failure.failures.length, 1);
            assert.equal(failure.failures[0]?.processId, started.processId);
            assert.match(String(failure.failures[0]?.reason), /append failed/);
            return true;
        });
        // 重复关闭复用同一失败报告，不重复写入或重复结算
        await assert.rejects(manager.close(), /unreported settlement failure/);
    } finally {
        OutputSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("文件 Store 上按通道游标读取且不合并通道", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-output-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-file-output");
        const manager = new ProcessManager({ store, hostInstanceId: "host-file-output" });
        const started = await manager.startProcess({
            goalId: "goal-file-output",
            command: "node -e 'process.stdout.write(\"a1\\n\"); process.stderr.write(\"e1\\n\"); setTimeout(() => { process.stdout.write(\"a2\\n\"); }, 50); setTimeout(() => {}, 200);'",
            cwd: tmpDir,
        });

        await waitFor(
            () => store.getSession("goal-file-output", started.processId).then((record) => record?.status === "exited" ? true : undefined),
            "文件 Store 进程退出",
        );

        const first = await store.readOutput("goal-file-output", started.processId, "stdout", 0);
        assert.equal(first.text, "a1\na2\n");
        assert.equal(first.headCursor, 0);
        assert.equal(first.gap, false);
        const second = await store.readOutput("goal-file-output", started.processId, "stdout", first.nextCursor);
        assert.equal(second.text, "");
        assert.equal(second.nextCursor, first.nextCursor);

        const stderr = await store.readOutput("goal-file-output", started.processId, "stderr", 0);
        assert.equal(stderr.text, "e1\n");

        await manager.close();
    } finally {
        OutputSessionStore.releaseAllHolds();
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
});
