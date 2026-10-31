import {
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type {
    ContractBinding,
    ContractIssue,
    ContractReadResult,
    ContractSchemaNode,
} from "../../contract-binding/src/index";
import type { JsonValue } from "../../contracts/src/index";
import type { SandboxExecutionPlan } from "../../sandbox/src/index";
import type {
    BoundTool,
    BoundToolDefinition,
    PreparedToolAction,
    ToolExecutionContext,
    ToolRegistration,
    ToolValidationResult,
} from "./types";

/**
 * 将带具体输入绑定的 Tool 封装为 Registry 可保存的注册项。
 *
 * @remarks
 * 每次 `prepare` 只调用一次 `inputBinding.read(input, "strip")`，把绑定返回的隔离
 * 输入交给语义校验和后续执行；已知字段非法时失败，未知字段被剥离并保留有界诊断。
 * 该函数不执行 Tool，也不保存输入、Action 或执行闭包。
 *
 * @param tool - 由具体输入绑定与语义校验实现的 Tool。
 * @returns 可放入 `ToolRegistry` 的类型擦除注册项。
 *
 * @example
 * ```ts
 * const registration = createToolRegistration(readFileTool);
 * const registry = new InMemoryToolRegistry([registration]);
 * ```
 */
export function createToolRegistration<Input>(tool: BoundTool<Input>): ToolRegistration {
    const inputBinding = tool.definition.inputBinding;
    const definition: BoundToolDefinition = Object.freeze({
        id: tool.definition.id,
        description: tool.definition.description,
        ...(tool.definition.discoveryAliases === undefined
            ? {}
            : { discoveryAliases: Object.freeze([...tool.definition.discoveryAliases]) }),
        inputBinding: inputBinding as ContractBinding<JsonValue>,
        inputContract: tool.definition.inputContract,
        isReadOnly: tool.definition.isReadOnly,
    });

    return {
        kind: "tool",
        definition,
        replayPolicy: tool.replayPolicy,
        prepare(input, control) {
            throwIfAborted(control);
            const parsed = inputBinding.read(input, "strip");
            throwIfAborted(control);

            if (!parsed.ok) {
                return toToolInputFailure(definition.id, definition.inputBinding.schema, parsed);
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
                input: parsed.data as JsonValue,
                ...(parsed.diagnostic === undefined
                    ? {}
                    : { inputDiagnostic: parsed.diagnostic }),
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

function toToolInputFailure(
    toolId: string,
    schema: ContractSchemaNode,
    result: Extract<ContractReadResult<unknown>, { readonly ok: false }>,
): Extract<ToolValidationResult, { readonly ok: false }> {
    const issues = result.issues.map(issue => ({
        code: legacyIssueCode(issue.code),
        path: pointerPath(issue),
        message: issueMessage(schema, issue),
    }));
    const first = result.issues[0];
    const location = first === undefined || first.path === "" ? "$" : first.path;
    const truncated = result.truncated ? "；诊断已截断" : "";

    return {
        ok: false,
        error: {
            code: "INVALID_TOOL_INPUT",
            message: `${toolId} 输入 Contract 校验失败：${first?.code ?? "constraint"} at ${location}${truncated}`,
            ...(issues.length === 0 ? {} : { issues }),
        },
    };
}

function legacyIssueCode(code: ContractIssue["code"]): string {
    switch (code) {
        case "required":
            return "missing_field";
        case "type":
        case "json":
            return "invalid_type";
        case "enum":
            return "invalid_enum_value";
        case "const":
            return "invalid_literal";
        case "unknown":
            return "extra_field";
        case "range":
            return "number_minimum";
        case "length":
            return "string_min_length";
        case "pattern":
            return "string_pattern";
        case "constraint":
        default:
            return "invalid_type";
    }
}

function issueMessage(schema: ContractSchemaNode, issue: ContractIssue): string {
    switch (issue.code) {
        case "required":
            return "Required field is missing";
        case "type": {
            const expected = expectedTypeName(resolveIssueSchema(schema, schema, issue.path));
            return expected === undefined ? "Expected a valid value" : `Expected a ${expected}`;
        }
        case "unknown":
            return "Unexpected field";
        case "enum":
            return "Expected one of the allowed values";
        case "const":
            return "Expected a literal value";
        case "range":
            return "Value is outside the allowed range";
        case "length":
            return "String length is outside the allowed range";
        case "pattern":
            return "String does not match the required pattern";
        case "json":
            return "Expected a JSON value";
        case "constraint":
        default:
            return "Value violates a contract constraint";
    }
}

function resolveIssueSchema(
    root: ContractSchemaNode,
    schema: ContractSchemaNode,
    path: string,
): ContractSchemaNode {
    let current = resolveSchema(root, schema);
    if (path === "") return current;
    for (const segment of path.replace(/^\//u, "").split("/")) {
        const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
        if (/^(?:0|[1-9][0-9]*)$/u.test(key)) {
            current = resolveSchema(root, current.items ?? {});
            continue;
        }
        current = resolveSchema(root, current.properties?.[key] ?? {});
    }
    return current;
}

function resolveSchema(root: ContractSchemaNode, schema: ContractSchemaNode): ContractSchemaNode {
    if (schema.$ref === undefined) return schema;
    let current: unknown = root;
    for (const segment of schema.$ref.replace(/^#\//u, "").split("/")) {
        if (current === null || typeof current !== "object") return {};
        current = (current as Record<string, unknown>)[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    return current !== null && typeof current === "object" ? current as ContractSchemaNode : {};
}

function expectedTypeName(schema: ContractSchemaNode): string | undefined {
    switch (schema.type) {
        case "object":
            return "JSON object";
        case "array":
            return "array";
        case "string":
            return "string";
        case "integer":
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "null":
            return "null";
        default:
            return undefined;
    }
}

function pointerPath(issue: ContractIssue): readonly (string | number)[] {
    if (issue.path === "") return [];
    return issue.path
        .replace(/^\//u, "")
        .split("/")
        .map(segment => {
            const unescaped = segment.replaceAll("~1", "/").replaceAll("~0", "~");
            return /^(?:0|[1-9][0-9]*)$/u.test(unescaped) ? Number(unescaped) : unescaped;
        });
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
