import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 每个 package 允许的出站目标（from -> allowed target packages）。
 *
 * contracts、execution-stream 与 execution-control 是无出站依赖的基础包；其它 package 可以单向依赖它们。
 * runtime 依赖 contracts、execution-stream、sandbox、permission、context-retrieval 和 execution-control；
 * llm 只依赖 contracts、execution-stream 与 execution-control；storage 只依赖 runtime/contracts；agent/tools 复用
 * runtime、llm（agent）和 execution-stream；session-metrics 通过 Runtime
 * 端口读取 Goal 与调用指标；browser 读取 Runtime 契约并依赖通用 HTTP 宿主；
 * http 不依赖 LazyGoal 包；goal-server 是服务组合根，可导入所需后端实现。
 */
const ALLOWED_PACKAGE_DEPENDENCIES = {
    contracts: [],
    "execution-stream": [],
    "execution-control": [],
    "context-retrieval": ["contracts"],
    http: [],
    "slash-command": [],
    acp: [],
    sandbox: [],
    permission: ["contracts", "sandbox"],
    "tool-core": ["contracts", "execution-control", "sandbox"],
    runtime: ["contracts", "execution-stream", "sandbox", "permission", "context-retrieval", "execution-control", "tool-core"],
    llm: ["contracts", "execution-stream", "execution-control"],
    storage: ["runtime", "contracts", "permission", "context-retrieval"],
    agent: ["runtime", "llm", "contracts", "execution-stream", "execution-control", "tool-core"],
    "session-metrics": ["runtime", "http", "web-contracts"],
    tools: ["runtime", "contracts", "execution-stream", "sandbox", "execution-control", "tool-core"],
    browser: ["http", "runtime", "permission", "web-contracts", "execution-control"],
    "web-contracts": [],
};

const PACKAGES = Object.keys(ALLOWED_PACKAGE_DEPENDENCIES);

/** 每个 app 允许的出站目标 package。 */
const ALLOWED_APP_DEPENDENCIES = {
    "goal-board": ["web-contracts", "slash-command"],
    "goal-server": ["runtime", "storage", "agent", "llm", "tools", "contracts", "slash-command", "execution-stream", "session-metrics", "http", "browser", "permission", "context-retrieval", "web-contracts", "tool-core"],
};

const APPS = Object.keys(ALLOWED_APP_DEPENDENCIES);

/** Benchmark 目录之间只允许通过 `benchmarks/src/` 共享层通信。 */
const BENCHMARKS = ["alfworld", "swebench", "gaia", "tua-bench"];

/**
 * 即使 package 出站边被允许、也禁止导入所列 package 的单个文件。
 *
 * 只有 Codec（goal-snapshot-codec.ts）与 Projector（model-inference-projector.ts）
 * 允许同时看到 Runtime 领域类型与各自的 View DTO；View DTO、Renderer 与
 * Storage DTO/Schema 必须保持纯表示，不得反向引用 Runtime。
 */
const FILE_BOUNDARY_RULES = [
    {
        relativePath: "packages/agent/src/model-inference-view.ts",
        forbidden: ["runtime"],
        label: "ModelInferenceView DTO",
    },
    {
        relativePath: "packages/agent/src/render.ts",
        forbidden: ["runtime"],
        label: "Prompt Renderer",
    },
    {
        relativePath: "packages/storage/src/goal-snapshot.ts",
        forbidden: ["runtime"],
        label: "Goal Snapshot DTO/Schema",
    },
    {
        relativePath: "packages/storage/src/agent-profile-file.ts",
        forbidden: ["runtime"],
        label: "AgentProfile 文件 DTO/Schema",
    },
];

function fail(message) {
    throw new Error(message);
}

/** 从 `packages/<name>/src/...` 绝对路径提取 package 名；非该结构返回 null。 */
function packageNameOf(filePath) {
    const match = /[/\\]packages[/\\]([^/\\]+)[/\\]src(?:[/\\]|$)/.exec(filePath);
    return match === null ? null : match[1];
}

/** 从 `apps/<name>/src/...` 绝对路径提取 app 名；非该结构返回 null。 */
function appNameOf(filePath) {
    const match = /[/\\]apps[/\\]([^/\\]+)[/\\]src(?:[/\\]|$)/.exec(filePath);
    return match === null ? null : match[1];
}

/** 提取文件文本中的相对 import specifier（不含 node 内置与外部依赖）。 */
function extractRelativeImports(text) {
    const imports = [];
    for (const match of text.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)) {
        const specifier = match[2];
        if (specifier.startsWith("./") || specifier.startsWith("../")) {
            imports.push(specifier);
        }
    }
    return imports;
}

/** 将相对 specifier 解析为 import 源文件相对 projectRoot 的 POSIX 路径。 */
function relativeResolvedPath(projectRoot, fromFile, specifier) {
    return path.posix.join(
        "",
        path.relative(projectRoot, path.resolve(path.dirname(fromFile), specifier))
            .split(path.sep).join("/"),
    );
}

/** 解析一次相对 import 指向的目标 package；指向 package 外返回 null。 */
function targetPackageOf(projectRoot, fromFile, specifier) {
    return packageNameOf(
        path.resolve(path.dirname(fromFile), specifier),
    );
}

/** 解析一次相对 import 指向的目标 app；指向 app 外返回 null。 */
function targetAppOf(projectRoot, fromFile, specifier) {
    return appNameOf(
        path.resolve(path.dirname(fromFile), specifier),
    );
}

/** 递归收集 packages 下 src 目录内的 .ts/.tsx 文件；缺失目录按空处理。 */
async function walkSourceFiles(dir, out) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (error?.code === "ENOENT") {
            return;
        }
        throw error;
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walkSourceFiles(full, out);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
            out.push(full);
        }
    }
}

async function collectSourceFiles(projectRoot) {
    const files = [];
    for (const packageName of PACKAGES) {
        await walkSourceFiles(
            path.join(projectRoot, "packages", packageName, "src"),
            files,
        );
    }
    return files.sort();
}

/** 递归收集 app 自己的 TypeScript/TSX 源文件。 */
async function collectAppSourceFiles(projectRoot) {
    const files = [];
    for (const appName of APPS) {
        await walkSourceFiles(
            path.join(projectRoot, "apps", appName, "src"),
            files,
        );
    }
    return files.sort();
}

/** 递归收集 benchmark 自己的 TypeScript 源文件。 */
async function collectBenchmarkSourceFiles(projectRoot) {
    const files = [];
    for (const benchmarkName of BENCHMARKS) {
        await walkSourceFiles(
            path.join(projectRoot, "benchmarks", benchmarkName, "src"),
            files,
        );
    }
    return files.sort();
}

/** 从 `benchmarks/<name>/src/...` 绝对路径提取 benchmark 名。 */
function benchmarkNameOf(filePath) {
    const match = /[/\\]benchmarks[/\\]([^/\\]+)[/\\]src(?:[/\\]|$)/.exec(filePath);
    return match === null || !BENCHMARKS.includes(match[1]) ? null : match[1];
}

/**
 * 分析源码依赖方向并返回违反边界的情况列表。
 *
 * @param projectRoot - 仓库根目录。
 * @returns 每次违规对应的稳定中文描述；无违规时返回空数组。
 */
export async function analyzeDependencies(projectRoot) {
    const files = await collectSourceFiles(projectRoot);
    const violations = [];

    for (const file of files) {
        const text = await readFile(file, "utf8");
        const sourcePackage = packageNameOf(file);
        const relativePath = path.relative(projectRoot, file).split(path.sep).join("/");

        if (sourcePackage === null || !ALLOWED_PACKAGE_DEPENDENCIES[sourcePackage]) {
            continue;
        }

        for (const specifier of extractRelativeImports(text)) {
            const targetPackage = targetPackageOf(projectRoot, file, specifier);
            if (targetPackage === null || targetPackage === sourcePackage) {
                continue;
            }

            if (!ALLOWED_PACKAGE_DEPENDENCIES[sourcePackage].includes(targetPackage)) {
                violations.push(
                    `禁止依赖方向：packages/${sourcePackage} 不得导入 packages/${targetPackage}（${relativePath} 引用 ${specifier}）`,
                );
            }
        }

        const rule = FILE_BOUNDARY_RULES.find(
            (candidate) => candidate.relativePath === relativePath,
        );

        if (rule === undefined) {
            continue;
        }

        for (const specifier of extractRelativeImports(text)) {
            const targetPackage = targetPackageOf(projectRoot, file, specifier);
            if (targetPackage !== null && rule.forbidden.includes(targetPackage)) {
                violations.push(
                    `边界违规：${rule.label} 不得导入 packages/${targetPackage}（${relativePath} 引用 ${specifier}）`,
                );
            }
        }
    }

    for (const file of await collectBenchmarkSourceFiles(projectRoot)) {
        const sourceBenchmark = benchmarkNameOf(file);
        if (sourceBenchmark === null) continue;
        const text = await readFile(file, "utf8");
        const relativePath = path.relative(projectRoot, file).split(path.sep).join("/");
        for (const specifier of extractRelativeImports(text)) {
            const targetBenchmark = benchmarkNameOf(
                path.resolve(path.dirname(file), specifier),
            );
            if (targetBenchmark === null || targetBenchmark === sourceBenchmark) continue;
            violations.push(
                `禁止 benchmark 交叉依赖：benchmarks/${sourceBenchmark} 不得导入 benchmarks/${targetBenchmark}（${relativePath} 引用 ${specifier}）`,
            );
        }
    }

    for (const file of await collectAppSourceFiles(projectRoot)) {
        const sourceApp = appNameOf(file);
        if (sourceApp === null || !ALLOWED_APP_DEPENDENCIES[sourceApp]) continue;
        const text = await readFile(file, "utf8");
        const relativePath = path.relative(projectRoot, file).split(path.sep).join("/");
        for (const specifier of extractRelativeImports(text)) {
            const targetPackage = targetPackageOf(projectRoot, file, specifier);
            if (targetPackage !== null && !ALLOWED_APP_DEPENDENCIES[sourceApp].includes(targetPackage)) {
                violations.push(
                    `禁止依赖方向：apps/${sourceApp} 不得导入 packages/${targetPackage}（${relativePath} 引用 ${specifier}）`,
                );
            }
            const targetApp = targetAppOf(projectRoot, file, specifier);
            if (targetApp !== null && targetApp !== sourceApp) {
                violations.push(
                    `禁止应用交叉依赖：apps/${sourceApp} 不得导入 apps/${targetApp}（${relativePath} 引用 ${specifier}）`,
                );
            }
        }
    }

    return violations.sort();
}

/**
 * 校验依赖方向，存在违规时抛错。
 *
 * @param projectRoot - 仓库根目录。
 * @returns 扫描到的源文件数量。
 * @throws 存在任何 package 反向依赖或 DTO/Renderer 违规导入时抛出 Error。
 */
export async function checkDependencies(projectRoot) {
    const violations = await analyzeDependencies(projectRoot);

    if (violations.length > 0) {
        fail(`依赖边界校验失败：\n${violations.join("\n")}`);
    }

    return (await collectSourceFiles(projectRoot)).length;
}

async function main() {
    const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
    const fileCount = await checkDependencies(projectRoot);
    process.stdout.write(`依赖边界验证通过：${fileCount} 个源文件\n`);
}

const invokedPath = process.argv[1] === undefined
    ? undefined
    : pathToFileURL(process.argv[1]).href;

if (invokedPath === import.meta.url) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
