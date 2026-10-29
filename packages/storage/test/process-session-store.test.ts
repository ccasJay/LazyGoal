import assert from "node:assert/strict";
import { mkdtemp, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    JsonFileProcessSessionStore,
    PROCESS_LOG_MAX_FILE_BYTES,
    type ProcessSessionRecord,
} from "../src/index";

function injectedError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`injected ${code}`), { code });
}

function errnoIs(code: string): (error: unknown) => boolean {
    return (error: unknown) => error instanceof Error
        && (error as NodeJS.ErrnoException).code === code;
}

function encoded(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

function createSession(goalId = "goal-1", processId = "proc-1"): ProcessSessionRecord {
    return {
        goalId,
        processId,
        command: "echo test",
        status: "running",
        hostInstanceId: "host-1",
        startedAt: new Date().toISOString(),
    };
}

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
        await host1Store.saveSession({
            goalId: "goal-1",
            processId: "proc-starting",
            command: "sleep 100",
            status: "starting",
            hostInstanceId: "host-1",
            startedAt: new Date().toISOString(),
        });
        await host1Store.appendOutput("goal-1", "proc-running", "stdout", "before-restart\n");

        const sessionPath = join(
            tmpDir,
            "processes",
            Buffer.from("goal-1", "utf8").toString("base64url"),
            Buffer.from("proc-running", "utf8").toString("base64url"),
            "session.json",
        );
        const before = await readFile(sessionPath, "utf8");

        // 新宿主实例读取：starting 与 running 均为只读 interrupted 投影
        const host2Store = new JsonFileProcessSessionStore(tmpDir, "host-2");
        const restored = await host2Store.getSession("goal-1", "proc-running");
        assert.ok(restored);
        assert.equal(restored.status, "interrupted");
        assert.match(restored.error ?? "", /interrupted by host restart/);

        const list = await host2Store.listSessions("goal-1");
        assert.equal(list.length, 2);
        assert.deepEqual(
            [...list].map((record) => [record.processId, record.status]).sort(),
            [["proc-running", "interrupted"], ["proc-starting", "interrupted"]],
        );

        // 读取投影不重写记录、不重放命令：磁盘字节保持原样，日志仍可按游标读取
        assert.equal(await readFile(sessionPath, "utf8"), before);
        const output = await host2Store.readOutput("goal-1", "proc-running", "stdout", 0);
        assert.equal(output.text, "before-restart\n");
        assert.equal(output.nextCursor, Buffer.byteLength("before-restart\n"));
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

test("JsonFileProcessSessionStore.saveSession 只静默 rename 阶段的 ENOENT", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-store-"));
    const processDirectory = join(
        tmpDir,
        "processes",
        encoded("goal-1"),
        encoded("proc-1"),
    );

    try {
        const session = createSession();

        await assert.rejects(
            new JsonFileProcessSessionStore(tmpDir, "host-1", {
                mkdir: async () => {
                    throw injectedError("ENOENT");
                },
            }).saveSession(session),
            errnoIs("ENOENT"),
        );

        await assert.rejects(
            new JsonFileProcessSessionStore(tmpDir, "host-1", {
                open: async () => {
                    throw injectedError("ENOENT");
                },
            }).saveSession(session),
            errnoIs("ENOENT"),
        );

        await new JsonFileProcessSessionStore(tmpDir, "host-1", {
            rename: async () => {
                throw injectedError("ENOENT");
            },
        }).saveSession(session);

        assert.deepEqual(
            (await readdir(processDirectory)).filter((name) => name.endsWith(".tmp")),
            [],
        );
        assert.equal(
            await new JsonFileProcessSessionStore(tmpDir, "host-1").getSession("goal-1", "proc-1"),
            undefined,
        );

        await assert.rejects(
            new JsonFileProcessSessionStore(tmpDir, "host-1", {
                rename: async () => {
                    throw injectedError("EACCES");
                },
            }).saveSession(session),
            errnoIs("EACCES"),
        );
        assert.deepEqual(
            (await readdir(processDirectory)).filter((name) => name.endsWith(".tmp")),
            [],
        );
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("JsonFileProcessSessionStore.writeMeta 静默整段写入的 ENOENT 但传播进入 rename 的 EACCES", async () => {
    const tolerantDirectory = await mkdtemp(join(tmpdir(), "lg-proc-store-"));
    const rejectingDirectory = await mkdtemp(join(tmpdir(), "lg-proc-store-"));

    try {
        const tolerant = new JsonFileProcessSessionStore(tolerantDirectory, "host-1", {
            open: async (path, flags, mode) => {
                if (String(path).endsWith(".tmp")) {
                    throw injectedError("ENOENT");
                }
                return await open(path, flags, mode);
            },
        });

        await tolerant.appendOutput("goal-1", "proc-1", "stdout", "log text");

        const tolerantChannel = join(
            tolerantDirectory,
            "processes",
            encoded("goal-1"),
            encoded("proc-1"),
            "stdout",
        );
        assert.equal(await readFile(join(tolerantChannel, "part-0.log"), "utf8"), "log text");
        await assert.rejects(
            readFile(join(tolerantChannel, "meta.json"), "utf8"),
            errnoIs("ENOENT"),
        );

        const rejecting = new JsonFileProcessSessionStore(rejectingDirectory, "host-1", {
            rename: async (from, to) => {
                if (String(to).endsWith("meta.json")) {
                    throw injectedError("EACCES");
                }
                await rename(from, to);
            },
        });

        await assert.rejects(
            rejecting.appendOutput("goal-1", "proc-1", "stdout", "log text"),
            errnoIs("EACCES"),
        );

        const rejectingChannel = join(
            rejectingDirectory,
            "processes",
            encoded("goal-1"),
            encoded("proc-1"),
            "stdout",
        );
        assert.deepEqual(
            (await readdir(rejectingChannel)).filter((name) => name.endsWith(".tmp")),
            [],
        );
    } finally {
        await rm(tolerantDirectory, { recursive: true, force: true });
        await rm(rejectingDirectory, { recursive: true, force: true });
    }
});

test("JsonFileProcessSessionStore 新建目录与元数据分别使用 0700 与 0600", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-proc-store-"));

    try {
        const store = new JsonFileProcessSessionStore(tmpDir, "host-1");
        await store.saveSession(createSession());
        await store.appendOutput("goal-1", "proc-1", "stdout", "log text");

        const processDirectory = join(
            tmpDir,
            "processes",
            encoded("goal-1"),
            encoded("proc-1"),
        );
        assert.equal((await stat(processDirectory)).mode & 0o777, 0o700);
        assert.equal((await stat(join(processDirectory, "session.json"))).mode & 0o777, 0o600);
        assert.equal((await stat(join(processDirectory, "stdout", "part-0.log"))).mode & 0o777, 0o600);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
