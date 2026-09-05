import { compileJsonSchema, type JsonSchema202012 } from "../json-schema";
import { safeParse } from "../parser";
import { ContractValidationError } from "../errors";
import type { Contract } from "../types";
import {
    type AgentDecision,
    GatheringPreparationResultContract,
    ModelContextCheckpointResultContract,
    NonToolExecutingDecisionContract,
    OrdinaryExecutingDecisionContract,
    PlanningPreparationResultContract,
    type PreparationResult,
} from "./canonical";
import { decodeWireResult, deriveWireEnvelopeContract } from "./wire";

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
 * 创建请求级模型输出契约包。
 *
 * @param request - 当前请求的目标种类及上下文信息。
 * @returns 对应阶段的不可变契约包实例。
 *
 * @example
 * ```ts
 * const bundle = createModelOutputContractBundle({ kind: "gathering" });
 * console.log(bundle.name); // "gathering_preparation_result"
 * ```
 */
export function createModelOutputContractBundle(
    request: ModelOutputRequest,
): ModelOutputContractBundle<PreparationResult | AgentDecision> {
    let name: string;
    let canonicalContract: Contract<PreparationResult | AgentDecision>;

    switch (request.kind) {
        case "gathering":
            name = "gathering_preparation_result";
            canonicalContract = GatheringPreparationResultContract as unknown as Contract<PreparationResult | AgentDecision>;
            break;
        case "planning":
            name = "planning_preparation_result";
            canonicalContract = PlanningPreparationResultContract as unknown as Contract<PreparationResult | AgentDecision>;
            break;
        case "executing":
            name = "executing_agent_decision";
            canonicalContract = OrdinaryExecutingDecisionContract as unknown as Contract<PreparationResult | AgentDecision>;
            if (request.authorizedTools === undefined || request.authorizedTools.length === 0) {
                canonicalContract = NonToolExecutingDecisionContract as unknown as Contract<PreparationResult | AgentDecision>;
            } else {
                canonicalContract = NonToolExecutingDecisionContract as unknown as Contract<PreparationResult | AgentDecision>;
            }
            break;
        case "checkpoint":
            name = "context_checkpoint_result";
            canonicalContract = ModelContextCheckpointResultContract as unknown as Contract<PreparationResult | AgentDecision>;
            break;
    }

    const wireContract = deriveWireEnvelopeContract(canonicalContract);
    const fullSchema = compileJsonSchema(wireContract);
    const { $schema, ...jsonSchema } = fullSchema as JsonSchema202012 & { $schema?: string };
    const shapeGuide = `Respond with a JSON object conforming to the following schema:
${JSON.stringify(jsonSchema)}`;

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
