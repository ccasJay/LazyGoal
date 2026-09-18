import { contract } from "../contract";
import { safeParse } from "../parser";
import { ContractValidationError } from "../errors";
import type { JsonSchema202012 } from "../json-schema";
import type { Contract, ObjectContract, ObjectShape } from "../types";
import {
    type AgentDecision,
    type CompletionEvidence,
    CompletionEvidenceContract,
    ContextLookupFiltersContract,
    ContextLookupNeedContract,
    ContextReadyPreparationResultContract,
    ExecutingCompleteAgentDecisionContract,
    ExecutingFailAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingWorkingMemoryPatchContract,
    GoalTaskContract,
    ModelContextCheckpointResultContract,
    type PreparationResult,
    QuestionPreparationResultContract,
    TaskProposalPreparationResultContract,
    WorkingMemoryPatchContract,
    AskUserQuestionInputContract,
} from "./canonical";
import { ModelOutputContractDefinitionError } from "./errors";
import { compileModelOutputSchema } from "./provider-schema";
import { deriveWireContract } from "./wire";
import type { AuthorizedToolContract } from "./factory";

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
     * @returns 解码并通过校验的领域对象。
     * @throws {@link ContractValidationError} 参数不符合契约时抛出。
     */
    readonly decode: (rawArguments: unknown) => TResult;
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

    const node = canonicalNode as { kind?: string; shape?: ObjectShape; inner?: unknown };

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
 */
function buildDeclaration<TArgs, TResult>(
    id: string,
    description: string,
    inputContract: ObjectContract<ObjectShape>,
    transform: (validatedArgs: TArgs) => TResult,
): SystemToolDeclaration<TResult> {
    const wireContract = deriveWireContract(inputContract);
    const parametersSchema = compileModelOutputSchema(wireContract);

    return {
        id,
        description,
        parametersSchema,
        decode: (rawArguments: unknown): TResult => {
            const decodedArgs = decodeArgumentsNode(inputContract, rawArguments);
            const parsed = safeParse(inputContract, decodedArgs);
            if (!parsed.success) {
                throw new ContractValidationError(parsed.issues, parsed.truncated);
            }
            return transform(parsed.data as TArgs);
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

/** 历史上下文检索工具参数契约。 */
export const SystemContextLookupInputContract = contract.object({
    need: ContextLookupNeedContract,
    question: contract.string(),
    filters: contract.optional(ContextLookupFiltersContract),
});

/** Gathering 阶段向用户提问澄清工具参数契约。 */
export const SystemAskClarificationInputContract = contract.object({
    question: contract.string(),
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/** Gathering 阶段上下文就绪工具参数契约。 */
export const SystemContextReadyInputContract = contract.object({
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/** Planning 阶段提交任务提案工具参数契约。 */
export const SystemProposeTaskPlanInputContract = contract.object({
    task: GoalTaskContract,
    approvalRequest: contract.string(),
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/** Context Checkpoint 阶段检查点工具参数契约。 */
export const SystemContextCheckpointInputContract = contract.object({
    checkpointSummary: contract.optional(contract.string()),
    memoryPatch: contract.optional(WorkingMemoryPatchContract),
});

/** 结构化提问工具参数契约。 */
export const SystemAskUserInputContract = contract.object({
    questions: contract.array(AskUserQuestionInputContract, { minItems: 1, maxItems: 3 }),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

// =========================================================================
// 2. 独立系统函数声明实例
// =========================================================================

export const SystemCompleteTaskDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_complete_task",
    "Declare the goal task successfully completed. Provide completion summary, evidence, and optional memory updates.",
    SystemCompleteTaskInputContract,
    (args: { summary: string; completionEvidence: CompletionEvidence[]; memoryPatch?: unknown }): AgentDecision => ({
        kind: "complete",
        summary: args.summary,
        completionEvidence: args.completionEvidence,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemWaitForInputDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_wait_for_input",
    "Pause execution and wait for user input or approval.",
    SystemWaitForInputInputContract,
    (args: { reason: string; memoryPatch?: unknown }): AgentDecision => ({
        kind: "wait",
        reason: args.reason,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemFailGoalDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_fail_goal",
    "Declare that the goal cannot be completed due to an unrecoverable failure.",
    SystemFailGoalInputContract,
    (args: { error: string; memoryPatch?: unknown }): AgentDecision => ({
        kind: "fail",
        error: args.error,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemContextLookupDeclaration: SystemToolDeclaration<AgentDecision | PreparationResult> = buildDeclaration(
    "system_context_lookup",
    "Search historical trajectory context or conversation records for needed evidence. Filters are optional; omit sequenceRange unless targeting specific known event sequences.",
    SystemContextLookupInputContract,
    (args: { need: any; question: string; filters?: any }) => ({
        kind: "context_lookup" as const,
        need: args.need,
        question: args.question,
        ...(args.filters !== undefined ? { filters: args.filters } : {}),
    }),
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
export const SystemAskUserDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "ask_user",
    "Ask the user 1 to 3 structured questions with discrete options. Users can choose options or provide free-form Other text.",
    SystemAskUserInputContract,
    (args: { questions: any; memoryPatch?: unknown }): AgentDecision => ({
        kind: "ask_user",
        questions: args.questions,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemAskClarificationDeclaration: SystemToolDeclaration<PreparationResult> = buildDeclaration(
    "system_ask_clarification",
    "In gathering phase, ask the user a clarification question when the goal or requirement is ambiguous.",
    SystemAskClarificationInputContract,
    (args: { question: string; memoryPatch?: unknown }): PreparationResult => ({
        kind: "question",
        question: args.question,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemContextReadyDeclaration: SystemToolDeclaration<PreparationResult> = buildDeclaration(
    "system_context_ready",
    "In gathering phase, confirm that sufficient context has been gathered to proceed to planning.",
    SystemContextReadyInputContract,
    (args: { memoryPatch?: unknown }): PreparationResult => ({
        kind: "context_ready",
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemProposeTaskPlanDeclaration: SystemToolDeclaration<AgentDecision & PreparationResult> = buildDeclaration(
    "system_propose_task_plan",
    "In planning phase, propose the goal task objective and verifiable completion criteria for user approval. Note: acceptance is optional; only specify acceptance for criteria verifiable by an authorized execution tool (e.g. bash, read_file). NEVER use system functions (like system_complete_task) as expectToolId. For analysis or summary criteria, omit acceptance.",
    SystemProposeTaskPlanInputContract,
    (args: { task: any; approvalRequest: string; memoryPatch?: unknown }): AgentDecision & PreparationResult => ({
        kind: "task_proposal",
        task: args.task,
        approvalRequest: args.approvalRequest,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemContextCheckpointDeclaration: SystemToolDeclaration<PreparationResult> = buildDeclaration(
    "system_context_checkpoint",
    "Save current execution progress and memory patch when model context budget requires a checkpoint.",
    SystemContextCheckpointInputContract,
    (args: { checkpointSummary?: string; memoryPatch?: unknown }): PreparationResult => ({
        kind: "context_checkpoint",
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

// =========================================================================
// 3. 业务工具适配与各阶段工具包构造
// =========================================================================

/**
 * 将业务授权工具包装为 Executing 阶段原生 Tool 声明。
 */
let businessActionCounter = 0;

function generateActionId(toolId: string): string {
    businessActionCounter = (businessActionCounter + 1) % 1_000_000;
    return `action-${toolId}-${Date.now().toString(36)}-${businessActionCounter}`;
}

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
    return buildDeclaration(
        tool.id,
        description,
        tool.inputContract as ObjectContract<ObjectShape>,
        (input): AgentDecision => ({
            kind: "tool_call",
            action: {
                actionId: generateActionId(tool.id),
                toolId: tool.id,
                input: input as any,
            },
        }),
    );
}

/**
 * 将只读业务工具包装为准备阶段的探查 Tool 声明。
 */
export function createProbeBusinessToolDeclaration(
    tool: AuthorizedToolContract,
    description = `Inspect workspace or environment using read-only tool ${tool.id}`,
): SystemToolDeclaration<PreparationResult> {
    if (tool.inputContract.kind !== "object") {
        throw new ModelOutputContractDefinitionError(
            `Probe tool ${tool.id} inputContract must be an ObjectContract`,
            [tool.id],
        );
    }
    return buildDeclaration(
        tool.id,
        description,
        tool.inputContract as ObjectContract<ObjectShape>,
        (input): PreparationResult => ({
            kind: "probe_action",
            action: {
                toolId: tool.id,
                input: input as any,
            },
        }),
    );
}

/**
 * 构造 Executing 阶段完整的工具声明集合。
 *
 * @param authorizedTools - 当前 Goal 授权的业务工具列表。
 * @returns 包含业务工具与系统动作工具（complete/wait/fail/lookup）的完整声明列表。
 *
 * @example
 * ```ts
 * const tools = createExecutingToolDeclarations(goal.profile.tools);
 * ```
 */
export function createExecutingToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
): readonly SystemToolDeclaration<AgentDecision>[] {
    const businessTools = authorizedTools.map(t => createExecutingBusinessToolDeclaration(t));
    return [
        ...businessTools,
        SystemCompleteTaskDeclaration,
        SystemWaitForInputDeclaration,
        SystemFailGoalDeclaration,
        SystemContextLookupDeclaration as SystemToolDeclaration<AgentDecision>,
        SystemAskUserDeclaration,
    ];
}

/**
 * 构造统一执行流中的系统与业务工具声明集合。
 *
 * @remarks
 * 根据是否已批准最终任务进行门控：
 * - 任务未批准（计划期）：只暴露只读业务工具，系统工具仅允许 ask_user、task_proposal 和 context_lookup；
 * - 任务已批准（执行期）：暴露全部授权业务工具，系统工具允许 complete、wait、fail、context_lookup 和 ask_user。
 *
 * @param authorizedTools - 当前 Goal 授权的业务工具列表。
 * @param taskPresent - 是否已批准固定 GoalTask。
 * @returns 对应状态下的工具声明列表。
 *
 * @example
 * ```ts
 * const tools = createUnifiedToolDeclarations(tools, true);
 * ```
 */
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
): readonly SystemToolDeclaration<AgentDecision>[] {
    if (!taskPresent) {
        const readOnlyTools = authorizedTools
            .filter(t => t.isReadOnly === true)
            .map(t => createExecutingBusinessToolDeclaration(t));
        return [
            ...readOnlyTools,
            SystemAskUserDeclaration,
            SystemProposeTaskPlanDeclaration as SystemToolDeclaration<AgentDecision>,
            SystemContextLookupDeclaration as SystemToolDeclaration<AgentDecision>,
        ];
    }

    return createExecutingToolDeclarations(authorizedTools);
}

/**
 * 构造 Gathering 阶段完整的工具声明集合。
 *
 * @param authorizedTools - 当前可用的业务工具（仅筛选 isReadOnly 为 true 的工具）。
 * @returns 包含只读探测工具与系统动作工具（clarification/ready/lookup）的完整声明列表。
 *
 * @example
 * ```ts
 * const tools = createGatheringToolDeclarations(tools);
 * ```
 */
export function createGatheringToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[] = [],
): readonly SystemToolDeclaration<PreparationResult>[] {
    const probeTools = authorizedTools
        .filter(t => t.isReadOnly === true)
        .map(t => createProbeBusinessToolDeclaration(t));
    return [
        ...probeTools,
        SystemAskClarificationDeclaration,
        SystemContextReadyDeclaration,
        SystemContextLookupDeclaration as SystemToolDeclaration<PreparationResult>,
    ];
}

/**
 * 构造 Planning 阶段完整的工具声明集合。
 *
 * @param authorizedTools - 当前可用的业务工具（仅筛选 isReadOnly 为 true 的工具）。
 * @returns 包含只读探测工具与系统动作工具（proposal/lookup）的完整声明列表。
 *
 * @example
 * ```ts
 * const tools = createPlanningToolDeclarations(tools);
 * ```
 */
export function createPlanningToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[] = [],
): readonly SystemToolDeclaration<PreparationResult>[] {
    const probeTools = authorizedTools
        .filter(t => t.isReadOnly === true)
        .map(t => createProbeBusinessToolDeclaration(t));
    return [
        ...probeTools,
        SystemProposeTaskPlanDeclaration,
        SystemContextLookupDeclaration as SystemToolDeclaration<PreparationResult>,
    ];
}

/**
 * 构造 Context Checkpoint 阶段专属的工具声明集合。
 */
export function createCheckpointToolDeclarations(): readonly SystemToolDeclaration<PreparationResult>[] {
    return [SystemContextCheckpointDeclaration];
}

/**
 * 解码模型返回的工具调用。
 *
 * @param declarations - 当前阶段允许的工具声明集合。
 * @param toolId - 模型请求调用的工具名称。
 * @param rawArguments - 模型传递的原始入参对象。
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
    return decl.decode(rawArguments);
}
