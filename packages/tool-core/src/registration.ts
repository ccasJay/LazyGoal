import {
    compileJsonSchema,
    safeParse,
} from "../../contracts/src/index";
import {
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type { SandboxExecutionPlan } from "../../sandbox/src/index";
import type {
    PreparedToolAction,
    Tool,
    ToolDefinition,
    ToolExecutionContext,
    ToolInputContract,
    ToolRegistration,
    ToolValidationResult,
} from "./types";

/**
 * 将带具体 Contract 泛型的 Tool 封装为 Registry 可保存的绑定。
 *
 * @remarks
 * 创建时编译一次完整 Contract 图，尽早拒绝非法定义；每次 `prepare` 只调用一次
 * `safeParse`，并把 Parser 返回的隔离输入交给语义校验和后续执行。该函数不执行
 * Tool，也不保存输入、Action 或执行闭包。
 *
 * @param tool - 由具体 Input Contract 绑定的 Tool 实现。
 * @returns 可放入 `ToolRegistry` 的类型擦除注册项。
 * @throws Input Contract 定义非法时抛出 `ContractDefinitionError`。
 *
 * @example
 * ```ts
 * const registration = createToolRegistration(readFileTool);
 * const registry = new InMemoryToolRegistry([registration]);
 * ```
 */
export function createToolRegistration<C extends ToolInputContract>(
    tool: Tool<C>,
): ToolRegistration {
    compileJsonSchema(tool.definition.inputContract);

    const definition: ToolDefinition = Object.freeze({
        id: tool.definition.id,
        description: tool.definition.description,
        inputContract: tool.definition.inputContract,
        isReadOnly: tool.definition.isReadOnly,
    });

    return {
        kind: "tool",
        definition,
        replayPolicy: tool.replayPolicy,
        prepare(input, control) {
            throwIfAborted(control);
            const parsed = safeParse(tool.definition.inputContract, input);
            throwIfAborted(control);

            if (!parsed.success) {
                const issue = parsed.issues[0];
                const path = issue === undefined
                    ? "$"
                    : issue.path.length === 0
                        ? "$"
                        : "$" + issue.path.map((segment) =>
                            typeof segment === "number"
                                ? `[${segment}]`
                                : `.${segment}`,
                        ).join("");
                const truncated = parsed.truncated ? "；诊断已截断" : "";
                return {
                    ok: false,
                    error: {
                        code: "INVALID_TOOL_INPUT",
                        message: `${definition.id} 输入 Contract 校验失败：${issue?.code ?? "unknown"} at ${path}${truncated}`,
                        issues: parsed.issues.map(({ code, path: issuePath, message }) => ({
                            code,
                            path: issuePath,
                            message,
                        })),
                    },
                };
            }

            const validation = tool.validate(parsed.data);
            throwIfAborted(control);

            if (!isToolValidationResult(validation)) {
                throw new Error("Tool validate returned an invalid result");
            }

            if (!validation.ok) {
                if (!isNonEmptyToolValidationError(validation.error)) {
                    throw new Error("Tool validate returned an invalid error");
                }
                return validation;
            }

            return {
                ok: true,
                input: parsed.data,
                ...(tool.resolveSandboxAccess === undefined
                    ? {}
                    : {
                        resolveSandboxAccess(resolveControl?: ExecutionControl) {
                            return tool.resolveSandboxAccess!(parsed.data, resolveControl);
                        },
                    }),
                execute(actionId, context, executeControl, plan) {
                    return tool.execute({
                        actionId,
                        context,
                        input: parsed.data,
                        ...(plan !== undefined ? { plan } : {}),
                    }, executeControl);
                },
                ...(tool.stream === undefined
                    ? {}
                    : {
                        stream(actionId: string, context: ToolExecutionContext, executeControl?: ExecutionControl, plan?: SandboxExecutionPlan) {
                            return tool.stream!({
                                actionId,
                                context,
                                input: parsed.data,
                                ...(plan !== undefined ? { plan } : {}),
                            }, executeControl);
                        },
                    }),
            };
        },
    };
}

function isToolValidationResult(value: unknown): value is ToolValidationResult {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const candidate = value as { readonly ok?: unknown; readonly error?: unknown };
    if (candidate.ok === true) return true;
    if (candidate.ok !== false || typeof candidate.error !== "object" || candidate.error === null) {
        return false;
    }
    const error = candidate.error as { readonly code?: unknown; readonly message?: unknown };
    return error.code === "INVALID_TOOL_INPUT" && isNonEmptyText(error.message);
}

function isNonEmptyToolValidationError(
    value: unknown,
): value is { readonly code: "INVALID_TOOL_INPUT"; readonly message: string } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const error = value as { readonly code?: unknown; readonly message?: unknown };
    return error.code === "INVALID_TOOL_INPUT" && isNonEmptyText(error.message);
}

function isNonEmptyText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
