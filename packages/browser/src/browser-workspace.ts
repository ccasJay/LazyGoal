import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Hono } from "hono";

const runGit = promisify(execFile);

/**
 * 浏览器所连接执行工作区的当前 Git 位置。
 *
 * @remarks
 * 所有本机 Goal 共用启动工作区；这些值是查询时的 Git 状态，不是 Goal 创建时的
 * 历史绑定。非 Git 工作区没有 worktree 与分支；detached HEAD 只有 worktree。
 *
 * @example
 * ```ts
 * const context: BrowserWorkspaceContext = {
 *     workspaceRoot: "/project/task", worktreeRoot: "/project/task", branch: "feature/task",
 * };
 * ```
 */
export interface BrowserWorkspaceContext {
    /** Runtime 与工具实际使用的绝对工作目录。 */
    readonly workspaceRoot: string;
    /** 当前 Git worktree 根目录；非 Git 工作区为 `null`。 */
    readonly worktreeRoot: string | null;
    /** 当前分支；detached HEAD 或非 Git 工作区为 `null`。 */
    readonly branch: string | null;
}

/**
 * 创建执行工作区的只读位置查询路由。
 *
 * @remarks
 * 每次请求通过本机 Git 读取当前 worktree 与分支，不修改 Git 或持久化状态。
 * Git 不可执行、超时或读取失败时返回稳定的 503 错误；外层须挂载
 * BrowserSessionAccess，绝对路径只向获授权的同源浏览器返回。
 *
 * @param workspaceRoot - Composition Root 解析后的绝对执行工作目录。
 * @returns 提供 `GET /api/project/workspace` 的路由。
 * @example
 * ```ts
 * httpService.mount("/", createBrowserWorkspaceRoutes(root.workspaceRoot));
 * ```
 */
export function createBrowserWorkspaceRoutes(workspaceRoot: string): Hono {
    return new Hono().get("/api/project/workspace", async (context) => {
        const git = (args: readonly string[]) => runGit("git", ["-C", workspaceRoot, ...args], {
            encoding: "utf8", timeout: 2_000, maxBuffer: 64 * 1024,
            signal: context.req.raw.signal,
            env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
        });
        try {
            let worktreeRoot: string;
            try {
                worktreeRoot = (await git(["rev-parse", "--show-toplevel"])).stdout.trim();
            } catch (error) {
                if (error instanceof Error && "stderr" in error
                    && typeof error.stderr === "string" && error.stderr.includes("not a git repository")) {
                    return context.json({ workspaceRoot, worktreeRoot: null, branch: null } satisfies BrowserWorkspaceContext);
                }
                throw error;
            }
            let branch: string | null;
            try {
                branch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).stdout.trim();
            } catch (error) {
                if (!(error instanceof Error && "code" in error && error.code === 1)) throw error;
                branch = null;
            }
            return context.json({ workspaceRoot, worktreeRoot, branch } satisfies BrowserWorkspaceContext);
        } catch {
            return context.json({ error: "workspace_context_unavailable" }, 503);
        }
    });
}
