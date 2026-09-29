import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { isSeatbeltSupported } from "../../sandbox/src/index";
import { BashTool } from "../src/bash";

describe("BashTool macOS Seatbelt Default Integration", () => {
    it("在 macOS 上默认通过 Seatbelt 执行命令并保证安全隔离", async (t) => {
        if (!isSeatbeltSupported()) {
            t.skip("当前环境不支持 macOS Seatbelt 沙箱");
            return;
        }

        const tempRoot = await mkdtemp(join(tmpdir(), "bash-tool-sandbox-"));
        const outsideDir = await mkdtemp(join(tmpdir(), "bash-tool-outside-"));

        // 设置假的模型凭据环境变量，验证沙箱命令中不可见
        process.env["OPENAI_API_KEY"] = "sk-super-secret-key-123";
        process.env["CUSTOM_API_SECRET"] = "secret-passphrase";

        try {
            const workspace = join(tempRoot, "my-project");
            await mkdir(workspace, { recursive: true });
            await mkdir(join(workspace, ".git"), { recursive: true });
            await mkdir(join(workspace, ".lazygoal"), { recursive: true });

            const outsideFile = join(outsideDir, "host-secret.txt");
            await writeFile(outsideFile, "super-confidential");

            const tool = new BashTool(workspace);

            // 1. 正常项目内命令执行成功
            const res1 = await tool.execute({
                actionId: "action-1",
                input: { command: "echo 'hello project' > output.txt && cat output.txt" },
            });
            assert.equal(res1.kind, "success");
            if (res1.kind === "success") {
                assert.match((res1.output as any).stdout, /hello project/);
            }

            // 2. 尝试读取项目外文件 -> 失败
            const res2 = await tool.execute({
                actionId: "action-2",
                input: { command: `cat "${outsideFile}"` },
            });
            assert.equal(res2.kind, "failure");
            assert.equal(res2.code, "COMMAND_FAILED");
            assert.match(res2.message, /Operation not permitted/);

            // 3. 尝试写入项目外文件 -> 失败
            const res3 = await tool.execute({
                actionId: "action-3",
                input: { command: `touch "${outsideDir}/hack.txt"` },
            });
            assert.equal(res3.kind, "failure");
            assert.equal(res3.code, "COMMAND_FAILED");

            // 4. 尝试写入 .git 保护目录 -> 失败
            const res4 = await tool.execute({
                actionId: "action-4",
                input: { command: `touch "${workspace}/.git/bad.txt"` },
            });
            assert.equal(res4.kind, "failure");
            assert.equal(res4.code, "COMMAND_FAILED");

            // 5. 尝试写入 .lazygoal 内部状态目录 -> 失败
            const res5 = await tool.execute({
                actionId: "action-5",
                input: { command: `touch "${workspace}/.lazygoal/bad.txt"` },
            });
            assert.equal(res5.kind, "failure");
            assert.equal(res5.code, "COMMAND_FAILED");

            // 6. 验证模型凭据在环境变量中不可见
            const resEnv = await tool.execute({
                actionId: "action-6",
                input: { command: "printenv" },
            });
            assert.equal(resEnv.kind, "success");
            if (resEnv.kind === "success") {
                const stdout = (resEnv.output as any).stdout as string;
                assert.doesNotMatch(stdout, /OPENAI_API_KEY/);
                assert.doesNotMatch(stdout, /sk-super-secret-key/);
                assert.doesNotMatch(stdout, /CUSTOM_API_SECRET/);
            }

            // 7. 验证临时目录被重定向到私有临时目录
            const resTmp = await tool.execute({
                actionId: "action-7",
                input: { command: "echo $TMPDIR" },
            });
            assert.equal(resTmp.kind, "success");
            if (resTmp.kind === "success") {
                const stdout = (resTmp.output as any).stdout.trim();
                assert.match(stdout, /lazygoal-sandbox-/);
            }

            // 8. 默认断网：尝试连接网络 -> 失败
            const resNet = await tool.execute({
                actionId: "action-8",
                input: { command: "nc -z -w 1 127.0.0.1 80" },
            });
            assert.equal(resNet.kind, "failure");
            assert.equal(resNet.code, "COMMAND_FAILED");
        } finally {
            delete process.env["OPENAI_API_KEY"];
            delete process.env["CUSTOM_API_SECRET"];
            await rm(tempRoot, { recursive: true, force: true });
            await rm(outsideDir, { recursive: true, force: true });
        }
    });
});
