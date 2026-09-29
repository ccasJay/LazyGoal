import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import {
    buildSeatbeltPolicy,
    cleanupPrivateTmpDir,
    createPrivateTmpDir,
    filterSandboxEnvironment,
    isSeatbeltSupported,
    resolveGitProtectionPaths,
    SANDBOX_EXEC_PATH,
} from "../src/index";

const execFileAsync = promisify(execFile);

describe("macOS Seatbelt Default Sandbox", () => {
    it("过滤敏感环境变量并绑定私有临时目录与工作区", () => {
        const fakeEnv: NodeJS.ProcessEnv = {
            PATH: "/usr/bin:/bin",
            TERM: "xterm-256color",
            USER: "alice",
            OPENAI_API_KEY: "sk-secret-123456",
            ANTHROPIC_API_KEY: "ant-secret-abcdef",
            GEMINI_API_KEY: "gemini-secret",
            GITHUB_TOKEN: "ghp_1234567890",
            AWS_SECRET_ACCESS_KEY: "aws-secret",
            DATABASE_PASSWORD: "mypassword",
            PRIVATE_KEY: "id_rsa",
            CUSTOM_AUTH: "bearer token",
        };

        const cleaned = filterSandboxEnvironment({
            workspaceRoot: "/project/app",
            privateTmpDir: "/tmp/lazygoal-private-tmp",
            env: fakeEnv,
        });

        // 敏感变量彻底剔除
        assert.equal(cleaned["OPENAI_API_KEY"], undefined);
        assert.equal(cleaned["ANTHROPIC_API_KEY"], undefined);
        assert.equal(cleaned["GEMINI_API_KEY"], undefined);
        assert.equal(cleaned["GITHUB_TOKEN"], undefined);
        assert.equal(cleaned["AWS_SECRET_ACCESS_KEY"], undefined);
        assert.equal(cleaned["DATABASE_PASSWORD"], undefined);
        assert.equal(cleaned["PRIVATE_KEY"], undefined);
        assert.equal(cleaned["CUSTOM_AUTH"], undefined);

        // 安全变量保留
        assert.equal(cleaned["PATH"], "/usr/bin:/bin");
        assert.equal(cleaned["TERM"], "xterm-256color");
        assert.equal(cleaned["USER"], "alice");

        // 私有目录与工作区重定向
        assert.equal(cleaned["TMPDIR"], "/tmp/lazygoal-private-tmp");
        assert.equal(cleaned["TEMP"], "/tmp/lazygoal-private-tmp");
        assert.equal(cleaned["TMP"], "/tmp/lazygoal-private-tmp");
        assert.equal(cleaned["HOME"], "/tmp/lazygoal-private-tmp");
        assert.equal(cleaned["PWD"], "/project/app");
    });

    it("生成包含 system.sb 与保护路径的默认拒绝策略", () => {
        const policy = buildSeatbeltPolicy({
            canonicalWorkspaceRoot: "/Users/test/workspace",
            privateTmpDir: "/tmp/sandbox-123",
            protectedPaths: ["/Users/test/workspace/.git", "/git/repo/worktrees/1"],
        });

        assert.match(policy, /\(version 1\)/);
        assert.match(policy, /\(deny default\)/);
        assert.match(policy, /\(import "system\.sb"\)/);
        assert.match(policy, /\(subpath "\/Users\/test\/workspace"\)/);
        assert.match(policy, /\(subpath "\/tmp\/sandbox-123"\)/);
        assert.match(policy, /\(subpath "\/Users\/test\/workspace\/\.lazygoal"\)/);
        assert.match(policy, /\(subpath "\/Users\/test\/workspace\/\.git"\)/);
        assert.match(policy, /\(subpath "\/git\/repo\/worktrees\/1"\)/);

        // 默认无网络放行
        assert.doesNotMatch(policy, /network-outbound/);
    });

    it("正确解析主仓库与 worktree 的 Git 保护路径", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "git-protect-"));

        try {
            // 1. 普通 .git 目录
            const normalProject = join(tempRoot, "normal");
            await mkdir(join(normalProject, ".git"), { recursive: true });
            const normalPaths = await resolveGitProtectionPaths(normalProject);
            assert.ok(normalPaths.some((p) => p.endsWith("/normal/.git")));

            // 2. worktree 的 .git 文件
            const worktreeProject = join(tempRoot, "worktree");
            const fakeCommonGit = join(tempRoot, "main-git-dir");
            await mkdir(worktreeProject, { recursive: true });
            await mkdir(fakeCommonGit, { recursive: true });
            await writeFile(join(worktreeProject, ".git"), `gitdir: ${fakeCommonGit}\n`);

            const worktreePaths = await resolveGitProtectionPaths(worktreeProject);
            assert.ok(worktreePaths.some((p) => p.endsWith("/worktree/.git")));
            assert.ok(worktreePaths.some((p) => p.includes("main-git-dir")));
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("在真实 macOS 环境中启动受限命令并强制执行边界", async (t) => {
        if (!isSeatbeltSupported()) {
            t.skip("当前环境不支持 macOS Seatbelt 沙箱");
            return;
        }

        const tempRoot = await mkdtemp(join(tmpdir(), "seatbelt-live-"));
        const outsideDir = await mkdtemp(join(tmpdir(), "seatbelt-outside-"));
        const privateTmp = await createPrivateTmpDir();

        try {
            const rawWorkspace = join(tempRoot, "project");
            await mkdir(rawWorkspace, { recursive: true });
            await mkdir(join(rawWorkspace, ".git"), { recursive: true });
            await mkdir(join(rawWorkspace, ".lazygoal"), { recursive: true });
            const workspace = await (await import("node:fs/promises")).realpath(rawWorkspace);

            const outsideSecret = join(outsideDir, "secret.txt");
            await writeFile(outsideSecret, "sensitive-host-data");

            const policy = buildSeatbeltPolicy({
                canonicalWorkspaceRoot: workspace,
                privateTmpDir: privateTmp,
                protectedPaths: [join(workspace, ".git")],
            });

            const env = filterSandboxEnvironment({
                workspaceRoot: workspace,
                privateTmpDir: privateTmp,
            });

            // 1. 项目内读写正常
            const runSuccess = await execFileAsync(
                SANDBOX_EXEC_PATH,
                ["-p", policy, "/bin/bash", "-c", "echo 'hello from sandbox' > test.txt && cat test.txt"],
                { cwd: workspace, env },
            );
            assert.equal(runSuccess.stdout.trim(), "hello from sandbox");

            // 2. 尝试读取项目外私密文件 -> 必须被 Seatbelt 拦截 (Operation not permitted)
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policy, "/bin/bash", "-c", `cat "${outsideSecret}"`],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0 && (err.stderr?.includes("Operation not permitted") || err.code === 1),
            );

            // 3. 尝试写入项目内 .git -> 必须被拒绝
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policy, "/bin/bash", "-c", `touch "${workspace}/.git/hack.txt"`],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0,
            );

            // 4. 尝试写入项目内 .lazygoal -> 必须被拒绝
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policy, "/bin/bash", "-c", `touch "${workspace}/.lazygoal/hack.txt"`],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0,
            );

            // 5. 尝试网络连接（本地回环） -> 默认断网，必须失败
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policy, "/bin/bash", "-c", `nc -z -w 1 127.0.0.1 80`],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0,
            );

            // 6. 验证子进程继承受限规则（通过 bash 派生 python/sh）
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policy, "/bin/bash", "-c", `python3 -c "open('${outsideSecret}').read()"`],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0,
            );
        } finally {
            await cleanupPrivateTmpDir(privateTmp);
            await rm(tempRoot, { recursive: true, force: true });
            await rm(outsideDir, { recursive: true, force: true });
        }
    });
});
