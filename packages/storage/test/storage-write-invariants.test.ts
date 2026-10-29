import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SOURCE_DIRECTORY = fileURLToPath(new URL("../src", import.meta.url));
const WRITE_PRIMITIVE_FILE = "json-file-write.ts";
const QUEUE_FILE = "keyed-serial-queue.ts";

interface SourceFile {
    readonly name: string;
    readonly source: string;
}

interface Rule {
    readonly description: string;
    readonly pattern: RegExp;
}

const WRITE_RULES: readonly Rule[] = [
    { description: "rename call", pattern: /\brename\s*\(/ },
    { description: "direct appendFile call", pattern: /\bappendFile\s*\(/ },
    { description: "FileHandle.sync call", pattern: /\.sync\s*\(/ },
    { description: "append-mode open", pattern: /\bopen\s*\([^;\n]*["']a["']/ },
    { description: "temporary path construction", pattern: /\.tmp\b/ },
];

const QUEUE_RULES: readonly Rule[] = [
    { description: "hand-written tail chaining", pattern: /\bthis\.tail\b/ },
    { description: "hand-written keyed promise map", pattern: /\bnew\s+Map<\s*string\s*,\s*Promise/ },
];

async function readSourceFiles(): Promise<readonly SourceFile[]> {
    const names = (await readdir(SOURCE_DIRECTORY))
        .filter((name) => name.endsWith(".ts"))
        .sort();
    const files: SourceFile[] = [];

    for (const name of names) {
        files.push({
            name,
            source: await readFile(join(SOURCE_DIRECTORY, name), "utf8"),
        });
    }

    return files;
}

function findViolations(files: readonly SourceFile[]): string[] {
    const violations: string[] = [];

    for (const file of files) {
        const lines = stripComments(file.source).split("\n");

        for (const [index, line] of lines.entries()) {
            const rules = file.name === WRITE_PRIMITIVE_FILE
                ? QUEUE_RULES
                : file.name === QUEUE_FILE
                    ? WRITE_RULES
                    : [...WRITE_RULES, ...QUEUE_RULES];

            for (const rule of rules) {
                if (rule.pattern.test(line)) {
                    violations.push(
                        `${file.name}:${index + 1}: ${rule.description}: ${line.trim()}`,
                    );
                }
            }
        }
    }

    return violations;
}

function stripComments(source: string): string {
    let output = "";
    let state: "code" | "line" | "block" | "single" | "double" | "template" = "code";

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index]!;
        const next = source[index + 1];
        const previous = source[index - 1];

        if (state === "code") {
            if (character === "/" && next === "/") {
                state = "line";
                output += "  ";
                index += 1;
                continue;
            }
            if (character === "/" && next === "*") {
                state = "block";
                output += "  ";
                index += 1;
                continue;
            }
            if (character === "\"") state = "double";
            else if (character === "'") state = "single";
            else if (character === "`") state = "template";
            output += character;
            continue;
        }

        if (state === "line") {
            if (character === "\n") {
                state = "code";
                output += character;
            } else {
                output += " ";
            }
            continue;
        }

        if (state === "block") {
            if (character === "*" && next === "/") {
                state = "code";
                output += "  ";
                index += 1;
                continue;
            }
            output += character === "\n" ? "\n" : " ";
            continue;
        }

        output += character;

        if (
            (state === "double" && character === "\"" && previous !== "\\")
            || (state === "single" && character === "'" && previous !== "\\")
            || (state === "template" && character === "`" && previous !== "\\")
        ) {
            state = "code";
        }
    }

    return output;
}

test("storage 源码只经共享写入原语与串行队列写文件", async () => {
    const violations = findViolations(await readSourceFiles());

    assert.deepEqual(
        violations,
        [],
        `Duplicate storage write implementation:\n${violations.join("\n")}`,
    );
});

test("静态检查会报告违规文件与行号", () => {
    const violations = findViolations([{
        name: "other-store.ts",
        source: [
            "const temporaryPath = `${target}.tmp`;",
            "await rename(temporaryPath, target);",
            "const queue = new Map<string, Promise<void>>();",
        ].join("\n"),
    }]);

    assert.deepEqual(violations, [
        "other-store.ts:1: temporary path construction: const temporaryPath = `${target}.tmp`;",
        "other-store.ts:2: rename call: await rename(temporaryPath, target);",
        "other-store.ts:3: hand-written keyed promise map: const queue = new Map<string, Promise<void>>();",
    ]);
});

test("静态检查按 allowlist 忽略原语自身实现", () => {
    const violations = findViolations([
        {
            name: WRITE_PRIMITIVE_FILE,
            source: "const temporaryPath = `${path}.tmp`;\nawait rename(temporaryPath, path);",
        },
        {
            name: QUEUE_FILE,
            source: "private readonly tail: Promise<void> = Promise.resolve();",
        },
    ]);

    assert.deepEqual(violations, []);
});

test("静态检查忽略注释与 TSDoc 中的示例文本", () => {
    const violations = findViolations([{
        name: "documented-store.ts",
        source: [
            "/**",
            " * 旧实现使用 rename(temporaryPath, path) 与 `${path}.tmp`。",
            " */",
            "// 曾经使用 appendFile(path, line) 与 this.tail。",
            "const value = 1;",
        ].join("\n"),
    }]);

    assert.deepEqual(violations, []);
});
