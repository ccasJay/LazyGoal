import { ExecutionAbortedError } from "../../execution-control/src/index";
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

import type { JsonValue } from "../../contracts/src/index";
import {
    createToolRegistration,
} from "../../tool-core/src/index";
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
        const registration = createToolRegistration(tool);
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
            const result = registration.prepare(asJsonValue(input));

            assert.equal(result.ok, false, `expected reject: ${JSON.stringify(input)}`);
            if (!result.ok) {
                assert.equal(result.error.code, "INVALID_TOOL_INPUT");
            }
        }

        const result = registration.prepare({
            path: "../secret.txt",
            oldString: "x",
            newString: "y",
        });
        assert.equal(result.ok, false);
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

test("EditFileTool 支持空白/换行符自适应容错匹配与绝对路径归一化", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-fuzzy-"));

    try {
        const testFile = join(workspaceRoot, "crlf-demo.py");
        // 原文件包含 CRLF 且行尾带有空格
        const originalContent = "def hello():\r\n    msg = 'world'   \r\n    return msg\r\n";
        await writeFile(testFile, originalContent, "utf8");

        const tool = new EditFileTool(workspaceRoot);

        // 1. 模型提供 LF 且去除了行尾空格的 oldString
        const modelOldString = "def hello():\n    msg = 'world'\n    return msg";
        const modelNewString = "def hello():\n    msg = 'lazygoal'\n    return msg";

        // 通过工作区绝对路径执行
        const res = await tool.execute({
            actionId: "act-fuzzy",
            input: {
                path: testFile,
                oldString: modelOldString,
                newString: modelNewString,
            },
        });

        assert.equal(res.kind, "success");
        assert.match(res.summary ?? "", /自适应容错编辑/);
        const updated = await readFile(testFile, "utf8");
        assert.ok(updated.includes("msg = 'lazygoal'"));

        // 2. 歧义匹配：有多处可以容错匹配时拒绝替换
        const ambiguousFile = join(workspaceRoot, "ambiguous.py");
        await writeFile(ambiguousFile, "x = 1  \n\nx = 1    \n", "utf8");
        const ambRes = await tool.execute({
            actionId: "act-amb",
            input: {
                path: "ambiguous.py",
                oldString: "x = 1",
                newString: "x = 2",
            },
        });
        assert.equal(ambRes.kind, "failure");
        if (ambRes.kind === "failure") {
            assert.equal(ambRes.code, "STRING_NOT_UNIQUE");
        }

        // 3. 删除行操作（newString: ""）在 CRLF 文件中正常执行，不被 alreadyApplied 误拦截
        const deleteFile = join(workspaceRoot, "delete-demo.py");
        await writeFile(deleteFile, "def run():\r\n    bad_line()\r\n    return 1\r\n", "utf8");
        const delRes = await tool.execute({
            actionId: "act-del",
            input: {
                path: "delete-demo.py",
                oldString: "    bad_line()\n",
                newString: "",
            },
        });
        assert.equal(delRes.kind, "success");
        if (delRes.kind === "success") {
            assert.equal((delRes.output as any).replacements, 1);
            assert.equal((delRes.output as any).alreadyApplied, false);
        }
        const delContent = await readFile(deleteFile, "utf8");
        assert.ok(!delContent.includes("bad_line"));

        // 4. newString 已存在于文件其他位置时，容错匹配仍能正确匹配并替换目标区域，而非误判 alreadyApplied
        const duplicateFile = join(workspaceRoot, "duplicate-helper.py");
        await writeFile(duplicateFile, "def foo():\r\n    return 1\r\n\ndef bar():\r\n    return 0   \r\n", "utf8");
        const dupRes = await tool.execute({
            actionId: "act-dup",
            input: {
                path: "duplicate-helper.py",
                oldString: "def bar():\n    return 0",
                newString: "def bar():\n    return 1",
            },
        });
        assert.equal(dupRes.kind, "success");
        if (dupRes.kind === "success") {
            assert.equal((dupRes.output as any).replacements, 1);
            assert.equal((dupRes.output as any).alreadyApplied, false);
        }
        const dupContent = await readFile(duplicateFile, "utf8");
        assert.ok(dupContent.includes("def bar():\r\n    return 1"));

        // 5. CRLF 文件上的编辑重放（newString 为 LF 形式）仍可正确识别 alreadyApplied: true
        const replayRes = await tool.execute({
            actionId: "act-replay-crlf",
            input: {
                path: "duplicate-helper.py",
                oldString: "def bar():\n    return 0",
                newString: "def bar():\n    return 1\n",
            },
        });
        assert.equal(replayRes.kind, "success");
        if (replayRes.kind === "success") {
            assert.equal((replayRes.output as any).replacements, 0);
            assert.equal((replayRes.output as any).alreadyApplied, true);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool 未改动代码前重复使用相同的缺失 oldString 触发熔断拦截", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-repeat-"));

    try {
        const target = join(workspaceRoot, "code.py");
        await writeFile(target, "def solve():\n    return 42\n", "utf8");
        const tool = new EditFileTool(workspaceRoot);

        // 第一次失败并附带近邻提示
        const res1 = await tool.execute({
            actionId: "act-1",
            input: {
                path: "code.py",
                oldString: "def solve_wrong():\n    return 0",
                newString: "def solve():\n    return 100",
            },
        });
        assert.equal(res1.kind, "failure");
        assert.equal((res1 as any).code, "STRING_NOT_FOUND");
        assert.ok((res1 as any).message.includes("oldString 在文件中不存在"));

        // 未写文件前重复尝试相同 oldString -> REPEATED_STRING_NOT_FOUND 熔断
        const res2 = await tool.execute({
            actionId: "act-2",
            input: {
                path: "code.py",
                oldString: "def solve_wrong():\n    return 0",
                newString: "def solve():\n    return 100",
            },
        });
        assert.equal(res2.kind, "failure");
        assert.equal((res2 as any).code, "REPEATED_STRING_NOT_FOUND");
        assert.ok((res2 as any).message.includes("之前已确认不存在"));

        // 若成功执行了其他编辑（工作区发生变更），熔断重置
        const resSuccess = await tool.execute({
            actionId: "act-success",
            input: {
                path: "code.py",
                oldString: "return 42",
                newString: "return 43",
            },
        });
        assert.equal(resSuccess.kind, "success");

        // 熔断已被重置，再次尝试返回普通的 STRING_NOT_FOUND
        const res3 = await tool.execute({
            actionId: "act-3",
            input: {
                path: "code.py",
                oldString: "def solve_wrong():\n    return 0",
                newString: "def solve():\n    return 100",
            },
        });
        assert.equal(res3.kind, "failure");
        assert.equal((res3 as any).code, "STRING_NOT_FOUND");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool 未命中时若存在相似代码行附带近邻行号提示", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-hint-"));

    try {
        const target = join(workspaceRoot, "demo.py");
        await writeFile(target, "# line 1\n# line 2\ndef compute_answer(x, y):\n    return x + y\n", "utf8");
        const tool = new EditFileTool(workspaceRoot);

        const res = await tool.execute({
            actionId: "act-hint",
            input: {
                path: "demo.py",
                oldString: "def compute_answer(x, y):\n    return x - y",
                newString: "def compute_answer(x, y):\n    return x * y",
            },
        });
        assert.equal(res.kind, "failure");
        assert.equal((res as any).code, "STRING_NOT_FOUND");
        assert.ok((res as any).message.includes("第 3 行"));
        assert.ok((res as any).message.includes("compute_answer"));
        assert.ok((res as any).message.includes("真实上下文代码"));
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("EditFileTool 自动容错模型生成的误转义引号反斜杠", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-edit-file-escape-"));

    try {
        const target = join(workspaceRoot, "core.py");
        await writeFile(target, 'raise ValueError("{} object is invalid - expected \x27{}\x27")\n', "utf8");
        const tool = new EditFileTool(workspaceRoot);

        // 模型在 JSON 序列化中常常误输出 \" ，解码后带有真正的反斜杠
        const res = await tool.execute({
            actionId: "act-unescape",
            input: {
                path: "core.py",
                oldString: 'raise ValueError(\\"{} object is invalid - expected \x27{}\x27\\")',
                newString: 'raise ValueError(\\"{} object is invalid - columns missing\\")',
            },
        });
        assert.equal(res.kind, "success");
        const updated = await readFile(target, "utf8");
        assert.equal(updated, 'raise ValueError("{} object is invalid - columns missing")\n');
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});


