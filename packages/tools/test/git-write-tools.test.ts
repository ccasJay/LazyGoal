import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    GitAddTool,
    GitCommitTool,
    GitBranchCreateTool,
    GitBranchSwitchTool,
    type GitAddOutput,
    type GitCommitOutput,
    type GitBranchCreateOutput,
    type GitBranchSwitchOutput,
} from "../src/index";
import { GitMutex, validateSafeGitWriteArgs } from "../../sandbox/src/index";

function runGit(cwd: string, args: string[]): string {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

test("validateSafeGitWriteArgs 拦截危险写操作参数与选项注入", () => {
    // 拦截 --no-verify, -n, --amend, --force, -f, -D, -B, -c 等
    assert.throws(() => validateSafeGitWriteArgs(["commit", "--no-verify", "-m", "msg"]), /Dangerous or unauthorized Git write option/);
    assert.throws(() => validateSafeGitWriteArgs(["commit", "-n", "-m", "msg"]), /Dangerous or unauthorized Git write option/);
    assert.throws(() => validateSafeGitWriteArgs(["commit", "--amend", "-m", "msg"]), /Dangerous or unauthorized Git write option/);
    assert.throws(() => validateSafeGitWriteArgs(["branch", "-D", "bad"]), /Dangerous or unauthorized Git write option/);
    assert.throws(() => validateSafeGitWriteArgs(["branch", "--force", "bad"]), /Dangerous or unauthorized Git write option/);
    assert.throws(() => validateSafeGitWriteArgs(["switch", "-f", "bad"]), /Dangerous or unauthorized Git write option/);
    assert.throws(() => validateSafeGitWriteArgs(["add", "-c", "core.hooksPath=/dev/null", "file"]), /Dangerous or unauthorized Git option/);
});

test("GitMutex 实现进程内同一仓库路径的排他串行化", async () => {
    const key = "/tmp/repo-mock";
    const order: number[] = [];

    const p1 = GitMutex.withLock(key, async () => {
        order.push(1);
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push(2);
    });

    const p2 = GitMutex.withLock(key, async () => {
        order.push(3);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(4);
    });

    await Promise.all([p1, p2]);
    assert.deepEqual(order, [1, 2, 3, 4]);
});

test("Git 写操作工具：add, commit, branch_create, branch_switch 完整生命周期", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-write-test-"));

    try {
        // 初始化真实 Git 仓库
        runGit(tmpDir, ["init", "-b", "main"]);
        runGit(tmpDir, ["config", "user.name", "InitialAuthor"]);
        runGit(tmpDir, ["config", "user.email", "initial@example.com"]);

        const addTool = new GitAddTool(tmpDir, { enableSeatbelt: false });
        const commitTool = new GitCommitTool(tmpDir, { enableSeatbelt: false });
        const branchCreateTool = new GitBranchCreateTool(tmpDir, { enableSeatbelt: false });
        const branchSwitchTool = new GitBranchSwitchTool(tmpDir, { enableSeatbelt: false });

        const context = { goalId: "goal-1", runId: "run-1" };

        // 1. 创建文件并 git_add
        await writeFile(join(tmpDir, "file1.txt"), "hello world\n", "utf8");
        await writeFile(join(tmpDir, "file2.txt"), "foo bar\n", "utf8");

        const addRes = await addTool.execute({
            actionId: "act-add-1",
            context,
            input: { paths: ["file1.txt", "file2.txt"] },
        });

        assert.equal(addRes.kind, "success");
        const addOut = addRes.output as unknown as GitAddOutput;
        assert.deepEqual(addOut.stagedPaths, ["file1.txt", "file2.txt"]);

        // 2. git_commit
        const commitRes = await commitTool.execute({
            actionId: "act-commit-1",
            context,
            input: {
                message: "feat: initial commit",
                author: { name: "CustomCommitter", email: "custom@example.com" },
            },
        });

        assert.equal(commitRes.kind, "success");
        const commitOut = commitRes.output as unknown as GitCommitOutput;
        assert.ok(commitOut.commitHash.length >= 40);
        assert.equal(commitOut.summary, "feat: initial commit");
        assert.equal(commitOut.branch, "main");

        // 验证提交日志确实包含作者
        const logText = runGit(tmpDir, ["log", "-1", "--format=%an <%ae> %s"]);
        assert.match(logText, /CustomCommitter <custom@example.com> feat: initial commit/);

        // 3. 空暂存区提交拒绝
        const emptyCommit = await commitTool.execute({
            actionId: "act-commit-empty",
            context,
            input: { message: "empty" },
        });
        assert.equal(emptyCommit.kind, "failure");
        assert.equal(emptyCommit.code, "NOTHING_TO_COMMIT");

        // 4. git_branch_create
        const branchCreateRes = await branchCreateTool.execute({
            actionId: "act-bc-1",
            context,
            input: { branch: "feat-a" },
        });
        assert.equal(branchCreateRes.kind, "success");
        const bcOut = branchCreateRes.output as unknown as GitBranchCreateOutput;
        assert.equal(bcOut.branch, "feat-a");
        assert.equal(bcOut.startPoint, "HEAD");

        // 分支已存在时拒绝
        const duplicateBranch = await branchCreateTool.execute({
            actionId: "act-bc-dup",
            context,
            input: { branch: "feat-a" },
        });
        assert.equal(duplicateBranch.kind, "failure");
        assert.equal(duplicateBranch.code, "BRANCH_ALREADY_EXISTS");

        // 非法分支名拒绝
        const invalidBranch = await branchCreateTool.execute({
            actionId: "act-bc-inv",
            context,
            input: { branch: "bad..branch" },
        });
        assert.equal(invalidBranch.kind, "failure");
        assert.equal(invalidBranch.code, "INVALID_BRANCH_NAME");

        // 5. git_branch_switch 切换已有分支
        const switchRes = await branchSwitchTool.execute({
            actionId: "act-sw-1",
            context,
            input: { branch: "feat-a" },
        });
        assert.equal(switchRes.kind, "success");
        const swOut = switchRes.output as unknown as GitBranchSwitchOutput;
        assert.equal(swOut.currentBranch, "feat-a");
        assert.equal(swOut.previousBranch, "main");

        // 6. git_branch_switch createIfNotExists 自动创建并切换
        const switchCreateRes = await branchSwitchTool.execute({
            actionId: "act-sw-c",
            context,
            input: { branch: "feat-b", createIfNotExists: true },
        });
        assert.equal(switchCreateRes.kind, "success");
        const swcOut = switchCreateRes.output as unknown as GitBranchSwitchOutput;
        assert.equal(swcOut.currentBranch, "feat-b");
        assert.equal(swcOut.previousBranch, "feat-a");

        // 7. 未提交改动冲突阻止切换 (Dirty working tree protection)
        // 在 feat-b 修改 file1.txt 并提交
        await writeFile(join(tmpDir, "file1.txt"), "diverged on feat-b\n", "utf8");
        await addTool.execute({ actionId: "act-add-b", context, input: { paths: ["file1.txt"] } });
        await commitTool.execute({ actionId: "act-cmt-b", context, input: { message: "feat-b mod" } });

        // 切回 main
        await branchSwitchTool.execute({ actionId: "act-sw-main", context, input: { branch: "main" } });

        // 在 main 下把 file1.txt 修改（未提交），此时尝试切换到 feat-b 应当被 Git 拒绝以防覆盖本地修改
        await writeFile(join(tmpDir, "file1.txt"), "local uncommitted changes in main\n", "utf8");

        const dirtySwitch = await branchSwitchTool.execute({
            actionId: "act-sw-dirty",
            context,
            input: { branch: "feat-b" },
        });

        assert.equal(dirtySwitch.kind, "failure");
        assert.equal(dirtySwitch.code, "DIRTY_WORKING_TREE");
        // 本地修改未被清除或覆写
        const currentContent = runGit(tmpDir, ["status", "--porcelain"]);
        assert.match(currentContent, /M file1.txt/);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("Git commit 钩子阻断保护与受保护路径防篡改", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-hook-test-"));

    try {
        runGit(tmpDir, ["init", "-b", "main"]);
        runGit(tmpDir, ["config", "user.name", "HookAuthor"]);
        runGit(tmpDir, ["config", "user.email", "hook@example.com"]);

        const addTool = new GitAddTool(tmpDir, { enableSeatbelt: false });
        const commitTool = new GitCommitTool(tmpDir, { enableSeatbelt: false });
        const context = { goalId: "goal-hook", runId: "run-hook" };

        // 1. 禁止暂存 .lazygoal
        const addLazyGoal = await addTool.execute({
            actionId: "act-add-lg",
            context,
            input: { paths: [".lazygoal/metadata.json"] },
        });
        assert.equal(addLazyGoal.kind, "failure");
        assert.equal(addLazyGoal.code, "PROTECTED_PATH_MODIFICATION");

        // 2. 正常加入文件
        await writeFile(join(tmpDir, "app.js"), "console.log(1);\n", "utf8");
        await addTool.execute({ actionId: "act-add-app", context, input: { paths: ["app.js"] } });

        // 安装失败的 pre-commit 钩子
        const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
        await writeFile(hookPath, "#!/bin/sh\necho 'pre-commit hook rejected' >&2\nexit 1\n", "utf8");
        await chmod(hookPath, 0o755);

        // 执行 commit 应当被钩子拒绝
        const hookFailCommit = await commitTool.execute({
            actionId: "act-commit-hook",
            context,
            input: { message: "feat: should fail due to hook" },
        });

        assert.equal(hookFailCommit.kind, "failure");
        assert.equal(hookFailCommit.code, "HOOK_DECLINED");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
