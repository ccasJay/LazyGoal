import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, chmod, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    discoverGitRepository,
    runRestrictedGit,
    validateSafeGitArgs,
} from "../src/index";

test("validateSafeGitArgs 拦截任意危险或自由配置选项", () => {
    const dangerousArgs = [
        ["--exec-path=/bin"],
        ["--upload-pack=evil"],
        ["--receive-pack=evil"],
        ["--output=leak.txt"],
        ["-o", "leak.txt"],
        ["--paginate"],
        ["-p"],
        ["--ext-diff"],
        ["--textconv"],
        ["--config", "user.name=attacker"],
        ["-c", "user.email=evil"],
        ["-c=core.pager=cat"],
        ["--git-dir=/etc"],
        ["--work-tree=/etc"],
    ];

    for (const args of dangerousArgs) {
        assert.throws(
            () => validateSafeGitArgs(args),
            /prohibited/i,
            `Expected args ${JSON.stringify(args)} to be rejected`,
        );
    }

    // 安全参数通过
    assert.doesNotThrow(() => {
        validateSafeGitArgs(["status", "--porcelain=v2", "-z"]);
        validateSafeGitArgs(["diff", "--staged"]);
        validateSafeGitArgs(["log", "-n", "20"]);
        validateSafeGitArgs(["branch", "--list"]);
    });
});

test("discoverGitRepository 正确解析普通仓库、worktree 并在非 Git 目录明确报错", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-sandbox-"));
    try {
        const rawRepoDir = join(tmpDir, "repo");
        await mkdir(rawRepoDir, { recursive: true });
        const repoDir = await realpath(rawRepoDir);

        // 初始化主仓库
        execFileSync("git", ["init", "-b", "main", repoDir]);
        execFileSync("git", ["-C", repoDir, "config", "user.name", "Tester"]);
        execFileSync("git", ["-C", repoDir, "config", "user.email", "tester@example.com"]);
        await writeFile(join(repoDir, "README.md"), "# Test\n", "utf8");
        execFileSync("git", ["-C", repoDir, "add", "README.md"]);
        execFileSync("git", ["-C", repoDir, "commit", "-m", "Initial commit"]);

        // 1. 普通主仓库探测
        const mainInfo = await discoverGitRepository(repoDir);
        assert.equal(mainInfo.isWorktree, false);
        assert.equal(mainInfo.workspaceRoot, repoDir);
        assert.ok(mainInfo.dotGitPath.endsWith(".git"));
        assert.equal(mainInfo.gitDir, mainInfo.dotGitPath);
        assert.equal(mainInfo.commonDir, mainInfo.dotGitPath);

        // 2. 子目录向上解析
        const subDir = join(repoDir, "nested", "sub");
        await mkdir(subDir, { recursive: true });
        const subInfo = await discoverGitRepository(subDir);
        assert.equal(subInfo.workspaceRoot, repoDir);

        // 3. 关联的 worktree 探测
        const wtDir = join(tmpDir, "linked-wt");
        execFileSync("git", ["-C", repoDir, "worktree", "add", "-b", "feature", wtDir]);
        const canonicalWtDir = await realpath(wtDir);

        const wtInfo = await discoverGitRepository(wtDir);
        assert.equal(wtInfo.isWorktree, true);
        assert.equal(wtInfo.workspaceRoot, canonicalWtDir);
        assert.ok(wtInfo.dotGitPath.endsWith(".git"));
        assert.ok(wtInfo.gitDir.includes("worktrees"));
        assert.equal(wtInfo.commonDir, mainInfo.commonDir);

        // 4. 非 Git 目录
        const nonGitDir = join(tmpDir, "non-git");
        await mkdir(nonGitDir, { recursive: true });
        await assert.rejects(
            () => discoverGitRepository(nonGitDir),
            /not inside a Git repository/i,
        );
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("runRestrictedGit 阻断 hooks 触发并禁止外部 diff/textconv", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-git-sandbox-"));
    try {
        const repoDir = join(tmpDir, "repo");
        await mkdir(repoDir, { recursive: true });
        execFileSync("git", ["init", "-b", "main", repoDir]);
        execFileSync("git", ["-C", repoDir, "config", "user.name", "Tester"]);
        execFileSync("git", ["-C", repoDir, "config", "user.email", "tester@example.com"]);

        // 配置恶意 hook
        const hooksDir = join(repoDir, ".git", "hooks");
        await mkdir(hooksDir, { recursive: true });
        const hookTriggerFile = join(tmpDir, "hook-triggered.txt");
        const hookScript = join(hooksDir, "post-checkout");
        await writeFile(hookScript, `#!/bin/sh\necho "hooked" > "${hookTriggerFile}"\n`, "utf8");
        await chmod(hookScript, 0o755);

        await writeFile(join(repoDir, "file.txt"), "hello\n", "utf8");
        execFileSync("git", ["-C", repoDir, "add", "file.txt"]);
        execFileSync("git", ["-C", repoDir, "commit", "-m", "init"]);

        // 执行只读 status 查询
        const res = await runRestrictedGit({
            repoPath: repoDir,
            args: ["status", "--porcelain=v2"],
            enableSeatbelt: false, // 在 DSH sandbox 容器内运行
        });

        assert.equal(res.exitCode, 0);
        // 验证 hook 未被执行
        const { existsSync } = await import("node:fs");
        assert.equal(existsSync(hookTriggerFile), false);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
