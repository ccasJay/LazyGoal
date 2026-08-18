import { randomUUID } from "node:crypto";
import {
    mkdir,
    open,
    readFile,
    readdir,
    rename,
    stat,
    unlink,
} from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { AgentProfile } from "./agent-profile";
import type {
    Goal,
    GoalWorkflowState,
    RunState,
    RunStatus,
    StepResult,
} from "./domain";

const NonEmptyStringSchema = z.string().min(1);

const GoalV3MetadataSchema = z.object({
    schemaVersion: z.literal(3),
}).strict();

const GoalV2MetadataSchema = z.object({
    schemaVersion: z.literal(2),
}).strict();

const GoalV1MetadataSchema = z.object({
    schemaVersion: z.literal(1),
}).strict();

const GoalTaskSchema = z.object({
    objective: z.string(),
    completionCriteria: z.array(z.string()),
}).strict();

const AgentProfileSchema = z.object({
    id: z.string(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    systemPrompt: z.string(),
    instructions: z.array(z.string()),
    toolIds: z.array(z.string()),
}).strict();

const GoalMessageSchema = z.discriminatedUnion("role", [
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

const GoalV1MessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
}).strict();

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

const StepResultSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("continue"),
        summary: z.string(),
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        reason: z.string(),
    }).strict(),
    z.object({
        kind: z.literal("complete"),
        summary: z.string(),
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        error: z.string(),
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

const ActionStepRecordSchema = z.object({
    kind: z.literal("action"),
    action: ToolCallActionSchema,
    observation: ObservationSchema,
}).strict();

const DecisionStepRecordSchema = z.object({
    kind: z.literal("decision"),
    result: DecisionResultSchema,
}).strict();

const LegacyStepRecordSchema = z.object({
    kind: z.literal("legacy"),
    result: StepResultSchema,
}).strict();

const GoalV3StepRecordSchema = z.discriminatedUnion("kind", [
    ActionStepRecordSchema,
    DecisionStepRecordSchema,
]);

const MigratedGoalV3StepRecordSchema = z.discriminatedUnion("kind", [
    ActionStepRecordSchema,
    DecisionStepRecordSchema,
    LegacyStepRecordSchema,
]);

const RunStatusSchema = z.enum([
    "created",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
]);

const RunStateV2Schema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastStep: z.object({ result: StepResultSchema }).strict().optional(),
    stopReason: z.object({
        kind: z.literal("max_steps_exceeded"),
    }).strict().optional(),
}).strict();

const RunStopReasonV3Schema = z.discriminatedUnion("kind", [
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

const RunStateV3Schema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastStep: GoalV3StepRecordSchema.optional(),
    checkpoint: NonEmptyStringSchema.optional(),
    pendingAction: PendingActionSchema.optional(),
    stopReason: RunStopReasonV3Schema.optional(),
}).strict();

const MigratedRunStateV3Schema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastStep: MigratedGoalV3StepRecordSchema.optional(),
    checkpoint: NonEmptyStringSchema.optional(),
    pendingAction: PendingActionSchema.optional(),
    stopReason: RunStopReasonV3Schema.optional(),
}).strict();

const GoalWorkflowSchema = z.discriminatedUnion("phase", [
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
                proposal: GoalTaskSchema,
            }).strict(),
        ]),
    }).strict(),
    z.object({
        phase: z.literal("executing"),
        preparation: z.object({ status: z.literal("completed") }).strict(),
        task: GoalTaskSchema,
    }).strict(),
]);

function addInvariantIssue(
    context: z.RefinementCtx,
    message: string,
    path: PropertyKey[] = [],
): void {
    context.addIssue({ code: "custom", message, path });
}

function validateRunResultInvariant(
    run: z.infer<typeof RunStateV2Schema>,
    context: z.RefinementCtx,
): void {
    const result = run.lastStep?.result;

    if ((run.stepCount > 0) !== (result !== undefined)) {
        addInvariantIssue(
            context,
            "lastStep must exist if and only if stepCount is positive",
            ["state", "run", "lastStep"],
        );
    }

    if (run.status === "created" && result !== undefined) {
        addInvariantIssue(context, "created Run cannot have lastStep");
    }

    if (
        run.status === "running"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "running Run requires continue or resumed wait");
    }

    if (run.status === "waiting" && result?.kind !== "wait") {
        addInvariantIssue(context, "waiting Run requires a wait result");
    }

    if (run.status === "completed" && result?.kind !== "complete") {
        addInvariantIssue(context, "completed Run requires a complete result");
    }

    if (
        run.status === "cancelled"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "cancelled Run can only preserve continue or wait");
    }
}

const GoalV2SnapshotSchema = z.object({
    id: z.string(),
    metadata: GoalV2MetadataSchema,
    definition: z.object({
        intent: z.string(),
        profile: AgentProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: GoalWorkflowSchema,
        messages: z.array(GoalMessageSchema),
        run: RunStateV2Schema,
    }).strict(),
}).strict().superRefine((goal, context) => {
    const { run, workflow } = goal.state;
    const result = run.lastStep?.result;

    validateRunResultInvariant(run, context);

    if (
        workflow.phase !== "executing"
        && (
            run.status !== "created"
            || run.stepCount !== 0
            || run.lastStep !== undefined
            || run.stopReason !== undefined
        )
    ) {
        addInvariantIssue(
            context,
            "Preparation workflow requires a created Run with zero Steps",
            ["state", "run"],
        );
    }

    if (run.status !== "failed" && run.stopReason !== undefined) {
        addInvariantIssue(context, "stopReason is only valid for a failed Run");
    }

    if (run.status === "failed") {
        if (run.stopReason === undefined) {
            if (result?.kind !== "fail") {
                addInvariantIssue(context, "failed Run requires a fail result");
            }
        } else {
            const maxSteps = goal.definition.executionPolicy.maxSteps;

            if (result?.kind !== "continue" && result?.kind !== "wait") {
                addInvariantIssue(
                    context,
                    "maxSteps failure must preserve a continue or wait result",
                );
            }

            if (maxSteps <= 0 || run.stepCount < maxSteps) {
                addInvariantIssue(
                    context,
                    "maxSteps failure requires a reached positive execution limit",
                );
            }
        }
    }
});

type V3InvariantGoal = {
    readonly definition: {
        readonly executionPolicy: { readonly maxSteps: number };
    };
    readonly state: {
        readonly workflow: GoalWorkflowState;
        readonly run: RunState;
    };
};

function validateV3Invariants(
    input: unknown,
    context: z.RefinementCtx,
): void {
    const goal = input as V3InvariantGoal;
    const { run, workflow } = goal.state;
    const step = run.lastStep;
    const taggedStep = step !== undefined && "kind" in step ? step : undefined;
    const result = taggedStep?.kind === "decision" || taggedStep?.kind === "legacy"
        ? taggedStep.result
        : undefined;

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
            taggedStep?.kind === "action"
            && taggedStep.action.actionId === pendingAction.action.actionId
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
            const validPreviousStep = taggedStep?.kind === "action"
                || (taggedStep?.kind === "legacy"
                    && (result?.kind === "continue" || result?.kind === "wait"));

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
        && taggedStep?.kind === "decision"
        && result?.kind !== "wait"
    ) {
        addInvariantIssue(
            context,
            "running Run can only preserve a resumed wait decision",
        );
    }
}

const GoalV3SnapshotBaseSchema = z.object({
    id: z.string(),
    metadata: GoalV3MetadataSchema,
    definition: z.object({
        intent: z.string(),
        profile: AgentProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: GoalWorkflowSchema,
        messages: z.array(GoalMessageSchema),
        run: RunStateV3Schema,
    }).strict(),
}).strict();

const MigratedGoalV3SnapshotBaseSchema = z.object({
    id: z.string(),
    metadata: GoalV3MetadataSchema,
    definition: z.object({
        intent: z.string(),
        profile: AgentProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: GoalWorkflowSchema,
        messages: z.array(GoalMessageSchema),
        run: MigratedRunStateV3Schema,
    }).strict(),
}).strict();

const GoalV3SnapshotSchema = GoalV3SnapshotBaseSchema.superRefine(
    validateV3Invariants,
);

const MigratedGoalV3SnapshotSchema = MigratedGoalV3SnapshotBaseSchema.superRefine(
    validateV3Invariants,
);

const GoalV1RunSchema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastResult: StepResultSchema.optional(),
}).strict();

const GoalV1SnapshotSchema = z.object({
    id: z.string(),
    metadata: GoalV1MetadataSchema,
    task: GoalTaskSchema,
    profile: AgentProfileSchema,
    messages: z.array(GoalV1MessageSchema),
    run: GoalV1RunSchema,
}).strict().superRefine((goal, context) => {
    const { run } = goal;
    const result = run.lastResult;

    if ((run.stepCount > 0) !== (result !== undefined)) {
        addInvariantIssue(
            context,
            "v1 lastResult must exist if and only if stepCount is positive",
            ["run", "lastResult"],
        );
    }

    if (run.status === "created" && (run.stepCount !== 0 || result !== undefined)) {
        addInvariantIssue(context, "v1 created Run cannot contain progress");
    }

    if (
        run.status === "running"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "v1 running Run requires continue or resumed wait");
    }

    if (run.status === "waiting" && result?.kind !== "wait") {
        addInvariantIssue(context, "v1 waiting Run requires a wait result");
    }

    if (run.status === "completed" && result?.kind !== "complete") {
        addInvariantIssue(context, "v1 completed Run requires a complete result");
    }

    if (run.status === "failed" && result?.kind !== "fail") {
        addInvariantIssue(context, "v1 failed Run requires a fail result");
    }

    if (
        run.status === "cancelled"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "v1 cancelled Run can only preserve continue or wait");
    }
});

function migrateV1ToV2Goal(
    goal: z.infer<typeof GoalV1SnapshotSchema>,
) {
    return {
        id: goal.id,
        metadata: { schemaVersion: 2 },
        definition: {
            intent: goal.task.objective,
            profile: structuredClone(goal.profile),
            executionPolicy: { maxSteps: 0 },
        },
        state: {
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: structuredClone(goal.task),
            },
            messages: goal.messages.map((message) => message.role === "user"
                ? { role: "user", content: message.content }
                : {
                    role: "assistant",
                    assistant: { profileId: goal.profile.id },
                    content: message.content,
                }),
            run: {
                id: goal.run.id,
                status: goal.run.status,
                stepCount: goal.run.stepCount,
                ...(goal.run.lastResult === undefined
                    ? {}
                    : { lastStep: { result: goal.run.lastResult } }),
            },
        },
    };
}

function deriveCheckpoint(result: StepResult | undefined): string | undefined {
    return result?.kind === "continue" ? result.summary : undefined;
}

function migrateV2ToV3Goal(
    goal: z.infer<typeof GoalV2SnapshotSchema>,
): Goal {
    const legacyResult = goal.state.run.lastStep?.result;
    const checkpoint = deriveCheckpoint(legacyResult);

    return {
        id: goal.id,
        metadata: { schemaVersion: 3 },
        definition: {
            intent: goal.definition.intent,
            profile: normalizeAgentProfile(goal.definition.profile),
            executionPolicy: structuredClone(goal.definition.executionPolicy),
        },
        state: {
            workflow: structuredClone(goal.state.workflow),
            messages: structuredClone(goal.state.messages),
            run: {
                id: goal.state.run.id,
                status: goal.state.run.status,
                stepCount: goal.state.run.stepCount,
                ...(goal.state.run.lastStep === undefined
                    ? {}
                    : {
                        lastStep: {
                            kind: "legacy" as const,
                            result: structuredClone(goal.state.run.lastStep.result),
                        },
                    }),
                ...(checkpoint === undefined ? {} : { checkpoint }),
                ...(goal.state.run.stopReason === undefined
                    ? {}
                    : { stopReason: structuredClone(goal.state.run.stopReason) }),
            },
        },
    };
}

function normalizeAgentProfile(
    profile: z.infer<typeof AgentProfileSchema>,
): AgentProfile {
    return {
        id: profile.id,
        ...(profile.name === undefined ? {} : { name: profile.name }),
        ...(profile.description === undefined
            ? {}
            : { description: profile.description }),
        systemPrompt: profile.systemPrompt,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };
}

/**
 * Goal 的版本化持久化协议。
 *
 * @remarks
 * 解码器先读取 `schemaVersion` 再选择对应的严格 Schema。合法 v1/v2 会在
 * 内存中依次迁移为 v3；迁移产生的 `legacy` Step 只允许出现在迁移结果中，
 * 不允许新协议直接写入。每一层对象都拒绝未声明字段，未知版本和损坏快照
 * 均验证失败。
 */
export const GoalSnapshotSchema = z.unknown().transform((input, context) => {
    const metadata = typeof input === "object" && input !== null
        ? Reflect.get(input, "metadata")
        : undefined;
    const schemaVersion = typeof metadata === "object" && metadata !== null
        ? Reflect.get(metadata, "schemaVersion")
        : undefined;

    if (schemaVersion === 1) {
        const result = GoalV1SnapshotSchema.safeParse(input);

        if (result.success) {
            return migrateV2ToV3Goal(
                GoalV2SnapshotSchema.parse(migrateV1ToV2Goal(result.data)),
            );
        }

        addInvariantIssue(context, "Invalid schemaVersion 1 Goal snapshot");
        return z.NEVER;
    }

    if (schemaVersion === 2) {
        const result = GoalV2SnapshotSchema.safeParse(input);

        if (result.success) {
            return migrateV2ToV3Goal(result.data);
        }

        addInvariantIssue(context, "Invalid schemaVersion 2 Goal snapshot");
        return z.NEVER;
    }

    if (schemaVersion === 3) {
        const result = GoalV3SnapshotSchema.safeParse(input);

        if (result.success) {
            return result.data;
        }

        addInvariantIssue(context, "Invalid schemaVersion 3 Goal snapshot");
        return z.NEVER;
    }

    addInvariantIssue(context, "Unknown Goal snapshot schemaVersion");
    return z.NEVER;
}).transform((input, context) => {
    const result = MigratedGoalV3SnapshotSchema.safeParse(input);

    if (!result.success) {
        addInvariantIssue(context, "Invalid migrated v3 Goal snapshot");
        return z.NEVER;
    }

    return result.data as Goal;
});

export const INVALID_GOAL_SNAPSHOT_CODE = "INVALID_GOAL_SNAPSHOT" as const;

/**
 * 表示 Goal JSON 快照违反持久化协议的错误。
 *
 * @remarks
 * 文件系统本身的读写错误不使用该类型，以便调用方区分协议损坏和 I/O 故障。
 */
export class GoalSnapshotProtocolError extends Error {
    readonly code = INVALID_GOAL_SNAPSHOT_CODE;

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "GoalSnapshotProtocolError";
    }
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
}

/**
 * 让尚未升级的当前 Runtime 写入路径先回到 v2 解码分支。
 *
 * @remarks
 * 该兼容层只处理 schemaVersion 3 中旧的 `legacy` StepRecord，且不
 * 丢弃 checkpoint、pendingAction 等 v3 字段；包含这些字段时仍由严格 v3
 * Schema 拒绝。公开 `GoalSnapshotSchema` 仍拒绝直接写入 legacy Step。
 */
function normalizeLegacyRuntimeSnapshot(input: unknown): unknown {
    if (!isRecord(input)) {
        return input;
    }

    const metadata = input.metadata;
    const state = input.state;
    const run = isRecord(state) ? state.run : undefined;
    const lastStep = isRecord(run) ? run.lastStep : undefined;

    if (
        !isRecord(metadata)
        || metadata.schemaVersion !== 3
        || !isRecord(state)
        || !isRecord(run)
        || !isRecord(lastStep)
        || !("kind" in lastStep)
        || lastStep.kind !== "legacy"
        || "checkpoint" in run
        || "pendingAction" in run
    ) {
        return input;
    }

    return {
        ...input,
        metadata: { schemaVersion: 2 },
        state: {
            ...state,
            run: {
                id: run.id,
                status: run.status,
                stepCount: run.stepCount,
                lastStep: {
                    result: lastStep.result,
                },
                ...(run.stopReason === undefined
                    ? {}
                    : { stopReason: run.stopReason }),
            },
        },
    };
}

/**
 * 解码并结构化克隆一个版本化 Goal 快照。
 *
 * @param input - v3 Goal 或仍符合旧协议的 v1/v2 快照。
 * @returns 与输入隔离的 v3 Goal；旧版本输入不会被原地修改。
 * @throws 输入版本未知、结构损坏或违反跨字段不变量时抛出 ZodError。
 */
export function cloneValidatedGoal(input: unknown): Goal {
    const normalizedInput = normalizeLegacyRuntimeSnapshot(input);
    let parsed: Goal;

    try {
        parsed = GoalSnapshotSchema.parse(normalizedInput);
    } catch (error) {
        const migrated = MigratedGoalV3SnapshotSchema.safeParse(normalizedInput);

        if (!migrated.success) {
            throw error;
        }

        parsed = migrated.data as Goal;
    }

    parsed = structuredClone(parsed);

    return {
        ...parsed,
        state: {
            ...parsed.state,
            run: {
                id: parsed.state.run.id,
                status: parsed.state.run.status,
                stepCount: parsed.state.run.stepCount,
                ...(parsed.state.run.lastStep === undefined
                    ? {}
                    : { lastStep: parsed.state.run.lastStep }),
                ...(parsed.state.run.checkpoint === undefined
                    ? {}
                    : { checkpoint: parsed.state.run.checkpoint }),
                ...(parsed.state.run.pendingAction === undefined
                    ? {}
                    : { pendingAction: parsed.state.run.pendingAction }),
                ...(parsed.state.run.stopReason === undefined
                    ? {}
                    : { stopReason: parsed.state.run.stopReason }),
            },
        },
    };
}

/**
 * Goal 聚合的持久化边界。
 *
 * @remarks
 * GoalStore 以 goalId 定位一个 Goal 的最新完整快照，不提供历史或事件查询。
 * 对同一 ID 再次保存会覆盖先前版本，实现必须在 resolve 前完成本次保存。
 */
export interface GoalStore {
    /**
     * 校验并保存一个完整 Goal 快照。
     *
     * @param goal - 需要成为最新版本的完整 Session 聚合。
     * @throws 快照不符合协议或底层存储写入失败时抛出异常。
     *
     * @example
     * ```ts
     * await store.save(goal);
     * ```
     */
    save(goal: Goal): Promise<void>;

    /**
     * 恢复指定 Goal 的最新完整快照。
     *
     * @param goalId - Session 的稳定标识。
     * @returns 最新 v3 快照；v1/v2 数据只在返回值中迁移，不因恢复而写回。
     * @throws 已存在快照损坏或底层存储读取失败时抛出异常。
     */
    restore(goalId: string): Promise<Goal | undefined>;
}

/**
 * 可恢复 Goal 列表中的轻量摘要。
 *
 * @remarks
 * `updatedAt` 是正式 JSON 快照最近一次成功原子替换后的文件修改时间，使用
 * ISO 8601 UTC 字符串表示。条目不包含完整 Goal，调用方需要通过 `goalId`
 * 再次恢复快照；终态 Run 不会出现在列表中。
 *
 * @example
 * ```ts
 * const entry: GoalCatalogEntry = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     intent: "实现恢复能力",
 *     workflowPhase: "planning",
 *     runStatus: "waiting",
 *     updatedAt: "2026-08-17T00:00:00.000Z",
 * };
 * ```
 */
export interface GoalCatalogEntry {
    /** Goal 的稳定标识，用于后续 restore。 */
    readonly goalId: string;
    /** 当前快照中 Run 的稳定标识。 */
    readonly runId: string;
    /** Goal 创建时冻结的原始意图。 */
    readonly intent: string;
    /** 当前 Preparation/Execution 工作流阶段。 */
    readonly workflowPhase: Goal["state"]["workflow"]["phase"];
    /** 当前 Run 状态；该列表不会返回三个终态。 */
    readonly runStatus: RunStatus;
    /** 最近成功快照的 ISO 8601 UTC 修改时间。 */
    readonly updatedAt: string;
}

/**
 * 查询可恢复 Goal 摘要的目录边界。
 *
 * @remarks
 * 目录只反映最近成功持久化的完整快照，不提供历史版本或事件查询；实现
 * 必须对正式快照执行完整协议校验，损坏快照应阻止本次查询并暴露协议错误。
 *
 * @example
 * ```ts
 * const catalog: GoalCatalog = new JsonFileGoalStore(".lazygoal/goals");
 * const resumable = await catalog.listResumable();
 * ```
 */
export interface GoalCatalog {
    /**
     * 扫描并按最近更新时间倒序返回非终态 Goal。
     *
     * @returns 按 `mtime` 降序排列的摘要；相同时间使用 `goalId` 升序。
     * @throws 正式 JSON 快照损坏或目录读取失败时抛出异常；目录不存在时返回空列表。
     */
    listResumable(): Promise<readonly GoalCatalogEntry[]>;
}

/**
 * 单进程内的 Goal 快照存储。
 *
 * @remarks
 * 保存和恢复都会经过 Schema 校验并进行结构化克隆，调用方不能通过修改
 * 原对象或恢复结果污染 Store 内部保存的快照。数据只存在于当前 Store
 * 实例的内存中，不支持跨实例或进程恢复。
 */
export class InMemoryGoalStore implements GoalStore {
    private readonly snapshots = new Map<string, Goal>();

    async save(goal: Goal): Promise<void> {
        const snapshot = cloneValidatedGoal(goal);
        this.snapshots.set(snapshot.id, snapshot);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        const snapshot = this.snapshots.get(goalId);

        if (snapshot === undefined) {
            return undefined;
        }

        return cloneValidatedGoal(snapshot);
    }
}

/**
 * 基于本地 JSON 文件的 Goal 最新快照存储。
 *
 * @remarks
 * 每个 Goal 只对应一个文件，文件名由 goalId 的 base64url 编码生成；
 * 写入通过同目录临时文件和 rename 完成，避免恢复到半写入快照。
 *
 * 多个写入者并发保存同一 Goal 时采用最后完成替换者覆盖的语义，不提供
 * 乐观锁、租约或版本冲突检测。文件系统错误原样传播；非法 JSON、Schema
 * 不匹配、未知版本和文件内 Goal ID 不一致统一抛出
 * {@link GoalSnapshotProtocolError}。恢复 v1 不改写文件，之后显式保存恢复
 * 结果时才以 v3 原子替换。
 */
export class JsonFileGoalStore implements GoalStore, GoalCatalog {
    /**
     * @param directory - 保存 Goal JSON 文件的目录；保存时按需递归创建。
     */
    constructor(private readonly directory: string) {}

    /**
     * 校验并原子替换指定 Goal 的最新 JSON 快照。
     *
     * @throws Goal 不符合快照协议时抛出 GoalSnapshotProtocolError；目录创建、
     * 临时文件写入或替换失败时传播原始文件系统错误。
     */
    async save(goal: Goal): Promise<void> {
        const snapshot = this.cloneFileSnapshot(goal);
        const filePath = this.filePath(snapshot.id);
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

        await mkdir(this.directory, { recursive: true });

        try {
            const handle = await open(temporaryPath, "wx", 0o600);

            try {
                await handle.writeFile(
                    `${JSON.stringify(snapshot, null, 2)}\n`,
                    "utf8",
                );
                await handle.sync();
            } finally {
                await handle.close();
            }

            await rename(temporaryPath, filePath);
        } catch (error) {
            await unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }

    /**
     * 扫描目录中的正式快照并生成稳定的可恢复候选项。
     *
     * @returns 过滤 `completed`、`failed`、`cancelled` 后按最近快照时间倒序
     * 排列的摘要；同一时间按 `goalId` 升序。`.tmp` 和非普通文件会被忽略。
     * @throws JSON、Goal Schema 或跨字段不变量损坏时抛出
     * `GoalSnapshotProtocolError`；目录或文件读取失败时传播文件系统错误。
     */
    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        let files;

        try {
            files = await readdir(this.directory, { withFileTypes: true });
        } catch (error) {
            if (
                error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return [];
            }

            throw error;
        }

        const candidates: Array<{
            readonly entry: GoalCatalogEntry;
            readonly mtimeMs: number;
        }> = [];

        const snapshotFiles = files
            .filter((file) => file.isFile() && file.name.endsWith(".json"))
            .sort((left, right) => left.name < right.name
                ? -1
                : left.name > right.name
                    ? 1
                    : 0);

        for (const file of snapshotFiles) {
            const filePath = join(this.directory, file.name);
            const content = await readFile(filePath, "utf8");
            const goal = this.decodeSnapshot(content, file.name);

            if (this.filePath(goal.id) !== filePath) {
                throw new GoalSnapshotProtocolError(
                    `Goal snapshot filename does not match Goal ID in "${file.name}"`,
                );
            }

            const fileStats = await stat(filePath);
            const runStatus = goal.state.run.status;

            if (
                runStatus === "completed"
                || runStatus === "failed"
                || runStatus === "cancelled"
            ) {
                continue;
            }

            candidates.push({
                entry: {
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    intent: goal.definition.intent,
                    workflowPhase: goal.state.workflow.phase,
                    runStatus,
                    updatedAt: new Date(fileStats.mtimeMs).toISOString(),
                },
                mtimeMs: fileStats.mtimeMs,
            });
        }

        candidates.sort((left, right) => {
            const timeDifference = right.mtimeMs - left.mtimeMs;

            if (timeDifference !== 0) {
                return timeDifference;
            }

            return left.entry.goalId < right.entry.goalId
                ? -1
                : left.entry.goalId > right.entry.goalId
                    ? 1
                    : 0;
        });

        return candidates.map(({ entry }) => entry);
    }

    /**
     * 从 JSON 文件恢复并校验最新 Goal 快照。
     *
     * @returns 文件不存在时返回 `undefined`，否则返回与存储隔离的 v3 Goal。
     * @throws 快照违反协议时抛出 GoalSnapshotProtocolError；其他读取错误原样传播。
     */
    async restore(goalId: string): Promise<Goal | undefined> {
        let content: string;

        try {
            content = await readFile(this.filePath(goalId), "utf8");
        } catch (error) {
            if (
                error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return undefined;
            }

            throw error;
        }

        let goal: Goal;

        goal = this.decodeSnapshot(content, goalId);

        if (goal.id !== goalId) {
            throw new GoalSnapshotProtocolError(
                `Goal snapshot ID mismatch: expected "${goalId}", got "${goal.id}"`,
            );
        }

        return goal;
    }

    private filePath(goalId: string): string {
        const encodedGoalId = Buffer.from(goalId, "utf8").toString("base64url");
        return join(this.directory, `${encodedGoalId}.json`);
    }

    private decodeSnapshot(content: string, label: string): Goal {
        try {
            return cloneValidatedGoal(JSON.parse(content));
        } catch (error) {
            throw new GoalSnapshotProtocolError(
                `Invalid Goal snapshot for "${label}"`,
                { cause: error },
            );
        }
    }

    private cloneFileSnapshot(goal: Goal): Goal {
        try {
            return cloneValidatedGoal(goal);
        } catch (error) {
            throw new GoalSnapshotProtocolError(
                "Goal does not satisfy the snapshot schema",
                { cause: error },
            );
        }
    }
}
