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
 * Goal Snapshot v3 文件协议的顶层 DTO。
 *
 * @remarks
 * 该类型族独立描述磁盘表示，不以索引类型复用 Runtime 领域契约；只有
 * Codec 允许同时看到 Snapshot DTO 与 Runtime Goal 两侧类型。
 *
 * @example
 * ```ts
 * const snapshot: GoalSnapshotV3 = {
 *     id: "goal-1",
 *     metadata: { schemaVersion: 3 },
 *     definition: { intent: "实现恢复", profile, executionPolicy: { maxSteps: 0 } },
 *     state,
 * };
 * ```
 */
export interface GoalSnapshotV3 {
    readonly id: string;
    readonly metadata: GoalSnapshotMetadataV3;
    readonly definition: GoalSnapshotDefinitionV3;
    readonly state: GoalSnapshotStateV3;
}

/** Snapshot 顶层协议元数据；当前协议只有 v3。 */
export interface GoalSnapshotMetadataV3 {
    readonly schemaVersion: 3;
}

/** Snapshot 中冻结的任务与 Profile 定义。 */
export interface GoalSnapshotDefinitionV3 {
    readonly intent: string;
    readonly profile: GoalSnapshotProfileV3;
    readonly executionPolicy: {
        readonly maxSteps: number;
    };
}

/** Snapshot 持久化的 Agent Profile 表示。 */
export interface GoalSnapshotProfileV3 {
    readonly id: string;
    readonly name?: string | undefined;
    readonly description?: string | undefined;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}

/** Snapshot 的工作流与执行状态。 */
export interface GoalSnapshotStateV3 {
    readonly workflow: GoalSnapshotWorkflowV3;
    readonly messages: readonly GoalSnapshotMessageV3[];
    readonly run: GoalSnapshotRunStateV3;
}

/** 准备/执行工作流阶段的持久化表示；只有 executing 拥有最终任务。 */
export type GoalSnapshotWorkflowV3 =
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
                readonly proposal: GoalSnapshotTaskV3;
            };
    }
    | {
        readonly phase: "executing";
        readonly preparation: { readonly status: "completed" };
        readonly task: GoalSnapshotTaskV3;
    };

/** 任务目标与完成标准。 */
export interface GoalSnapshotTaskV3 {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/** 真实会话消息的持久化表示。 */
export type GoalSnapshotMessageV3 =
    | { readonly role: "user"; readonly content: string }
    | {
        readonly role: "assistant";
        readonly assistant: { readonly profileId: string };
        readonly content: string;
    };

/** Run 执行状态快照。 */
export interface GoalSnapshotRunStateV3 {
    readonly id: string;
    readonly status: GoalSnapshotRunStatusV3;
    readonly stepCount: number;
    readonly lastStep?: GoalSnapshotStepRecordV3 | undefined;
    readonly checkpoint?: string | undefined;
    readonly pendingAction?: GoalSnapshotPendingActionV3 | undefined;
    readonly stopReason?: GoalSnapshotStopReasonV3 | undefined;
}

/** Run 生命周期状态。 */
export type GoalSnapshotRunStatusV3 =
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
export type GoalSnapshotStepRecordV3 =
    | {
        readonly kind: "action";
        readonly action: GoalSnapshotToolCallActionV3;
        readonly observation: GoalSnapshotObservationV3;
    }
    | {
        readonly kind: "decision";
        readonly result: GoalSnapshotDecisionResultV3;
    };

/** Tool Action 调用的持久化表示。 */
export interface GoalSnapshotToolCallActionV3 {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: SnapshotJsonValue;
}

/** Tool Observation 的持久化表示。 */
export type GoalSnapshotObservationV3 =
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
export type GoalSnapshotDecisionResultV3 =
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

/** 未完成 Action 的持久化意图。 */
export interface GoalSnapshotPendingActionV3 {
    readonly action: GoalSnapshotToolCallActionV3;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
}

/** 非 Step 自身导致的 Run 终止原因。 */
export type GoalSnapshotStopReasonV3 =
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
    schemaVersion: z.literal(3),
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

function validateV3Invariants(
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
            const validPreviousStep = step?.kind === "action";

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
 * 严格非 Legacy v3 Goal Snapshot Schema。
 *
 * @remarks
 * Schema 只负责文件协议校验：拒绝未声明字段、`legacy` StepRecord 与违反
 * 跨字段不变量的组合；不读取文件系统，也不构造 Runtime Goal。v1、v2 与
 * 未知版本在 Codec 入口被拒绝，不会进入该 Schema。
 *
 * @example
 * ```ts
 * const result = GoalSnapshotV3Schema.safeParse(JSON.parse(text));
 * ```
 */
export const GoalSnapshotV3Schema = GoalSnapshotBaseSchema.superRefine(
    validateV3Invariants,
);

export const INVALID_GOAL_SNAPSHOT_CODE = "INVALID_GOAL_SNAPSHOT" as const;

/**
 * 表示 Goal JSON 快照违反持久化协议的错误。
 *
 * @remarks
 * v1、v2、包含 `legacy` StepRecord 的 v3、未知版本、非法结构与不成立的
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
