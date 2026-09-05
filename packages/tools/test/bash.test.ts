import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { JsonValue } from "../../runtime/src/index";
import {
    createToolRegistration,
    ExecutionAbortedError,
} from "../../runtime/src/index";
import {
    BASH_MAX_OUTPUT_CHARS,
    BASH_MAX_TIMEOUT_MS,
    BASH_TOOL_ID,
    BashTool,
} from "../src/index";

function asJsonValue(value: unknown): JsonValue {
    return value as JsonValue;
}

test("BashTool 执行成功命令并声明 manual replay", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const tool = new BashTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-1",
            input: { command: "echo hello" },
        });

        assert.equal(tool.definition.id, BASH_TOOL_ID);
        assert.equal(tool.replayPolicy, "manual");
        assert.deepEqual(tool.validate({ command: "ls" }), { ok: true });
        assert.deepEqual(result, {
            kind: "success",
            output: {
                exitCode: 0,
                stdout: "hello\n",
                stderr: "",
            },
            summary: "命令执行成功",
        });
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 以 workspaceRoot 真实路径作为 cwd", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-pwd",
            input: { command: "pwd -P" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as { stdout: string };
            assert.equal(output.stdout.trim(), await realpath(workspaceRoot));
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 将非零退出码作为领域 failure Observation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-exit-3",
            input: { command: "exit 3" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "COMMAND_FAILED",
            message: "命令退出码 3",
            retryable: true,
        });
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 在失败 message 中携带截断后的输出", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-fail-output",
            input: { command: "echo out; echo err >&2; exit 1" },
        });

        assert.equal(result.kind, "failure");
        if (result.kind === "failure") {
            assert.equal(result.code, "COMMAND_FAILED");
            assert.match(result.message, /命令退出码 1/);
            assert.match(result.message, /out/);
            assert.match(result.message, /err/);
            assert.equal(result.retryable, true);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 超时被终止并返回 COMMAND_TIMEOUT", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-timeout",
            input: { command: "sleep 5", timeoutMs: 100 },
        });

        assert.equal(result.kind, "failure");
        if (result.kind === "failure") {
            assert.equal(result.code, "COMMAND_TIMEOUT");
            assert.match(result.message, /100ms/);
            assert.equal(result.retryable, true);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 截断超长输出并保留尾部", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-truncate",
            input: { command: "printf 'a%.0s' {1..20000}" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as { stdout: string };
            assert.match(output.stdout, /^\[\.\.\.已省略前 10000 字符\.\.\.\]/);
            assert.equal(
                output.stdout.length,
                "[...已省略前 10000 字符...]".length + 1 + BASH_MAX_OUTPUT_CHARS,
            );
            assert.equal(
                output.stdout.slice(-BASH_MAX_OUTPUT_CHARS),
                "a".repeat(BASH_MAX_OUTPUT_CHARS),
            );
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 拒绝非法输入", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const tool = new BashTool(workspaceRoot);
        const registration = createToolRegistration(tool);
        const invalidInputs: unknown[] = [
            null,
            [],
            {},
            { timeoutMs: 100 },
            { command: "" },
            { command: "   " },
            { command: 42 },
            { command: "ls", timeoutMs: "100" },
            { command: "ls", extra: true },
            { command: "ls", timeoutMs: 0 },
            { command: "ls", timeoutMs: -1 },
            { command: "ls", timeoutMs: 1.5 },
            { command: "ls", timeoutMs: BASH_MAX_TIMEOUT_MS + 1 },
            { command: "ls\0rm" },
        ];

        for (const input of invalidInputs) {
            const result = registration.prepare(asJsonValue(input));

            assert.equal(result.ok, false, `expected reject: ${JSON.stringify(input)}`);
            if (!result.ok) {
                assert.equal(result.error.code, "INVALID_TOOL_INPUT");
            }
        }

        assert.deepEqual(tool.validate({ command: "ls" }), { ok: true });
        assert.deepEqual(
            tool.validate({ command: "ls", timeoutMs: BASH_MAX_TIMEOUT_MS }),
            { ok: true },
        );

        const result = registration.prepare({ command: "" });
        assert.equal(result.ok, false);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool rejects an already-aborted execution before spawning", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const controller = new AbortController();
        controller.abort();
        const tool = new BashTool(workspaceRoot);

        await assert.rejects(
            () => tool.execute(
                {
                    actionId: "action-aborted",
                    input: { command: "echo hello" },
                },
                { signal: controller.signal },
            ),
            (error: unknown) => error instanceof ExecutionAbortedError,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 中止运行中的命令并传播 ExecutionAbortedError", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const controller = new AbortController();
        const tool = new BashTool(workspaceRoot);
        const execution = tool.execute(
            {
                actionId: "action-abort-midway",
                input: { command: "sleep 5" },
            },
            { signal: controller.signal },
        );

        setTimeout(() => controller.abort(), 50);

        await assert.rejects(
            execution,
            (error: unknown) => error instanceof ExecutionAbortedError,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 完成单行超过 1 MB 的输出而不触发 maxBuffer 异常", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-huge-line",
            input: { command: "head -c 2000000 /dev/zero | tr '\\000' 'a'" },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as { stdout: string; stderr: string };
            assert.match(output.stdout, /^\[\.\.\.已省略前 1990000 字符\.\.\.\]/);
            assert.equal(
                output.stdout.length,
                "[...已省略前 1990000 字符...]".length + 1 + BASH_MAX_OUTPUT_CHARS,
            );
            assert.equal(
                output.stdout.slice(-BASH_MAX_OUTPUT_CHARS),
                "a".repeat(BASH_MAX_OUTPUT_CHARS),
            );
            assert.equal(output.stderr, "");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 同时有界收集超量的 stdout 与 stderr", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-both-streams",
            input: {
                command: "printf 'a%.0s' {1..20000}; printf 'b%.0s' {1..20000} >&2",
            },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as { stdout: string; stderr: string };
            assert.match(output.stdout, /^\[\.\.\.已省略前 10000 字符\.\.\.\]/);
            assert.equal(
                output.stdout.slice(-BASH_MAX_OUTPUT_CHARS),
                "a".repeat(BASH_MAX_OUTPUT_CHARS),
            );
            assert.match(output.stderr, /^\[\.\.\.已省略前 10000 字符\.\.\.\]/);
            assert.equal(
                output.stderr.slice(-BASH_MAX_OUTPUT_CHARS),
                "b".repeat(BASH_MAX_OUTPUT_CHARS),
            );
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 达到输出预算后继续运行直到命令退出", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-run-to-completion",
            input: {
                command: "printf 'a%.0s' {1..20000}; echo TAIL_MARKER",
            },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as { stdout: string };
            assert.match(output.stdout, /^\[\.\.\.已省略前 10012 字符\.\.\.\]/);
            assert.ok(output.stdout.endsWith("TAIL_MARKER\n"));
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 截断多字节 UTF-8 输出时不产生损坏字符", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-bash-"));

    try {
        const result = await new BashTool(workspaceRoot).execute({
            actionId: "action-utf8-truncate",
            input: {
                command: "printf 'a\\xf0\\x9f\\x98\\x80'; printf 'b%.0s' {1..9999}",
            },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as { stdout: string };
            assert.equal(
                output.stdout,
                `[...已省略前 3 字符...]\n${"b".repeat(9999)}`,
            );
            assert.equal(
                Buffer.from(output.stdout, "utf8").toString("utf8"),
                output.stdout,
            );
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("BashTool 在 workspaceRoot 无法解析时传播基础设施异常", async () => {
    const missingRoot = join(
        tmpdir(),
        `lazygoal-bash-missing-${process.pid}`,
    );

    await assert.rejects(() =>
        new BashTool(missingRoot).execute({
            actionId: "action-missing-root",
            input: { command: "echo hello" },
        })
    );
});
