import {
    createToolRegistration,
    type ProcessSessionStore,
    type ToolRegistration,
} from "../../runtime/src/index";
import { ApplyPatchTool, APPLY_PATCH_TOOL_ID } from "./apply-patch";
import { BashTool, BASH_TOOL_ID } from "./bash";
import { EditFileTool, EDIT_FILE_TOOL_ID } from "./edit-file";
import { createExecuteProgramRegistration, EXECUTE_PROGRAM_TOOL_ID } from "./execute-program";
import { FindFilesTool, FIND_FILES_TOOL_ID } from "./find-files";
import { GrepTool, GREP_TOOL_ID } from "./grep";
import { ListDirectoryTool, LIST_DIRECTORY_TOOL_ID } from "./list-directory";
import { ProcessManager } from "./process-manager";
import {
    ProcessReadTool,
    PROCESS_READ_TOOL_ID,
    ProcessStartTool,
    PROCESS_START_TOOL_ID,
    ProcessStopTool,
    PROCESS_STOP_TOOL_ID,
} from "./process-tools";
import {
    GitStatusTool,
    GIT_STATUS_TOOL_ID,
    GitDiffTool,
    GIT_DIFF_TOOL_ID,
    GitLogTool,
    GIT_LOG_TOOL_ID,
    GitShowTool,
    GIT_SHOW_TOOL_ID,
    GitBranchListTool,
    GIT_BRANCH_LIST_TOOL_ID,
    GitWorktreeListTool,
    GIT_WORKTREE_LIST_TOOL_ID,
} from "./git-read-tools";
import { ReadFileTool, READ_FILE_TOOL_ID } from "./read-file";
import { WebFetchTool, WEB_FETCH_TOOL_ID } from "./web-fetch";
import { WebSearchTool, WEB_SEARCH_TOOL_ID } from "./web-search";
import { WriteFileTool, WRITE_FILE_TOOL_ID } from "./write-file";

/**
 * LazyGoal 默认工具 ID 列表。
 *
 * @remarks
 * 供 Default Agent Profile 与 Composition Root 初始化共用，确保两者的默认工具集合严格同源。
 * 显式与冻结 Profile 保持用户声明，不被自动扩大。
 *
 * @example
 * ```ts
 * const toolIds = DEFAULT_TOOL_IDS;
 * ```
 */
export const DEFAULT_TOOL_IDS: readonly string[] = Object.freeze([
    LIST_DIRECTORY_TOOL_ID,
    FIND_FILES_TOOL_ID,
    READ_FILE_TOOL_ID,
    WRITE_FILE_TOOL_ID,
    EDIT_FILE_TOOL_ID,
    APPLY_PATCH_TOOL_ID,
    GREP_TOOL_ID,
    WEB_SEARCH_TOOL_ID,
    WEB_FETCH_TOOL_ID,
    BASH_TOOL_ID,
    PROCESS_START_TOOL_ID,
    PROCESS_READ_TOOL_ID,
    PROCESS_STOP_TOOL_ID,
    GIT_STATUS_TOOL_ID,
    GIT_DIFF_TOOL_ID,
    GIT_LOG_TOOL_ID,
    GIT_SHOW_TOOL_ID,
    GIT_BRANCH_LIST_TOOL_ID,
    GIT_WORKTREE_LIST_TOOL_ID,
    EXECUTE_PROGRAM_TOOL_ID,
]);

/**
 * 创建默认工具集时的配置项。
 */
export interface DefaultToolRegistrationsOptions {
    /** 长进程生命周期管理器。 */
    readonly processManager?: ProcessManager;
    /** 进程持久化存储。 */
    readonly processSessionStore?: ProcessSessionStore;
}

/**
 * 构造默认工具集绑定的注册项列表。
 *
 * @remarks
 * 为指定的 `workspaceRoot` 实例化所有默认工具并封装为 `ToolRegistration`。
 *
 * @param workspaceRoot - 当前工作区根目录。
 * @param options - 可选的进程管理器与进程存储配置。
 * @returns 包含默认工具绑定的 ToolRegistration 数组。
 *
 * @example
 * ```ts
 * const registrations = createDefaultToolRegistrations("/path/to/project");
 * const registry = new InMemoryToolRegistry(registrations);
 * ```
 */
export function createDefaultToolRegistrations(
    workspaceRoot: string,
    options?: DefaultToolRegistrationsOptions,
): readonly ToolRegistration[] {
    const registrations: ToolRegistration[] = [
        createToolRegistration(new ListDirectoryTool(workspaceRoot)),
        createToolRegistration(new FindFilesTool(workspaceRoot)),
        createToolRegistration(new ReadFileTool(workspaceRoot)),
        createToolRegistration(new WriteFileTool(workspaceRoot)),
        createToolRegistration(new EditFileTool(workspaceRoot)),
        createToolRegistration(new ApplyPatchTool(workspaceRoot)),
        createToolRegistration(new GrepTool(workspaceRoot)),
        createToolRegistration(new WebSearchTool()),
        createToolRegistration(new WebFetchTool()),
        createToolRegistration(new BashTool(workspaceRoot)),
        createToolRegistration(new GitStatusTool(workspaceRoot)),
        createToolRegistration(new GitDiffTool(workspaceRoot)),
        createToolRegistration(new GitLogTool(workspaceRoot)),
        createToolRegistration(new GitShowTool(workspaceRoot)),
        createToolRegistration(new GitBranchListTool(workspaceRoot)),
        createToolRegistration(new GitWorktreeListTool(workspaceRoot)),
    ];

    if (options?.processManager !== undefined && options?.processSessionStore !== undefined) {
        registrations.push(
            createToolRegistration(new ProcessStartTool(workspaceRoot, options.processManager)),
            createToolRegistration(new ProcessReadTool(options.processManager, options.processSessionStore)),
            createToolRegistration(new ProcessStopTool(options.processManager, options.processSessionStore)),
        );
    }

    registrations.push(createExecuteProgramRegistration());
    return registrations;
}
