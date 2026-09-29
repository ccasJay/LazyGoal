import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    createWorkspaceSandbox,
    EXECUTION_ABORTED_ERROR_CODE,
} from "../src/index";

describe("WorkspaceSandbox", () => {
    it("校验相对路径的静态约束", () => {
        const sandbox = createWorkspaceSandbox("/tmp");

        assert.equal(sandbox.validateRelativePath(""), "empty");
        assert.equal(sandbox.validateRelativePath("   "), "empty");
        assert.equal(sandbox.validateRelativePath("a\0b"), "nul");
        assert.equal(sandbox.validateRelativePath("/etc/passwd"), "absolute");
        assert.equal(sandbox.validateRelativePath("../file.txt"), "parent");
        assert.equal(sandbox.validateRelativePath("a/../../b"), "parent");

        assert.equal(
            sandbox.validateRelativePath(".lazygoal/run.json", {
                rejectSegments: [".lazygoal"],
            }),
            "rejected-segment",
        );

        assert.equal(sandbox.validateRelativePath("src/index.ts"), undefined);
    });

    it("解析工作区内合法文件与越界符号链接", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "sandbox-test-"));
        const outsideDir = await mkdtemp(join(tmpdir(), "sandbox-outside-"));

        try {
            const workspaceRoot = join(tempRoot, "project");
            const outsideFile = join(outsideDir, "secret.txt");
            await writeFile(outsideFile, "top-secret");

            const sandbox = createWorkspaceSandbox(workspaceRoot);

            // 创建工作区内正常文件与越界符号链接
            const { mkdir } = await import("node:fs/promises");
            await mkdir(workspaceRoot, { recursive: true });
            const insideFile = join(workspaceRoot, "hello.txt");
            await writeFile(insideFile, "world");

            const escapeSymlink = join(workspaceRoot, "escape.txt");
            await symlink(outsideFile, escapeSymlink);

            // 1. 正常工作区内文件
            const resolvedInside = await sandbox.resolveTarget("hello.txt", {});
            assert.equal(resolvedInside.ok, true);
            if (resolvedInside.ok) {
                assert.match(resolvedInside.path, /hello\.txt$/);
            }

            // 2. 符号链接指向工作区外 -> 必须拒绝
            const resolvedEscape = await sandbox.resolveTarget("escape.txt", {});
            assert.equal(resolvedEscape.ok, false);
            if (!resolvedEscape.ok) {
                assert.equal(resolvedEscape.failure.code, "PATH_OUTSIDE_WORKSPACE");
                assert.match(resolvedEscape.failure.message, /目标不在工作区内/);
            }

            // 3. 越界符号链接通过 resolveExistingPath 也必须被拒绝
            const resolvedExistingEscape = await sandbox.resolveExistingPath("escape.txt");
            assert.equal(resolvedExistingEscape.ok, false);
            if (!resolvedExistingEscape.ok) {
                assert.equal(resolvedExistingEscape.failure.code, "PATH_OUTSIDE_WORKSPACE");
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
            await rm(outsideDir, { recursive: true, force: true });
        }
    });

    it("正确映射领域错误且不存在文件抛出原始错误", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "sandbox-test-"));

        try {
            const sandbox = createWorkspaceSandbox(tempRoot);

            // 映射 ENOENT
            const resolvedMissing = await sandbox.resolveTarget("nonexistent.txt", {
                ENOENT: {
                    code: "FILE_NOT_FOUND",
                    render: (p) => `找不到文件: ${p}`,
                },
            });
            assert.equal(resolvedMissing.ok, false);
            if (!resolvedMissing.ok) {
                assert.equal(resolvedMissing.failure.code, "FILE_NOT_FOUND");
                assert.equal(resolvedMissing.failure.message, "找不到文件: nonexistent.txt");
            }

            // resolveExistingPath 遇到不存在文件应抛出原始 ENOENT
            await assert.rejects(
                () => sandbox.resolveExistingPath("nonexistent.txt"),
                (err: any) => err.code === "ENOENT",
            );
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("支持安全读写文件并在中止时抛出符合规范的中止异常", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "sandbox-test-"));

        try {
            const sandbox = createWorkspaceSandbox(tempRoot);
            const targetFile = join(tempRoot, "data.txt");

            await sandbox.writeTextFile(targetFile, "content-123");
            const readBack = await sandbox.readTextFile(targetFile);
            assert.equal(readBack, "content-123");

            // 中止控制测试
            const controller = new AbortController();
            controller.abort();

            await assert.rejects(
                () => sandbox.resolveTarget("data.txt", {}, { signal: controller.signal }),
                (err: any) => err.name === "ExecutionAbortedError" && err.code === EXECUTION_ABORTED_ERROR_CODE,
            );

            await assert.rejects(
                () => sandbox.readTextFile(targetFile, { signal: controller.signal }),
                (err: any) => err.name === "AbortError" || err.name === "ExecutionAbortedError",
            );
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });
});
