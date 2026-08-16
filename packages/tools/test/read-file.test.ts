import assert from "node:assert/strict";
import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
    JsonValue,
    Tool,
} from "../../runtime/src/index";
import {
    InMemoryToolRegistry,
} from "../../runtime/src/index";
import {
    READ_FILE_TOOL_ID,
    ReadFileTool,
} from "../src/index";

function asJsonValue(value: unknown): JsonValue {
    return value as JsonValue;
}

function createEchoTool(id = "echo"): Tool {
    return {
        definition: {
            id,
            description: "返回输入",
            inputSchema: { type: "object" },
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            return {
                kind: "success",
                output: input,
                summary: "已返回输入",
            };
        },
    };
}

test("InMemoryToolRegistry 按 toolId 查找并拒绝重复注册", () => {
    const echo = createEchoTool();
    const registry = new InMemoryToolRegistry([echo]);

    assert.strictEqual(registry.get("echo"), echo);
    assert.equal(registry.get("missing"), undefined);
    assert.throws(
        () => new InMemoryToolRegistry([createEchoTool(), createEchoTool()]),
        /Duplicate Tool definition id/,
    );
    assert.throws(
        () => new InMemoryToolRegistry([createEchoTool("   ")]),
        /Tool definition id must be non-empty/,
    );
});

test("ReadFileTool 读取工作区内文件并声明 safe replay", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        await mkdir(join(workspaceRoot, "nested"));
        await writeFile(
            join(workspaceRoot, "nested", "README.md"),
            "真实文件内容",
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
        assert.deepEqual(result, {
            kind: "success",
            output: "真实文件内容",
            summary: "已读取 nested/README.md",
        });
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ReadFileTool 拒绝非法输入且不访问文件系统", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-read-file-"));

    try {
        const tool = new ReadFileTool(workspaceRoot);
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
        ];

        for (const input of invalidInputs) {
            const result = tool.validate(asJsonValue(input));

            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.error.code, "INVALID_TOOL_INPUT");
            }
        }

        await assert.rejects(
            () => tool.execute({
                actionId: "action-invalid",
                input: { path: "../secret.txt" },
            }),
            /INVALID_TOOL_INPUT/,
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
            message: "文件不存在: missing.txt",
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
        assert.equal(await readFile(secretPath, "utf8"), "不应暴露");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});
