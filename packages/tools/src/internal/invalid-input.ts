import type { ToolValidationResult } from "../../../runtime/src/index";

/**
 * 构造稳定的 `INVALID_TOOL_INPUT` 语义校验失败结果。
 *
 * @param message - 面向 Agent 的中文语义错误说明。
 * @returns 携带 `INVALID_TOOL_INPUT` 错误码的失败结果。
 *
 * @example
 * ```ts
 * const result = invalidInput("path 不能为空");
 * ```
 */
export function invalidInput(message: string): ToolValidationResult {
    return {
        ok: false,
        error: {
            code: "INVALID_TOOL_INPUT",
            message,
        },
    };
}
