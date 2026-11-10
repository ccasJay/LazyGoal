import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFile = promisify(execFileCallback);

/**
 * Goal 的项目授权根与实际执行工作目录。
 *
 * @remarks
 * shared 模式在项目目录执行。worktree 模式持久保存独立分支、创建时基线和执行目录；
 * 授权身份仍绑定项目根，防止工作目录变化扩大工具或沙箱权限。
 *
 * @example
 * ```ts
 * const workspace: GoalWorkspace = { mode: "shared", projectRoot: "/repo", executionRoot: "/repo" };
 * ```
 */
export type GoalWorkspace =
    | { readonly mode: "shared"; readonly projectRoot: string; readonly executionRoot: string }
    | { readonly mode: "worktree"; readonly projectRoot: string; readonly executionRoot: string; readonly branch: string; readonly baseBranch: string; readonly baseCommit: string };

/**
 * 经过用户确认、且精确绑定待合并工作区差异的授权。
 *
 * @remarks
 * 宿主只应在权限 Trigger 经用户确认后构造此值。合并前会重新核对项目分支、
 * Worker 分支 head 和完整 diff 摘要；任何变化都要求重新确认。
 *
 * @example
 * ```ts
 * const approval: GoalWorkspaceMergeAuthorization = {
 *   goalId, projectRoot, branch, baseBranch, baseCommit, headCommit, diffDigest,
 * };
 * ```
 */
export interface GoalWorkspaceMergeAuthorization {
    readonly goalId: string;
    readonly projectRoot: string;
    readonly branch: string;
    readonly baseBranch: string;
    readonly baseCommit: string;
    readonly headCommit: string;
    readonly diffDigest: string;
}

/**
 * worktree 在合并前的可审查状态。
 *
 * @example
 * ```ts
 * const review: GoalWorkspaceReview = { goalId, branch, baseCommit, headCommit, diffDigest, changedFiles: [], dirty: [] };
 * ```
 */
export interface GoalWorkspaceReview {
    readonly goalId: string;
    readonly branch: string;
    readonly baseCommit: string;
    readonly headCommit: string;
    readonly diffDigest: string;
    readonly changedFiles: readonly string[];
    readonly dirty: readonly string[];
}

/**
 * 根据准入策略为 Goal 选择共享工作区或创建独立 Git worktree。
 *
 * @remarks
 * worktree 仅在干净、已提交的项目分支上创建；创建位置由宿主数据目录固定，分支
 * 与路径由 Goal ID 稳定派生，重试会验证并复用同一有效登记，不覆盖已有目录。
 *
 * @param projectRoot - 当前项目的根目录。
 * @param dataDirectory - Supervisor 数据目录；worktree 存放于其 `worktrees` 子目录。
 * @param goalId - 当前已预留的稳定 Goal ID。
 * @param mode - 准入阶段确定的 workspace 模式。
 * @returns 持久执行目录与项目身份映射。
 * @throws 项目不在 Git 仓库、工作区未提交内容、路径/分支冲突或 Git 操作失败时抛出。
 * @example
 * ```ts
 * const workspace = await allocateGoalWorkspace(projectRoot, dataDirectory, goalId, "worktree");
 * ```
 */
export async function allocateGoalWorkspace(
    projectRoot: string,
    dataDirectory: string,
    goalId: string,
    mode: "shared" | "worktree",
): Promise<GoalWorkspace> {
    const project = await realpath(projectRoot);
    if (mode === "shared") return { mode, projectRoot: project, executionRoot: project };
    if (!goalId.trim()) throw new Error("Goal identity is required for worktree allocation");
    const root = await git(project, ["rev-parse", "--show-toplevel"]);
    if (await realpath(root.trim()) !== project) throw new Error("Workspace path must be the Git project root");
    const status = await git(project, ["status", "--porcelain", "--untracked-files=all"]);
    if (status.trim() !== "") throw new Error("Isolated worktree requires a clean project workspace");
    const baseBranch = (await git(project, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
    const baseCommit = (await git(project, ["rev-parse", "--verify", "HEAD"])).trim();
    const key = createHash("sha256").update(goalId).digest("hex").slice(0, 24);
    const branch = `lazygoal/goal-${key}`;
    const worktreeRoot = resolve(dataDirectory, "worktrees");
    await mkdir(worktreeRoot, { recursive: true, mode: 0o700 });
    const executionRoot = resolve(await realpath(worktreeRoot), key);
    const existing = await registeredWorktree(project, executionRoot);
    if (existing !== undefined) {
        if (existing.branch !== branch) throw new Error("Goal worktree path is bound to another branch");
        const resolvedBase = (await git(project, ["merge-base", baseBranch, branch])).trim();
        if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(resolvedBase)) throw new Error("Existing Goal worktree has an invalid base");
        return { mode, projectRoot: project, executionRoot: await realpath(executionRoot), branch, baseBranch, baseCommit: resolvedBase };
    }
    if (await exists(executionRoot)) throw new Error("Goal worktree path already exists and is not registered");
    if ((await git(project, ["branch", "--list", "--format=%(refname:short)", branch])).trim() !== "") {
        throw new Error("Goal worktree branch already exists without its registered worktree");
    }
    await git(project, ["worktree", "add", "-b", branch, executionRoot, baseCommit]);
    return { mode, projectRoot: project, executionRoot: await realpath(executionRoot), branch, baseBranch, baseCommit };
}

/**
 * 生成绑定 Goal 分支、基线、HEAD 与完整已提交差异的审查摘要。
 *
 * @param goalId - 该 workspace 所属 Goal。
 * @param workspace - 已持久化的 worktree 映射。
 * @returns 用户确认前可展示的差异摘要与工作区脏状态。
 * @throws Worktree 登记缺失或分支身份不符时抛出。
 * @example
 * ```ts
 * const review = await inspectGoalWorktree(goalId, workspace);
 * ```
 */
export async function inspectGoalWorktree(goalId: string, workspace: GoalWorkspace): Promise<GoalWorkspaceReview> {
    if (workspace.mode !== "worktree") throw new Error("Goal does not use an isolated worktree");
    const registered = await registeredWorktree(workspace.projectRoot, workspace.executionRoot);
    if (registered?.branch !== workspace.branch) throw new Error("Goal worktree registration does not match its saved identity");
    const headCommit = (await git(workspace.executionRoot, ["rev-parse", "HEAD"])).trim();
    const baseCommit = (await git(workspace.projectRoot, ["merge-base", workspace.baseBranch, workspace.branch])).trim();
    const diff = await git(workspace.projectRoot, ["diff", "--binary", baseCommit, headCommit]);
    const changed = await git(workspace.projectRoot, ["diff", "--name-only", baseCommit, headCommit]);
    const dirty = await git(workspace.executionRoot, ["status", "--porcelain", "--untracked-files=all"]);
    return {
        goalId,
        branch: workspace.branch,
        baseCommit,
        headCommit,
        diffDigest: createHash("sha256").update(diff).digest("hex"),
        changedFiles: changed.split("\n").filter(Boolean),
        dirty: dirty.split("\n").filter(Boolean),
    };
}

/**
 * 将已审查并确认的 worktree 分支合并到其原项目分支，再清理工作区。
 *
 * @remarks
 * 项目工作区必须干净、当前分支与授权目标一致，且 worktree 无未提交变更。授权须
 * 精确匹配 Goal、branch、head 和 diff 摘要。冲突时尝试中止合并并保留 worktree。
 *
 * @param workspace - 已持久保存的项目与 worktree 映射。
 * @param authorization - 用户确认后由可信宿主构造的精确合并授权。
 * @returns 合并后的项目 HEAD。
 * @throws 授权过期、工作区身份变化、差异未提交、Git 冲突或清理失败时抛出。
 * @example
 * ```ts
 * const head = await mergeGoalWorktree(workspace, confirmedAuthorization);
 * ```
 */
export async function mergeGoalWorktree(
    workspace: GoalWorkspace,
    authorization: GoalWorkspaceMergeAuthorization,
): Promise<string> {
    if (workspace.mode !== "worktree") throw new Error("Goal does not use an isolated worktree");
    const projectRoot = await realpath(workspace.projectRoot);
    if (projectRoot !== authorization.projectRoot || authorization.branch !== workspace.branch
        || authorization.baseBranch !== workspace.baseBranch || authorization.baseCommit !== workspace.baseCommit) {
        throw new Error("Goal worktree merge authorization does not match its saved workspace");
    }
    if ((await git(projectRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim() !== authorization.baseBranch
        || (await git(projectRoot, ["status", "--porcelain", "--untracked-files=all"])).trim() !== "") {
        throw new Error("Project branch changed or has uncommitted work; review the merge again");
    }
    const review = await inspectGoalWorktree(authorization.goalId, workspace);
    if (review.dirty.length !== 0 || review.headCommit !== authorization.headCommit
        || review.diffDigest !== authorization.diffDigest) throw new Error("Goal worktree changed after merge authorization");

    const alreadyMerged = await gitStatus(projectRoot, ["merge-base", "--is-ancestor", workspace.branch, authorization.baseBranch]);
    if (alreadyMerged.code !== 0) {
        try {
            await git(projectRoot, ["merge", "--no-ff", "--no-edit", workspace.branch]);
        } catch (error) {
            await gitStatus(projectRoot, ["merge", "--abort"]).catch(() => undefined);
            throw error;
        }
    }
    if (await exists(workspace.executionRoot)) await git(projectRoot, ["worktree", "remove", workspace.executionRoot]);
    await git(projectRoot, ["branch", "-d", workspace.branch]);
    return (await git(projectRoot, ["rev-parse", "HEAD"])).trim();
}

async function registeredWorktree(projectRoot: string, path: string): Promise<{ readonly branch: string } | undefined> {
    const output = await git(projectRoot, ["worktree", "list", "--porcelain"]);
    const record = output.split("\n\n").find((part) => part.split("\n").some((line) => line === `worktree ${path}`));
    const branch = record?.split("\n").find((line) => line.startsWith("branch refs/heads/"))?.slice("branch refs/heads/".length);
    return branch === undefined ? undefined : { branch };
}

async function exists(path: string): Promise<boolean> {
    try { await stat(path); return true; } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
        throw error;
    }
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
    try {
        const result = await execFile("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
        return result.stdout;
    } catch (error) {
        const child = error as { code?: number | string; stdout?: string; stderr?: string };
        const code = typeof child.code === "number" ? child.code : 1;
        throw new Error(`Git operation failed (${args[0] ?? "unknown"}): ${(child.stderr ?? "").trim() || "exit code " + code}`);
    }
}

async function gitStatus(cwd: string, args: readonly string[]): Promise<{ readonly code: number }> {
    try {
        await execFile("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
        return { code: 0 };
    } catch (error) {
        const child = error as { code?: number | string };
        return { code: typeof child.code === "number" ? child.code : 1 };
    }
}
