import { contract } from "../contract";
import { safeParse } from "../parser";
import { ContractValidationError } from "../errors";
import type { JsonSchema202012 } from "../json-schema";
import type { Contract, ObjectContract, ObjectShape } from "../types";
import {
    type AgentDecision,
    type AskUserAgentDecision,
    type CompletionEvidence,
    CompletionEvidenceContract,
    ContextLookupFiltersContract,
    ContextLookupNeedContract,
    ExecutingCompleteAgentDecisionContract,
    ExecutingFailAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingWorkingMemoryPatchContract,
    GoalPlanPatchOperationContract,
    type GoalPlanPatchOperation,
    GoalTaskContract,
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
export interface AskUserTool extends SystemToolDeclaration<AskUserAgentDecision> {
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
 */
function buildDeclaration<TArgs, TResult, TId extends string>(
    id: TId,
    description: string,
    inputContract: ObjectContract<ObjectShape>,
    transform: (validatedArgs: TArgs) => TResult,
): SystemToolDeclaration<TResult> & { readonly id: TId } {
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

/** 统一执行流提交任务提案工具参数契约。 */
export const SystemProposeTaskPlanInputContract = contract.object({
    task: GoalTaskContract,
    approvalRequest: contract.string(),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** 统一执行流上下文检查点工具参数契约。 */
export const SystemContextCheckpointInputContract = contract.object({
    checkpointSummary: contract.optional(contract.string()),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** 结构化提问工具参数契约。 */
export const SystemAskUserInputContract = contract.object({
    questions: contract.array(AskUserQuestionInputContract, { minItems: 1, maxItems: 3 }),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

/** Plan Mode GoalPlan 增量更新工具参数契约。 */
export const SystemUpdateGoalPlanInputContract = contract.object({
    baseRevision: contract.integer({ minimum: 0 }),
    operations: contract.array(GoalPlanPatchOperationContract),
    memoryPatch: contract.optional(ExecutingWorkingMemoryPatchContract),
});

// =========================================================================
// 2. 独立系统函数声明实例
// =========================================================================

export const SystemCompleteTaskDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_complete_task",
    "Declare completion only after every approved criterion is satisfied. Provide a summary and committed Tool/Observation evidence; partial progress or unverified results are not completion.",
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
    "Pause when external intervention or an authorization change is required and no useful authorized work can proceed. State the blocker and what must change to resume. This does not schedule polling or wakeups; use ask_user for a concrete question.",
    SystemWaitForInputInputContract,
    (args: { reason: string; memoryPatch?: unknown }): AgentDecision => ({
        kind: "wait",
        reason: args.reason,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemFailGoalDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_fail_goal",
    "Declare failure only when observed evidence establishes that the task cannot be completed and no reasonable recovery path remains. A single tool failure, missing information or a temporary dependency is insufficient.",
    SystemFailGoalInputContract,
    (args: { error: string; memoryPatch?: unknown }): AgentDecision => ({
        kind: "fail",
        error: args.error,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemContextLookupDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_context_lookup",
    "Recover necessary historical execution, user decisions or rationale from trajectory or conversation records. Results do not establish current external state; use authorized tools for that. Filters are optional; omit sequenceRange unless targeting known event sequences.",
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
//TODO: 后续模式接入 AskUserTool 时按模式授权暴露，复用现有 ask_user 等待与回答流程。
export const SystemAskUserDeclaration: AskUserTool = buildDeclaration(
    "ask_user",
    "Ask 1 to 3 focused structured questions when information must come from the user and materially affects scope, correctness or authorization. Do not ask for routine confirmation or facts available through tools. Users can choose options or provide free-form Other text.",
    SystemAskUserInputContract,
    (args: { questions: any; memoryPatch?: unknown }): AskUserAgentDecision => ({
        kind: "ask_user",
        questions: args.questions,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemProposeTaskPlanDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_propose_task_plan",
    "Before task approval, propose the goal task objective and verifiable completion criteria for user approval once its scope is clear; do not add routine confirmation questions. Note: acceptance is optional; only specify acceptance for criteria verifiable by an authorized execution tool (e.g. bash, read_file). NEVER use system functions (like system_complete_task) as expectToolId. For analysis or summary criteria, omit acceptance.",
    SystemProposeTaskPlanInputContract,
    (args: { task: any; approvalRequest: string; memoryPatch?: unknown }): AgentDecision => ({
        kind: "task_proposal",
        task: args.task,
        approvalRequest: args.approvalRequest,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemContextCheckpointDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_context_checkpoint",
    "When checkpointRequired is true, make this the only call, ahead of all ordinary actions and system decisions. Preserve supported durable memory updates; Runtime owns checkpoint metadata.",
    SystemContextCheckpointInputContract,
    (args: { checkpointSummary?: string; memoryPatch?: unknown }): AgentDecision => ({
        kind: "context_checkpoint",
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

/**
 * Plan Mode GoalPlan 更新工具声明。
 *
 * @remarks
 * 工具只解码模型提出的结构化 Patch；Runtime 仍负责检查当前模式、revision、Todo
 * ID、状态转换和原子持久化，工具本身不授予业务 Tool 权限。
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
    "system_update_goal_plan",
    "Update the GoalPlan only in Plan Mode using an atomic patch with the current revision. Runtime allocates Todo IDs and validates all transitions. Plan updates do not replace execution or verification.",
    SystemUpdateGoalPlanInputContract,
    (args: { baseRevision: number; operations: GoalPlanPatchOperation[]; memoryPatch?: unknown }): AgentDecision => ({
        kind: "goal_plan_update",
        baseRevision: args.baseRevision,
        operations: args.operations,
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
 * @param planMode - 是否处于后端控制的 Plan Mode；为 true 时额外暴露 GoalPlan 更新工具。
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
    planMode = false,
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
            ...(planMode ? [SystemUpdateGoalPlanDeclaration] : []),
        ];
    }

    return [
        ...createExecutingToolDeclarations(authorizedTools),
        ...(planMode ? [SystemUpdateGoalPlanDeclaration] : []),
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
