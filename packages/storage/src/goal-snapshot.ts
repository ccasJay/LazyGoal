import { z } from "zod";

/** Snapshot 中 Tool 输入与 Observation 输出允许的递归 JSON 值。 */
export type SnapshotJsonValue =
    | string
    | number
    | boolean
    | null
    | readonly SnapshotJsonValue[]
    | { readonly [key: string]: SnapshotJsonValue };

/**
 * Goal Snapshot v5 文件协议的顶层 DTO。
 *
 * @remarks
 * 该类型族独立描述磁盘表示，不以索引类型复用 Runtime 领域契约；只有
 * Codec 允许同时看到 Snapshot DTO 与 Runtime Goal 两侧类型。
 *
 * @example
 * ```ts
 * const snapshot: GoalSnapshotV5 = {
 *     id: "goal-1",
 *     metadata: { schemaVersion: 5 },
 *     definition: {
 *         intent: "实现恢复",
 *         promptBundleVersion: 1,
 *         profile,
 *         executionPolicy: { maxSteps: 0 },
 *     },
 *     state,
 * };
 * ```
 */
export interface GoalSnapshotV5 {
    readonly id: string;
    readonly metadata: GoalSnapshotMetadataV5;
    readonly definition: GoalSnapshotDefinitionV5;
    readonly state: GoalSnapshotStateV5;
}

/**
 * Snapshot 顶层协议元数据；当前协议只有 v5。
 * @example
 * ```ts
 * const metadata: GoalSnapshotMetadataV5 = { schemaVersion: 5 };
 * ```
 */
export interface GoalSnapshotMetadataV5 {
    readonly schemaVersion: 5;
}

/**
 * Snapshot 中冻结的意图、Prompt 版本、Profile 与执行策略。
 *
 * @remarks `promptBundleVersion` 在恢复后保持不变，由 Agent 的 Bundle Registry 解释。
 * @example
 * ```ts
 * const definition: GoalSnapshotDefinitionV5 = {
 *     intent: "完成目标",
 *     promptBundleVersion: 1,
 *     profile,
 *     executionPolicy: { maxSteps: 0 },
 * };
 * ```
 */
export interface GoalSnapshotDefinitionV5 {
    readonly intent: string;
    readonly promptBundleVersion: number;
    readonly profile: GoalSnapshotProfileV5;
    readonly executionPolicy: {
        readonly maxSteps: number;
    };
}

/**
 * Snapshot 持久化的 Agent Profile 表示。
 *
 * @remarks 保存创建 Goal 时冻结的配置，不在恢复时查询当前 Profile Store。
 * @example
 * ```ts
 * const profile: GoalSnapshotProfileV5 = {
 *     id: "default",
 *     systemPrompt: "You are a coding agent.",
 *     instructions: [],
 *     toolIds: [],
 * };
 * ```
 */
export interface GoalSnapshotProfileV5 {
    readonly id: string;
    readonly name?: string | undefined;
    readonly description?: string | undefined;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}

/**
 * Snapshot 的工作流、真实消息与当前 Run 状态。
 *
 * @remarks 三个字段共同构成一次可恢复状态，不提供历史版本。
 * @example
 * ```ts
 * const state: GoalSnapshotStateV5 = { workflow, messages: [], run };
 * ```
 */
export interface GoalSnapshotStateV5 {
    readonly workflow: GoalSnapshotWorkflowV5;
    readonly messages: readonly GoalSnapshotMessageV5[];
    readonly run: GoalSnapshotRunStateV5;
}

/** 准备/执行工作流阶段的持久化表示；只有 executing 拥有最终任务。 */
export type GoalSnapshotWorkflowV5 =
    | {
        readonly phase: "gathering_context";
        readonly preparation: {
            readonly status: "active" | "waiting_input";
        };
    }
    | {
        readonly phase: "planning";
        readonly preparation:
            | { readonly status: "active" }
            | {
                readonly status: "waiting_approval";
                readonly proposal: GoalSnapshotTaskV5;
            };
    }
    | {
        readonly phase: "executing";
        readonly preparation: { readonly status: "completed" };
        readonly task: GoalSnapshotTaskV5;
    };

/**
 * 任务目标与完成标准。
 * @example
 * ```ts
 * const task: GoalSnapshotTaskV5 = {
 *     objective: "完成目标",
 *     completionCriteria: ["测试通过"],
 * };
 * ```
 */
export interface GoalSnapshotTaskV5 {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/** 真实会话消息的持久化表示。 */
export type GoalSnapshotMessageV5 =
    | { readonly role: "user"; readonly content: string }
    | {
        readonly role: "assistant";
        readonly assistant: { readonly profileId: string };
        readonly content: string;
    };

/**
 * Run 执行状态快照。
 *
 * @remarks 可选执行记忆必须满足文件 Schema 的跨字段状态不变量。
 * @example
 * ```ts
 * const run: GoalSnapshotRunStateV5 = {
 *     id: "run-1",
 *     status: "created",
 *     stepCount: 0,
 * };
 * ```
 */
export interface GoalSnapshotRunStateV5 {
    readonly id: string;
    readonly status: GoalSnapshotRunStatusV5;
    readonly stepCount: number;
    readonly lastStep?: GoalSnapshotStepRecordV5 | undefined;
    readonly checkpoint?: string | undefined;
    readonly pendingAction?: GoalSnapshotPendingActionV5 | undefined;
    readonly stopReason?: GoalSnapshotStopReasonV5 | undefined;
}

/** Run 生命周期状态。 */
export type GoalSnapshotRunStatusV5 =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

/**
 * 最近一次已完成 Step 的持久化记录。
 *
 * @remarks 当前协议只接受 `action` 与 `decision`；`legacy` StepRecord 属于
 * 已删除的旧执行协议，出现即整体拒绝。
 */
export type GoalSnapshotStepRecordV5 =
    | {
        readonly kind: "action";
        readonly action: GoalSnapshotToolCallActionV5;
        readonly observation: GoalSnapshotObservationV5;
    }
    | {
        readonly kind: "decision";
        readonly result: GoalSnapshotDecisionResultV5;
    };

/**
 * Tool Action 调用的持久化表示。
 *
 * @remarks `actionId` 在审批、执行和恢复期间保持不变。
 * @example
 * ```ts
 * const action: GoalSnapshotToolCallActionV5 = {
 *     actionId: "action-1",
 *     toolId: "read_file",
 *     input: { path: "README.md" },
 * };
 * ```
 */
export interface GoalSnapshotToolCallActionV5 {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: SnapshotJsonValue;
}

/** Tool Observation 的持久化表示。 */
export type GoalSnapshotObservationV5 =
    | {
        readonly kind: "success";
        readonly output: SnapshotJsonValue;
        readonly summary: string;
    }
    | {
        readonly kind: "failure";
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
    }
    | {
        readonly kind: "rejected";
        readonly reason: string;
    };

/** 终止性 Agent 决策的持久化表示。 */
export type GoalSnapshotDecisionResultV5 =
    | {
        readonly kind: "complete";
        readonly checkpoint: string;
        readonly summary: string;
    }
    | {
        readonly kind: "wait";
        readonly checkpoint: string;
        readonly reason: string;
    }
    | {
        readonly kind: "fail";
        readonly checkpoint: string;
        readonly error: string;
    };

/**
 * 未完成 Action 的持久化意图。
 *
 * @remarks 恢复行为由状态与 Tool replay policy 共同决定，不表示 Tool 结果。
 * @example
 * ```ts
 * const pending: GoalSnapshotPendingActionV5 = {
 *     action,
 *     status: "awaiting_approval",
 * };
 * ```
 */
export interface GoalSnapshotPendingActionV5 {
    readonly action: GoalSnapshotToolCallActionV5;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
}

/** 非 Step 自身导致的 Run 终止原因。 */
export type GoalSnapshotStopReasonV5 =
    | { readonly kind: "max_steps_exceeded" }
    | {
        readonly kind: "execution_error";
        readonly code:
            | "TOOL_NOT_AUTHORIZED"
            | "TOOL_NOT_FOUND"
            | "INVALID_TOOL_INPUT"
            | "INVALID_AGENT_DECISION"
            | "TOOL_EXECUTION_ERROR";
        readonly message: string;
    };

const NonEmptyStringSchema = z.string().min(1);

const GoalSnapshotMetadataSchema = z.object({
    schemaVersion: z.literal(5),
}).strict();

const GoalSnapshotTaskSchema = z.object({
    objective: z.string(),
    completionCriteria: z.array(z.string()),
}).strict();

const GoalSnapshotProfileSchema = z.object({
    id: z.string(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    systemPrompt: z.string(),
    instructions: z.array(z.string()),
    toolIds: z.array(z.string()),
}).strict();

const GoalSnapshotMessageSchema = z.discriminatedUnion("role", [
    z.object({
        role: z.literal("user"),
        content: z.string(),
    }).strict(),
    z.object({
        role: z.literal("assistant"),
        assistant: z.object({ profileId: z.string() }).strict(),
        content: z.string(),
    }).strict(),
]);

const JsonValueSchema = z.json();

const ToolCallActionSchema = z.object({
    actionId: NonEmptyStringSchema,
    toolId: NonEmptyStringSchema,
    input: JsonValueSchema,
}).strict();

const ObservationSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("success"),
        output: JsonValueSchema,
        summary: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("failure"),
        code: NonEmptyStringSchema,
        message: NonEmptyStringSchema,
        retryable: z.boolean(),
    }).strict(),
    z.object({
        kind: z.literal("rejected"),
        reason: NonEmptyStringSchema,
    }).strict(),
]);

const DecisionResultSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("complete"),
        checkpoint: NonEmptyStringSchema,
        summary: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        checkpoint: NonEmptyStringSchema,
        reason: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        checkpoint: NonEmptyStringSchema,
        error: NonEmptyStringSchema,
    }).strict(),
]);

const PendingActionSchema = z.object({
    action: ToolCallActionSchema,
    status: z.enum(["approved", "awaiting_approval", "outcome_unknown"]),
}).strict();

const StepRecordSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("action"),
        action: ToolCallActionSchema,
        observation: ObservationSchema,
    }).strict(),
    z.object({
        kind: z.literal("decision"),
        result: DecisionResultSchema,
    }).strict(),
]);

const RunStatusSchema = z.enum([
    "created",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
]);

const StopReasonSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("max_steps_exceeded"),
    }).strict(),
    z.object({
        kind: z.literal("execution_error"),
        code: z.enum([
            "TOOL_NOT_AUTHORIZED",
            "TOOL_NOT_FOUND",
            "INVALID_TOOL_INPUT",
            "INVALID_AGENT_DECISION",
            "TOOL_EXECUTION_ERROR",
        ]),
        message: NonEmptyStringSchema,
    }).strict(),
]);

const RunStateSchema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastStep: StepRecordSchema.optional(),
    checkpoint: NonEmptyStringSchema.optional(),
    pendingAction: PendingActionSchema.optional(),
    stopReason: StopReasonSchema.optional(),
}).strict();

const WorkflowSchema = z.discriminatedUnion("phase", [
    z.object({
        phase: z.literal("gathering_context"),
        preparation: z.object({
            status: z.enum(["active", "waiting_input"]),
        }).strict(),
    }).strict(),
    z.object({
        phase: z.literal("planning"),
        preparation: z.union([
            z.object({ status: z.literal("active") }).strict(),
            z.object({
                status: z.literal("waiting_approval"),
                proposal: GoalSnapshotTaskSchema,
            }).strict(),
        ]),
    }).strict(),
    z.object({
        phase: z.literal("executing"),
        preparation: z.object({ status: z.literal("completed") }).strict(),
        task: GoalSnapshotTaskSchema,
    }).strict(),
]);

function addInvariantIssue(
    context: z.RefinementCtx,
    message: string,
    path: PropertyKey[] = [],
): void {
    context.addIssue({ code: "custom", message, path });
}

function validateV5Invariants(
    goal: z.infer<typeof GoalSnapshotBaseSchema>,
    context: z.RefinementCtx,
): void {
    const { run, workflow } = goal.state;
    const step = run.lastStep;
    const result = step?.kind === "decision" ? step.result : undefined;

    if ((run.stepCount > 0) !== (step !== undefined)) {
        addInvariantIssue(
            context,
            "lastStep must exist if and only if stepCount is positive",
            ["state", "run", "lastStep"],
        );
    }

    if (run.status === "created" && (
        run.stepCount !== 0
        || step !== undefined
        || run.checkpoint !== undefined
        || run.pendingAction !== undefined
        || run.stopReason !== undefined
    )) {
        addInvariantIssue(context, "created Run cannot contain execution progress");
    }

    if (workflow.phase !== "executing" && (
        run.status !== "created"
        || run.stepCount !== 0
        || step !== undefined
        || run.checkpoint !== undefined
        || run.pendingAction !== undefined
        || run.stopReason !== undefined
    )) {
        addInvariantIssue(
            context,
            "Preparation workflow requires a created Run without execution memory",
            ["state", "run"],
        );
    }

    if (run.status !== "failed" && run.stopReason !== undefined) {
        addInvariantIssue(context, "stopReason is only valid for a failed Run");
    }

    const pendingAction = run.pendingAction;

    if (pendingAction !== undefined) {
        if (workflow.phase !== "executing") {
            addInvariantIssue(
                context,
                "pendingAction is only valid for an executing Goal",
                ["state", "run", "pendingAction"],
            );
        }

        if (run.checkpoint === undefined) {
            addInvariantIssue(
                context,
                "pendingAction requires a checkpoint",
                ["state", "run", "checkpoint"],
            );
        }

        if (
            pendingAction.status === "awaiting_approval"
            && run.status !== "waiting"
        ) {
            addInvariantIssue(
                context,
                "awaiting_approval pendingAction requires a waiting Run",
            );
        }

        if (
            pendingAction.status === "outcome_unknown"
            && run.status !== "waiting"
            && run.status !== "failed"
        ) {
            addInvariantIssue(
                context,
                "outcome_unknown pendingAction requires a waiting or failed Run",
            );
        }

        if (run.status === "waiting" && pendingAction.status === "approved") {
            addInvariantIssue(
                context,
                "waiting Run cannot contain an approved pendingAction",
            );
        }

        if (
            (run.status === "completed" || run.status === "cancelled")
            && pendingAction !== undefined
        ) {
            addInvariantIssue(
                context,
                "terminal Run cannot contain a pendingAction",
            );
        }

        if (run.stopReason?.kind === "max_steps_exceeded") {
            addInvariantIssue(
                context,
                "maxSteps failure cannot contain a pendingAction",
            );
        }

        if (
            step?.kind === "action"
            && step.action.actionId === pendingAction.action.actionId
        ) {
            addInvariantIssue(
                context,
                "pendingAction cannot repeat the latest completed Action",
            );
        }
    }

    if (run.status === "waiting") {
        if (pendingAction === undefined && result?.kind !== "wait") {
            addInvariantIssue(
                context,
                "waiting Run requires a wait decision or a pending Action",
            );
        }

        if (
            pendingAction !== undefined
            && pendingAction.status !== "awaiting_approval"
            && pendingAction.status !== "outcome_unknown"
        ) {
            addInvariantIssue(
                context,
                "waiting Run requires an approval or recovery pendingAction",
            );
        }
    }

    if (run.status === "completed" && result?.kind !== "complete") {
        addInvariantIssue(context, "completed Run requires a complete decision");
    }

    if (run.status === "failed") {
        if (run.stopReason === undefined && result?.kind !== "fail") {
            addInvariantIssue(context, "failed Run requires a fail decision");
        }

        if (run.stopReason?.kind === "max_steps_exceeded") {
            const maxSteps = goal.definition.executionPolicy.maxSteps;
            const validPreviousStep = step?.kind === "action"
                || result?.kind === "wait";

            if (
                maxSteps <= 0
                || run.stepCount < maxSteps
                || !validPreviousStep
            ) {
                addInvariantIssue(
                    context,
                    "maxSteps failure requires a reached positive execution limit",
                );
            }
        }
    }

    if (
        run.status === "running"
        && step?.kind === "decision"
        && result?.kind !== "wait"
    ) {
        addInvariantIssue(
            context,
            "running Run can only preserve a resumed wait decision",
        );
    }
}

const GoalSnapshotBaseSchema = z.object({
    id: z.string(),
    metadata: GoalSnapshotMetadataSchema,
    definition: z.object({
        intent: z.string(),
        promptBundleVersion: z.number().int().positive(),
        profile: GoalSnapshotProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: WorkflowSchema,
        messages: z.array(GoalSnapshotMessageSchema),
        run: RunStateSchema,
    }).strict(),
}).strict();

/**
 * 严格 v5 Goal Snapshot Schema。
 *
 * @remarks
 * Schema 只负责文件协议校验：拒绝未声明字段、`legacy` StepRecord 与违反
 * 跨字段不变量的组合；不读取文件系统，也不构造 Runtime Goal。v1 至 v4
 * 与未知版本在 Codec 入口被拒绝，不会进入该 Schema。
 *
 * @example
 * ```ts
 * const result = GoalSnapshotV5Schema.safeParse(JSON.parse(text));
 * ```
 */
export const GoalSnapshotV5Schema = GoalSnapshotBaseSchema.superRefine(
    validateV5Invariants,
);

export const INVALID_GOAL_SNAPSHOT_CODE = "INVALID_GOAL_SNAPSHOT" as const;

/**
 * 表示 Goal JSON 快照违反持久化协议的错误。
 *
 * @remarks
 * v1 至 v4、未知版本、非法结构与不成立的
 * 状态组合都使用该错误；文件系统本身的读写错误不使用该类型，以便调用方
 * 区分协议损坏和 I/O 故障。
 *
 * @example
 * ```ts
 * try {
 *     codec.decode(input);
 * } catch (error) {
 *     if (error instanceof GoalSnapshotProtocolError) {
 *         console.error(error.code);
 *     }
 * }
 * ```
 */
export class GoalSnapshotProtocolError extends Error {
    readonly code = INVALID_GOAL_SNAPSHOT_CODE;

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "GoalSnapshotProtocolError";
    }
}
