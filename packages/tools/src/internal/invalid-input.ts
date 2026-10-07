import type { ToolValidationResult } from "../../../tool-core/src/index";

/**
 * 构造稳定的 `INVALID_TOOL_INPUT` 语义校验失败结果。
 *
 * @param message - 面向 Agent 的中文语义错误说明，不得包含原始输入值。
 * @param path - 可选的输入字段路径；提供后将随错误反馈给原模型阶段。
 * @returns 携带 `INVALID_TOOL_INPUT` 错误码的失败结果。
 *
 * @example
 * ```ts
 * const result = invalidInput("path 不能为空");
 * ```
 */
export function invalidInput(
    message: string,
    path?: readonly (string | number)[],
): ToolValidationResult {
    return {
        ok: false,
        error: {
            code: "INVALID_TOOL_INPUT",
            message,
            ...(path === undefined ? {} : {
                issues: [{ code: "invalid_semantics", path, message }],
            }),
        },
    };
}
