import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
    ProcessOutputChannel,
    ProcessOutputChunk,
    ProcessSessionRecord,
    ProcessSessionStatus,
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
 * 可控进程存储：支持挂起指定状态的终态写入、注入保存失败，并记录保存顺序。
 */
class ControlledStore implements ProcessSessionStore {
    private static readonly instances: ControlledStore[] = [];

    /** 释放全部实例的等待点，保证断言失败时清理路径不会挂起。 */
    static releaseAllHolds(): void {
        for (const instance of ControlledStore.instances) {
            instance.releaseAllHolds();
        }
    }

    private readonly sessions = new Map<string, ProcessSessionRecord>();
    private readonly outputs = new Map<string, Buffer>();
    private readonly saveHolds: Array<{ readonly status: ProcessSessionStatus; readonly deferred: Deferred; consumed: boolean; released: boolean }> = [];
    private readonly saveFailures: Array<{ readonly status: ProcessSessionStatus; readonly error: Error }> = [];

    readonly saveStarted: ProcessSessionStatus[] = [];
    readonly saveCalls: ProcessSessionStatus[] = [];

    constructor() {
        ControlledStore.instances.push(this);
    }

    private sessionKey(goalId: string, processId: string): string {
        return `${goalId}:${processId}`;
    }

    private outputKey(goalId: string, processId: string, channel: ProcessOutputChannel): string {
        return `${goalId}:${processId}:${channel}`;
    }

    holdNextSave(status: ProcessSessionStatus): void {
        this.saveHolds.push({ status, deferred: new Deferred(), consumed: false, released: false });
    }

    releaseNextSave(status: ProcessSessionStatus): void {
        const hold = this.saveHolds.find((candidate) => candidate.status === status && !candidate.released);
        if (hold === undefined) {
            throw new Error(`没有等待中的 ${status} 保存`);
        }
        hold.released = true;
        hold.deferred.resolve();
    }

    failNextSave(status: ProcessSessionStatus, message: string): void {
        this.saveFailures.push({ status, error: new Error(message) });
    }

    /** 释放全部未结算的等待点，保证断言失败时清理路径不会挂起。 */
    releaseAllHolds(): void {
        for (const hold of this.saveHolds) {
            if (!hold.released) {
                hold.released = true;
                hold.deferred.resolve();
            }
        }
    }

    records(goalId: string): readonly ProcessSessionRecord[] {
        return [...this.sessions.values()].filter((record) => record.goalId === goalId);
    }

    async saveSession(session: ProcessSessionRecord): Promise<void> {
        this.saveStarted.push(session.status);
        const hold = this.saveHolds.find((candidate) => candidate.status === session.status && !candidate.consumed);
        if (hold !== undefined) {
            hold.consumed = true;
            await hold.deferred.promise;
        }
        const failureIndex = this.saveFailures.findIndex((failure) => failure.status === session.status);
        if (failureIndex >= 0) {
            const [failure] = this.saveFailures.splice(failureIndex, 1);
            throw failure!.error;
        }
        this.saveCalls.push(session.status);
        this.sessions.set(this.sessionKey(session.goalId, session.processId), { ...session });
    }

    async getSession(goalId: string, processId: string): Promise<ProcessSessionRecord | undefined> {
        return this.sessions.get(this.sessionKey(goalId, processId));
    }

    async listSessions(goalId: string): Promise<readonly ProcessSessionRecord[]> {
        return this.records(goalId);
    }

    async appendOutput(
        goalId: string,
        processId: string,
        channel: ProcessOutputChannel,
        text: string,
    ): Promise<void> {
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
        return { text: slice.toString("utf8"), nextCursor: start + slice.length, headCursor: 0, gap: false };
    }

    async deleteGoalSessions(goalId: string): Promise<void> {
        for (const key of [...this.sessions.keys()]) {
            if (key.startsWith(`${goalId}:`)) {
                this.sessions.delete(key);
            }
        }
    }
}

/** 轮询等待谓词返回非 undefined 值；超时抛出错误。 */
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

async function markerExists(markerPath: string): Promise<boolean> {
    return (await stat(markerPath).catch(() => undefined)) !== undefined;
}

async function waitForMarker(markerPath: string): Promise<void> {
    await waitFor(
        () => markerExists(markerPath).then((exists) => exists ? true : undefined),
        `进程标记 ${markerPath}`,
    );
}

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
        ControlledStore.releaseAllHolds();
        EventEmitter.prototype.once = originalOnce;
        EventEmitter.prototype.off = originalOff;
    }

    assert.equal(added, removed, `监听器未全部释放：注册 ${added}，注销 ${removed}`);
}

/** 保持存活的受管命令，写出标记以证明真实执行。 */
function longCommand(markerPath: string): string {
    return `node -e 'require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "1"); setTimeout(() => {}, 15000);'`;
}

/** 忽略 SIGTERM 的受管命令，只有升级信号能终止。 */
function sigtermTolerantCommand(markerPath: string): string {
    return `node -e 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "1"); setTimeout(() => {}, 15000);'`;
}

test("stop 确认真实退出与终态结算，重复停止不重复终态", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    const marker = join(tmpDir, "stop.marker");
    try {
        const started = await manager.startProcess({
            goalId: "goal-stop",
            command: longCommand(marker),
            cwd: tmpDir,
        });
        await waitForMarker(marker);

        const stopped = await manager.stopProcess("goal-stop", started.processId);
        assert.equal(stopped.status, "stopped");
        assert.equal(stopped.signal, "SIGTERM");
        assert.equal(stopped.exitCode, null);
        assert.equal(manager.getTotalRunningCount(), 0);
        assert.equal(store.records("goal-stop")[0]?.status, "stopped");
        assert.equal(store.saveCalls.filter((status) => status === "stopped").length, 1);

        // 重复停止返回同一结算结果，不重复写终态
        const again = await manager.stopProcess("goal-stop", started.processId);
        assert.equal(again.status, "stopped");
        assert.equal(store.saveCalls.filter((status) => status === "stopped").length, 1);

        await manager.close();
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("停止等待窗口到期仍未确认结算时失败并保留未确认状态", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    const marker = join(tmpDir, "unconfirmed.marker");
    try {
        store.holdNextSave("stopped");
        const started = await manager.startProcess({
            goalId: "goal-stop-unconfirmed",
            command: longCommand(marker),
            cwd: tmpDir,
        });
        await waitForMarker(marker);

        await assert.rejects(manager.stopProcess("goal-stop-unconfirmed", started.processId), (error: unknown) => {
            assert.equal(error instanceof ProcessSessionError, true);
            const failure = error as ProcessSessionError;
            assert.equal(failure.stage, "stop");
            assert.equal(failure.unconfirmed, "settlement");
            assert.equal(failure.goalId, "goal-stop-unconfirmed");
            assert.equal(failure.processId, started.processId);
            return true;
        });

        // 未确认状态保留：会话仍被拥有，记录不得被当作已确认停止
        assert.equal(manager.getTotalRunningCount(), 1);
        assert.notEqual(store.records("goal-stop-unconfirmed")[0]?.status, "stopped");

        store.releaseNextSave("stopped");
        await waitFor(
            () => store.records("goal-stop-unconfirmed")[0]?.status === "stopped" ? true : undefined,
            "迟到结算",
        );
        await waitFor(() => manager.getTotalRunningCount() === 0 ? true : undefined, "会话释放");
        const finalRecord = await manager.stopProcess("goal-stop-unconfirmed", started.processId);
        assert.equal(finalRecord.status, "stopped");
        await manager.close();
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("历史记录不授予杀进程权，也不重写终态", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    try {
        await store.saveSession({
            goalId: "goal-history",
            processId: "proc-history",
            command: "sleep 100",
            status: "running",
            hostInstanceId: "other-host",
            startedAt: new Date().toISOString(),
        });
        const writesBefore = store.saveCalls.length;

        const record = await manager.stopProcess("goal-history", "proc-history");
        assert.equal(record.status, "running");
        assert.equal(store.saveCalls.length, writesBefore);
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledStore.releaseAllHolds();
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("close 同步拒绝新启动、重复调用复用清理并释放在途资源", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    const marker = join(tmpDir, "close.marker");
    const lateMarker = join(tmpDir, "late.marker");
    try {
        const started = await manager.startProcess({
            goalId: "goal-close",
            command: longCommand(marker),
            cwd: tmpDir,
        });
        await waitForMarker(marker);

        const timeoutsBefore = activeTimeouts();
        const closePromise = manager.close();
        await assert.rejects(
            manager.startProcess({ goalId: "goal-close", command: longCommand(lateMarker), cwd: tmpDir }),
            /closing/,
        );
        assert.equal(await markerExists(lateMarker), false);

        await withEmitterAccounting(async () => {
            const repeated = manager.close();
            await Promise.all([closePromise, repeated]);
        });

        assert.equal(manager.getTotalRunningCount(), 0);
        assert.equal(store.records("goal-close")[0]?.status, "stopped");
        assert.equal(store.saveCalls.filter((status) => status === "stopped").length, 1);
        await nextTick();
        assert.equal(activeTimeouts() <= timeoutsBefore, true);
        assert.equal(started.processId.length > 0, true);
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("close 汇总未报告结算失败，同时继续清理其它自有进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    const markerOne = join(tmpDir, "fail-1.marker");
    const markerTwo = join(tmpDir, "fail-2.marker");
    try {
        await manager.startProcess({ goalId: "goal-fail-1", command: longCommand(markerOne), cwd: tmpDir });
        await manager.startProcess({ goalId: "goal-fail-2", command: longCommand(markerTwo), cwd: tmpDir });
        await Promise.all([waitForMarker(markerOne), waitForMarker(markerTwo)]);

        store.failNextSave("stopped", "terminal record write failed");
        await assert.rejects(manager.close(), (error: unknown) => {
            assert.equal(error instanceof ProcessSessionError, true);
            const failure = error as ProcessSessionError;
            assert.equal(failure.failures.length, 1);
            const entry = failure.failures[0]!;
            assert.equal(entry.stage, "settlement");
            assert.match(String(entry.reason), /terminal record write failed/);
            assert.equal(entry.goalId === "goal-fail-1" || entry.goalId === "goal-fail-2", true);
            return true;
        });

        // 两个句柄都收到终止信号并退出（终态写入均被尝试），全部会话释放
        assert.equal(store.saveStarted.filter((status) => status === "stopped").length, 2);
        assert.equal(manager.getTotalRunningCount(), 0);

        // 失败会话之外的进程仍然完整结算
        const settledGoals = ["goal-fail-1", "goal-fail-2"].filter(
            (goalId) => store.records(goalId)[0]?.status === "stopped",
        );
        assert.equal(settledGoals.length, 1);

        // 重复关闭复用同一失败报告，不重复写入
        const stoppedWrites = store.saveCalls.filter((status) => status === "stopped").length;
        await assert.rejects(manager.close(), /unreported settlement failure/);
        assert.equal(store.saveCalls.filter((status) => status === "stopped").length, stoppedWrites);
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("自然退出写入失败在关闭时仍可辨识", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    try {
        store.failNextSave("exited", "exit record write failed");
        await manager.startProcess({
            goalId: "goal-exit-fail",
            command: "node -e 'process.exit(0);'",
            cwd: tmpDir,
        });
        await waitFor(
            () => store.saveStarted.includes("exited") ? true : undefined,
            "退出写入尝试",
        );
        await waitFor(() => manager.getTotalRunningCount() === 0 ? true : undefined, "会话释放");

        await assert.rejects(manager.close(), (error: unknown) => {
            const failure = error as ProcessSessionError;
            assert.equal(failure.stage, "settlement");
            assert.equal(failure.failures.length, 1);
            assert.match(String(failure.failures[0]?.reason), /exit record write failed/);
            return true;
        });
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("forceClose 直接调用立即升级终止忽略 SIGTERM 的进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    const marker = join(tmpDir, "force.marker");
    try {
        const started = await manager.startProcess({
            goalId: "goal-force",
            command: sigtermTolerantCommand(marker),
            cwd: tmpDir,
        });
        await waitForMarker(marker);

        await manager.forceClose();
        const record = store.records("goal-force")[0];
        assert.equal(record?.processId, started.processId);
        assert.equal(record?.status, "stopped");
        assert.equal(record?.signal, "SIGKILL");
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("close 等待期间 forceClose 立即升级终止", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    const marker = join(tmpDir, "upgrade.marker");
    try {
        await manager.startProcess({
            goalId: "goal-upgrade",
            command: sigtermTolerantCommand(marker),
            cwd: tmpDir,
        });
        await waitForMarker(marker);

        const closePromise = manager.close();
        await nextTick();
        // 正常关闭的 SIGTERM 被忽略，宽限窗口尚未到期
        assert.equal(manager.getTotalRunningCount(), 1);
        assert.equal(store.saveCalls.includes("stopped"), false);

        const forcePromise = manager.forceClose();
        await waitFor(
            () => store.saveStarted.includes("stopped") ? true : undefined,
            "强制升级后的终态结算",
            1_000,
        );
        await Promise.all([closePromise, forcePromise]);

        assert.equal(store.records("goal-upgrade")[0]?.signal, "SIGKILL");
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("不响应 Store 不阻止强制终止并结算其它自有句柄", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const store = new ControlledStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-shutdown" });
    const markerOne = join(tmpDir, "blocked.marker");
    const markerTwo = join(tmpDir, "free.marker");
    try {
        await manager.startProcess({ goalId: "goal-blocked", command: longCommand(markerOne), cwd: tmpDir });
        await manager.startProcess({ goalId: "goal-free", command: longCommand(markerTwo), cwd: tmpDir });
        await Promise.all([waitForMarker(markerOne), waitForMarker(markerTwo)]);

        store.holdNextSave("stopped");
        const closePromise = manager.close();
        await waitFor(
            () => store.saveStarted.filter((status) => status === "stopped").length === 2 ? true : undefined,
            "两个终态写入开始",
        );
        // 一个会话的写入被 Store 卡住，另一个仍完整结算
        await waitFor(() => manager.getTotalRunningCount() === 1 ? true : undefined, "仅保留被阻塞会话");
        const settledGoals = ["goal-blocked", "goal-free"].filter(
            (goalId) => store.records(goalId)[0]?.status === "stopped",
        );
        assert.equal(settledGoals.length, 1);

        store.releaseNextSave("stopped");
        await closePromise;
        assert.equal(manager.getTotalRunningCount(), 0);
        assert.equal(["goal-blocked", "goal-free"].filter(
            (goalId) => store.records(goalId)[0]?.status === "stopped",
        ).length, 2);
    } finally {
        ControlledStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("关闭不波及其它管理器的进程与借用 Store", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-shutdown-"));
    const storeA = new ControlledStore();
    const storeB = new ControlledStore();
    const managerA = new ProcessManager({ store: storeA, hostInstanceId: "host-a" });
    const managerB = new ProcessManager({ store: storeB, hostInstanceId: "host-b" });
    const markerA = join(tmpDir, "owner-a.marker");
    const markerB = join(tmpDir, "owner-b.marker");
    try {
        await managerA.startProcess({ goalId: "goal-a", command: longCommand(markerA), cwd: tmpDir });
        await managerB.startProcess({ goalId: "goal-b", command: longCommand(markerB), cwd: tmpDir });
        await Promise.all([waitForMarker(markerA), waitForMarker(markerB)]);
        const writesB = storeB.saveCalls.length;

        await managerA.close();

        assert.equal(managerA.getTotalRunningCount(), 0);
        assert.equal(managerB.getRunningCount("goal-b"), 1);
        assert.equal(storeB.records("goal-b")[0]?.status, "running");
        assert.equal(storeB.saveCalls.length, writesB);
        assert.deepEqual(storeB.records("goal-b").map((record) => record.status), ["running"]);

        await managerB.forceClose();
        assert.equal(managerB.getTotalRunningCount(), 0);
    } finally {
        ControlledStore.releaseAllHolds();
        await managerA.forceClose().catch(() => undefined);
        await managerB.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});
