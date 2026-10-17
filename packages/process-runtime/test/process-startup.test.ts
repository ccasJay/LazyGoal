import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    ManagedResourceRegistry,
    type ProcessOutputChannel,
    type ProcessOutputChunk,
    type ProcessSessionRecord,
    type ProcessSessionStatus,
    type ProcessSessionStore,
} from "../../runtime/src/index";
import { ProcessManager } from "../src/index";

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
 * 可控进程存储：在 listSessions / 指定状态的保存之间插入等待点或故障，用于确定性地覆盖异步竞态。
 */
class ControlledProcessSessionStore implements ProcessSessionStore {
    private static readonly instances: ControlledProcessSessionStore[] = [];

    /** 释放全部实例的等待点，保证断言失败时清理路径不会挂起。 */
    static releaseAllHolds(): void {
        for (const instance of ControlledProcessSessionStore.instances) {
            instance.releaseAllHolds();
        }
    }

    private readonly sessions = new Map<string, ProcessSessionRecord>();
    private readonly outputs = new Map<string, Buffer>();
    private readonly saveHolds: Array<{ readonly status: ProcessSessionStatus; readonly deferred: Deferred; released: boolean }> = [];
    private readonly saveFailures: Array<{ readonly status: ProcessSessionStatus; readonly error: Error }> = [];
    private listHold: Deferred | undefined;

    readonly saveCalls: ProcessSessionStatus[] = [];
    readonly saveStarted: ProcessSessionStatus[] = [];
    listCalls = 0;

    constructor() {
        ControlledProcessSessionStore.instances.push(this);
    }

    private sessionKey(goalId: string, processId: string): string {
        return `${goalId}:${processId}`;
    }

    private outputKey(goalId: string, processId: string, channel: ProcessOutputChannel): string {
        return `${goalId}:${processId}:${channel}`;
    }

    seed(record: ProcessSessionRecord): void {
        this.sessions.set(this.sessionKey(record.goalId, record.processId), { ...record });
    }

    records(goalId: string): readonly ProcessSessionRecord[] {
        return [...this.sessions.values()].filter((record) => record.goalId === goalId);
    }

    holdList(): void {
        this.listHold = new Deferred();
    }

    releaseList(): void {
        const hold = this.listHold;
        this.listHold = undefined;
        hold?.resolve();
    }

    holdNextSave(status: ProcessSessionStatus): void {
        this.saveHolds.push({ status, deferred: new Deferred(), released: false });
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
        const listHold = this.listHold;
        this.listHold = undefined;
        listHold?.resolve();
    }

    async saveSession(session: ProcessSessionRecord): Promise<void> {
        this.saveStarted.push(session.status);
        const hold = this.saveHolds.find((candidate) => candidate.status === session.status && !candidate.released);
        if (hold !== undefined) {
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
        this.listCalls += 1;
        const hold = this.listHold;
        if (hold !== undefined) {
            await hold.promise;
        }
        return [...this.sessions.values()].filter((record) => record.goalId === goalId);
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

/** 生成写出标记文件后保持存活的受管命令。 */
function longCommand(markerPath: string): string {
    return `node -e 'require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "1"); setTimeout(() => {}, 15000);'`;
}

/** 生成写出标记文件后立即退出的受管命令。 */
function quickCommand(markerPath: string): string {
    return `node -e 'require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "1");'`;
}

async function markerExists(markerPath: string): Promise<boolean> {
    return (await stat(markerPath).catch(() => undefined)) !== undefined;
}

/** 等待真实命令写出标记文件，作为子进程确实执行的证据。 */
async function waitForMarker(markerPath: string): Promise<void> {
    await waitFor(
        () => markerExists(markerPath).then((exists) => exists ? true : undefined),
        `进程标记 ${markerPath}`,
    );
}

async function assertNoMarker(markerPath: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await markerExists(markerPath), false, `不应创建进程：${markerPath}`);
}

function seedRecord(goalId: string, processId: string): ProcessSessionRecord {
    return {
        goalId,
        processId,
        command: "echo seeded",
        status: "exited",
        hostInstanceId: "host-seed",
        startedAt: new Date(2026, 0, 1).toISOString(),
    };
}

test("并发受理按每 Goal 4 个额度预留，超出同步拒绝且不创建进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    try {
        store.holdList();
        const markers = Array.from({ length: 5 }, (_, index) => join(tmpDir, `goal-quota-${index}.marker`));
        const attempts = markers.map((marker) => manager.startProcess({
            goalId: "goal-quota",
            command: longCommand(marker),
            cwd: tmpDir,
        }).then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
        ));

        // 已受理未结算的启动同步计入额度；第 5 次在首次异步存储前被拒绝
        assert.equal(manager.getRunningCount("goal-quota"), 4);
        assert.equal(manager.getTotalRunningCount(), 4);
        const overflow = await attempts[4]!;
        assert.equal(overflow.ok, false);
        assert.match(String((overflow as { error: Error }).error.message), /reached concurrency limit/);

        store.releaseList();
        const settled = await Promise.all(attempts.slice(0, 4));
        assert.equal(settled.every((result) => result.ok), true);
        await Promise.all(markers.slice(0, 4).map((marker) => waitForMarker(marker)));

        assert.equal(await markerExists(markers[4]!), false);
        assert.equal(store.saveCalls.filter((status) => status === "starting").length, 4);
        assert.equal(store.saveCalls.filter((status) => status === "running").length, 4);
        assert.equal(store.records("goal-quota").length, 4);

        await manager.close();
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("并发受理跨 Goal 共享宿主 16 个额度，超出租用同步拒绝", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    try {
        store.holdList();
        const markers = Array.from({ length: 17 }, (_, index) => join(tmpDir, `host-quota-${index}.marker`));
        const attempts = markers.map((marker, index) => manager.startProcess({
            goalId: `goal-host-${Math.floor(index / 4)}`,
            command: longCommand(marker),
            cwd: tmpDir,
        }).then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
        ));

        assert.equal(manager.getTotalRunningCount(), 16);
        const overflow = await attempts[16]!;
        assert.equal(overflow.ok, false);
        assert.match(String((overflow as { error: Error }).error.message), /global concurrency limit/);

        store.releaseList();
        const settled = await Promise.all(attempts.slice(0, 16));
        assert.equal(settled.every((result) => result.ok), true);
        assert.equal(await markerExists(markers[16]!), false);

        await manager.close();
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("每 Goal 32 项历史上限在并发预留下不超发", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    try {
        for (let index = 0; index < 31; index += 1) {
            store.seed(seedRecord("goal-history", `proc-seed-${index}`));
        }

        store.holdList();
        const markers = [
            join(tmpDir, "history-0.marker"),
            join(tmpDir, "history-1.marker"),
        ];
        const attempts = markers.map((marker) => manager.startProcess({
            goalId: "goal-history",
            command: longCommand(marker),
            cwd: tmpDir,
        }).then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
        ));

        store.releaseList();
        const settled = await Promise.all(attempts);
        assert.equal(settled.filter((result) => result.ok).length, 1);
        const rejected = settled.filter((result) => !result.ok);
        assert.equal(rejected.length, 1);
        assert.match(String((rejected[0] as { error: Error }).error.message), /maximum session history limit/);

        // 已落盘 31 条 + 新受理 1 条 = 32 条，不超发
        assert.equal(store.records("goal-history").length, 32);
        assert.equal(manager.getTotalRunningCount(), 1);

        await manager.close();
        assert.equal(manager.getTotalRunningCount(), 0);
        assert.equal(store.records("goal-history").length, 32);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("已落盘会话不被未落盘预留重复计数", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    try {
        for (let index = 0; index < 28; index += 1) {
            store.seed(seedRecord("goal-history-2", `proc-seed-${index}`));
        }

        store.holdList();
        const markers = Array.from({ length: 4 }, (_, index) => join(tmpDir, `history-2-${index}.marker`));
        const attempts = markers.map((marker) => manager.startProcess({
            goalId: "goal-history-2",
            command: longCommand(marker),
            cwd: tmpDir,
        }).then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
        ));

        store.releaseList();
        const settled = await Promise.all(attempts);
        assert.equal(settled.every((result) => result.ok), true);
        assert.equal(store.records("goal-history-2").length, 32);
        assert.equal(store.saveCalls.filter((status) => status === "starting").length, 4);
        assert.equal(manager.getTotalRunningCount(), 4);

        await manager.close();
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("初始记录保存失败时拒绝启动且不创建进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    const marker = join(tmpDir, "initial-failure.marker");
    try {
        store.failNextSave("starting", "initial record write failed");
        await assert.rejects(
            manager.startProcess({ goalId: "goal-initial", command: longCommand(marker), cwd: tmpDir }),
            (error: unknown) => {
                assert.match(String((error as Error).message), /Failed to persist initial process record/);
                assert.equal((error as { stage?: string }).stage, "persistence");
                assert.equal(String((error as { cause?: unknown }).cause), "Error: initial record write failed");
                return true;
            },
        );

        await assertNoMarker(marker);
        assert.equal(manager.getTotalRunningCount(), 0);
        assert.equal(store.records("goal-initial").length, 0);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("创建进程失败时保存 failed 记录并保留原始故障与清理故障", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    try {
        await assert.rejects(
            manager.startProcess({
                goalId: "goal-spawn",
                command: "node -e 'console.log(1)'",
                cwd: join(tmpDir, "missing-directory"),
            }),
            /Failed to spawn process|ENOENT/,
        );

        const record = await waitFor(
            () => store.records("goal-spawn")[0],
            "failed 记录",
        );
        assert.equal(record?.status, "failed");
        assert.equal(String(record?.error).includes("ENOENT"), true);
        assert.equal(record?.exitCode, null);
        assert.equal(manager.getTotalRunningCount(), 0);

        // 保存 failed 记录失败时不覆盖原始故障
        const closing = new ControlledProcessSessionStore();
        const closingManager = new ProcessManager({ store: closing, hostInstanceId: "host-startup" });
        closing.holdNextSave("starting");
        const startPromise = closingManager.startProcess({
            goalId: "goal-closing",
            command: longCommand(join(tmpDir, "closing.marker")),
            cwd: tmpDir,
        });
        await waitFor(
            () => closing.saveStarted.includes("starting") ? true : undefined,
            "初始保存开始",
        );
        closing.failNextSave("failed", "failed record write failed");
        const closePromise = closingManager.close();
        closing.releaseNextSave("starting");

        await assert.rejects(startPromise, (error: unknown) => {
            assert.match(String((error as Error).message), /closing/);
            assert.equal((error as { stage?: string }).stage, "admission");
            assert.match(String((error as { cleanupError?: unknown }).cleanupError), /failed record write failed/);
            return true;
        });
        await closePromise;
        assert.equal(closing.records("goal-closing")[0]?.status, "starting");
        assert.equal(await markerExists(join(tmpDir, "closing.marker")), false);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("快速退出与迟到的 running 写入不会覆盖终态记录", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    const marker = join(tmpDir, "quick-exit.marker");
    try {
        store.holdNextSave("running");
        const startPromise = manager.startProcess({
            goalId: "goal-quick",
            command: quickCommand(marker),
            cwd: tmpDir,
        });
        await waitFor(
            () => store.saveStarted.includes("running") ? true : undefined,
            "running 保存开始",
        );
        await waitForMarker(marker);
        // 进程已经退出但 running 写入仍被挂起；管理器保留该次启动的结算所有权
        assert.equal(manager.getTotalRunningCount(), 1);

        store.releaseNextSave("running");
        const started = await startPromise;
        const record = await waitFor(
            () => store.records("goal-quick")[0]?.status === "exited"
                ? store.records("goal-quick")[0]
                : undefined,
            "exited 终态",
        );
        assert.equal(record?.exitCode, 0);
        assert.deepEqual(
            store.saveCalls.filter((status) => status === "running" || status === "exited"),
            ["running", "exited"],
        );
        assert.equal(started.processId, record?.processId);
        await waitFor(() => manager.getTotalRunningCount() === 0 ? true : undefined, "额度释放");
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("running 记录保存失败时仍终止已创建进程并如实报告", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    const marker = join(tmpDir, "running-failure.marker");
    try {
        store.holdNextSave("running");
        const startPromise = manager.startProcess({
            goalId: "goal-running",
            command: longCommand(marker),
            cwd: tmpDir,
        });
        await waitForMarker(marker);
        // 命令已真实执行后才注入 running 写入失败
        store.failNextSave("running", "running record write failed");
        store.releaseNextSave("running");

        await assert.rejects(
            startPromise,
            (error: unknown) => {
                assert.match(String((error as Error).message), /Failed to persist running process record/);
                assert.equal((error as { stage?: string }).stage, "persistence");
                return true;
            },
        );

        // 句柄仍被清理：终态记录结算后额度释放
        const record = await waitFor(
            () => store.records("goal-running")[0]?.status === "stopped"
                ? store.records("goal-running")[0]
                : undefined,
            "stopped 终态",
        );
        assert.equal(record?.exitCode, null);
        await waitFor(() => manager.getTotalRunningCount() === 0 ? true : undefined, "额度释放");
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("关闭插入未完成启动：列表与保存阶段均拒绝且不创建进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    const listMarker = join(tmpDir, "close-list.marker");
    try {
        // 关闭发生在 listSessions 期间
        store.holdList();
        const listStart = manager.startProcess({
            goalId: "goal-close-list",
            command: longCommand(listMarker),
            cwd: tmpDir,
        });
        const listClose = manager.close();
        store.releaseList();
        await assert.rejects(listStart, /closing/);
        await listClose;
        await assertNoMarker(listMarker);
        assert.equal(store.records("goal-close-list").length, 0);
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }

    // 关闭发生在初始保存期间
    const saveDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const saveStore = new ControlledProcessSessionStore();
    const saveManager = new ProcessManager({ store: saveStore, hostInstanceId: "host-startup" });
    const saveMarker = join(saveDir, "close-save.marker");
    try {
        saveStore.holdNextSave("starting");
        const saveStart = saveManager.startProcess({
            goalId: "goal-close-save",
            command: longCommand(saveMarker),
            cwd: saveDir,
        });
        await waitFor(
            () => saveStore.saveStarted.includes("starting") ? true : undefined,
            "初始保存开始",
        );
        const saveClose = saveManager.close();
        saveStore.releaseNextSave("starting");
        await assert.rejects(saveStart, /closing/);
        await saveClose;
        await assertNoMarker(saveMarker);
        assert.equal(saveStore.records("goal-close-save")[0]?.status, "failed");
        assert.equal(saveManager.getTotalRunningCount(), 0);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await saveManager.forceClose().catch(() => undefined);
        await rm(saveDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("关闭插入 running 保存：已创建进程被纳入同一次清理并如实结算", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const store = new ControlledProcessSessionStore();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup" });
    const marker = join(tmpDir, "close-running.marker");
    try {
        store.holdNextSave("running");
        const startPromise = manager.startProcess({
            goalId: "goal-close-running",
            command: longCommand(marker),
            cwd: tmpDir,
        });
        await waitForMarker(marker);

        const closePromise = manager.close();
        // close 等待期间升级强制终止同样可行
        const forcePromise = manager.forceClose();
        store.releaseNextSave("running");

        await assert.rejects(startPromise, /closing/);
        await closePromise;
        await forcePromise;

        const record = await waitFor(
            () => store.records("goal-close-running")[0]?.status === "stopped"
                ? store.records("goal-close-running")[0]
                : undefined,
            "stopped 终态",
        );
        assert.equal(record?.processId.startsWith("proc-"), true);
        assert.equal(manager.getTotalRunningCount(), 0);
        // 关闭后不再受理新启动，也不产生新的命令执行
        await assert.rejects(
            manager.startProcess({ goalId: "goal-close-running", command: quickCommand(join(tmpDir, "late.marker")), cwd: tmpDir }),
            /closing/,
        );
        assert.equal(await markerExists(join(tmpDir, "late.marker")), false);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await manager.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("注册表已关闭时装配或启动失败不留下无人管理进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-startup-"));
    const closedRegistry = new ManagedResourceRegistry();
    await closedRegistry.closeAll();
    assert.throws(
        () => new ProcessManager({
            store: new ControlledProcessSessionStore(),
            hostInstanceId: "host-startup",
            resources: closedRegistry,
        }),
        /Failed to register ProcessManager/,
    );

    const store = new ControlledProcessSessionStore();
    const registry = new ManagedResourceRegistry();
    const manager = new ProcessManager({ store, hostInstanceId: "host-startup", resources: registry });
    const marker = join(tmpDir, "registry.marker");
    try {
        await registry.closeAll();
        await assert.rejects(
            manager.startProcess({ goalId: "goal-registry", command: quickCommand(marker), cwd: tmpDir }),
            /closing/,
        );
        await assertNoMarker(marker);
        assert.equal(manager.getTotalRunningCount(), 0);
    } finally {
        ControlledProcessSessionStore.releaseAllHolds();
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});
