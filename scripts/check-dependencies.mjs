import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 每个 package 允许的出站目标（from -> allowed target packages）。
 *
 * contracts、execution-stream 与 execution-control 是无出站依赖的基础包；其它 package 可以单向依赖它们。
 * model-contracts 承载模型输出与对话协议，仅单向依赖 contracts。
 * tool-core 提供通用工具抽象，仅依赖 contracts、execution-control、sandbox。
 * config 是无 LazyGoal 出站依赖的应用配置与 Home 路径包；
 * runtime 依赖 contracts、model-contracts、execution-stream、sandbox、permission、context-retrieval、execution-control 和 tool-core；
 * llm 只依赖 contracts、model-contracts、execution-stream 与 execution-control；
 * storage 依赖 runtime、contracts、model-contracts、permission、context-retrieval；
 * agent 复用 runtime、llm、contracts、model-contracts、execution-stream、execution-control、tool-core；
 * session-metrics 通过 Runtime 端口读取 Goal 与调用指标；browser 读取 Runtime 契约并依赖通用 HTTP 宿主；
 * http 不依赖 LazyGoal 包；process-runtime 只依赖 runtime 与 sandbox；
 * goal-server 是服务组合根，可导入所需后端实现。
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
    config: [],
    runtime: ["contracts", "model-contracts", "execution-stream", "sandbox", "permission", "context-retrieval", "execution-control", "tool-core", "working-memory"],
    llm: ["contracts", "model-contracts", "execution-stream", "execution-control", "config"],
    storage: ["runtime", "contracts", "model-contracts", "permission", "context-retrieval"],
    agent: ["runtime", "llm", "config", "contracts", "model-contracts", "execution-stream", "execution-control", "tool-core", "working-memory"],
    "session-metrics": ["runtime", "http", "web-contracts"],
    tools: ["runtime", "contracts", "execution-stream", "sandbox", "execution-control", "tool-core", "process-runtime"],
    "process-runtime": ["runtime", "sandbox"],
    browser: ["http", "runtime", "permission", "web-contracts", "execution-control"],
    "web-contracts": [],
};

const PACKAGES = Object.keys(ALLOWED_PACKAGE_DEPENDENCIES);

/** 每个 app 允许的出站目标 package。 */
const ALLOWED_APP_DEPENDENCIES = {
    "goal-board": ["web-contracts", "slash-command"],
    "goal-server": ["runtime", "storage", "agent", "llm", "config", "tools", "contracts", "slash-command", "execution-stream", "session-metrics", "http", "browser", "permission", "context-retrieval", "web-contracts", "tool-core", "working-memory", "process-runtime"],
};

const APPS = Object.keys(ALLOWED_APP_DEPENDENCIES);

/** Benchmark 目录之间只允许通过 `benchmarks/src/` 共享层通信。 */
const BENCHMARKS = ["alfworld", "swebench", "gaia", "tua-bench", "context"];

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

/**
 * 按目录约束的组件边界：目录内生产代码不得反向依赖宿主实现，
 * 不得直接请求进程退出或注册进程信号。
 */
const COMPONENT_BOUNDARIES = [
    {
        label: "Goal Server 运行时组件",
        rootPrefix: "apps/goal-server/src/runtime/",
        forbidProcessApi: true,
        forbidden: [
            { prefix: "apps/goal-server/src/cli.ts", reason: "宿主 CLI" },
            { prefix: "apps/goal-server/src/composition-root.ts", reason: "HTTP 组合根" },
            { prefix: "packages/browser/src/", reason: "Browser 传输实现" },
            { prefix: "packages/http/src/", reason: "HTTP 宿主实现" },
            { prefix: "packages/web-contracts/src/", reason: "Web wire DTO" },
            { module: "node:http", reason: "Node HTTP 服务实现" },
            { module: "node:https", reason: "Node HTTP 服务实现" },
        ],
    },
    {
        label: "执行装配组件",
        file: "apps/goal-server/src/runtime/execution-composition.ts",
        forbidProcessApi: false,
        forbidden: [
            { prefix: "packages/agent/src/", reason: "具体 Agent/LLM 实现" },
            { prefix: "packages/llm/src/", reason: "具体 Agent/LLM 实现" },
            { prefix: "packages/config/src/", reason: "应用配置解析" },
            { prefix: "packages/storage/src/", reason: "具体文件存储" },
            { prefix: "packages/tools/src/", reason: "默认工具准备" },
        ],
    },
    {
        label: "Runtime 实例生命周期",
        rootPrefix: "packages/runtime/src/lifecycle/",
        forbidProcessApi: true,
        forbidden: [
            { prefix: "apps/", reason: "应用与宿主实现" },
            { prefix: "packages/agent/src/", reason: "具体 Agent/LLM 实现" },
            { prefix: "packages/llm/src/", reason: "具体 Agent/LLM 实现" },
            { prefix: "packages/storage/src/", reason: "具体文件存储" },
            { prefix: "packages/config/src/", reason: "应用配置解析" },
            { prefix: "packages/tools/src/", reason: "默认工具准备" },
            { prefix: "packages/http/src/", reason: "HTTP 宿主实现" },
            { prefix: "packages/browser/src/", reason: "Browser 传输实现" },
            { prefix: "packages/session-metrics/src/", reason: "指标投影实现" },
            { prefix: "packages/web-contracts/src/", reason: "Web wire DTO" },
        ],
    },
];

/**
 * 组件调用入口：组件目录之外的生产代码只能通过入口访问，不能穿透内部文件。
 *
 * 目录内部引用与测试中的定向导入不受此规则限制。
 */
const COMPONENT_ENTRY_RULES = [
    {
        label: "Goal Server 运行时组件",
        rootPrefix: "apps/goal-server/src/runtime/",
        entryPath: "apps/goal-server/src/runtime/index.ts",
    },
    {
        label: "Runtime 实例生命周期",
        rootPrefix: "packages/runtime/src/lifecycle/",
        entryPath: "packages/runtime/src/lifecycle/index.ts",
    },
];

/** 组件源码与其消费型测试不得解析到项目内构建产物；第三方依赖自己的产物目录不在此限。 */
const COMPONENT_ARTIFACT_TEST_ROOTS = [
    "apps/goal-server/test/",
    "packages/runtime/test/",
];

const PROJECT_ARTIFACT_SEGMENTS = ["dist", "lib", "build"];

/** 组件生产代码不得直接请求进程退出或注册进程信号。 */
const PROCESS_API_PATTERNS = [
    { label: "process.exit(", regex: /\bprocess\.exit\s*\(/ },
    {
        label: "process 信号监听",
        regex: /\bprocess\.(?:on|once|addListener)\s*\(\s*["'`](?:SIGINT|SIGTERM|SIGHUP|SIGQUIT|SIGUSR1|SIGUSR2)["'`]/,
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

/**
 * 提取组件边界检查覆盖的全部模块引用。
 *
 * @remarks
 * 除 `from` 形式外还覆盖侧效导入、字面量动态导入与 `require` 字面量，
 * 避免通过重新导出或动态引用绕过边界；结果按出现顺序去重。
 */
function extractModuleSpecifiers(text) {
    const imports = new Set();
    for (const match of text.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)) imports.add(match[2]);
    for (const match of text.matchAll(/\bimport\s*(['"])([^'"]+)\1/g)) imports.add(match[2]);
    for (const match of text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) imports.add(match[2]);
    for (const match of text.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) imports.add(match[2]);
    return [...imports];
}

function isRelativeSpecifier(specifier) {
    return specifier.startsWith("./") || specifier.startsWith("../");
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

/** 收集组件边界、入口规则与消费型测试涉及的文件。 */
async function collectComponentBoundaryFiles(projectRoot) {
    const files = [];
    for (const root of [
        path.join(projectRoot, "apps", "goal-server", "src"),
        path.join(projectRoot, "apps", "goal-server", "test"),
        path.join(projectRoot, "packages", "runtime", "src"),
        path.join(projectRoot, "packages", "runtime", "test"),
    ]) {
        await walkSourceFiles(root, files);
    }
    return files.sort();
}

function toProjectRelativePath(projectRoot, absolutePath) {
    return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function isInsideProject(relativePath) {
    return relativePath !== "" && relativePath !== ".." && !relativePath.startsWith("../");
}

function matchesProjectPrefix(relativePath, prefix) {
    const normalizedPath = normalizeModuleTarget(relativePath);
    const normalizedPrefix = normalizeModuleTarget(prefix);
    if (normalizedPath === normalizedPrefix) return true;
    return normalizedPath.startsWith(normalizedPrefix.endsWith("/") ? normalizedPrefix : `${normalizedPrefix}/`);
}

/** TS 模块引用通常省略扩展名；比较前统一去掉单个文件扩展名。 */
function normalizeModuleTarget(relativePath) {
    return relativePath.replace(/\.(ts|tsx|js|mjs|cjs)$/, "");
}

function isTestFilePath(relativePath) {
    return relativePath.includes("/test/") || relativePath.startsWith("test/");
}

function hasProjectArtifactSegment(relativePath) {
    const segments = relativePath.split("/");
    return PROJECT_ARTIFACT_SEGMENTS.some((segment) => segments.includes(segment));
}

function normalizeEntryPath(relativePath) {
    return relativePath.replace(/\.tsx?$/, "").replace(/\/index$/, "");
}

/**
 * 分析组件目录边界、调用入口与项目内构建产物使用。
 *
 * @param projectRoot - 仓库根目录。
 * @returns 每条违规对应的稳定中文描述；无违规时返回空数组。
 */
async function analyzeComponentBoundaries(projectRoot) {
    const violations = [];

    for (const file of await collectComponentBoundaryFiles(projectRoot)) {
        const relativePath = toProjectRelativePath(projectRoot, file);
        const text = await readFile(file, "utf8");
        const specifiers = extractModuleSpecifiers(text);
        const boundaries = COMPONENT_BOUNDARIES.filter((candidate) =>
            candidate.file !== undefined
                ? candidate.file === relativePath
                : relativePath.startsWith(candidate.rootPrefix));

        for (const boundary of boundaries) {
            for (const specifier of specifiers) {
                const targetRelative = toProjectRelativePath(
                    projectRoot,
                    path.resolve(path.dirname(file), specifier),
                );
                for (const rule of boundary.forbidden) {
                    const hit = rule.module !== undefined
                        ? specifier === rule.module
                        : isRelativeSpecifier(specifier)
                            && isInsideProject(targetRelative)
                            && matchesProjectPrefix(targetRelative, rule.prefix);
                    if (hit) {
                        violations.push(
                            `组件边界违规：${boundary.label} 不得导入 ${rule.reason}（${relativePath} 引用 ${specifier}）`,
                        );
                    }
                }
            }

            if (boundary.forbidProcessApi === true) {
                for (const pattern of PROCESS_API_PATTERNS) {
                    if (pattern.regex.test(text)) {
                        violations.push(
                            `组件边界违规：${boundary.label} 不得直接请求进程退出或注册进程信号（${relativePath} 包含 ${pattern.label}）`,
                        );
                    }
                }
            }
        }

        const isConsumingTest = COMPONENT_ARTIFACT_TEST_ROOTS.some((root) => relativePath.startsWith(root));

        for (const specifier of specifiers) {
            if (!isRelativeSpecifier(specifier)) continue;
            const targetRelative = toProjectRelativePath(
                projectRoot,
                path.resolve(path.dirname(file), specifier),
            );
            if (!isInsideProject(targetRelative) || targetRelative.startsWith("node_modules/")) continue;

            if ((boundaries.length > 0 || isConsumingTest) && hasProjectArtifactSegment(targetRelative)) {
                violations.push(
                    `构件导入违规：${relativePath} 不得导入项目内构建产物（引用 ${specifier}）`,
                );
            }

            for (const entryRule of COMPONENT_ENTRY_RULES) {
                if (relativePath.startsWith(entryRule.rootPrefix) || isTestFilePath(relativePath)) continue;
                if (!matchesProjectPrefix(targetRelative, entryRule.rootPrefix)) continue;
                if (normalizeEntryPath(targetRelative) === normalizeEntryPath(entryRule.entryPath)) continue;
                violations.push(
                    `组件入口违规：${relativePath} 必须通过 ${entryRule.entryPath} 访问${entryRule.label}（引用 ${specifier}）`,
                );
            }
        }
    }

    return violations;
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

    violations.push(...await analyzeComponentBoundaries(projectRoot));

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
