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
            throw new Error(`Dangerous or unauthorized Git option "${arg}" is prohibited`);
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
