import {
    createToolRegistration,
    type ToolRegistration,
} from "../../../packages/runtime/src/index.js";
import {
    BashTool,
    EditFileTool,
    GrepTool,
    ReadFileTool,
    WriteFileTool,
} from "../../../packages/tools/src/index.js";
import { compileJsonSchema } from "../../../packages/contracts/src/index.js";
import type { ToolManifestEntry } from "../../src/tool-rpc.js";

/** SWE-bench 支持的标准工具唯一标识列表。 */
export const SWEBENCH_TOOL_IDS = Object.freeze([
    "read_file",
    "write_file",
    "edit_file",
    "grep",
    "bash",
] as const);

/** SWE-bench 在 review 模式下允许自动放行的只读工具标识列表。 */
export const SWEBENCH_READONLY_TOOL_IDS = Object.freeze([
    "read_file",
    "grep",
] as const);

/**
 * 获取 SWE-bench 标准沙箱工具的声明元数据清单。
 *
 * @remarks
 * 返回包含 read_file, write_file, edit_file, grep, bash 五个工具的
 * ID、描述、JSON Schema 及重放策略。
 *
 * @returns 固定的五工具清单数组。
 *
 * @example
 * ```ts
 * const manifest = getSwebenchToolManifest();
 * console.log(manifest.map((t) => t.id));
 * ```
 */
export function getSwebenchToolManifest(): readonly ToolManifestEntry[] {
    const dummyRoot = "/dummy";
    const tools = [
        new ReadFileTool(dummyRoot),
        new WriteFileTool(dummyRoot),
        new EditFileTool(dummyRoot),
        new GrepTool(dummyRoot),
        new BashTool(dummyRoot, { enableSeatbelt: false }),
    ];

    return Object.freeze(
        tools.map((t) =>
            Object.freeze({
                id: t.definition.id,
                description: t.definition.description,
                inputSchema: compileJsonSchema(t.definition.inputContract) as Record<string, unknown>,
                replayPolicy: t.replayPolicy,
            }),
        ),
    );
}

/**
 * 为 SWE-bench 创建本地沙箱工具的完整注册项。
 *
 * @param workspaceRoot - 工具执行的根目录，容器内通常为 `/testbed`。
 * @returns 包含五个标准工具的 ToolRegistration 数组。
 *
 * @example
 * ```ts
 * const registrations = createSwebenchToolRegistrations("/testbed");
 * ```
 */
export function createSwebenchToolRegistrations(workspaceRoot: string): readonly ToolRegistration[] {
    return [
        createToolRegistration(new ReadFileTool(workspaceRoot)),
        createToolRegistration(new WriteFileTool(workspaceRoot)),
        createToolRegistration(new EditFileTool(workspaceRoot)),
        createToolRegistration(new GrepTool(workspaceRoot)),
        createToolRegistration(new BashTool(workspaceRoot, { enableSeatbelt: false })),
    ];
}
