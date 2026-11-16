import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    CheckpointGateGoalStore,
    ManagedResourceRegistry,
    RuntimeLifecycle,
    RuntimeLifecycleIncompleteError,
    type LifecycleClock,
    type ManagedResource,
} from "../../../packages/runtime/src/index";
import { InMemoryGoalStore, JsonFileProcessSessionStore } from "../../../packages/storage/src/index";
import { ProcessManager } from "../../../packages/process-runtime/src/index";
import {
    ProcessStartTool,
    ProcessReadTool,
} from "../../../packages/tools/src/index";
import {
    HostShutdownCoordinator,
    SHUTDOWN_EXIT_CODE,
    type ExitPort,
} from "../src/process-exit";
import { createCompositionRoot } from "../src/composition-root";

class RecordingExitPort implements ExitPort {
    readonly codes: number[] = [];

    exit(code: number): void {
        this.codes.push(code);
    }
}

class RejectingResource implements ManagedResource {
    closeCalls = 0;
    forceCloseCalls = 0;

    close(): Promise<void> {
        this.closeCalls += 1;
        return Promise.reject(new Error("resource refused to release"));
    }

    forceClose(): Promise<void> {
        this.forceCloseCalls += 1;
        return Promise.reject(new Error("resource refused forced release"));
    }
}

class FakeShutdownClock implements LifecycleClock {
    private currentTime = 1000;
    readonly scheduled: Array<{ readonly dueTime: number; readonly callback: () => void }> = [];

    now(): number {
        return this.currentTime;
    }

    setTimeout(callback: () => void, ms: number): () => void {
        const item = { dueTime: this.currentTime + ms, callback };
        this.scheduled.push(item);
        return () => {
            const index = this.scheduled.indexOf(item);
            if (index >= 0) this.scheduled.splice(index, 1);
        };
    }

    clearTimeout(cancel: () => void): void {
        cancel();
    }

    advance(ms: number): void {
        this.currentTime += ms;
        const due = this.scheduled.filter((entry) => entry.dueTime <= this.currentTime);
        for (const entry of due) {
            const index = this.scheduled.indexOf(entry);
            if (index >= 0) {
                this.scheduled.splice(index, 1);
                entry.callback();
            }
        }
    }
}

test("宿主正常关闭与强制关闭清理所有受管进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-lifecycle-"));
    try {
        const resources = new ManagedResourceRegistry();
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const manager = new ProcessManager({
            store,
            hostInstanceId: "host-1",
            resources,
        });

        const startTool = new ProcessStartTool(tmpDir, manager, { enableSeatbelt: false });
        const res = await startTool.execute({
            actionId: "act-long",
            context: { goalId: "goal-lc", runId: "run-1" },
            input: { command: "node -e 'setTimeout(() => {}, 10000);'" },
        });

        assert.equal(res.kind, "success");
        const processId = (res as any).output.processId;
        assert.equal(manager.getRunningCount("goal-lc"), 1);

        // 模拟优雅关闭
        await resources.closeAll();

        assert.equal(manager.getRunningCount("goal-lc"), 0);
        const finalSession = await store.getSession("goal-lc", processId);
        assert.ok(finalSession);
        assert.equal(finalSession.status, "stopped");
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("Goal 删除入口级联清理其进程目录与日志", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-lifecycle-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const manager = new ProcessManager({
            store,
            hostInstanceId: "host-1",
        });

        const startTool = new ProcessStartTool(tmpDir, manager, { enableSeatbelt: false });
        const res = await startTool.execute({
            actionId: "act-del",
            context: { goalId: "goal-to-delete", runId: "run-1" },
            input: { command: "node -e 'console.log(\"out\"); setTimeout(() => {}, 100);'" },
        });

        assert.equal(res.kind, "success");
        const processId = (res as any).output.processId;

        await manager.close();

        const existing = await store.getSession("goal-to-delete", processId);
        assert.ok(existing);

        // 调用 Goal 删除
        await store.deleteGoalSessions("goal-to-delete");

        const afterDel = await store.getSession("goal-to-delete", processId);
        assert.equal(afterDel, undefined);
        const list = await store.listSessions("goal-to-delete");
        assert.equal(list.length, 0);
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("宿主关闭结算实例后请求退出码 130，宿主进程继续运行", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const resources = new ManagedResourceRegistry();
    const exitPort = new RecordingExitPort();
    const lifecycle = new RuntimeLifecycle({
        checkpointStore: gate,
        resources,
        abortController: new AbortController(),
        clock: new FakeShutdownClock(),
    });
    const coordinator = new HostShutdownCoordinator({ lifecycle, exitPort });

    const first = coordinator.shutdown();
    const second = coordinator.shutdown();
    assert.strictEqual(first, second);
    await first;

    assert.equal(coordinator.isShuttingDown, true);
    assert.equal(lifecycle.state, "closed");
    assert.equal(gate.isFrozen, true);
    assert.deepEqual(exitPort.codes, [SHUTDOWN_EXIT_CODE]);

    // 退出请求由可注入 ExitPort 记录：宿主进程继续运行并完成剩余断言。
    await new Promise((resolve) => setImmediate(resolve));
});

test("宿主关闭并发清理应用资源：实例关闭失败仍关闭 HTTP 并请求退出码 130", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lg-host-shutdown-"));
    const exitPort = new RecordingExitPort();
    const adapter = {
        async generate(): Promise<never> {
            throw new Error("model must not be called");
        },
    };
    const root = await createCompositionRoot({
        cwd: workspace,
        dataDirectory: join(workspace, "data"),
        env: { LAZYGOAL_HOME: join(workspace, "home") },
        profile: { id: "host-shutdown", systemPrompt: "unused", instructions: [], toolIds: [] },
        adapter,
        exitPort,
    });
    try {
        const address = await root.httpService.start(0);
        const refusing = {
            close(): Promise<void> {
                return Promise.reject(new Error("resource refused to release"));
            },
            forceClose(): Promise<void> {
                return Promise.reject(new Error("resource refused forced release"));
            },
        };
        root.resources.register(refusing);

        const first = root.shutdownCoordinator.shutdown();
        const second = root.shutdownCoordinator.shutdown();
        assert.strictEqual(first, second);
        await assert.rejects(first, RuntimeLifecycleIncompleteError);

        assert.equal(root.lifecycle.state, "closing");
        assert.deepEqual(exitPort.codes, [SHUTDOWN_EXIT_CODE]);
        // 应用自有 HTTP 资源在实例关闭失败后仍被清理。
        await assert.rejects(fetch(`${address.origin}/goals/unknown/metrics`));
    } finally {
        await root.httpService.close().catch(() => undefined);
        await root.lifecycle.close().catch(() => undefined);
        await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("实例关闭不完整时仍请求宿主退出并保留类型化原因", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const resources = new ManagedResourceRegistry();
    const resource = new RejectingResource();
    resources.register(resource);
    const exitPort = new RecordingExitPort();
    const lifecycle = new RuntimeLifecycle({
        checkpointStore: gate,
        resources,
        abortController: new AbortController(),
        clock: new FakeShutdownClock(),
    });
    const coordinator = new HostShutdownCoordinator({ lifecycle, exitPort });

    await assert.rejects(coordinator.shutdown(), (error: unknown) => {
        assert.ok(error instanceof RuntimeLifecycleIncompleteError);
        assert.ok(error.reasons.some((reason) => reason.category === "resources"));
        return true;
    });

    assert.equal(resource.closeCalls, 1);
    assert.equal(resource.forceCloseCalls, 1);
    assert.equal(lifecycle.state, "closing");
    assert.deepEqual(exitPort.codes, [SHUTDOWN_EXIT_CODE]);
});

// ======================== 真实 ProcessManager × 真实 RuntimeLifecycle ========================

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

async function pathExists(path: string): Promise<boolean> {
    const { stat } = await import("node:fs/promises");
    return (await stat(path).catch(() => undefined)) !== undefined;
}

async function waitForPath(path: string): Promise<void> {
    await waitFor(() => pathExists(path).then((exists) => exists ? true : undefined), `路径 ${path}`);
}

/** 保持存活并写出标记的受管命令。 */
function managedProbe(markerPath: string): string {
    return `node -e 'require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "1"); setTimeout(() => {}, 15000);'`;
}

/** 在指定终态写入上插入等待点或故障的存储包装，其余操作委托真实文件 Store。 */
class DeferringProcessStore {
    private holdStatus: "stopped" | "exited" | undefined;
    private holdGate: Promise<void> | undefined;
    private holdRelease: (() => void) | undefined;
    private holdConsumed = false;
    private failStatus: "stopped" | "exited" | undefined;
    private failMessage = "";

    readonly saveStarted: string[] = [];

    constructor(private readonly inner: JsonFileProcessSessionStore) {}

    holdNextTerminal(status: "stopped" | "exited"): void {
        this.holdStatus = status;
        this.holdConsumed = false;
        this.holdGate = new Promise<void>((resolve) => {
            this.holdRelease = resolve;
        });
    }

    releaseTerminal(): void {
        this.holdRelease?.();
    }

    failNextTerminal(status: "stopped" | "exited", message: string): void {
        this.failStatus = status;
        this.failMessage = message;
    }

    async saveSession(session: Parameters<JsonFileProcessSessionStore["saveSession"]>[0]): Promise<void> {
        this.saveStarted.push(session.status);
        if (
            this.holdStatus !== undefined
            && session.status === this.holdStatus
            && !this.holdConsumed
        ) {
            this.holdConsumed = true;
            await this.holdGate;
        }
        if (this.failStatus !== undefined && session.status === this.failStatus) {
            this.failStatus = undefined;
            throw new Error(this.failMessage);
        }
        return this.inner.saveSession(session);
    }

    getSession(...args: Parameters<JsonFileProcessSessionStore["getSession"]>) {
        return this.inner.getSession(...args);
    }

    listSessions(...args: Parameters<JsonFileProcessSessionStore["listSessions"]>) {
        return this.inner.listSessions(...args);
    }

    appendOutput(...args: Parameters<JsonFileProcessSessionStore["appendOutput"]>) {
        return this.inner.appendOutput(...args);
    }

    readOutput(...args: Parameters<JsonFileProcessSessionStore["readOutput"]>) {
        return this.inner.readOutput(...args);
    }

    deleteGoalSessions(...args: Parameters<JsonFileProcessSessionStore["deleteGoalSessions"]>) {
        return this.inner.deleteGoalSessions(...args);
    }
}

/** 挂起 listSessions 的存储包装，用于制造未完成启动。 */
class BlockingListProcessStore {
    private gate: Promise<void> | undefined;
    private release: (() => void) | undefined;
    private consumed = false;

    constructor(private readonly inner: JsonFileProcessSessionStore) {}

    holdNextList(): void {
        this.consumed = false;
        this.gate = new Promise<void>((resolve) => {
            this.release = resolve;
        });
    }

    releaseList(): void {
        this.release?.();
    }

    async listSessions(...args: Parameters<JsonFileProcessSessionStore["listSessions"]>) {
        if (this.gate !== undefined && !this.consumed) {
            this.consumed = true;
            await this.gate;
        }
        return this.inner.listSessions(...args);
    }

    saveSession(...args: Parameters<JsonFileProcessSessionStore["saveSession"]>) {
        return this.inner.saveSession(...args);
    }

    getSession(...args: Parameters<JsonFileProcessSessionStore["getSession"]>) {
        return this.inner.getSession(...args);
    }

    appendOutput(...args: Parameters<JsonFileProcessSessionStore["appendOutput"]>) {
        return this.inner.appendOutput(...args);
    }

    readOutput(...args: Parameters<JsonFileProcessSessionStore["readOutput"]>) {
        return this.inner.readOutput(...args);
    }

    deleteGoalSessions(...args: Parameters<JsonFileProcessSessionStore["deleteGoalSessions"]>) {
        return this.inner.deleteGoalSessions(...args);
    }
}

test("真实 RuntimeLifecycle：正常期限内确认进程退出与输出写入，宿主继续运行", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-lifecycle-"));
    const marker = join(tmpDir, "normal-close.marker");
    try {
        const clock = new FakeShutdownClock();
        const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
        const resources = new ManagedResourceRegistry();
        const store = new JsonFileProcessSessionStore(tmpDir, "host-lifecycle");
        const manager = new ProcessManager({ store, hostInstanceId: "host-lifecycle", resources });
        const lifecycle = new RuntimeLifecycle({
            checkpointStore: gate,
            resources,
            abortController: new AbortController(),
            clock,
            gracePeriodMs: 2_000,
        });

        const started = await manager.startProcess({
            goalId: "goal-normal-close",
            command: `node -e 'process.stdout.write("before-close\\n"); require("node:fs").writeFileSync(${JSON.stringify(marker)}, "1"); setTimeout(() => {}, 15000);'`,
            cwd: tmpDir,
        });
        await waitForPath(marker);

        await lifecycle.close();
        assert.equal(lifecycle.state, "closed");
        // 正常期限未耗尽：完成信号先行取消了宽限定时器
        assert.equal(clock.scheduled.length, 0);
        assert.equal(manager.getTotalRunningCount(), 0);

        const record = await store.getSession("goal-normal-close", started.processId);
        assert.equal(record?.status, "stopped");
        assert.equal(typeof record?.exitedAt, "string");
        const output = await store.readOutput("goal-normal-close", started.processId, "stdout", 0);
        assert.match(output.text, /before-close/);

        // 宿主继续运行并输出成功标记
        const { execFileSync } = await import("node:child_process");
        const stdout = execFileSync(process.execPath, ["-e", "console.log('host-alive')"], { encoding: "utf8" });
        assert.match(stdout, /host-alive/);
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("真实 RuntimeLifecycle：终态写入阻塞时两个阶段期限生效并报告未结算", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-lifecycle-"));
    const marker = join(tmpDir, "blocked-write.marker");
    try {
        const clock = new FakeShutdownClock();
        const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
        const resources = new ManagedResourceRegistry();
        const inner = new JsonFileProcessSessionStore(tmpDir, "host-lifecycle");
        const store = new DeferringProcessStore(inner);
        const manager = new ProcessManager({ store, hostInstanceId: "host-lifecycle", resources });
        const lifecycle = new RuntimeLifecycle({
            checkpointStore: gate,
            resources,
            abortController: new AbortController(),
            clock,
            gracePeriodMs: 2_000,
        });

        store.holdNextTerminal("stopped");
        await manager.startProcess({
            goalId: "goal-blocked-write",
            command: managedProbe(marker),
            cwd: tmpDir,
        });
        await waitForPath(marker);

        const closePromise = lifecycle.close();
        // 进程真实退出并开始结算终态，但写入被挂起
        await waitFor(
            () => store.saveStarted.includes("stopped") ? true : undefined,
            "终态写入开始",
        );
        assert.equal(resources.size, 1);
        assert.equal(manager.getTotalRunningCount(), 1);

        // 正常阶段期限到期：升级强制终止仍无法绕过未结算写入
        await nextTick();
        assert.equal(clock.scheduled.length, 1);
        clock.advance(2_000);
        await nextTick();
        clock.advance(2_000);

        await assert.rejects(closePromise, (error: unknown) => {
            assert.ok(error instanceof RuntimeLifecycleIncompleteError);
            assert.ok(error.reasons.some((reason) => reason.category === "resources"));
            assert.match(
                error.reasons.map((reason) => reason.message).join("; "),
                /did not confirm release/,
            );
            return true;
        });
        // 未确认结算不报告 closed，实例保持 closing
        assert.equal(lifecycle.state, "closing");
        assert.equal(manager.getTotalRunningCount(), 1);

        // 迟到写入结算后管理器释放句柄；旧实例仍不可重新受理
        store.releaseTerminal();
        await waitFor(() => manager.getTotalRunningCount() === 0 ? true : undefined, "迟到结算");
        assert.equal((await inner.getSession("goal-blocked-write", (await inner.listSessions("goal-blocked-write"))[0]!.processId))?.status, "stopped");
        assert.equal(lifecycle.state, "closing");
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("真实 RuntimeLifecycle：管理器结算失败可见，借用资源与 Store 不被关闭", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-lifecycle-"));
    const marker = join(tmpDir, "failing-write.marker");
    try {
        const clock = new FakeShutdownClock();
        const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
        const resources = new ManagedResourceRegistry();
        const borrowedRegistry = new ManagedResourceRegistry();
        let borrowedCloseCalls = 0;
        borrowedRegistry.register({
            close: async () => {
                borrowedCloseCalls += 1;
            },
        });

        const inner = new JsonFileProcessSessionStore(tmpDir, "host-lifecycle");
        const store = new DeferringProcessStore(inner);
        const manager = new ProcessManager({ store, hostInstanceId: "host-lifecycle", resources });
        const lifecycle = new RuntimeLifecycle({
            checkpointStore: gate,
            resources,
            abortController: new AbortController(),
            clock,
            gracePeriodMs: 2_000,
        });

        store.failNextTerminal("stopped", "terminal record write failed");
        await manager.startProcess({
            goalId: "goal-failing-write",
            command: managedProbe(marker),
            cwd: tmpDir,
        });
        await waitForPath(marker);

        await assert.rejects(lifecycle.close(), (error: unknown) => {
            assert.ok(error instanceof RuntimeLifecycleIncompleteError);
            const messages = error.reasons
                .filter((reason) => reason.category === "resources")
                .map((reason) => reason.message)
                .join("; ");
            assert.match(messages, /graceful close failed/);
            assert.match(messages, /unreported settlement failure/);
            assert.match(messages, /terminal record write failed/);
            return true;
        });

        // 已知失败不因注册项移除或集合清空而消失：类型化原因保留在生命周期报告中
        assert.equal(lifecycle.state, "closing");
        // 管理器仍已释放进程句柄（记录写入失败不等于句柄未清理）
        assert.equal(manager.getTotalRunningCount(), 0);
        // 借用注册表与 Store 保持原所有权
        assert.equal(borrowedCloseCalls, 0);
        assert.equal(borrowedRegistry.size, 1);
        const sessions = await inner.listSessions("goal-failing-write");
        assert.equal(sessions.length, 1);
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test("真实 RuntimeLifecycle：关闭插入未完成启动，不产生新进程且期限后如实报告", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-lifecycle-"));
    const marker = join(tmpDir, "blocked-start.marker");
    try {
        const clock = new FakeShutdownClock();
        const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
        const resources = new ManagedResourceRegistry();
        const inner = new JsonFileProcessSessionStore(tmpDir, "host-lifecycle");
        const store = new BlockingListProcessStore(inner);
        const manager = new ProcessManager({ store, hostInstanceId: "host-lifecycle", resources });
        const lifecycle = new RuntimeLifecycle({
            checkpointStore: gate,
            resources,
            abortController: new AbortController(),
            clock,
            gracePeriodMs: 2_000,
        });

        store.holdNextList();
        const startPromise = manager.startProcess({
            goalId: "goal-blocked-start",
            command: managedProbe(marker),
            cwd: tmpDir,
        });
        // 已受理未结算的启动计入实例资源占用
        assert.equal(manager.getTotalRunningCount(), 1);

        const closePromise = lifecycle.close();
        await nextTick();
        clock.advance(2_000);
        await nextTick();
        clock.advance(2_000);

        await assert.rejects(closePromise, (error: unknown) => {
            assert.ok(error instanceof RuntimeLifecycleIncompleteError);
            assert.ok(error.reasons.some((reason) => reason.category === "resources"));
            return true;
        });

        // 释放 listSessions 后，启动在关闭边界被拒绝且没有创建进程
        store.releaseList();
        await assert.rejects(startPromise, /closing/);
        await waitFor(() => manager.getTotalRunningCount() === 0 ? true : undefined, "启动结算");
        assert.equal(await pathExists(marker), false);
        assert.equal(lifecycle.state, "closing");

        // 迟到拒绝被消费：生命周期返回同一失败结果，不报告 closed
        await assert.rejects(lifecycle.close(), RuntimeLifecycleIncompleteError);
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
