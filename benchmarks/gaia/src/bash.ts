import {
    BASH_INPUT_CONTRACT,
    BASH_TOOL_ID,
    BashTool,
} from "../../../packages/tools/src/index.js";
import type { ToolDefinition } from "../../../packages/runtime/src/index.js";

export {
    BASH_INPUT_CONTRACT,
    BASH_TOOL_ID,
} from "../../../packages/tools/src/index.js";

/**
 * GAIA 自动化沙箱专用的 Bash 工具。
 *
 * @remarks
 * 直接继承并复用 `packages/tools` 的 `BashTool`，但在 GAIA 自动化沙箱评测中将
 * `isReadOnly` 声明为 `true`。确保 Agent 在免任务提案阶段即可调用 bash 运行
 * Python 脚本或 shell 命令进行数值计算、符号求解和数据处理。
 *
 * @example
 * ```ts
 * const tool = new GaiaBashTool("/workspace");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { command: "python3 -c 'print(2**10)'" },
 * });
 * ```
 */
export class GaiaBashTool extends BashTool {
    override readonly definition: ToolDefinition<typeof BASH_INPUT_CONTRACT> = {
        id: BASH_TOOL_ID,
        description: "在 workspaceRoot 内以 bash 执行命令并返回输出。可用于运行 Python 脚本或 shell 命令进行精确计算和数据分析。",
        inputContract: BASH_INPUT_CONTRACT,
        isReadOnly: true,
    };
}
