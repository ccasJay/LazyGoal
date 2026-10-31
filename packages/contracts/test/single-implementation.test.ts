import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** 待扫描的源码文本。 */
export interface SourceText {
    /** 仓库相对 POSIX 路径。 */
    readonly path: string;
    /** 文件完整文本。 */
    readonly text: string;
}

/** 重复算法或通用守卫定义的位置。 */
export interface DuplicateHelperDefinition {
    /** 仓库相对 POSIX 路径。 */
    readonly path: string;
    /** 定义所在行号（从 1 开始）。 */
    readonly line: number;
    /** 被禁止的 helper 名称。 */
    readonly name: string;
}

/** 违反边界规则的位置。 */
export interface BoundaryFinding {
    /** 仓库相对 POSIX 路径。 */
    readonly path: string;
    /** 违规所在行号（从 1 开始）。 */
    readonly line: number;
    /** 稳定诊断信息。 */
    readonly message: string;
}

const FORBIDDEN_HELPER_NAMES = new Set([
    "isRecord",
    "isObject",
    "isObjectRecord",
    "isJsonObject",
    "isJsonRecord",
    "deepFreeze",
    "canonicalize",
    "canonicalizeJson",
    "canonicalizeBoundaryValue",
    "sortKeys",
    "sortKeysDeep",
    "compareLexical",
    "roundScore",
    "roundRankedScore",
]);

const HELPER_ALLOWLIST = new Set([
    "packages/contracts/src/json.ts",
    "packages/context-budget/src/stable-json.ts",
    "packages/context-retrieval/src/score-rounding.ts",
    "packages/storage/src/path-segment.ts",
    "packages/execution-stream/src/publisher.ts",
    "packages/browser/src/browser-projection.ts",
]);

const STORAGE_ENCODING_ALLOWLIST = new Set(["packages/storage/src/path-segment.ts"]);

const DEFINITION_PATTERNS = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*(?:<[^>{}]*>)?\s*\(/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|(?:<[^>()]*>\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>)/g,
];

function lineAt(text: string, index: number): number {
    return text.slice(0, index).split("\n").length;
}

function compareFindings(
    left: { readonly path: string; readonly line: number },
    right: { readonly path: string; readonly line: number },
): number {
    if (left.path !== right.path) return left.path < right.path ? -1 : 1;
    return left.line - right.line;
}

function toPosixPath(path: string): string {
    return path.split(sep).join("/");
}

function projectPath(root: string, path: string): string {
    return toPosixPath(relative(root, path));
}

/**
 * 查找 allowlist 之外的重复 helper 定义。
 *
 * @param sources - 待扫描的源码文本。
 * @param allowlist - 允许保留共享或领域实现的仓库相对路径。
 * @returns 每个违规定义的文件、行号与名称。
 */
export function findDuplicateHelperDefinitions(
    sources: readonly SourceText[],
    allowlist: readonly string[] = [...HELPER_ALLOWLIST],
): DuplicateHelperDefinition[] {
    const allowed = new Set(allowlist);
    const findings = new Map<string, DuplicateHelperDefinition>();

    for (const source of sources) {
        if (allowed.has(source.path)) continue;
        for (const pattern of DEFINITION_PATTERNS) {
            pattern.lastIndex = 0;
            for (const match of source.text.matchAll(pattern)) {
                const name = match[1];
                if (name === undefined) continue;
                const window = source.text.slice(match.index ?? 0, (match.index ?? 0) + 200);
                const isForbidden = FORBIDDEN_HELPER_NAMES.has(name)
                    || (name === "object" && window.includes("value is Record<string, unknown>"));
                if (!isForbidden) continue;
                const line = lineAt(source.text, match.index ?? 0);
                findings.set(`${source.path}:${line}:${name}`, { path: source.path, line, name });
            }
        }
    }

    return [...findings.values()].sort(compareFindings);
}

/**
 * 查找 allowlist 之外的 base64url 路径编码。
 *
 * @param sources - 待扫描的源码文本。
 * @param allowlist - 允许执行编码的仓库相对路径。
 * @returns 每个违规位置的文件与行号。
 */
export function findBase64UrlEncodings(
    sources: readonly SourceText[],
    allowlist: readonly string[] = [...STORAGE_ENCODING_ALLOWLIST],
): BoundaryFinding[] {
    const allowed = new Set(allowlist);
    const findings: BoundaryFinding[] = [];
    const pattern = /\.toString\(\s*["']base64url["']\s*\)/g;

    for (const source of sources) {
        if (allowed.has(source.path)) continue;
        for (const match of source.text.matchAll(pattern)) {
            findings.push({
                path: source.path,
                line: lineAt(source.text, match.index ?? 0),
                message: "base64url 路径编码必须经 path-segment.ts",
            });
        }
    }

    return findings.sort(compareFindings);
}

/**
 * 查找 `@lazygoal/contracts` 中禁止的 Node 依赖用法。
 *
 * @param sources - 待扫描的源码文本。
 * @returns 每个违规位置的文件、行号与说明。
 */
export function findContractsPurityViolations(
    sources: readonly SourceText[],
): BoundaryFinding[] {
    const findings: BoundaryFinding[] = [];
    const patterns = [
        { regex: /\bfrom\s*["']node:[^"']*["']/g, message: "contracts 不得导入 node: 模块" },
        { regex: /\bimport\s*\(\s*["']node:[^"']*["']\s*\)/g, message: "contracts 不得动态导入 node: 模块" },
        { regex: /\brequire\s*\(\s*["']node:[^"']*["']\s*\)/g, message: "contracts 不得 require node: 模块" },
        { regex: /\bBuffer\b/g, message: "contracts 不得使用 Buffer" },
        { regex: /\bprocess\b/g, message: "contracts 不得使用 process" },
        { regex: /\brequire\s*\(/g, message: "contracts 不得使用 require" },
    ];

    for (const source of sources) {
        for (const pattern of patterns) {
            pattern.regex.lastIndex = 0;
            for (const match of source.text.matchAll(pattern.regex)) {
                findings.push({
                    path: source.path,
                    line: lineAt(source.text, match.index ?? 0),
                    message: pattern.message,
                });
            }
        }
    }

    return findings.sort(compareFindings);
}

async function collectSources(root: string, directory: string): Promise<SourceText[]> {
    const sources: SourceText[] = [];
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        return sources;
    }
    for (const entry of entries) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
            sources.push(...await collectSources(root, full));
        } else if (/\.[cm]?tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
            sources.push({ path: projectPath(root, full), text: await readFile(full, "utf8") });
        }
    }
    return sources;
}

async function collectWorkspaceSources(): Promise<SourceText[]> {
    const sources: SourceText[] = [];
    for (const area of ["packages", "apps", "benchmarks"]) {
        const areaPath = join(repoRoot, area);
        const entries = await readdir(areaPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            sources.push(...await collectSources(repoRoot, join(areaPath, entry.name, "src")));
        }
    }
    return sources;
}

test("helper 定义匹配器报告违规文件与行号，并忽略用法与 allowlist", () => {
    const findings = findDuplicateHelperDefinitions([
        {
            path: "packages/demo/src/guard.ts",
            text: [
                "const payload = value;",
                "function isRecord(value: unknown): value is Record<string, unknown> {",
                "    return typeof value === \"object\";",
                "}",
            ].join("\n"),
        },
        {
            path: "packages/demo/src/arrow.ts",
            text: "const object = (value: unknown): value is Record<string, unknown> => value !== null;",
        },
        {
            path: "packages/demo/src/usage.ts",
            text: "if (isRecord(value)) console.log(value);",
        },
        {
            path: "packages/demo/src/other-arrow.ts",
            text: "const object = (value: unknown) => value;",
        },
        {
            path: "packages/contracts/src/json.ts",
            text: "function isRecord(value: unknown): value is Record<string, unknown> { return true; }",
        },
    ]);

    assert.deepEqual(findings, [
        { path: "packages/demo/src/arrow.ts", line: 1, name: "object" },
        { path: "packages/demo/src/guard.ts", line: 2, name: "isRecord" },
    ]);
});

test("base64url 匹配器只允许 path-segment 实现", () => {
    const findings = findBase64UrlEncodings([
        {
            path: "packages/storage/src/demo-store.ts",
            text: "const name = Buffer.from(goalId, \"utf8\").toString(\"base64url\");",
        },
        {
            path: "packages/storage/src/path-segment.ts",
            text: "const name = Buffer.from(value, \"utf8\").toString(\"base64url\");",
        },
    ]);

    assert.deepEqual(findings, [{
        path: "packages/storage/src/demo-store.ts",
        line: 1,
        message: "base64url 路径编码必须经 path-segment.ts",
    }]);
});

test("contracts 纯净性匹配器拒绝 node 模块与 Node 全局对象", () => {
    const findings = findContractsPurityViolations([
        {
            path: "packages/contracts/src/demo.ts",
            text: [
                "import { join } from \"node:path\";",
                "const encoded = Buffer.from(\"a\").toString(\"base64\");",
                "const cwd = process.cwd();",
                "void join; void encoded; void cwd;",
            ].join("\n"),
        },
    ]);

    assert.deepEqual(findings.map(finding => finding.line), [1, 2, 3]);
});

test("真实仓库不存在 allowlist 之外的重复 helper 定义", async () => {
    const findings = findDuplicateHelperDefinitions(await collectWorkspaceSources());

    assert.deepEqual(findings, []);
});

test("真实仓库的 base64url 路径编码只存在于 path-segment.ts", async () => {
    const findings = findBase64UrlEncodings(
        await collectSources(repoRoot, join(repoRoot, "packages", "storage", "src")),
    );

    assert.deepEqual(findings, []);
});

test("contracts 源码不依赖 node 模块或 Node 全局对象", async () => {
    const findings = findContractsPurityViolations(
        await collectSources(repoRoot, join(repoRoot, "packages", "contracts", "src")),
    );

    assert.deepEqual(findings, []);
});

test("helper allowlist 中的文件均存在", () => {
    for (const path of HELPER_ALLOWLIST) {
        assert.ok(existsSync(join(repoRoot, path)), `allowlist 目标不存在：${path}`);
    }
});
