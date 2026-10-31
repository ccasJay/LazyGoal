import {
    ContractValidationError,
    type ContractIssueCode,
} from "../../../contracts/src/index";
import type { ContractReadResult } from "../../../contract-binding/src/index";

/**
 * 把绑定读取失败转换为共享校验诊断。
 *
 * @remarks
 * 绑定读取结果已经使用 `@lazygoal/contracts` 的共享 issue 分类，本函数只把 JSON Pointer
 * 路径转换为路径段、拼上调用方给定的基路径，并为每个分类提供不含字段值的英文消息。
 * 它补全缺失的消息字段，不重新解释分类；`truncated` 原样保留。
 *
 * @param failure - 绑定返回的失败结果。
 * @param basePath - 失败位置在调用方结构中的前缀路径。
 * @returns 携带全部诊断的共享校验错误。
 *
 * @example
 * ```ts
 * throw readFailureToValidationError(failure, ["result", "action", "input"]);
 * ```
 */
export function readFailureToValidationError(
    failure: Extract<ContractReadResult<unknown>, { readonly ok: false }>,
    basePath: readonly (string | number)[],
): ContractValidationError {
    const issues = failure.issues.map((issue) => ({
        code: issue.code,
        path: [...basePath, ...pointerSegments(issue.path)],
        message: bindingIssueMessage(issue.code),
    }));
    return new ContractValidationError(issues, failure.truncated);
}

/**
 * 把 JSON Pointer 转换为路径段数组。
 *
 * 数字形状的段转换为数字，`~0`/`~1` 反转义；空指针产生空路径。
 */
function pointerSegments(pointer: string): (string | number)[] {
    if (pointer.length === 0) return [];
    if (!pointer.startsWith("/")) return [pointer];
    return pointer.slice(1).split("/").map((segment) => {
        const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
        return /^(?:0|[1-9][0-9]*)$/u.test(decoded) ? Number(decoded) : decoded;
    });
}

function bindingIssueMessage(code: ContractIssueCode): string {
    switch (code) {
        case "missing_field":
            return "Required field is missing";
        case "not_json":
            return "Expected a JSON value";
        case "invalid_type":
            return "Value does not match the required type";
        case "extra_field":
            return "Unexpected extra field";
        case "invalid_literal":
        case "invalid_enum_value":
            return "Value is not an allowed literal";
        case "number_minimum":
            return "Value is below the allowed minimum";
        case "number_maximum":
            return "Value is above the allowed maximum";
        case "string_min_length":
            return "String is shorter than the allowed minimum length";
        case "string_max_length":
            return "String is longer than the allowed maximum length";
        case "array_min_items":
            return "Array has fewer items than the allowed minimum";
        case "array_max_items":
            return "Array has more items than the allowed maximum";
        case "string_pattern":
            return "String does not match the required pattern";
        case "union_no_match":
            return "Value does not match any allowed shape";
        default:
            return "Value does not satisfy the contract";
    }
}
