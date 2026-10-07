import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import {
    mkdtemp,
    mkdir,
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
    } from "../../runtime/src/index";
import {
    GREP_TOOL_ID,
    GrepTool,
    type GrepOutput,
} from "../src/index";

function asJsonValue(value: unknown): JsonValue {
    return value as JsonValue;
}

test("GrepTool 在整个工作区内递归搜索并返回带行号的匹配", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
        await writeFile(
            join(workspaceRoot, "src", "a.ts"),
            "const value = 1;\n// TODO: refactor\n",
            "utf8",
        );
        await writeFile(
            join(workspaceRoot, "src", "nested", "b.ts"),
            "// TODO: nested\nconst other = 2;\n",
            "utf8",
        );
        const tool = new GrepTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-1",
            input: { pattern: "TODO" },
        });

        assert.equal(tool.definition.id, GREP_TOOL_ID);
        assert.equal(tool.replayPolicy, "safe");
        assert.deepEqual(tool.validate({ pattern: "TODO" }), { ok: true });
        assert.equal(result.kind, "success");

        if (result.kind === "success") {
            const output = result.output as unknown as GrepOutput;

            assert.equal(output.matches.length, 2);
            assert.equal(output.truncated, false);
            assert.deepEqual(output.matches, [
                { path: "src/a.ts", lineNumber: 2, lineText: "// TODO: refactor" },
                { path: "src/nested/b.ts", lineNumber: 1, lineText: "// TODO: nested" },
            ]);
            assert.equal(output.scannedFiles, 2);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 支持 path 范围、ignoreCase 与正则语法", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        await mkdir(join(workspaceRoot, "src"));
        await mkdir(join(workspaceRoot, "docs"));
        await writeFile(
            join(workspaceRoot, "src", "a.ts"),
            "const alpha = 1;\n",
            "utf8",
        );
        await writeFile(
            join(workspaceRoot, "docs", "note.md"),
            "Alpha Centauri\n",
            "utf8",
        );
        const tool = new GrepTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "action-scope",
            input: { pattern: "alpha", path: "src", ignoreCase: true },
        });

        assert.equal(result.kind, "success");

        if (result.kind === "success") {
            const output = result.output as unknown as GrepOutput;
            assert.deepEqual(output.matches, [
                { path: "src/a.ts", lineNumber: 1, lineText: "const alpha = 1;" },
            ]);
        }

        const regexResult = await tool.execute({
            actionId: "action-regex",
            input: { pattern: "cons(t|le)\\s" },
        });

        assert.equal(regexResult.kind, "success");

        if (regexResult.kind === "success") {
            const output = regexResult.output as unknown as GrepOutput;
            assert.deepEqual(output.matches, [
                { path: "src/a.ts", lineNumber: 1, lineText: "const alpha = 1;" },
            ]);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 支持 include 与 exclude 模式过滤", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        await writeFile(join(workspaceRoot, "a.ts"), "const target = 1;\n", "utf8");
        await writeFile(join(workspaceRoot, "a.test.ts"), "const target = 2;\n", "utf8");
        await writeFile(join(workspaceRoot, "b.js"), "const target = 3;\n", "utf8");

        const tool = new GrepTool(workspaceRoot);

        // 仅包含 *.ts，排除 *.test.ts
        const filteredResult = await tool.execute({
            actionId: "act-filter",
            input: {
                pattern: "target",
                include: "*.ts",
                exclude: "*.test.ts",
            },
        });

        assert.equal(filteredResult.kind, "success");
        if (filteredResult.kind === "success") {
            const output = filteredResult.output as unknown as GrepOutput;
            assert.equal(output.matches.length, 1);
            assert.equal(output.matches[0]?.path, "a.ts");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 支持 contextLines 上下文行提取及文件边界处理", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        // 创建一个 4 行文件：第 1 行与第 4 行匹配
        await writeFile(
            join(workspaceRoot, "code.ts"),
            "line1 MATCH\nline2 context\nline3 context\nline4 MATCH\n",
            "utf8",
        );

        const tool = new GrepTool(workspaceRoot);
        const result = await tool.execute({
            actionId: "act-ctx",
            input: {
                pattern: "MATCH",
                contextLines: 2,
            },
        });

        assert.equal(result.kind, "success");
        if (result.kind === "success") {
            const output = result.output as unknown as GrepOutput;
            assert.equal(output.matches.length, 2);

            // 第 1 行位于文件开头，只有 after 没有 before
            const m1 = output.matches[0]!;
            assert.equal(m1.lineNumber, 1);
            assert.equal(m1.context?.before, undefined);
            assert.deepEqual(m1.context?.after, [
                { lineNumber: 2, text: "line2 context" },
                { lineNumber: 3, text: "line3 context" },
            ]);

            // 第 4 行位于文件末尾，只有 before 没有 after
            const m2 = output.matches[1]!;
            assert.equal(m2.lineNumber, 4);
            assert.deepEqual(m2.context?.before, [
                { lineNumber: 2, text: "line2 context" },
                { lineNumber: 3, text: "line3 context" },
            ]);
            assert.equal(m2.context?.after, undefined);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 分页与游标推进", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        await writeFile(join(workspaceRoot, "1.txt"), "item A\nitem B\nitem C\n", "utf8");
        await writeFile(join(workspaceRoot, "2.txt"), "item D\nitem E\n", "utf8");

        const tool = new GrepTool(workspaceRoot);

        // 每页最多 2 项匹配
        const p1 = await tool.execute({
            actionId: "act-p1",
            input: { pattern: "item", maxMatches: 2 },
        });

        assert.equal(p1.kind, "success");
        let cursor: string | undefined;
        if (p1.kind === "success") {
            const out1 = p1.output as unknown as GrepOutput;
            assert.equal(out1.matches.length, 2);
            assert.equal(out1.truncated, true);
            assert.ok(out1.nextCursor);
            cursor = out1.nextCursor;
            assert.equal(out1.matches[0]?.lineText, "item A");
            assert.equal(out1.matches[1]?.lineText, "item B");
        }

        assert.ok(cursor !== undefined);
        const p2 = await tool.execute({
            actionId: "act-p2",
            input: { pattern: "item", maxMatches: 2, cursor },
        });

        assert.equal(p2.kind, "success");
        let cursor2: string | undefined;
        if (p2.kind === "success") {
            const out2 = p2.output as unknown as GrepOutput;
            assert.equal(out2.matches.length, 2);
            assert.equal(out2.truncated, true);
            assert.ok(out2.nextCursor);
            cursor2 = out2.nextCursor;
            assert.equal(out2.matches[0]?.lineText, "item C");
            assert.equal(out2.matches[1]?.lineText, "item D");
        }

        assert.ok(cursor2 !== undefined);
        const p3 = await tool.execute({
            actionId: "act-p3",
            input: { pattern: "item", maxMatches: 2, cursor: cursor2 },
        });

        assert.equal(p3.kind, "success");
        if (p3.kind === "success") {
            const out3 = p3.output as unknown as GrepOutput;
            assert.equal(out3.matches.length, 1);
            assert.equal(out3.truncated, false);
            assert.equal(out3.nextCursor, undefined);
            assert.equal(out3.matches[0]?.lineText, "item E");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 无匹配时返回空结果而非 failure", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        await writeFile(join(workspaceRoot, "a.txt"), "hello\n", "utf8");
        const result = await new GrepTool(workspaceRoot).execute({
            actionId: "action-none",
            input: { pattern: "missing-needle" },
        });

        assert.equal(result.kind, "success");

        if (result.kind === "success") {
            const output = result.output as unknown as GrepOutput;
            assert.deepEqual(output, {
                matches: [],
                scannedFiles: 1,
                truncated: false,
            });
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 跳过 .git、.lazygoal、node_modules 与二进制文件", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        await mkdir(join(workspaceRoot, ".git"));
        await mkdir(join(workspaceRoot, "node_modules", "dep"), { recursive: true });
        await mkdir(join(workspaceRoot, ".lazygoal", "goals"), { recursive: true });
        await writeFile(join(workspaceRoot, ".git", "config"), "TODO in git\n", "utf8");
        await writeFile(
            join(workspaceRoot, "node_modules", "dep", "index.js"),
            "TODO in dep\n",
            "utf8",
        );
        await writeFile(
            join(workspaceRoot, ".lazygoal", "goals", "g.json"),
            "TODO in lazygoal\n",
            "utf8",
        );
        await writeFile(
            join(workspaceRoot, "binary.bin"),
            "TODO\u0000binary",
            "utf8",
        );
        await writeFile(join(workspaceRoot, "real.ts"), "TODO real\n", "utf8");

        const result = await new GrepTool(workspaceRoot).execute({
            actionId: "action-skip",
            input: { pattern: "TODO" },
        });

        assert.equal(result.kind, "success");

        if (result.kind === "success") {
            const output = result.output as unknown as GrepOutput;

            assert.deepEqual(output.matches, [
                { path: "real.ts", lineNumber: 1, lineText: "TODO real" },
            ]);
            assert.equal(output.scannedFiles, 2);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 拒绝非法输入且不访问文件系统", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        const tool = new GrepTool(workspaceRoot);
        const registration = createToolRegistration(tool);
        const invalidInputs: unknown[] = [
            null,
            [],
            {},
            { pattern: 42 },
            { pattern: "a", extra: true },
            { pattern: "a", path: 42 },
            { pattern: "a", ignoreCase: "yes" },
            { pattern: "" },
            { pattern: "   " },
            { pattern: "a(" },
            { pattern: "a", path: "" },
            { pattern: "a", path: "../secret" },
            { pattern: "a", path: "/tmp/secret" },
            { pattern: "a", path: "C:\\secret" },
            { pattern: "a", contextLines: -1 },
            { pattern: "a", maxMatches: 0 },
        ];

        for (const input of invalidInputs) {
            const result = registration.prepare(asJsonValue(input));

            assert.equal(result.ok, false, `expected reject: ${JSON.stringify(input)}`);
            if (!result.ok) {
                assert.equal(result.error.code, "INVALID_TOOL_INPUT");
            }
        }

        const result = registration.prepare({ pattern: "a", path: "../secret" });
        assert.equal(result.ok, false);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool 将缺失范围与越界符号链接作为领域 failure Observation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-outside-"));

    try {
        const tool = new GrepTool(workspaceRoot);

        assert.deepEqual(
            await tool.execute({
                actionId: "action-missing",
                input: { pattern: "a", path: "missing-dir" },
            }),
            {
                kind: "failure",
                code: "FILE_NOT_FOUND",
                message: "Search path not found: missing-dir",
                retryable: false,
            },
        );

        await symlink(outsideRoot, join(workspaceRoot, "link"));
        assert.deepEqual(
            await tool.execute({
                actionId: "action-link",
                input: { pattern: "a", path: "link" },
            }),
            {
                kind: "failure",
                code: "PATH_OUTSIDE_WORKSPACE",
                message: "Search path outside workspace: link",
                retryable: false,
            },
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});

test("GrepTool 不跟随工作区内的文件符号链接", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        const target = join(workspaceRoot, "target.txt");
        await writeFile(target, "TODO in target\n", "utf8");
        await symlink(target, join(workspaceRoot, "link.txt"));

        const result = await new GrepTool(workspaceRoot).execute({
            actionId: "action-skip-link",
            input: { pattern: "TODO" },
        });

        assert.equal(result.kind, "success");

        if (result.kind === "success") {
            const output = result.output as unknown as GrepOutput;

            assert.deepEqual(output.matches, [
                { path: "target.txt", lineNumber: 1, lineText: "TODO in target" },
            ]);
            assert.equal(output.scannedFiles, 1);
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("GrepTool rejects an already-aborted execution before filesystem access", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-grep-"));

    try {
        const controller = new AbortController();
        controller.abort();
        const tool = new GrepTool(workspaceRoot);

        await assert.rejects(
            () => tool.execute(
                {
                    actionId: "action-aborted",
                    input: { pattern: "a" },
                },
                { signal: controller.signal },
            ),
            (error: unknown) => error instanceof ExecutionAbortedError,
        );
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
