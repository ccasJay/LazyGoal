import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 每个 package 允许的出站目标（from -> allowed target packages）。
 *
 * runtime 是分层基座，不导入任何其它 package；llm 仅复用 runtime 的
 * ExecutionControl 中止原语；storage/agent/tools 只依赖 runtime；agent 额外
 * 依赖 llm 的供应商无关消息类型；tui 是组合根，可导入全部实现。
 */
const ALLOWED_PACKAGE_DEPENDENCIES = {
    runtime: [],
    llm: ["runtime"],
    storage: ["runtime"],
    agent: ["runtime", "llm"],
    tools: ["runtime"],
    tui: ["runtime", "storage", "agent", "llm", "tools"],
};

const PACKAGES = Object.keys(ALLOWED_PACKAGE_DEPENDENCIES);

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