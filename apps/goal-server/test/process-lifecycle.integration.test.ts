import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    ManagedResourceRegistry,
    ShutdownCoordinator,
    type ExitPort,
    type ShutdownClock,
} from "../../../packages/runtime/src/index";
import { JsonFileProcessSessionStore } from "../../../packages/storage/src/index";
import {
    ProcessManager,
    ProcessStartTool,
    ProcessReadTool,
} from "../../../packages/tools/src/index";

class FakeExitPort implements ExitPort {
    readonly calls: number[] = [];
    exit(code: number): void {
        this.calls.push(code);
    }
}

class FakeShutdownClock implements ShutdownClock {
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
