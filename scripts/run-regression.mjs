#!/usr/bin/env node
/**
 * 统一确定性回归入口:npm test 的实现载体。
 *
 * 按固定顺序执行三段检查,任一段失败即停止并透传其退出码:
 *   1. 类型检查(npx tsc --noEmit)
 *   2. 依赖边界检查(npm run check:dependencies)
 *   3. 测试段(一次 tsx --test 跑全部发现的 .ts/.tsx 测试 + node --test 跑 scripts 的 .mjs 测试)
 *
 * 测试文件按目录约定递归发现,新增确定性测试文件零配置纳入:
 *   - packages/<pkg>/test/ 下的全部 *.test.ts / *.test.tsx
 *   - benchmarks/<name>/test/ 与 benchmarks/test/ 下的全部 *.test.ts
 *   - scripts/ 下的全部 *.test.mjs
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..");

/** 递归收集目录下全部匹配谓词的文件路径(排序保证确定性)。 */
function collectFiles(dir, predicate) {
    const results = [];
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectFiles(full, predicate));
        } else if (entry.isFile() && predicate(entry.name)) {
            results.push(full);
        }
    }
    return results.sort();
}

function isTsTestFile(name) {
    return name.endsWith(".test.ts") || name.endsWith(".test.tsx");
}

function isMjsTestFile(name) {
    return name.endsWith(".test.mjs");
}

/** 发现全部确定性测试文件。 */
function discoverTestFiles() {
    const tsFiles = [];
    for (const entry of readdirSync(join(repoRoot, "packages"), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const testDir = join(repoRoot, "packages", entry.name, "test");
        if (!statSync(testDir, { throwIfNoEntry: false })?.isDirectory()) continue;
        tsFiles.push(...collectFiles(testDir, isTsTestFile));
    }
    tsFiles.push(...collectFiles(join(repoRoot, "benchmarks", "test"), isTsTestFile));
    for (const entry of readdirSync(join(repoRoot, "benchmarks"), { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "test") continue;
        const testDir = join(repoRoot, "benchmarks", entry.name, "test");
        if (!statSync(testDir, { throwIfNoEntry: false })?.isDirectory()) continue;
        tsFiles.push(...collectFiles(testDir, isTsTestFile));
    }
    const mjsFiles = collectFiles(join(repoRoot, "scripts"), isMjsTestFile);
    return { tsFiles, mjsFiles };
}

/** 执行一段子命令;返回其退出码(null 表示无法启动)。 */
function runStage(label, command, args) {
    console.log(`[regression] ${label}`);
    const result = spawnSync(command, args, { stdio: "inherit", cwd: repoRoot });
    return result.status ?? 1;
}

const { tsFiles, mjsFiles } = discoverTestFiles();
console.log(`[regression] 发现测试文件:${tsFiles.length} 个 .ts/.tsx,${mjsFiles.length} 个 .mjs`);

const stages = [
    { label: "类型检查", command: "npx", args: ["tsc", "--noEmit"] },
    { label: "依赖边界检查", command: "npm", args: ["run", "check:dependencies"] },
    { label: "测试", command: "npx", args: ["tsx", "--test", ...tsFiles] },
];
if (mjsFiles.length > 0) {
    stages.push({ label: "scripts 测试", command: "node", args: ["--test", ...mjsFiles] });
}

for (const stage of stages) {
    const code = runStage(stage.label, stage.command, stage.args);
    if (code !== 0) {
        console.error(`[regression] 失败于 ${stage.label}`);
        process.exit(code);
    }
}

console.log("[regression] 全部通过");
