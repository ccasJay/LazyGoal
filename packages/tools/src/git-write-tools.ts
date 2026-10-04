import { resolve } from "node:path";
import { contract, type InferContract } from "../../contracts/src/index";
import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../runtime/src/index";
import type { ExecutionControl } from "../../runtime/src/execution-control";
import { invalidInput } from "./internal/invalid-input";
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
    runRestrictedGitWrite,
    runRestrictedGit,
    type GitRepositoryInfo,
} from "../../sandbox/src/index";

// ============================================================================
// 1. Tool IDs & Constants
// ============================================================================

export const GIT_ADD_TOOL_ID = "git_add";
export const GIT_COMMIT_TOOL_ID = "git_commit";
export const GIT_BRANCH_CREATE_TOOL_ID = "git_branch_create";
export const GIT_BRANCH_SWITCH_TOOL_ID = "git_branch_switch";

// ============================================================================
// 2. Input Contracts & TypeScript Interfaces
// ============================================================================

/**
 * `git_add` 输入契约。
 */
export const GIT_ADD_INPUT_CONTRACT = contract.object({
    paths: contract.array(contract.string()),
    repoPath: contract.optional(contract.string()),
});

export type GitAddInput = InferContract<typeof GIT_ADD_INPUT_CONTRACT>;

/**
 * `git_add` 执行成功输出结构。
 */
export interface GitAddOutput {
    /** 仓库根目录绝对路径。 */
    readonly repoPath: string;
    /** 实际被暂存的路径列表。 */
    readonly stagedPaths: readonly string[];
}

/**
 * `git_commit` 作者信息契约。
 */
export const GIT_COMMIT_AUTHOR_CONTRACT = contract.object({
    name: contract.string(),
    email: contract.string(),
});

/**
 * `git_commit` 输入契约。
 */
export const GIT_COMMIT_INPUT_CONTRACT = contract.object({
    message: contract.string(),
    repoPath: contract.optional(contract.string()),
    author: contract.optional(GIT_COMMIT_AUTHOR_CONTRACT),
});

export type GitCommitInput = InferContract<typeof GIT_COMMIT_INPUT_CONTRACT>;

/**
 * `git_commit` 执行成功输出结构。
 */
export interface GitCommitOutput {
    /** 仓库根目录绝对路径。 */
    readonly repoPath: string;
    /** 新创建的提交完整 SHA-1/SHA-256 哈希值。 */
    readonly commitHash: string;
    /** 提交所属的分支名（若 HEAD 分离则为 undefined）。 */
    readonly branch?: string | undefined;
    /** 提交日志概要。 */
    readonly summary: string;
}

/**
 * `git_branch_create` 输入契约。
 */
export const GIT_BRANCH_CREATE_INPUT_CONTRACT = contract.object({
    branch: contract.string(),
    repoPath: contract.optional(contract.string()),
    startPoint: contract.optional(contract.string()),
});

export type GitBranchCreateInput = InferContract<typeof GIT_BRANCH_CREATE_INPUT_CONTRACT>;

/**
 * `git_branch_create` 执行成功输出结构。
 */
export interface GitBranchCreateOutput {
    /** 仓库根目录绝对路径。 */
    readonly repoPath: string;
    /** 创建的分支名。 */
    readonly branch: string;
    /** 分支创建的起点对象或 commit。 */
    readonly startPoint: string;
}

/**
 * `git_branch_switch` 输入契约。
 */
export const GIT_BRANCH_SWITCH_INPUT_CONTRACT = contract.object({
    branch: contract.string(),
    repoPath: contract.optional(contract.string()),
    createIfNotExists: contract.optional(contract.boolean()),
});

export type GitBranchSwitchInput = InferContract<typeof GIT_BRANCH_SWITCH_INPUT_CONTRACT>;

/**
 * `git_branch_switch` 执行成功输出结构。
 */
export interface GitBranchSwitchOutput {
    /** 仓库根目录绝对路径。 */
    readonly repoPath: string;
    /** 切换后的当前分支名。 */
    readonly currentBranch: string;
    /** 之前所在的分支名（若原为分离 HEAD 则为 undefined）。 */
    readonly previousBranch?: string | undefined;
}

// ============================================================================
// 3. Helper Functions
// ============================================================================

export interface BaseGitWriteToolOptions {
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
// 4. Git Write Tools Implementations
// ============================================================================

/**
 * 将指定工作区文件路径变更加入暂存区（index）的写操作 Tool。
 *
 * @remarks
 * 1. 严格要求传入非空 paths 数组，禁止空 paths；
 * 2. 禁止将受保护路径（如 `.lazygoal`、`.git` 等）加入暂存区；
 * 3. 使用 literal pathspec 并追加 `--` 分隔符执行 `git add -- <paths...>`；
 * 4. 声明 `isReadOnly: false` 与 `replayPolicy: "manual"`。
 *
 * @example
 * ```ts
 * const tool = new GitAddTool("/workspace");
 * const res = await tool.execute({ actionId: "act-add", input: { paths: ["src/index.ts"] } });
 * ```
 */
export class GitAddTool implements Tool<typeof GIT_ADD_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_ADD_INPUT_CONTRACT> = {
        id: GIT_ADD_TOOL_ID,
        description: "Stage specified workspace files into the Git index using literal paths.",
        inputContract: GIT_ADD_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitWriteToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生暂存操作所需的 Git 元数据写范围，不执行暂存副作用。
     * @param input - 已通过 Contract 与语义校验的暂存输入。
     * @returns 从磁盘仓库拓扑派生的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitAddInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "write");
    }

    validate(input: GitAddInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }

        if (!Array.isArray(input.paths) || input.paths.length === 0) {
            return invalidInput("paths must be a non-empty array of file paths", ["paths"]);
        }

        for (let i = 0; i < input.paths.length; i++) {
            const p = input.paths[i]!;
            if (typeof p !== "string" || p.trim() === "") {
                return invalidInput(`paths[${i}] must be a non-empty string`, ["paths", String(i)]);
            }
            if (p.startsWith("-")) {
                return invalidInput(`paths[${i}] cannot start with dash: ${p}`, ["paths", String(i)]);
            }
            const violation = this.sandbox.validateRelativePath(p);
            if (violation !== undefined) {
                return invalidInput(`Invalid paths[${i}]: ${violation}`, ["paths", String(i)]);
            }
        }

        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitAddInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        const repoResult = await resolveRepoDirectory(
            this.workspaceRoot,
            this.sandbox,
            request.input.repoPath,
            control,
        );
        if (!repoResult.ok) {
            return repoResult.failure;
        }
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: repoResult.repoInfo,
            access: "write",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const { repoPath } = repoResult;

        // 校验各个路径不触碰受保护目录（例如 .git, .lazygoal）
        for (const targetPath of request.input.paths) {
            const resolvedPath = resolve(repoPath, targetPath);
            if (resolvedPath.includes("/.lazygoal/") || resolvedPath.endsWith("/.lazygoal")) {
                return {
                    kind: "failure",
                    code: "PROTECTED_PATH_MODIFICATION",
                    message: `Staging .lazygoal path is prohibited: ${targetPath}`,
                    retryable: false,
                };
            }
        }

        const args = ["add", "--", ...request.input.paths];

        const res = await runRestrictedGitWrite({
            repoPath,
            args,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (res.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_ADD_FAILED",
                message: res.stderr.trim() || `git add failed with exit code ${res.exitCode}`,
                retryable: false,
            };
        }

        const output: GitAddOutput = {
            repoPath,
            stagedPaths: [...request.input.paths],
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Successfully staged ${request.input.paths.length} path(s)`,
        };
    }
}

/**
 * 将当前暂存区提交至当前分支的写操作 Tool。
 *
 * @remarks
 * 1. 严格要求 message 必须为非空字符串；
 * 2. 仅提交当前暂存区，不自动 `git add` 未暂存的文件，不接受 `--amend` 或 `--no-verify`；
 * 3. 尊重仓库钩子；若钩子失败或暂存区为空返回明确领域错误；
 * 4. 成功后查询并返回生成的 commit hash、分支名及提交概要；
 * 5. 声明 `isReadOnly: false` 与 `replayPolicy: "manual"`。
 *
 * @example
 * ```ts
 * const tool = new GitCommitTool("/workspace");
 * const res = await tool.execute({ actionId: "act-commit", input: { message: "feat: add feature" } });
 * ```
 */
export class GitCommitTool implements Tool<typeof GIT_COMMIT_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_COMMIT_INPUT_CONTRACT> = {
        id: GIT_COMMIT_TOOL_ID,
        description: "Commit staged changes to current branch with required message and optional author.",
        inputContract: GIT_COMMIT_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitWriteToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生提交操作所需的 Git 元数据写范围，不执行提交副作用。
     * @param input - 已通过 Contract 与语义校验的提交输入。
     * @returns 从磁盘仓库拓扑派生的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitCommitInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "write");
    }

    validate(input: GitCommitInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }

        if (typeof input.message !== "string" || input.message.trim() === "") {
            return invalidInput("message must be a non-empty string", ["message"]);
        }

        if (input.author !== undefined) {
            if (typeof input.author.name !== "string" || input.author.name.trim() === "") {
                return invalidInput("author.name must be a non-empty string", ["author", "name"]);
            }
            if (typeof input.author.email !== "string" || input.author.email.trim() === "") {
                return invalidInput("author.email must be a non-empty string", ["author", "email"]);
            }
        }

        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitCommitInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        const repoResult = await resolveRepoDirectory(
            this.workspaceRoot,
            this.sandbox,
            request.input.repoPath,
            control,
        );
        if (!repoResult.ok) {
            return repoResult.failure;
        }
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: repoResult.repoInfo,
            access: "write",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const { repoPath } = repoResult;

        const args = ["commit", "-m", request.input.message];

        let authorEnv: {
            GIT_AUTHOR_NAME?: string;
            GIT_AUTHOR_EMAIL?: string;
            GIT_COMMITTER_NAME?: string;
            GIT_COMMITTER_EMAIL?: string;
        } | undefined;

        if (request.input.author !== undefined) {
            authorEnv = {
                GIT_AUTHOR_NAME: request.input.author.name,
                GIT_AUTHOR_EMAIL: request.input.author.email,
                GIT_COMMITTER_NAME: request.input.author.name,
                GIT_COMMITTER_EMAIL: request.input.author.email,
            };
        }

        const res = await runRestrictedGitWrite({
            repoPath,
            args,
            authorEnv,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (res.exitCode !== 0) {
            const stderr = res.stderr.trim();
            const stdout = res.stdout.trim();
            const combined = `${stderr}\n${stdout}`.trim();

            if (combined.includes("nothing to commit") || combined.includes("no changes added to commit")) {
                return {
                    kind: "failure",
                    code: "NOTHING_TO_COMMIT",
                    message: "Nothing to commit (working tree clean or no changes staged)",
                    retryable: false,
                };
            }

            if (combined.includes("hook declined") || combined.includes("pre-commit hook")) {
                return {
                    kind: "failure",
                    code: "HOOK_DECLINED",
                    message: `Commit hook failed: ${combined}`,
                    retryable: false,
                };
            }

            return {
                kind: "failure",
                code: "GIT_COMMIT_FAILED",
                message: combined || `git commit failed with exit code ${res.exitCode}`,
                retryable: false,
            };
        }

        // 获取新创建的 HEAD 提交 OID 与分支名
        const revRes = await runRestrictedGit({
            repoPath,
            args: ["rev-parse", "HEAD"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        const commitHash = revRes.stdout.trim();

        const branchRes = await runRestrictedGit({
            repoPath,
            args: ["branch", "--show-current"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        const branch = branchRes.stdout.trim() || undefined;

        const output: GitCommitOutput = {
            repoPath,
            commitHash,
            branch,
            summary: request.input.message.split("\n")[0] ?? "commit",
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Created commit ${commitHash.slice(0, 7)}: ${output.summary}`,
        };
    }
}

/**
 * 基于当前分支或指定起点创建新本地分支（不切换）的写操作 Tool。
 *
 * @remarks
 * 1. 严格使用 `git check-ref-format --branch <branch>` 校验分支名格式合法性；
 * 2. 检查分支是否已存在；已存在时拒绝覆写，不使用 `-f` 或 `-B`；
 * 3. 创建完成后返回新建分支名及对应的起点引用；
 * 4. 声明 `isReadOnly: false` 与 `replayPolicy: "manual"`。
 *
 * @example
 * ```ts
 * const tool = new GitBranchCreateTool("/workspace");
 * const res = await tool.execute({ actionId: "act-branch-new", input: { branch: "feat-x" } });
 * ```
 */
export class GitBranchCreateTool implements Tool<typeof GIT_BRANCH_CREATE_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_BRANCH_CREATE_INPUT_CONTRACT> = {
        id: GIT_BRANCH_CREATE_TOOL_ID,
        description: "Create a new local Git branch without switching to it.",
        inputContract: GIT_BRANCH_CREATE_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitWriteToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生分支创建所需的 Git 元数据写范围，不执行分支副作用。
     * @param input - 已通过 Contract 与语义校验的分支创建输入。
     * @returns 从磁盘仓库拓扑派生的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitBranchCreateInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "write");
    }

    validate(input: GitBranchCreateInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }

        if (typeof input.branch !== "string" || input.branch.trim() === "") {
            return invalidInput("branch must be a non-empty string", ["branch"]);
        }

        if (input.branch.startsWith("-")) {
            return invalidInput("branch cannot start with a dash", ["branch"]);
        }

        if (input.startPoint !== undefined) {
            if (typeof input.startPoint !== "string" || input.startPoint.trim() === "") {
                return invalidInput("startPoint must be a non-empty string", ["startPoint"]);
            }
            if (input.startPoint.startsWith("-")) {
                return invalidInput("startPoint cannot start with a dash", ["startPoint"]);
            }
        }

        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitBranchCreateInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        const repoResult = await resolveRepoDirectory(
            this.workspaceRoot,
            this.sandbox,
            request.input.repoPath,
            control,
        );
        if (!repoResult.ok) {
            return repoResult.failure;
        }
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: repoResult.repoInfo,
            access: "write",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const { repoPath } = repoResult;
        const branchName = request.input.branch.trim();

        // 1. check-ref-format 校验
        const formatCheck = await runRestrictedGit({
            repoPath,
            args: ["check-ref-format", "--branch", branchName],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (formatCheck.exitCode !== 0) {
            return {
                kind: "failure",
                code: "INVALID_BRANCH_NAME",
                message: `Invalid Git branch name: "${branchName}"`,
                retryable: false,
            };
        }

        // 2. 检查分支是否已存在
        const verifyBranch = await runRestrictedGit({
            repoPath,
            args: ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (verifyBranch.exitCode === 0) {
            return {
                kind: "failure",
                code: "BRANCH_ALREADY_EXISTS",
                message: `Branch "${branchName}" already exists`,
                retryable: false,
            };
        }

        // 3. 执行 branch 创建
        const args = ["branch", "--", branchName];
        if (request.input.startPoint !== undefined) {
            args.push(request.input.startPoint);
        }

        const res = await runRestrictedGitWrite({
            repoPath,
            args,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (res.exitCode !== 0) {
            return {
                kind: "failure",
                code: "GIT_BRANCH_CREATE_FAILED",
                message: res.stderr.trim() || `git branch create failed with exit code ${res.exitCode}`,
                retryable: false,
            };
        }

        const output: GitBranchCreateOutput = {
            repoPath,
            branch: branchName,
            startPoint: request.input.startPoint ?? "HEAD",
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Created branch "${branchName}" from ${output.startPoint}`,
        };
    }
}

/**
 * 切换当前工作区分支（仅限本地分支，禁止丢弃未保存修改）的写操作 Tool。
 *
 * @remarks
 * 1. 严格禁止强制切换（无 `--force` 或 `-f`）；若切换会导致未保存文件被覆盖，Git 报错时返回明确失败；
 * 2. 仅支持本地分支；若开启 `createIfNotExists: true`，当分支不存在时基于 HEAD 安全创建并切换（使用 `switch -c <branch>`）；
 * 3. 切换完成后验证并返回新的当前分支名及原分支名；
 * 4. 声明 `isReadOnly: false` 与 `replayPolicy: "manual"`。
 *
 * @example
 * ```ts
 * const tool = new GitBranchSwitchTool("/workspace");
 * const res = await tool.execute({ actionId: "act-branch-sw", input: { branch: "main" } });
 * ```
 */
export class GitBranchSwitchTool implements Tool<typeof GIT_BRANCH_SWITCH_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GIT_BRANCH_SWITCH_INPUT_CONTRACT> = {
        id: GIT_BRANCH_SWITCH_TOOL_ID,
        description: "Switch current working tree branch safely without overwriting uncommitted changes.",
        inputContract: GIT_BRANCH_SWITCH_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;
    private readonly enableSeatbelt?: boolean | undefined;

    constructor(workspaceRoot: string, options?: BaseGitWriteToolOptions) {
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt;
    }

    /**
     * 派生分支切换所需的 Git 元数据写范围，不执行工作区或分支变更。
     * @param input - 已通过 Contract 与语义校验的分支切换输入。
     * @returns 从磁盘仓库拓扑派生的沙箱访问申请；仓库不可解析时返回 `undefined`。
     */
    resolveSandboxAccess(input: GitBranchSwitchInput) {
        return deriveGitSandboxAccess(this.workspaceRoot, input.repoPath, "write");
    }

    validate(input: GitBranchSwitchInput): ToolValidationResult {
        if (input.repoPath !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.repoPath);
            if (violation !== undefined) {
                return invalidInput(`Invalid repoPath: ${violation}`, ["repoPath"]);
            }
        }

        if (typeof input.branch !== "string" || input.branch.trim() === "") {
            return invalidInput("branch must be a non-empty string", ["branch"]);
        }

        if (input.branch.startsWith("-")) {
            return invalidInput("branch cannot start with a dash", ["branch"]);
        }

        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GitBranchSwitchInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        const repoResult = await resolveRepoDirectory(
            this.workspaceRoot,
            this.sandbox,
            request.input.repoPath,
            control,
        );
        if (!repoResult.ok) {
            return repoResult.failure;
        }
        const authorizationFailure = await gitSandboxAuthorizationFailure({
            request,
            workspaceRoot: this.workspaceRoot,
            repoInfo: repoResult.repoInfo,
            access: "write",
            enableSeatbelt: this.enableSeatbelt,
        });
        if (authorizationFailure !== undefined) return authorizationFailure;

        const { repoPath } = repoResult;
        const branchName = request.input.branch.trim();

        // 1. 获取切换前的当前分支名
        const currentBranchRes = await runRestrictedGit({
            repoPath,
            args: ["branch", "--show-current"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        const previousBranch = currentBranchRes.stdout.trim() || undefined;

        // 2. 检查目标分支是否存在
        const verifyBranch = await runRestrictedGit({
            repoPath,
            args: ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        const branchExists = verifyBranch.exitCode === 0;

        let switchArgs: string[];
        if (branchExists) {
            // 使用 switch 切换已有本地分支，关闭远端自动猜测
            switchArgs = ["switch", "--no-guess", "--", branchName];
        } else if (request.input.createIfNotExists) {
            // check-ref-format 校验
            const formatCheck = await runRestrictedGit({
                repoPath,
                args: ["check-ref-format", "--branch", branchName],
                enableSeatbelt: this.enableSeatbelt,
                authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
                signal: control?.signal,
            });

            if (formatCheck.exitCode !== 0) {
                return {
                    kind: "failure",
                    code: "INVALID_BRANCH_NAME",
                    message: `Invalid Git branch name: "${branchName}"`,
                    retryable: false,
                };
            }
            switchArgs = ["switch", "-c", branchName];
        } else {
            return {
                kind: "failure",
                code: "BRANCH_NOT_FOUND",
                message: `Branch "${branchName}" does not exist locally. Specify createIfNotExists: true to create it.`,
                retryable: false,
            };
        }

        const res = await runRestrictedGitWrite({
            repoPath,
            args: switchArgs,
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        if (res.exitCode !== 0) {
            const stderr = res.stderr.trim();
            if (stderr.includes("overwritten by checkout") || stderr.includes("overwritten by merge") || stderr.includes("local changes")) {
                return {
                    kind: "failure",
                    code: "DIRTY_WORKING_TREE",
                    message: `Cannot switch branch: uncommitted changes would be overwritten. ${stderr}`,
                    retryable: false,
                };
            }

            return {
                kind: "failure",
                code: "GIT_BRANCH_SWITCH_FAILED",
                message: stderr || `git switch failed with exit code ${res.exitCode}`,
                retryable: false,
            };
        }

        // 3. 验证切换后的当前分支
        const verifyCurrent = await runRestrictedGit({
            repoPath,
            args: ["branch", "--show-current"],
            enableSeatbelt: this.enableSeatbelt,
            authorization: createGitSandboxAuthorization(request, this.workspaceRoot),
            signal: control?.signal,
        });

        const currentBranch = verifyCurrent.stdout.trim();

        const output: GitBranchSwitchOutput = {
            repoPath,
            currentBranch,
            previousBranch,
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Switched branch from ${previousBranch ?? "(detached)"} to ${currentBranch}`,
        };
    }
}
