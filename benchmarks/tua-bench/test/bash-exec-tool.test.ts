import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    BASH_EXEC_MAX_OUTPUT_BYTES,
    BashExecTool,
    truncateOutput,
} from "../src/bash-exec-tool.js";

describe("BashExecTool", () => {
    const tool = new BashExecTool();

    it("正常执行命令并返回 stdout、stderr 和 exitCode", async () => {
        const observation = await tool.execute({
            actionId: "act-normal",
            input: { command: "echo 'hello from bash_exec'" },
        });

        assert.equal(observation.kind, "success");
        assert.equal(observation.summary, "命令执行成功");
        const output = observation.output as { stdout: string; stderr: string; exitCode: number };
        assert.match(output.stdout, /hello from bash_exec/);
        assert.equal(output.stderr, "");
        assert.equal(output.exitCode, 0);
    });

    it("命令失败时正确返回非零 exitCode 和 stderr", async () => {
        const observation = await tool.execute({
            actionId: "act-fail",
            input: { command: "echo 'an error occurred' >&2; exit 42" },
        });

        assert.equal(observation.kind, "failure");
        assert.equal(observation.code, "COMMAND_FAILED");
        assert.match(observation.message, /an error occurred/);
        assert.equal(observation.retryable, true);
    });

    it("超过 100KB 的输出被自动截断", async () => {
        // 生成超过 100KB 的大输出（约 150KB）
        const observation = await tool.execute({
            actionId: "act-large",
            input: { command: "python3 -c \"print('A' * 150000)\"" },
        });

        assert.equal(observation.kind, "success");
        const output = observation.output as { stdout: string; stderr: string; exitCode: number };
        assert.ok(output.stdout.length > 0);
        assert.match(output.stdout, /已截断：输出超出 102400 字节限制/);
        assert.ok(Buffer.byteLength(output.stdout, "utf8") < 150000);
    });

    it("truncateOutput 辅助函数边界测试", () => {
        const smallText = "short string";
        assert.equal(truncateOutput(smallText, 100), smallText);

        const bigText = "X".repeat(200);
        const truncated = truncateOutput(bigText, 50);
        assert.ok(truncated.startsWith("X".repeat(50)));
        assert.match(truncated, /已截断/);
    });

    it("命令超时被中断并返回超时错误", async () => {
        const startTime = Date.now();
        const observation = await tool.execute({
            actionId: "act-timeout",
            input: {
                command: "sleep 5",
                timeoutMs: 150,
            },
        });
        const duration = Date.now() - startTime;

        assert.equal(observation.kind, "failure");
        assert.equal(observation.code, "COMMAND_TIMEOUT");
        assert.match(observation.message, /Command timed out after 150ms/);
        assert.equal(observation.retryable, true);
        assert.ok(duration < 2000, `Execution should finish soon after timeout, took ${duration}ms`);
    });

    it("输入校验拒绝空命令或非法格式", () => {
        assert.equal(tool.validateInput(null).ok, false);
        assert.equal(tool.validateInput({}).ok, false);
        assert.equal(tool.validateInput({ command: "" }).ok, false);
        assert.equal(tool.validateInput({ command: "   " }).ok, false);
        assert.equal(tool.validateInput({ command: "ls", timeoutMs: -10 }).ok, false);

        const validRes = tool.validateInput({ command: "pwd", timeoutMs: 5000 });
        assert.equal(validRes.ok, true);
    });
});
