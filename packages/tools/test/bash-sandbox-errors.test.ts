import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { isSeatbeltSupported } from "../../sandbox/src/index";
import { BashTool } from "../src/bash";

describe("BashTool 沙箱错误分类与诊断安全测试", () => {
    it("申请额外能力而未提供 plan 时返回明确的 SANDBOX_APPROVAL_REQUIRED 且不可重试", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "bash-err-test-"));
        try {
            const tool = new BashTool(tempRoot);

            // 1. 申请额外文件但没有 plan
            const fileRes = await tool.execute({
                actionId: "action-err-1",
                input: {
                    command: "cat /var/log/system.log",
                    sandboxAccess: {
                        files: [{ path: "/var/log/system.log", access: "read", kind: "file", purpose: "查看系统日志" }],
                    },
                },
            });

            assert.equal(fileRes.kind, "failure");
            if (fileRes.kind === "failure") {
                assert.equal(fileRes.code, "SANDBOX_APPROVAL_REQUIRED");
                assert.equal(fileRes.retryable, false);
                assert.match(fileRes.message, /Permission 核准/);
                // 确保诊断中没有泄露系统敏感文件内容
                assert.doesNotMatch(fileRes.message, /system\.log/);
            }

            // 2. 申请网络但没有 plan
            const netRes = await tool.execute({
                actionId: "action-err-2",
                input: {
                    command: "curl https://example.com",
                    sandboxAccess: {
                        network: { targets: ["example.com"], purpose: "下载" },
                    },
                },
            });

            assert.equal(netRes.kind, "failure");
            if (netRes.kind === "failure") {
                assert.equal(netRes.code, "SANDBOX_APPROVAL_REQUIRED");
                assert.equal(netRes.retryable, false);
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("传入的 plan 绑定 actionId 不匹配时拒绝执行并返回 SANDBOX_APPROVAL_REQUIRED", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "bash-err-mismatch-"));
        try {
            const tool = new BashTool(tempRoot);

            const res = await tool.execute({
                actionId: "action-err-current",
                input: {
                    command: "cat /etc/hosts",
                    sandboxAccess: {
                        files: [{ path: "/etc/hosts", access: "read", kind: "file", purpose: "查看" }],
                    },
                },
                plan: {
                    actionId: "other-action-stale",
                    workspaceRoot: tempRoot,
                    scope: {
                        extraFiles: [{ canonicalPath: "/etc/hosts", access: "read", kind: "file" }],
                        network: "none",
                    },
                },
            });

            assert.equal(res.kind, "failure");
            if (res.kind === "failure") {
                assert.equal(res.code, "SANDBOX_APPROVAL_REQUIRED");
                assert.equal(res.retryable, false);
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("真实 macOS Seatbelt 下凭据严格过滤且边界拒绝与内核错误明确区分", async (t) => {
        if (!isSeatbeltSupported()) {
            t.skip("当前环境不支持 macOS Seatbelt 沙箱");
            return;
        }

        const tempRoot = await mkdtemp(join(tmpdir(), "bash-err-mac-"));
        const outsideDir = await mkdtemp(join(tmpdir(), "bash-err-outside-"));

        // 注入包含各类凭据关键词的环境变量
        process.env["MODEL_API_KEY"] = "super-secret-key-999";
        process.env["GITHUB_TOKEN"] = "ghp_secrettokenabc";
        process.env["AWS_SECRET_ACCESS_KEY"] = "awssecretkeyxyz";
        process.env["DB_PASSWORD"] = "mypassword123";

        try {
            const workspace = join(tempRoot, "my-workspace");
            await mkdir(workspace, { recursive: true });
            await mkdir(join(workspace, ".git"), { recursive: true });

            const secretFile = join(outsideDir, "unauthorized.txt");
            await writeFile(secretFile, "TOP_SECRET_FILE_CONTENT");

            const tool = new BashTool(workspace);

            // 1. 验证敏感凭据在受限环境完全不可见
            const envRes = await tool.execute({
                actionId: "action-check-env",
                input: { command: "env" },
            });
            assert.equal(envRes.kind, "success");
            if (envRes.kind === "success") {
                const stdout = (envRes.output as any).stdout;
                assert.doesNotMatch(stdout, /super-secret-key-999/);
                assert.doesNotMatch(stdout, /ghp_secrettokenabc/);
                assert.doesNotMatch(stdout, /awssecretkeyxyz/);
                assert.doesNotMatch(stdout, /mypassword123/);
            }

            // 2. 验证写入 .git 元数据被内核 Seatbelt 拦截（退出码非 0）
            const gitRes = await tool.execute({
                actionId: "action-write-git",
                input: { command: "echo 'hack' > .git/pwned" },
            });
            assert.equal(gitRes.kind, "failure");
            if (gitRes.kind === "failure") {
                assert.equal(gitRes.code, "COMMAND_FAILED");
                assert.match(gitRes.message, /Operation not permitted|Permission denied/);
            }

            // 3. 验证未获准外部文件读取被拦截，且文件内容绝对没有泄漏到输出中
            const readRes = await tool.execute({
                actionId: "action-read-outside",
                input: { command: `cat "${secretFile}"` },
            });
            assert.equal(readRes.kind, "failure");
            if (readRes.kind === "failure") {
                assert.equal(readRes.code, "COMMAND_FAILED");
                // 绝不包含未获准文件的内容
                assert.doesNotMatch(readRes.message, /TOP_SECRET_FILE_CONTENT/);
            }
        } finally {
            delete process.env["MODEL_API_KEY"];
            delete process.env["GITHUB_TOKEN"];
            delete process.env["AWS_SECRET_ACCESS_KEY"];
            delete process.env["DB_PASSWORD"];
            await rm(tempRoot, { recursive: true, force: true });
            await rm(outsideDir, { recursive: true, force: true });
        }
    });
});
