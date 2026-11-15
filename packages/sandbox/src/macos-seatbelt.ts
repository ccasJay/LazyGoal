import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type { SandboxMode } from "./capability";

/** macOS 系统固定的 sandbox-exec 可执行文件路径。 */
export const SANDBOX_EXEC_PATH = "/usr/bin/sandbox-exec";

/**
 * 编译 macOS Seatbelt 策略所需的配置参数。
 *
 * @remarks
 * 规范化的路径必须是已经解析真实符号链接的绝对路径。
 * `sandboxMode` 只决定文件系统边界；出站网络始终由 `network` 独立决定。
 * 三档都拒绝写入工作区 `.lazygoal`，`danger-full-access` 还拒绝写入用户主目录 `.lazygoal`。
 *
 * @example
 * ```ts
 * const options: SeatbeltPolicyOptions = {
 *     canonicalWorkspaceRoot: "/Users/user/project",
 *     privateTmpDir: "/tmp/lazygoal-sandbox-123",
 *     protectedPaths: ["/Users/user/project/.git"],
 *     sandboxMode: "workspace-write",
 * };
 * ```
 */
export interface SeatbeltPolicyOptions {
    /** 规范化且已解析真实路径的工作区根目录。 */
    readonly canonicalWorkspaceRoot: string;
    /** 本次受限命令专用的私有临时目录。 */
    readonly privateTmpDir: string;
    /** 需要拒绝写入的受保护路径（如 .git 指针、真实 gitdir 与共享 commondir）。 */
    readonly protectedPaths?: readonly string[];
    /** 额外允许读取的文件或目录规范化路径。 */
    readonly extraReadPaths?: readonly string[];
    /** 额外允许写入的文件或目录规范化路径。 */
    readonly extraWritePaths?: readonly string[];
    /**
     * 文件系统边界档位，缺省为 `"workspace-write"`。
     *
     * @remarks
     * `"workspace-write"` 允许工作区与 `extraWritePaths` 写入；`"read-only"` 取消这两处写权限，
     * 仅保留 `/dev` 与私有临时目录可写；`"danger-full-access"` 放行整机读写，但仍拒绝写入
     * 工作区与用户主目录下的 `.lazygoal` 以及 `protectedPaths`。
     */
    readonly sandboxMode?: SandboxMode;
    /** 网络策略：默认为 "none"（完全断网），"all_outbound" 放行任意目标出站连接（含回环）。 */
    readonly network?: "none" | "all_outbound";
}

/**
 * 判断当前操作系统环境是否支持 macOS Seatbelt 沙箱。
 *
 * @returns 当且仅当当前平台为 darwin 且 /usr/bin/sandbox-exec 存在时返回 true。
 *
 * @example
 * ```ts
 * if (isSeatbeltSupported()) {
 *     // 启用 Seatbelt 沙箱
 * }
 * ```
 */
export function isSeatbeltSupported(): boolean {
    return process.platform === "darwin" && existsSync(SANDBOX_EXEC_PATH);
}

/**
 * 命令沙箱保护状态描述。
 *
 * @remarks
 * 用于准确报告当前操作系统平台与运行环境的沙箱能力，防止向用户或上层虚假声明受 Seatbelt 保护。
 * `isProtected` 为 `false` 表示文件与网络边界均未被平台强制，具体原因由 `description` 给出；
 * 该状态不区分档位，也不表示审批或规则裁决失效。
 *
 * @example
 * ```ts
 * const status = getSandboxProtectionStatus();
 * console.log(status.backend); // "macos_seatbelt" | "unsupported"
 * ```
 */
export interface SandboxProtectionStatus {
    /** 当前生效的沙箱后端技术标识。 */
    readonly backend: "macos_seatbelt" | "unsupported";
    /** 平台是否具备 Seatbelt 强制能力；为 false 时文件与网络边界均未强制。 */
    readonly isProtected: boolean;
    /** 面向展示或诊断的状态可读说明。 */
    readonly description: string;
}

/**
 * 获取当前平台与环境的命令沙箱保护状态。
 *
 * @param platform - 目标平台，默认为 process.platform。
 * @returns 规范化的沙箱保护状态对象。
 *
 * @example
 * ```ts
 * const status = getSandboxProtectionStatus("linux");
 * assert.equal(status.backend, "unsupported");
 * assert.equal(status.isProtected, false);
 * ```
 */
export function getSandboxProtectionStatus(
    platform: NodeJS.Platform = process.platform,
): SandboxProtectionStatus {
    if (platform === "darwin" && isSeatbeltSupported()) {
        return {
            backend: "macos_seatbelt",
            isProtected: true,
            description: "macOS Seatbelt 沙箱保护已启用",
        };
    }

    return {
        backend: "unsupported",
        isProtected: false,
        description: platform === "darwin"
            ? "macOS sandbox-exec 不可用；文件与网络边界未强制"
            : `当前平台 (${platform}) 未启用 Seatbelt 沙箱保护；文件与网络边界未强制`,
    };
}

/**
 * 递归/规范化解析项目内 Git 元数据的真实路径以供保护。
 *
 * @remarks
 * 支持主仓库（.git 为目录）与 worktree（.git 为指向 gitdir 的文件），并解析 worktree 的 `commondir`。
 *
 * @param workspaceRoot - 当前工作区根目录。
 * @returns 需要禁止普通命令写入的规范化路径（包含 .git、真实 gitdir 与共享 commondir）。
 *
 * @example
 * ```ts
 * const gitPaths = await resolveGitProtectionPaths("/path/to/project");
 * ```
 */
export async function resolveGitProtectionPaths(
    workspaceRoot: string,
): Promise<readonly string[]> {
    const gitPath = join(workspaceRoot, ".git");
    const protectedPaths: string[] = [gitPath];

    try {
        const stats = await stat(gitPath);
        let gitDirPath = gitPath;
        if (stats.isFile()) {
            // worktree 场景，内容形如 "gitdir: /path/to/.git/worktrees/<name>"
            const content = await readFile(gitPath, "utf8");
            const match = /^gitdir:\s*(.+)$/m.exec(content);
            if (match !== null && match[1] !== undefined) {
                const rawGitDir = match[1].trim();
                const resolvedGitDir = isAbsolute(rawGitDir)
                    ? rawGitDir
                    : resolve(workspaceRoot, rawGitDir);
                try {
                    gitDirPath = await realpath(resolvedGitDir);
                } catch {
                    gitDirPath = resolvedGitDir;
                }
                protectedPaths.push(gitDirPath);
            }
        } else if (stats.isDirectory()) {
            try {
                gitDirPath = await realpath(gitPath);
                protectedPaths.push(gitDirPath);
            } catch {
                // 保留 gitPath
            }
        }

        // 链接 worktree 的 gitdir 通过 commondir 指向共享 refs/objects/config。
        // 普通 Bash 与受管进程不能继承 Git Tool 对该共享目录的写授权。
        try {
            const rawCommonDir = (await readFile(join(gitDirPath, "commondir"), "utf8")).trim();
            if (rawCommonDir !== "") {
                const resolvedCommonDir = isAbsolute(rawCommonDir)
                    ? rawCommonDir
                    : resolve(gitDirPath, rawCommonDir);
                try {
                    protectedPaths.push(await realpath(resolvedCommonDir));
                } catch {
                    protectedPaths.push(resolvedCommonDir);
                }
            }
        } catch {
            // 主仓库没有 commondir 文件；gitdir 本身已是共享元数据目录。
        }
    } catch {
        // .git 不存在时保留默认路径
    }

    return protectedPaths;
}

function expandPathVariants(p: string): string[] {
    const normalized = p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
    const variants = new Set<string>([normalized]);

    if (normalized.startsWith("/private/")) {
        variants.add(normalized.slice("/private".length));
    } else if (normalized.startsWith("/var/") || normalized.startsWith("/tmp/") || normalized.startsWith("/etc/")) {
        variants.add(`/private${normalized}`);
    }

    return Array.from(variants);
}

/**
 * 将路径集合展开为去重的 Seatbelt 路径匹配子句，保持首次出现顺序。
 */
function renderPathClauses(paths: readonly string[]): string {
    const seen = new Set<string>();
    const clauses: string[] = [];

    for (const path of paths) {
        for (const variant of expandPathVariants(path)) {
            if (seen.has(variant)) continue;
            seen.add(variant);
            clauses.push(`    (subpath "${variant}")\n    (literal "${variant}")`);
        }
    }

    return clauses.join("\n");
}

/**
 * 为受限命令生成 macOS Seatbelt (sbpl) 策略文本。
 *
 * @remarks
 * 默认生成 `workspace-write` 策略：工作区与 `extraWritePaths` 可写，其余路径只读。
 * `read-only` 取消工作区与 `extraWritePaths` 的写权限，只保留 `/dev` 与私有临时目录可写；
 * `danger-full-access` 放行整机读写，但仍拒绝写入工作区与用户主目录下的 `.lazygoal`
 * 以及 `protectedPaths`。三档都按 `network` 决定是否放行出站网络。
 * 相同输入与当前用户主目录产生完全一致的策略文本。
 *
 * @param options - 策略构建参数。
 * @returns 符合 Scheme 语法的 Seatbelt 策略文本。
 *
 * @example
 * ```ts
 * const policy = buildSeatbeltPolicy({
 *     canonicalWorkspaceRoot: "/workspace/project",
 *     privateTmpDir: "/tmp/sandbox-1",
 *     sandboxMode: "read-only",
 * });
 * ```
 */
export function buildSeatbeltPolicy(options: SeatbeltPolicyOptions): string {
    const {
        canonicalWorkspaceRoot,
        privateTmpDir,
        protectedPaths = [],
        extraReadPaths = [],
        extraWritePaths = [],
        sandboxMode = "workspace-write",
        network = "none",
    } = options;

    const workspaceVariants = expandPathVariants(canonicalWorkspaceRoot);
    const tmpVariants = expandPathVariants(privateTmpDir);
    const fullAccess = sandboxMode === "danger-full-access";

    const workspaceReadClauses = renderPathClauses(workspaceVariants);
    const tmpReadClauses = renderPathClauses(tmpVariants);
    const extraReadClauses = renderPathClauses([...extraReadPaths, ...extraWritePaths]);

    const workspaceWriteClauses = renderPathClauses(workspaceVariants);
    const tmpWriteClauses = renderPathClauses(tmpVariants);
    const extraWriteClauses = renderPathClauses(extraWritePaths);

    const writablePathClauses = sandboxMode === "read-only"
        ? tmpWriteClauses
        : [workspaceWriteClauses, tmpWriteClauses, extraWriteClauses]
            .filter((clauses) => clauses !== "")
            .join("\n");

    const workspaceLazygoalPaths = workspaceVariants.map((p) => `${p}/.lazygoal`);
    const deniedWritePaths = fullAccess
        ? [...workspaceLazygoalPaths, join(homedir(), ".lazygoal"), ...protectedPaths]
        : [...workspaceLazygoalPaths, ...protectedPaths];
    const deniedWriteClauses = renderPathClauses(deniedWritePaths);

    const fileReadSection = fullAccess
        ? "(allow file-read*)"
        : `(allow file-read*
    (subpath "/bin")
    (subpath "/sbin")
    (subpath "/usr")
    (subpath "/System")
    (subpath "/Library")
    (subpath "/opt")
    (subpath "/private/etc")
    (subpath "/etc")
    (subpath "/dev")
${[workspaceReadClauses, tmpReadClauses, extraReadClauses]
        .filter((clauses) => clauses !== "")
        .join("\n")}
)`;

    const fileWriteSection = fullAccess
        ? "(allow file-write*)"
        : `(allow file-write-data
    (literal "/dev/null")
    (literal "/dev/zero")
    (literal "/dev/tty")
    (literal "/dev/stdout")
    (literal "/dev/stderr")
    (literal "/dev/stdin")
)
(allow file-write*
${writablePathClauses}
)`;

    const networkClause = network === "all_outbound"
        ? "(allow network-outbound)\n"
        : "";

    return `(version 1)
(deny default)
(import "system.sb")
(allow process-exec)
(allow process-fork)
(allow signal (target self))
(allow file-read-metadata)
${fileReadSection}
${fileWriteSection}
(deny file-write*
${deniedWriteClauses}
)
${networkClause}`;
}

/**
 * 为程序 worker 构建拒绝宿主访问的 Seatbelt 策略。
 *
 * @remarks
 * 调用方须提供 Node.js 及其动态库的真实文件路径；本策略仅对这些文件和
 * 系统运行时开放读取，不继承业务 Tool 的工作区能力。
 *
 * @example
 * ```ts
 * const policy = buildProgramSeatbeltPolicy({
 *   runtimeFiles: ["/usr/local/bin/node", "/tmp/worker.cjs"],
 *   privateTmpDir: "/tmp/program-1",
 *   nodeExecutable: "/usr/local/bin/node",
 * });
 * ```
 */
export function buildProgramSeatbeltPolicy(options: {
    readonly runtimeFiles: readonly string[];
    readonly privateTmpDir: string;
    readonly nodeExecutable: string;
}): string {
    const quote = (value: string): string => {
        if (!isAbsolute(value) || value.includes("\u0000")) throw new Error("PTC_SANDBOX_UNAVAILABLE");
        return JSON.stringify(value);
    };
    const paths = new Set<string>(["/", "/dev/null", "/dev/urandom"]);
    for (const file of [...options.runtimeFiles, options.privateTmpDir, options.nodeExecutable]) {
        let current = file;
        while (current !== "/") {
            paths.add(current);
            current = resolve(current, "..");
        }
    }
    const readFiles = Array.from(paths).flatMap(expandPathVariants)
        .map((path) => `    (literal ${quote(path)})`).join("\n");
    const runtimeLibraryDirs = Array.from(new Set(options.runtimeFiles
        .filter((path) => path.endsWith(".dylib"))
        .map((path) => resolve(path, ".."))))
        .map((path) => `    (subpath ${quote(path)})`).join("\n");
    const privatePaths = expandPathVariants(options.privateTmpDir)
        .map((path) => `    (subpath ${quote(path)})`).join("\n");
    return `(version 1)
(deny default)
(import "system.sb")
(allow process-exec (literal ${quote(options.nodeExecutable)}))
(allow signal (target self))
(allow file-read*
${readFiles}
${runtimeLibraryDirs}
    (subpath "/usr/lib")
    (subpath "/System/Library")
${privatePaths}
)
(allow file-write* ${privatePaths})
(allow file-write-data (literal "/dev/null"))
`;
}

/** 明确允许受限命令继承的无害系统环境变量。 */
const SAFE_ENV_ALLOWLIST = new Set([
    "PATH",
    "TERM",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
    "USER",
    "LOGNAME",
    "SHELL",
    "COLORTERM",
    "TERM_PROGRAM",
    "CI",
]);

/** 敏感环境变量模式：包含这些关键字的变量一律剔除。 */
const SENSITIVE_ENV_PATTERNS = [
    /key/i,
    /token/i,
    /secret/i,
    /auth/i,
    /pass/i,
    /credential/i,
    /private/i,
    /bearer/i,
];

/**
 * 筛选受限沙箱子进程的环境变量，彻底剔除模型凭据及宿主敏感私密信息。
 *
 * @param options - 环境变量筛选参数。
 * @returns 经过清洗并绑定私有临时目录与工作区的环境变量键值对。
 *
 * @example
 * ```ts
 * const cleanEnv = filterSandboxEnvironment({
 *     workspaceRoot: "/workspace/project",
 *     privateTmpDir: "/tmp/sandbox-1",
 * });
 * ```
 */
export function filterSandboxEnvironment(options: {
    readonly workspaceRoot: string;
    readonly privateTmpDir: string;
    readonly env?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
    const sourceEnv = options.env ?? process.env;
    const cleanEnv: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(sourceEnv)) {
        if (value === undefined) {
            continue;
        }

        // 包含敏感词的变量直接丢弃
        if (SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key))) {
            continue;
        }

        // 仅保留明确安全的无害环境变量
        if (SAFE_ENV_ALLOWLIST.has(key)) {
            cleanEnv[key] = value;
        }
    }

    // 默认补全安全的 PATH
    if (cleanEnv["PATH"] === undefined || cleanEnv["PATH"].trim() === "") {
        cleanEnv["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin";
    }

    // 重定向临时目录与 HOME 至沙箱私有临时目录
    cleanEnv["TMPDIR"] = options.privateTmpDir;
    cleanEnv["TEMP"] = options.privateTmpDir;
    cleanEnv["TMP"] = options.privateTmpDir;
    cleanEnv["HOME"] = options.privateTmpDir;
    cleanEnv["PWD"] = options.workspaceRoot;

    return cleanEnv;
}

/**
 * 为单次沙箱执行创建独立的私有临时工作目录。
 *
 * @returns 新建的私有临时目录绝对路径。
 *
 * @example
 * ```ts
 * const tmpDir = await createPrivateTmpDir();
 * ```
 */
export async function createPrivateTmpDir(): Promise<string> {
    const rawDir = await mkdtemp(join(tmpdir(), "lazygoal-sandbox-"));
    try {
        return await realpath(rawDir);
    } catch {
        return rawDir;
    }
}

/**
 * 清理单次沙箱执行的私有临时工作目录。
 *
 * @param tmpDir - 待清理的私有临时目录路径。
 *
 * @example
 * ```ts
 * await cleanupPrivateTmpDir(tmpDir);
 * ```
 */
export async function cleanupPrivateTmpDir(tmpDir: string): Promise<void> {
    try {
        await rm(tmpDir, { recursive: true, force: true });
    } catch {
        // 忽略临时目录删除失败
    }
}
