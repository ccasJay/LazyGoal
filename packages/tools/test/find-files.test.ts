import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    FindFilesTool,
    FIND_FILES_TOOL_ID,
    type FindFilesOutput,
} from "../src/index";
import { ExecutionAbortedError } from "../../runtime/src/index";

test("FindFilesTool 匹配工作区文件并跳过 .git, .lazygoal, node_modules", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-files-"));
    try {
        await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
        await mkdir(join(workspaceRoot, ".git"), { recursive: true });
        await mkdir(join(workspaceRoot, ".lazygoal"), { recursive: true });
        await mkdir(join(workspaceRoot, "node_modules", "pkg"), { recursive: true });

        await writeFile(join(workspaceRoot, "src", "app.ts"), "app");
        await writeFile(join(workspaceRoot, "src", "nested", "util.ts"), "util");
        await writeFile(join(workspaceRoot, "src", "app.js"), "js");
        await writeFile(join(workspaceRoot, ".git", "config.ts"), "git");
        await writeFile(join(workspaceRoot, ".lazygoal", "meta.ts"), "meta");
        await writeFile(join(workspaceRoot, "node_modules", "pkg", "index.ts"), "nm");

        const tool = new FindFilesTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-1",
            input: { pattern: "**/*.ts" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as FindFilesOutput;
            assert.equal(output.truncated, false);
            assert.deepEqual(output.paths, [
                "src/app.ts",
                "src/nested/util.ts",
            ]);
            assert.ok(output.scannedEntries > 0);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("FindFilesTool 支持限定 search root", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-files-"));
    try {
        await mkdir(join(workspaceRoot, "src"), { recursive: true });
        await mkdir(join(workspaceRoot, "test"), { recursive: true });

        await writeFile(join(workspaceRoot, "src", "index.ts"), "src");
        await writeFile(join(workspaceRoot, "test", "index.test.ts"), "test");

        const tool = new FindFilesTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-2",
            input: { pattern: "*.ts", path: "src" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as FindFilesOutput;
            assert.deepEqual(output.paths, ["src/index.ts"]);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("FindFilesTool 零匹配返回成功的空数组", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-files-"));
    try {
        await writeFile(join(workspaceRoot, "a.txt"), "a");

        const tool = new FindFilesTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-3",
            input: { pattern: "*.nonexistent" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as FindFilesOutput;
            assert.deepEqual(output.paths, []);
            assert.equal(output.truncated, false);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("FindFilesTool 单次扫描额度与游标推进", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-files-"));
    try {
        await mkdir(join(workspaceRoot, "d1"));
        await mkdir(join(workspaceRoot, "d2"));

        await writeFile(join(workspaceRoot, "d1", "a.ts"), "a");
        await writeFile(join(workspaceRoot, "d1", "b.ts"), "b");
        await writeFile(join(workspaceRoot, "d2", "c.ts"), "c");

        const tool = new FindFilesTool(workspaceRoot);

        // 限制 maxResults = 2 触发截断
        const page1 = await tool.execute({
            actionId: "act-p1",
            input: { pattern: "**/*.ts", maxResults: 2 },
        });

        assert.equal(page1.kind, "success");
        let cursor: string | undefined;
        if (page1.kind === "success") {
            const out1 = page1.output as unknown as FindFilesOutput;
            assert.equal(out1.truncated, true);
            assert.ok(out1.nextCursor);
            cursor = out1.nextCursor;
            assert.equal(out1.paths.length, 2);
        }

        // 接着用游标查下一页
        assert.ok(cursor !== undefined);
        const page2 = await tool.execute({
            actionId: "act-p2",
            input: { pattern: "**/*.ts", maxResults: 2, cursor },
        });

        assert.equal(page2.kind, "success");
        if (page2.kind === "success") {
            const out2 = page2.output as unknown as FindFilesOutput;
            assert.equal(out2.truncated, false);
            assert.equal(out2.paths.length, 1);
            assert.equal(out2.paths[0], "d2/c.ts");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("FindFilesTool 符号链接越界时不跟随", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-files-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-outside-"));
    try {
        await writeFile(join(outsideRoot, "secret.ts"), "secret");
        await symlink(outsideRoot, join(workspaceRoot, "link_out"));

        const tool = new FindFilesTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-sym",
            input: { pattern: "**/*.ts" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as FindFilesOutput;
            assert.deepEqual(output.paths, []);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});

test("FindFilesTool 校验 pattern 长度与内容", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-files-"));
    try {
        const tool = new FindFilesTool(workspaceRoot);

        const vEmpty = tool.validate({ pattern: "" });
        assert.equal(vEmpty.ok, false);

        const vNul = tool.validate({ pattern: "abc\0def" });
        assert.equal(vNul.ok, false);

        const vTooLong = tool.validate({ pattern: "a".repeat(4097) });
        assert.equal(vTooLong.ok, false);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("FindFilesTool 支持中止信号", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-find-files-"));
    try {
        const tool = new FindFilesTool(workspaceRoot);
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
            () => tool.execute({ actionId: "act-abort", input: { pattern: "*.ts" } }, { signal: controller.signal }),
            (err) => err instanceof ExecutionAbortedError,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
