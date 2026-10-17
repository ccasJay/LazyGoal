import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileProcessSessionStore } from "../../storage/src/index";
import { ProcessManager } from "../../process-runtime/src/index";
import {
    ProcessReadTool,
    ProcessStartTool,
    ProcessStopTool,
    PROCESS_READ_MAX_WAIT_MS,
    type ProcessReadOutput,
    type ProcessStartOutput,
} from "../src/index";

test("ProcessManager 与 process_start/read/stop 全生命周期与多通道隔离验证", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-suite-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const manager = new ProcessManager({
            store,
            hostInstanceId: "host-1",
        });

        const startTool = new ProcessStartTool(tmpDir, manager, { enableSeatbelt: false });
        const readTool = new ProcessReadTool(manager, store);
        const stopTool = new ProcessStopTool(manager, store);

        const goalId = "goal-suite-1";
        const context = { goalId, runId: "run-1" };

        // 1. 启动命令（输出一句话后 sleep）
        const startRes = await startTool.execute({
            actionId: "act-start-1",
            context,
            input: { command: "node -e 'console.log(\"hello-stdout\"); console.error(\"hello-stderr\"); setTimeout(() => {}, 5000);'" },
        });

        assert.equal(startRes.kind, "success");
        if (startRes.kind !== "success") return;

        const startOutput = startRes.output as unknown as ProcessStartOutput;
        const processId = startOutput.processId;
        assert.ok(processId.startsWith("proc-"));
        assert.equal(startOutput.status, "running");

        // 2. 带 waitMs 读取输出
        const readRes = await readTool.execute({
            actionId: "act-read-1",
            context,
            input: { processId, waitMs: 1000 },
        });

        assert.equal(readRes.kind, "success");
        if (readRes.kind !== "success") return;

        const readOutput = readRes.output as unknown as ProcessReadOutput;
        assert.match(readOutput.stdout.text, /hello-stdout/);
        assert.match(readOutput.stderr.text, /hello-stderr/);
        assert.equal(readOutput.status, "running");
        assert.equal(readOutput.stdout.gap, false);

        // 3. 停止进程
        const stopRes = await stopTool.execute({
            actionId: "act-stop-1",
            context,
            input: { processId },
        });
        assert.equal(stopRes.kind, "success");

        // 4. 再次读取已停止的进程，状态应为 stopped
        const readAfterStop = await readTool.execute({
            actionId: "act-read-2",
            context,
            input: { processId },
        });
        assert.equal(readAfterStop.kind, "success");
        if (readAfterStop.kind === "success") {
            const out = readAfterStop.output as unknown as ProcessReadOutput;
            assert.equal(out.status, "stopped");
        }

        // 等待完全收敛关闭：close 结算全部已接收输出与终态写入
        await manager.close();
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("跨 Goal 隔离：其他 Goal 不得查询或停止非所属进程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-suite-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const manager = new ProcessManager({ store, hostInstanceId: "host-1" });

        const startTool = new ProcessStartTool(tmpDir, manager, { enableSeatbelt: false });
        const readTool = new ProcessReadTool(manager, store);
        const stopTool = new ProcessStopTool(manager, store);

        // Goal A 启动
        const startRes = await startTool.execute({
            actionId: "act-start-a",
            context: { goalId: "goal-A", runId: "run-A" },
            input: { command: "node -e 'setTimeout(() => {}, 3000);'" },
        });
        assert.equal(startRes.kind, "success");
        const processId = (startRes as any).output.processId;

        // Goal B 尝试读取
        const readResB = await readTool.execute({
            actionId: "act-read-b",
            context: { goalId: "goal-B", runId: "run-B" },
            input: { processId },
        });
        assert.equal(readResB.kind, "failure");
        if (readResB.kind === "failure") {
            assert.equal(readResB.code, "PROCESS_NOT_FOUND");
        }

        // Goal B 尝试停止
        const stopResB = await stopTool.execute({
            actionId: "act-stop-b",
            context: { goalId: "goal-B", runId: "run-B" },
            input: { processId },
        });
        assert.equal(stopResB.kind, "failure");
        if (stopResB.kind === "failure") {
            assert.equal(stopResB.code, "PROCESS_NOT_FOUND");
        }

        // 清理 Goal A
        await stopTool.execute({
            actionId: "act-clean-a",
            context: { goalId: "goal-A", runId: "run-A" },
            input: { processId },
        });
        await manager.close();
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("额度控制：限制每 Goal 最多 4 个并发运行，超出报错拒绝", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-suite-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const manager = new ProcessManager({ store, hostInstanceId: "host-1" });
        const startTool = new ProcessStartTool(tmpDir, manager, { enableSeatbelt: false });
        const stopTool = new ProcessStopTool(manager, store);

        const goalId = "goal-concurrency";
        const context = { goalId, runId: "run-1" };

        const startedIds: string[] = [];
        for (let i = 0; i < 4; i++) {
            const res = await startTool.execute({
                actionId: `act-${i}`,
                context,
                input: { command: "node -e 'setTimeout(() => {}, 5000);'" },
            });
            assert.equal(res.kind, "success");
            startedIds.push((res as any).output.processId);
        }

        // 第 5 个尝试启动，应触发并发上限错误
        const overflowRes = await startTool.execute({
            actionId: "act-overflow",
            context,
            input: { command: "node -e 'setTimeout(() => {}, 5000);'" },
        });
        assert.equal(overflowRes.kind, "failure");
        if (overflowRes.kind === "failure") {
            assert.equal(overflowRes.code, "PROCESS_START_FAILED");
            assert.match(overflowRes.message, /reached concurrency limit/);
        }

        // 清理
        for (const pid of startedIds) {
            await stopTool.execute({
                actionId: `act-clean-${pid}`,
                context,
                input: { processId: pid },
            });
        }
        await manager.close();
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

/** 使指定终态写入失败一次的真实文件 Store 包装，用于从工具边界验证失败映射。 */
class FailingTerminalStore {
    private failStatus: "stopped" | "exited" | undefined;
    private failMessage = "";

    constructor(private readonly inner: JsonFileProcessSessionStore) {}

    failNextTerminal(status: "stopped" | "exited", message: string): void {
        this.failStatus = status;
        this.failMessage = message;
    }

    async saveSession(session: Parameters<JsonFileProcessSessionStore["saveSession"]>[0]): Promise<void> {
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

test("进程工具保持原稳定契约：ID、replayPolicy、只读标记与跨 Run 读取", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-suite-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const manager = new ProcessManager({ store, hostInstanceId: "host-1" });
        const startTool = new ProcessStartTool(tmpDir, manager, { enableSeatbelt: false });
        const readTool = new ProcessReadTool(manager, store);
        const stopTool = new ProcessStopTool(manager, store);

        // 原 Tool ID、只读标记与 replayPolicy 保持
        assert.equal(startTool.definition.id, "process_start");
        assert.equal(startTool.definition.isReadOnly, false);
        assert.equal(startTool.replayPolicy, "manual");
        assert.equal(readTool.definition.id, "process_read");
        assert.equal(readTool.definition.isReadOnly, true);
        assert.equal(readTool.replayPolicy, "safe");
        assert.equal(stopTool.definition.id, "process_stop");
        assert.equal(stopTool.definition.isReadOnly, false);
        assert.equal(stopTool.replayPolicy, "manual");

        // 同一 Goal 跨 Run 读取仍可用（只按 Goal 隔离，不按 Run 隔离）
        const goalId = "goal-cross-run";
        const startRes = await startTool.execute({
            actionId: "act-cross-run-start",
            context: { goalId, runId: "run-1" },
            input: { command: "node -e 'console.log(\"cross-run-out\"); setTimeout(() => {}, 5000);'" },
        });
        assert.equal(startRes.kind, "success");
        const processId = (startRes as any).output.processId as string;

        const readRes = await readTool.execute({
            actionId: "act-cross-run-read",
            context: { goalId, runId: "run-2" },
            input: { processId, waitMs: 1000 },
        });
        assert.equal(readRes.kind, "success");
        const output = (readRes as any).output as ProcessReadOutput;
        assert.match(output.stdout.text, /cross-run-out/);

        // 跨 Goal 读取与停止继续拒绝
        const foreignRead = await readTool.execute({
            actionId: "act-foreign-read",
            context: { goalId: "goal-other", runId: "run-2" },
            input: { processId },
        });
        assert.equal(foreignRead.kind, "failure");
        assert.equal((foreignRead as any).code, "PROCESS_NOT_FOUND");

        await stopTool.execute({
            actionId: "act-cross-run-stop",
            context: { goalId, runId: "run-1" },
            input: { processId },
        });
        await manager.close();
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("停止结算失败映射为 PROCESS_STOP_FAILED 且保留类型化原因", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-suite-"));
    try {
        const inner = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const store = new FailingTerminalStore(inner);
        const manager = new ProcessManager({ store, hostInstanceId: "host-1" });
        const startTool = new ProcessStartTool(tmpDir, manager, { enableSeatbelt: false });
        const stopTool = new ProcessStopTool(manager, store);

        const startRes = await startTool.execute({
            actionId: "act-fail-start",
            context: { goalId: "goal-stop-fail", runId: "run-1" },
            input: { command: "node -e 'setTimeout(() => {}, 5000);'" },
        });
        assert.equal(startRes.kind, "success");
        const processId = (startRes as any).output.processId as string;

        store.failNextTerminal("stopped", "terminal record write failed");
        const stopRes = await stopTool.execute({
            actionId: "act-fail-stop",
            context: { goalId: "goal-stop-fail", runId: "run-1" },
            input: { processId },
        });
        assert.equal(stopRes.kind, "failure");
        assert.equal((stopRes as any).code, "PROCESS_STOP_FAILED");
        assert.match((stopRes as any).message, /settlement failed|terminal record write failed/);

        // 句柄仍被清理：会话已释放，后续停止按历史记录返回
        assert.equal(manager.getTotalRunningCount(), 0);
        await manager.close();
    } finally {
        await rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});
