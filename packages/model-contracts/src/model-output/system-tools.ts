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
    CompletionEvidenceContract,
    ContextLookupFiltersContract,
    ContextLookupNeedContract,
    ExecutingFailAgentDecisionContract,
    ExecutingWaitAgentDecisionContract,
    ExecutingWorkingMemoryPatchContract,
    GoalPlanPatchOperationContract,
    type GoalPlanPatchOperation,
    GoalTaskContract,
    AskUserQuestionInputContract,
} from "./canonical";
import { ModelOutputContractDefinitionError } from "./errors";
import { CompletionReviewResultContract, validateCompletionReviewResult, type CompletionReviewResult } from "./completion-review";
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

// =========================================================================
// 2. 独立系统函数声明实例
// =========================================================================

/** 完成审查专用声明；不授予业务工具或 Runtime 状态转换能力。 */
export const SystemCompletionReviewDeclaration: SystemToolDeclaration<CompletionReviewResult> = buildDeclaration(
    "system_review_completion",
    "Accept only a complete, supported user-facing deliverable. Otherwise reject with the concrete missing deliverable or evidence and what needs correction. Do not rewrite the answer or execute tools.",
    contract.object({ result: CompletionReviewResultContract }),
    (args: { result: CompletionReviewResult }): CompletionReviewResult => validateCompletionReviewResult(args.result),
);

export const SystemCompleteTaskDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_complete_task",
    "Submit a completion candidate only after every approved criterion is satisfied. summary is the full user-facing answer or deliverable, including requested findings, supporting details and recommendations, not a status recap. Cite committed Tool/Observation evidence; partial progress or unverified results are not completion.",
    SystemCompleteTaskInputContract,
    (args: { summary: string; completionEvidence: CompletionEvidence[]; memoryPatch?: unknown }): AgentDecision => ({
        kind: "complete",
        summary: args.summary,
        completionEvidence: args.completionEvidence,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

export const SystemCompleteRunDeclaration: SystemToolDeclaration<AgentDecision> = buildDeclaration(
    "system_complete_task",
    "Submit a completion candidate for the current Run's user request. summary is the full user-facing answer or deliverable, not a recap that analysis was performed. Include requested findings, supporting details and recommendations; keep simple answers brief. Cite current Run committed Tool/Observation evidence when available; do not cite user answers or historical facts.",
    SystemCompleteRunInputContract,
    (args: { summary: string; evidenceSequences: number[]; memoryPatch?: unknown }): AgentDecision => ({
        kind: "complete",
        summary: args.summary,
        evidenceSequences: args.evidenceSequences,
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
    "system_find_tools",
    "Search the currently authorized tool catalog for tools relevant to the task. This only reveals matching schemas for later decisions; it does not grant permission to execute them.",
    SystemFindToolsInputContract,
    (args: SystemFindToolsInput): AgentDecision => ({
        kind: "tool_discovery",
        query: args.query,
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
    "system_update_goal_plan",
    "Update the GoalPlan only when the current mode authorizes plan writing, using an atomic patch with the current revision. Runtime allocates Todo IDs, validates completion evidence, and checks all transitions. Plan updates do not replace execution or verification.",
    SystemUpdateGoalPlanInputContract,
    (args: { baseRevision: number; operations: GoalPlanPatchOperation[]; memoryPatch?: unknown }): AgentDecision => ({
        kind: "goal_plan_update",
        baseRevision: args.baseRevision,
        operations: args.operations,
        ...(args.memoryPatch !== undefined ? { memoryPatch: args.memoryPatch as any } : {}),
    }),
);

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
    "system_request_think",
    "Request a separate Think stage for one explicit reasoning objective. This does not execute a business tool or change runtime state.",
    SystemRequestThinkInputContract,
    (args: { goal: string }): RequestThink => {
        const goal = args.goal.trim();
        if (goal.length === 0) {
            throw new Error("request_think.goal must contain non-whitespace text");
        }
        return { kind: "request_think", goal };
    },
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
 * @returns 包含业务工具、工具发现与系统执行决策的完整声明列表。
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
        SystemFindToolsDeclaration,
        SystemAskUserDeclaration,
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
): readonly SystemToolDeclaration<AgentDecision>[];
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
    planMode: boolean,
    goalPlanWritable: boolean,
    allowThink: true,
): readonly SystemToolDeclaration<DecideOutput>[];
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
    planMode: boolean,
    goalPlanWritable: boolean,
    allowThink: boolean,
): readonly SystemToolDeclaration<DecideOutput>[];
export function createUnifiedToolDeclarations(
    authorizedTools: readonly AuthorizedToolContract[],
    taskPresent: boolean,
    planMode = false,
    goalPlanWritable = planMode,
    allowThink = false,
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
        ...createExecutingToolDeclarations(authorizedTools),
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
