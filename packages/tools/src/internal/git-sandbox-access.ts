import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ToolExecutionRequest, ToolObservation } from "../../../tool-core/src/index";
import {
    discoverGitRepository,
    isGitSandboxPlanValid,
    isSeatbeltSupported,
    type DerivedSandboxAccess,
    type GitRepositoryInfo,
    type GitSandboxAuthorization,
} from "../../../sandbox/src/index";

async function resolveCanonicalPath(path: string): Promise<string> {
    try {
        return await realpath(path);
    } catch {
        const parent = dirname(path);
        if (parent === path) return resolve(path);
        return join(await resolveCanonicalPath(parent), relative(parent, path));
    }
}

/**
 * 根据磁盘上的仓库拓扑派生 Git 元数据与 worktree 目标的沙箱申请。
 *
 * @remarks
 * 仓库路径先限制在 Tool 工作区内，再从真实 `.git` 元数据解析 gitdir/common-dir；
 * 调用方不能从模型输入指定这些元数据路径。
 *
 * @param workspaceRoot - Git Tool 绑定的工作区根目录。
 * @param repoPath - Tool 输入中的相对仓库目录；省略时使用工作区根目录。
 * @param access - Git 元数据的本次访问方向。
 * @param extraFiles - 由具体 Tool 输入派生的额外目标申请。
 * @returns 规范化前的路径申请；无法解析安全仓库时返回 `undefined`。
 *
 * @example
 * ```ts
 * const access = await deriveGitSandboxAccess(workspaceRoot, "packages/app", "write");
 * ```
 */
export async function deriveGitSandboxAccess(
    workspaceRoot: string,
    repoPath: string | undefined,
    access: "read" | "write",
    extraFiles: readonly {
        readonly path: string;
        readonly access: "read" | "write";
        readonly kind: "file" | "directory_tree";
        readonly purpose: string;
    }[] = [],
): Promise<DerivedSandboxAccess | undefined> {
    try {
        const canonicalRoot = await realpath(workspaceRoot);
        const repoTarget = await realpath(resolve(canonicalRoot, repoPath ?? "."));
        const relativeTarget = relative(canonicalRoot, repoTarget);
        if (relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
            return undefined;
        }
        const repoInfo = await discoverGitRepository(repoTarget);
        const protectedState = join(canonicalRoot, ".lazygoal");
        const safeExtraFiles = await Promise.all(extraFiles.map(async (item) => {
            const canonicalPath = await resolveCanonicalPath(item.path);
            if (canonicalPath === protectedState || canonicalPath.startsWith(`${protectedState}${sep}`)) return undefined;
            return { ...item, path: canonicalPath };
        }));
        return {
            files: gitMetadataRequests(repoInfo, access).concat(safeExtraFiles.filter(
                (item): item is NonNullable<typeof item> => item !== undefined,
            )),
        };
    } catch {
        return undefined;
    }
}

/**
 * 为 worktree 路径构造经真实父目录规范化的授权申请。
 *
 * @param repoRoot - 当前 Git 工作区根目录。
 * @param targetPath - Tool 输入中的 worktree 路径。
 * @returns 目标和父目录的规范化绝对路径。
 * @throws 父目录不存在或不可解析时抛出异常。
 */
export async function resolveGitWorktreeTargetPaths(
    repoRoot: string,
    targetPath: string,
): Promise<{ readonly targetPath: string; readonly parentPath: string }> {
    const target = isAbsolute(targetPath) ? resolve(targetPath) : resolve(repoRoot, targetPath);
    const parentPath = await realpath(dirname(target));
    return {
        targetPath: join(parentPath, basename(target)),
        parentPath,
    };
}

function gitMetadataRequests(
    repoInfo: GitRepositoryInfo,
    access: "read" | "write",
): NonNullable<DerivedSandboxAccess["files"]> {
    const requests: NonNullable<DerivedSandboxAccess["files"]>[number][] = [];
    const add = (path: string, fileAccess: "read" | "write", kind: "file" | "directory_tree") => {
        if (requests.some((item) => item.path === path && item.access === fileAccess && item.kind === kind)) return;
        requests.push({
            path,
            access: fileAccess,
            kind,
            purpose: "Access Git repository metadata for this Git operation",
        });
    };

    add(repoInfo.gitDir, access, "directory_tree");
    add(repoInfo.commonDir, access, "directory_tree");
    if (repoInfo.dotGitPath !== repoInfo.gitDir) add(repoInfo.dotGitPath, "read", "file");
    return requests;
}

/**
 * 构造传递给 Git 沙箱执行器的可信 Action 身份。
 *
 * @param request - Runner 准备的 Tool 执行请求。
 * @param workspaceRoot - 创建 Tool 时绑定的工作区根目录。
 * @returns 不含模型可控字段的授权上下文。
 */
export function createGitSandboxAuthorization(
    request: Pick<ToolExecutionRequest, "actionId" | "plan">,
    workspaceRoot: string,
): GitSandboxAuthorization {
    return {
        actionId: request.actionId,
        workspaceRoot,
        ...(request.plan === undefined ? {} : { plan: request.plan }),
    };
}

/**
 * 在 macOS Seatbelt 执行前，将 Git 操作的真实资源与当前 Runner 计划逐项比较。
 *
 * @returns 授权无效或 Seatbelt 不可用时的失败 Observation；通过时返回 `undefined`。
 */
export async function gitSandboxAuthorizationFailure(input: {
    readonly request: Pick<ToolExecutionRequest, "actionId" | "plan">;
    readonly workspaceRoot: string;
    readonly repoInfo: GitRepositoryInfo;
    readonly access: "read" | "write";
    readonly enableSeatbelt?: boolean | undefined;
    readonly extraReadPaths?: readonly string[] | undefined;
    readonly extraWritePaths?: readonly string[] | undefined;
}): Promise<ToolObservation | undefined> {
    if (input.enableSeatbelt === false || process.platform !== "darwin") return undefined;
    if (!isSeatbeltSupported()) {
        return {
            kind: "failure",
            code: "SANDBOX_UNAVAILABLE",
            message: "macOS Seatbelt is unavailable; Git execution was denied.",
            retryable: false,
        };
    }
    const valid = await isGitSandboxPlanValid({
        repoInfo: input.repoInfo,
        access: input.access,
        authorization: createGitSandboxAuthorization(input.request, input.workspaceRoot),
        extraReadPaths: input.extraReadPaths,
        extraWritePaths: input.extraWritePaths,
        requireExactPlan: true,
    });
    if (valid) return undefined;
    return {
        kind: "failure",
        code: "SANDBOX_APPROVAL_REQUIRED",
        message: "Git metadata or target access is not covered by the current approved sandbox plan.",
        retryable: false,
    };
}
