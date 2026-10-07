import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    ListDirectoryTool,
    LIST_DIRECTORY_TOOL_ID,
    type ListDirectoryOutput,
} from "../src/index";

test("ListDirectoryTool 列举工作区根目录并按 path 字符序升序排序", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    try {
        await writeFile(join(workspaceRoot, "b.txt"), "b");
        await writeFile(join(workspaceRoot, "a.txt"), "a");
        await mkdir(join(workspaceRoot, "c_dir"));

        const tool = new ListDirectoryTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-1",
            input: {},
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as ListDirectoryOutput;
            assert.equal(output.truncated, false);
            assert.equal(output.nextCursor, undefined);
            assert.deepEqual(output.entries, [
                { name: "a.txt", path: "a.txt", type: "file" },
                { name: "b.txt", path: "b.txt", type: "file" },
                { name: "c_dir", path: "c_dir", type: "directory" },
            ]);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ListDirectoryTool 支持子目录查询且不递归展开", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    try {
        const subDir = join(workspaceRoot, "sub");
        await mkdir(join(subDir, "nested"), { recursive: true });
        await writeFile(join(subDir, "file1.txt"), "1");
        await writeFile(join(subDir, "nested", "inner.txt"), "inner");

        const tool = new ListDirectoryTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-2",
            input: { path: "sub" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as ListDirectoryOutput;
            assert.deepEqual(output.entries, [
                { name: "file1.txt", path: "sub/file1.txt", type: "file" },
                { name: "nested", path: "sub/nested", type: "directory" },
            ]);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ListDirectoryTool 列举符号链接并标记为 symlink，不递归跟随", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-outside-"));
    try {
        const outsideTargetDir = join(outsideRoot, "target_dir");
        await mkdir(outsideTargetDir, { recursive: true });
        await writeFile(join(outsideTargetDir, "secret.txt"), "secret");

        // 工作区内建立指向外部目录的软链接
        await symlink(outsideTargetDir, join(workspaceRoot, "link_to_outside"));

        const tool = new ListDirectoryTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-3",
            input: {},
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as ListDirectoryOutput;
            assert.deepEqual(output.entries, [
                { name: "link_to_outside", path: "link_to_outside", type: "symlink" },
            ]);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});

test("ListDirectoryTool 分页与游标推进", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    try {
        await writeFile(join(workspaceRoot, "1.txt"), "1");
        await writeFile(join(workspaceRoot, "2.txt"), "2");
        await writeFile(join(workspaceRoot, "3.txt"), "3");

        const tool = new ListDirectoryTool(workspaceRoot);

        // 第 1 页：size 2
        const page1 = await tool.execute({
            actionId: "act-p1",
            input: { maxEntries: 2 },
        });
        assert.equal(page1.kind, "success");
        let cursor: string | undefined;
        if (page1.kind === "success") {
            const out1 = page1.output as unknown as ListDirectoryOutput;
            assert.equal(out1.truncated, true);
            assert.ok(out1.nextCursor);
            cursor = out1.nextCursor;
            assert.deepEqual(out1.entries, [
                { name: "1.txt", path: "1.txt", type: "file" },
                { name: "2.txt", path: "2.txt", type: "file" },
            ]);
        }

        // 第 2 页：使用游标
        assert.ok(cursor !== undefined);
        const page2 = await tool.execute({
            actionId: "act-p2",
            input: { maxEntries: 2, cursor },
        });
        assert.equal(page2.kind, "success");
        if (page2.kind === "success") {
            const out2 = page2.output as unknown as ListDirectoryOutput;
            assert.equal(out2.truncated, false);
            assert.equal(out2.nextCursor, undefined);
            assert.deepEqual(out2.entries, [
                { name: "3.txt", path: "3.txt", type: "file" },
            ]);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ListDirectoryTool 错误游标或不匹配查询返回 INVALID_CURSOR 失败", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    try {
        await writeFile(join(workspaceRoot, "1.txt"), "1");
        await writeFile(join(workspaceRoot, "2.txt"), "2");
        const tool = new ListDirectoryTool(workspaceRoot);

        // 损坏游标
        const resInvalid = await tool.execute({
            actionId: "act-err1",
            input: { cursor: "not-a-valid-base64url" },
        });
        assert.equal(resInvalid.kind, "failure");
        if (resInvalid.kind === "failure") {
            assert.equal(resInvalid.code, "INVALID_CURSOR");
        }

        // 针对根目录生成的游标，在请求 sub 时使用，应识别查询不匹配
        const p1 = await tool.execute({ actionId: "act-p1", input: { maxEntries: 1 } });
        assert.equal(p1.kind, "success");
        const validCursor = (p1 as any).output.nextCursor;
        assert.ok(validCursor);

        await mkdir(join(workspaceRoot, "sub"));
        const resMismatch = await tool.execute({
            actionId: "act-err2",
            input: { path: "sub", cursor: validCursor },
        });
        assert.equal(resMismatch.kind, "failure");
        if (resMismatch.kind === "failure") {
            assert.equal(resMismatch.code, "INVALID_CURSOR");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ListDirectoryTool 目标不存在或不是目录时返回明确领域失败", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    try {
        await writeFile(join(workspaceRoot, "file.txt"), "content");
        const tool = new ListDirectoryTool(workspaceRoot);

        // 不存在
        const missingRes = await tool.execute({
            actionId: "act-missing",
            input: { path: "missing_dir" },
        });
        assert.equal(missingRes.kind, "failure");
        if (missingRes.kind === "failure") {
            assert.equal(missingRes.code, "DIRECTORY_NOT_FOUND");
        }

        // 不是目录
        const notDirRes = await tool.execute({
            actionId: "act-notdir",
            input: { path: "file.txt" },
        });
        assert.equal(notDirRes.kind, "failure");
        if (notDirRes.kind === "failure") {
            assert.equal(notDirRes.code, "NOT_A_DIRECTORY");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ListDirectoryTool 拒绝越界路径与空路径", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    try {
        const tool = new ListDirectoryTool(workspaceRoot);

        const vParent = tool.validate({ path: "../outside" });
        assert.equal(vParent.ok, false);

        const vAbs = tool.validate({ path: "/etc" });
        assert.equal(vAbs.ok, false);

        const vEmpty = tool.validate({ path: "" });
        assert.equal(vEmpty.ok, false);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ListDirectoryTool 支持中止信号", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-list-dir-"));
    try {
        const tool = new ListDirectoryTool(workspaceRoot);
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
            () => tool.execute({ actionId: "act-abort", input: {} }, { signal: controller.signal }),
            (err) => err instanceof ExecutionAbortedError,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
