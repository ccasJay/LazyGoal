import {
    ContractValidationError,
    type ContractIssueCode,
} from "../../../contracts/src/index";
import type {
    ContractBinding,
    ContractIssue,
    JsonValue,
} from "../../../contract-binding/src/index";
import type { AgentDecision } from "./schema-types";
import type { ModelOutputBindingSet } from "./bindings";

/**
 * 使用同源生成绑定校验 Runtime 接收的 canonical AgentDecision。
 *
 * @remarks
 * 非 `tool_call` 分支按判别值选择模型线生成绑定，并以 `reject` 策略读取 local Schema；
 * 已知字段、判别值和领域约束错误都会失败，额外字段不会被静默接受。
 * `tool_call` 只校验固定外壳，动态 `action.input` 保留给实际 Tool 绑定在
 * `prepare` 时按工具执行边界校验，因此未知或未授权工具仍由 Runtime 的授权流程拒绝，
 * 不会在此提前改写错误分类。
 *
 * @param value - StepExecutor 返回或已解码的 canonical 决策。
 * @param bindings - 模型线共享的生成绑定集合。
 * @returns 隔离后的 canonical AgentDecision；不修改输入。
 * @throws {@link ContractValidationError} 结构不符合生成绑定或判别值不可用时抛出。
 *
 * @example
 * ```ts
 * const decision = decodeBoundAgentDecision(candidate, modelOutputBindings);
 * ```
 */
export function decodeBoundAgentDecision(
    value: unknown,
    bindings: ModelOutputBindingSet,
): AgentDecision {
    if (!isRecord(value) || typeof value.kind !== "string") {
        throw validationError("invalid_type", [], "AgentDecision must be an object with a string kind");
    }

    if (value.kind === "tool_call") {
        return decodeToolCallDecision(value, bindings);
    }

    switch (value.kind) {
        case "context_checkpoint":
            return decodeWithBinding(bindings.checkpoint, value);
        case "complete": {
            const candidates = Object.hasOwn(value, "completionEvidence")
                ? [bindings.executing.executingComplete, bindings.executing.normalComplete]
                : [bindings.executing.normalComplete, bindings.executing.executingComplete];
            return decodeFirst(candidates, value);
        }
        case "wait":
            return decodeWithBinding(bindings.executing.wait, value);
        case "fail":
            return decodeWithBinding(bindings.executing.fail, value);
        case "context_lookup":
            return decodeWithBinding(bindings.executing.contextLookup, value);
        case "tool_discovery":
            return decodeWithBinding(bindings.executing.toolDiscovery, value);
        case "ask_user":
            return decodeWithBinding(bindings.executing.askUser, value);
        case "task_proposal":
            return decodeWithBinding(bindings.executing.taskProposal, value);
        case "goal_plan_update":
            return decodeWithBinding(bindings.executing.goalPlanUpdate, value);
        case "run_stage_update":
            return decodeWithBinding(bindings.executing.runStageUpdate, value);
        case "run_stage_complete":
            return decodeWithBinding(bindings.executing.runStageComplete, value);
        case "run_plan_route_update":
            return decodeWithBinding(bindings.executing.runPlanRouteUpdate, value);
        default:
            throw validationError(
                "invalid_enum_value",
                ["kind"],
                "Decision kind is not available for an AgentDecision",
            );
    }
}

function decodeToolCallDecision(
    value: Readonly<Record<string, unknown>>,
    bindings: ModelOutputBindingSet,
): AgentDecision {
    const action = value.action;
    if (!isRecord(action)) {
        throw validationError("invalid_type", ["action"], "Tool call action must be an object");
    }
    if (!Object.hasOwn(action, "input") || !isJsonValue(action.input)) {
        throw validationError("invalid_type", ["action", "input"], "Tool call input must be a JSON value");
    }
    const { input, ...actionEnvelope } = action;
    const envelope = decodeWithBinding(bindings.executing.toolCall, {
        ...value,
        action: actionEnvelope,
    });
    return {
        ...envelope,
        action: {
            ...envelope.action,
            input,
        },
    };
}

function decodeFirst(
    bindings: readonly ContractBinding<unknown>[],
    value: unknown,
): AgentDecision {
    let firstError: unknown;
    for (const binding of bindings) {
        try {
            return decodeWithBinding(binding, value) as AgentDecision;
        } catch (error) {
            firstError ??= error;
        }
    }
    throw firstError;
}

function decodeWithBinding<T>(binding: ContractBinding<T>, value: unknown): T {
    const decoded = binding.read(value, "reject");
    if (!decoded.ok) {
        throw new ContractValidationError(
            decoded.issues.map(issue => ({
                code: bindingIssueCode(issue),
                path: pointerSegments(issue.path),
                message: bindingIssueMessage(issue.code),
            })),
            decoded.truncated,
        );
    }
    return decoded.data;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
    if (value === null) return true;
    if (typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isJsonValue);
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
        && Object.values(value).every(isJsonValue);
}

function validationError(
    code: ContractIssueCode,
    path: readonly (string | number)[],
    message: string,
): ContractValidationError {
    return new ContractValidationError([{ code, path, message }], false);
}

function pointerSegments(pointer: string): (string | number)[] {
    if (pointer.length === 0) return [];
    if (!pointer.startsWith("/")) return [pointer];
    return pointer.slice(1).split("/").map(segment => {
        const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
        return /^(?:0|[1-9][0-9]*)$/u.test(decoded) ? Number(decoded) : decoded;
    });
}

function bindingIssueCode(issue: ContractIssue): ContractIssueCode {
    switch (issue.code) {
        case "required":
            return "missing_field";
        case "type":
        case "json":
            return "invalid_type";
        case "enum":
        case "const":
            return "invalid_enum_value";
        case "range":
            return "number_minimum";
        case "length":
            return "string_min_length";
        case "pattern":
            return "string_pattern";
        case "unknown":
            return "extra_field";
        default:
            return "union_no_match";
    }
}

function bindingIssueMessage(code: ContractIssue["code"]): string {
    switch (code) {
        case "required":
            return "Required field is missing";
        case "type":
        case "json":
            return "Value does not match the required type";
        case "enum":
        case "const":
            return "Value is not an allowed literal";
        case "range":
            return "Value is outside the allowed numeric range";
        case "length":
            return "String length is outside the allowed range";
        case "pattern":
            return "String does not match the required pattern";
        case "unknown":
            return "Unexpected extra field";
        default:
            return "Value does not satisfy the contract";
    }
}
