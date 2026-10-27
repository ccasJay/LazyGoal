/**
 * 工作区内容变更版本追踪。
 *
 * @remarks
 * 为每个 workspaceRoot 维护一个轻量单调递增的版本号。
 * 当 `edit_file`、`write_file` 或 `apply_patch` 成功修改了工作区文件时调用 `markWorkspaceModified`。
 * 便于 `BashTool`、`ReadFileTool` 识别在失败后是否发生过代码改动，从而打断无脑重复失败命令或请求的死循环。
 */

const workspaceVersions = new Map<string, number>();

/**
 * 标记指定工作区发生了文件写操作。
 *
 * @param workspaceRoot - 工作区根目录路径。
 */
export function markWorkspaceModified(workspaceRoot: string): void {
    const current = workspaceVersions.get(workspaceRoot) ?? 0;
    workspaceVersions.set(workspaceRoot, current + 1);
}

/**
 * 获取指定工作区的当前写操作版本号。
 *
 * @param workspaceRoot - 工作区根目录路径。
 * @returns 递增版本号，未修改过时为 0。
 */
export function getWorkspaceVersion(workspaceRoot: string): number {
    return workspaceVersions.get(workspaceRoot) ?? 0;
}
