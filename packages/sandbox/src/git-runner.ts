import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
    spawnRestrictedCommand,
    killProcessGroup,
} from "./restricted-process";
import {
    buildSeatbeltPolicy,
    cleanupPrivateTmpDir,
    createPrivateTmpDir,
    filterSandboxEnvironment,
    isSeatbeltSupported,
} from "./macos-seatbelt";

/**
 * 进程内基于 Git 仓库路径的写操作排他互斥锁。
 *
 * @remarks
 * 防止同一 Node.js 进程内并发执行写操作导致 index.lock 冲突、HEAD 竞态或元数据损坏。
 * 外部编辑器或非受管进程不在本锁控制范围内。
 */
export class GitMutex {
    private static readonly locks = new Map<string, Promise<void>>();

    /**
     * 在指定仓库路径上获取独占锁并执行传入的回调。
     *
     * @param repoKey - 仓库根目录或 commondir 规范化绝对路径。
     * @param fn - 获得锁后执行的异步操作。
     * @returns fn 的返回值。
     */
    static async withLock<T>(repoKey: string, fn: () => Promise<T>): Promise<T> {
        const currentLock = GitMutex.locks.get(repoKey) ?? Promise.resolve();
        let release: () => void;
        const nextLock = new Promise<void>((resolve) => {
            release = resolve;
        });
        GitMutex.locks.set(repoKey, currentLock.then(() => nextLock));

        try {
            await currentLock;
            return await fn();
        } finally {
            release!();
            if (GitMutex.locks.get(repoKey) === nextLock) {
                GitMutex.locks.delete(repoKey);
            }
        }
    }
}

/** 默认 Git 查询执行超时时间（毫秒）。 */
export const GIT_DEFAULT_TIMEOUT_MS = 10_000;

/** Git 输出字符数软上限（防止过大输出耗尽内存）。 */
export const GIT_MAX_OUTPUT_CHARS = 500_000;

/**
 * Git 仓库资源拓扑信息。
 *
 * @example
 * ```ts
 * const repo: GitRepositoryInfo = {
 *   workspaceRoot: "/path/to/repo",
 *   dotGitPath: "/path/to/repo/.git",
 *   gitDir: "/path/to/repo/.git",
 *   commonDir: "/path/to/repo/.git",
 *   isWorktree: false,
 * };
 * ```
 */
export interface GitRepositoryInfo {
    /** 仓库工作区根目录绝对规范化路径。 */
    readonly workspaceRoot: string;
    /** 该工作树的 .git 路径（可能是目录，也可能是 .git 指针文件）。 */
    readonly dotGitPath: string;
    /** 实际 gitdir 绝对路径（对于主仓库即 dotGitPath，对于 worktree 是其关联的 worktrees/<name> 目录）。 */
    readonly gitDir: string;
    /** 真实共用 commondir 绝对路径（保存 refs, objects, config 的主仓库 gitdir）。 */
    readonly commonDir: string;
    /** 是否为链接的外部 worktree。 */
    readonly isWorktree: boolean;
}

/**
 * 发现并解析目标目录的 Git 仓库资源拓扑。
 *
 * @remarks
 * 从目标路径出发沿目录树向上寻找 `.git`，解析主仓库目录或 worktree 的 gitdir/commondir 真实位置。
 * 若指定目录及其祖先均不包含 `.git`，则抛出明确错误。
 *
 * @param targetPath - 目标路径（工作区根目录或子路径）。
 * @returns 解析得到的 GitRepositoryInfo 拓扑对象。
 * @throws 目标路径不存在或不属于 Git 仓库时抛出 Error。
 *
 * @example
 * ```ts
 * const repoInfo = await discoverGitRepository("/path/to/project");
 * ```
 */
export async function discoverGitRepository(targetPath: string): Promise<GitRepositoryInfo> {
    const canonicalTarget = await realpath(resolve(targetPath));

    let current = canonicalTarget;
    let foundDotGit: string | undefined;

    while (true) {
        const candidate = join(current, ".git");
        if (existsSync(candidate)) {
            foundDotGit = candidate;
            break;
        }
        const parent = dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    if (foundDotGit === undefined) {
        throw new Error(`Directory "${targetPath}" is not inside a Git repository`);
    }

    const dotGitStats = await stat(foundDotGit);
    const repoWorkspaceRoot = dirname(foundDotGit);

    if (dotGitStats.isDirectory()) {
        const canonicalDotGit = await realpath(foundDotGit);
        return {
            workspaceRoot: repoWorkspaceRoot,
            dotGitPath: canonicalDotGit,
            gitDir: canonicalDotGit,
            commonDir: canonicalDotGit,
            isWorktree: false,
        };
    }

    if (dotGitStats.isFile()) {
        const content = await readFile(foundDotGit, "utf8");
        const match = /^gitdir:\s*(.+)$/m.exec(content);
        if (!match || !match[1]) {
            throw new Error(`Invalid .git pointer file in "${targetPath}"`);
        }
        const rawGitDir = match[1].trim();
        const resolvedGitDir = isAbsolute(rawGitDir) ? rawGitDir : resolve(repoWorkspaceRoot, rawGitDir);
        const canonicalGitDir = await realpath(resolvedGitDir);

        let commonDir = canonicalGitDir;
        const commondirFile = join(canonicalGitDir, "commondir");
        if (existsSync(commondirFile)) {
            const commonContent = (await readFile(commondirFile, "utf8")).trim();
            const resolvedCommon = isAbsolute(commonContent)
                ? commonContent
                : resolve(canonicalGitDir, commonContent);
            commonDir = await realpath(resolvedCommon);
        }

        return {
            workspaceRoot: repoWorkspaceRoot,
            dotGitPath: foundDotGit,
            gitDir: canonicalGitDir,
            commonDir,
            isWorktree: true,
        };
    }

    throw new Error(`Invalid .git filesystem entry in "${targetPath}"`);
}

/**
 * 校验给定的参数数组，确保不包含任意破坏沙箱或导致自由命令执行的危险选项。
 *
 * @param args - 待校验的 Git 命令行参数数组。
 * @throws 存在危险或未授权参数时抛出 Error。
 */
export function validateSafeGitArgs(args: readonly string[]): void {
    for (const arg of args) {
        if (
            arg.startsWith("--exec-path") ||
            arg.startsWith("--upload-pack") ||
            arg.startsWith("--receive-pack") ||
            arg.startsWith("--output") ||
            arg === "-o" ||
            arg.startsWith("--paginate") ||
            arg === "-p" ||
            arg.startsWith("--ext-diff") ||
            arg.startsWith("--textconv") ||
            arg.startsWith("--config") ||
            arg === "-c" ||
            arg.startsWith("-c=") ||
            arg.startsWith("--git-dir") ||
            arg.startsWith("--work-tree")
        ) {
            // 注意：允许 git switch -c <branch>，但禁止顶级 git -c key=val 任意配置注入
            if (arg === "-c" && args[0] === "switch") {
                continue;
            }
            throw new Error(`Dangerous or unauthorized Git option "${arg}" is prohibited`);
        }
    }
}

/**
 * 校验给定的写操作参数数组，确保不包含任意破坏沙箱、强制覆写或跳过安全检查的选项。
 *
 * @param args - 待校验的 Git 写操作命令行参数数组。
 * @throws 存在危险、强制或未授权参数时抛出 Error。
 */
export function validateSafeGitWriteArgs(args: readonly string[]): void {
    validateSafeGitArgs(args);
    for (const arg of args) {
        if (
            arg === "--no-verify" ||
            arg === "-n" ||
            arg === "--amend" ||
            arg === "--force" ||
            arg === "-f" ||
            arg === "-D" ||
            arg.startsWith("-f=") ||
            arg.startsWith("--force-") ||
            arg === "-B"
        ) {
            throw new Error(`Dangerous or unauthorized Git write option "${arg}" is prohibited`);
        }
    }
}

/**
 * 执行受限只读 Git 命令的选项。
 */
export interface RunRestrictedGitOptions {
    /** 目标仓库的工作区根目录或子目录。 */
    readonly repoPath: string;
    /**
     * 固定的 Git 命令及其参数数组（例如 `["status", "--porcelain=v2", "-z"]`）。
     * 严禁包含任意用户传入的自由 flag。
     */
    readonly args: readonly string[];
    /** 可选的超时时间（毫秒，默认 10,000）。 */
    readonly timeoutMs?: number | undefined;
    /** 可选的中止控制信号。 */
    readonly signal?: AbortSignal | undefined;
    /** 可选沙箱开关（默认启用 macOS Seatbelt 沙箱）。 */
    readonly enableSeatbelt?: boolean | undefined;
    /** 额外允许读取的文件或目录路径（例如链接工作树所需的外部 common-dir）。 */
    readonly extraReadPaths?: readonly string[] | undefined;
}

/**
 * Git 执行输出结果。
 */
export interface RestrictedGitExecutionResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number | null;
    readonly timedOut: boolean;
    readonly truncated: boolean;
}

/**
 * 在专用受限沙箱中执行固定的只读 Git 命令。
 *
 * @remarks
 * 1. 严格使用固定参数数组，不通过 Shell 解释；
 * 2. 注入核心只读安全配置与参数：
 *    `-c core.quotepath=false`
 *    `-c diff.external=`
 *    `-c diff.color=never`
 *    `-c core.hooksPath=/dev/null`
 *    `--no-pager`
 * 3. 注入安全环境变量：
 *    `GIT_TERMINAL_PROMPT=0`
 *    `GIT_CONFIG_NOSYSTEM=1`
 *    `GIT_OPTIONAL_LOCKS=0`
 * 4. 设置默认 10 秒超时及受管进程组优雅终止；
 * 5. 限制单次输出读取不超过 500,000 字符，超限标记 `truncated: true`。
 *
 * @param options - 执行参数。
 * @returns 包含 stdout/stderr、exitCode、timedOut 与 truncated 的结果。
 *
 * @example
 * ```ts
 * const res = await runRestrictedGit({
 *   repoPath: "/workspace",
 *   args: ["status", "--porcelain=v2", "-z"],
 * });
 * ```
 */
export async function runRestrictedGit(
    options: RunRestrictedGitOptions,
): Promise<RestrictedGitExecutionResult> {
    validateSafeGitArgs(options.args);

    const repoInfo = await discoverGitRepository(options.repoPath);
    const timeoutMs = options.timeoutMs ?? GIT_DEFAULT_TIMEOUT_MS;
    const enableSeatbelt = options.enableSeatbelt ?? true;

    // 基础固定只读前置配置项
    const baseGitArgs = [
        "-c", "core.quotepath=false",
        "-c", "diff.external=",
        "-c", "diff.color=never",
        "-c", "core.hooksPath=/dev/null",
        "--no-pager",
        ...options.args,
    ];

    let privateTmpDir: string | undefined;
    let sandboxRunOptions: { policy: string; env: NodeJS.ProcessEnv } | undefined;

    if (process.platform === "darwin" && enableSeatbelt && isSeatbeltSupported()) {
        privateTmpDir = await createPrivateTmpDir();

        const extraReadPaths = [
            repoInfo.workspaceRoot,
            repoInfo.gitDir,
            repoInfo.commonDir,
            ...(options.extraReadPaths ?? []),
        ];

        const policy = buildSeatbeltPolicy({
            canonicalWorkspaceRoot: repoInfo.workspaceRoot,
            privateTmpDir,
            // 只读 Git 查询禁止写入工作区与 Git 元数据
            protectedPaths: [repoInfo.workspaceRoot, repoInfo.gitDir, repoInfo.commonDir],
            extraReadPaths,
            network: "none",
        });

        const env = filterSandboxEnvironment({
            workspaceRoot: repoInfo.workspaceRoot,
            privateTmpDir,
        });

        env["GIT_TERMINAL_PROMPT"] = "0";
        env["GIT_CONFIG_NOSYSTEM"] = "1";
        env["GIT_OPTIONAL_LOCKS"] = "0";

        sandboxRunOptions = { policy, env };
    }

    const gitExecutable = existsSync("/usr/bin/git") ? "/usr/bin/git" : "git";

    try {
        return await new Promise<RestrictedGitExecutionResult>((resolvePromise, rejectPromise) => {
            const child = spawnRestrictedCommand({
                executable: gitExecutable,
                args: baseGitArgs,
                cwd: repoInfo.workspaceRoot,
                ...(sandboxRunOptions !== undefined ? { sandbox: sandboxRunOptions } : {}),
            });

            let timedOut = false;
            let truncated = false;
            let cancelGrace: (() => void) | undefined;
            let stdoutAccum = "";
            let stderrAccum = "";

            const timer = setTimeout(() => {
                timedOut = true;
                const term = killProcessGroup(child, { graceMs: 2000 });
                cancelGrace = term.cancelGrace;
            }, timeoutMs);

            const onAbort = () => {
                const term = killProcessGroup(child, { graceMs: 1000 });
                cancelGrace = term.cancelGrace;
            };

            if (options.signal?.aborted) {
                onAbort();
            } else {
                options.signal?.addEventListener("abort", onAbort, { once: true });
            }

            child.stdout?.setEncoding("utf8");
            child.stdout?.on("data", (chunk: string) => {
                if (stdoutAccum.length + chunk.length > GIT_MAX_OUTPUT_CHARS) {
                    truncated = true;
                    stdoutAccum += chunk.slice(0, GIT_MAX_OUTPUT_CHARS - stdoutAccum.length);
                } else {
                    stdoutAccum += chunk;
                }
            });

            child.stderr?.setEncoding("utf8");
            child.stderr?.on("data", (chunk: string) => {
                if (stderrAccum.length + chunk.length > GIT_MAX_OUTPUT_CHARS) {
                    truncated = true;
                    stderrAccum += chunk.slice(0, GIT_MAX_OUTPUT_CHARS - stderrAccum.length);
                } else {
                    stderrAccum += chunk;
                }
            });

            child.on("error", (error) => {
                clearTimeout(timer);
                if (cancelGrace) cancelGrace();
                options.signal?.removeEventListener("abort", onAbort);
                rejectPromise(error);
            });

            child.on("close", (code) => {
                clearTimeout(timer);
                if (cancelGrace) cancelGrace();
                options.signal?.removeEventListener("abort", onAbort);
                resolvePromise({
                    stdout: stdoutAccum,
                    stderr: stderrAccum,
                    exitCode: code,
                    timedOut,
                    truncated,
                });
            });
        });
    } finally {
        if (privateTmpDir !== undefined) {
            await cleanupPrivateTmpDir(privateTmpDir);
        }
    }
}

/**
 * 执行受限写操作 Git 命令的选项。
 */
export interface RunRestrictedGitWriteOptions {
    /** 目标仓库的工作区根目录或子目录。 */
    readonly repoPath: string;
    /**
     * 固定的 Git 写操作命令及其参数数组（例如 `["add", "--", "file.txt"]`）。
     * 严禁包含任意用户传入的自由 flag。
     */
    readonly args: readonly string[];
    /** 可选的超时时间（毫秒，默认 10,000）。 */
    readonly timeoutMs?: number | undefined;
    /** 可选的中止控制信号。 */
    readonly signal?: AbortSignal | undefined;
    /** 可选沙箱开关（默认启用 macOS Seatbelt 沙箱）。 */
    readonly enableSeatbelt?: boolean | undefined;
    /** 额外允许读取的文件或目录路径（例如链接工作树所需的外部 common-dir）。 */
    readonly extraReadPaths?: readonly string[] | undefined;
    /** 允许写入的文件或目录路径（默认仅限工作区和 Git 元数据目录）。 */
    readonly extraWritePaths?: readonly string[] | undefined;
    /** 可选作者环境变量（用于 git commit）。 */
    readonly authorEnv?: {
        readonly GIT_AUTHOR_NAME?: string | undefined;
        readonly GIT_AUTHOR_EMAIL?: string | undefined;
        readonly GIT_COMMITTER_NAME?: string | undefined;
        readonly GIT_COMMITTER_EMAIL?: string | undefined;
    } | undefined;
}

/**
 * 在专用受限沙箱中执行经过校验的 Git 写操作命令。
 *
 * @remarks
 * 1. 自动获取进程内 `GitMutex` 互斥排他锁，防止并发写入元数据；
 * 2. 校验参数安全性（禁止 `--no-verify`, `--amend`, `--force`, `-c` 等危险选项）；
 * 3. 策略性开放当前获授权仓库的工作区目录与 Git 元数据目录（gitdir, commondir）的写权限；
 * 4. 严格拒绝写入 `.lazygoal`；
 * 5. 保留仓库内置钩子正常执行环境（不覆盖 core.hooksPath，钩子与命令在同一沙箱内受限执行）；
 * 6. 禁止网络访问，提供 10 秒超时与受管进程组优雅终止。
 *
 * @param options - 写操作执行参数。
 * @returns 包含 stdout/stderr、exitCode、timedOut 与 truncated 的结果。
 */
export async function runRestrictedGitWrite(
    options: RunRestrictedGitWriteOptions,
): Promise<RestrictedGitExecutionResult> {
    validateSafeGitWriteArgs(options.args);

    const repoInfo = await discoverGitRepository(options.repoPath);
    const mutexKey = repoInfo.commonDir;

    return await GitMutex.withLock(mutexKey, async () => {
        const timeoutMs = options.timeoutMs ?? GIT_DEFAULT_TIMEOUT_MS;
        const enableSeatbelt = options.enableSeatbelt ?? true;

        // 基础固定前置配置项（注意：不设置 hooksPath=/dev/null，保留正常钩子触发）
        const baseGitArgs = [
            "-c", "core.quotepath=false",
            "-c", "diff.external=",
            "-c", "diff.color=never",
            "--no-pager",
            ...options.args,
        ];

        let privateTmpDir: string | undefined;
        let sandboxRunOptions: { policy: string; env: NodeJS.ProcessEnv } | undefined;

        if (process.platform === "darwin" && enableSeatbelt && isSeatbeltSupported()) {
            privateTmpDir = await createPrivateTmpDir();

            const extraReadPaths = [
                repoInfo.workspaceRoot,
                repoInfo.gitDir,
                repoInfo.commonDir,
                ...(options.extraReadPaths ?? []),
            ];

            const extraWritePaths = [
                repoInfo.workspaceRoot,
                repoInfo.gitDir,
                repoInfo.commonDir,
                ...(options.extraWritePaths ?? []),
            ];

            const policy = buildSeatbeltPolicy({
                canonicalWorkspaceRoot: repoInfo.workspaceRoot,
                privateTmpDir,
                // 写操作允许写入工作区和 Git 元数据，但严格拒绝 .lazygoal
                protectedPaths: [],
                extraReadPaths,
                extraWritePaths,
                network: "none",
            });

            const env = filterSandboxEnvironment({
                workspaceRoot: repoInfo.workspaceRoot,
                privateTmpDir,
            });

            env["GIT_TERMINAL_PROMPT"] = "0";
            env["GIT_CONFIG_NOSYSTEM"] = "1";
            env["GIT_OPTIONAL_LOCKS"] = "0";

            if (options.authorEnv?.GIT_AUTHOR_NAME !== undefined) {
                env["GIT_AUTHOR_NAME"] = options.authorEnv.GIT_AUTHOR_NAME;
            }
            if (options.authorEnv?.GIT_AUTHOR_EMAIL !== undefined) {
                env["GIT_AUTHOR_EMAIL"] = options.authorEnv.GIT_AUTHOR_EMAIL;
            }
            if (options.authorEnv?.GIT_COMMITTER_NAME !== undefined) {
                env["GIT_COMMITTER_NAME"] = options.authorEnv.GIT_COMMITTER_NAME;
            }
            if (options.authorEnv?.GIT_COMMITTER_EMAIL !== undefined) {
                env["GIT_COMMITTER_EMAIL"] = options.authorEnv.GIT_COMMITTER_EMAIL;
            }

            sandboxRunOptions = { policy, env };
        }

        const fallbackEnv: NodeJS.ProcessEnv = {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_OPTIONAL_LOCKS: "0",
            ...(options.authorEnv?.GIT_AUTHOR_NAME !== undefined ? { GIT_AUTHOR_NAME: options.authorEnv.GIT_AUTHOR_NAME } : {}),
            ...(options.authorEnv?.GIT_AUTHOR_EMAIL !== undefined ? { GIT_AUTHOR_EMAIL: options.authorEnv.GIT_AUTHOR_EMAIL } : {}),
            ...(options.authorEnv?.GIT_COMMITTER_NAME !== undefined ? { GIT_COMMITTER_NAME: options.authorEnv.GIT_COMMITTER_NAME } : {}),
            ...(options.authorEnv?.GIT_COMMITTER_EMAIL !== undefined ? { GIT_COMMITTER_EMAIL: options.authorEnv.GIT_COMMITTER_EMAIL } : {}),
        };

        const gitExecutable = existsSync("/usr/bin/git") ? "/usr/bin/git" : "git";

        try {
            return await new Promise<RestrictedGitExecutionResult>((resolvePromise, rejectPromise) => {
                const child = spawnRestrictedCommand({
                    executable: gitExecutable,
                    args: baseGitArgs,
                    cwd: repoInfo.workspaceRoot,
                    env: fallbackEnv,
                    ...(sandboxRunOptions !== undefined ? { sandbox: sandboxRunOptions } : {}),
                });

                let timedOut = false;
                let truncated = false;
                let cancelGrace: (() => void) | undefined;
                let stdoutAccum = "";
                let stderrAccum = "";

                const timer = setTimeout(() => {
                    timedOut = true;
                    const term = killProcessGroup(child, { graceMs: 2000 });
                    cancelGrace = term.cancelGrace;
                }, timeoutMs);

                const onAbort = () => {
                    const term = killProcessGroup(child, { graceMs: 1000 });
                    cancelGrace = term.cancelGrace;
                };

                if (options.signal?.aborted) {
                    onAbort();
                } else {
                    options.signal?.addEventListener("abort", onAbort, { once: true });
                }

                child.stdout?.setEncoding("utf8");
                child.stdout?.on("data", (chunk: string) => {
                    if (stdoutAccum.length + chunk.length > GIT_MAX_OUTPUT_CHARS) {
                        truncated = true;
                        stdoutAccum += chunk.slice(0, GIT_MAX_OUTPUT_CHARS - stdoutAccum.length);
                    } else {
                        stdoutAccum += chunk;
                    }
                });

                child.stderr?.setEncoding("utf8");
                child.stderr?.on("data", (chunk: string) => {
                    if (stderrAccum.length + chunk.length > GIT_MAX_OUTPUT_CHARS) {
                        truncated = true;
                        stderrAccum += chunk.slice(0, GIT_MAX_OUTPUT_CHARS - stderrAccum.length);
                    } else {
                        stderrAccum += chunk;
                    }
                });

                child.on("error", (error) => {
                    clearTimeout(timer);
                    if (cancelGrace) cancelGrace();
                    options.signal?.removeEventListener("abort", onAbort);
                    rejectPromise(error);
                });

                child.on("close", (code) => {
                    clearTimeout(timer);
                    if (cancelGrace) cancelGrace();
                    options.signal?.removeEventListener("abort", onAbort);
                    resolvePromise({
                        stdout: stdoutAccum,
                        stderr: stderrAccum,
                        exitCode: code,
                        timedOut,
                        truncated,
                    });
                });
            });
        } finally {
            if (privateTmpDir !== undefined) {
                await cleanupPrivateTmpDir(privateTmpDir);
            }
        }
    });
}
