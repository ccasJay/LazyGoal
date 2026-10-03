import { contract } from "../../contracts/src/index";
import {
    createProgramToolRegistration,
    type ToolDefinition,
} from "../../runtime/src/tool";

/** 模型显式触发 PTC 的稳定 Tool ID。 */
export const EXECUTE_PROGRAM_TOOL_ID = "execute_program";

/** 程序代码输入契约；代码大小在注册项准备阶段按 UTF-8 计量。 */
export const EXECUTE_PROGRAM_INPUT_CONTRACT = contract.object({
    code: contract.string(),
});

/** 程序入口不代表内部业务调用已获权限。 */
export const EXECUTE_PROGRAM_DEFINITION: ToolDefinition<typeof EXECUTE_PROGRAM_INPUT_CONTRACT> = {
    id: EXECUTE_PROGRAM_TOOL_ID,
    description: "Run a bounded JavaScript program that calls authorized tools via tools[toolId](input) and returns one JSON-safe conclusion.",
    inputContract: EXECUTE_PROGRAM_INPUT_CONTRACT,
    isReadOnly: false,
};

/** 创建供 Runtime 特殊调度的 PTC 注册项。 */
export function createExecuteProgramRegistration() {
    return createProgramToolRegistration(EXECUTE_PROGRAM_DEFINITION);
}
