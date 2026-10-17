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
    type ProcessSessionStore,
} from "../../runtime/src/index";
import { JsonFileProcessSessionStore } from "../../storage/src/index";
import { ProcessManager } from "../src/index";

/**
 * 符合 ProcessSessionStore 契约的内存替身，用于验证存储替换不依赖具体文件实现。
 */
class InMemoryProcessSessionStore implements ProcessSessionStore {
    private readonly sessions = new Map<string, ProcessSessionRecord>();
    private readonly outputs = new Map<string, Buffer>();
    readonly deletedGoalIds: string[] = [];

    /** 已保存的会话记录数（含被覆盖的历史快照）。 */
    get savedSessionCount(): number {
        return this.sessions.size;
    }

    private sessionKey(goalId: string, processId: string): string {
        return `${goalId}:${processId}`;
    }

    private outputKey(goalId: string, processId: string, channel: ProcessOutputChannel): string {
        return `${goalId}:${processId}:${channel}`;
    }

    async saveSession(session: ProcessSessionRecord): Promise<void> {
        this.sessions.set(this.sessionKey(session.goalId, session.processId), { ...session });
    }

    async getSession(goalId: string, processId: string): Promise<ProcessSessionRecord | undefined> {
        return this.sessions.get(this.sessionKey(goalId, processId));
    }

    async listSessions(goalId: string): Promise<readonly ProcessSessionRecord[]> {
        return [...this.sessions.values()].filter((session) => session.goalId === goalId);
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
        return {
            text: slice.toString("utf8"),
            nextCursor: start + slice.length,
            headCursor: 0,
            gap: false,
        };
    }

    async deleteGoalSessions(goalId: string): Promise<void> {
        this.deletedGoalIds.push(goalId);
        for (const key of [...this.sessions.keys()]) {
            if (key.startsWith(`${goalId}:`)) {
                this.sessions.delete(key);
            }
        }
    }
}

/** 轮询等待谓词返回非 undefined 值；超时抛出错误。 */
async function waitFor<T>(
    probe: () => Promise<T | undefined>,
    timeoutMs = 5_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await probe();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() > deadline) {
            throw new Error("等待条件超时");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

test("经独立入口使用内存 Store 完成启动、等待输出、真实退出、停止与关闭", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-manager-"));
    const marker = join(tmpDir, "spawned.marker");
    let manager: ProcessManager | undefined;
    try {
        const store = new InMemoryProcessSessionStore();
        manager = new ProcessManager({ store, hostInstanceId: "host-memory" });

        // 构造不 spawn、不写存储
        assert.equal(manager.getTotalRunningCount(), 0);
        assert.equal(store.savedSessionCount, 0);
        assert.equal(await stat(marker).catch(() => undefined), undefined);

        const longRunning = await manager.startProcess({
            goalId: "goal-memory",
            command: `node -e 'require("node:fs").writeFileSync(${JSON.stringify(marker)}, "1"); setTimeout(() => {}, 15000);'`,
            cwd: tmpDir,
        });

        assert.match(longRunning.processId, /^proc-[0-9a-f]{8}$/);
        assert.equal(longRunning.status, "running");
        assert.equal(manager.getRunningCount("goal-memory"), 1);
        assert.equal(manager.getTotalRunningCount(), 1);

        // 命令标记证明真实子进程已经执行；running 记录已结算
        await waitFor(async () => (await stat(marker).catch(() => undefined)) !== undefined ? true : undefined);
        const runningRecord = await waitFor(async () => {
            const record = await store.getSession("goal-memory", longRunning.processId);
            return record?.status === "running" ? record : undefined;
        });
        assert.equal(runningRecord.hostInstanceId, "host-memory");

        // 等待输出唤醒：stdout 追加完成后才唤醒等待者
        const lateOutput = await manager.startProcess({
            goalId: "goal-memory",
            command: "node -e 'setTimeout(() => { console.log(\"late-tick\"); }, 100); setTimeout(() => {}, 15000);'",
            cwd: tmpDir,
        });
        await manager.waitForOutput("goal-memory", lateOutput.processId, 3_000);
        const chunk = await store.readOutput("goal-memory", lateOutput.processId, "stdout", 0);
        assert.match(chunk.text, /late-tick/);

        // 快速退出进程按真实退出结算并释放额度
        const quick = await manager.startProcess({
            goalId: "goal-memory",
            command: "node -e 'console.log(\"quick-out\");'",
            cwd: tmpDir,
        });
        const exitedRecord = await waitFor(async () => {
            const record = await store.getSession("goal-memory", quick.processId);
            return record?.status === "exited" ? record : undefined;
        });
        assert.equal(exitedRecord.exitCode, 0);
        assert.equal(manager.getRunningCount("goal-memory"), 2);

        // 显式停止确认退出并结算记录
        const stopped = await manager.stopProcess("goal-memory", longRunning.processId);
        assert.equal(stopped.status, "stopped");
        assert.equal(manager.getRunningCount("goal-memory"), 1);

        await manager.close();
        await manager.close();
        assert.equal(manager.getTotalRunningCount(), 0);

        // 借用 Store 未被关闭：关闭后仍可读写
        const lateSession: ProcessSessionRecord = {
            goalId: "goal-memory",
            processId: "proc-late",
            command: "echo late",
            status: "exited",
            hostInstanceId: "host-memory",
            startedAt: new Date().toISOString(),
        };
        await store.saveSession(lateSession);
        assert.equal((await store.getSession("goal-memory", "proc-late"))?.processId, "proc-late");
        assert.deepEqual(store.deletedGoalIds, []);
    } finally {
        // 独立于被测 close 的兜底清理：测试失败时仍终止本次拥有的进程
        await manager?.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("管理器不关闭借用的资源注册表与其它资源", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-manager-"));
    try {
        const resources = new ManagedResourceRegistry();
        let borrowedCloseCalls = 0;
        resources.register({
            close: async () => {
                borrowedCloseCalls += 1;
            },
            forceClose: async () => {
                borrowedCloseCalls += 1;
            },
        });

        const store = new InMemoryProcessSessionStore();
        const manager = new ProcessManager({ store, hostInstanceId: "host-borrow", resources });
        await manager.close();
        await manager.forceClose();

        // 管理器的关闭不波及借用资源
        assert.equal(borrowedCloseCalls, 0);
        assert.equal(store.deletedGoalIds.length, 0);

        // 测试自己拥有注册表与借用资源的关闭权
        await resources.closeAll();
        assert.equal(borrowedCloseCalls, 1);
        await resources.waitForIdle();
        assert.equal(resources.size, 0);
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("同一入口可替换为当前文件 Store 并观察记录与轮转日志", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-manager-"));
    let manager: ProcessManager | undefined;
    let nextManager: ProcessManager | undefined;
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-file");
        manager = new ProcessManager({ store, hostInstanceId: "host-file" });

        const started = await manager.startProcess({
            goalId: "goal-file",
            command: "node -e 'console.log(\"file-out\"); console.error(\"file-err\"); setTimeout(() => {}, 300);'",
            cwd: tmpDir,
        });
        await manager.waitForOutput("goal-file", started.processId, 3_000);

        const finalRecord = await waitFor(async () => {
            const record = await store.getSession("goal-file", started.processId);
            return record?.status === "exited" ? record : undefined;
        });
        assert.equal(finalRecord.exitCode, 0);

        const stdout = await store.readOutput("goal-file", started.processId, "stdout", 0);
        assert.match(stdout.text, /file-out/);
        const stderr = await store.readOutput("goal-file", started.processId, "stderr", 0);
        assert.match(stderr.text, /file-err/);

        await manager.close();
        assert.equal(manager.getTotalRunningCount(), 0);

        // 宿主与借用 Store 继续可用：同一 Store 交给新管理器仍能启动并结算
        nextManager = new ProcessManager({ store, hostInstanceId: "host-file" });
        const again = await nextManager.startProcess({
            goalId: "goal-file",
            command: "node -e 'console.log(\"second\");'",
            cwd: tmpDir,
        });
        await waitFor(async () => {
            const record = await store.getSession("goal-file", again.processId);
            return record?.status === "exited" ? record : undefined;
        });
        await nextManager.close();

        const sessions = await store.listSessions("goal-file");
        assert.equal(sessions.length, 2);
        assert.equal(sessions.every((session) => session.status === "exited"), true);
    } finally {
        // 独立于被测 close 的兜底清理：测试失败时仍终止本次拥有的进程
        await manager?.forceClose().catch(() => undefined);
        await nextManager?.forceClose().catch(() => undefined);
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});
