import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    GitBranchListTool,
    GitDiffTool,
    GitLogTool,
    GitShowTool,
    GitStatusTool,
    GitWorktreeListTool,
    type GitBranchListOutput,
    type GitDiffOutput,
    type GitLogOutput,
    type GitShowOutput,
    type GitStatusOutput,
    type GitWorktreeListOutput,
} from "../src/index";

test("Git 只读工具集：status, diff, log, show, branch_list, worktree_list 全功能验证", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-read-"));
    try {
        const rawRepoDir = join(tmpDir, "repo");
        await mkdir(rawRepoDir, { recursive: true });
        const repoDir = await realpath(rawRepoDir);

        // 初始化仓库
        execFileSync("git", ["init", "-b", "main", repoDir]);
        execFileSync("git", ["-C", repoDir, "config", "user.name", "TestUser"]);
        execFileSync("git", ["-C", repoDir, "config", "user.email", "test@example.com"]);

        // 提交初始文件
        await writeFile(join(repoDir, "file1.txt"), "line 1\nline 2\n", "utf8");
        execFileSync("git", ["-C", repoDir, "add", "file1.txt"]);
        execFileSync("git", ["-C", repoDir, "commit", "-m", "First commit\n\nDetailed initial body."]);

        // 第二次提交
        await writeFile(join(repoDir, "file2.txt"), "hello world\n", "utf8");
        execFileSync("git", ["-C", repoDir, "add", "file2.txt"]);
        execFileSync("git", ["-C", repoDir, "commit", "-m", "Second commit"]);

        // 制造工作区和暂存区状态
        await writeFile(join(repoDir, "file1.txt"), "line 1 modified\nline 2\n", "utf8");
        await writeFile(join(repoDir, "staged.txt"), "staged content\n", "utf8");
        execFileSync("git", ["-C", repoDir, "add", "staged.txt"]);
        await writeFile(join(repoDir, "untracked.txt"), "untracked file\n", "utf8");

        // 实例化工具（禁用 Seatbelt 兼容 DSH sandbox 容器）
        const statusTool = new GitStatusTool(repoDir, { enableSeatbelt: false });
        const diffTool = new GitDiffTool(repoDir, { enableSeatbelt: false });
        const logTool = new GitLogTool(repoDir, { enableSeatbelt: false });
        const showTool = new GitShowTool(repoDir, { enableSeatbelt: false });
        const branchTool = new GitBranchListTool(repoDir, { enableSeatbelt: false });
        const worktreeTool = new GitWorktreeListTool(repoDir, { enableSeatbelt: false });

        const context = { goalId: "goal-1", runId: "run-1" };

        // 1. git_status 验证
        const statusRes = await statusTool.execute({
            actionId: "act-status",
            context,
            input: {},
        });
        assert.equal(statusRes.kind, "success");
        const statusOut = statusRes.output as unknown as GitStatusOutput;
        assert.equal(statusOut.clean, false);
        assert.equal(statusOut.branch, "main");
        const paths = statusOut.entries.map((e) => e.path);
        assert.ok(paths.includes("file1.txt"));
        assert.ok(paths.includes("staged.txt"));
        assert.ok(paths.includes("untracked.txt"));

        // status 分页截断与游标测试
        const pagedStatusRes = await statusTool.execute({
            actionId: "act-status-paged",
            context,
            input: { maxEntries: 1 },
        });
        assert.equal(pagedStatusRes.kind, "success");
        const pagedStatusOut = pagedStatusRes.output as unknown as GitStatusOutput;
        assert.equal(pagedStatusOut.entries.length, 1);
        assert.equal(pagedStatusOut.truncated, true);
        assert.ok(pagedStatusOut.nextCursor);

        // 使用游标获取下一页
        const nextStatusRes = await statusTool.execute({
            actionId: "act-status-next",
            context,
            input: { maxEntries: 2, cursor: pagedStatusOut.nextCursor },
        });
        assert.equal(nextStatusRes.kind, "success");
        const nextStatusOut = nextStatusRes.output as unknown as GitStatusOutput;
        assert.equal(nextStatusOut.entries.length, 2);

        // 2. git_diff 验证（工作区差异与暂存区差异）
        const wtDiffRes = await diffTool.execute({
            actionId: "act-diff-wt",
            context,
            input: {},
        });
        assert.equal(wtDiffRes.kind, "success");
        const wtDiffOut = wtDiffRes.output as unknown as GitDiffOutput;
        assert.match(wtDiffOut.diff, /line 1 modified/);

        const stagedDiffRes = await diffTool.execute({
            actionId: "act-diff-staged",
            context,
            input: { staged: true },
        });
        assert.equal(stagedDiffRes.kind, "success");
        const stagedDiffOut = stagedDiffRes.output as unknown as GitDiffOutput;
        assert.match(stagedDiffOut.diff, /staged content/);

        // diff 分页截断
        const pagedDiffRes = await diffTool.execute({
            actionId: "act-diff-paged",
            context,
            input: { maxLines: 2 },
        });
        assert.equal(pagedDiffRes.kind, "success");
        const pagedDiffOut = pagedDiffRes.output as unknown as GitDiffOutput;
        assert.equal(pagedDiffOut.truncated, true);
        assert.ok(pagedDiffOut.nextCursor);

        // 3. git_log 验证
        const logRes = await logTool.execute({
            actionId: "act-log",
            context,
            input: { maxCount: 1 },
        });
        assert.equal(logRes.kind, "success");
        const logOut = logRes.output as unknown as GitLogOutput;
        assert.equal(logOut.commits.length, 1);
        assert.equal(logOut.commits[0]!.subject, "Second commit");
        assert.equal(logOut.commits[0]!.author, "TestUser");
        assert.equal(logOut.hasMore, true);
        assert.ok(logOut.nextCursor);

        // log 游标续查
        const logPage2 = await logTool.execute({
            actionId: "act-log-2",
            context,
            input: { maxCount: 1, cursor: logOut.nextCursor },
        });
        assert.equal(logPage2.kind, "success");
        const logOut2 = logPage2.output as unknown as GitLogOutput;
        assert.equal(logOut2.commits.length, 1);
        assert.equal(logOut2.commits[0]!.subject, "First commit");
        assert.equal(logOut2.commits[0]!.body, "Detailed initial body.");

        // 4. git_show 验证
        const showRes = await showTool.execute({
            actionId: "act-show",
            context,
            input: { object: "HEAD" },
        });
        assert.equal(showRes.kind, "success");
        const showOut = showRes.output as unknown as GitShowOutput;
        assert.match(showOut.content, /Second commit/);
        assert.ok(showOut.resolvedHash.length >= 40);

        // 不存在的对象测试
        const showMissing = await showTool.execute({
            actionId: "act-show-missing",
            context,
            input: { object: "non-existent-commit-hash" },
        });
        assert.equal(showMissing.kind, "failure");
        if (showMissing.kind === "failure") {
            assert.equal(showMissing.code, "GIT_OBJECT_NOT_FOUND");
        }

        // 5. git_branch_list 验证
        execFileSync("git", ["-C", repoDir, "branch", "feat-test"]);
        const branchRes = await branchTool.execute({
            actionId: "act-branch",
            context,
            input: {},
        });
        assert.equal(branchRes.kind, "success");
        const branchOut = branchRes.output as unknown as GitBranchListOutput;
        assert.equal(branchOut.currentBranch, "main");
        const branchNames = branchOut.branches.map((b) => b.name);
        assert.ok(branchNames.includes("main"));
        assert.ok(branchNames.includes("feat-test"));

        // 6. git_worktree_list 验证
        const wtDir = join(tmpDir, "worktree-1");
        execFileSync("git", ["-C", repoDir, "worktree", "add", wtDir, "feat-test"]);
        const canonicalWtDir = await realpath(wtDir);

        const wtRes = await worktreeTool.execute({
            actionId: "act-worktree",
            context,
            input: {},
        });
        assert.equal(wtRes.kind, "success");
        const wtOut = wtRes.output as unknown as GitWorktreeListOutput;
        assert.equal(wtOut.worktrees.length, 2);
        assert.equal(wtOut.worktrees[0]!.isMain, true);
        assert.equal(wtOut.worktrees[1]!.isMain, false);
        assert.equal(wtOut.worktrees[1]!.path, canonicalWtDir);
        assert.equal(wtOut.worktrees[1]!.branch, "feat-test");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("非 Git 仓库与非法游标报错诊断明确", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-read-non-"));
    try {
        const nonRepoDir = await realpath(tmpDir);
        const statusTool = new GitStatusTool(nonRepoDir, { enableSeatbelt: false });

        // 1. 非 Git 仓库测试
        const res = await statusTool.execute({
            actionId: "act-non-repo",
            context: { goalId: "goal-1", runId: "run-1" },
            input: {},
        });

        assert.equal(res.kind, "failure");
        if (res.kind === "failure") {
            assert.equal(res.code, "NOT_A_GIT_REPOSITORY");
            assert.match(res.message, /not inside a Git repository/i);
        }

        // 2. 初始化为合法仓库后测试非法游标校验
        execFileSync("git", ["init", "-b", "main", nonRepoDir]);
        execFileSync("git", ["-C", nonRepoDir, "config", "user.name", "Tester"]);
        execFileSync("git", ["-C", nonRepoDir, "config", "user.email", "tester@example.com"]);
        await writeFile(join(nonRepoDir, "init.txt"), "hello", "utf8");
        execFileSync("git", ["-C", nonRepoDir, "add", "init.txt"]);
        execFileSync("git", ["-C", nonRepoDir, "commit", "-m", "init"]);

        const invalidCursorRes = await statusTool.execute({
            actionId: "act-bad-cursor",
            context: { goalId: "goal-1", runId: "run-1" },
            input: { cursor: "corrupted-cursor-string" },
        });
        assert.equal(invalidCursorRes.kind, "failure");
        if (invalidCursorRes.kind === "failure") {
            assert.equal(invalidCursorRes.code, "INVALID_CURSOR");
        }
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
