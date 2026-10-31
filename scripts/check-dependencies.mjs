import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse } from "@babel/parser";

/**
 * 依赖与边界检查。
 *
 * 只扫描生产源码：各 package 的 `src/`、各 app 的 `src/` 与各 benchmark 的 `src/`；
 * 包内单测与测试夹具不在范围（组件消费型测试按既有规则单独纳入）。检查覆盖：
 *   1. package / app / benchmark 允许的依赖方向与 benchmark 隔离；
 *   2. llm-core 与 config 不得引用供应商 SDK（运行时或类型）；
 *   3. 跨能力包与组件目录消费必须经目标包的 `src/index.ts`，不得穿透内部路径；
 *   4. 已迁移的旧 LLM 路径不得存在或被引用；
 *   5. 相对引用不得落入项目构建产物目录（第三方依赖自身产物不在此限）；
 *   6. 组件目录不得反向依赖宿主实现或注册进程信号（既有 Spec 规则）。
 *
 * 模块引用由 `@babel/parser` 的 AST 提取：覆盖普通/类型 import/export、侧效导入、
 * import 类型表达式、字面量 dynamic import、字面量 require 与 import = require。
 * 注释、普通字符串、模板字符串与正则中的伪引用不产生模块引用；解析失败直接报告文件并中止检查。
 */

/**
 * 每个 package 允许的出站目标（from -> allowed target packages）。
 *
 * contract-binding、contracts、execution-stream 与 execution-control 是无出站依赖的基础包；其它 package 可以单向依赖它们。
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
 * agent 只装配能力包，自身不保存请求、调用、解码或执行实现；
 * 九个能力包按 Spec 的依赖方向逐包收紧，Roundtrip 依赖由各自的允许列表拒绝；
 * session-metrics 通过 Runtime 端口读取 Goal 与调用指标；browser 读取 Runtime 契约并依赖通用 HTTP 宿主；
 * http 不依赖 LazyGoal 包；process-runtime 只依赖 runtime 与 sandbox；
 * goal-server 是服务组合根，可导入所需后端实现。
 *
 * 除方向检查外，本脚本还强制：
 * - 九个能力包跨包消费必须经 `src/index.ts`（入口穿透）；组件目录另有入口规则；
 * - 源码不得导入项目 `dist/lib/build` 派生产物；
 * - `packages/agent` 公共入口只转发默认装配。
 */
const ALLOWED_PACKAGE_DEPENDENCIES = {
    contracts: [],
    "contract-binding": [],
    "context-budget": ["contracts"],
    "model-view": ["context-budget", "model-contracts", "context-retrieval"],
    "model-context": ["context-budget", "model-view", "runtime", "contracts", "model-contracts", "tool-core", "working-memory", "context-retrieval", "execution-control"],
    "prompt-renderer": ["model-view", "context-budget"],
    "prompt-bundle": ["prompt-renderer", "model-view", "runtime", "working-memory"],
    "model-request": ["context-budget", "model-view", "model-context", "prompt-renderer", "llm-core", "runtime", "config", "model-contracts", "tool-core", "working-memory"],
    "model-response": ["llm-core", "contracts", "model-contracts"],
    "model-call": ["llm-core", "runtime", "model-response", "execution-control", "execution-stream", "contracts"],
    "model-execution": ["context-budget", "model-view", "model-context", "prompt-renderer", "model-request", "model-response", "model-call", "llm-core", "runtime", "model-contracts", "execution-control"],
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
    agent: ["runtime", "llm", "config", "contracts", "model-contracts", "execution-stream", "execution-control", "tool-core", "working-memory", "context-budget", "model-view", "model-context", "prompt-renderer", "prompt-bundle", "model-request", "model-response", "model-call", "model-execution"],
    "session-metrics": ["runtime", "http", "web-contracts"],
    tools: ["runtime", "contracts", "contract-binding", "execution-stream", "sandbox", "execution-control", "tool-core", "process-runtime"],
    "process-runtime": ["runtime", "sandbox"],
    browser: ["http", "runtime", "permission", "web-contracts", "execution-control"],
    "web-contracts": ["contracts"],
};

const PACKAGES = Object.keys(ALLOWED_PACKAGE_DEPENDENCIES);

/** 本 Spec 拆出的九个能力包；跨包消费必须经过它们的公共入口。 */
const COMPONENT_PACKAGES = [
    "context-budget",
    "model-view",
    "model-context",
    "prompt-renderer",
    "prompt-bundle",
    "model-request",
    "model-response",
    "model-call",
    "model-execution",
];

/** Agent 公共入口只允许转发默认装配实现。 */
const AGENT_ENTRY_EXPORT_SOURCES = ["./create-agent-executor"];

/** 每个 app 允许的出站目标 package。 */
const ALLOWED_APP_DEPENDENCIES = {
    "goal-board": ["web-contracts", "slash-command"],
    "goal-server": ["runtime", "storage", "agent", "llm", "llm-core", "model-catalog", "config", "tools", "contracts", "slash-command", "execution-stream", "session-metrics", "http", "browser", "permission", "context-retrieval", "web-contracts", "tool-core", "working-memory", "process-runtime", "context-budget", "model-view", "model-context", "prompt-renderer", "prompt-bundle", "model-request", "model-response", "model-call", "model-execution"],
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
        relativePath: "packages/model-view/src/model-inference-view.ts",
        forbidden: ["runtime", "model-context"],
        label: "ModelInferenceView DTO",
    },
    {
        relativePath: "packages/model-view/src/model-history-view.ts",
        forbidden: ["runtime", "model-context"],
        label: "模型历史结果 DTO",
    },
    {
        relativePath: "packages/model-request/src/render.ts",
        forbidden: ["runtime"],
        label: "Prompt 请求渲染器",
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
    {
        label: "进程会话运行时",
        rootPrefix: "packages/process-runtime/src/",
        forbidProcessApi: true,
        forbidden: [
            { prefix: "apps/", reason: "应用与宿主实现" },
            { prefix: "packages/tools/src/", reason: "工具协议与授权" },
            { prefix: "packages/tool-core/src/", reason: "工具注册实现" },
            { prefix: "packages/agent/src/", reason: "具体 Agent/LLM 实现" },
            { prefix: "packages/llm/src/", reason: "具体 Agent/LLM 实现" },
            { prefix: "packages/storage/src/", reason: "具体文件存储" },
            { prefix: "packages/config/src/", reason: "环境配置解析" },
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
    {
        label: "进程会话运行时",
        rootPrefix: "packages/process-runtime/src/",
        entryPath: "packages/process-runtime/src/index.ts",
    },
];

/** 组件源码与其消费型测试不得解析到项目内构建产物；第三方依赖自己的产物目录不在此限。 */
const COMPONENT_ARTIFACT_TEST_ROOTS = [
    "apps/goal-server/test/",
    "packages/runtime/test/",
    "packages/process-runtime/test/",
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

/** AST 节点中不承载子节点的元数据字段；递归遍历时跳过位置、注释与原文信息。 */
const AST_METADATA_KEYS = new Set([
    "loc",
    "extra",
    "comments",
    "leadingComments",
    "trailingComments",
    "innerComments",
    "errors",
    "tokens",
]);

/** 读取字符串字面量的值；动态表达式、模板与变量引用返回 undefined。 */
function stringLiteralValue(node) {
    return node !== null && typeof node === "object" && node.type === "StringLiteral"
        ? node.value
        : undefined;
}

/** 返回单个 AST 节点声明的模块说明符；非引用节点返回 undefined。 */
function specifierOfAstNode(node) {
    switch (node.type) {
        case "ImportDeclaration":
        case "ExportNamedDeclaration":
        case "ExportAllDeclaration":
        case "TSImportType":
            return stringLiteralValue(node.source);
        case "TSExternalModuleReference":
            return stringLiteralValue(node.expression);
        case "ImportExpression":
            return stringLiteralValue(node.source);
        case "CallExpression":
            return node.callee?.type === "Identifier"
                && node.callee.name === "require"
                && node.arguments.length === 1
                ? stringLiteralValue(node.arguments[0])
                : undefined;
        default:
            return undefined;
    }
}

/** 递归收集 AST 中的模块引用节点及其源码起始位置。 */
function collectModuleReferenceNodes(node, references) {
    if (Array.isArray(node)) {
        for (const item of node) collectModuleReferenceNodes(item, references);
        return;
    }
    if (node === null || typeof node !== "object") return;

    const specifier = specifierOfAstNode(node);
    if (specifier !== undefined) references.push({ start: node.start ?? 0, specifier });

    for (const [key, value] of Object.entries(node)) {
        if (AST_METADATA_KEYS.has(key)) continue;
        if (value !== null && typeof value === "object") collectModuleReferenceNodes(value, references);
    }
}

/**
 * 按文件扩展名选择 TypeScript / TSX 语法解析源文件。
 *
 * @param sourceText - 待解析的源文件内容。
 * @param relativePath - 源文件相对仓库根的 POSIX 路径；用于选择语法模式与报告错误。
 * @returns Babel 文件 AST。
 * @throws 源文件不符合所选语法时抛出包含相对路径与解析器消息的 Error。
 */
function parseModuleAst(sourceText, relativePath) {
    const plugins = ["typescript"];
    if (path.extname(relativePath).toLowerCase() === ".tsx") plugins.push("jsx");
    try {
        return parse(sourceText, { sourceType: "module", plugins });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`无法解析源文件：${relativePath}：${message}`);
    }
}

/**
 * 从源码 AST 提取模块说明符。
 *
 * @remarks
 * 覆盖静态与侧效导入、`import type` / `export type … from`、命名与全部再导出、
 * 类型位置与字面量动态 `import()`、字面量 `require()` 与 `import x = require("…")`。
 * 结果按源码首次出现位置排序并去重，因此同一说明符只返回一次；注释、字符串、
 * 模板、正则与 `import.meta` 不产生引用。`.ts` 禁用 JSX 以接受尖括号类型断言，
 * `.tsx` 启用 JSX。
 *
 * @param sourceText - 待解析的源文件内容。
 * @param relativePath - 源文件相对仓库根的 POSIX 路径；决定语法模式并出现在解析错误中。
 * @returns 按首次出现顺序去重的模块说明符。
 * @throws 源文件无法按 TypeScript/TSX 解析时抛出包含相对路径与解析器消息的 Error。
 */
export function extractModuleSpecifiers(sourceText, relativePath) {
    const references = [];
    collectModuleReferenceNodes(parseModuleAst(sourceText, relativePath), references);
    references.sort((left, right) => left.start - right.start);
    return [...new Set(references.map((reference) => reference.specifier))];
}

/**
 * 创建一次依赖分析使用的源文件读取与解析缓存。
 *
 * @remarks
 * 同一个 scanner 对同一规范化绝对路径最多读取一次、解析一次；`text()` 与 `specifiers()`
 * 共用读取结果，并发请求复用同一个进行中的 Promise。缓存不跨 scanner 共享，因此两次分析
 * 之间或不同 projectRoot 之间不会复用旧内容。读取或解析失败以 rejected Promise 传给调用者，
 * 不返回空引用。scanner 只负责读取与提取，不包含任何规则判断。
 *
 * @param projectRoot - 仓库根目录；用于生成解析错误中的仓库相对路径。
 * @param dependencies - 可选的读取与提取接缝；测试用它统计调用次数。
 * @param dependencies.readFile - 读取实现，接收规范化绝对路径并返回文件内容 Promise。
 * @param dependencies.extractSpecifiers - 提取实现，接收文件内容与仓库相对路径。
 * @returns 提供 `text(file)` 与 `specifiers(file)` 的 scanner；两者均按绝对路径缓存。
 */
export function createSourceScanner(projectRoot, dependencies = {}) {
    const root = path.resolve(projectRoot);
    const readSource = dependencies.readFile ?? ((file) => readFile(file, "utf8"));
    const extractSpecifiers = dependencies.extractSpecifiers ?? extractModuleSpecifiers;
    const textCache = new Map();
    const specifiersCache = new Map();

    function text(file) {
        const key = path.resolve(file);
        let pending = textCache.get(key);
        if (pending === undefined) {
            pending = readSource(key);
            textCache.set(key, pending);
        }
        return pending;
    }

    function specifiers(file) {
        const key = path.resolve(file);
        let pending = specifiersCache.get(key);
        if (pending === undefined) {
            pending = text(key).then((sourceText) =>
                extractSpecifiers(sourceText, toProjectRelativePath(root, key)));
            specifiersCache.set(key, pending);
        }
        return pending;
    }

    return { text, specifiers };
}

/** 判定说明符是否为相对模块引用。 */
function isRelativeSpecifier(specifier) {
    return specifier.startsWith("./") || specifier.startsWith("../");
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

/** 组件包必须经 `src/index.ts` 消费；返回被穿透的相对路径，合法时返回 undefined。 */
function componentEntryPenetration(projectRoot, fromFile, specifier) {
    const resolved = path.resolve(path.dirname(fromFile), specifier);
    const targetPackage = packageNameOf(resolved);
    if (targetPackage === null || !COMPONENT_PACKAGES.includes(targetPackage)) return undefined;
    if (packageNameOf(fromFile) === targetPackage) return undefined;

    const relative = path.posix.join(
        "",
        path.relative(projectRoot, resolved).split(path.sep).join("/"),
    );
    const allowed = new Set([
        `packages/${targetPackage}/src/index`,
        `packages/${targetPackage}/src/index.ts`,
        `packages/${targetPackage}/src/index.tsx`,
        `packages/${targetPackage}/src/index.js`,
    ]);
    return allowed.has(relative) ? undefined : relative;
}

/** 源码不得导入项目 `dist/lib/build` 派生产物；返回命中的相对路径。 */
function projectArtifactImport(projectRoot, fromFile, specifier) {
    const resolved = path.resolve(path.dirname(fromFile), specifier);
    const relative = path.posix.join(
        "",
        path.relative(projectRoot, resolved).split(path.sep).join("/"),
    );
    const segments = relative.split("/");
    if (!["packages", "apps", "benchmarks"].includes(segments[0])) return undefined;
    return segments.some((segment) => PROJECT_ARTIFACT_SEGMENTS.includes(segment))
        ? relative
        : undefined;
}

/**
 * 对一次相对模块引用执行旧 LLM 路径与跨能力包入口穿透检查。
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

/** 收集组件边界、入口规则与消费型测试涉及的文件。 */
async function collectComponentBoundaryFiles(projectRoot) {
    const files = [];
    for (const root of [
        path.join(projectRoot, "apps", "goal-server", "src"),
        path.join(projectRoot, "apps", "goal-server", "test"),
        path.join(projectRoot, "packages", "runtime", "src"),
        path.join(projectRoot, "packages", "runtime", "test"),
        path.join(projectRoot, "packages", "process-runtime", "src"),
        path.join(projectRoot, "packages", "process-runtime", "test"),
    ]) {
        await walkSourceFiles(root, files);
    }
    return files.sort();
}

/** 收集入口规则扫描的全部生产源文件与消费型测试；跨包消费者同样受入口约束。 */
async function collectEntryScanFiles(projectRoot) {
    const files = [];
    files.push(...await collectSourceFiles(projectRoot));
    files.push(...await collectAppSourceFiles(projectRoot));
    for (const root of COMPONENT_ARTIFACT_TEST_ROOTS) {
        await walkSourceFiles(path.join(projectRoot, root), files);
    }
    return [...new Set(files)].sort();
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
 * @param scanner - 本次分析共享的读取与解析缓存。
 * @returns 每条违规对应的稳定中文描述；无违规时返回空数组。
 */
async function analyzeComponentBoundaries(projectRoot, scanner) {
    const violations = [];

    for (const file of await collectComponentBoundaryFiles(projectRoot)) {
        const relativePath = toProjectRelativePath(projectRoot, file);
        const text = await scanner.text(file);
        const specifiers = await scanner.specifiers(file);
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
        }
    }

    return violations;
}

/**
 * 分析组件调用入口：组件目录之外的生产代码只能通过入口访问，不能穿透内部文件。
 *
 * @remarks
 * 扫描全部 packages/apps 源文件与消费型测试，避免跨包消费者绕过入口规则；
 * 目录内部引用与测试中的定向导入不受限制。
 *
 * @param projectRoot - 仓库根目录。
 * @param scanner - 本次分析共享的读取与解析缓存。
 * @returns 每条违规对应的稳定中文描述；无违规时返回空数组。
 */
async function analyzeEntryBoundaries(projectRoot, scanner) {
    const violations = [];

    for (const file of await collectEntryScanFiles(projectRoot)) {
        const relativePath = toProjectRelativePath(projectRoot, file);
        for (const specifier of await scanner.specifiers(file)) {
            if (!isRelativeSpecifier(specifier)) continue;
            const targetRelative = toProjectRelativePath(
                projectRoot,
                path.resolve(path.dirname(file), specifier),
            );
            if (!isInsideProject(targetRelative) || targetRelative.startsWith("node_modules/")) continue;

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
 * 约束 packages/agent 公共入口只转发默认装配实现。
 *
 * @param projectRoot - 仓库根目录。
 * @param scanner - 本次分析共享的读取与解析缓存。
 * @returns 每条违规对应的稳定中文描述；入口缺失时按无违规处理。
 */
async function analyzeAgentEntryBoundary(projectRoot, scanner) {
    const violations = [];
    const agentEntryPath = path.join(projectRoot, "packages", "agent", "src", "index.ts");
    try {
        for (const specifier of await scanner.specifiers(agentEntryPath)) {
            if (specifier.startsWith(".") && !AGENT_ENTRY_EXPORT_SOURCES.includes(specifier)) {
                violations.push(
                    `入口约束：packages/agent 公共入口只能转发默认装配（packages/agent/src/index.ts 引用 ${specifier}）`,
                );
            }
        }
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }
    return violations;
}

/**
 * 分析源码依赖方向并返回违反边界的情况列表。
 *
 * @remarks
 * 每次调用创建独立的源文件 scanner，因此读取与解析缓存不会跨调用或跨 projectRoot 复用。
 *
 * @param projectRoot - 仓库根目录。
 * @returns 每次违规对应的稳定中文描述；无违规时返回空数组。
 */
export async function analyzeDependencies(projectRoot) {
    return analyzeDependenciesWithScanner(projectRoot, createSourceScanner(projectRoot));
}

/**
 * 使用给定 scanner 分析源码依赖方向。
 *
 * @remarks
 * 生产入口 `analyzeDependencies` 会创建调用级 scanner；需要统计读取/解析次数时，
 * 可由测试传入 `createSourceScanner` 构造的 scanner。scanner 必须属于同一 projectRoot。
 *
 * @param projectRoot - 仓库根目录。
 * @param scanner - 本次分析共享的读取与解析缓存。
 * @returns 每次违规对应的稳定中文描述；无违规时返回空数组。
 */
export async function analyzeDependenciesWithScanner(projectRoot, scanner) {
    const files = await collectSourceFiles(projectRoot);
    const violations = [];

    for (const removed of REMOVED_LLM_PATHS) {
        if (existsSync(path.join(projectRoot, removed))) {
            violations.push(`旧路径转发残留：${removed} 仍然存在`);
        }
    }

    for (const file of files) {
        const sourcePackage = packageNameOf(file);
        const relativePath = path.relative(projectRoot, file).split(path.sep).join("/");

        if (sourcePackage === null || !ALLOWED_PACKAGE_DEPENDENCIES[sourcePackage]) {
            continue;
        }

        const specifiers = await scanner.specifiers(file);
        for (const specifier of specifiers) {
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
            if (targetPackage !== null && targetPackage !== sourcePackage
                && !ALLOWED_PACKAGE_DEPENDENCIES[sourcePackage].includes(targetPackage)) {
                violations.push(
                    `禁止依赖方向：packages/${sourcePackage} 不得导入 packages/${targetPackage}（${relativePath} 引用 ${specifier}）`,
                );
            }

            const penetration = componentEntryPenetration(projectRoot, file, specifier);
            if (penetration !== undefined) {
                violations.push(
                    `入口穿透：packages/${sourcePackage} 必须经 packages/<目标>/src/index.ts 使用组件能力（${relativePath} 引用 ${specifier}）`,
                );
            }

            const artifact = projectArtifactImport(projectRoot, file, specifier);
            if (artifact !== undefined) {
                violations.push(
                    `禁止导入项目产物：${relativePath} 引用 ${specifier}（${artifact}）`,
                );
            }
        }

        const rule = FILE_BOUNDARY_RULES.find(
            (candidate) => candidate.relativePath === relativePath,
        );

        if (rule === undefined) {
            continue;
        }

        for (const specifier of specifiers) {
            if (!isRelativeSpecifier(specifier)) continue;
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
        const relativePath = path.relative(projectRoot, file).split(path.sep).join("/");
        for (const specifier of await scanner.specifiers(file)) {
            if (isRelativeSpecifier(specifier)) {
                const boundary = referenceBoundaryViolation(projectRoot, file, relativePath, null, specifier);
                if (boundary !== null) {
                    violations.push(boundary);
                }
            }
            const targetBenchmark = benchmarkNameOf(
                path.resolve(path.dirname(file), specifier),
            );
            if (targetBenchmark !== null && targetBenchmark !== sourceBenchmark) {
                violations.push(
                    `禁止 benchmark 交叉依赖：benchmarks/${sourceBenchmark} 不得导入 benchmarks/${targetBenchmark}（${relativePath} 引用 ${specifier}）`,
                );
            }

            const penetration = componentEntryPenetration(projectRoot, file, specifier);
            if (penetration !== undefined) {
                violations.push(
                    `入口穿透：benchmarks/${sourceBenchmark} 必须经 packages/<目标>/src/index.ts 使用组件能力（${relativePath} 引用 ${specifier}）`,
                );
            }

            const artifact = projectArtifactImport(projectRoot, file, specifier);
            if (artifact !== undefined) {
                violations.push(
                    `禁止导入项目产物：${relativePath} 引用 ${specifier}（${artifact}）`,
                );
            }
        }
    }

    for (const file of await collectAppSourceFiles(projectRoot)) {
        const sourceApp = appNameOf(file);
        if (sourceApp === null || !ALLOWED_APP_DEPENDENCIES[sourceApp]) continue;
        const relativePath = path.relative(projectRoot, file).split(path.sep).join("/");
        for (const specifier of await scanner.specifiers(file)) {
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

            const penetration = componentEntryPenetration(projectRoot, file, specifier);
            if (penetration !== undefined) {
                violations.push(
                    `入口穿透：apps/${sourceApp} 必须经 packages/<目标>/src/index.ts 使用组件能力（${relativePath} 引用 ${specifier}）`,
                );
            }

            const artifact = projectArtifactImport(projectRoot, file, specifier);
            if (artifact !== undefined) {
                violations.push(
                    `禁止导入项目产物：${relativePath} 引用 ${specifier}（${artifact}）`,
                );
            }
        }
    }

    violations.push(...await analyzeComponentBoundaries(projectRoot, scanner));
    violations.push(...await analyzeEntryBoundaries(projectRoot, scanner));
    violations.push(...await analyzeAgentEntryBoundary(projectRoot, scanner));

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
