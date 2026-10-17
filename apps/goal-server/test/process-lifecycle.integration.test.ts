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
import {
    ProcessManager,
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
        structuredOutputMode: "strict" as const,
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
