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
import { ExecutionAbortedError } from "../../runtime/src/index";
import {
    EDIT_FILE_TOOL_ID,
    EditFileTool,
} from "../src/index";

function asJsonValue(value: unknown): JsonValue {
    return value as JsonValue;
}

test("EditFileTool 执行唯一匹配替换并声明 safe replay", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));

    try {
        const target = join(workspaceRoot, "src", "a.ts");
        await mkdir(join(workspaceRoot, "src"));
        await writeFile(target, "const value = foo();\nexport { value };\n", "utf8");
        const tool = new EditFileTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-1",
            input: {
                path: "src/a.ts",
                oldString: "foo()",
                newString: "bar()",
            },
        });

        assert.equal(tool.definition.id, EDIT_FILE_TOOL_ID);
        assert.equal(tool.replayPolicy, "safe");
        assert.deepEqual(
            tool.validate({
                path: "src/a.ts",
                oldString: "foo()",
                newString: "bar()",
            }),
            { ok: true },
        );
        assert.deepEqual(result, {
            kind: "success",
            output: { path: "src/a.ts", replacements: 1, alreadyApplied: false },
            summary: "已编辑 src/a.ts",
        });
        assert.equal(
            await readFile(target, "utf8"),
            "const value = bar();\nexport { value };\n",
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool 重放已应用的编辑时幂等成功", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));

    try {
        const target = join(workspaceRoot, "note.md");
        await writeFile(target, "新内容\n", "utf8");
        const tool = new EditFileTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-replay",
            input: {
                path: "note.md",
                oldString: "旧内容",
                newString: "新内容",
            },
        });

        assert.deepEqual(result, {
            kind: "success",
            output: { path: "note.md", replacements: 0, alreadyApplied: true },
            summary: "编辑已应用（重放确认）: note.md",
        });
        assert.equal(await readFile(target, "utf8"), "新内容\n");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool oldString 不存在且未应用时返回领域 failure", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));

    try {
        const target = join(workspaceRoot, "note.md");
        await writeFile(target, "保持不变\n", "utf8");
        const result = await new EditFileTool(workspaceRoot).execute({
            actionId: "action-missing",
            input: {
                path: "note.md",
                oldString: "不存在的文本",
                newString: "替换文本",
            },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "STRING_NOT_FOUND",
            message: "oldString 在文件中不存在: note.md",
            retryable: false,
        });
        assert.equal(await readFile(target, "utf8"), "保持不变\n");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool oldString 多次出现时拒绝歧义替换", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));

    try {
        const target = join(workspaceRoot, "dup.txt");
        await writeFile(target, "dup\ndup\ndup\n", "utf8");
        const result = await new EditFileTool(workspaceRoot).execute({
            actionId: "action-ambiguous",
            input: { path: "dup.txt", oldString: "dup", newString: "unique" },
        });

        assert.deepEqual(result, {
            kind: "failure",
            code: "STRING_NOT_UNIQUE",
            message: "oldString 在文件中出现 3 次，需提供更长的上下文: dup.txt",
            retryable: false,
        });
        assert.equal(await readFile(target, "utf8"), "dup\ndup\ndup\n");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool 拒绝非法输入且不访问文件系统", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));

    try {
        const tool = new EditFileTool(workspaceRoot);
        const invalidInputs: unknown[] = [
            null,
            [],
            {},
            { path: "a.txt", oldString: "x" },
            { path: "a.txt", newString: "y" },
            { oldString: "x", newString: "y" },
            { path: "a.txt", oldString: "x", newString: "y", extra: true },
            { path: "", oldString: "x", newString: "y" },
            { path: 42, oldString: "x", newString: "y" },
            { path: "a.txt", oldString: 42, newString: "y" },
            { path: "a.txt", oldString: "x", newString: 42 },
            { path: "a\0b.txt", oldString: "x", newString: "y" },
            { path: "../secret.txt", oldString: "x", newString: "y" },
            { path: "nested/../../secret.txt", oldString: "x", newString: "y" },
            { path: "/tmp/secret.txt", oldString: "x", newString: "y" },
            { path: "C:\\secret.txt", oldString: "x", newString: "y" },
            { path: ".lazygoal/goals/x.json", oldString: "x", newString: "y" },
            { path: "a.txt", oldString: "", newString: "y" },
            { path: "a.txt", oldString: "x", newString: "x" },
        ];

        for (const input of invalidInputs) {
            const result = tool.validate(asJsonValue(input));

            assert.equal(result.ok, false, `expected reject: ${JSON.stringify(input)}`);
            if (!result.ok) {
                assert.equal(result.error.code, "INVALID_TOOL_INPUT");
            }
        }

        await assert.rejects(
            () => tool.execute({
                actionId: "action-invalid",
                input: { path: "../secret.txt", oldString: "x", newString: "y" },
            }),
            /INVALID_TOOL_INPUT/,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool 将缺失目标与目录目标作为领域 failure Observation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));

    try {
        await mkdir(join(workspaceRoot, "adir"));
        const tool = new EditFileTool(workspaceRoot);

        assert.deepEqual(
            await tool.execute({
                actionId: "action-missing-file",
                input: { path: "missing.txt", oldString: "x", newString: "y" },
            }),
            {
                kind: "failure",
                code: "FILE_NOT_FOUND",
                message: "文件不存在: missing.txt",
                retryable: false,
            },
        );

        assert.deepEqual(
            await tool.execute({
                actionId: "action-dir",
                input: { path: "adir", oldString: "x", newString: "y" },
            }),
            {
                kind: "failure",
                code: "TARGET_IS_DIRECTORY",
                message: "目标不是文件: adir",
                retryable: false,
            },
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool 解析符号链接后拒绝工作区外目标", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-outside-"));

    try {
        const secretPath = join(outsideRoot, "secret.txt");
        await writeFile(secretPath, "原始内容", "utf8");
        await symlink(secretPath, join(workspaceRoot, "link.txt"));

        const result = await new EditFileTool(workspaceRoot).execute({
            actionId: "action-link",
            input: { path: "link.txt", oldString: "原始内容", newString: "越界编辑" },
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

test("EditFileTool rejects an already-aborted execution before filesystem access", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-"));

    try {
        const controller = new AbortController();
        controller.abort();
        const tool = new EditFileTool(workspaceRoot);

        await assert.rejects(
            () => tool.execute(
                {
                    actionId: "action-aborted",
                    input: { path: "aborted.txt", oldString: "x", newString: "y" },
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
