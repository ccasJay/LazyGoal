import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    contract,
    type Contract,
    type InferContract,
} from "../../contracts/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type JsonValue,
    type Tool,
    type ToolDefinition,
    type ToolExecutionRequest,
    type ToolObservation,
    type ToolValidationResult,
} from "../../runtime/src/index";
import {
    ReadFileTool,
    READ_FILE_TOOL_ID,
    type ReadFileOutput,
} from "../src/index";

function asJsonValue(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
}

test("ReadFileTool 读取工作区内文件并返回结构化输出", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        await mkdir(join(workspaceRoot, "nested"));
        await writeFile(
            join(workspaceRoot, "nested", "README.md"),
            "line1\nline2\nline3\n",
            "utf8",
        );

        const tool = new ReadFileTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-1",
            input: { path: "nested/README.md" },
        });

        assert.equal(tool.definition.id, READ_FILE_TOOL_ID);
        assert.equal(tool.replayPolicy, "safe");
        assert.deepEqual(tool.validate({ path: "nested/README.md" }), { ok: true });
        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as ReadFileOutput;
            assert.deepEqual(output, {
                path: "nested/README.md",
                text: "line1\nline2\nline3\n",
                startLine: 1,
                endLine: 3,
                eof: true,
                truncated: false,
            });
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool 支持行范围 startLine 与 endLine 读取", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        await writeFile(
            join(workspaceRoot, "test.txt"),
            "1\n2\n3\n4\n5\n",
            "utf8",
        );

        const tool = new ReadFileTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-2",
            input: { path: "test.txt", startLine: 2, endLine: 4 },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as ReadFileOutput;
            assert.equal(output.text, "2\n3\n4\n");
            assert.equal(output.startLine, 2);
            assert.equal(output.endLine, 4);
            assert.equal(output.eof, false);
            assert.equal(output.truncated, false);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool 字符截断与行内续读游标", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        const longLine = "a".repeat(100);
        await writeFile(join(workspaceRoot, "long.txt"), `${longLine}\nsecond\n`, "utf8");

        const tool = new ReadFileTool(workspaceRoot);
        // 限制 maxChars: 50
        const page1 = await tool.execute({
            actionId: "act-p1",
            input: { path: "long.txt", maxChars: 50 },
        });

        assert.equal(page1.kind, "success");
        let cursor: string | undefined;
        if (page1.kind === "success") {
            const out1 = page1.output as unknown as ReadFileOutput;
            assert.equal(out1.truncated, true);
            assert.equal(out1.eof, false);
            assert.equal(out1.text, "a".repeat(50));
            assert.ok(out1.nextCursor);
            cursor = out1.nextCursor;
        }

        assert.ok(cursor !== undefined);
        const page2 = await tool.execute({
            actionId: "act-p2",
            input: { path: "long.txt", maxChars: 60, cursor },
        });

        assert.equal(page2.kind, "success");
        if (page2.kind === "success") {
            const out2 = page2.output as unknown as ReadFileOutput;
            assert.equal(out2.text.startsWith("a".repeat(50)), true);
            assert.equal(out2.text.includes("second"), true);
            assert.equal(out2.eof, true);
            assert.equal(out2.truncated, false);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool 检测并拒绝包含 NUL 字节的二进制文件", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        const binaryBuffer = Buffer.from([0x68, 0x65, 0x00, 0x6c, 0x6f]);
        await writeFile(join(workspaceRoot, "bin.dat"), binaryBuffer);

        const tool = new ReadFileTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-bin",
            input: { path: "bin.dat" },
        });

        assert.equal(result.kind, "failure");
        if (result.kind === "failure") {
            assert.equal(result.code, "BINARY_FILE_DETECTED");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool 拒绝非法输入且不访问文件系统", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        const tool = new ReadFileTool(workspaceRoot);
        const registration = createToolRegistration(tool);
        const invalidInputs: unknown[] = [
            null,
            [],
            {},
            { path: "" },
            { path: "../secret.txt" },
            { path: "nested/../../secret.txt" },
            { path: "/tmp/secret.txt" },
            { path: "C:\\secret.txt" },
            { path: "README.md", extra: true },
            { path: "a.txt", startLine: 5, endLine: 2 },
        ];

        for (const input of invalidInputs) {
            const result = registration.prepare(asJsonValue(input));

            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.error.code, "INVALID_TOOL_INPUT");
            }
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool rejects an already-aborted execution before filesystem access", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        const controller = new AbortController();
        controller.abort();
        const tool = new ReadFileTool(workspaceRoot);

        await assert.rejects(
            () => tool.execute(
                {
                    actionId: "action-aborted",
                    input: { path: "missing.txt" },
                },
                { signal: controller.signal },
            ),
            (error: unknown) => error instanceof ExecutionAbortedError,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool 将缺失文件作为领域 failure Observation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        const result = await new ReadFileTool(workspaceRoot).execute({
            actionId: "action-missing",
            input: { path: "missing.txt" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "FILE_NOT_FOUND",
            message: "File not found: missing.txt",
            retryable: false,
        });
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool 解析符号链接后拒绝工作区外目标", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-outside-"));

    try {
        const secretPath = join(outsideRoot, "secret.txt");
        await writeFile(secretPath, "不应暴露", "utf8");
        await symlink(secretPath, join(workspaceRoot, "link.txt"));

        const result = await new ReadFileTool(workspaceRoot).execute({
            actionId: "action-link",
            input: { path: "link.txt" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "PATH_OUTSIDE_WORKSPACE",
            message: "目标不在工作区内: link.txt",
            retryable: false,
        });
        assert.equal(await (await import("node:fs/promises")).readFile(secretPath, "utf8"), "不应暴露");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});
