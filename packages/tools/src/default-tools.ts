import {
    createToolRegistration,
    type ToolRegistration,
} from "../../runtime/src/index";
import { ApplyPatchTool, APPLY_PATCH_TOOL_ID } from "./apply-patch";
import { BashTool, BASH_TOOL_ID } from "./bash";
import { EditFileTool, EDIT_FILE_TOOL_ID } from "./edit-file";
import { createExecuteProgramRegistration, EXECUTE_PROGRAM_TOOL_ID } from "./execute-program";
import { FindFilesTool, FIND_FILES_TOOL_ID } from "./find-files";
import { GrepTool, GREP_TOOL_ID } from "./grep";
import { ListDirectoryTool, LIST_DIRECTORY_TOOL_ID } from "./list-directory";
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
    EXECUTE_PROGRAM_TOOL_ID,
]);

/**
 * 构造默认工具集绑定的注册项列表。
 *
 * @remarks
 * 为指定的 `workspaceRoot` 实例化所有默认工具并封装为 `ToolRegistration`。
 *
 * @param workspaceRoot - 当前工作区根目录。
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
): readonly ToolRegistration[] {
    return [
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
        createExecuteProgramRegistration(),
    ];
}
