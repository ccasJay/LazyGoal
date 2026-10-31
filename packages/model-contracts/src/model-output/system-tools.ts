import {
    contract,
    safeParse,
    ContractValidationError,
    type Contract,
    type InferContract,
    type JsonSchema202012,
    type ObjectContract,
    type ObjectShape,
} from "../../../contracts/src/index";
import {
    type AgentDecision,
    type DecideOutput,
    type RequestThink,
    type AskUserAgentDecision,
    type CompletionEvidence,
    type RunPlanRouteCandidate,
    type RunPlanRouteUpdateAgentDecision,
    CompletionEvidenceContract,
    ContextLookupFiltersContract,
    ContextLookupNeedContract,
    ExecutingFailAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingWorkingMemoryPatchContract,
    GoalPlanPatchOperationContract,
    type GoalPlanPatchOperation,
    GoalTaskContract,
    RunPlanRouteCandidateContract,
    RunPlanRouteUpdateAgentDecisionContract,
    AskUserQuestionInputContract,
} from "./canonical";
import { generateBusinessActionId } from "./action-id";
import { ModelOutputContractDefinitionError } from "./errors";
import { CompletionReviewResultContract, type CompletionReviewResult } from "./completion-review";
import type { ModelContractDecodeOptions } from "./decode-options";
import { compileModelOutputSchema } from "./provider-schema";
import { deriveWireContract } from "./wire";
import type { AuthorizedToolContract } from "./factory";
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
    type RunStageToolContext,
    type SystemToolSpec,
} from "./system-tool-specs";
import type { AgentDecision as NativeAgentDecision, AskUserAgentDecision as NativeAskUserAgentDecision, RequestThink as NativeRequestThink } from "./schema-types";

export type { RunStageToolContext } from "./system-tool-specs";

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
    /** 严格符合 OpenAI/Gemini 约束的参数 JSON Schema。 */
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
 * const tool: AskUserTool = SystemAskUserDeclaration;
 * ```
 */
export interface AskUserTool extends SystemToolDeclaration<NativeAskUserAgentDecision> {
    /** 与现有问答交互对应的唯一工具标识。 */
    readonly id: "ask_user";
}

/**
 * 递归消除 Wire 参数中的占位 null 并保留合法 null。
 */
function decodeArgumentsNode(
    canonicalNode: unknown,
    value: unknown,
): unknown {
    if (typeof canonicalNode !== "object" || canonicalNode === null) {
        return value;
    }

    const node = canonicalNode as {
        kind?: string;
        shape?: ObjectShape;
        inner?: unknown;
        items?: unknown;
        discriminator?: string;
        branches?: readonly { shape?: ObjectShape }[];
    };

    if (node.kind === "array" && Array.isArray(value)) {
        return value.map((entry) => decodeArgumentsNode(node.items, entry));
    }

    if (
        node.kind === "discriminatedUnion"
        && typeof node.discriminator === "string"
        && typeof value === "object"
        && value !== null
        && !Array.isArray(value)
    ) {
        const discriminatorValue = (value as Record<string, unknown>)[node.discriminator];
        const branch = node.branches?.find((candidate) => {
            const discriminator = candidate.shape?.[node.discriminator!];
            return typeof discriminator === "object"
                && discriminator !== null
                && (discriminator as { kind?: string }).kind === "literal"
                && (discriminator as { value?: unknown }).value === discriminatorValue;
        });
        return branch === undefined
            ? value
            : decodeArgumentsNode({ kind: "object", shape: branch.shape }, value);
    }

    if (node.kind === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) {
        const decoded: Record<string, unknown> = {};
        const valObj = value as Record<string, unknown>;
        const shape = node.shape ?? {};

        for (const [key, prop] of Object.entries(shape)) {
            const propNode = prop as { kind?: string; inner?: unknown };
            if (propNode.kind === "optional") {
                if (key in valObj) {
                    const propVal = valObj[key];
                    if (propVal === null) {
                        continue;
                    }
                    if (propVal !== undefined) {
                        decoded[key] = decodeArgumentsNode(propNode.inner, propVal);
                    }
                }
            } else if (key in valObj) {
                decoded[key] = decodeArgumentsNode(prop, valObj[key]);
            }
        }

        for (const key of Object.keys(valObj)) {
            if (!(key in shape)) {
                decoded[key] = valObj[key];
            }
        }
        return decoded;
    }

    return value;
}

/**
 * 为任意 Object Contract 构建标准 Tool 声明。
 *
 * @remarks
 * 工具身份、说明和解码后转换来自共享规范；本路径仍使用 AST 作为字段来源，
 * 生成绑定路径复用同一规范，避免两条路径维护不同描述。
 */
function buildDeclaration<TArgs, TResult, TId extends string>(
    spec: SystemToolSpec<TArgs, TResult, TId>,
    inputContract: ObjectContract<ObjectShape>,
): SystemToolDeclaration<TResult> & { readonly id: TId } {
    const wireContract = deriveWireContract(inputContract);
    const parametersSchema = compileModelOutputSchema(wireContract);

    return {
        id: spec.id,
        description: spec.description,
        parametersSchema,
        decode: (rawArguments: unknown, _options?: ModelContractDecodeOptions): TResult => {
            const decodedArgs = decodeArgumentsNode(inputContract, rawArguments);
            const parsed = safeParse(inputContract, decodedArgs);
            if (!parsed.success) {
                throw new ContractValidationError(parsed.issues, parsed.truncated);
            }
            return spec.build(parsed.data as TArgs);
        },
    };
}

// =========================================================================
// 1. 系统函数输入契约定义
// =========================================================================

/** Executing 阶段任务完成工具参数契约。 */
export const SystemCompleteTaskInputContract = contract.object({
    summary: contract.string(),
    completionEvidence: contract.array(CompletionEvidenceContract),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** 普通 Run 完成工具参数契约。 */
export const SystemCompleteRunInputContract = contract.object({
    summary: contract.string(),
    evidenceSequences: contract.array(contract.integer({ minimum: 0 })),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** Executing 阶段挂起等待工具参数契约。 */
export const SystemWaitForInputInputContract = contract.object({
    reason: contract.string(),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** Executing 阶段任务失败工具参数契约。 */
export const SystemFailGoalInputContract = contract.object({
    error: contract.string(),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** Context Lookup 各操作使用互斥字段的参数契约。 */
const ContextLookupOperationInputContract = contract.discriminatedUnion("operation", [
    contract.object({
        operation: contract.literal("history_search"),
        need: ContextLookupNeedContract,
        question: contract.string(),
        filters: contract.optional(ContextLookupFiltersContract),
    }),
    contract.object({
        operation: contract.literal("directory_browse"),
        cursor: contract.optional(contract.string()),
        limit: contract.optional(contract.integer({ minimum: 1, maximum: 50 })),
        category: contract.optional(contract.string()),
    }),
    contract.object({
        operation: contract.literal("directory_search"),
        query: contract.string(),
        cursor: contract.optional(contract.string()),
        limit: contract.optional(contract.integer({ minimum: 1, maximum: 50 })),
        category: contract.optional(contract.string()),
    }),
    contract.object({
        operation: contract.literal("source_expand"),
        sourceRef: contract.string(),
        offset: contract.optional(contract.integer({ minimum: 0 })),
        limit: contract.optional(contract.integer({ minimum: 1 })),
    }),
]);
type ContextLookupOperationInput = InferContract<typeof ContextLookupOperationInputContract>;

/** 历史上下文检索工具参数契约；每次调用只能选择一种操作及其字段。 */
export const SystemContextLookupInputContract = contract.object({
    request: ContextLookupOperationInputContract,
});

/** 统一执行流提交任务提案工具参数契约。 */
export const SystemProposeTaskPlanInputContract = contract.object({
    task: GoalTaskContract,
    planRoute: RunPlanRouteCandidateContract,
    approvalRequest: contract.string(),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** 统一执行流上下文检查点工具参数契约。 */
export const SystemContextCheckpointInputContract = contract.object({
    checkpointSummary: contract.optional(contract.string()),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** Decide 阶段请求 Think 的控制参数契约。 */
export const SystemRequestThinkInputContract = contract.object({
    goal: contract.string(),
});

/** 结构化提问工具参数契约。 */
export const SystemAskUserInputContract = contract.object({
    questions: contract.array(AskUserQuestionInputContract, { minItems: 1, maxItems: 3 }),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** 获授权模式的 GoalPlan 增量更新工具参数契约。 */
export const SystemUpdateGoalPlanInputContract = contract.object({
    baseRevision: contract.integer({ minimum: 0 }),
    operations: contract.array(GoalPlanPatchOperationContract),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** 阶段更新工具参数契约。 */
export const SystemStartRunStageInputContract = contract.object({
    target: contract.string(),
    acceptanceCriteria: contract.array(contract.string(), { minItems: 1 }),
});

/** 当前阶段修订的模型参数；身份和版本来自请求绑定。 */
export const SystemReviseRunStageInputContract = contract.object({
    target: contract.string(),
    acceptanceCriteria: contract.array(contract.string(), { minItems: 1 }),
    reason: contract.string(),
});

/** 阶段完成候选工具参数契约。 */
export const SystemCompleteRunStageInputContract = contract.object({
    summary: contract.string(),
    evidenceSequences: contract.array(contract.integer({ minimum: 0 })),
});

/** Plan Run 获批后的完整路线修订输入契约。 */
export const SystemUpdatePlanRouteInputContract = contract.object({
    baseRevision: contract.integer({ minimum: 1 }),
    reason: contract.string(),
    route: RunPlanRouteCandidateContract,
    approvalRequest: contract.optional(contract.string()),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

// =========================================================================
// 2. 独立系统函数声明实例
// =========================================================================

/** 完成审查专用声明；不授予业务工具或 Runtime 状态转换能力。 */
export const SystemCompletionReviewDeclaration: SystemToolDeclaration<CompletionReviewResult> = buildDeclaration(
    SystemCompletionReviewSpec,
    contract.object({ result: CompletionReviewResultContract }),
);

export const SystemCompleteTaskDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemCompleteTaskSpec,
    SystemCompleteTaskInputContract,
);

export const SystemCompleteRunDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemCompleteRunSpec,
    SystemCompleteRunInputContract,
);

export const SystemWaitForInputDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemWaitForInputSpec,
    SystemWaitForInputInputContract,
);

export const SystemFailGoalDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemFailGoalSpec,
    SystemFailGoalInputContract,
);

export const SystemContextLookupDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemContextLookupSpec,
    SystemContextLookupInputContract,
);

/**
 * 工具目录查询输入契约。
 *
 * @example
 * ```ts
 * const input: SystemFindToolsInput = { query: "inspect files" };
 * ```
 */
export const SystemFindToolsInputContract = contract.object({
    query: contract.string(),
});

/** 工具目录查询输入。 */
export type SystemFindToolsInput = InferContract<typeof SystemFindToolsInputContract>;

/**
 * 工具目录发现系统声明。
 *
 * @remarks
 * 只将搜索请求解码为 Runtime 控制决策；候选搜索和执行权限校验由 Runtime 负责。
 *
 * @example
 * ```ts
 * const declaration = SystemFindToolsDeclaration;
 * ```
 */
export const SystemFindToolsDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemFindToolsSpec,
    SystemFindToolsInputContract,
);

/**
 * 结构化提问工具声明。
 *
 * @remarks
 * 供 Agent 提出 1 到 3 个结构化问题，供用户明确单选、多选或填写 Other 答案。
 *
 * @example
 * ```ts
 * const declaration = SystemAskUserDeclaration;
 * ```
 */
//TODO: 后续模式接入 AskUserTool 时按模式授权暴露，复用现有 ask_user 等待与回答流程。
export const SystemAskUserDeclaration: AskUserTool = buildDeclaration(
    SystemAskUserSpec,
    SystemAskUserInputContract,
);

export const SystemProposeTaskPlanDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemProposeTaskPlanSpec,
    SystemProposeTaskPlanInputContract,
);

/**
 * 获批 Plan Run 的完整路线修订工具。
 *
 * @remarks
 * Runtime 会校验 revision、保留已接受阶段并分配新增阶段身份；提供 approvalRequest 时，
 * 修订在用户确认前只以待处理交互保存，不会改变当前路线或执行状态。
 *
 * @example
 * ```ts
 * const decision = SystemUpdatePlanRouteDeclaration.decode({
 *   baseRevision: 1,
 *   reason: "新证据表明可以复用现有验证步骤",
 *   route: { stages: [{ target: "修复", acceptanceCriteria: ["回归通过"] }] },
 * });
 * ```
 */
export const SystemUpdatePlanRouteDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemUpdatePlanRouteSpec,
    SystemUpdatePlanRouteInputContract,
);

export const SystemContextCheckpointDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemContextCheckpointSpec,
    SystemContextCheckpointInputContract,
);

/**
 * GoalPlan 更新工具声明。
 *
 * @remarks
 * 工具只解码模型提出的结构化 Patch；Runtime 仍负责检查模式能力、revision、Todo
 * ID、证据、状态转换和原子持久化，工具本身不授予业务 Tool 权限。
 *
 * @example
 * ```ts
 * const decision = SystemUpdateGoalPlanDeclaration.decode({
 *     baseRevision: 0,
 *     operations: [{ type: "add", content: "检查实现" }],
 * });
 * ```
 */
export const SystemUpdateGoalPlanDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemUpdateGoalPlanSpec,
    SystemUpdateGoalPlanInputContract,
);

export const SystemStartRunStageDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    SystemStartRunStageSpec,
    SystemStartRunStageInputContract,
);

/**
 * 按请求快照生成唯一合法的阶段工具集合。
 * @param context - 当前阶段和获批路线；闭包捕获标量及条件副本。
 * @returns 无执行中阶段时提供开始；执行中提供修订、完成；路线结束时不提供开始。
 * @example `const tools = createRunStageToolDeclarations({});`
 */
export function createRunStageToolDeclarations(context: RunStageToolContext): readonly SystemToolDeclaration<AgentDecision>[] {
    const current = context.currentStage;
    if (current?.status === "executing") {
        return [
            buildDeclaration(
                SystemReviseRunStageSpec(current.stageId, current.revision),
                SystemReviseRunStageInputContract,
            ),
            buildDeclaration(
                SystemCompleteRunStageSpec(current.stageId),
                SystemCompleteRunStageInputContract,
            ),
        ];
    }
    if (context.planRoute !== undefined) {
        const next = context.planRoute.stages[context.planRoute.nextStageIndex];
        if (next?.status !== "pending") return [];
        return [buildDeclaration(
            SystemStartNextRunStageSpec(next.target, next.acceptanceCriteria),
            contract.object({}),
        )];
    }
    return [SystemStartRunStageDeclaration];
}

/**
 * Decide 阶段的 Think 控制声明。
 *
 * @remarks
 * 该声明只表达一个明确的推演目标，不执行 Runtime 业务工具，也不修改 Goal；
 * Runtime 阶段循环负责调用 Think Adapter 并提交 Think 输出。
 *
 * @example
 * ```ts
 * const request = SystemRequestThinkDeclaration.decode({
 *     goal: "比较两种恢复方案的状态一致性风险",
 * });
 * ```
 */
export const SystemRequestThinkDeclaration: SystemToolDeclaration<RequestThink> = buildDeclaration(
    SystemRequestThinkSpec,
    SystemRequestThinkInputContract,
);

// =========================================================================
// 3. 业务工具适配与各阶段工具包构造
// =========================================================================

/**
 * 将业务授权工具包装为 Executing 阶段原生 Tool 声明。
 */
export function createExecutingBusinessToolDeclaration(
    tool: AuthorizedToolContract,
    description = `Execute authorized tool ${tool.id}`,
): SystemToolDeclaration<AgentDecision> {
    if (tool.inputContract.kind !== "object") {
        throw new ModelOutputContractDefinitionError(
            `Authorized tool ${tool.id} inputContract must be an ObjectContract`,
            [tool.id],
        );
    }
    const spec: SystemToolSpec<unknown, AgentDecision, string> = {
        id: tool.id,
        description,
        build: (input) => ({
            kind: "tool_call",
            action: {
                actionId: generateBusinessActionId(tool.id),
                toolId: tool.id,
                input: input as any,
            },
        }),
    };
    return buildDeclaration(
        spec,
        tool.inputContract as ObjectContract<ObjectShape>,
    );
}

/**
 * 构造 Executing 阶段完整的工具声明集合。
 *
 * @param authorizedTools - 当前 Goal 授权的业务工具列表。
 * @param stageContext - 本次请求的阶段和获批路线快照，用于生成与解码当前合法的阶段操作。
 * @returns 包含业务工具、工具发现与系统执行决策的完整声明列表。
 *
 * @example
 * ```ts
 * const tools = createExecutingToolDeclarations(goal.profile.tools);
 * ```
 */
export function createExecutingToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    stageContext: RunStageToolContext = {},
): readonly SystemToolDeclaration<AgentDecision>[] {
    const businessTools = authorizedTools.map(t => createExecutingBusinessToolDeclaration(t));
    return [
        ...businessTools,
        SystemCompleteTaskDeclaration,
        SystemWaitForInputDeclaration,
        SystemFailGoalDeclaration,
        SystemContextLookupDeclaration as SystemToolDeclaration<AgentDecision>,
        SystemFindToolsDeclaration,
        SystemAskUserDeclaration,
        ...createRunStageToolDeclarations(stageContext),
    ];
}

/**
 * 构造统一执行流中的系统与业务工具声明集合。
 *
 * @remarks
 * 按 Run 模式与任务审批状态派生决策工具：
 * - 普通模式：暴露传入业务工具与普通完成、wait、fail、lookup、find_tools、ask_user；
 * - Plan 未批准：暴露传入业务工具与 ask_user、task_proposal、lookup、find_tools；
 * - Plan 已批准：暴露传入业务工具与逐条件完成、wait、fail、lookup、find_tools、ask_user；
 * - 任一状态是否额外暴露 GoalPlan 更新工具，由 `goalPlanWritable` 单独决定。
 *
 * @param authorizedTools - 当前 Goal 授权的业务工具列表。
 * @param taskPresent - 是否已批准固定 GoalTask。
 * @param planMode - 是否处于当前 Run 的 Plan Mode 任务提案生命周期。
 * @param goalPlanWritable - 当前 Run 模式是否获授权更新 GoalPlan。
 * @param allowThink - 是否向 Decide 暴露独立的 `request_think` 控制声明。
 * @param stageContext - 固定本次请求可操作的阶段，Plan 未批准时不提供阶段工具。
 * @returns 对应状态下的工具声明列表。
 *
 * @example
 * ```ts
 * const tools = createUnifiedToolDeclarations(tools, true, false, true);
 * ```
 */
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
    planMode?: boolean,
    goalPlanWritable?: boolean,
    allowThink?: false,
    stageContext?: RunStageToolContext,
): readonly SystemToolDeclaration<AgentDecision>[];
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
    planMode: boolean,
    goalPlanWritable: boolean,
    allowThink: true,
    stageContext?: RunStageToolContext,
): readonly SystemToolDeclaration<DecideOutput>[];
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
    planMode: boolean,
    goalPlanWritable: boolean,
    allowThink: boolean,
    stageContext?: RunStageToolContext,
): readonly SystemToolDeclaration<DecideOutput>[];
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
    planMode = false,
    goalPlanWritable = planMode,
    allowThink = false,
    stageContext: RunStageToolContext = {},
): readonly SystemToolDeclaration<DecideOutput>[] {
    const thinkDeclaration = allowThink ? [SystemRequestThinkDeclaration] : [];
    if (!planMode) {
        const businessTools = authorizedTools.map(t => createExecutingBusinessToolDeclaration(t));
        return [
            ...businessTools,
            SystemCompleteRunDeclaration,
            SystemWaitForInputDeclaration,
            SystemFailGoalDeclaration,
            SystemContextLookupDeclaration as SystemToolDeclaration<AgentDecision>,
            SystemFindToolsDeclaration,
            SystemAskUserDeclaration,
            ...createRunStageToolDeclarations(stageContext),
            ...(goalPlanWritable ? [SystemUpdateGoalPlanDeclaration] : []),
            ...thinkDeclaration,
        ];
    }

    if (!taskPresent) {
        const businessTools = authorizedTools.map(t => createExecutingBusinessToolDeclaration(t));
        return [
            ...businessTools,
            SystemAskUserDeclaration,
            SystemProposeTaskPlanDeclaration as SystemToolDeclaration<AgentDecision>,
            SystemContextLookupDeclaration as SystemToolDeclaration<AgentDecision>,
            SystemFindToolsDeclaration,
            ...(goalPlanWritable ? [SystemUpdateGoalPlanDeclaration] : []),
            ...thinkDeclaration,
        ];
    }

    return [
        ...createExecutingToolDeclarations(authorizedTools, stageContext),
        SystemUpdatePlanRouteDeclaration,
        ...(goalPlanWritable ? [SystemUpdateGoalPlanDeclaration] : []),
        ...thinkDeclaration,
    ];
}

/**
 * 构造上下文检查点工具声明集合。
 */
export function createCheckpointToolDeclarations(): readonly SystemToolDeclaration<AgentDecision>[] {
    return [SystemContextCheckpointDeclaration];
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
