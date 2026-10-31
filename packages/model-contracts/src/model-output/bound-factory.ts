import {
    ContractValidationError,
    isRecord,
    type ContractIssueCode,
    type JsonSchema202012,
    type JsonValue,
} from "../../../contracts/src/index";
import type {
    ContractBinding,
    ContractDiagnostic,
    ContractIssue,
    ContractReadResult,
    ContractSchemaNode,
    ModelProjection,
} from "../../../contract-binding/src/index";
import { validateCompletionReviewResult } from "./semantics";
import type { ModelContractDecodeOptions } from "./decode-options";
import { ModelOutputContractDefinitionError } from "./errors";
import { assertPortableModelSchema, buildShapeGuide } from "./provider-schema";
import { generateBusinessActionId } from "./action-id";
import type { ModelOutputBundle } from "./bundle";
import type {
    AgentDecision,
    CompletionReviewResult,
    DecideOutput,
    RequestThink,
    ToolCallDecisionEnvelope,
} from "./schema-types";
import type {
    AuthorizedToolBinding,
    ExecutingDecisionBindings,
    ModelOutputBindingSet,
    SystemToolBindingSet,
} from "./bindings";
import type { SystemToolDeclaration } from "./tool-declaration";
import {
    SystemAskUserSpec,
    SystemCompleteRunSpec,
    SystemCompleteRunStageSpec,
    SystemCompleteTaskSpec,
    SystemCompletionReviewSpec,
    SystemContextCheckpointSpec,
    SystemContextLookupSpec,
    SystemFailGoalSpec,
    SystemFindToolsSpec,
    SystemProposeTaskPlanSpec,
    SystemRequestThinkSpec,
    SystemReviseRunStageSpec,
    SystemStartNextRunStageSpec,
    SystemStartRunStageSpec,
    SystemUpdateGoalPlanSpec,
    SystemUpdatePlanRouteSpec,
    SystemWaitForInputSpec,
    type AnySystemToolSpec,
    type RunStageToolContext,
} from "./system-tool-specs";

/**
 * 按生成绑定动态组合的模型输出请求。
 *
 * @remarks
 * 与 Contract AST 请求语义一致；`authorizedTools` 改为工具线提供的生成绑定。
 * 业务工具输入由各工具绑定校验，模型线只负责按阶段和模式组合分支。
 *
 * @example
 * ```ts
 * const request: BoundModelOutputRequest = {
 *     kind: "executing",
 *     authorizedTools: [{ id: "read_file", binding: ReadFileInputBinding }],
 * };
 * ```
 */
export type BoundModelOutputRequest =
    | {
        readonly kind: "executing";
        readonly authorizedTools?: readonly AuthorizedToolBinding[];
        readonly taskPresent?: boolean;
        /** 当前 Run 是否按 Plan Mode 的任务提案生命周期执行。 */
        readonly planMode?: boolean;
        /** 当前模式是否获授权提交 GoalPlan Patch。 */
        readonly goalPlanWritable?: boolean;
        /** Decide 请求是否允许返回 `request_think` 分支。 */
        readonly allowThink?: boolean;
        /** 是否允许 Decide 使用工具发现控制分支。 */
        readonly allowToolDiscovery?: boolean;
      }
    | { readonly kind: "checkpoint" }
    | { readonly kind: "completion_review" };

interface ExecutingBranch {
    readonly kind: string;
    readonly toolId?: string;
    readonly binding: ContractBinding<unknown>;
    readonly wireSchema: JsonSchema202012;
    readonly tool?: AuthorizedToolBinding;
}

/**
 * 校验授权工具绑定列表，按 tool ID 排序，并拒绝空 ID 与重复身份。
 *
 * @param tools - 当前请求声明的业务工具绑定。
 * @returns 按 Unicode 码点稳定排序的绑定列表。
 * @throws 工具 ID 为空或重复时抛出 `ModelOutputContractDefinitionError`。
 * @example
 * ```ts
 * const tools = validateAndSortAuthorizedToolBindings(request.authorizedTools);
 * ```
 */
export function validateAndSortAuthorizedToolBindings(
    tools: readonly AuthorizedToolBinding[] | undefined,
): readonly AuthorizedToolBinding[] {
    if (tools === undefined || tools.length === 0) return [];

    const seenIds = new Set<string>();
    for (const tool of tools) {
        if (typeof tool.id !== "string" || tool.id.trim().length === 0) {
            throw new ModelOutputContractDefinitionError("Tool ID must be a non-empty string", ["authorizedTools"]);
        }
        if (seenIds.has(tool.id)) {
            throw new ModelOutputContractDefinitionError(
                `Duplicate tool ID "${tool.id}" in authorized tools`,
                ["authorizedTools"],
            );
        }
        seenIds.add(tool.id);
    }

    return [...tools].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/**
 * 创建按生成绑定动态组合的请求级模型输出契约包。
 *
 * @remarks
 * 分支选择与 `createModelOutputContractBundle` 保持一致：
 * 普通模式、Plan 未批准与 Plan 已批准分别暴露对应决策；授权工具按 ID 码点序派生
 * 独立 `tool_call` 分支，空集合省略该分支；工具发现默认开启；`allowThink` 仅显式为真
 * 时增加 Think 控制请求。每个分支的 Provider Schema 来自同源生成投影，解码未知字段
 * 被剥离并通过 `onDiagnostic` 产生有界路径诊断；已知字段、判别值、授权与领域约束错误
 * 直接拒绝，不返回部分数据。
 *
 * @param request - 当前请求的目标种类及上下文。
 * @param bindings - 模型线与 system tools 的生成绑定集合。
 * @returns 与请求一致的不可变契约包；不读取 Runtime 状态。
 * @throws 生成投影不可移植、工具身份非法或 `tool_call` 绑定结构缺失时抛出 `ModelOutputContractDefinitionError`。
 *
 * @example
 * ```ts
 * const bundle = createBoundModelOutputContractBundle({ kind: "executing" }, bindings);
 * const decision = bundle.decode(rawWire, { onDiagnostic: traceDiagnostic });
 * ```
 */
export function createBoundModelOutputContractBundle<
    Result extends DecideOutput | CompletionReviewResult = AgentDecision,
>(
    request: BoundModelOutputRequest,
    bindings: ModelOutputBindingSet,
): ModelOutputBundle<Result> {
    let name: string;
    let branches: readonly ExecutingBranch[];

    switch (request.kind) {
        case "executing": {
            const taskPresent = request.taskPresent !== false;
            const planMode = request.planMode === true;
            const goalPlanWritable = request.goalPlanWritable ?? planMode;
            name = planMode
                ? taskPresent
                    ? "plan_mode_approved_executing_agent_decision"
                    : "plan_mode_unapproved_executing_agent_decision"
                : goalPlanWritable
                    ? "normal_goal_plan_writable_executing_agent_decision"
                    : "normal_executing_agent_decision";
            if (planMode && request.goalPlanWritable === false) {
                name = `${name}_goal_plan_read_only`;
            }

            const tools = validateAndSortAuthorizedToolBindings(request.authorizedTools);
            const toolBranches = tools.map((tool) => buildToolCallBranch(tool, bindings.executing));
            const nonToolBranches = selectExecutingNonToolBranches(request, planMode, taskPresent, goalPlanWritable, bindings.executing);
            branches = [...toolBranches, ...nonToolBranches];
            break;
        }
        case "checkpoint":
            name = "context_checkpoint_result";
            branches = [{
                kind: "context_checkpoint",
                binding: bindings.checkpoint as ContractBinding<unknown>,
                wireSchema: normalizeProjectionSchema(bindings.checkpoint, ["context_checkpoint"]),
            }];
            break;
        case "completion_review":
            name = "completion_review_result";
            branches = [
                {
                    kind: "accept",
                    binding: bindings.completionReview.accept as ContractBinding<unknown>,
                    wireSchema: normalizeProjectionSchema(bindings.completionReview.accept, ["accept"]),
                },
                {
                    kind: "reject",
                    binding: bindings.completionReview.reject as ContractBinding<unknown>,
                    wireSchema: normalizeProjectionSchema(bindings.completionReview.reject, ["reject"]),
                },
            ];
            break;
    }

    const jsonSchema = assertPortableModelSchema({
        type: "object",
        properties: {
            result: branches.length === 1
                ? branches[0]!.wireSchema
                : { anyOf: branches.map((branch) => branch.wireSchema) },
        },
        required: ["result"],
        additionalProperties: false,
    });
    const shapeGuide = buildShapeGuide(jsonSchema);

    return {
        name,
        jsonSchema,
        shapeGuide,
        decode(value: unknown, options?: ModelContractDecodeOptions): Result {
            if (!isRecord(value)) {
                throw validationError("invalid_type", [], "Model output must be a JSON object");
            }
            if (!("result" in value)) {
                throw validationError("missing_field", ["result"], "Required envelope field 'result' is missing");
            }
            const extraKeys = Object.keys(value).filter((key) => key !== "result");
            if (extraKeys.length > 0) {
                throw validationError(
                    "extra_field",
                    [extraKeys[0]!],
                    "Unexpected extra field in model output envelope",
                );
            }
            const result = value.result;
            if (!isRecord(result)) {
                throw validationError("invalid_type", ["result"], "Envelope field 'result' must be an object");
            }
            const kind = result.kind;
            if (typeof kind !== "string") {
                throw validationError("missing_field", ["result", "kind"], "Decision kind is required");
            }

            if (kind === "tool_call") {
                const action = result.action;
                if (!isRecord(action) || typeof action.toolId !== "string") {
                    throw validationError("missing_field", ["result", "action", "toolId"], "Tool call action and toolId are required");
                }
                const branch = branches.find((candidate) =>
                    candidate.kind === "tool_call" && candidate.toolId === action.toolId);
                if (branch === undefined) {
                    throw validationError(
                        "invalid_enum_value",
                        ["result", "action", "toolId"],
                        "Tool call is unknown or not authorized for this request",
                    );
                }
                if (!("input" in action)) {
                    throw validationError("missing_field", ["result", "action", "input"], "Tool call input is required");
                }
                const { input: rawInput, ...actionEnvelope } = action;
                const decodedEnvelope = decodeBranch<ToolCallDecisionEnvelope>(
                    branch,
                    { ...result, action: actionEnvelope },
                    ["result"],
                    options,
                );
                const tool = branch.tool;
                if (tool === undefined) {
                    throw new ModelOutputContractDefinitionError("tool_call branch is missing its tool binding", ["tool_call"]);
                }
                const decodedInput = tool.inputBinding.modelProjection().decode(rawInput);
                if (!decodedInput.ok) {
                    throw readFailureToValidationError(decodedInput, ["result", "action", "input"]);
                }
                if (decodedInput.diagnostic !== undefined) {
                    observeDiagnostic(options, prefixDiagnostic(decodedInput.diagnostic, "/result/action/input"));
                }
                return {
                    ...decodedEnvelope,
                    action: {
                        ...decodedEnvelope.action,
                        input: decodedInput.data as JsonValue,
                    },
                } as Result;
            }

            const branch = branches.find((candidate) => candidate.kind === kind);
            if (branch === undefined) {
                throw validationError(
                    "invalid_enum_value",
                    ["result", "kind"],
                    "Decision kind is not available for this request",
                );
            }
            const decoded = decodeBranch<Result>(branch, result, ["result"], options);
            if (request.kind === "completion_review") {
                return validateCompletionReviewResult(decoded as CompletionReviewResult) as Result;
            }
            if (isRequestThink(decoded) && decoded.goal.trim().length === 0) {
                throw validationError("string_min_length", ["result", "goal"], "request_think.goal must contain non-whitespace text");
            }
            return decoded;
        },
    };
}

function selectExecutingNonToolBranches(
    request: Extract<BoundModelOutputRequest, { kind: "executing" }>,
    planMode: boolean,
    taskPresent: boolean,
    goalPlanWritable: boolean,
    bindings: ExecutingDecisionBindings,
): readonly ExecutingBranch[] {
    const branches: ExecutingBranch[] = planMode
        ? taskPresent
            ? [
                branchOf("complete", bindings.executingComplete),
                branchOf("wait", bindings.wait),
                branchOf("fail", bindings.fail),
                branchOf("context_lookup", bindings.contextLookup),
                ...(request.allowToolDiscovery === false ? [] : [branchOf("tool_discovery", bindings.toolDiscovery)]),
                branchOf("ask_user", bindings.askUser),
                branchOf("run_stage_update", bindings.runStageUpdate),
                branchOf("run_stage_complete", bindings.runStageComplete),
            ]
            : [
                branchOf("ask_user", bindings.askUser),
                branchOf("task_proposal", bindings.taskProposal),
                branchOf("context_lookup", bindings.contextLookup),
                ...(request.allowToolDiscovery === false ? [] : [branchOf("tool_discovery", bindings.toolDiscovery)]),
            ]
        : [
            branchOf("complete", bindings.normalComplete),
            branchOf("wait", bindings.wait),
            branchOf("fail", bindings.fail),
            branchOf("context_lookup", bindings.contextLookup),
            ...(request.allowToolDiscovery === false ? [] : [branchOf("tool_discovery", bindings.toolDiscovery)]),
            branchOf("ask_user", bindings.askUser),
            branchOf("run_stage_update", bindings.runStageUpdate),
            branchOf("run_stage_complete", bindings.runStageComplete),
        ];
    if (request.allowThink === true) {
        branches.push(branchOf("request_think", bindings.requestThink));
    }
    if (goalPlanWritable) {
        branches.push(branchOf("goal_plan_update", bindings.goalPlanUpdate));
    }
    return branches;
}

function branchOf(kind: string, binding: ContractBinding<unknown>): ExecutingBranch {
    return {
        kind,
        binding,
        wireSchema: normalizeProjectionSchema(binding, [kind]),
    };
}

function buildToolCallBranch(
    tool: AuthorizedToolBinding,
    bindings: ExecutingDecisionBindings,
): ExecutingBranch {
    const envelope = clonedObjectSchema(bindings.toolCall.modelProjection().schema, ["tool_call"]);
    const action = readRecord(readRecord(envelope.properties, ["tool_call", "properties"]).action, ["tool_call", "action"]);
    const actionProperties = readRecord(action.properties, ["tool_call", "action", "properties"]);
    actionProperties.toolId = { const: tool.id };
    actionProperties.input = stripRootDialect(tool.inputBinding.modelProjection().schema);
    const required = action.required;
    if (!Array.isArray(required) || required.some((entry) => typeof entry !== "string")) {
        throw new ModelOutputContractDefinitionError(
            "tool_call binding must declare action.required",
            ["tool_call", "action", "required"],
        );
    }
    action.required = [...required, "input"];
    const wireSchema = normalizeProjectionNode(envelope, ["tool_call"]);
    const isolated = assertPortableModelSchema(wireSchema);
    return {
        kind: "tool_call",
        toolId: tool.id,
        binding: bindings.toolCall as ContractBinding<unknown>,
        wireSchema: isolated,
        tool,
    };
}

function decodeBranch<T>(
    branch: ExecutingBranch,
    value: unknown,
    path: readonly (string | number)[],
    options: ModelContractDecodeOptions | undefined,
): T {
    const decoded = branch.binding.modelProjection().decode(value);
    if (!decoded.ok) {
        throw readFailureToValidationError(decoded, path);
    }
    if (decoded.diagnostic !== undefined) {
        observeDiagnostic(options, prefixDiagnostic(decoded.diagnostic, pointerPath(path)));
    }
    return decoded.data as T;
}

function observeDiagnostic(
    options: ModelContractDecodeOptions | undefined,
    diagnostic: ContractDiagnostic,
): void {
    if (options?.onDiagnostic === undefined) return;
    try {
        options.onDiagnostic(diagnostic);
    } catch {
        // 诊断观察是旁路：回调失败不得改变解码结果或输入接受范围。
    }
}

function prefixDiagnostic(diagnostic: ContractDiagnostic, prefix: string): ContractDiagnostic {
    return {
        ...diagnostic,
        paths: diagnostic.paths.map((path) => `${prefix}${path}`),
    };
}

function pointerPath(path: readonly (string | number)[]): string {
    if (path.length === 0) return "";
    return `/${path.map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function validationError(
    code: ContractIssueCode,
    path: readonly (string | number)[],
    message: string,
): ContractValidationError {
    return new ContractValidationError([{ code, path, message }], false);
}

function readFailureToValidationError(
    failure: Extract<ContractReadResult<unknown>, { readonly ok: false }>,
    basePath: readonly (string | number)[],
): ContractValidationError {
    const issues = failure.issues.map((issue) => ({
        code: bindingIssueCode(issue),
        path: [...basePath, ...pointerSegments(issue.path)],
        message: bindingIssueMessage(issue.code),
    }));
    return new ContractValidationError(issues, failure.truncated);
}

function pointerSegments(pointer: string): (string | number)[] {
    if (pointer.length === 0) return [];
    if (!pointer.startsWith("/")) return [pointer];
    return pointer.slice(1).split("/").map((segment) => {
        const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
        return /^(?:0|[1-9][0-9]*)$/.test(decoded) ? Number(decoded) : decoded;
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

function isRequestThink(value: unknown): value is RequestThink {
    return isRecord(value) && value.kind === "request_think";
}

function normalizeProjectionSchema(
    binding: ContractBinding<unknown>,
    path: readonly (string | number)[],
): JsonSchema202012 {
    return assertPortableModelSchema(normalizeProjectionNode(
        clonedObjectSchema(binding.modelProjection().schema, path),
        path,
    ));
}

function clonedObjectSchema(
    schema: Readonly<Record<string, unknown>>,
    path: readonly (string | number)[],
): Record<string, unknown> {
    const { $schema: _dialect, $id: _identity, ...body } = schema;
    const cloned = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    return readRecord(cloned, path);
}

function stripRootDialect(schema: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const { $schema: _schema, ...rest } = schema;
    return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}

const schemaKeys = new Set([
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "minItems",
    "maxItems",
    "enum",
    "const",
    "minimum",
    "maximum",
    "description",
    "anyOf",
]);

function normalizeProjectionNode(
    node: unknown,
    path: readonly (string | number)[],
): Record<string, unknown> {
    const schema = readRecord(node, path);

    for (const key of Object.keys(schema)) {
        if (key === "$schema" || key === "$id" || key === "$ref" || key === "definitions") {
            throw new ModelOutputContractDefinitionError(
                `Referenced or dialect schema nodes are not portable for Provider output: "${key}"`,
                [...path, key],
            );
        }
        if (!schemaKeys.has(key)) {
            throw new ModelOutputContractDefinitionError(
                `Unsupported or local-only JSON Schema keyword "${key}" for Provider output`,
                [...path, key],
            );
        }
    }

    const description = typeof schema.description === "string" ? { description: schema.description } : {};

    if ("anyOf" in schema) {
        if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
            throw new ModelOutputContractDefinitionError("anyOf must be a non-empty array", [...path, "anyOf"]);
        }
        const extraKeys = Object.keys(schema).filter((key) => key !== "anyOf" && key !== "description");
        if (extraKeys.length > 0) {
            throw new ModelOutputContractDefinitionError(
                "anyOf cannot be combined with other Provider constraints",
                [...path, extraKeys[0]!],
            );
        }
        return {
            ...description,
            anyOf: schema.anyOf.map((branch, index) =>
                normalizeProjectionNode(branch, [...path, "anyOf", index])),
        };
    }

    const constValue = schema.const;
    if (constValue !== undefined) {
        if (schema.enum !== undefined) {
            throw new ModelOutputContractDefinitionError("const and enum cannot both appear", [...path, "enum"]);
        }
        return {
            ...description,
            enum: [constValue],
        };
    }

    const type = schema.type;
    if (Array.isArray(type)) {
        const nonNullTypes = type.filter((entry) => entry !== "null");
        if (nonNullTypes.length !== 1 || !type.includes("null")) {
            throw new ModelOutputContractDefinitionError(
                "Only a single non-null type plus null is portable",
                [...path, "type"],
            );
        }
        const { type: _type, enum: enumValues, ...rest } = schema;
        const nonNullNode: Record<string, unknown> = {
            ...rest,
            type: nonNullTypes[0],
        };
        if (Array.isArray(enumValues)) {
            const withoutNull = enumValues.filter((value) => value !== null);
            if (withoutNull.length === 0) {
                throw new ModelOutputContractDefinitionError("Nullable enum must keep at least one non-null value", [...path, "enum"]);
            }
            nonNullNode.enum = withoutNull;
        }
        return {
            anyOf: [
                normalizeProjectionNode(nonNullNode, path),
                { type: "null" },
            ],
        };
    }

    if (Array.isArray(schema.enum)) {
        return {
            ...description,
            ...(typeof type === "string" ? { type } : {}),
            enum: [...schema.enum],
        };
    }

    if (type === "object") {
        const properties = readRecord(schema.properties, [...path, "properties"]);
        const required = schema.required;
        if (!Array.isArray(required) || required.some((entry) => typeof entry !== "string")) {
            throw new ModelOutputContractDefinitionError(
                "Wire object schemas must declare a required string array",
                [...path, "required"],
            );
        }
        if (schema.additionalProperties !== false) {
            throw new ModelOutputContractDefinitionError(
                "Wire object schemas must close additional properties",
                [...path, "additionalProperties"],
            );
        }
        const propertyNames = Object.keys(properties);
        for (const name of propertyNames) {
            if (!required.includes(name)) {
                throw new ModelOutputContractDefinitionError(
                    `Wire object property "${name}" must be required`,
                    [...path, "required"],
                );
            }
        }
        return {
            ...description,
            type: "object",
            properties: Object.fromEntries(propertyNames.map((name) => [
                name,
                normalizeProjectionNode(properties[name], [...path, "properties", name]),
            ])),
            required: propertyNames,
            additionalProperties: false,
        };
    }

    if (type === "array") {
        if (schema.items === undefined) {
            throw new ModelOutputContractDefinitionError("Array schema must declare items", [...path, "items"]);
        }
        return {
            ...description,
            type: "array",
            items: normalizeProjectionNode(schema.items, [...path, "items"]),
            ...(typeof schema.minItems === "number" ? { minItems: schema.minItems } : {}),
            ...(typeof schema.maxItems === "number" ? { maxItems: schema.maxItems } : {}),
        };
    }

    if (type === "string") {
        return { ...description, type: "string" };
    }

    if (type === "number" || type === "integer") {
        return {
            ...description,
            type,
            ...(typeof schema.minimum === "number" ? { minimum: schema.minimum } : {}),
            ...(typeof schema.maximum === "number" ? { maximum: schema.maximum } : {}),
        };
    }

    if (type === "boolean" || type === "null") {
        return { ...description, type };
    }

    throw new ModelOutputContractDefinitionError(
        "Open or untyped schema nodes must be replaced by a concrete tool binding before Provider projection",
        path,
    );
}

function readRecord(value: unknown, path: readonly (string | number)[]): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new ModelOutputContractDefinitionError("Expected a JSON object schema node", path);
    }
    return value;
}

/** 原生工具参数可能省略可选字段；在 wire 解码前补齐为 null，保持与 canonical 可选语义一致。 */
function withOptionalNulls(
    schema: ContractSchemaNode,
    value: unknown,
): unknown {
    if (!isRecord(value) && !Array.isArray(value)) return value;
    return fillOptionalNulls(schema, schema, value);
}

function fillOptionalNulls(
    schema: ContractSchemaNode,
    root: ContractSchemaNode,
    value: unknown,
): unknown {
    const resolved = resolveSchema(schema, root);

    if (resolved.anyOf !== undefined && resolved.anyOf.length > 0) {
        const branch = selectUnionBranch(resolved.anyOf, root, value);
        return branch === undefined ? value : fillOptionalNulls(branch, root, value);
    }

    if (resolved.type === "array" && Array.isArray(value) && resolved.items !== undefined) {
        return value.map(entry => fillOptionalNulls(resolved.items!, root, entry));
    }

    if (resolved.type !== "object" || !isRecord(value)) return value;

    const required = new Set(resolved.required ?? []);
    const filled: Record<string, unknown> = { ...value };
    for (const [name, property] of Object.entries(resolved.properties ?? {})) {
        if (Object.hasOwn(filled, name)) {
            filled[name] = fillOptionalNulls(property, root, filled[name]);
        } else if (!required.has(name)) {
            filled[name] = null;
        }
    }
    return filled;
}

function selectUnionBranch(
    branches: readonly ContractSchemaNode[],
    root: ContractSchemaNode,
    value: unknown,
): ContractSchemaNode | undefined {
    if (!isRecord(value)) return undefined;
    let best: { readonly branch: ContractSchemaNode; readonly score: number } | undefined;
    for (const branch of branches) {
        const resolved = resolveSchema(branch, root);
        if (resolved.type !== "object") continue;
        let score = 0;
        let discriminatorMatched = false;
        let requiredPresent = true;
        for (const [name, property] of Object.entries(resolved.properties ?? {})) {
            const discriminator = discriminatorValue(resolveSchema(property, root));
            if (discriminator !== undefined) {
                if (!Object.hasOwn(value, name)) {
                    requiredPresent = false;
                    break;
                }
                if (value[name] !== discriminator) {
                    requiredPresent = false;
                    break;
                }
                discriminatorMatched = true;
                score += 2;
            }
        }
        if (!requiredPresent) continue;
        for (const name of resolved.required ?? []) {
            if (!Object.hasOwn(value, name)) {
                requiredPresent = false;
                break;
            }
        }
        if (!requiredPresent) continue;
        score += discriminatorMatched ? 1 : 0;
        if (best === undefined || score > best.score) best = { branch, score };
    }
    return best?.branch;
}

function discriminatorValue(schema: ContractSchemaNode): JsonValue | undefined {
    if (schema.const !== undefined) return schema.const;
    if (schema.enum?.length === 1) return schema.enum[0];
    return undefined;
}

function resolveSchema(schema: ContractSchemaNode, root: ContractSchemaNode): ContractSchemaNode {
    if (schema.$ref === undefined) return schema;
    let current: unknown = root;
    for (const segment of schema.$ref.replace(/^#\//u, "").split("/")) {
        if (current === null || typeof current !== "object") return {};
        current = (current as Record<string, unknown>)[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    return current !== null && typeof current === "object" ? current as ContractSchemaNode : {};
}

/**
 * 从 system tool 生成绑定构造原生工具声明。
 *
 * @param spec - 共享工具规范；提供身份、说明和已解码转换。
 * @param binding - 对应输入的生成绑定。
 * @returns 参数 Schema 来自同源 wire 投影、解码剥离未知字段并报告有界诊断的声明。
 * @throws 生成投影不可移植时抛出 `ModelOutputContractDefinitionError`。
 * @example
 * ```ts
 * const declaration = createBoundSystemToolDeclaration(SystemFindToolsSpec, bindings.systemTools.findTools);
 * ```
 */
export function createBoundSystemToolDeclaration<Args, Result, Id extends string>(
    spec: AnySystemToolSpec<Result> & { readonly id: Id },
    binding: ContractBinding<Args>,
): SystemToolDeclaration<Result> & { readonly id: Id } {
    const projection = binding.modelProjection();
    const parametersSchema = assertPortableModelSchema(
        normalizeProjectionNode(clonedObjectSchema(projection.schema, [spec.id]), [spec.id]),
    );

    return {
        id: spec.id,
        description: spec.description,
        parametersSchema,
        decode: (rawArguments: unknown, options?: ModelContractDecodeOptions): Result => {
            const decoded = projection.decode(withOptionalNulls(binding.schema, rawArguments));
            if (!decoded.ok) {
                throw readFailureToValidationError(decoded, []);
            }
            if (decoded.diagnostic !== undefined) {
                observeDiagnostic(options, decoded.diagnostic);
            }
            return spec.build(decoded.data);
        },
    };
}

/**
 * 将业务授权工具绑定包装为原生工具声明。
 *
 * @param tool - 工具线提供的授权工具绑定。
 * @param description - 面向模型的工具说明；默认复用授权绑定中的工具说明。
 * @returns 参数 Schema 来自工具输入投影、解码后生成 tool_call 决策的声明。
 * @example
 * ```ts
 * const declaration = createBoundBusinessToolDeclaration(authorizedTool);
 * ```
 */
export function createBoundBusinessToolDeclaration(
    tool: AuthorizedToolBinding,
    description = tool.description,
): SystemToolDeclaration<AgentDecision> {
    const projection: ModelProjection<unknown> = tool.inputBinding.modelProjection();
    const parametersSchema = assertPortableModelSchema(
        normalizeProjectionNode(clonedObjectSchema(projection.schema, [tool.id]), [tool.id]),
    );
    return {
        id: tool.id,
        description,
        parametersSchema,
        decode: (rawArguments: unknown, options?: ModelContractDecodeOptions): AgentDecision => {
            const decoded = projection.decode(withOptionalNulls(tool.inputBinding.schema, rawArguments));
            if (!decoded.ok) {
                throw readFailureToValidationError(decoded, []);
            }
            if (decoded.diagnostic !== undefined) {
                observeDiagnostic(options, decoded.diagnostic);
            }
            return {
                kind: "tool_call",
                action: {
                    actionId: generateBusinessActionId(tool.id),
                    toolId: tool.id,
                    input: decoded.data as JsonValue,
                },
            };
        },
    };
}

/**
 * 按请求快照生成当前合法的阶段工具声明。
 *
 * @param context - 当前阶段和获批路线。
 * @param bindings - system tool 生成绑定集合。
 * @returns 无执行中阶段时提供开始；执行中提供修订、完成；路线结束时不提供开始。
 * @example
 * ```ts
 * const declarations = createBoundRunStageToolDeclarations({}, bindings);
 * ```
 */
export function createBoundRunStageToolDeclarations(
    context: RunStageToolContext,
    bindings: SystemToolBindingSet,
): readonly SystemToolDeclaration<AgentDecision>[] {
    const current = context.currentStage;
    if (current?.status === "executing") {
        return [
            createBoundSystemToolDeclaration(
                SystemReviseRunStageSpec(current.stageId, current.revision),
                bindings.reviseRunStage,
            ),
            createBoundSystemToolDeclaration(
                SystemCompleteRunStageSpec(current.stageId),
                bindings.completeRunStage,
            ),
        ];
    }
    if (context.planRoute !== undefined) {
        const next = context.planRoute.stages[context.planRoute.nextStageIndex];
        if (next?.status !== "pending") return [];
        return [createBoundSystemToolDeclaration(
            SystemStartNextRunStageSpec(next.target, next.acceptanceCriteria),
            bindings.startNextRunStage,
        )];
    }
    return [createBoundSystemToolDeclaration(SystemStartRunStageSpec, bindings.startRunStage)];
}

/**
 * 构造 Executing 阶段的完整原生工具声明集合。
 *
 * @param authorizedTools - 当前 Goal 授权的业务工具绑定。
 * @param bindings - 模型输出与 system tool 生成绑定集合。
 * @param stageContext - 本次请求的阶段和获批路线快照。
 * @returns 业务工具、工具发现与系统执行决策的完整声明列表。
 * @throws 工具身份为空或重复时抛出 `ModelOutputContractDefinitionError`。
 * @example
 * ```ts
 * const tools = createBoundExecutingToolDeclarations(authorizedTools, bindings);
 * ```
 */
export function createBoundExecutingToolDeclarations(
    authorizedTools: readonly AuthorizedToolBinding[],
    bindings: ModelOutputBindingSet,
    stageContext: RunStageToolContext = {},
): readonly SystemToolDeclaration<AgentDecision>[] {
    const tools = validateAndSortAuthorizedToolBindings(authorizedTools);
    return [
        ...tools.map((tool) => createBoundBusinessToolDeclaration(tool)),
        createBoundSystemToolDeclaration(SystemCompleteTaskSpec, bindings.systemTools.completeTask),
        createBoundSystemToolDeclaration(SystemWaitForInputSpec, bindings.systemTools.waitForInput),
        createBoundSystemToolDeclaration(SystemFailGoalSpec, bindings.systemTools.failGoal),
        createBoundSystemToolDeclaration(SystemContextLookupSpec, bindings.systemTools.contextLookup),
        createBoundSystemToolDeclaration(SystemFindToolsSpec, bindings.systemTools.findTools),
        createBoundSystemToolDeclaration(SystemAskUserSpec, bindings.systemTools.askUser),
        ...createBoundRunStageToolDeclarations(stageContext, bindings.systemTools),
    ];
}

/**
 * 构造统一执行流的系统与业务工具声明集合。
 *
 * @remarks
 * 分支规则与 `createUnifiedToolDeclarations` 一致；差异仅在参数 Schema 与解码
 * 来自生成绑定。业务工具身份按码点序稳定排序并拒绝重复。
 *
 * @param authorizedTools - 当前 Goal 授权的业务工具绑定。
 * @param bindings - 模型输出与 system tool 生成绑定集合。
 * @param taskPresent - 是否已批准固定 GoalTask。
 * @param planMode - 是否处于 Plan Mode 任务提案生命周期。
 * @param goalPlanWritable - 当前模式是否获授权更新 GoalPlan。
 * @param allowThink - 是否向 Decide 暴露 `request_think`。
 * @param stageContext - 固定本次请求可操作的阶段。
 * @returns 对应状态下的工具声明列表。
 * @throws 工具身份为空或重复时抛出 `ModelOutputContractDefinitionError`。
 * @example
 * ```ts
 * const tools = createBoundUnifiedToolDeclarations(authorizedTools, bindings, true, false, true);
 * ```
 */
export function createBoundUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolBinding[],
    bindings: ModelOutputBindingSet,
    taskPresent: boolean,
    planMode = false,
    goalPlanWritable = planMode,
    allowThink = false,
    stageContext: RunStageToolContext = {},
): readonly SystemToolDeclaration<DecideOutput>[] {
    const tools = validateAndSortAuthorizedToolBindings(authorizedTools);
    const businessTools = tools.map((tool) => createBoundBusinessToolDeclaration(tool));
    const thinkDeclaration = allowThink
        ? [createBoundSystemToolDeclaration(SystemRequestThinkSpec, bindings.systemTools.requestThink)]
        : [];
    const goalPlanDeclaration = goalPlanWritable
        ? [createBoundSystemToolDeclaration(SystemUpdateGoalPlanSpec, bindings.systemTools.updateGoalPlan)]
        : [];

    if (!planMode) {
        return [
            ...businessTools,
            createBoundSystemToolDeclaration(SystemCompleteRunSpec, bindings.systemTools.completeRun),
            createBoundSystemToolDeclaration(SystemWaitForInputSpec, bindings.systemTools.waitForInput),
            createBoundSystemToolDeclaration(SystemFailGoalSpec, bindings.systemTools.failGoal),
            createBoundSystemToolDeclaration(SystemContextLookupSpec, bindings.systemTools.contextLookup),
            createBoundSystemToolDeclaration(SystemFindToolsSpec, bindings.systemTools.findTools),
            createBoundSystemToolDeclaration(SystemAskUserSpec, bindings.systemTools.askUser),
            ...createBoundRunStageToolDeclarations(stageContext, bindings.systemTools),
            ...goalPlanDeclaration,
            ...thinkDeclaration,
        ];
    }

    if (!taskPresent) {
        return [
            ...businessTools,
            createBoundSystemToolDeclaration(SystemAskUserSpec, bindings.systemTools.askUser),
            createBoundSystemToolDeclaration(SystemProposeTaskPlanSpec, bindings.systemTools.proposeTaskPlan),
            createBoundSystemToolDeclaration(SystemContextLookupSpec, bindings.systemTools.contextLookup),
            createBoundSystemToolDeclaration(SystemFindToolsSpec, bindings.systemTools.findTools),
            ...goalPlanDeclaration,
            ...thinkDeclaration,
        ];
    }

    return [
        ...createBoundExecutingToolDeclarations(tools, bindings, stageContext),
        createBoundSystemToolDeclaration(SystemUpdatePlanRouteSpec, bindings.systemTools.updatePlanRoute),
        ...goalPlanDeclaration,
        ...thinkDeclaration,
    ];
}

/**
 * 构造上下文检查点工具声明。
 *
 * @param bindings - system tool 生成绑定集合。
 * @returns 仅包含检查点保存工具的声明列表。
 * @example
 * ```ts
 * const tools = createBoundCheckpointToolDeclarations(bindings);
 * ```
 */
export function createBoundCheckpointToolDeclarations(
    bindings: ModelOutputBindingSet,
): readonly SystemToolDeclaration<AgentDecision>[] {
    return [createBoundSystemToolDeclaration(SystemContextCheckpointSpec, bindings.systemTools.contextCheckpoint)];
}

/**
 * 构造完成审查工具声明。
 *
 * @param bindings - system tool 生成绑定集合。
 * @returns 唯一完成审查声明，不授予业务工具或 Runtime 状态转换能力。
 * @example
 * ```ts
 * const declaration = createBoundCompletionReviewDeclaration(bindings);
 * ```
 */
export function createBoundCompletionReviewDeclaration(
    bindings: ModelOutputBindingSet,
): SystemToolDeclaration<CompletionReviewResult> {
    return createBoundSystemToolDeclaration(SystemCompletionReviewSpec, bindings.systemTools.completionReview);
}
