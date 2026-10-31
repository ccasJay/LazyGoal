import { ContractValidationError } from "../../../contracts/src/index";
import { validateCompletionReviewResult } from "./completion-review";
import type {
    AgentDecision,
    AskUserAgentDecision,
    CompletionReviewResult,
    GoalPlanPatchOperation,
    RunPlanRouteUpdateAgentDecision,
    SystemAskUserInput,
    SystemCompleteRunInput,
    SystemCompleteRunStageInput,
    SystemCompleteTaskInput,
    SystemCompletionReviewInput,
    SystemContextCheckpointInput,
    SystemContextLookupInput,
    SystemFailGoalInput,
    SystemFindToolsInput,
    SystemProposeTaskPlanInput,
    SystemRequestThinkInput,
    SystemReviseRunStageInput,
    SystemStartNextRunStageInput,
    SystemStartRunStageInput,
    SystemUpdateGoalPlanInput,
    SystemUpdatePlanRouteInput,
    SystemWaitForInputInput,
    RequestThink,
} from "./schema-types";

/**
 * 单个系统工具的稳定身份、模型说明与解码后转换。
 *
 * @remarks
 * 参数字段与约束由对应的 TS 输入类型和生成绑定拥有；本结构只复用身份、说明和
 * 已解码参数到领域结果的转换，避免 AST 与绑定两条路径维护不同描述。
 *
 * @example
 * ```ts
 * const spec: SystemToolSpec<SystemFindToolsInput, AgentDecision> = {
 *     id: "system_find_tools",
 *     description: "Search the authorized tool catalog.",
 *     build: args => ({ kind: "tool_discovery", query: args.query }),
 * };
 * ```
 */
export interface SystemToolSpec<Args, Result, Id extends string = string> {
    /** 系统工具唯一标识。 */
    readonly id: Id;
    /** 面向模型的英文功能说明。 */
    readonly description: string;
    /** 将以绑定校验后的参数转换为领域结果。 */
    build(args: Args): Result;
}

/**
 * 以不透明参数类型持有已完成解码的规范集合。
 *
 * @remarks
 * 仅用于在运行时按声明身份复用同一规范；调用方必须先通过对应的生成绑定校验参数。
 *
 * @example
 * ```ts
 * const specs: readonly AnySystemToolSpec<AgentDecision>[] = createRunStageToolSpecs({});
 * ```
 */
export type AnySystemToolSpec<Result = unknown> = SystemToolSpec<any, Result>;

/** 完成审查工具规范；不接受业务工具或 Runtime 状态转换。 */
export const SystemCompletionReviewSpec: SystemToolSpec<SystemCompletionReviewInput, CompletionReviewResult> = {
    id: "system_review_completion",
    description: "Accept only a complete, supported user-facing deliverable. Otherwise reject with the concrete missing deliverable or evidence and what needs correction. Do not rewrite the answer or execute tools.",
    build: (args) => validateCompletionReviewResult(args.result),
};

/** 逐条件完成任务工具规范。 */
export const SystemCompleteTaskSpec: SystemToolSpec<SystemCompleteTaskInput, AgentDecision> = {
    id: "system_complete_task",
    description: "Submit a completion candidate only after every approved criterion is satisfied. summary is the full user-facing answer or deliverable, including requested findings, supporting details and recommendations, not a status recap. Cite committed Tool/Observation evidence; partial progress or unverified results are not completion.",
    build: (args) => ({
        kind: "complete",
        summary: args.summary,
        completionEvidence: args.completionEvidence,
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 普通 Run 完成任务工具规范。 */
export const SystemCompleteRunSpec: SystemToolSpec<SystemCompleteRunInput, AgentDecision> = {
    id: "system_complete_task",
    description: "Submit a completion candidate for the current Run's user request. summary is the full user-facing answer or deliverable, not a recap that analysis was performed. Include requested findings, supporting details and recommendations; keep simple answers brief. Cite current Run committed Tool/Observation evidence when available; do not cite user answers or historical facts.",
    build: (args) => ({
        kind: "complete",
        summary: args.summary,
        evidenceSequences: args.evidenceSequences,
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 等待用户输入工具规范。 */
export const SystemWaitForInputSpec: SystemToolSpec<SystemWaitForInputInput, AgentDecision> = {
    id: "system_wait_for_input",
    description: "Pause when external intervention or an authorization change is required and no useful authorized work can proceed. State the blocker and what must change to resume. This does not schedule polling or wakeups; use ask_user for a concrete question.",
    build: (args) => ({
        kind: "wait",
        reason: args.reason,
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 任务失败工具规范。 */
export const SystemFailGoalSpec: SystemToolSpec<SystemFailGoalInput, AgentDecision> = {
    id: "system_fail_goal",
    description: "Declare failure only when observed evidence establishes that the task cannot be completed and no reasonable recovery path remains. A single tool failure, missing information or a temporary dependency is insufficient.",
    build: (args) => ({
        kind: "fail",
        error: args.error,
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 上下文查询工具规范。 */
export const SystemContextLookupSpec: SystemToolSpec<SystemContextLookupInput, AgentDecision> = {
    id: "system_context_lookup",
    description: "Recover necessary historical execution, user decisions or rationale from trajectory or conversation records. Place exactly one operation object inside request: history_search requires need and question; directory_browse accepts cursor, limit and category; directory_search requires query and accepts cursor, limit and category; source_expand requires sourceRef and accepts offset and limit. Do not mix fields across operations. Workspace files are not searched. No match does not prove a repository object is absent. Lookup events are not direct Fact or completion evidence. Use authorized file tools when requested repository contents are missing. Results do not establish current external state; use authorized tools for that. Filters are optional; omit sequenceRange unless targeting known event sequences.",
    build: (args) => ({ kind: "context_lookup", ...args.request }),
};

/** 工具目录查询工具规范。 */
export const SystemFindToolsSpec: SystemToolSpec<SystemFindToolsInput, AgentDecision> = {
    id: "system_find_tools",
    description: "Search the currently authorized tool catalog for tools relevant to the task. This only reveals matching schemas for later decisions; it does not grant permission to execute them.",
    build: (args) => ({ kind: "tool_discovery", query: args.query }),
};

/** AskUser 工具规范。 */
export const SystemAskUserSpec: SystemToolSpec<SystemAskUserInput, AskUserAgentDecision, "ask_user"> = {
    id: "ask_user",
    description: "Ask 1 to 3 focused structured questions when information must come from the user and materially affects scope, correctness or authorization. Do not ask for routine confirmation or facts available through tools. Users can choose options or provide free-form Other text.",
    build: (args) => ({
        kind: "ask_user",
        questions: args.questions,
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 任务提案工具规范。 */
export const SystemProposeTaskPlanSpec: SystemToolSpec<SystemProposeTaskPlanInput, AgentDecision> = {
    id: "system_propose_task_plan",
    description: "After collecting missing information that materially affects scope, correctness or authorization, submit one approval proposal containing the task objective, verifiable completion criteria, and the complete ordered stage route. Use one stage for one coherent outcome; use multiple stages for independently verifiable deliverables, real dependencies, or distinct verification gates. Do not split by expected Step, Tool call, duration or token counts. Each route stage needs a target and acceptance criteria. Do not add routine confirmation questions. Task criterion acceptance is optional and should only reference authorized business tools; never use system functions as expectToolId.",
    build: (args) => ({
        kind: "task_proposal",
        task: args.task,
        planRoute: args.planRoute,
        approvalRequest: args.approvalRequest,
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 完整路线修订工具规范。 */
export const SystemUpdatePlanRouteSpec: SystemToolSpec<SystemUpdatePlanRouteInput, RunPlanRouteUpdateAgentDecision> = {
    id: "system_update_plan_route",
    description: "After new evidence changes the approved route, submit the complete revised route and a concrete reason. Preserve accepted stages exactly. Omit approvalRequest only when the revision stays within the approved task scope and promised outcomes. Include approvalRequest when it expands scope or changes promised outcomes; Runtime will pause for a user decision before applying it.",
    build: (args) => ({
        kind: "run_plan_route_update",
        baseRevision: args.baseRevision,
        reason: args.reason,
        route: args.route,
        ...(args.approvalRequest === undefined ? {} : { approvalRequest: args.approvalRequest }),
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 上下文检查点工具规范。 */
export const SystemContextCheckpointSpec: SystemToolSpec<SystemContextCheckpointInput, AgentDecision> = {
    id: "system_context_checkpoint",
    description: "When checkpointRequired is true, make this the only call, ahead of all ordinary actions and system decisions. Preserve supported durable memory updates; Runtime owns checkpoint metadata.",
    build: (args) => ({
        kind: "context_checkpoint",
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** GoalPlan 更新工具规范。 */
export const SystemUpdateGoalPlanSpec: SystemToolSpec<SystemUpdateGoalPlanInput, AgentDecision> = {
    id: "system_update_goal_plan",
    description: "Update the GoalPlan only when the current mode authorizes plan writing, using an atomic patch with the current revision. Runtime allocates Todo IDs, validates completion evidence, and checks all transitions. Plan updates do not replace execution or verification.",
    build: (args) => ({
        kind: "goal_plan_update",
        baseRevision: args.baseRevision,
        operations: args.operations as readonly GoalPlanPatchOperation[],
        ...(args.memoryPatch === undefined ? {} : { memoryPatch: args.memoryPatch }),
    }),
};

/** 开始新阶段工具规范。 */
export const SystemStartRunStageSpec: SystemToolSpec<SystemStartRunStageInput, AgentDecision> = {
    id: "system_start_run_stage",
    description: "Start a stage with a non-blank target and non-empty, verifiable acceptance criteria. Runtime allocates its identity and version. Do not supply stageId, baseRevision, reason, or memoryPatch.",
    build: (args) => ({
        kind: "run_stage_update",
        ...validateStageDescription(args),
    }),
};

/**
 * 构造当前阶段修订工具规范；阶段身份与版本固定为请求快照值。
 *
 * @param stageId - 当前执行阶段 ID。
 * @param revision - 当前阶段修订号。
 * @returns 不接受身份或版本的修订工具规范。
 * @example
 * ```ts
 * const spec = SystemReviseRunStageSpec("stage-1", 1);
 * ```
 */
export function SystemReviseRunStageSpec(
    stageId: string,
    revision: number,
): SystemToolSpec<SystemReviseRunStageInput, AgentDecision> {
    return {
        id: "system_revise_run_stage",
        description: "Replace the current stage target and all acceptance criteria, with a non-blank reason. Runtime binds the current identity and version. Do not supply stageId, baseRevision, or memoryPatch. Preserve the user's requirements.",
        build: (args) => ({
            kind: "run_stage_update",
            stageId,
            baseRevision: revision,
            ...validateStageDescription(args),
        }),
    };
}

/**
 * 构造当前阶段完成候选工具规范。
 *
 * @param stageId - 当前执行阶段 ID。
 * @returns 只接受摘要与证据序列的完成候选规范。
 * @example
 * ```ts
 * const spec = SystemCompleteRunStageSpec("stage-1");
 * ```
 */
export function SystemCompleteRunStageSpec(
    stageId: string,
): SystemToolSpec<SystemCompleteRunStageInput, AgentDecision> {
    return {
        id: "system_complete_run_stage",
        description: "Submit a completion candidate for the current stage for review. Provide the summary and committed evidenceSequences (an array). This does not finish the Run. Do not supply stageId, baseRevision, or memoryPatch.",
        build: (args) => ({
            kind: "run_stage_complete",
            stageId,
            summary: args.summary,
            evidenceSequences: args.evidenceSequences,
        }),
    };
}

/**
 * 构造获批路线下一阶段的自动开始规范。
 *
 * @param target - 获批路线中的下一阶段目标。
 * @param acceptanceCriteria - 获批路线中的下一阶段验收条件。
 * @returns 空输入规范；Runtime 提供阶段事实。
 * @example
 * ```ts
 * const spec = SystemStartNextRunStageSpec("实现修复", ["回归通过"]);
 * ```
 */
export function SystemStartNextRunStageSpec(
    target: string,
    acceptanceCriteria: readonly string[],
): SystemToolSpec<SystemStartNextRunStageInput, AgentDecision> {
    const approvedCriteria = [...acceptanceCriteria];
    return {
        id: "system_start_run_stage",
        description: "Start the next pending stage of the approved Plan route. Pass an empty object; Runtime supplies its approved target, criteria, identity, and version.",
        build: () => ({
            kind: "run_stage_update",
            target,
            acceptanceCriteria: [...approvedCriteria],
        }),
    };
}

/** 请求 Think 阶段工具规范。 */
export const SystemRequestThinkSpec: SystemToolSpec<SystemRequestThinkInput, RequestThink> = {
    id: "system_request_think",
    description: "Request a separate Think stage for one explicit reasoning objective. This does not execute a business tool or change runtime state.",
    build: (args) => {
        const goal = args.goal.trim();
        if (goal.length === 0) {
            throw new Error("request_think.goal must contain non-whitespace text");
        }
        return { kind: "request_think", goal };
    },
};

function validateStageDescription<T extends { readonly target: string; readonly acceptanceCriteria: readonly string[]; readonly reason?: string }>(args: T): T {
    const issues: { code: "string_min_length"; path: (string | number)[]; message: string }[] = [];
    if (args.target.trim().length === 0) issues.push({ code: "string_min_length", path: ["target"], message: "Use a non-blank target." });
    args.acceptanceCriteria.forEach((criterion, index) => {
        if (criterion.trim().length === 0) issues.push({ code: "string_min_length", path: ["acceptanceCriteria", index], message: "Use a non-blank acceptance criterion." });
    });
    if (args.reason !== undefined && args.reason.trim().length === 0) issues.push({ code: "string_min_length", path: ["reason"], message: "Use a non-blank revision reason." });
    if (issues.length > 0) throw new ContractValidationError(issues, false);
    return args;
}

/** 当前请求可操作的阶段状态；不接受模型回填身份或版本。 */
export interface RunStageToolContext {
    /** 请求构造时的阶段身份、版本及状态；accepted 阶段允许开始下一阶段。 */
    readonly currentStage?: { readonly stageId: string; readonly revision: number; readonly status: "executing" | "accepted" };
    /** 已批准的完整路线；开始操作只激活游标对应的 pending 阶段。 */
    readonly planRoute?: {
        readonly revision: number;
        readonly nextStageIndex: number;
        readonly stages: readonly { readonly target: string; readonly acceptanceCriteria: readonly string[]; readonly status: "pending" | "executing" | "accepted" }[];
    };
}

/**
 * 按请求快照选择唯一合法的阶段工具规范集合。
 *
 * @param context - 当前阶段和获批路线；闭包捕获标量及条件副本。
 * @returns 无执行中阶段时提供开始；执行中提供修订、完成；路线结束时不提供开始。
 * @example
 * ```ts
 * const specs = createRunStageToolSpecs({});
 * ```
 */
export function createRunStageToolSpecs(
    context: RunStageToolContext,
): readonly AnySystemToolSpec<AgentDecision>[] {
    const current = context.currentStage;
    if (current?.status === "executing") {
        return [
            SystemReviseRunStageSpec(current.stageId, current.revision),
            SystemCompleteRunStageSpec(current.stageId),
        ];
    }
    if (context.planRoute !== undefined) {
        const next = context.planRoute.stages[context.planRoute.nextStageIndex];
        if (next?.status !== "pending") return [];
        return [SystemStartNextRunStageSpec(next.target, next.acceptanceCriteria)];
    }
    return [SystemStartRunStageSpec];
}
