import { contract } from "../contract";
import { safeParse } from "../parser";
import { ContractValidationError } from "../errors";
import type { JsonSchema202012 } from "../json-schema";
import type { Contract, LiteralContract, ObjectContract, ObjectShape } from "../types";
import {
    type AgentDecision,
    type DecideOutput,
    RequestThinkContract,
    AskUserAgentDecisionContract,
    ContextLookupRequestContract,
    ToolDiscoveryDecisionContract,
    NormalCompleteAgentDecisionContract,
    ExecutingCompleteAgentDecisionContract,
    ExecutingFailAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingWorkingMemoryPatchContract,
    GoalPlanUpdateAgentDecisionContract,
    ModelContextCheckpointResultContract,
    NonToolExecutingDecisionContract,
    TaskProposalAgentDecisionContract,
} from "./canonical";
import { ModelOutputContractDefinitionError } from "./errors";
import { buildShapeGuide, compileModelOutputSchema } from "./provider-schema";
import {
    decodeWireResult,
    deriveWireContract,
    deriveWireEnvelopeContract,
} from "./wire";

/**
 * 授权给当前执行轮次的工具契约描述。
 *
 * @remarks
 * 仅绑定工具标识与其参数输入契约，用于动态派生 executing 请求的 `tool_call` 分支。
 *
 * @example
 * ```ts
 * const toolContract: AuthorizedToolContract = {
 *     id: "read_file",
 *     inputContract: ReadFileInputContract,
 * };
 * ```
 */
export interface AuthorizedToolContract {
    /** 工具的稳定唯一标识。 */
    readonly id: string;
    /** 工具入参契约。 */
    readonly inputContract: Contract<unknown>;
    /**
     * 是否为只读工具。
     *
     * @remarks
     * 该标记是工具元数据，不决定模型工具暴露或 Runtime 授权；传入契约包的工具应已由 Profile 授权。
     */
    readonly isReadOnly?: boolean;
}

/**
 * 判定指定的授权工具契约是否显式声明为只读。
 *
 * @param tool - 授权工具契约描述。
 * @returns 声明为 `isReadOnly: true` 时返回 `true`，否则返回 `false`。
 *
 * @example
 * ```ts
 * const readOnly = isReadOnlyToolContract({
 *     id: "read_file",
 *     inputContract: READ_FILE_INPUT_CONTRACT,
 *     isReadOnly: true,
 * });
 * ```
 */
export function isReadOnlyToolContract(tool: AuthorizedToolContract): boolean {
    return tool.isReadOnly === true;
}

/**
 * 模型输出请求种类定义。
 *
 * @remarks
 * 统一执行生命周期与上下文检查点请求。
 */
export type ModelOutputRequest =
    | {
        readonly kind: "executing";
        readonly authorizedTools?: readonly AuthorizedToolContract[];
        readonly taskPresent?: boolean;
        /** 当前 Run 是否按 Plan Mode 的任务提案生命周期执行。 */
        readonly planMode?: boolean;
        /** 当前模式是否获授权提交 GoalPlan Patch；独立于任务提案生命周期。 */
        readonly goalPlanWritable?: boolean;
        /** Decide 请求是否允许返回 Runtime 控制用的 `request_think` 分支。 */
        readonly allowThink?: boolean;
        /** 是否允许 Decide 使用 Runtime 工具发现控制分支；Think 请求应显式关闭。 */
        readonly allowToolDiscovery?: boolean;
      }
    | { readonly kind: "checkpoint" };

/**
 * 请求级模型输出契约包。
 *
 * @remarks
 * 统一提供面向 Provider 的 Wire 契约、面向 Runtime 的 Canonical 契约、严格模式 JSON Schema、
 * Prompt-only 紧凑 Shape Guide，以及确定性的 Wire-to-Canonical 解码器。
 *
 * @example
 * ```ts
 * const bundle = createModelOutputContractBundle({ kind: "executing", taskPresent: false });
 * const result = bundle.decode(rawWireJson);
 * ```
 */
export interface ModelOutputContractBundle<Result> {
    /** 契约包唯一名称。 */
    readonly name: string;
    /** 面向模型调用的带 `result` envelope 的 Wire 契约。 */
    readonly wireContract: Contract<unknown>;
    /** 阶段专用的规范领域结果契约。 */
    readonly canonicalContract: Contract<Result>;
    /** 编译出的共用 JSON Schema 2020-12（不含根 $schema）。 */
    readonly jsonSchema: JsonSchema202012;
    /** 注入 Prompt 消息的紧凑响应结构指引。 */
    readonly shapeGuide: string;
    /**
     * 将符合 Wire 契约的模型原始输出解码为通过 Canonical 校验的领域对象。
     *
     * @remarks
     * 失败输入的 kind 与授权 toolId 唯一确定 executing 分支时，报告该分支的字段错误；
     * 无法唯一定位时保留完整契约的诊断。诊断细化不修正输入，也不放宽接受范围。
     *
     * @param value - 模型的原始 JSON 输出。
     * @returns 解码并通过校验的领域只读对象。
     * @throws 校验不通过时抛出 `ContractValidationError`。
     */
    decode(value: unknown): Result;
}

/**
 * 为单个授权 Tool 构造 canonical 的 tool_call 决策分支契约。
 */
function buildCanonicalToolBranch(tool: AuthorizedToolContract): Contract<unknown> {
    return contract.object({
        kind: contract.literal("tool_call"),
        action: contract.object({
            actionId: contract.string(),
            toolId: contract.literal(tool.id),
            input: tool.inputContract,
        }),
        memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
    });
}

/**
 * 为单个授权 Tool 派生 wire 的 tool_call 决策分支契约。
 */
function buildWireToolBranch(tool: AuthorizedToolContract): Contract<unknown> {
    return contract.object({
        kind: contract.enum(["tool_call"]),
        action: contract.object({
            actionId: contract.string(),
            toolId: contract.enum([tool.id]),
            input: deriveWireContract(tool.inputContract),
        }),
        memoryPatch: contract.nullable(deriveWireContract(ExecutingWorkingMemoryPatchContract)),
    });
}

/**
 * 校验授权工具列表，按 code-point 排序，并确保工具 ID 非空且无重复。
 */
function validateAndSortAuthorizedTools(
    tools: readonly AuthorizedToolContract[] | undefined,
): readonly AuthorizedToolContract[] {
    if (tools === undefined || tools.length === 0) {
        return [];
    }

    const seenIds = new Set<string>();
    for (const tool of tools) {
        if (typeof tool.id !== "string" || tool.id.trim().length === 0) {
            throw new ModelOutputContractDefinitionError(
                "Tool ID must be a non-empty string",
                ["authorizedTools"],
            );
        }
        if (seenIds.has(tool.id)) {
            throw new ModelOutputContractDefinitionError(
                `Duplicate tool ID "${tool.id}" in authorized tools`,
                ["authorizedTools"],
            );
        }
        seenIds.add(tool.id);
    }

    // 按 Unicode 码点顺序稳定排序
    return [...tools].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 创建请求级模型输出契约包。
 *
 * @remarks
 * 1. 统一 Executing 生命周期依据 Run 模式与任务批准状态动态组合：
 *    - 普通模式暴露全部已授权工具及普通完成、等待、失败、lookup、ask_user；
 *    - Plan 未批准时暴露全部已授权工具及 ask_user、task_proposal、lookup；
 *    - Plan 已批准时暴露全部已授权工具及逐条件完成、等待、失败、lookup、ask_user；
 * 2. Executing 阶段依据授权 Tool 集合动态组合：
 *    - 授权工具按稳定 Tool ID 码点序派生，每个 tool 绑定专属 `tool_call` 分支；
 *    - 空集合或未配置 Tool 时直接省略 `tool_call` 分支；
 * 3. 统一调用 `compileModelOutputSchema` 和 `buildShapeGuide` 生成共用 Schema 与 Prompt Guide；
 * 4. 解码过程确保消除 optional 占位 null、保留合法业务 null，并以原始 Tool Input Contract 进行复验。
 *
 * @param request - 当前请求的目标种类及上下文信息。
 * @returns 对应阶段的不可变契约包实例。
 * @throws 传入无效工具配置或不可移植契约时抛出 `ModelOutputContractDefinitionError`。
 *
 * @example
 * ```ts
 * const bundle = createModelOutputContractBundle({
 *     kind: "executing",
 *     taskPresent: false,
 *     authorizedTools: [{ id: "read_file", inputContract: ReadFileInputContract, isReadOnly: true }],
 * });
 * ```
 */
export function createModelOutputContractBundle<Result extends DecideOutput = AgentDecision>(
    request: ModelOutputRequest,
): ModelOutputContractBundle<Result> {
    let name: string;
    let canonicalContract: Contract<unknown>;
    let wireContract: Contract<unknown>;
    const diagnosticBranches: {
        kind: string;
        toolId?: string;
        envelope: Contract<unknown>;
    }[] = [];

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
            const sortedTools = validateAndSortAuthorizedTools(request.authorizedTools);
            const effectiveTools = sortedTools;

            const nonToolCanonicalBranches: Contract<unknown>[] = planMode
                ? taskPresent
                    ? [
                        ExecutingCompleteAgentDecisionContract,
                        ExecutingWaitAgentDecisionContract,
                        ExecutingFailAgentDecisionContract,
                        ContextLookupRequestContract,
                        ...(request.allowToolDiscovery === false ? [] : [ToolDiscoveryDecisionContract]),
                        AskUserAgentDecisionContract,
                    ]
                    : [
                        AskUserAgentDecisionContract,
                        TaskProposalAgentDecisionContract,
                        ContextLookupRequestContract,
                        ...(request.allowToolDiscovery === false ? [] : [ToolDiscoveryDecisionContract]),
                    ]
                : [
                    NormalCompleteAgentDecisionContract,
                    ExecutingWaitAgentDecisionContract,
                    ExecutingFailAgentDecisionContract,
                    ContextLookupRequestContract,
                    ...(request.allowToolDiscovery === false ? [] : [ToolDiscoveryDecisionContract]),
                    AskUserAgentDecisionContract,
                ];
            if (request.allowThink === true) {
                nonToolCanonicalBranches.push(RequestThinkContract);
            }
            if (goalPlanWritable) {
                nonToolCanonicalBranches.push(GoalPlanUpdateAgentDecisionContract);
            }
            const nonToolWireBranches = nonToolCanonicalBranches.map((c) => deriveWireContract(c));
            nonToolCanonicalBranches.forEach((branch, index) => {
                const kind = (branch as ObjectContract<ObjectShape>).shape.kind as LiteralContract<string>;
                diagnosticBranches.push({
                    kind: kind.value,
                    envelope: contract.object({ result: nonToolWireBranches[index]! }),
                });
            });

            if (effectiveTools.length === 0) {
                // 无授权工具时完全省略 tool_call 分支
                canonicalContract = contract.union(
                    nonToolCanonicalBranches as unknown as readonly [Contract<unknown>, ...Contract<unknown>[]],
                );
                wireContract = contract.object({
                    result: contract.union(
                        nonToolWireBranches as unknown as readonly [Contract<unknown>, ...Contract<unknown>[]],
                    ),
                });
            } else {
                // 动态组合 tool_call 分支与非 tool 分支
                const toolCanonicalBranches = effectiveTools.map(buildCanonicalToolBranch);
                const toolWireBranches = effectiveTools.map(buildWireToolBranch);
                effectiveTools.forEach((tool, index) => {
                    diagnosticBranches.push({
                        kind: "tool_call",
                        toolId: tool.id,
                        envelope: contract.object({ result: toolWireBranches[index]! }),
                    });
                });

                const canonicalBranches = [
                    ...toolCanonicalBranches,
                    ...nonToolCanonicalBranches,
                ];
                canonicalContract = contract.union(
                    canonicalBranches as unknown as readonly [Contract<unknown>, ...Contract<unknown>[]],
                );

                const wireResultBranches = [
                    ...toolWireBranches,
                    ...nonToolWireBranches,
                ];
                const wireResultContract = contract.union(
                    wireResultBranches as unknown as readonly [Contract<unknown>, ...Contract<unknown>[]],
                );
                wireContract = contract.object({
                    result: wireResultContract,
                });
            }
            break;
        }
        case "checkpoint":
            name = "context_checkpoint_result";
            canonicalContract = ModelContextCheckpointResultContract;
            wireContract = deriveWireEnvelopeContract(ModelContextCheckpointResultContract);
            break;
    }

    const jsonSchema = compileModelOutputSchema(wireContract);
    const shapeGuide = buildShapeGuide(jsonSchema);

    return {
        name,
        wireContract,
        canonicalContract: canonicalContract as Contract<Result>,
        jsonSchema,
        shapeGuide,
        decode(value: unknown): Result {
            const wireParsed = safeParse(wireContract, value);
            if (!wireParsed.success) {
                if (isObject(value) && isObject(value.result)) {
                    const result = value.result;
                    const candidates = diagnosticBranches.filter((branch) =>
                        branch.kind === result.kind
                        && (branch.kind !== "tool_call"
                            || (isObject(result.action) && branch.toolId === result.action.toolId)),
                    );
                    if (candidates.length === 1) {
                        const diagnostic = safeParse(candidates[0]!.envelope, value);
                        if (!diagnostic.success) {
                            throw new ContractValidationError(diagnostic.issues, diagnostic.truncated);
                        }
                    }
                }
                throw new ContractValidationError(wireParsed.issues, wireParsed.truncated);
            }
            const decoded = decodeWireResult(wireParsed.data, canonicalContract);
            if (isRequestThink(decoded) && decoded.goal.trim().length === 0) {
                throw new Error("request_think.goal must contain non-whitespace text");
            }
            return decoded as Result;
        },
    };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestThink(value: unknown): value is Extract<DecideOutput, { readonly kind: "request_think" }> {
    return typeof value === "object"
        && value !== null
        && !Array.isArray(value)
        && (value as { readonly kind?: unknown }).kind === "request_think";
}
