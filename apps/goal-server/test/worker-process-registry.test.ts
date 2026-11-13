import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
    WorkerSocketPathError,
    createWorkerProcessRegistration,
    resolveWorkerSocketPath,
    workerSocketPathLimit,
} from "../src/runtime/worker-process-registry";

async function withTempRoot(run: (root: string) => Promise<void>): Promise<void> {
    if (process.platform === "win32") return;
    const root = await mkdtemp(join("/tmp", "lg-sock-"));
    try {
        await run(root);
    } finally {
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
}

test("默认解析使用短私有根并创建仅本人可访问的目录", async () => {
    const uid = process.getuid?.();
    if (uid === undefined) return;
    const socketPath = await resolveWorkerSocketPath("/var/lib/lazygoal", "worker-default");
    assert.equal(dirname(socketPath), `/tmp/lazygoal-${uid}`);
    assert.match(socketPath, /\/lgw-[a-f0-9]{32}\.sock$/u);
    assert.ok(Buffer.byteLength(socketPath) <= workerSocketPathLimit());
    const directory = await stat(dirname(socketPath));
    assert.equal(directory.isDirectory(), true);
    assert.equal(directory.mode & 0o777, 0o700);
    assert.equal(await resolveWorkerSocketPath("/var/lib/lazygoal", "worker-default"), socketPath);
});

test("超长私有根回退到临时目录且最终路径不超限", async () => {
    await withTempRoot(async (root) => {
        const longRoot = join(root, "nested", "a".repeat(60), "b".repeat(60), "c".repeat(60));
        const fallback = await mkdtemp(join(root, "short-"));
        const socketPath = await resolveWorkerSocketPath("/var/lib/lazygoal", "worker-long", {
            privateRoots: [longRoot],
            fallbackRoots: [fallback],
        });
        assert.equal(dirname(socketPath), fallback);
        assert.ok(Buffer.byteLength(socketPath) <= workerSocketPathLimit());
        await assert.rejects(stat(longRoot), /ENOENT/u);
    });
});

test("不可复用的私有根被跳过并回退到目录根", async () => {
    await withTempRoot(async (root) => {
        const fallback = await mkdtemp(join(root, "fallback-"));
        const fileRoot = join(root, "file-root");
        await writeFile(fileRoot, "");
        const realRoot = join(root, "real-root");
        await mkdir(realRoot, { mode: 0o700 });
        const linkRoot = join(root, "link-root");
        await symlink(realRoot, linkRoot);
        const uid = process.getuid?.() ?? 0;

        for (const privateRoot of [fileRoot, linkRoot]) {
            const socketPath = await resolveWorkerSocketPath("/var/lib/lazygoal", "worker-skip", {
                privateRoots: [privateRoot],
                fallbackRoots: [fallback],
            });
            assert.equal(dirname(socketPath), fallback, privateRoot);
        }

        const socketPath = await resolveWorkerSocketPath("/var/lib/lazygoal", "worker-skip", {
            privateRoots: [realRoot],
            fallbackRoots: [fallback],
            expectedUid: uid + 1,
        });
        assert.equal(dirname(socketPath), fallback);
    });
});

test("没有候选路径满足平台上限时抛出带长度的类型化错误", async () => {
    await withTempRoot(async (root) => {
        const fallback = await mkdtemp(join(root, "fallback-"));
        await assert.rejects(
            resolveWorkerSocketPath("/var/lib/lazygoal", "worker-limit", {
                privateRoots: [],
                fallbackRoots: [fallback],
                limit: 10,
            }),
            (error: unknown) => {
                assert.ok(error instanceof WorkerSocketPathError);
                assert.equal(error.reason, "length");
                assert.equal(error.limit, 10);
                assert.ok(error.pathLength > 10);
                assert.match(error.message, /bytes/u);
                assert.doesNotMatch(error.message, new RegExp(fallback, "u"));
                return true;
            },
        );
    });
});

test("所有根都不可用时报告根不可用", async () => {
    await withTempRoot(async (root) => {
        const fileRoot = join(root, "file-root");
        await writeFile(fileRoot, "");
        await assert.rejects(
            resolveWorkerSocketPath("/var/lib/lazygoal", "worker-root", {
                privateRoots: [fileRoot],
                fallbackRoots: [join(root, "missing-root")],
            }),
            (error: unknown) => {
                assert.ok(error instanceof WorkerSocketPathError);
                assert.equal(error.reason, "root");
                assert.ok(error.pathLength > 0);
                return true;
            },
        );
    });
});

test("注册记录保存解析出的 socket 路径并可选地回退到共享临时目录", async () => {
    await withTempRoot(async (root) => {
        const dataDirectory = join(root, "data");
        await mkdir(dataDirectory, { recursive: true });
        const registration = await createWorkerProcessRegistration(dataDirectory, "worker-registration", "generation-1", {
            projectRoot: root,
            executionRoot: root,
        });
        assert.equal(registration.socketPath, await resolveWorkerSocketPath(dataDirectory, "worker-registration"));
        assert.ok(Buffer.byteLength(registration.socketPath) <= workerSocketPathLimit());
    });
});
