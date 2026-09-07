import { z } from "zod";

type SnapshotContextLookupNeed =
    | "conversation_history"
    | "historical_execution"
    | "decision_rationale";

/** Snapshot 中 Tool 输入与 Observation 输出允许的递归 JSON 值。 */
export type SnapshotJsonValue =
    | string
    | number
    | boolean
    | null
    | readonly SnapshotJsonValue[]
    | { readonly [key: string]: SnapshotJsonValue };

/** 当前 Goal Snapshot 的元数据。 */
export interface GoalSnapshotMetadataV1 {
    readonly schemaVersion: 1;
}

/** Snapshot 中冻结的 Agent Profile。 */
export interface GoalSnapshotProfileV1 {
    readonly id: string;
    readonly name?: string | undefined;
    readonly description?: string | undefined;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}

/** Snapshot 中冻结的 Goal 协议组合与执行策略。 */
export interface GoalSnapshotDefinitionV1 {
    readonly intent: string;
    readonly promptBundleVersion: 1;
    readonly memoryProtocol: { readonly kind: "structured"; readonly version: 1 };
    readonly modelContextProtocol: {
        readonly kind: "trajectory-layered";
        readonly version: 1;
    };
    readonly contextRetrievalProtocol: {
        readonly kind: "bm25-lite";
        readonly version: 1;
    };
    readonly profile: GoalSnapshotProfileV1;
    readonly executionPolicy: { readonly maxSteps: number };
}

/** Snapshot 中单条完成条件的验收声明。 */
export interface GoalSnapshotCompletionAcceptanceV1 {
    readonly expectToolId: string;
    readonly expectOutcome: "success" | "failure";
}

/** Snapshot 中的单条完成条件。 */
export interface GoalSnapshotCompletionCriterionV1 {
    readonly text: string;
    readonly acceptance?: GoalSnapshotCompletionAcceptanceV1 | undefined;
}

/** Snapshot 中的任务定义。 */
export interface GoalSnapshotTaskV1 {
    readonly objective: string;
    readonly completionCriteria: readonly GoalSnapshotCompletionCriterionV1[];
}

/** Snapshot 中按时间顺序保存的真实会话消息。 */
export type GoalSnapshotMessageV1 =
    | { readonly role: "user"; readonly content: string }
    | {
        readonly role: "assistant";
        readonly assistant: { readonly profileId: string };
        readonly content: string;
    };

/** Snapshot 中的 Tool Action。 */
export interface GoalSnapshotToolCallActionV1 {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: SnapshotJsonValue;
}

/** Snapshot 中的 Tool Observation。 */
export type GoalSnapshotObservationV1 =
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
    | { readonly kind: "rejected"; readonly reason: string };

/** Snapshot 中的 Memory Patch。 */
export interface GoalSnapshotMemoryPatchV1 {
    readonly protocolVersion: 1;
    readonly operations: readonly Record<string, unknown>[];
}

/** Structured complete Decision 的完成证据。 */
export interface GoalSnapshotCompletionEvidenceV1 {
    readonly criterionIndex: number;
    readonly evidenceSequences: readonly number[];
}

/** Snapshot 中 Context Lookup Decision 的过滤器。 */
export interface GoalSnapshotContextLookupFiltersV1 {
    readonly eventTypes?: readonly string[];
    readonly toolIds?: readonly string[];
    readonly actionIds?: readonly string[];
    readonly stepIndexes?: readonly number[];
    readonly paths?: readonly string[];
    readonly errorCodes?: readonly string[];
    readonly objectIds?: readonly string[];
    readonly sequenceRange?: { readonly from: number; readonly to: number };
}

/** Snapshot 中的结构化 Agent Decision 结果。 */
export type GoalSnapshotStructuredDecisionResultV1 =
    | {
        readonly kind: "complete";
        readonly summary: string;
        readonly completionEvidence: readonly GoalSnapshotCompletionEvidenceV1[];
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "wait";
        readonly reason: string;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "fail";
        readonly error: string;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "context_lookup";
        readonly need: SnapshotContextLookupNeed;
        readonly question: string;
        readonly filters?: GoalSnapshotContextLookupFiltersV1 | undefined;
    };

/** Snapshot 中最近一次完成 Step 的 Decision 结果。 */
export type GoalSnapshotDecisionResultV1 = GoalSnapshotStructuredDecisionResultV1;

/** Snapshot 中最近一次完成 Step。 */
export type GoalSnapshotStepRecordV1 =
    | {
        readonly kind: "action";
        readonly action: GoalSnapshotToolCallActionV1;
        readonly observation: GoalSnapshotObservationV1;
    }
    | {
        readonly kind: "decision";
        readonly result: GoalSnapshotDecisionResultV1;
    };

/** Snapshot 中的 Memory revision 指针。 */
export interface GoalSnapshotMemoryRevisionV1 {
    readonly eventId: string;
    readonly sequence: number;
}

/** Snapshot 中的未完成 Action。 */
export interface GoalSnapshotPendingActionV1 {
    readonly action: GoalSnapshotToolCallActionV1;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
}

/** Snapshot 中非 Step 自身导致的 Run 终止原因。 */
export type GoalSnapshotStopReasonV1 =
    | { readonly kind: "max_steps_exceeded" }
    | {
        readonly kind: "execution_error";
        readonly code:
            | "TOOL_NOT_AUTHORIZED"
            | "TOOL_NOT_FOUND"
            | "INVALID_TOOL_INPUT"
            | "INVALID_MEMORY_PATCH"
            | "INVALID_AGENT_DECISION"
            | "TOOL_EXECUTION_ERROR";
        readonly message: string;
    };

/** Snapshot 中的模型上下文 Epoch。 */
export interface GoalSnapshotContextEpochV1 {
    readonly version: 1;
    readonly number: number;
    readonly conversationStartIndex: number;
    readonly openedAtSequence: number;
}

/** Snapshot 中的 Run 状态。 */
export interface GoalSnapshotRunStateV1 {
    readonly id: string;
    readonly status:
        | "created"
        | "running"
        | "waiting"
        | "completed"
        | "failed"
        | "cancelled";
    readonly stepCount: number;
    readonly committedThroughSequence: number;
    readonly memoryRevision?: GoalSnapshotMemoryRevisionV1 | undefined;
    readonly lastStep?: GoalSnapshotStepRecordV1 | undefined;
    readonly pendingAction?: GoalSnapshotPendingActionV1 | undefined;
    readonly stopReason?: GoalSnapshotStopReasonV1 | undefined;
    readonly contextEpoch: GoalSnapshotContextEpochV1;
}

/** Snapshot 中的工作流状态。 */
export type GoalSnapshotWorkflowV1 =
    | {
        readonly phase: "gathering_context";
        readonly preparation: { readonly status: "active" | "waiting_input" };
    }
    | {
        readonly phase: "planning";
        readonly preparation:
            | { readonly status: "active" }
            | {
                readonly status: "waiting_approval";
                readonly proposal: GoalSnapshotTaskV1;
            };
    }
    | {
        readonly phase: "executing";
        readonly preparation: { readonly status: "completed" };
        readonly task: GoalSnapshotTaskV1;
    };

/** Snapshot 中的 Goal 状态。 */
export interface GoalSnapshotStateV1 {
    readonly workflow: GoalSnapshotWorkflowV1;
    readonly messages: readonly GoalSnapshotMessageV1[];
    readonly run: GoalSnapshotRunStateV1;
}

/** 当前唯一支持的 Goal Snapshot DTO。 */
export interface GoalSnapshotV1 {
    readonly id: string;
    readonly metadata: GoalSnapshotMetadataV1;
    readonly definition: GoalSnapshotDefinitionV1;
    readonly state: GoalSnapshotStateV1;
}

const NonEmptyStringSchema = z.string().min(1);
const JsonValueSchema = z.json();

const GoalSnapshotProfileSchema = z.object({
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema.optional(),
    description: NonEmptyStringSchema.optional(),
    systemPrompt: z.string(),
    instructions: z.array(z.string()),
    toolIds: z.array(NonEmptyStringSchema),
}).strict();

const GoalSnapshotCompletionAcceptanceSchema = z.object({
    expectToolId: NonEmptyStringSchema,
    expectOutcome: z.enum(["success", "failure"]),
}).strict();

const GoalSnapshotCompletionCriterionSchema = z.object({
    text: NonEmptyStringSchema,
    acceptance: GoalSnapshotCompletionAcceptanceSchema.optional(),
}).strict();

const GoalSnapshotTaskSchema = z.object({
    objective: NonEmptyStringSchema,
    completionCriteria: z.array(GoalSnapshotCompletionCriterionSchema),
}).strict();

const GoalSnapshotMessageSchema = z.discriminatedUnion("role", [
    z.object({ role: z.literal("user"), content: z.string() }).strict(),
    z.object({
        role: z.literal("assistant"),
        assistant: z.object({ profileId: NonEmptyStringSchema }).strict(),
        content: z.string(),
    }).strict(),
]);

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

const MemoryPatchOperationSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("upsert_fact"),
        fact: z.object({
            subject: NonEmptyStringSchema,
            predicate: NonEmptyStringSchema,
            value: JsonValueSchema,
            stability: z.enum(["stable", "last_observed"]),
            evidenceSequences: z.array(z.number().int().positive()),
            scope: z.enum(["goal", "phase"]).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("retire_fact"),
        fact: z.object({
            id: NonEmptyStringSchema,
            evidenceSequences: z.array(z.number().int().positive()),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("create_hypothesis"),
        hypothesis: z.object({
            statement: NonEmptyStringSchema,
            scope: z.enum(["goal", "phase"]).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("update_hypothesis"),
        hypothesis: z.object({
            id: NonEmptyStringSchema,
            statement: NonEmptyStringSchema.optional(),
            status: z.enum(["active", "resolved", "superseded"]).optional(),
        }).strict().refine(
            (value) => value.statement !== undefined || value.status !== undefined,
        ),
    }).strict(),
    z.object({
        type: z.literal("create_plan_item"),
        planItem: z.object({
            description: NonEmptyStringSchema,
            status: z.enum(["pending", "active", "blocked"]).optional(),
            dependsOnFactIds: z.array(NonEmptyStringSchema).optional(),
            dependsOnPlanItemIds: z.array(NonEmptyStringSchema).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("update_plan_item"),
        planItem: z.object({
            id: NonEmptyStringSchema,
            description: NonEmptyStringSchema.optional(),
            status: z.enum(["pending", "active", "completed", "blocked", "superseded"]).optional(),
            dependsOnFactIds: z.array(NonEmptyStringSchema).optional(),
            dependsOnPlanItemIds: z.array(NonEmptyStringSchema).optional(),
            completionEvidenceSequences: z.array(z.number().int().positive()).optional(),
        }).strict().refine((value) => Object.keys(value).some((key) => key !== "id")),
    }).strict(),
    z.object({
        type: z.literal("create_blocker"),
        blocker: z.object({
            description: NonEmptyStringSchema,
            scope: z.enum(["goal", "phase"]).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("update_blocker"),
        blocker: z.object({
            id: NonEmptyStringSchema,
            description: NonEmptyStringSchema.optional(),
            status: z.enum(["active", "resolved", "superseded"]).optional(),
        }).strict().refine(
            (value) => value.description !== undefined || value.status !== undefined,
        ),
    }).strict(),
]);

const MemoryPatchSchema = z.object({
    protocolVersion: z.literal(1),
    operations: z.array(MemoryPatchOperationSchema),
}).strict();

const CompletionEvidenceSchema = z.object({
    criterionIndex: z.number().int().nonnegative(),
    evidenceSequences: z.array(z.number().int().positive()),
}).strict();

const ContextLookupFiltersSchema = z.object({
    eventTypes: z.array(NonEmptyStringSchema).max(16).optional(),
    toolIds: z.array(NonEmptyStringSchema).max(16).optional(),
    actionIds: z.array(NonEmptyStringSchema).max(16).optional(),
    stepIndexes: z.array(z.number().int().nonnegative().safe()).max(16).optional(),
    paths: z.array(NonEmptyStringSchema).max(16).optional(),
    errorCodes: z.array(NonEmptyStringSchema).max(16).optional(),
    objectIds: z.array(NonEmptyStringSchema).max(16).optional(),
    sequenceRange: z.object({
        from: z.number().int().nonnegative().safe(),
        to: z.number().int().nonnegative().safe(),
    }).strict().optional(),
}).strict().superRefine((filters, context) => {
    if (
        filters.sequenceRange !== undefined
        && filters.sequenceRange.to < filters.sequenceRange.from
    ) {
        context.addIssue({ code: "custom", message: "sequenceRange must not be inverted" });
    }
});

const ContextLookupDecisionResultSchema = z.object({
    kind: z.literal("context_lookup"),
    need: z.enum(["conversation_history", "historical_execution", "decision_rationale"]),
    question: NonEmptyStringSchema.max(1024),
    filters: ContextLookupFiltersSchema.optional(),
}).strict();

const StructuredDecisionResultSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("complete"),
        summary: NonEmptyStringSchema,
        completionEvidence: z.array(CompletionEvidenceSchema),
        memoryPatch: MemoryPatchSchema.optional(),
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        reason: NonEmptyStringSchema,
        memoryPatch: MemoryPatchSchema.optional(),
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        error: NonEmptyStringSchema,
        memoryPatch: MemoryPatchSchema.optional(),
    }).strict(),
    ContextLookupDecisionResultSchema,
]);

const StepRecordSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("action"),
        action: ToolCallActionSchema,
        observation: ObservationSchema,
    }).strict(),
    z.object({
        kind: z.literal("decision"),
        result: StructuredDecisionResultSchema,
    }).strict(),
]);

const PendingActionSchema = z.object({
    action: ToolCallActionSchema,
    status: z.enum(["approved", "awaiting_approval", "outcome_unknown"]),
}).strict();

const StopReasonSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("max_steps_exceeded") }).strict(),
    z.object({
        kind: z.literal("execution_error"),
        code: z.enum([
            "TOOL_NOT_AUTHORIZED",
            "TOOL_NOT_FOUND",
            "INVALID_TOOL_INPUT",
            "INVALID_MEMORY_PATCH",
            "INVALID_AGENT_DECISION",
            "TOOL_EXECUTION_ERROR",
        ]),
        message: NonEmptyStringSchema,
    }).strict(),
]);

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

const ContextEpochSchema = z.object({
    version: z.literal(1),
    number: z.number().int().nonnegative(),
    conversationStartIndex: z.number().int().nonnegative(),
    openedAtSequence: z.number().int().nonnegative(),
}).strict();

const GoalSnapshotV1BaseSchema = z.object({
    id: NonEmptyStringSchema,
    metadata: z.object({ schemaVersion: z.literal(1) }).strict(),
    definition: z.object({
        intent: z.string(),
        promptBundleVersion: z.literal(1),
        memoryProtocol: z.object({
            kind: z.literal("structured"),
            version: z.literal(1),
        }).strict(),
        modelContextProtocol: z.object({
            kind: z.literal("trajectory-layered"),
            version: z.literal(1),
        }).strict(),
        contextRetrievalProtocol: z.object({
            kind: z.literal("bm25-lite"),
            version: z.literal(1),
        }).strict(),
        profile: GoalSnapshotProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: WorkflowSchema,
        messages: z.array(GoalSnapshotMessageSchema),
        run: z.object({
            id: NonEmptyStringSchema,
            status: z.enum([
                "created",
                "running",
                "waiting",
                "completed",
                "failed",
                "cancelled",
            ]),
            stepCount: z.number().int().nonnegative(),
            committedThroughSequence: z.number().int().nonnegative(),
            memoryRevision: z.object({
                eventId: NonEmptyStringSchema,
                sequence: z.number().int().positive(),
            }).strict().optional(),
            lastStep: StepRecordSchema.optional(),
            pendingAction: PendingActionSchema.optional(),
            stopReason: StopReasonSchema.optional(),
            contextEpoch: ContextEpochSchema,
        }).strict(),
    }).strict(),
}).strict();

function addInvariantIssue(
    context: z.RefinementCtx,
    message: string,
    path: PropertyKey[] = [],
): void {
    context.addIssue({ code: "custom", message, path });
}

function validateSnapshotInvariants(
    goal: z.infer<typeof GoalSnapshotV1BaseSchema>,
    context: z.RefinementCtx,
): void {
    const { run, workflow } = goal.state;
    const step = run.lastStep;
    const result = step?.kind === "decision" ? step.result : undefined;

    if (run.contextEpoch.conversationStartIndex > goal.state.messages.length) {
        addInvariantIssue(
            context,
            "contextEpoch conversationStartIndex exceeds messages",
            ["state", "run", "contextEpoch", "conversationStartIndex"],
        );
    }

    if (run.contextEpoch.openedAtSequence > run.committedThroughSequence) {
        addInvariantIssue(
            context,
            "contextEpoch openedAtSequence exceeds committedThroughSequence",
            ["state", "run", "contextEpoch", "openedAtSequence"],
        );
    }

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
        || run.pendingAction !== undefined
        || run.stopReason !== undefined
    )) {
        addInvariantIssue(context, "created Run cannot contain execution progress");
    }

    if (workflow.phase !== "executing" && (
        run.status !== "created"
        || run.stepCount !== 0
        || step !== undefined
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

        if (
            pendingAction.status === "awaiting_approval"
            && run.status !== "waiting"
        ) {
            addInvariantIssue(context, "awaiting_approval pendingAction requires a waiting Run");
        }

        if (
            pendingAction.status === "outcome_unknown"
            && run.status !== "waiting"
            && run.status !== "failed"
        ) {
            addInvariantIssue(context, "outcome_unknown pendingAction requires a waiting or failed Run");
        }

        if (run.status === "waiting" && pendingAction.status === "approved") {
            addInvariantIssue(context, "waiting Run cannot contain an approved pendingAction");
        }

        if (run.status === "completed" || run.status === "cancelled") {
            addInvariantIssue(context, "terminal Run cannot contain a pendingAction");
        }

        if (run.stopReason?.kind === "max_steps_exceeded") {
            addInvariantIssue(context, "maxSteps failure cannot contain a pendingAction");
        }

        if (
            step?.kind === "action"
            && step.action.actionId === pendingAction.action.actionId
        ) {
            addInvariantIssue(context, "pendingAction cannot repeat the latest completed Action");
        }
    }

    if (run.status === "waiting") {
        if (pendingAction === undefined && result?.kind !== "wait") {
            addInvariantIssue(context, "waiting Run requires a wait decision or a pending Action");
        }

        if (
            pendingAction !== undefined
            && pendingAction.status !== "awaiting_approval"
            && pendingAction.status !== "outcome_unknown"
        ) {
            addInvariantIssue(context, "waiting Run requires an approval or recovery pendingAction");
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
            const validPreviousStep = step?.kind === "action"
                || result?.kind === "wait"
                || result?.kind === "context_lookup";
            const maxSteps = goal.definition.executionPolicy.maxSteps;
            if (maxSteps <= 0 || run.stepCount < maxSteps || !validPreviousStep) {
                addInvariantIssue(context, "maxSteps failure requires a reached positive execution limit");
            }
        }
    }

    if (
        run.status === "running"
        && step?.kind === "decision"
        && result?.kind !== "wait"
        && result?.kind !== "context_lookup"
    ) {
        addInvariantIssue(
            context,
            "running Run can only preserve a resumed wait or Context Lookup decision",
        );
    }

    if (
        run.memoryRevision !== undefined
        && run.memoryRevision.sequence > run.committedThroughSequence
    ) {
        addInvariantIssue(
            context,
            "memoryRevision.sequence cannot exceed committedThroughSequence",
            ["state", "run", "memoryRevision", "sequence"],
        );
    }
}

/** 当前唯一支持的严格 Goal Snapshot Schema。 */
export const GoalSnapshotV1Schema = GoalSnapshotV1BaseSchema.superRefine(
    validateSnapshotInvariants,
);

export const INVALID_GOAL_SNAPSHOT_CODE = "INVALID_GOAL_SNAPSHOT" as const;

/**
 * 表示 Goal JSON 快照违反当前持久化协议的错误。
 *
 * @remarks
 * Codec 对历史版本、未知版本、非法结构和不成立的状态组合统一抛出该错误；
 * 读取失败不会执行迁移、删除或写回。
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
