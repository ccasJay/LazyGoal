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

import type { JsonValue } from "../../runtime/src/index";
import {
    createToolRegistration,
    ExecutionAbortedError,
} from "../../runtime/src/index";
import {
    WRITE_FILE_TOOL_ID,
    WriteFileTool,
} from "../src/index";

function asJsonValue(value: unknown): JsonValue {
    return value as JsonValue;
}

test("WriteFileTool 写入新文件并声明 safe replay", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));

    try {
        await mkdir(join(workspaceRoot, "nested"));
        const tool = new WriteFileTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-1",
            input: { path: "nested/notes.md", content: "hello lazygoal" },
        });

        assert.equal(tool.definition.id, WRITE_FILE_TOOL_ID);
        assert.equal(tool.replayPolicy, "safe");
        assert.deepEqual(
            tool.validate({ path: "nested/notes.md", content: "x" }),
            { ok: true },
        );
        assert.deepEqual(result, {
            kind: "success",
            output: { path: "nested/notes.md", bytes: 14 },
            summary: "已写入 nested/notes.md",
        });
        assert.equal(
            await readFile(join(workspaceRoot, "nested", "notes.md"), "utf8"),
            "hello lazygoal",
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("WriteFileTool 覆盖已有文件且允许空 content", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));

    try {
        const target = join(workspaceRoot, "existing.txt");
        await writeFile(target, "旧内容", "utf8");
        const tool = new WriteFileTool(workspaceRoot);

        const overwritten = await tool.execute({
            actionId: "action-overwrite",
            input: { path: "existing.txt", content: "新内容" },
        });

        assert.deepEqual(overwritten, {
            kind: "success",
            output: { path: "existing.txt", bytes: 9 },
            summary: "已写入 existing.txt",
        });
        assert.equal(await readFile(target, "utf8"), "新内容");

        const emptied = await tool.execute({
            actionId: "action-empty",
            input: { path: "empty.txt", content: "" },
        });

        assert.deepEqual(emptied, {
            kind: "success",
            output: { path: "empty.txt", bytes: 0 },
            summary: "已写入 empty.txt",
        });
        assert.equal(await readFile(join(workspaceRoot, "empty.txt"), "utf8"), "");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("WriteFileTool 拒绝非法输入且不访问文件系统", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));

    try {
        const tool = new WriteFileTool(workspaceRoot);
        const registration = createToolRegistration(tool);
        const invalidInputs: unknown[] = [
            null,
            [],
            {},
            { path: "a.txt" },
            { content: "x" },
            { path: "a.txt", content: "x", extra: true },
            { path: "", content: "x" },
            { path: 42, content: "x" },
            { path: "a.txt", content: 42 },
            { path: "a\0b.txt", content: "x" },
            { path: "../secret.txt", content: "x" },
            { path: "nested/../../secret.txt", content: "x" },
            { path: "/tmp/secret.txt", content: "x" },
            { path: "C:\\secret.txt", content: "x" },
            { path: ".lazygoal/goals/x.json", content: "x" },
            { path: ".lazygoal/profiles/default.json", content: "x" },
        ];

        for (const input of invalidInputs) {
            const result = registration.prepare(asJsonValue(input));

            assert.equal(result.ok, false, `expected reject: ${JSON.stringify(input)}`);
            if (!result.ok) {
                assert.equal(result.error.code, "INVALID_TOOL_INPUT");
            }
        }

        const result = registration.prepare({ path: "../secret.txt", content: "x" });
        assert.equal(result.ok, false);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("WriteFileTool 将缺失父目录作为领域 failure Observation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));

    try {
        const result = await new WriteFileTool(workspaceRoot).execute({
            actionId: "action-missing-parent",
            input: { path: "missing/note.txt", content: "x" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "FILE_NOT_FOUND",
            message: "父目录不存在: missing/note.txt",
            retryable: false,
        });
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("WriteFileTool 将目录目标作为领域 failure Observation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));

    try {
        await mkdir(join(workspaceRoot, "adir"));
        const result = await new WriteFileTool(workspaceRoot).execute({
            actionId: "action-dir",
            input: { path: "adir", content: "x" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "TARGET_IS_DIRECTORY",
            message: "目标不是文件: adir",
            retryable: false,
        });
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("WriteFileTool 解析符号链接后拒绝工作区外目标", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-outside-"));

    try {
        const secretPath = join(outsideRoot, "secret.txt");
        await writeFile(secretPath, "原始内容", "utf8");
        await symlink(secretPath, join(workspaceRoot, "link.txt"));

        const result = await new WriteFileTool(workspaceRoot).execute({
            actionId: "action-link",
            input: { path: "link.txt", content: "越界写入" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "PATH_OUTSIDE_WORKSPACE",
            message: "目标不在工作区内: link.txt",
            retryable: false,
        });
        assert.equal(await readFile(secretPath, "utf8"), "原始内容");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});

test("WriteFileTool 解析父目录符号链接后拒绝工作区外目标", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-outside-"));

    try {
        await symlink(outsideRoot, join(workspaceRoot, "link"));

        const result = await new WriteFileTool(workspaceRoot).execute({
            actionId: "action-parent-link",
            input: { path: "link/new.txt", content: "越界写入" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "PATH_OUTSIDE_WORKSPACE",
            message: "目标不在工作区内: link/new.txt",
            retryable: false,
        });
        await assert.rejects(
            readFile(join(outsideRoot, "new.txt"), "utf8"),
            /ENOENT/,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});

test("WriteFileTool rejects an already-aborted execution before filesystem access", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-write-file-"));

    try {
        const controller = new AbortController();
        controller.abort();
        const tool = new WriteFileTool(workspaceRoot);

        await assert.rejects(
            () => tool.execute(
                {
                    actionId: "action-aborted",
                    input: { path: "aborted.txt", content: "x" },
                },
                { signal: controller.signal },
            ),
            (error: unknown) => error instanceof ExecutionAbortedError,
        );
        await assert.rejects(
            readFile(join(workspaceRoot, "aborted.txt"), "utf8"),
            /ENOENT/,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
