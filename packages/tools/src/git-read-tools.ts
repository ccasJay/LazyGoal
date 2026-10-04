import { resolve } from "node:path";

import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../runtime/src/index";
import {
    contract,
    type InferContract,
} from "../../contracts/src/index";
import {
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import { invalidInput } from "./internal/invalid-input";
import {
    computeCanonicalDigest,
    decodeAndValidateCursor,
    encodeCursor,
} from "./internal/cursor";
import {
    createGitSandboxAuthorization,
    deriveGitSandboxAccess,
    gitSandboxAuthorizationFailure,
} from "./internal/git-sandbox-access";
import {
    createWorkspaceSandbox,
    type WorkspaceSandbox,
} from "../../sandbox/src/index";
import {
    discoverGitRepository,
    runRestrictedGit,
    type GitRepositoryInfo,
} from "../../sandbox/src/git-runner";

// ============================================================================
// 1. Tool IDs & Constants
// ============================================================================

export const GIT_STATUS_TOOL_ID = "git_status";
export const GIT_DIFF_TOOL_ID = "git_diff";
export const GIT_LOG_TOOL_ID = "git_log";
export const GIT_SHOW_TOOL_ID = "git_show";
export const GIT_BRANCH_LIST_TOOL_ID = "git_branch_list";
export const GIT_WORKTREE_LIST_TOOL_ID = "git_worktree_list";

export const GIT_STATUS_DEFAULT_MAX_ENTRIES = 100;
export const GIT_STATUS_MAX_ENTRIES_LIMIT = 500;

export const GIT_DIFF_DEFAULT_MAX_LINES = 500;
export const GIT_DIFF_MAX_LINES_LIMIT = 2000;

export const GIT_LOG_DEFAULT_MAX_COUNT = 20;
export const GIT_LOG_MAX_COUNT_LIMIT = 100;

export const GIT_SHOW_DEFAULT_MAX_LINES = 500;
export const GIT_SHOW_MAX_LINES_LIMIT = 2000;

// ============================================================================
// 2. Input Contracts & Types
// ============================================================================

export const GIT_STATUS_INPUT_CONTRACT = contract.object({
    repoPath: contract.optional(contract.string()),
    path: contract.optional(contract.string()),
    cursor: contract.optional(contract.string()),
    maxEntries: contract.optional(contract.integer({
        minimum: 1,
        maximum: GIT_STATUS_MAX_ENTRIES_LIMIT,
    })),
});

export type GitStatusInput = InferContract<typeof GIT_STATUS_INPUT_CONTRACT>;

export interface GitStatusEntry {
    readonly path: string;
    readonly origPath?: string | undefined;
    readonly stagedStatus: string;
    readonly unstagedStatus: string;
    readonly xy: string;
}

export interface GitStatusOutput {
    readonly repoPath: string;
    readonly branch?: string | undefined;
    readonly clean: boolean;
    readonly entries: readonly GitStatusEntry[];
    readonly totalEntries: number;
    readonly truncated: boolean;
    readonly nextCursor?: string | undefined;
}

export const GIT_DIFF_INPUT_CONTRACT = contract.object({
    repoPath: contract.optional(contract.string()),
    paths: contract.optional(contract.array(contract.string())),
    staged: contract.optional(contract.boolean()),
    commit: contract.optional(contract.string()),
    baseCommit: contract.optional(contract.string()),
    maxLines: contract.optional(contract.integer({
        minimum: 1,
        maximum: GIT_DIFF_MAX_LINES_LIMIT,
    })),
    cursor: contract.optional(contract.string()),
});

export type GitDiffInput = InferContract<typeof GIT_DIFF_INPUT_CONTRACT>;

export interface GitDiffOutput {
    readonly repoPath: string;
    readonly diff: string;
    readonly totalLines: number;
    readonly truncated: boolean;
    readonly nextCursor?: string | undefined;
}

export const GIT_LOG_INPUT_CONTRACT = contract.object({
    repoPath: contract.optional(contract.string()),
    maxCount: contract.optional(contract.integer({
        minimum: 1,
        maximum: GIT_LOG_MAX_COUNT_LIMIT,
    })),
    path: contract.optional(contract.string()),
    revisionRange: contract.optional(contract.string()),
    cursor: contract.optional(contract.string()),
});

export type GitLogInput = InferContract<typeof GIT_LOG_INPUT_CONTRACT>;

export interface GitCommitRecord {
    readonly hash: string;
    readonly shortHash: string;
    readonly author: string;
    readonly email: string;
    readonly date: string;
    readonly subject: string;
    readonly body: string;
}

export interface GitLogOutput {
    readonly repoPath: string;
    readonly commits: readonly GitCommitRecord[];
    readonly hasMore: boolean;
    readonly nextCursor?: string | undefined;
}

export const GIT_SHOW_INPUT_CONTRACT = contract.object({
    object: contract.string(),
    repoPath: contract.optional(contract.string()),
    maxLines: contract.optional(contract.integer({
        minimum: 1,
        maximum: GIT_SHOW_MAX_LINES_LIMIT,
    })),
    cursor: contract.optional(contract.string()),
});

export type GitShowInput = InferContract<typeof GIT_SHOW_INPUT_CONTRACT>;

export interface GitShowOutput {
    readonly repoPath: string;
    readonly object: string;
    readonly resolvedHash: string;
    readonly content: string;
    readonly totalLines: number;
    readonly truncated: boolean;
    readonly nextCursor?: string | undefined;
}

export const GIT_BRANCH_LIST_INPUT_CONTRACT = contract.object({
    repoPath: contract.optional(contract.string()),
    remote: contract.optional(contract.boolean()),
    cursor: contract.optional(contract.string()),
});

export type GitBranchListInput = InferContract<typeof GIT_BRANCH_LIST_INPUT_CONTRACT>;

export interface GitBranchInfo {
    readonly name: string;
    readonly commit: string;
    readonly current: boolean;
    readonly remote: boolean;
    readonly upstream?: string | undefined;
}

export interface GitBranchListOutput {
    readonly repoPath: string;
    readonly currentBranch?: string | undefined;
    readonly branches: readonly GitBranchInfo[];
}

export const GIT_WORKTREE_LIST_INPUT_CONTRACT = contract.object({
    repoPath: contract.optional(contract.string()),
    cursor: contract.optional(contract.string()),
});

export type GitWorktreeListInput = InferContract<typeof GIT_WORKTREE_LIST_INPUT_CONTRACT>;

export interface GitWorktreeInfo {
    readonly path: string;
    readonly head: string;
    readonly branch?: string | undefined;
    readonly isMain: boolean;
    readonly isBare: boolean;
    readonly isLocked: boolean;
    readonly lockReason?: string | undefined;
}

export interface GitWorktreeListOutput {
    readonly repoPath: string;
    readonly worktrees: readonly GitWorktreeInfo[];
}

// ============================================================================
// 3. Helper Functions
// ============================================================================

interface BaseGitToolOptions {
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
// 4. Git Read Tools Implementations
// ============================================================================

/**
 * 查看 Git 工作区与暂存区状态的只读 Tool。
 *
 * @remarks
 * 使用 `git status --porcelain=v2 -z` 解析工作区及暂存区修改、新增、删除与重命名，
 * 支持按条目上限截断与游标分页。
 *
 * @example
 * ```ts
 * const tool = new GitStatusTool("/workspace");
 * const res = await tool.execute({ actionId: "act-1", input: {} });
 * ```
 */
export class GitStatusTool implements Tool<typeof GIT_STATUS_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_STATUS_INPUT_CONTRACT> = {
        id: GIT_STATUS_TOOL_ID,
        description: "Inspect working tree and index status using porcelain v2 format with pagination.",
        inputContract: GIT_STATUS_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生状态查询所需的 Git 元数据只读范围，不启动 Git 子进程。
     * @param input - 已通过 Contract 与语义校验的状态查询输入。
     * @returns 根据磁盘仓库拓扑解析的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitStatusInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "read");
    }

    validate(input: GitStatusInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("Cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitStatusInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const resolved = await resolveRepoDirectory(this.workspaceRoot, this.sandbox, request.input.repoPath, control);
        if (!resolved.ok) return resolved.failure;
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: resolved.repoInfo,
            access: "read",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const maxEntries = request.input.maxEntries ?? GIT_STATUS_DEFAULT_MAX_ENTRIES;
        const queryDigest = computeCanonicalDigest({
            repo: resolved.repoPath,
            path: request.input.path,
        });

        let offset = 0;
        if (request.input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<{
                toolId: string;
                queryDigest: string;
                offset: number;
            }>(request.input.cursor, GIT_STATUS_TOOL_ID, queryDigest);

            if (decoded === undefined) {
                return {
                    kind: "failure",
                    code: "INVALID_CURSOR",
                    message: "The provided cursor is invalid, corrupted, or does not match the target query.",
                    retryable: false,
                };
            }
            offset = decoded.offset;
        }

        const args = ["status", "--porcelain=v2", "--branch", "-z"];
        if (request.input.path !== undefined && request.input.path.trim() !== "") {
            args.push("--", request.input.path);
        }

        const result = await runRestrictedGit({
            repoPath: resolved.repoPath,
            args,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (result.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_STATUS_FAILED",
                message: result.stderr.trim() || `git status exited with code ${result.exitCode}`,
                retryable: false,
            };
        }

        // 解析 porcelain v2 -z
        const tokens = result.stdout.split("\0");
        let branch: string | undefined;
        const allEntries: GitStatusEntry[] = [];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (!token) continue;

            if (token.startsWith("# branch.head ")) {
                branch = token.slice("# branch.head ".length);
            } else if (token.startsWith("1 ")) {
                // 普通修改 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
                const parts = token.split(" ");
                const xy = parts[1] ?? "";
                const path = parts.slice(8).join(" ");
                allEntries.push({
                    path,
                    stagedStatus: xy[0] ?? "",
                    unstagedStatus: xy[1] ?? "",
                    xy,
                });
            } else if (token.startsWith("2 ")) {
                // 重命名/复制 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\0<origPath>
                const parts = token.split(" ");
                const xy = parts[1] ?? "";
                const path = parts.slice(9).join(" ");
                const origPath = tokens[++i] ?? "";
                allEntries.push({
                    path,
                    origPath,
                    stagedStatus: xy[0] ?? "",
                    unstagedStatus: xy[1] ?? "",
                    xy,
                });
            } else if (token.startsWith("u ")) {
                // 未合并
                const parts = token.split(" ");
                const xy = parts[1] ?? "";
                const path = parts.slice(10).join(" ");
                allEntries.push({
                    path,
                    stagedStatus: xy[0] ?? "U",
                    unstagedStatus: xy[1] ?? "U",
                    xy,
                });
            } else if (token.startsWith("? ")) {
                // 未跟踪文件
                const path = token.slice(2);
                allEntries.push({
                    path,
                    stagedStatus: "?",
                    unstagedStatus: "?",
                    xy: "??",
                });
            }
        }

        const totalEntries = allEntries.length;
        const page = allEntries.slice(offset, offset + maxEntries);
        const truncated = offset + maxEntries < totalEntries;

        let nextCursor: string | undefined;
        if (truncated) {
            nextCursor = encodeCursor({
                toolId: GIT_STATUS_TOOL_ID,
                queryDigest,
                offset: offset + maxEntries,
            });
        }

        const output: GitStatusOutput = {
            repoPath: resolved.repoPath,
            branch,
            clean: totalEntries === 0,
            entries: page,
            totalEntries,
            truncated,
            ...(nextCursor !== undefined ? { nextCursor } : {}),
        };

        const summary = totalEntries === 0
            ? "Clean working directory"
            : `Git status: ${totalEntries} changed file(s)${truncated ? ` (showing ${page.length})` : ""}`;

        return {
            kind: "success",
            output: output as any,
            summary,
        };
    }
}

/**
 * 查看工作区、暂存区或提交差异的只读 Tool。
 *
 * @remarks
 * 支持 `--staged` 暂存区比对、指定提交与基准提交比对，严格禁用外部 diff 及 textconv，
 * 输出按行分页切片。
 *
 * @example
 * ```ts
 * const tool = new GitDiffTool("/workspace");
 * const res = await tool.execute({ actionId: "act-2", input: { staged: true } });
 * ```
 */
export class GitDiffTool implements Tool<typeof GIT_DIFF_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_DIFF_INPUT_CONTRACT> = {
        id: GIT_DIFF_TOOL_ID,
        description: "Inspect working tree or staged diff, or diff between commits with line pagination.",
        inputContract: GIT_DIFF_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生差异查询所需的 Git 元数据只读范围，不启动 Git 子进程。
     * @param input - 已通过 Contract 与语义校验的差异查询输入。
     * @returns 根据磁盘仓库拓扑解析的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitDiffInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "read");
    }

    validate(input: GitDiffInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("Cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitDiffInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const resolved = await resolveRepoDirectory(this.workspaceRoot, this.sandbox, request.input.repoPath, control);
        if (!resolved.ok) return resolved.failure;
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: resolved.repoInfo,
            access: "read",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const maxLines = request.input.maxLines ?? GIT_DIFF_DEFAULT_MAX_LINES;
        const queryDigest = computeCanonicalDigest({
            repo: resolved.repoPath,
            paths: request.input.paths,
            staged: request.input.staged,
            commit: request.input.commit,
            baseCommit: request.input.baseCommit,
        });

        let lineOffset = 0;
        if (request.input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<{
                toolId: string;
                queryDigest: string;
                lineOffset: number;
            }>(request.input.cursor, GIT_DIFF_TOOL_ID, queryDigest);

            if (decoded === undefined) {
                return {
                    kind: "failure",
                    code: "INVALID_CURSOR",
                    message: "The provided cursor is invalid, corrupted, or does not match the target query.",
                    retryable: false,
                };
            }
            lineOffset = decoded.lineOffset;
        }

        const args = ["diff", "--no-ext-diff", "--no-textconv"];
        if (request.input.staged) {
            args.push("--staged");
        }
        if (request.input.baseCommit && request.input.commit) {
            args.push(`${request.input.baseCommit}..${request.input.commit}`);
        } else if (request.input.commit) {
            args.push(request.input.commit);
        }
        if (request.input.paths && request.input.paths.length > 0) {
            args.push("--", ...request.input.paths);
        }

        const result = await runRestrictedGit({
            repoPath: resolved.repoPath,
            args,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (result.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_DIFF_FAILED",
                message: result.stderr.trim() || `git diff exited with code ${result.exitCode}`,
                retryable: false,
            };
        }

        const allLines = result.stdout === "" ? [] : result.stdout.split("\n");
        const totalLines = allLines.length;
        const pageLines = allLines.slice(lineOffset, lineOffset + maxLines);
        const truncated = lineOffset + maxLines < totalLines;

        let nextCursor: string | undefined;
        if (truncated) {
            nextCursor = encodeCursor({
                toolId: GIT_DIFF_TOOL_ID,
                queryDigest,
                lineOffset: lineOffset + maxLines,
            });
        }

        const output: GitDiffOutput = {
            repoPath: resolved.repoPath,
            diff: pageLines.join("\n"),
            totalLines,
            truncated,
            ...(nextCursor !== undefined ? { nextCursor } : {}),
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Diff returned ${pageLines.length} of ${totalLines} line(s)${truncated ? " (truncated)" : ""}`,
        };
    }
}

/**
 * 分页查看 Git 提交历史记录的只读 Tool。
 *
 * @remarks
 * 按照固定格式结构化解析提交 Hash、作者、时间、主题与消息体，支持按数量分页。
 *
 * @example
 * ```ts
 * const tool = new GitLogTool("/workspace");
 * const res = await tool.execute({ actionId: "act-3", input: { maxCount: 10 } });
 * ```
 */
export class GitLogTool implements Tool<typeof GIT_LOG_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_LOG_INPUT_CONTRACT> = {
        id: GIT_LOG_TOOL_ID,
        description: "List commit history with structured author, date, and message fields with pagination.",
        inputContract: GIT_LOG_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生日志查询所需的 Git 元数据只读范围，不启动 Git 子进程。
     * @param input - 已通过 Contract 与语义校验的日志查询输入。
     * @returns 根据磁盘仓库拓扑解析的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitLogInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "read");
    }

    validate(input: GitLogInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("Cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitLogInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const resolved = await resolveRepoDirectory(this.workspaceRoot, this.sandbox, request.input.repoPath, control);
        if (!resolved.ok) return resolved.failure;
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: resolved.repoInfo,
            access: "read",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const maxCount = request.input.maxCount ?? GIT_LOG_DEFAULT_MAX_COUNT;
        const queryDigest = computeCanonicalDigest({
            repo: resolved.repoPath,
            path: request.input.path,
            range: request.input.revisionRange,
        });

        let skip = 0;
        if (request.input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<{
                toolId: string;
                queryDigest: string;
                skip: number;
            }>(request.input.cursor, GIT_LOG_TOOL_ID, queryDigest);

            if (decoded === undefined) {
                return {
                    kind: "failure",
                    code: "INVALID_CURSOR",
                    message: "The provided cursor is invalid, corrupted, or does not match the target query.",
                    retryable: false,
                };
            }
            skip = decoded.skip;
        }

        // 使用特殊定界符: %x1f (US) 分割字段, %x1e (RS) 分割记录
        const formatString = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e";
        const args = [
            "log",
            `--max-count=${maxCount + 1}`,
            `--skip=${skip}`,
            `--format=${formatString}`,
        ];

        if (request.input.revisionRange) {
            args.push(request.input.revisionRange);
        }
        if (request.input.path) {
            args.push("--", request.input.path);
        }

        const result = await runRestrictedGit({
            repoPath: resolved.repoPath,
            args,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (result.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_LOG_FAILED",
                message: result.stderr.trim() || `git log exited with code ${result.exitCode}`,
                retryable: false,
            };
        }

        const rawRecords = result.stdout.split("\x1e").filter((r) => r.trim() !== "");
        const hasMore = rawRecords.length > maxCount;
        const currentBatch = rawRecords.slice(0, maxCount);

        const commits: GitCommitRecord[] = currentBatch.map((record) => {
            const [hash = "", shortHash = "", author = "", email = "", date = "", subject = "", body = ""] = record.split("\x1f");
            return {
                hash,
                shortHash,
                author,
                email,
                date,
                subject,
                body: body.trim(),
            };
        });

        let nextCursor: string | undefined;
        if (hasMore) {
            nextCursor = encodeCursor({
                toolId: GIT_LOG_TOOL_ID,
                queryDigest,
                skip: skip + maxCount,
            });
        }

        const output: GitLogOutput = {
            repoPath: resolved.repoPath,
            commits,
            hasMore,
            ...(nextCursor !== undefined ? { nextCursor } : {}),
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Retrieved ${commits.length} commit(s)${hasMore ? " (more available)" : ""}`,
        };
    }
}

/**
 * 查看指定 Git 对象或提交详情与 diff 的只读 Tool。
 *
 * @remarks
 * 先行校验对象本地存在性，再调用 `git show` 获取内容与差异，支持按行截断与游标。
 *
 * @example
 * ```ts
 * const tool = new GitShowTool("/workspace");
 * const res = await tool.execute({ actionId: "act-4", input: { object: "HEAD" } });
 * ```
 */
export class GitShowTool implements Tool<typeof GIT_SHOW_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_SHOW_INPUT_CONTRACT> = {
        id: GIT_SHOW_TOOL_ID,
        description: "Show commit details, blob content, or diff for a Git object with line pagination.",
        inputContract: GIT_SHOW_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生对象查询所需的 Git 元数据只读范围，不启动 Git 子进程。
     * @param input - 已通过 Contract 与语义校验的对象查询输入。
     * @returns 根据磁盘仓库拓扑解析的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitShowInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "read");
    }

    validate(input: GitShowInput): ToolValidationResult {
        if (input.object.trim() === "") {
            return invalidInput("Git object cannot be empty", ["object"]);
        }
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("Cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitShowInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const resolved = await resolveRepoDirectory(this.workspaceRoot, this.sandbox, request.input.repoPath, control);
        if (!resolved.ok) return resolved.failure;
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: resolved.repoInfo,
            access: "read",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const maxLines = request.input.maxLines ?? GIT_SHOW_DEFAULT_MAX_LINES;
        const objectSpec = request.input.object;

        // 1. 验证对象有效性与本地存在性
        const verifyRes = await runRestrictedGit({
            repoPath: resolved.repoPath,
            args: ["rev-parse", "--verify", "--quiet", objectSpec],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (verifyRes.exitCode !== 0 || verifyRes.stdout.trim() === "") {
            return {
                kind: "failure",
                code: "GIT_OBJECT_NOT_FOUND",
                message: `Git object "${objectSpec}" does not exist in repository.`,
                retryable: false,
            };
        }

        const resolvedHash = verifyRes.stdout.trim();
        const queryDigest = computeCanonicalDigest({
            repo: resolved.repoPath,
            object: objectSpec,
            hash: resolvedHash,
        });

        let lineOffset = 0;
        if (request.input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<{
                toolId: string;
                queryDigest: string;
                lineOffset: number;
            }>(request.input.cursor, GIT_SHOW_TOOL_ID, queryDigest);

            if (decoded === undefined) {
                return {
                    kind: "failure",
                    code: "INVALID_CURSOR",
                    message: "The provided cursor is invalid, corrupted, or does not match the target query.",
                    retryable: false,
                };
            }
            lineOffset = decoded.lineOffset;
        }

        const showRes = await runRestrictedGit({
            repoPath: resolved.repoPath,
            args: ["show", "--no-ext-diff", "--no-textconv", objectSpec],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (showRes.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_SHOW_FAILED",
                message: showRes.stderr.trim() || `git show exited with code ${showRes.exitCode}`,
                retryable: false,
            };
        }

        const allLines = showRes.stdout.split("\n");
        const totalLines = allLines.length;
        const pageLines = allLines.slice(lineOffset, lineOffset + maxLines);
        const truncated = lineOffset + maxLines < totalLines;

        let nextCursor: string | undefined;
        if (truncated) {
            nextCursor = encodeCursor({
                toolId: GIT_SHOW_TOOL_ID,
                queryDigest,
                lineOffset: lineOffset + maxLines,
            });
        }

        const output: GitShowOutput = {
            repoPath: resolved.repoPath,
            object: objectSpec,
            resolvedHash,
            content: pageLines.join("\n"),
            totalLines,
            truncated,
            ...(nextCursor !== undefined ? { nextCursor } : {}),
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Show for "${objectSpec}" returned ${pageLines.length} of ${totalLines} line(s)${truncated ? " (truncated)" : ""}`,
        };
    }
}

/**
 * 查看本地或远端跟踪分支列表的只读 Tool。
 *
 * @remarks
 * 列举本地分支及当前 HEAD 所属分支，完全运行于只读环境，不连接网络。
 *
 * @example
 * ```ts
 * const tool = new GitBranchListTool("/workspace");
 * const res = await tool.execute({ actionId: "act-5", input: {} });
 * ```
 */
export class GitBranchListTool implements Tool<typeof GIT_BRANCH_LIST_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_BRANCH_LIST_INPUT_CONTRACT> = {
        id: GIT_BRANCH_LIST_TOOL_ID,
        description: "List local and tracked branches in the repository without network access.",
        inputContract: GIT_BRANCH_LIST_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生分支列举所需的 Git 元数据只读范围，不启动 Git 子进程。
     * @param input - 已通过 Contract 与语义校验的分支查询输入。
     * @returns 根据磁盘仓库拓扑解析的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitBranchListInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "read");
    }

    validate(input: GitBranchListInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitBranchListInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const resolved = await resolveRepoDirectory(this.workspaceRoot, this.sandbox, request.input.repoPath, control);
        if (!resolved.ok) return resolved.failure;
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: resolved.repoInfo,
            access: "read",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const args = [
            "branch",
            "--list",
            "--format=%(HEAD)%09%(refname:short)%09%(objectname:short)%09%(upstream:short)",
        ];

        if (request.input.remote) {
            args.push("-a");
        }

        const result = await runRestrictedGit({
            repoPath: resolved.repoPath,
            args,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (result.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_BRANCH_LIST_FAILED",
                message: result.stderr.trim() || `git branch exited with code ${result.exitCode}`,
                retryable: false,
            };
        }

        const lines = result.stdout.split("\n").filter((l) => l.trim() !== "");
        let currentBranch: string | undefined;
        const branches: GitBranchInfo[] = [];

        for (const line of lines) {
            const [headIndicator, name = "", commit = "", upstream = ""] = line.split("\t");
            const isCurrent = headIndicator === "*";
            const isRemote = name.startsWith("origin/") || name.startsWith("remotes/");
            if (isCurrent) {
                currentBranch = name;
            }
            branches.push({
                name,
                commit,
                current: isCurrent,
                remote: isRemote,
                ...(upstream ? { upstream } : {}),
            });
        }

        const output: GitBranchListOutput = {
            repoPath: resolved.repoPath,
            currentBranch,
            branches,
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Found ${branches.length} branch(es)${currentBranch ? ` (current: ${currentBranch})` : ""}`,
        };
    }
}

/**
 * 列举仓库所有关联工作树（worktrees）的只读 Tool。
 *
 * @remarks
 * 使用 `git worktree list --porcelain -z` 获取所有工作树路径、HEAD、分支及锁定状态。
 *
 * @example
 * ```ts
 * const tool = new GitWorktreeListTool("/workspace");
 * const res = await tool.execute({ actionId: "act-6", input: {} });
 * ```
 */
export class GitWorktreeListTool implements Tool<typeof GIT_WORKTREE_LIST_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_WORKTREE_LIST_INPUT_CONTRACT> = {
        id: GIT_WORKTREE_LIST_TOOL_ID,
        description: "List all linked worktrees in the repository using porcelain format.",
        inputContract: GIT_WORKTREE_LIST_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生 worktree 列举所需的 Git 元数据只读范围，不启动 Git 子进程。
     * @param input - 已通过 Contract 与语义校验的 worktree 查询输入。
     * @returns 根据磁盘仓库拓扑解析的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitWorktreeListInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "read");
    }

    validate(input: GitWorktreeListInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitWorktreeListInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const resolved = await resolveRepoDirectory(this.workspaceRoot, this.sandbox, request.input.repoPath, control);
        if (!resolved.ok) return resolved.failure;
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: resolved.repoInfo,
            access: "read",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const result = await runRestrictedGit({
            repoPath: resolved.repoPath,
            args: ["worktree", "list", "--porcelain", "-z"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (result.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_WORKTREE_LIST_FAILED",
                message: result.stderr.trim() || `git worktree list exited with code ${result.exitCode}`,
                retryable: false,
            };
        }

        // 解析 worktree list --porcelain -z (每个 item 内部由 \0 分隔，不同 item 之间由空 token 即连续 \0 分隔)
        const tokens = result.stdout.split("\0");
        const worktrees: GitWorktreeInfo[] = [];

        let currentPath = "";
        let currentHead = "";
        let currentBranch: string | undefined;
        let isBare = false;
        let isLocked = false;
        let lockReason: string | undefined;

        const flushItem = () => {
            if (currentPath !== "") {
                worktrees.push({
                    path: currentPath,
                    head: currentHead,
                    branch: currentBranch,
                    isMain: worktrees.length === 0, // 第一个条目为主工作树
                    isBare,
                    isLocked,
                    lockReason,
                });
                currentPath = "";
                currentHead = "";
                currentBranch = undefined;
                isBare = false;
                isLocked = false;
                lockReason = undefined;
            }
        };

        for (const token of tokens) {
            if (token === "") {
                flushItem();
                continue;
            }

            if (token.startsWith("worktree ")) {
                currentPath = token.slice("worktree ".length);
            } else if (token.startsWith("HEAD ")) {
                currentHead = token.slice("HEAD ".length);
            } else if (token.startsWith("branch ")) {
                const rawBranch = token.slice("branch ".length);
                currentBranch = rawBranch.replace(/^refs\/heads\//, "");
            } else if (token === "bare") {
                isBare = true;
            } else if (token.startsWith("locked")) {
                isLocked = true;
                const reason = token.slice("locked".length).trim();
                lockReason = reason !== "" ? reason : undefined;
            }
        }
        flushItem();

        const output: GitWorktreeListOutput = {
            repoPath: resolved.repoPath,
            worktrees,
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Found ${worktrees.length} worktree(s)`,
        };
    }
}
