import { contract } from "../contract";
import { safeParse } from "../parser";
import { ContractValidationError } from "../errors";
import type { JsonSchema202012 } from "../json-schema";
import type { Contract } from "../types";
import {
    type AgentDecision,
    CompleteAgentDecisionContract,
    ContextLookupRequestContract,
    FailAgentDecisionContract,
    GatheringPreparationResultContract,
    ModelContextCheckpointResultContract,
    NonToolExecutingDecisionContract,
    PlanningPreparationResultContract,
    type PreparationResult,
    WaitAgentDecisionContract,
    WorkingMemoryPatchContract,
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
}

/**
 * 模型输出请求种类定义。
 *
 * @remarks
 * 分别对应上下文收集、规划、执行与检查点阶段。
 */
export type ModelOutputRequest =
    | { readonly kind: "gathering" }
    | { readonly kind: "planning" }
    | {
        readonly kind: "executing";
        readonly authorizedTools?: readonly AuthorizedToolContract[];
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
 * const bundle = createModelOutputContractBundle({ kind: "gathering" });
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
        memoryPatch: contract.optional(WorkingMemoryPatchContract),
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
        memoryPatch: contract.nullable(deriveWireContract(WorkingMemoryPatchContract)),
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
 * 1. Gathering、Planning、Checkpoint 阶段派生固定的 Wire 与 Canonical 契约；
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
 *     authorizedTools: [{ id: "read_file", inputContract: ReadFileInputContract }],
 * });
 * ```
 */
export function createModelOutputContractBundle(
    request: ModelOutputRequest,
): ModelOutputContractBundle<PreparationResult | AgentDecision> {
    let name: string;
    let canonicalContract: Contract<PreparationResult | AgentDecision>;
    let wireContract: Contract<unknown>;

    switch (request.kind) {
        case "gathering":
            name = "gathering_preparation_result";
            canonicalContract = GatheringPreparationResultContract as unknown as Contract<PreparationResult | AgentDecision>;
            wireContract = deriveWireEnvelopeContract(GatheringPreparationResultContract);
            break;
        case "planning":
            name = "planning_preparation_result";
            canonicalContract = PlanningPreparationResultContract as unknown as Contract<PreparationResult | AgentDecision>;
            wireContract = deriveWireEnvelopeContract(PlanningPreparationResultContract);
            break;
        case "executing": {
            name = "executing_agent_decision";
            const sortedTools = validateAndSortAuthorizedTools(request.authorizedTools);

            if (sortedTools.length === 0) {
                // 无授权工具时完全省略 tool_call 分支
                canonicalContract = NonToolExecutingDecisionContract as unknown as Contract<PreparationResult | AgentDecision>;
                wireContract = deriveWireEnvelopeContract(NonToolExecutingDecisionContract);
            } else {
                // 动态组合 tool_call 分支与非 tool 分支
                const toolCanonicalBranches = sortedTools.map(buildCanonicalToolBranch);
                const toolWireBranches = sortedTools.map(buildWireToolBranch);

                const nonToolCanonicalBranches = [
                    CompleteAgentDecisionContract,
                    WaitAgentDecisionContract,
                    FailAgentDecisionContract,
                    ContextLookupRequestContract,
                ];
                const nonToolWireBranches = [
                    deriveWireContract(CompleteAgentDecisionContract),
                    deriveWireContract(WaitAgentDecisionContract),
                    deriveWireContract(FailAgentDecisionContract),
                    deriveWireContract(ContextLookupRequestContract),
                ];

                const canonicalBranches = [
                    ...toolCanonicalBranches,
                    ...nonToolCanonicalBranches,
                ];
                canonicalContract = contract.union(
                    canonicalBranches as unknown as readonly [Contract<unknown>, ...Contract<unknown>[]],
                ) as unknown as Contract<PreparationResult | AgentDecision>;

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
            canonicalContract = ModelContextCheckpointResultContract as unknown as Contract<PreparationResult | AgentDecision>;
            wireContract = deriveWireEnvelopeContract(ModelContextCheckpointResultContract);
            break;
    }

    const jsonSchema = compileModelOutputSchema(wireContract);
    const shapeGuide = buildShapeGuide(jsonSchema);

    return {
        name,
        wireContract,
        canonicalContract,
        jsonSchema,
        shapeGuide,
        decode(value: unknown): PreparationResult | AgentDecision {
            const wireParsed = safeParse(wireContract, value);
            if (!wireParsed.success) {
                throw new ContractValidationError(wireParsed.issues, wireParsed.truncated);
            }
            return decodeWireResult(wireParsed.data, canonicalContract);
        },
    };
}
