import type {
    JsonValue,
    ToolValidationResult,
} from "../../../runtime/src/index";

/**
 * 判断一个 JSON 值是否为普通对象（非数组、非 `null`）。
 *
 * @param value - 待判断的任意 JSON 值。
 * @returns 若为普通对象则返回 `true`。
 *
 * @example
 * ```ts
 * isJsonObject({ path: "a.md" }); // true
 * isJsonObject(["a"]); // false
 * ```
 */
export function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 构造稳定的 `INVALID_TOOL_INPUT` 校验失败结果。
 *
 * @param message - 面向 Agent 的中文校验错误说明。
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
