import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    GitWorktreeAddTool,
    GitWorktreeRemoveTool,
    GitWorktreeListTool,
    type GitWorktreeAddOutput,
    type GitWorktreeRemoveOutput,
    type GitWorktreeListOutput,
} from "../src/index";

function runGit(cwd: string, args: string[]): string {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

test("Git worktree 创建、核验与安全移除完整流程", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-wt-test-"));

    try {
        runGit(tmpDir, ["init", "-b", "main"]);
        runGit(tmpDir, ["config", "user.name", "WtAuthor"]);
        runGit(tmpDir, ["config", "user.email", "wt@example.com"]);

        await writeFile(join(tmpDir, "README.md"), "# Main Repo\n", "utf8");
        runGit(tmpDir, ["add", "README.md"]);
        runGit(tmpDir, ["commit", "-m", "initial commit"]);
        runGit(tmpDir, ["branch", "feature-x"]);

        const addTool = new GitWorktreeAddTool(tmpDir, { enableSeatbelt: false });
        const removeTool = new GitWorktreeRemoveTool(tmpDir, { enableSeatbelt: false });
        const listTool = new GitWorktreeListTool(tmpDir, { enableSeatbelt: false });

        const context = { goalId: "goal-wt", runId: "run-wt" };
        const wtDirRel = "worktree-1";
        const wtDirAbs = join(tmpDir, wtDirRel);

        // 1. 父目录不存在时拒绝创建
        const noParentRes = await addTool.execute({
            actionId: "act-wt-add-noparent",
            context,
            input: { path: "nonexistent-parent/child/wt", branch: "feature-x" },
        });
        assert.equal(noParentRes.kind, "failure");
        assert.equal(noParentRes.code, "PARENT_DIRECTORY_NOT_FOUND");

        // 2. 正常创建 worktree
        const addRes = await addTool.execute({
            actionId: "act-wt-add-1",
            context,
            input: { path: wtDirRel, branch: "feature-x" },
        });
        assert.equal(addRes.kind, "success");
        const addOut = addRes.output as unknown as GitWorktreeAddOutput;
        assert.equal(addOut.branch, "feature-x");
        assert.ok(existsSync(wtDirAbs));

        // 3. 列举 worktree 列表
        const listRes = await listTool.execute({
            actionId: "act-wt-list",
            context,
            input: {},
        });
        assert.equal(listRes.kind, "success");
        const listOut = listRes.output as unknown as GitWorktreeListOutput;
        assert.equal(listOut.worktrees.length, 2);
        assert.ok(listOut.worktrees.some((w) => !w.isMain && w.branch === "feature-x"));

        // 4. 重复创建已存在的路径拒绝
        const dupRes = await addTool.execute({
            actionId: "act-wt-add-dup",
            context,
            input: { path: wtDirRel, branch: "feature-x" },
        });
        assert.equal(dupRes.kind, "failure");
        assert.equal(dupRes.code, "WORKTREE_ALREADY_EXISTS");

        // 5. 禁止移除主工作树
        const rmMainRes = await removeTool.execute({
            actionId: "act-wt-rm-main",
            context,
            input: { path: "." },
        });
        assert.equal(rmMainRes.kind, "failure");
        assert.equal(rmMainRes.code, "CANNOT_REMOVE_MAIN_WORKTREE");

        // 6. 脏工作树（含未跟踪文件）安全保护：拒绝删除
        await writeFile(join(wtDirAbs, "untracked.txt"), "user data\n", "utf8");
        const rmDirtyRes = await removeTool.execute({
            actionId: "act-wt-rm-dirty",
            context,
            input: { path: wtDirRel },
        });
        assert.equal(rmDirtyRes.kind, "failure");
        assert.equal(rmDirtyRes.code, "WORKTREE_DIRTY_OR_MODIFIED");
        // 文件未被误删
        assert.ok(existsSync(join(wtDirAbs, "untracked.txt")));

        // 清理未跟踪文件后，恢复干净状态
        await rm(join(wtDirAbs, "untracked.txt"));

        // 7. 干净状态下安全移除
        const rmRes = await removeTool.execute({
            actionId: "act-wt-rm-clean",
            context,
            input: { path: wtDirRel },
        });
        assert.equal(rmRes.kind, "success");
        const rmOut = rmRes.output as unknown as GitWorktreeRemoveOutput;
        assert.ok(!existsSync(wtDirAbs));

        // 移除后 worktree 列表恢复为 1 个
        const listAfter = await listTool.execute({
            actionId: "act-wt-list-after",
            context,
            input: {},
        });
        assert.equal(listAfter.kind, "success");
        assert.equal((listAfter.output as unknown as GitWorktreeListOutput).worktrees.length, 1);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("Git worktree 工具安全边界：禁止指向 .lazygoal 与沙箱能力派生", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-wt-bound-"));

    try {
        runGit(tmpDir, ["init", "-b", "main"]);
        await mkdir(join(tmpDir, "build"));
        const addTool = new GitWorktreeAddTool(tmpDir, { enableSeatbelt: false });
        const removeTool = new GitWorktreeRemoveTool(tmpDir, { enableSeatbelt: false });

        // 验证 resolveSandboxAccess 派生写权限目录
        const access = await addTool.resolveSandboxAccess({ path: "build/wt" });
        assert.ok(access?.files);
        const canonicalRoot = await realpath(tmpDir);
        assert.ok(access.files.some((file) => file.path === join(canonicalRoot, ".git") && file.access === "write"));
        assert.ok(access.files.some((file) => file.path === join(canonicalRoot, "build") && file.access === "write"));
        assert.ok(access.files.some((file) => file.path === join(canonicalRoot, "build", "wt") && file.access === "write"));

        // 禁止在 .lazygoal 下创建 worktree
        const lgRes = await addTool.execute({
            actionId: "act-add-lg",
            input: { path: ".lazygoal/trees" },
        });
        assert.equal(lgRes.kind, "failure");
        assert.equal(lgRes.code, "PROTECTED_PATH_MODIFICATION");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
