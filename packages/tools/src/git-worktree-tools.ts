import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { contract, type InferContract } from "../../contracts/src/index";
import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../tool-core/src/index";
import { throwIfAborted, type ExecutionControl } from "../../execution-control/src/index";
import { invalidInput } from "./internal/invalid-input";
import {
    createWorkspaceSandbox,
    type WorkspaceSandbox,
} from "../../sandbox/src/index";
import {
    discoverGitRepository,
    runRestrictedGit,
    runRestrictedGitWrite,
    GitMutex,
    type GitRepositoryInfo,
    type DerivedSandboxAccess,
} from "../../sandbox/src/index";
import {
    createGitSandboxAuthorization,
    deriveGitSandboxAccess,
    gitSandboxAuthorizationFailure,
    resolveGitWorktreeTargetPaths,
} from "./internal/git-sandbox-access";

// ============================================================================
// 1. Tool IDs & Constants
// ============================================================================

export const GIT_WORKTREE_ADD_TOOL_ID = "git_worktree_add";
export const GIT_WORKTREE_REMOVE_TOOL_ID = "git_worktree_remove";

// ============================================================================
// 2. Input Contracts & TypeScript Interfaces
// ============================================================================

/**
 * `git_worktree_add` 输入契约。
 */
export const GIT_WORKTREE_ADD_INPUT_CONTRACT = contract.object({
    path: contract.string(),
    branch: contract.optional(contract.string()),
    commit: contract.optional(contract.string()),
    repoPath: contract.optional(contract.string()),
});

export type GitWorktreeAddInput = InferContract<typeof GIT_WORKTREE_ADD_INPUT_CONTRACT>;

/**
 * `git_worktree_add` 执行成功输出结构。
 */
export interface GitWorktreeAddOutput {
    /** 仓库工作区根目录绝对路径。 */
    readonly repoPath: string;
    /** 新创建 worktree 的规范化绝对路径。 */
    readonly path: string;
    /** worktree 检出的分支名（若指定或默认对应分支）。 */
    readonly branch?: string | undefined;
    /** worktree 检出的提交完整 OID。 */
    readonly head: string;
}

/**
 * `git_worktree_remove` 输入契约。
 */
export const GIT_WORKTREE_REMOVE_INPUT_CONTRACT = contract.object({
    path: contract.string(),
    repoPath: contract.optional(contract.string()),
});

export type GitWorktreeRemoveInput = InferContract<typeof GIT_WORKTREE_REMOVE_INPUT_CONTRACT>;

/**
 * `git_worktree_remove` 执行成功输出结构。
 */
export interface GitWorktreeRemoveOutput {
    /** 仓库工作区根目录绝对路径。 */
    readonly repoPath: string;
    /** 被移除的 worktree 规范化绝对路径。 */
    readonly removedPath: string;
}

// ============================================================================
// 3. Helper Functions
// ============================================================================

export interface BaseGitWorktreeToolOptions {
    readonly enableSeatbelt?: boolean | undefined;
}

/**
 * 解析并验证目标仓库路径。
 */
async function resolveRepoDirectory(
    workspaceRoot: string,
    sandbox: WorkspaceSandbox,
    requestedRepoPath?: string,
    control?: ExecutionControl,
): Promise<{ ok: true; repoPath: string; repoInfo: GitRepositoryInfo } | { ok: false; failure: ToolObservation }> {
    const rawPath = requestedRepoPath ?? "";
    const resolved = await sandbox.resolveTarget(
        rawPath,
        {
            ENOENT: { code: "DIRECTORY_NOT_FOUND", render: (p) => `Repository directory not found: ${p}` },
            EACCES: { code: "ACCESS_DENIED", render: (p) => `Access denied to directory: ${p}` },
        },
        control,
    );

    if (!resolved.ok) {
        return { ok: false, failure: resolved.failure };
    }

    try {
        const repoInfo = await discoverGitRepository(resolved.path);
        return { ok: true, repoPath: resolved.path, repoInfo };
    } catch (error) {
        return {
            ok: false,
            failure: {
                kind: "failure",
                code: "NOT_A_GIT_REPOSITORY",
                message: error instanceof Error ? error.message : `Not a Git repository: ${resolved.path}`,
                retryable: false,
            },
        };
    }
}

// ============================================================================
// 4. Git Worktree Tools Implementations
// ============================================================================

/**
 * 在获授权的目标路径创建链接工作树（linked worktree）的写操作 Tool。
 *
 * @remarks
 * 1. 目标路径必须不存在且其父目录必须存在；
 * 2. 禁止将目标路径指向主仓库根目录、`.git`、`.lazygoal` 或沙箱受限边界外；
 * 3. 使用已有的本地分支或指定 commit/HEAD，不隐式创建未知分支；
 * 4. 串行化通过 `GitMutex` 互斥保护，自动派生沙箱文件读写申请；
 * 5. 声明 `isReadOnly: false` 与 `replayPolicy: "manual"`。
 *
 * @example
 * ```ts
 * const tool = new GitWorktreeAddTool("/workspace");
 * const res = await tool.execute({ actionId: "act-wt-add", input: { path: "trees/feat-x", branch: "feat-x" } });
 * ```
 */
export class GitWorktreeAddTool implements Tool<typeof GIT_WORKTREE_ADD_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_WORKTREE_ADD_INPUT_CONTRACT> = {
        id: GIT_WORKTREE_ADD_TOOL_ID,
        description: "Create a new linked Git worktree at authorized target directory without using force.",
        inputContract: GIT_WORKTREE_ADD_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitWorktreeToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    validate(input: GitWorktreeAddInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }

        if (typeof input.path !== "string" || input.path.trim() === "") {
            return invalidInput("path must be a non-empty string", ["path"]);
        }

        if (input.branch !== undefined) {
            if (typeof input.branch !== "string" || input.branch.trim() === "") {
                return invalidInput("branch must be a non-empty string", ["branch"]);
            }
            if (input.branch.startsWith("-")) {
                return invalidInput("branch cannot start with a dash", ["branch"]);
            }
        }

        if (input.commit !== undefined) {
            if (typeof input.commit !== "string" || input.commit.trim() === "") {
                return invalidInput("commit must be a non-empty string", ["commit"]);
            }
            if (input.commit.startsWith("-")) {
                return invalidInput("commit cannot start with a dash", ["commit"]);
            }
        }

        return { ok: true };
    }

    /**
     * 派生 worktree 创建所需的真实 Git 元数据、目标目录与父目录写范围。
     *
     * @param input - 已通过 Contract 与语义校验的 worktree 创建输入。
     * @returns 由磁盘仓库拓扑和规范化目标路径构成的沙箱申请；目标父目录不可解析时仍返回元数据范围。
     */
    async resolveSandboxAccess(input: GitWorktreeAddInput): Promise<DerivedSandboxAccess | undefined> {
        const repoPath = resolve(this.workspaceRoot, input.repoPath ?? ".");
        let extraFiles: NonNullable<DerivedSandboxAccess["files"]> = [];
        try {
            const target = isAbsolute(input.path) ? resolve(input.path) : resolve(repoPath, input.path);
            const paths = await resolveGitWorktreeTargetPaths(repoPath, target);
            extraFiles = [
                { path: paths.parentPath, access: "write", kind: "directory_tree", purpose: "Create the worktree in its parent directory" },
                { path: paths.targetPath, access: "write", kind: "directory_tree", purpose: "Create the requested Git worktree" },
            ];
        } catch {
            // Missing or inaccessible parents are reported by execute before any Git process starts.
        }
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "write", extraFiles);
    }

    async execute(
        request: ToolExecutionRequest<GitWorktreeAddInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const repoResult = await resolveRepoDirectory(
            this.workspaceRoot,
            this.sandbox,
            request.input.repoPath,
            control,
        );
        if (!repoResult.ok) {
            return repoResult.failure;
        }

        const { repoPath, repoInfo } = repoResult;
        const targetPathRaw = request.input.path.trim();

        // 目标路径绝对解析
        const targetResolved = isAbsolute(targetPathRaw)
            ? targetPathRaw
            : resolve(repoPath, targetPathRaw);

        // 路径安全检查：禁止指向 .lazygoal 或 .git
        if (targetResolved.includes("/.lazygoal/") || targetResolved.endsWith("/.lazygoal")) {
            return {
                kind: "failure",
                code: "PROTECTED_PATH_MODIFICATION",
                message: `Creating worktree in .lazygoal directory is prohibited: ${targetPathRaw}`,
                retryable: false,
            };
        }

        if (targetResolved === repoInfo.workspaceRoot || targetResolved === repoInfo.gitDir || targetResolved === repoInfo.commonDir) {
            return {
                kind: "failure",
                code: "CANNOT_OVERWRITE_MAIN_WORKTREE",
                message: `Target path overlaps repository root or git metadata: ${targetPathRaw}`,
                retryable: false,
            };
        }

        // 检查目标路径是否已存在
        if (existsSync(targetResolved)) {
            return {
                kind: "failure",
                code: "WORKTREE_ALREADY_EXISTS",
                message: `Target worktree path already exists: ${targetResolved}`,
                retryable: false,
            };
        }

        // 检查父目录是否存在
        const parentDir = dirname(targetResolved);
        if (!existsSync(parentDir)) {
            return {
                kind: "failure",
                code: "PARENT_DIRECTORY_NOT_FOUND",
                message: `Parent directory for worktree does not exist: ${parentDir}`,
                retryable: false,
            };
        }

        const targetPaths = await resolveGitWorktreeTargetPaths(repoPath, targetResolved);
        const canonicalTarget = targetPaths.targetPath;
        const canonicalLazygoal = resolve(repoInfo.workspaceRoot, ".lazygoal");
        const lazygoalRelative = relative(canonicalLazygoal, canonicalTarget);
        if (lazygoalRelative === "" || (lazygoalRelative !== ".."
            && !lazygoalRelative.startsWith(`..${sep}`) && !isAbsolute(lazygoalRelative))) {
            return {
                kind: "failure",
                code: "PROTECTED_PATH_MODIFICATION",
                message: "Creating a worktree inside .lazygoal is prohibited.",
                retryable: false,
            };
        }
        if (canonicalTarget === repoInfo.workspaceRoot || canonicalTarget === repoInfo.gitDir || canonicalTarget === repoInfo.commonDir) {
            return {
                kind: "failure",
                code: "CANNOT_OVERWRITE_MAIN_WORKTREE",
                message: "The requested worktree target overlaps the repository root or Git metadata.",
                retryable: false,
            };
        }
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo,
            access: "write",
            enableSeatbelt: this.enableSeatbelt,
            extraWritePaths: [targetPaths.parentPath, targetPaths.targetPath],
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const args = ["worktree", "add", "--", canonicalTarget];
        if (request.input.commit !== undefined) {
            args.push(request.input.commit);
        } else if (request.input.branch !== undefined) {
            args.push(request.input.branch);
        }

        const res = await runRestrictedGitWrite({
            repoPath,
            args,
            extraWritePaths: [targetPaths.parentPath, targetPaths.targetPath],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (res.exitCode !== 0) {
            const stderr = res.stderr.trim();
            return {
                kind: "failure",
                code: "GIT_WORKTREE_ADD_FAILED",
                message: stderr || `git worktree add failed with exit code ${res.exitCode}`,
                retryable: false,
            };
        }

        // 校验并获取新 worktree 的 HEAD 与分支
        const headRes = await runRestrictedGit({
            repoPath: canonicalTarget,
            args: ["rev-parse", "HEAD"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        const branchRes = await runRestrictedGit({
            repoPath: canonicalTarget,
            args: ["branch", "--show-current"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        const head = headRes.stdout.trim();
        const branch = branchRes.stdout.trim() || undefined;

        const output: GitWorktreeAddOutput = {
            repoPath,
            path: canonicalTarget,
            head,
            branch,
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Created worktree at ${canonicalTarget} (head: ${head.slice(0, 7)})`,
        };
    }
}

/**
 * 安全移除已获授权且干净的链接工作树（linked worktree）的写操作 Tool。
 *
 * @remarks
 * 1. 严格禁止移除主工作树；
 * 2. 移除前进行完整状态复核：检查 tracked、untracked 与 ignored 文件；
 *    若存在任何未提交更改或用户未跟踪文件，坚决拒绝移除并返回 `WORKTREE_DIRTY_OR_MODIFIED`；
 * 3. 严禁使用 `--force` 或运行 `git clean`；
 * 4. 串行化通过 `GitMutex` 互斥保护；
 * 5. 声明 `isReadOnly: false` 与 `replayPolicy: "manual"`。
 *
 * @example
 * ```ts
 * const tool = new GitWorktreeRemoveTool("/workspace");
 * const res = await tool.execute({ actionId: "act-wt-rm", input: { path: "trees/feat-x" } });
 * ```
 */
export class GitWorktreeRemoveTool implements Tool<typeof GIT_WORKTREE_REMOVE_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_WORKTREE_REMOVE_INPUT_CONTRACT> = {
        id: GIT_WORKTREE_REMOVE_TOOL_ID,
        description: "Safely remove an authorized linked Git worktree without force and protecting user files.",
        inputContract: GIT_WORKTREE_REMOVE_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitWorktreeToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    validate(input: GitWorktreeRemoveInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }

        if (typeof input.path !== "string" || input.path.trim() === "") {
            return invalidInput("path must be a non-empty string", ["path"]);
        }

        return { ok: true };
    }

    /**
     * 派生 worktree 移除所需的真实 Git 元数据、目标目录与父目录写范围。
     *
     * @param input - 已通过 Contract 与语义校验的 worktree 移除输入。
     * @returns 由磁盘仓库拓扑和规范化目标路径构成的沙箱申请；目标不可解析时仍返回元数据范围。
     */
    async resolveSandboxAccess(input: GitWorktreeRemoveInput): Promise<DerivedSandboxAccess | undefined> {
        const repoPath = resolve(this.workspaceRoot, input.repoPath ?? ".");
        let extraFiles: NonNullable<DerivedSandboxAccess["files"]> = [];
        try {
            const target = isAbsolute(input.path) ? resolve(input.path) : resolve(repoPath, input.path);
            const canonicalTarget = await realpath(target);
            const paths = await resolveGitWorktreeTargetPaths(repoPath, canonicalTarget);
            extraFiles = [
                { path: paths.parentPath, access: "write", kind: "directory_tree", purpose: "Remove the worktree from its parent directory" },
                { path: paths.targetPath, access: "write", kind: "directory_tree", purpose: "Remove the requested Git worktree" },
            ];
        } catch {
            // Missing or inaccessible targets are reported by execute before any Git process starts.
        }
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "write", extraFiles);
    }

    async execute(
        request: ToolExecutionRequest<GitWorktreeRemoveInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const repoResult = await resolveRepoDirectory(
            this.workspaceRoot,
            this.sandbox,
            request.input.repoPath,
            control,
        );
        if (!repoResult.ok) {
            return repoResult.failure;
        }

        const { repoPath, repoInfo } = repoResult;
        const targetPathRaw = request.input.path.trim();

        const targetResolved = isAbsolute(targetPathRaw)
            ? targetPathRaw
            : resolve(repoPath, targetPathRaw);

        if (!existsSync(targetResolved)) {
            return {
                kind: "failure",
                code: "WORKTREE_NOT_FOUND",
                message: `Worktree directory not found: ${targetResolved}`,
                retryable: false,
            };
        }

        const canonicalTarget = await realpath(targetResolved);
        const targetPaths = await resolveGitWorktreeTargetPaths(repoPath, canonicalTarget);

        // 1. 禁止移除主工作树
        if (canonicalTarget === repoInfo.workspaceRoot) {
            return {
                kind: "failure",
                code: "CANNOT_REMOVE_MAIN_WORKTREE",
                message: `Cannot remove main repository working tree: ${canonicalTarget}`,
                retryable: false,
            };
        }

        // 2. 检查该 worktree 是否属于当前 Git 仓库
        const wtRepo = await discoverGitRepository(canonicalTarget).catch(() => undefined);
        if (wtRepo === undefined || wtRepo.commonDir !== repoInfo.commonDir) {
            return {
                kind: "failure",
                code: "FOREIGN_OR_INVALID_WORKTREE",
                message: `Target path is not a linked worktree of this repository: ${canonicalTarget}`,
                retryable: false,
            };
        }

        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo,
            access: "write",
            enableSeatbelt: this.enableSeatbelt,
            extraWritePaths: [targetPaths.parentPath, targetPaths.targetPath],
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        // 3. 严格安全检查：检查是否存在未提交修改、未跟踪文件或未保存改动
        // 使用 status --porcelain -uall 检查包括未跟踪文件
        const statusCheck = await runRestrictedGit({
            repoPath: canonicalTarget,
            args: ["status", "--porcelain", "-uall"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (statusCheck.exitCode !== 0) {
            return {
                kind: "failure",
                code: "WORKTREE_CHECK_FAILED",
                message: `Failed to inspect worktree status: ${statusCheck.stderr.trim()}`,
                retryable: false,
            };
        }

        const statusOutput = statusCheck.stdout.trim();
        if (statusOutput !== "") {
            return {
                kind: "failure",
                code: "WORKTREE_DIRTY_OR_MODIFIED",
                message: `Cannot remove worktree with uncommitted changes or untracked files:\n${statusOutput}`,
                retryable: false,
            };
        }

        // 4. 检查是否锁定 (locked)
        const wtList = await runRestrictedGit({
            repoPath,
            args: ["worktree", "list", "--porcelain"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (wtList.stdout.includes(`worktree ${canonicalTarget}`) && wtList.stdout.includes("locked")) {
            return {
                kind: "failure",
                code: "WORKTREE_LOCKED",
                message: `Worktree "${canonicalTarget}" is locked and cannot be removed`,
                retryable: false,
            };
        }

        // 5. 执行安全移除（绝不传入 --force）
        const res = await runRestrictedGitWrite({
            repoPath,
            args: ["worktree", "remove", "--", canonicalTarget],
            extraWritePaths: [targetPaths.parentPath, targetPaths.targetPath],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (res.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_WORKTREE_REMOVE_FAILED",
                message: res.stderr.trim() || `git worktree remove failed with exit code ${res.exitCode}`,
                retryable: false,
            };
        }

        const output: GitWorktreeRemoveOutput = {
            repoPath,
            removedPath: canonicalTarget,
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Successfully removed worktree at ${canonicalTarget}`,
        };
    }
}
