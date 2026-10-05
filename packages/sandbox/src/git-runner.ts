import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { SandboxExecutionPlan } from "./capability";
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
 *
 * @remarks
 * macOS Seatbelt 启用时必须携带与本次 Action 完全匹配的计划，且计划只能包含工具派生的资源。
 *
 * @example
 * ```ts
 * const options: RunRestrictedGitOptions = {
 *     repoPath: "/workspace/project",
 *     args: ["status", "--porcelain=v2", "-z"],
 *     authorization: { actionId, workspaceRoot, plan: approvedPlan },
 * };
 * ```
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
    /** 当前 Git Tool 的可信执行身份及 Runner 核准计划；macOS Seatbelt 下必需。 */
    readonly authorization?: GitSandboxAuthorization | undefined;
}

/**
 * Git Tool 交给受限执行器的可信授权上下文。
 *
 * @remarks
 * 由 Runtime 注入的 Action 标识、工具工作区与核准计划组成；模型输入不能设置此对象。
 *
 * @example
 * ```ts
 * const authorization: GitSandboxAuthorization = {
 *     actionId: "action-1",
 *     workspaceRoot: "/workspace/project",
 *     plan: approvedPlan,
 * };
 * ```
 */
export interface GitSandboxAuthorization {
    /** 当前 Git Tool Action 的稳定标识。 */
    readonly actionId: string;
    /** 创建该 Tool 时绑定的工作区根目录。 */
    readonly workspaceRoot: string;
    /** 当前 Action 经 Runtime 核准的执行计划。 */
    readonly plan?: SandboxExecutionPlan | undefined;
}

async function resolveCanonicalPath(rawPath: string): Promise<string> {
    try {
        return await realpath(rawPath);
    } catch {
        const parent = dirname(rawPath);
        if (parent === rawPath) return resolve(rawPath);
        const canonicalParent = await resolveCanonicalPath(parent);
        return resolve(canonicalParent, basename(rawPath));
    }
}

function pathIsCovered(
    requiredPath: string,
    plan: SandboxExecutionPlan,
    access: "read" | "write",
): boolean {
    return plan.scope.extraFiles.some((entry) => {
        if (access === "write" && entry.access !== "write") return false;
        if (entry.canonicalPath === requiredPath) {
            return access !== "write" || entry.kind === "directory_tree";
        }
        const directoryPath = entry.canonicalPath.endsWith("/") && entry.canonicalPath !== "/"
            ? entry.canonicalPath.slice(0, -1)
            : entry.canonicalPath;
        return entry.kind === "directory_tree"
            && (directoryPath === "/"
                ? requiredPath.startsWith("/")
                : requiredPath.startsWith(`${directoryPath}/`));
    });
}

/**
 * 检查 Git 操作所需真实路径是否包含在当前 Action 的核准计划中。
 *
 * @remarks
 * 对工作区、Action、网络策略及 gitdir/common-dir、额外读写目标逐项复核；路径在
 * 授权后改变真实解析结果时拒绝执行。
 *
 * @param input - 当前 Git 拓扑、访问方向、附加目标和可信 Runtime 上下文。
 * @returns 所有真实路径均被当前计划覆盖时返回 `true`。
 *
 * @example
 * ```ts
 * const valid = await isGitSandboxPlanValid({
 *     repoInfo,
 *     access: "write",
 *     authorization: { actionId, workspaceRoot, plan },
 * });
 * ```
 */
export async function isGitSandboxPlanValid(input: {
    readonly repoInfo: GitRepositoryInfo;
    readonly access: "read" | "write";
    readonly authorization?: GitSandboxAuthorization | undefined;
    readonly extraReadPaths?: readonly string[] | undefined;
    readonly extraWritePaths?: readonly string[] | undefined;
    readonly requireExactPlan?: boolean | undefined;
}): Promise<boolean> {
    const { authorization, repoInfo } = input;
    const plan = authorization?.plan;
    if (authorization === undefined || plan === undefined
        || authorization.actionId.trim() === ""
        || plan.actionId !== authorization.actionId
        || plan.scope.network !== "none") {
        return false;
    }

    const canonicalWorkspaceRoot = await resolveCanonicalPath(authorization.workspaceRoot);
    if (await resolveCanonicalPath(plan.workspaceRoot) !== canonicalWorkspaceRoot) return false;

    const planPaths = await Promise.all(plan.scope.extraFiles.map(async (entry) => {
        const canonicalPath = await resolveCanonicalPath(entry.canonicalPath);
        return { ...entry, canonicalPath, unchanged: canonicalPath === entry.canonicalPath };
    }));
    if (planPaths.some((entry) => !entry.unchanged)) return false;

    const scopedPlan: SandboxExecutionPlan = {
        ...plan,
        scope: { ...plan.scope, extraFiles: planPaths },
    };
    if (input.requireExactPlan) {
        const expected = new Map<string, { readonly path: string; readonly access: "read" | "write"; readonly kind: "file" | "directory_tree" }>();
        const addExpected = (path: string, access: "read" | "write", kind: "file" | "directory_tree") => {
            const key = `${path}\0${access}\0${kind}`;
            expected.set(key, { path, access, kind });
        };
        const metadataAccess = input.access;
        addExpected(await resolveCanonicalPath(repoInfo.gitDir), metadataAccess, "directory_tree");
        addExpected(await resolveCanonicalPath(repoInfo.commonDir), metadataAccess, "directory_tree");
        if (repoInfo.dotGitPath !== repoInfo.gitDir) {
            addExpected(await resolveCanonicalPath(repoInfo.dotGitPath), "read", "file");
        }
        for (const path of input.extraReadPaths ?? []) {
            addExpected(await resolveCanonicalPath(path), "read", "file");
        }
        for (const path of input.extraWritePaths ?? []) {
            addExpected(await resolveCanonicalPath(path), "write", "directory_tree");
        }
        const actualSignatures = planPaths.map((entry) => `${entry.canonicalPath}\0${entry.access}\0${entry.kind}`);
        if (actualSignatures.length !== expected.size
            || actualSignatures.some((signature) => !expected.has(signature))) {
            return false;
        }
    }
    const requiredReads = [repoInfo.dotGitPath, repoInfo.gitDir, repoInfo.commonDir,
        ...(input.extraReadPaths ?? [])];
    const requiredWrites = input.access === "write"
        ? [repoInfo.gitDir, repoInfo.commonDir, ...(input.extraWritePaths ?? [])]
        : [];

    for (const rawPath of requiredReads) {
        if (!pathIsCovered(await resolveCanonicalPath(rawPath), scopedPlan, "read")) return false;
    }
    for (const rawPath of requiredWrites) {
        if (!pathIsCovered(await resolveCanonicalPath(rawPath), scopedPlan, "write")) return false;
    }
    return true;
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
 *     repoPath: "/workspace",
 *     args: ["status", "--porcelain=v2", "-z"],
 *     authorization: { actionId, workspaceRoot, plan: approvedPlan },
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

    if (process.platform === "darwin" && enableSeatbelt) {
        if (!isSeatbeltSupported()) {
            throw new Error("SANDBOX_UNAVAILABLE: macOS Seatbelt is required for Git execution.");
        }
        if (!await isGitSandboxPlanValid({
            repoInfo,
            access: "read",
            authorization: options.authorization,
            extraReadPaths: options.extraReadPaths,
        })) {
            throw new Error("SANDBOX_APPROVAL_REQUIRED: Git metadata access is not covered by the current Action plan.");
        }
    }

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

    if (process.platform === "darwin" && enableSeatbelt) {
        privateTmpDir = await createPrivateTmpDir();

        const canonicalExtraReadPaths = await Promise.all((options.extraReadPaths ?? []).map(resolveCanonicalPath));
        const extraReadPaths = [
            repoInfo.workspaceRoot,
            repoInfo.gitDir,
            repoInfo.commonDir,
            ...canonicalExtraReadPaths,
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
 *
 * @remarks
 * macOS Seatbelt 启用时，当前计划必须覆盖真实 gitdir/common-dir 与额外写目标。
 *
 * @example
 * ```ts
 * const options: RunRestrictedGitWriteOptions = {
 *     repoPath: "/workspace/project",
 *     args: ["add", "--", "src/index.ts"],
 *     authorization: { actionId, workspaceRoot, plan: approvedPlan },
 * };
 * ```
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
    /** 允许写入的文件或目录路径；Git 元数据目录必须通过当前 Action 计划授权。 */
    readonly extraWritePaths?: readonly string[] | undefined;
    /** 当前 Git Tool 的可信执行身份及 Runner 核准计划；macOS Seatbelt 下必需。 */
    readonly authorization?: GitSandboxAuthorization | undefined;
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
 * 3. 仅开放当前 Action 计划明确批准的 gitdir、commondir 与额外目标写范围；
 * 4. 严格拒绝写入 `.lazygoal`；
 * 5. 保留仓库内置钩子正常执行环境（不覆盖 core.hooksPath，钩子与命令在同一沙箱内受限执行）；
 * 6. 禁止网络访问，提供 10 秒超时与受管进程组优雅终止。
 *
 * @param options - 写操作执行参数。
 * @returns 包含 stdout/stderr、exitCode、timedOut 与 truncated 的结果。
 *
 * @example
 * ```ts
 * const result = await runRestrictedGitWrite({
 *     repoPath: "/workspace/project",
 *     args: ["add", "--", "src/index.ts"],
 *     authorization: { actionId, workspaceRoot, plan: approvedPlan },
 * });
 * ```
 */
export async function runRestrictedGitWrite(
    options: RunRestrictedGitWriteOptions,
): Promise<RestrictedGitExecutionResult> {
    validateSafeGitWriteArgs(options.args);

    const repoInfo = await discoverGitRepository(options.repoPath);
    const mutexKey = repoInfo.commonDir;

    const enableSeatbelt = options.enableSeatbelt ?? true;
    if (process.platform === "darwin" && enableSeatbelt) {
        if (!isSeatbeltSupported()) {
            throw new Error("SANDBOX_UNAVAILABLE: macOS Seatbelt is required for Git execution.");
        }
        if (!await isGitSandboxPlanValid({
            repoInfo,
            access: "write",
            authorization: options.authorization,
            extraReadPaths: options.extraReadPaths,
            extraWritePaths: options.extraWritePaths,
        })) {
            throw new Error("SANDBOX_APPROVAL_REQUIRED: Git metadata or target write access is not covered by the current Action plan.");
        }
    }

    return await GitMutex.withLock(mutexKey, async () => {
        const timeoutMs = options.timeoutMs ?? GIT_DEFAULT_TIMEOUT_MS;

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

        if (process.platform === "darwin" && enableSeatbelt) {
            privateTmpDir = await createPrivateTmpDir();

            const canonicalExtraReadPaths = await Promise.all((options.extraReadPaths ?? []).map(resolveCanonicalPath));
            const canonicalExtraWritePaths = await Promise.all((options.extraWritePaths ?? []).map(resolveCanonicalPath));
            const extraReadPaths = [
                repoInfo.workspaceRoot,
                repoInfo.gitDir,
                repoInfo.commonDir,
                ...canonicalExtraReadPaths,
            ];

            const extraWritePaths = [
                repoInfo.gitDir,
                repoInfo.commonDir,
                ...canonicalExtraWritePaths,
            ];

            const authorizedMetadata = new Set([repoInfo.gitDir, repoInfo.commonDir]);
            const protectedPaths = Array.from(new Set([
                repoInfo.dotGitPath,
                repoInfo.gitDir,
                repoInfo.commonDir,
            ])).filter((path) => !authorizedMetadata.has(path));

            const policy = buildSeatbeltPolicy({
                canonicalWorkspaceRoot: repoInfo.workspaceRoot,
                privateTmpDir,
                // 只开放经当前计划核准的 Git 元数据；链接工作树的 .git 指针文件仍受保护。
                protectedPaths,
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
