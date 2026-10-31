import { contract } from "../../contracts/src/index";
import { executeProgramInputBinding } from "./generated/execute-program/binding";
export { executeProgramInputBinding };
import { createProgramToolRegistration } from "../../runtime/src/tool";
import type { BoundToolDefinition } from "../../tool-core/src/index";

/** 模型显式触发 PTC 的稳定 Tool ID。 */
export const EXECUTE_PROGRAM_TOOL_ID = "execute_program";

/** 程序代码输入契约；代码大小在注册项准备阶段按 UTF-8 计量。 */
export const EXECUTE_PROGRAM_INPUT_CONTRACT = contract.object({
    code: contract.string(),
});

/**
 * `execute_program` 的结构化输入。
 *
 * @remarks
 * `code` 是受 Runner 限额约束的 JavaScript 程序文本；准备阶段按 UTF-8 字节数检查 64 KiB 上限。
 */
export interface ExecuteProgramInput {
    /** 要执行的 JavaScript 程序源码。 */
    readonly code: string;
}

/** 程序入口不代表内部业务调用已获权限。 */
export const EXECUTE_PROGRAM_DEFINITION: BoundToolDefinition<ExecuteProgramInput> = {
    id: EXECUTE_PROGRAM_TOOL_ID,
    description: "Run a bounded JavaScript program that calls authorized tools via tools[toolId](input) and returns one JSON-safe conclusion.",
    discoveryAliases: ["ptc", "programmatic tool calling", "程序化工具调用"],
    inputBinding: executeProgramInputBinding,
    inputContract: EXECUTE_PROGRAM_INPUT_CONTRACT,
    isReadOnly: false,
};

/** 创建供 Runtime 特殊调度的 PTC 注册项。 */
export function createExecuteProgramRegistration() {
    return createProgramToolRegistration(EXECUTE_PROGRAM_DEFINITION);
}
