import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    APPLY_PATCH_TOOL_ID,
    ApplyPatchTool,
    type AppliedFileResult,
    type ApplyPatchFailureDetails,
    type ApplyPatchOutput,
} from "../src/index";

test("ApplyPatchTool 支持标准创建、修改与删除文件", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        await writeFile(join(workspaceRoot, "mod.txt"), "line1\nline2\nline3\n", "utf8");
        await writeFile(join(workspaceRoot, "del.txt"), "delete me\n", "utf8");

        const tool = new ApplyPatchTool(workspaceRoot);
        assert.equal(tool.definition.id, APPLY_PATCH_TOOL_ID);
        assert.equal(tool.definition.isReadOnly, false);
        assert.equal(tool.replayPolicy, "manual");

        const patch = `
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/mod.txt b/mod.txt
--- a/mod.txt
+++ b/mod.txt
@@ -1,3 +1,3 @@
 line1
-line2
+line2 modified
 line3
diff --git a/del.txt b/del.txt
deleted file mode 100644
--- a/del.txt
+++ /dev/null
@@ -1 +0,0 @@
-delete me
`.trim();

        const result = await tool.execute({
            actionId: "act-patch-1",
            input: { patch },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as ApplyPatchOutput;
            assert.equal(output.applied.length, 3);
            assert.deepEqual(output.applied.map((a) => a.path), ["new.txt", "mod.txt", "del.txt"]);
        }

        assert.equal(await readFile(join(workspaceRoot, "new.txt"), "utf8"), "hello\nworld\n");
        assert.equal(await readFile(join(workspaceRoot, "mod.txt"), "utf8"), "line1\nline2 modified\nline3\n");
        await assert.rejects(readFile(join(workspaceRoot, "del.txt")));
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 支持新建空文件与删除空文件", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        await writeFile(join(workspaceRoot, "empty-old.txt"), "", "utf8");

        const tool = new ApplyPatchTool(workspaceRoot);
        const patch = `
diff --git a/empty-new.txt b/empty-new.txt
new file mode 100644
--- /dev/null
+++ b/empty-new.txt
diff --git a/empty-old.txt b/empty-old.txt
deleted file mode 100644
--- a/empty-old.txt
+++ /dev/null
`.trim();

        const result = await tool.execute({
            actionId: "act-patch-empty",
            input: { patch },
        });

        assert.equal(result.kind, "success");
        assert.equal(await readFile(join(workspaceRoot, "empty-new.txt"), "utf8"), "");
        await assert.rejects(readFile(join(workspaceRoot, "empty-old.txt")));
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 支持保留模式与权限修改", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        const tool = new ApplyPatchTool(workspaceRoot);
        const patch = `
diff --git a/run.sh b/run.sh
new file mode 100755
--- /dev/null
+++ b/run.sh
@@ -0,0 +1 @@
+echo "hi"
`.trim();

        const result = await tool.execute({
            actionId: "act-mode",
            input: { patch },
        });

        assert.equal(result.kind, "success");
        const statResult = await (await import("node:fs/promises")).stat(join(workspaceRoot, "run.sh"));
        assert.equal((statResult.mode & 0o777) === 0o755, true);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 精确处理无末尾换行与新添加末尾换行", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        await writeFile(join(workspaceRoot, "no-eol.txt"), "first line", "utf8");

        const tool = new ApplyPatchTool(workspaceRoot);
        // 修改末尾，并添加末尾换行
        const patch = `
--- a/no-eol.txt
+++ b/no-eol.txt
@@ -1 +1 @@
-first line
\\ No newline at end of file
+first line modified
`.trim();

        const result = await tool.execute({
            actionId: "act-eol",
            input: { patch },
        });

        assert.equal(result.kind, "success");
        assert.equal(await readFile(join(workspaceRoot, "no-eol.txt"), "utf8"), "first line modified\n");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 支持行号偏移行但上下文唯一的偏移应用", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        // 文件头部插入了其他内容，导致原 hunk 行号发生偏移
        await writeFile(
            join(workspaceRoot, "offset.txt"),
            "extra1\nextra2\nextra3\ntarget old\nkeep\n",
            "utf8",
        );

        const tool = new ApplyPatchTool(workspaceRoot);
        // hunk 声明位于 line 1，但实际在 line 4
        const patch = `
--- a/offset.txt
+++ b/offset.txt
@@ -1,2 +1,2 @@
-target old
+target new
 keep
`.trim();

        const result = await tool.execute({
            actionId: "act-offset",
            input: { patch },
        });

        assert.equal(result.kind, "success");
        assert.equal(
            await readFile(join(workspaceRoot, "offset.txt"), "utf8"),
            "extra1\nextra2\nextra3\ntarget new\nkeep\n",
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 上下文有歧义时拒绝并保持零修改", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        await writeFile(
            join(workspaceRoot, "ambiguous.txt"),
            "dup\nitem\ndup\nitem\n",
            "utf8",
        );

        const tool = new ApplyPatchTool(workspaceRoot);
        const patch = `
--- a/ambiguous.txt
+++ b/ambiguous.txt
@@ -1,2 +1,2 @@
-dup
+dup modified
 item
`.trim();

        const result = await tool.execute({
            actionId: "act-ambig",
            input: { patch },
        });

        assert.equal(result.kind, "failure");
        if (result.kind === "failure") {
            assert.equal(result.code, "AMBIGUOUS_HUNK_MATCH");
        }
        // 验证文件未被修改
        assert.equal(
            await readFile(join(workspaceRoot, "ambiguous.txt"), "utf8"),
            "dup\nitem\ndup\nitem\n",
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 预检失败确保所有目标完全零写入", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        await writeFile(join(workspaceRoot, "first.txt"), "valid\n", "utf8");

        const tool = new ApplyPatchTool(workspaceRoot);
        // 第 1 个文件合法，第 2 个文件不匹配
        const patch = `
diff --git a/first.txt b/first.txt
--- a/first.txt
+++ b/first.txt
@@ -1 +1 @@
-valid
+modified
diff --git a/second.txt b/second.txt
--- a/second.txt
+++ b/second.txt
@@ -1 +1 @@
-missing
+new
`.trim();

        const result = await tool.execute({
            actionId: "act-fail-early",
            input: { patch },
        });

        assert.equal(result.kind, "failure");
        // 第一个文件必须完全未被修改
        assert.equal(await readFile(join(workspaceRoot, "first.txt"), "utf8"), "valid\n");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 拒绝二进制、重命名与符号链接目标", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-apply-patch-"));

    try {
        const tool = new ApplyPatchTool(workspaceRoot);

        // 二进制补丁
        const resBin = await tool.execute({
            actionId: "act-bin",
            input: { patch: "diff --git a/b b/b\nBinary files a/b and b/b differ\n" },
        });
        assert.equal(resBin.kind, "failure");
        if (resBin.kind === "failure") {
            assert.equal(resBin.code, "BINARY_PATCH_REJECTED");
        }

        // 重命名补丁
        const resRename = await tool.execute({
            actionId: "act-rename",
            input: { patch: "diff --git a/old b/new\nrename from old\nrename to new\n" },
        });
        assert.equal(resRename.kind, "failure");
        if (resRename.kind === "failure") {
            assert.equal(resRename.code, "UNSUPPORTED_PATCH_OPERATION");
        }

        // 符号链接目标
        await writeFile(join(workspaceRoot, "real.txt"), "real\n", "utf8");
        await symlink(join(workspaceRoot, "real.txt"), join(workspaceRoot, "sym.txt"));
        const resSym = await tool.execute({
            actionId: "act-sym",
            input: {
                patch: `
--- a/sym.txt
+++ b/sym.txt
@@ -1 +1 @@
-real
+sym
`.trim(),
            },
        });
        assert.equal(resSym.kind, "failure");
        if (resSym.kind === "failure") {
            assert.equal(resSym.code, "SYMBOLIC_LINK_REJECTED");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
