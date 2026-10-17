import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 依赖与边界检查。
 *
 * 只扫描生产源码：各 package 的 `src/`、各 app 的 `src/` 与各 benchmark 的 `src/`；
 * 包内单测与测试夹具不在范围内，由各自包自行约束。检查覆盖：
 *   1. package / app / benchmark 允许的依赖方向；
 *   2. llm-core 与 config 不得引用供应商 SDK（运行时或类型）；
 *   3. 跨能力包消费必须经目标包的 `src/index.ts`，不得穿透内部路径；
 *   4. 已迁移的旧 LLM 路径不得存在或被引用；
 *   5. 相对引用不得落入项目构建产物目录。
 *
 * 模块引用提取覆盖普通/类型 import/export、侧效导入、import 类型表达式与字面量
 * dynamic import（当前仓库的 TypeScript 7 不提供可用的编译器 API，因此按文本模式提取）。
 */

/**
 * 每个 package 允许的出站目标（from -> allowed target packages）。
 *
 * contracts、execution-stream 与 execution-control 是无出站依赖的基础包；其它 package 可以单向依赖它们。
 * model-contracts 承载模型输出与对话协议，仅单向依赖 contracts。
 * tool-core 提供通用工具抽象，仅依赖 contracts、execution-control、sandbox。
 * config 是应用配置与 Home 路径包，单向依赖 llm-core 的共享模型契约；
 * llm-core 承载供应商无关调用契约与共享模型配置，仅依赖 contracts、model-contracts 与 execution-control；
 * llm-openai 承载 OpenAI/OpenAI-compatible 原生适配，只依赖 llm-core、model-contracts、execution-control 与 openai SDK；
 * llm-google 承载 Gemini 原生适配与 strict Schema 投影，只依赖 llm-core、contracts、model-contracts、execution-control 与 @google/genai SDK；
 * llm-pi-ai 承载 pi-ai 多供应商 prompt_only 适配与增量流转换，只依赖 llm-core、execution-control 与锁定版本 pi-ai SDK；
 * model-catalog 承载目录查询、在线发现与可选择性判断，只依赖 llm-core 与锁定版本 pi-ai 静态目录 SDK；
 * runtime 依赖 contracts、model-contracts、execution-stream、sandbox、permission、context-retrieval、execution-control 和 tool-core；
 * llm 只依赖 llm-core、llm-openai、llm-google 与 llm-pi-ai 提供三个默认工厂，不直接依赖 config、model-catalog 或生成 SDK；
 * storage 依赖 runtime、contracts、model-contracts、permission、context-retrieval；
 * agent 复用 runtime、llm、llm-core、contracts、model-contracts、execution-stream、execution-control、tool-core；
 * session-metrics 通过 Runtime 端口读取 Goal 与调用指标；browser 读取 Runtime 契约并依赖通用 HTTP 宿主；
 * http 不依赖 LazyGoal 包；goal-server 是服务组合根，可导入所需后端实现。
 */
const ALLOWED_PACKAGE_DEPENDENCIES = {
    contracts: [],
    "model-contracts": ["contracts"],
    "execution-stream": [],
    "execution-control": [],
    "context-retrieval": ["contracts", "model-contracts"],
    http: [],
    "slash-command": [],
    acp: [],
    sandbox: [],
    permission: ["contracts", "sandbox"],
    "tool-core": ["contracts", "execution-control", "sandbox"],
    "working-memory": ["contracts", "model-contracts"],
    "llm-core": ["contracts", "model-contracts", "execution-control"],
    "llm-openai": ["llm-core", "model-contracts", "execution-control"],
    "llm-google": ["llm-core", "contracts", "model-contracts", "execution-control"],
    "llm-pi-ai": ["llm-core", "execution-control"],
    "model-catalog": ["llm-core"],
    config: ["llm-core"],
    runtime: ["contracts", "model-contracts", "execution-stream", "sandbox", "permission", "context-retrieval", "execution-control", "tool-core", "working-memory"],
    llm: ["llm-core", "llm-openai", "llm-google", "llm-pi-ai"],
    storage: ["runtime", "contracts", "model-contracts", "permission", "context-retrieval"],
    agent: ["runtime", "llm", "llm-core", "config", "contracts", "model-contracts", "execution-stream", "execution-control", "tool-core", "working-memory"],
    "session-metrics": ["runtime", "http", "web-contracts"],
    tools: ["runtime", "contracts", "execution-stream", "sandbox", "execution-control", "tool-core"],
    browser: ["http", "runtime", "permission", "web-contracts", "execution-control"],
    "web-contracts": [],
};

const PACKAGES = Object.keys(ALLOWED_PACKAGE_DEPENDENCIES);

/** 每个 app 允许的出站目标 package。 */
const ALLOWED_APP_DEPENDENCIES = {
    "goal-board": ["web-contracts", "slash-command"],
    "goal-server": ["runtime", "storage", "agent", "llm", "llm-core", "model-catalog", "config", "tools", "contracts", "slash-command", "execution-stream", "session-metrics", "http", "browser", "permission", "context-retrieval", "web-contracts", "tool-core", "working-memory"],
};

const APPS = Object.keys(ALLOWED_APP_DEPENDENCIES);

/** Benchmark 目录之间只允许通过 `benchmarks/src/` 共享层通信。 */
const BENCHMARKS = ["alfworld", "swebench", "gaia", "tua-bench", "context"];

/**
 * 生产源码禁止直接引用的供应商 SDK；llm-core 与 config 不得出现其运行时或类型引用。
 */
const VENDOR_SDK_MODULES = ["openai", "@google/genai", "@earendil-works/pi-ai"];

/** 跨包消费必须经 `src/index.ts` 的能力包。 */
const CAPABILITY_PACKAGES = ["llm-core", "llm-openai", "llm-google", "llm-pi-ai", "model-catalog"];

/** 已迁移的旧 LLM 实现路径；不得存在，源码也不得再引用。 */
const REMOVED_LLM_PATHS = [
    "packages/llm/src/adapter.ts",
    "packages/llm/src/factory.ts",
    "packages/llm/src/gemini.ts",
    "packages/llm/src/pi-ai.ts",
    "packages/llm/src/openai-compatible.ts",
    "packages/llm/src/model-catalog.ts",
    "packages/llm/src/provider-fetchers.ts",
    "packages/llm/src/smoke-test.ts",
    "packages/llm/src/core",
];

/** 相对引用不得落入的项目构建产物目录名。 */
const ARTIFACT_DIRECTORY_NAMES = ["dist", "lib", "build"];

/** 必须在生产源码中保持无供应商 SDK 引用的包。 */
const SDK_FREE_PACKAGES = new Set(["llm-core", "config"]);

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

/**
 * 提取文件文本中的模块引用说明符（每个说明符只报告一次）。
 *
 * 覆盖普通/类型 import/export（`from "..."`）、侧效导入（`import "..."`）、
 * import 类型表达式与字面量 dynamic import（`import("...")`）。
 */
function extractModuleReferences(text) {
    const specifiers = new Set();
    for (const match of text.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)) specifiers.add(match[2]);
    for (const match of text.matchAll(/\bimport\s*(['"])([^'"]+)\1/g)) specifiers.add(match[2]);
    for (const match of text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) specifiers.add(match[2]);
    return [...specifiers];
}

/**
 * 提取相对 `from "..."` 说明符，沿用既有 FILE_BOUNDARY_RULES 的原始检测范围，
 * 不扩展其它 Spec 已批准约束的强制面。
 */
function extractRelativeFromSpecifiers(text) {
    const specifiers = new Set();
    for (const match of text.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)) {
        const specifier = match[2];
        if (specifier.startsWith("./") || specifier.startsWith("../")) specifiers.add(specifier);
    }
    return [...specifiers];
}

/** 判定外部说明符是否属于受管的供应商 SDK（含子路径）。 */
function isVendorSdkSpecifier(specifier) {
    return VENDOR_SDK_MODULES.some(
        moduleName => specifier === moduleName || specifier.startsWith(`${moduleName}/`),
    );
}

/** 去掉相对解析结果的文件扩展名，便于按模块基名比较。 */
function stripExtension(relativePath) {
    return relativePath.replace(/\.(d\.ts|ts|tsx|mjs|cjs|js)$/, "");
}

/** 已迁移旧 LLM 路径的基名集合（无扩展名）。 */
const REMOVED_LLM_BASES = REMOVED_LLM_PATHS.map(removed => stripExtension(removed));

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

/**
 * 对一次相对模块引用执行与来源类型无关的边界检查。
 *
 * @param projectRoot - 仓库根目录。
 * @param file - 引用所在文件的绝对路径。
 * @param relativePath - 引用文件的仓库相对 POSIX 路径。
 * @param sourcePackage - 来源 package 名；app 与 benchmark 来源为 null。
 * @param specifier - 相对模块说明符。
 * @returns 命中的违规描述；无命中返回 null。
 */
function referenceBoundaryViolation(projectRoot, file, relativePath, sourcePackage, specifier) {
    const resolved = relativeResolvedPath(projectRoot, file, specifier);
    const normalized = stripExtension(resolved);

    for (const removed of REMOVED_LLM_BASES) {
        if (normalized === removed || normalized.startsWith(`${removed}/`)) {
            return `禁止引用旧 LLM 路径：${relativePath} 引用 ${specifier}`;
        }
    }

    if (resolved.split("/").some(segment => ARTIFACT_DIRECTORY_NAMES.includes(segment))) {
        return `禁止引用项目构建产物：${relativePath} 引用 ${specifier}`;
    }

    const targetPackage = targetPackageOf(projectRoot, file, specifier);
    if (targetPackage !== null
        && CAPABILITY_PACKAGES.includes(targetPackage)
        && targetPackage !== sourcePackage
        && normalized !== `packages/${targetPackage}/src/index`) {
        return `跨能力包入口穿透：${relativePath} 不得越过 packages/${targetPackage}/src/index.ts 消费（引用 ${specifier}）`;
    }

    return null;
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

/** 判定说明符是否为相对模块引用。 */
function isRelativeSpecifier(specifier) {
    return specifier.startsWith("./") || specifier.startsWith("../");
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

    for (const removed of REMOVED_LLM_PATHS) {
        if (existsSync(path.join(projectRoot, removed))) {
            violations.push(`旧路径转发残留：${removed} 仍然存在`);
        }
    }

    for (const file of files) {
        const text = await readFile(file, "utf8");
        const sourcePackage = packageNameOf(file);
        const relativePath = path.relative(projectRoot, file).split(path.sep).join("/");

        if (sourcePackage === null || !ALLOWED_PACKAGE_DEPENDENCIES[sourcePackage]) {
            continue;
        }

        for (const specifier of extractModuleReferences(text)) {
            if (!isRelativeSpecifier(specifier)) {
                if (SDK_FREE_PACKAGES.has(sourcePackage) && isVendorSdkSpecifier(specifier)) {
                    violations.push(
                        `供应商 SDK 泄漏：packages/${sourcePackage} 不得引用 ${specifier}（${relativePath}）`,
                    );
                }
                continue;
            }

            const boundary = referenceBoundaryViolation(projectRoot, file, relativePath, sourcePackage, specifier);
            if (boundary !== null) {
                violations.push(boundary);
            }

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

        for (const specifier of extractRelativeFromSpecifiers(text)) {
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
        for (const specifier of extractModuleReferences(text)) {
            if (isRelativeSpecifier(specifier)) {
                const boundary = referenceBoundaryViolation(projectRoot, file, relativePath, null, specifier);
                if (boundary !== null) {
                    violations.push(boundary);
                }
            }
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
        for (const specifier of extractModuleReferences(text)) {
            if (isRelativeSpecifier(specifier)) {
                const boundary = referenceBoundaryViolation(projectRoot, file, relativePath, null, specifier);
                if (boundary !== null) {
                    violations.push(boundary);
                }
            }
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
 * 校验依赖方向、SDK 泄漏、跨能力包入口、旧路径与构建产物引用，存在违规时抛错。
 *
 * @param projectRoot - 仓库根目录。
 * @returns 扫描到的源文件数量。
 * @throws 存在任何依赖方向、SDK 泄漏、入口穿透、旧路径或构建产物违规时抛出 Error。
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
