import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createToolGrantMatcher,
    toolGrantMatchersEqual,
} from "../src/index";

test("Bash 授权身份按完整 canonical 输入匹配", async () => {
    const first = await createToolGrantMatcher("bash", {
        command: "git status --short",
        timeoutMs: 10_000,
    });
    const keyOrderChanged = await createToolGrantMatcher("bash", {
        timeoutMs: 10_000,
        command: "git status --short",
    });
    const differentCommand = await createToolGrantMatcher("bash", {
        command: "git diff",
        timeoutMs: 10_000,
    });
    const differentTimeout = await createToolGrantMatcher("bash", {
        command: "git status --short",
        timeoutMs: 20_000,
    });

    assert.equal(toolGrantMatchersEqual(first, keyOrderChanged), true);
    assert.equal(toolGrantMatchersEqual(first, differentCommand), false);
    assert.equal(toolGrantMatchersEqual(first, differentTimeout), false);
});

test("写入与编辑授权身份绑定同一规范化目标而忽略内容", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grant-path-"));
    try {
        await writeFile(join(workspaceRoot, "existing.txt"), "before", "utf8");
        const firstWrite = await createToolGrantMatcher(
            "write_file",
            { path: "existing.txt", content: "first" },
            workspaceRoot,
        );
        const secondWrite = await createToolGrantMatcher(
            "write_file",
            { content: "different", path: "./existing.txt" },
            workspaceRoot,
        );
        const firstEdit = await createToolGrantMatcher(
            "edit_file",
            { path: "existing.txt", oldString: "before", newString: "one" },
            workspaceRoot,
        );
        const secondEdit = await createToolGrantMatcher(
            "edit_file",
            { path: "existing.txt", oldString: "other", newString: "two" },
            workspaceRoot,
        );

        assert.equal(toolGrantMatchersEqual(firstWrite, secondWrite), true);
        assert.equal(toolGrantMatchersEqual(firstEdit, secondEdit), true);
        assert.equal(toolGrantMatchersEqual(firstWrite, firstEdit), false);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("写入路径授权在父目录符号链接改指后不复用", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grant-link-"));
    try {
        const firstTarget = join(workspaceRoot, "target-a");
        const secondTarget = join(workspaceRoot, "target-b");
        await mkdir(firstTarget);
        await mkdir(secondTarget);
        await symlink(firstTarget, join(workspaceRoot, "link"), "dir");
        const first = await createToolGrantMatcher(
            "write_file",
            { path: "link/result.txt", content: "one" },
            workspaceRoot,
        );
        await rm(join(workspaceRoot, "link"));
        await symlink(secondTarget, join(workspaceRoot, "link"), "dir");
        const second = await createToolGrantMatcher(
            "write_file",
            { path: "link/result.txt", content: "two" },
            workspaceRoot,
        );

        assert.equal(toolGrantMatchersEqual(first, second), false);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("非文件 Tool 授权仍覆盖完整 canonical 输入", async () => {
    const first = await createToolGrantMatcher("custom_tool", { query: "a", limit: 3 });
    const different = await createToolGrantMatcher("custom_tool", { query: "a", limit: 4 });
    assert.equal(toolGrantMatchersEqual(first, different), false);
});
