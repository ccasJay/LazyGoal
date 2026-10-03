import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    JsonFileProcessSessionStore,
    PROCESS_LOG_MAX_FILE_BYTES,
    type ProcessSessionRecord,
} from "../src/index";

test("JsonFileProcessSessionStore 原子保存与查询 Session 元数据", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-store-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const session: ProcessSessionRecord = {
            goalId: "goal-1",
            processId: "proc-1",
            command: "echo test",
            status: "running",
            hostInstanceId: "host-1",
            startedAt: new Date().toISOString(),
        };

        await store.saveSession(session);
        const restored = await store.getSession("goal-1", "proc-1");
        assert.ok(restored);
        assert.equal(restored.goalId, "goal-1");
        assert.equal(restored.processId, "proc-1");
        assert.equal(restored.command, "echo test");
        assert.equal(restored.status, "running");

        // 更新状态至 exited
        const updated: ProcessSessionRecord = {
            ...session,
            status: "exited",
            exitCode: 0,
            exitedAt: new Date().toISOString(),
        };
        await store.saveSession(updated);
        const restoredUpdated = await store.getSession("goal-1", "proc-1");
        assert.ok(restoredUpdated);
        assert.equal(restoredUpdated.status, "exited");
        assert.equal(restoredUpdated.exitCode, 0);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("JsonFileProcessSessionStore 跨宿主实例重启将非终态记录投影为 interrupted", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-store-"));
    try {
        const host1Store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const session: ProcessSessionRecord = {
            goalId: "goal-1",
            processId: "proc-running",
            command: "sleep 100",
            status: "running",
            hostInstanceId: "host-1",
            startedAt: new Date().toISOString(),
        };
        await host1Store.saveSession(session);

        // 新宿主实例读取
        const host2Store = new JsonFileProcessSessionStore(tmpDir, "host-2");
        const restored = await host2Store.getSession("goal-1", "proc-running");
        assert.ok(restored);
        assert.equal(restored.status, "interrupted");
        assert.match(restored.error ?? "", /interrupted by host restart/);

        // listSessions 同样投影
        const list = await host2Store.listSessions("goal-1");
        assert.equal(list.length, 1);
        assert.equal(list[0]?.status, "interrupted");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("JsonFileProcessSessionStore 追加与按游标读取日志，并在轮转丢弃后报告 gap", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-store-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        const goalId = "goal-rot";
        const processId = "proc-rot";

        // 1. 基础追加与读取
        await store.appendOutput(goalId, processId, "stdout", "chunk 1\n");
        await store.appendOutput(goalId, processId, "stdout", "chunk 2\n");

        const read1 = await store.readOutput(goalId, processId, "stdout", 0);
        assert.equal(read1.text, "chunk 1\nchunk 2\n");
        assert.equal(read1.gap, false);
        assert.equal(read1.headCursor, 0);
        assert.ok(read1.nextCursor > 0);

        // 2. 使用新游标进行增量消费
        const read2 = await store.readOutput(goalId, processId, "stdout", read1.nextCursor);
        assert.equal(read2.text, "");
        assert.equal(read2.nextCursor, read1.nextCursor);

        // 3. 产生超过 2 个分片（2 * 512 KiB）的超大输出以触发轮转与最旧分片丢弃
        const largeChunk = "A".repeat(300 * 1024); // 300 KiB
        await store.appendOutput(goalId, processId, "stdout", largeChunk); // part-0 ~300K
        await store.appendOutput(goalId, processId, "stdout", largeChunk); // part-0 full, part-1 ~90K
        await store.appendOutput(goalId, processId, "stdout", largeChunk); // part-1 ~390K
        await store.appendOutput(goalId, processId, "stdout", largeChunk); // part-1 full, part-2 created -> part-0 dropped!

        // 从最初的游标 0 读取，因已被丢弃，应该返回 gap: true
        const readGapped = await store.readOutput(goalId, processId, "stdout", 0, 1024);
        assert.equal(readGapped.gap, true);
        assert.ok(readGapped.headCursor > 0);
        assert.ok(readGapped.text.length > 0);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("JsonFileProcessSessionStore deleteGoalSessions 清理指定 Goal 的全部进程目录", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-store-"));
    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        await store.saveSession({
            goalId: "goal-del",
            processId: "proc-1",
            command: "ls",
            status: "exited",
            hostInstanceId: "host-1",
            startedAt: new Date().toISOString(),
        });
        await store.appendOutput("goal-del", "proc-1", "stdout", "log text");

        assert.ok((await store.getSession("goal-del", "proc-1")) !== undefined);

        await store.deleteGoalSessions("goal-del");
        assert.equal(await store.getSession("goal-del", "proc-1"), undefined);
        const list = await store.listSessions("goal-del");
        assert.equal(list.length, 0);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
