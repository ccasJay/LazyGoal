import { ContractValidationError, type JsonSchema202012 } from "../../../contracts/src/index";
import type { ModelContractDecodeOptions } from "./decode-options";
import type { AskUserAgentDecision } from "./schema-types";

/**
 * 原生 Function Calling 工具声明契约。
 *
 * @remarks
 * 代表供大模型单步调用的工具（含业务工具与阶段系统函数），
 * 包含唯一标识、英文语义说明、严格符合厂商便携子集的参数 JSON Schema，以及参数反序列化器。
 *
 * @example
 * ```ts
 * const declaration: SystemToolDeclaration<AgentDecision> = {
 *     id: "system_wait_for_input",
 *     description: "Pause execution and wait for user input.",
 *     parametersSchema: schema,
 *     decode: (raw) => ({ kind: "wait", reason: "Need input" }),
 * };
 * ```
 */
export interface SystemToolDeclaration<TResult = unknown> {
    /** 工具的唯一函数标识。 */
    readonly id: string;
    /** 面向大模型的工具功能描述。 */
    readonly description: string;
    /** 严格符合 OpenAI/Gemini 约束的 JSON Schema。 */
    readonly parametersSchema: JsonSchema202012;
    /**
     * 将模型返回的原始参数校验并解码为强类型领域对象。
     *
     * @param rawArguments - 已经 JSON.parse 的参数对象。
     * @param options - 可选的未知字段剥离诊断观察参数；不改变解码结果。
     * @returns 解码并通过校验的领域对象。
     * @throws {@link ContractValidationError} 参数不符合契约时抛出。
     */
    readonly decode: (rawArguments: unknown, options?: ModelContractDecodeOptions) => TResult;
}

/**
 * 可供执行模式按授权复用的 AskUser 系统工具声明。
 *
 * @remarks
 * 只约束模型可调用的工具身份和解码结果；问题等待、用户回答与恢复继续由
 * 现有 `ask_user` 交互流程负责。持有此声明不授予模式调用权限。
 *
 * @example
 * ```ts
 * const tool: AskUserTool = createBoundSystemToolDeclaration(SystemAskUserSpec, modelOutputBindings.systemTools.askUser);
 * ```
 */
export interface AskUserTool extends SystemToolDeclaration<AskUserAgentDecision> {
    /** 与现有问答交互对应的唯一工具标识。 */
    readonly id: "ask_user";
}

/**
 * 解码模型返回的工具调用。
 *
 * @param declarations - 当前阶段允许的工具声明集合。
 * @param toolId - 模型请求调用的工具名称。
 * @param rawArguments - 模型传递的原始入参对象。
 * @param options - 可选的未知字段剥离诊断观察参数；不改变解码结果。
 * @returns 校验并通过类型转换的领域结果。
 * @throws {@link ContractValidationError} 参数不符合工具契约时抛出。
 * @throws 尝试调用未声明或未授权的工具时抛出异常。
 *
 * @example
 * ```ts
 * const decision = decodePhaseToolCall(executingTools, "bash", { command: "ls" });
 * ```
 */
export function decodePhaseToolCall<TResult>(
    declarations: readonly SystemToolDeclaration<TResult>[],
    toolId: string,
    rawArguments: unknown,
    options?: ModelContractDecodeOptions,
): TResult {
    const decl = declarations.find(d => d.id === toolId);
    if (decl === undefined) {
        throw new ContractValidationError(
            [
                {
                    code: "extra_field",
                    path: [toolId],
                    message: `Unauthorized or unknown tool call: "${toolId}"`,
                },
            ],
            false,
        );
    }
    return decl.decode(rawArguments, options);
}
