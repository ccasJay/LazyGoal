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
    ExecutionAbortedError,
} from "../../runtime/src/index";
import {
    GREP_TOOL_ID,
    GrepTool,
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
            const output = result.output as {
                matches: { path: string; line: number; text: string }[];
                matchCount: number;
                filesScanned: number;
                truncated: boolean;
            };

            assert.equal(output.matchCount, 2);
            assert.equal(output.truncated, false);
            assert.deepEqual(output.matches, [
                { path: "./src/a.ts", line: 2, text: "// TODO: refactor" },
                { path: "./src/nested/b.ts", line: 1, text: "// TODO: nested" },
            ]);
            assert.equal(output.filesScanned, 2);
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
            const output = result.output as {
                matches: { path: string; line: number; text: string }[];
            };

            assert.deepEqual(output.matches, [
                { path: "src/a.ts", line: 1, text: "const alpha = 1;" },
            ]);
        }

        const regexResult = await tool.execute({
            actionId: "action-regex",
            input: { pattern: "cons(t|le)\\s" },
        });

        assert.equal(regexResult.kind, "success");

        if (regexResult.kind === "success") {
            const output = regexResult.output as {
                matches: { path: string; line: number; text: string }[];
            };

            assert.deepEqual(output.matches, [
                { path: "./src/a.ts", line: 1, text: "const alpha = 1;" },
            ]);
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
            assert.deepEqual(result.output, {
                matches: [],
                matchCount: 0,
                filesScanned: 1,
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
            const output = result.output as {
                matches: { path: string; line: number; text: string }[];
                filesScanned: number;
            };

            assert.deepEqual(output.matches, [
                { path: "./real.ts", line: 1, text: "TODO real" },
            ]);
            assert.equal(output.filesScanned, 2);
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
                message: "搜索范围不存在: missing-dir",
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
                message: "搜索范围不在工作区内: link",
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
            const output = result.output as {
                matches: { path: string; line: number; text: string }[];
                filesScanned: number;
            };

            assert.deepEqual(output.matches, [
                { path: "./target.txt", line: 1, text: "TODO in target" },
            ]);
            assert.equal(output.filesScanned, 1);
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
