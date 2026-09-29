import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
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
    resolveEffectiveSandboxScope,
    SANDBOX_EXEC_PATH,
} from "../src/index";

const execFileAsync = promisify(execFile);

describe("macOS Seatbelt Capability & Scope Resolution", () => {
    it("规范化解析额外文件与网络能力并拒绝内部状态", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "scope-test-"));

        try {
            const workspace = join(tempRoot, "my-project");
            const outsideDir = join(tempRoot, "outside");
            await mkdir(workspace, { recursive: true });
            await mkdir(outsideDir, { recursive: true });
            const outsideFile = join(outsideDir, "data.json");
            await writeFile(outsideFile, "{}");

            // 1. 正常额外文件与网络申请解析
            const scope = await resolveEffectiveSandboxScope(workspace, {
                files: [
                    {
                        path: outsideFile,
                        access: "read",
                        kind: "file",
                        purpose: "读取配置",
                    },
                    {
                        path: outsideDir,
                        access: "write",
                        kind: "directory_tree",
                        purpose: "写入缓存",
                    },
                ],
                network: {
                    targets: ["api.example.com"],
                    purpose: "请求数据",
                },
            });

            assert.equal(scope.network, "all_outbound");
            assert.equal(scope.extraFiles.length, 2);
            assert.ok(scope.extraFiles.some((f) => f.access === "read" && f.kind === "file"));
            assert.ok(scope.extraFiles.some((f) => f.access === "write" && f.kind === "directory_tree"));

            // 2. 严禁申请 .lazygoal 内部状态目录
            await assert.rejects(
                () => resolveEffectiveSandboxScope(workspace, {
                    files: [
                        {
                            path: join(workspace, ".lazygoal"),
                            access: "read",
                            kind: "directory_tree",
                            purpose: "窃取内部快照",
                        },
                    ],
                }),
                (err: any) => err.message.includes("严禁向受限命令开放 LazyGoal 内部状态"),
            );
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("在真实 macOS 环境中根据核准范围精准放行网络出站与额外文件", async (t) => {
        if (!isSeatbeltSupported()) {
            t.skip("当前环境不支持 macOS Seatbelt 沙箱");
            return;
        }

        const tempRoot = await mkdtemp(join(tmpdir(), "seatbelt-cap-"));
        const outsideAllowedDir = await mkdtemp(join(tmpdir(), "seatbelt-outside-allowed-"));
        const outsideForbiddenDir = await mkdtemp(join(tmpdir(), "seatbelt-outside-forbidden-"));
        const privateTmp = await createPrivateTmpDir();

        // 启动一个本地 TCP 测试服务器，用于出站连接验证
        const server = createServer();
        let port = 0;
        await new Promise<void>((resolveServer) => {
            server.listen(0, "127.0.0.1", () => {
                port = (server.address() as any).port;
                resolveServer();
            });
        });

        try {
            const rawWorkspace = join(tempRoot, "project");
            await mkdir(rawWorkspace, { recursive: true });
            const workspace = await (await import("node:fs/promises")).realpath(rawWorkspace);

            const allowedFile = join(outsideAllowedDir, "allowed.txt");
            await writeFile(allowedFile, "allowed-content");

            const forbiddenFile = join(outsideForbiddenDir, "forbidden.txt");
            await writeFile(forbiddenFile, "forbidden-content");

            // 1. 编译包含 extraReadPaths 与 network: all_outbound 的策略
            const policyWithCaps = buildSeatbeltPolicy({
                canonicalWorkspaceRoot: workspace,
                privateTmpDir: privateTmp,
                extraReadPaths: [allowedFile],
                extraWritePaths: [outsideAllowedDir],
                network: "all_outbound",
            });

            const env = filterSandboxEnvironment({
                workspaceRoot: workspace,
                privateTmpDir: privateTmp,
            });

            // (a) 网络出站连接成功（连接回环测试端口）
            const netSuccess = await execFileAsync(
                SANDBOX_EXEC_PATH,
                ["-p", policyWithCaps, "/bin/bash", "-c", `nc -z -w 1 127.0.0.1 ${port}`],
                { cwd: workspace, env },
            );
            assert.ok(netSuccess.stderr === "" || netSuccess.stderr.includes("succeeded"));

            // (b) 入站监听仍然被拒绝（不开放入站监听）
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policyWithCaps, "/bin/bash", "-c", "nc -l 127.0.0.1 29999"],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0,
            );

            // (c) 获准的额外文件可以读取
            const readAllowed = await execFileAsync(
                SANDBOX_EXEC_PATH,
                ["-p", policyWithCaps, "/bin/bash", "-c", `cat "${allowedFile}"`],
                { cwd: workspace, env },
            );
            assert.equal(readAllowed.stdout.trim(), "allowed-content");

            // (d) 未获准的额外文件依然被拒绝 (Operation not permitted)
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policyWithCaps, "/bin/bash", "-c", `cat "${forbiddenFile}"`],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0,
            );

            // (e) 获准的额外目录可以写入
            const writeAllowed = await execFileAsync(
                SANDBOX_EXEC_PATH,
                ["-p", policyWithCaps, "/bin/bash", "-c", `echo 'new' > "${outsideAllowedDir}/new.txt" && cat "${outsideAllowedDir}/new.txt"`],
                { cwd: workspace, env },
            );
            assert.equal(writeAllowed.stdout.trim(), "new");

            // (f) 未获准的额外目录写入被拒绝
            await assert.rejects(
                () => execFileAsync(
                    SANDBOX_EXEC_PATH,
                    ["-p", policyWithCaps, "/bin/bash", "-c", `touch "${outsideForbiddenDir}/new.txt"`],
                    { cwd: workspace, env },
                ),
                (err: any) => err.code !== 0,
            );
        } finally {
            server.close();
            await cleanupPrivateTmpDir(privateTmp);
            await rm(tempRoot, { recursive: true, force: true });
            await rm(outsideAllowedDir, { recursive: true, force: true });
            await rm(outsideForbiddenDir, { recursive: true, force: true });
        }
    });
});
