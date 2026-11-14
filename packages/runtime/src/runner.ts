import type { ModelContextFrameForStage, PublicTextBlock } from "./step-executor";
import {
    applyPendingSessionInputs,
    clearPendingSessionInputs,
    findSessionInputRecord,
    nextSessionInputSequence,
    pauseQueuedMessagesForTerminalRun,
    removeQueuedMessage,
    withQueuePause,
    type SessionInputDigest,
    type SessionInputRecord,
} from "./session-input";
import { createHash, randomUUID } from "node:crypto";
import { ProgramSandboxAbortedError, programWorkerHash, runProgramSandbox } from "../../sandbox/src/index";

import type {
    AgentDecision,
    PendingActionBatch,
    ExecutionErrorCode,
    Goal,
    GoalState,
    JsonValue,
    RunInput,
    RunExecutionOptions,
    RunRef,
    RunState,
    RunInterruption,
    RunSteerInput,
    ToolCallAction,
    WorkingMemoryPatch,
    GoalProtocolValidator,
    AskUserQuestion,
    GoalTask,
    PendingInteractionAskUser,
    PendingInteractionTaskApproval,
    PendingThink,
    PendingModelRepair,
    AssistantMessagePurpose,
    GoalMessageSource,
} from "./domain";
import {
    appendGoalMessage,
    createModelTextSource,
    createStageOutputSource,
} from "./goal-message";
import { validateAndReduceContextNotes, type RuntimeContextNote, type ContextNoteSource } from "./context-notes";
import type { ModelContextCheckpointResult } from "./domain";
import type { GoalStore } from "./goal-store";
import type {
    DecideStageResult,
    StepExecutionInput,
    StepExecutor,
    ThinkExchange,
    ThinkStageResult,
    CompletionReviewResult,
} from "./step-executor";
import { CompletionReviewInputBudgetError } from "./step-executor";
import type {
    ExecutionStreamEventDraft,
    ExecutionStreamPublisher,
    StreamJsonValue,
} from "../../execution-stream/src/index";
import {
    CONTEXT_LOOKUP_CHAIN_LIMIT_CODE,
    CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE,
    ContextLookupProtocolError,
    assertContextLookupResultOwnership,
    createContextLookupId,
    getCommittedRunBoundaries,
    invokeContextLookup,
    normalizeContextLookupRequest,
    normalizeContextLookupResult,
    type ContextLookupPort,
    type ContextLookupResult,
} from "./context-retrieval";
import { canonicalJson, isJsonValue, isRecord } from "../../contracts/src/index";
import {
    decodeBoundAgentDecision,
    modelOutputBindings,
    normalizeAskUserRequest,
    validateModelOutputSemantics,
} from "../../model-contracts/src/index";

import type {
    AnyBoundToolDefinition,
    ToolExecutionContext,
    ToolObservation,
    ToolStreamEvent,
    PreparedToolAction as PreparedToolResult,
    ToolRegistration,
    ToolRegistry,
} from "../../tool-core/src/index";
import { TransientToolExecutionFailure } from "../../tool-core/src/index";
import type { ToolPolicy } from "./tool";
import { resolveAuthorizedToolDefinitions } from "./tool";
import {
    resolveEffectiveSandboxScope,
    type DerivedSandboxAccess,
    type EffectiveSandboxScope,
    type SandboxAccessRequest,
    type SandboxExecutionPlan,
} from "../../sandbox/src/index";
import {
    DEFAULT_PERMISSION_PROFILE,
    evaluatePermissionBoundary,
    isDestructiveCommand,
    type PermissionProfile,
} from "../../permission/src/index";

/**
 * 沙箱执行计划解析器接口。
 *
 * @remarks
 * Runner 在受限 Action 执行前调用该函数以获取核准的执行计划。
 *
 * @example
 * ```ts
 * const resolver: SandboxPlanResolver = async ({ workspaceRoot, action, effectiveScope }) => plan;
 * ```
 */
export type SandboxPlanResolver = (query: {
    readonly workspaceRoot: string;
    readonly action: ToolCallAction;
    readonly effectiveScope?: EffectiveSandboxScope | undefined;
}) => Promise<SandboxExecutionPlan | undefined> | SandboxExecutionPlan | undefined;
import {
    ContextWindowRejectedError,
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    TransientModelRequestFailure,
    ModelRequestFailure,
    type ExecutionControl,
} from "../../execution-control/src/index";
import {
    ModelRequestRetriesExhaustedError,
    type ModelRequestAttemptFailure,
} from "./model-request-failure";
import {
    createRuntimeFeedback,
    createMemoryPatchFeedback,
    ModelStageFeedbackError,
    type RuntimeFeedback,
    type RuntimeFeedbackOrigin,
    type RuntimeFeedbackStage,
    type RuntimeFeedbackIssue,
} from "./runtime-feedback";
import { transition } from "./transition";
import {
    createProgramCallEnvelope,
    resolveActionExecutionAction,
    resolveProgramCallRevision,
    type ProgramCallRevision,
} from "./action-approval";
import { findTools, type ToolDiscoveryResult } from "./tool-discovery";
import {
    createInitialRunStage,
    reviseRunStage,
    acceptCurrentRunStage,
    rejectCurrentRunStage,
    RunStageTransitionError,
    type RunStageState,
} from "./run-stage";
import {
    acceptRunPlanStage,
    reopenRunPlanStage,
    reviseRunPlanExecution,
    reviseRunPlanRoute,
    updateRunPlanStage,
    RunPlanTransitionError,
} from "./run-plan";
import {
    createEmptyGoalPlan,
    reduceGoalPlan,
} from "./goal-plan";
import { canUpdateGoalPlan } from "./run-mode-capabilities";
import {
    recordToolInputDiagnostic,
    type ToolInputDiagnostic,
} from "./tool-input-diagnostic";
import {
    TrajectoryAppendError,
    TrajectoryCommitMarkerError,
    allocateDiagnosticTraceRecord,
    trajectoryWatermark,
    type DiagnosticTraceSink,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type ModelContextFramePayload,
    type ModelContextStage,
    type TrajectoryStore,
} from "./trajectory";
import {
    createSupersedeScopeOperation,
    normalizeMemoryPatch,
    WorkingMemoryPatchError,
    type NormalizedWorkingMemoryPatch,
    type WorkingMemoryLimitsInput,
    validateMemoryPatchPhase,
} from "../../working-memory/src/index";
import { WorkingMemorySession } from "./working-memory-session";
import { resolveEvidenceObservation, EvidenceGateError } from "./evidence-gate";
import {
    buildCommittedEvidenceIndex,
    validateContextLookupSourceReferences,
} from "./evidence-gate";
import type { CommittedEvidenceIndex } from "./evidence-gate";
import {
    TrajectoryCheckpointCommitter,
    withLatestSessionState,
    type AcceptedMemoryPatchInput,
    type TrajectoryCheckpointCommitResult,
    type TrajectoryCheckpointCommitterPort,
} from "./trajectory-checkpoint-committer";
import {
    advanceContextEpoch,
    selectLatestConversationStart,
    toEpochRange,
} from "./context-epoch";
import {
    evaluateCompactionBody,
    renderCompactionTranscript,
    selectCompactionWindow,
    type ContextCompactionInput,
} from "./context-compaction";
import { withGoalMutationGate } from "./goal-mutation-gate";
import { RunRecoveryReader } from "./run-recovery-reader";
import {
    createSandboxGrantMatcher,
    type ProjectPermissionProfileStore,
    type SandboxGrantLookup,
} from "./tool-grant";

const EMPTY_TOOL_REGISTRY: ToolRegistry = {
    get: () => undefined,
};

const ALLOW_ALL_TOOL_POLICY: ToolPolicy = {
    evaluate: () => "allow",
};

class RunnerExecutionError extends Error {
    readonly code: ExecutionErrorCode;

    /**
     * 抛出该错误时已经提交、但尚未被失败收尾采纳的 Goal。
     *
     * @remarks
     * 失败收尾默认基于"进入本次阶段调用之前"的 Goal 提交检查点；若阶段调用中途已提交了
     * 额外事实（例如零调用 Assistant 消息），必须用该字段指明应当被采纳的已提交 Goal，
     * 否则那些事实会被旧快照覆盖。省略时沿用调用方的 Goal。
     */
    readonly committedGoal?: Goal | undefined;

    constructor(
        code: ExecutionErrorCode,
        message: string,
        readonly issues?: readonly RuntimeFeedbackIssue[],
        committedGoal?: Goal,
    ) {
        super(message.trim().length > 0 ? message : code);
        this.name = "RunnerExecutionError";
        this.code = code;
        this.committedGoal = committedGoal;
    }
}

class ProgramWaitingError extends Error {}

class ProgramReservationError extends Error {
    constructor(cause: unknown) {
        super("PTC_TIME_RESERVATION_FAILED", { cause });
    }
}

class ProgramResourceError extends Error {
    constructor(readonly code: "PTC_FRAME_LIMIT" | "PTC_LOG_LIMIT" | "PTC_TIME_LIMIT") {
        super(code);
    }
}

class PendingSteerAcceptedError extends Error {}
class StaleStageRequestError extends Error {
    constructor(readonly goal: Goal) {
        super("Stage state changed while the model request was in flight; the call was not applied.");
    }
}

function stageRequestKey(goal: Goal): string {
    const { id, currentStage, planRoute } = goal.state.run;
    return JSON.stringify({
        runId: id,
        stage: currentStage === undefined ? null : [currentStage.stageId, currentStage.revision, currentStage.status],
        route: planRoute === undefined ? null : [planRoute.revision, planRoute.nextStageIndex],
    });
}
class RunInterruptAcceptedError extends Error {}

/**
 * Steer 命令已保存或被明确拒绝的 Runtime 结果。
 *
 * @remarks `ok: true` 只确认消息已持久化受理，不代表已进入模型输入。
 * @example
 * ```ts
 * const result: SteerInputResult = { ok: true, goalId: "goal-1", runId: "run-1", messageId: "message-1", existing: false };
 * ```
 */
export type SteerInputResult =
    | { readonly ok: true; readonly goalId: string; readonly runId: string; readonly messageId: string; readonly existing: boolean }
    | {
        readonly ok: false;
        readonly error:
            | "RUN_NOT_FOUND"
            | "RUN_NOT_RUNNING"
            | "STEER_CONFLICT"
            | "QUEUE_REVISION_MISMATCH"
            | "QUEUED_MESSAGE_NOT_FOUND"
            | "RUN_CONTROL_UNAVAILABLE";
    };

/** Run Interrupt 命令已持久化受理或被明确拒绝的结果。 */
export type InterruptRunResult =
    | { readonly ok: true; readonly goalId: string; readonly runId: string; readonly requestId: string; readonly existing: boolean }
    | { readonly ok: false; readonly error: "RUN_NOT_FOUND" | "RUN_NOT_RUNNING" | "INTERRUPT_CONFLICT" };

class StageExecutionFailure extends Error {
    constructor(
        readonly original: unknown,
        /** 包装前已被采纳的已提交 Goal，用于失败收尾保留阶段中途提交的事实。 */
        readonly committedGoal?: Goal,
    ) {
        super(original instanceof Error ? original.message : String(original));
        this.name = "StageExecutionFailure";
    }
}

/** 触发一轮上下文提炼的来源。 */
type ContextCompactionTrigger = "threshold" | "context_window" | "command";

/** 一轮提炼的内部结论；`goal` 只在确实提交新 Epoch 时携带。 */
type ContextCompactionStep =
    | { readonly kind: "compacted"; readonly goal: Goal }
    | {
        readonly kind: "skipped";
        readonly reason:
            | "unsupported"
            | "not_running"
            | "pending"
            | "capacity_unavailable"
            | "below_threshold"
            | "no_window"
            | "empty"
            | "invalid"
            | "not_reduced"
            | "failed"
            | "source_unavailable";
    };

/**
 * 用户命令触发的上下文整理结果。
 *
 * @remarks
 * `compacted` 携带新 Epoch 的序号与窗口起点；`unavailable` 用稳定原因说明为何本次
 * 没有推进窗口，调用方据此生成面向用户的反馈。
 *
 * @example
 * ```ts
 * const outcome = await runner.compactContextNow({ goalId: "goal-1", runId: "run-1" });
 * if (outcome.kind === "unavailable") console.log(outcome.reason);
 * ```
 */
export type ContextCompactionCommandOutcome =
    | {
        readonly kind: "compacted";
        readonly epochNumber: number;
        readonly conversationStartIndex: number;
    }
    | {
        readonly kind: "unavailable";
        readonly reason:
            | "unsupported"
            | "goal_not_found"
            | "run_mismatch"
            | "not_at_safe_boundary"
            | "empty_window"
            | "not_reduced";
    };

class StageCheckpointFailure extends Error {
    constructor(readonly original: unknown) {
        super(original instanceof Error ? original.message : String(original));
        this.name = "StageCheckpointFailure";
    }
}

type NormalizedExecution = {
    readonly decision: AgentDecision;
    readonly thought?: string;
    readonly preparedToolAction?: PreparedToolAction;
    readonly acceptedContextNotes?: readonly RuntimeContextNote[];
    /** 本次 Decide 实际产生的模型调用身份；缺省表示执行方没有报告。 */
    readonly modelCallId?: string;
};

function extractExistingContextNotesFromEvents(events: readonly TrajectoryEvent[]): readonly RuntimeContextNote[] {
    const notesMap = new Map<string, RuntimeContextNote>();
    for (const event of events) {
        if (event.eventType === "context_note_declared") {
            const p = event.payload;
            notesMap.set(p.noteId, {
                noteId: p.noteId,
                revision: p.revision,
                category: p.category,
                content: p.content,
                ...(p.reason !== undefined ? { reason: p.reason } : {}),
                ...(p.stageId !== undefined ? { stageId: p.stageId } : {}),
                source: p.source as ContextNoteSource,
                ...(p.supersedesNoteId !== undefined ? { supersedesNoteId: p.supersedesNoteId } : {}),
            });
        }
    }
    return [...notesMap.values()];
}

function toContextNoteEventDrafts(
    notes: readonly RuntimeContextNote[] | undefined,
    goalId: string,
    runId: string,
    executionUnitId: string,
): readonly TrajectoryEventDraft[] {
    if (!notes || notes.length === 0) return [];
    return notes.map((note) => ({
        goalId,
        runId,
        phase: "executing",
        executionUnitId,
        eventType: "context_note_declared",
        payload: {
            type: "context_note_declared",
            noteId: note.noteId,
            revision: note.revision,
            category: note.category,
            content: note.content,
            ...(note.reason !== undefined ? { reason: note.reason } : {}),
            ...(note.stageId !== undefined ? { stageId: note.stageId } : {}),
            source: note.source,
            ...(note.supersedesNoteId !== undefined ? { supersedesNoteId: note.supersedesNoteId } : {}),
        },
    }));
}

let executionUnitCounter = 0;

function createExecutionUnitId(): string {
    executionUnitCounter += 1;
    return `execution-unit-${Date.now().toString(36)}-${executionUnitCounter.toString(36)}`;
}

async function waitForRetry(delayMs: number, control?: ExecutionControl): Promise<void> {
    throwIfAborted(control);
    if (delayMs === 0) return;
    await new Promise<void>((resolve, reject) => {
        const signal = control?.signal;
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        const onAbort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            reject(new ExecutionAbortedError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
    throwIfAborted(control);
}

function createThinkInputBoundary(
    input: StepExecutionInput,
    stepOrdinal: number,
): `sha256:${string}` {
    const goal = input.goal;
    const workingMemoryInput = input.workingMemory;
    let workingMemory: Omit<NonNullable<StepExecutionInput["workingMemory"]>, "derivedThroughSequence"> | undefined;
    if (workingMemoryInput !== undefined) {
        const { derivedThroughSequence: _derivedThroughSequence, ...stableMemory } = workingMemoryInput;
        workingMemory = stableMemory;
    }
    const boundary = {
        goalId: goal.id,
        stepOrdinal,
        definition: goal.definition,
        messages: goal.state.messages,
        run: {
            id: goal.state.run.id,
            mode: goal.state.run.mode,
            approvedTask: goal.state.run.approvedTask,
            stepCount: goal.state.run.stepCount,
            lastStep: goal.state.run.lastStep,
            contextEpoch: goal.state.run.contextEpoch,
            stageBinding: stageRequestKey(goal),
        },
        modelSelection: goal.state.modelSelection,
        goalPlan: goal.state.goalPlan,
        authorizedTools: input.authorizedTools,
        workingMemory,
        contextLookupResult: input.contextLookupResult,
    };
    const serialized = canonicalJson(boundary);
    return `sha256:${createHash("sha256").update(serialized, "utf8").digest("hex")}`;
}

function isStreamDeltaKind(kind: string): boolean {
    return kind.endsWith("_delta");
}

function streamCoalescingKey(
    executionUnitId: string | undefined,
    actionId: string | undefined,
    kind: string,
): string {
    return `${kind}:${executionUnitId ?? actionId ?? "run"}`;
}

function resolveExecutionControl(
    options: RunExecutionOptions,
    control?: ExecutionControl,
): ExecutionControl | undefined {
    if (control?.signal !== undefined) {
        return control;
    }

    if (options.signal !== undefined) {
        return options.authorizedActionId === undefined
            ? options
            : { signal: options.signal };
    }

    return control;
}

function hasOnlyKeys(
    value: Record<string, unknown>,
    keys: readonly string[],
): boolean {
    const allowed = new Set(keys);
    return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function invalidAgentDecision(message: string): never {
    throw new RunnerExecutionError("INVALID_AGENT_DECISION", message);
}

function isNonAdvancingFeedback(feedback: RuntimeFeedback): boolean {
    return feedback.code === "NO_USABLE_RESULT";
}

function createRunnerFeedbackError(
    error: unknown,
    goal: Goal,
    executionUnitId: string,
    stage: RuntimeFeedbackStage,
    origin: RuntimeFeedbackOrigin,
    constraints: readonly string[] = [],
): ModelStageFeedbackError {
    const code = error instanceof RunnerExecutionError ? error.code : "INVALID_AGENT_DECISION";
    const toolInputError = origin === "tool_input" && error instanceof RunnerExecutionError ? error : undefined;
    const message = origin === "tool_selection"
        ? "Select a Tool listed as available in this request."
        : origin === "tool_input"
            ? toolInputError?.message ?? "Correct the Tool input to match its supplied schema and constraints."
            : origin === "completion_evidence"
                ? "Use only committed evidence that satisfies every completion criterion."
                : "Return a decision that satisfies the active output contract and semantic rules.";
    return new ModelStageFeedbackError(createRuntimeFeedback({
        goalId: goal.id,
        runId: goal.state.run.id,
        executionUnitId,
        stepOrdinal: goal.state.run.stepCount + 1,
        stage,
        origin,
        code,
        attempt: 1,
        issues: toolInputError?.issues?.length
            ? toolInputError.issues.map((issue) => ({
                ...issue,
                path: ["result", "action", "input", ...issue.path],
            }))
            : [{
                code,
                path: origin === "tool_selection"
                    ? ["result", "action", "toolId"]
                    : origin === "tool_input"
                        ? ["result", "action", "input"]
                        : origin === "completion_evidence"
                            ? ["result", "completionEvidence"]
                            : ["result"],
                message,
            }],
        constraints,
    }),
    `${stage} decision failed ${origin} validation`,
    error);
}

function validateAgentDecision(
    value: unknown,
): AgentDecision {
    let decision: AgentDecision;
    try {
        decision = decodeBoundAgentDecision(value, modelOutputBindings);
    } catch (error) {
        if (error instanceof ExecutionAbortedError || isExecutionAbortedError(error)) throw error;
        return invalidAgentDecision(
            `AgentDecision 不符合生成绑定: ${formatDecisionBindingIssues(error)}`,
        );
    }
    const semanticIssues = validateModelOutputSemantics(decision);
    if (semanticIssues.length > 0) {
        return invalidAgentDecision(
            `AgentDecision 不符合语义规则: ${semanticIssues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
    }
    if (decision.kind === "context_lookup") {
        return normalizeContextLookupRequest(decision);
    }
    return decision;
}

function formatDecisionBindingIssues(error: unknown): string {
    if (isRecord(error) && Array.isArray(error.issues)) {
        return error.issues
            .map(issue => isRecord(issue)
                ? `${Array.isArray(issue.path) ? issue.path.join(".") : ""}: ${String(issue.message ?? issue.code)}`
                : String(issue))
            .join(", ");
    }
    return error instanceof Error ? error.message : String(error);
}

function isProtocolError(error: unknown): boolean {
    return isRecord(error) && error.code === "INVALID_LLM_RESPONSE";
}

function toStableExecutionError(error: unknown): RunnerExecutionError | undefined {
    if (error instanceof RunnerExecutionError) {
        return error;
    }

    if (error instanceof CompletionReviewInputBudgetError) {
        return new RunnerExecutionError(error.code, error.message);
    }

    if (error instanceof ModelStageFeedbackError) {
        const code = error.feedback.origin === "tool_selection"
            ? "TOOL_NOT_AUTHORIZED"
            : error.feedback.origin === "tool_input"
                ? "INVALID_TOOL_INPUT"
                : "INVALID_AGENT_DECISION";
        return new RunnerExecutionError(code, error.feedback.issues[0]?.message ?? error.feedback.code);
    }

    if (isProtocolError(error)) {
        return new RunnerExecutionError(
            "INVALID_AGENT_DECISION",
            error instanceof Error ? error.message : "AgentDecision 协议无效",
        );
    }

    if (error instanceof ModelRequestRetriesExhaustedError || error instanceof ModelRequestFailure) {
        return new RunnerExecutionError("MODEL_REQUEST_FAILED", error.message);
    }

    return undefined;
}

interface PreparedToolAction {
    readonly registration: ToolRegistration;
    readonly action: ToolCallAction;
    readonly policy: "allow" | "require_approval";
    readonly plan?: SandboxExecutionPlan;
    readonly inputDiagnostic?: ToolInputDiagnostic;
    resolveSandboxAccess?(control?: ExecutionControl): Promise<DerivedSandboxAccess | undefined> | DerivedSandboxAccess | undefined;
    execute(control?: ExecutionControl, plan?: SandboxExecutionPlan): Promise<ToolObservation>;
    stream?(control?: ExecutionControl, plan?: SandboxExecutionPlan): AsyncIterable<ToolStreamEvent>;
}

/**
 * 一次待执行 Action 的权限判定结果。
 *
 * @remarks
 * 三种结果都携带派生出的 `effectiveSandboxScope`：`allow` 直接暂存并执行，
 * `approval` 暂存为等待人工裁决，`deny` 只向模型回灌失败 Observation，不执行 Tool。
 */
type ActionAuthorization =
    | { readonly kind: "allow"; readonly effectiveSandboxScope: EffectiveSandboxScope }
    | {
        readonly kind: "approval";
        readonly approvalKind: "sandbox";
        readonly effectiveSandboxScope: EffectiveSandboxScope;
        readonly reason: string;
    }
    | {
        readonly kind: "deny";
        readonly effectiveSandboxScope: EffectiveSandboxScope;
        readonly reason: string;
    };

function isPlanRunAwaitingTaskApproval(goal: Goal): boolean {
    return goal.state.run.mode === "plan" && goal.state.run.approvedTask === undefined;
}

function resolveCommittedProgramCallRevision(
    events: readonly TrajectoryEvent[],
    program: Pick<NonNullable<RunState["pendingProgram"]>, "programId" | "executionUnitId">,
    callIndex: number,
    actionId: string,
): ProgramCallRevision | undefined {
    let latestDecision: Extract<TrajectoryEvent, { readonly eventType: "action_revised" }> | undefined;
    const executionUnitId = `${program.executionUnitId}:call:${callIndex}`;
    for (const event of events) {
        if (
            event.actionId !== actionId
            || (event.programId !== program.programId || event.callIndex !== callIndex)
                && event.executionUnitId !== executionUnitId
        ) {
            continue;
        }
        if (event.eventType === "action_revised") {
            latestDecision = event;
        } else if (
            event.eventType === "action_approved"
            || event.eventType === "action_rejected"
        ) {
            latestDecision = undefined;
        }
    }
    if (latestDecision === undefined) return undefined;
    return {
        reviewRef: latestDecision.payload.reviewRef,
        originalInput: latestDecision.payload.originalInput,
        finalInput: latestDecision.payload.finalInput,
        source: latestDecision.payload.revisionSource ?? "user",
    };
}

function prepareToolAction(
    goal: Goal,
    action: Extract<AgentDecision, { readonly kind: "tool_call" }>['action'],
    registry: ToolRegistry,
    policy: ToolPolicy,
    evaluatePolicy = true,
    control?: ExecutionControl,
    plan?: SandboxExecutionPlan,
    traceSink?: DiagnosticTraceSink,
): PreparedToolAction {
    throwIfAborted(control);

    if (!goal.definition.profile.toolIds.includes(action.toolId)) {
        throw new RunnerExecutionError(
            "TOOL_NOT_AUTHORIZED",
            `Tool "${action.toolId}" is not authorized by the frozen Profile`,
        );
    }

    const goalAuthorization = goal.definition.triggerContext?.authorization;
    if (goalAuthorization !== undefined && !goalAuthorization.toolIds.includes(action.toolId)) {
        throw new RunnerExecutionError(
            "TOOL_NOT_AUTHORIZED",
            `Tool "${action.toolId}" is outside the frozen Goal authorization`,
        );
    }

    if (!goal.state.run.exposedToolIds.includes(action.toolId)) {
        throw new RunnerExecutionError(
            "TOOL_NOT_AUTHORIZED",
            `Tool "${action.toolId}" has not been exposed to this Run`,
        );
    }

    let registration: ToolRegistration | undefined;

    try {
        registration = registry.get(action.toolId);
        throwIfAborted(control);
    } catch (error) {
        if (isExecutionAbortedError(error)) {
            throw error;
        }

        throwIfAborted(control);

        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            error instanceof Error ? error.message : String(error),
        );
    }

    if (registration === undefined) {
        throw new RunnerExecutionError(
            "TOOL_NOT_FOUND",
            `Authorized Tool "${action.toolId}" is not registered`,
        );
    }

    if (isPlanRunAwaitingTaskApproval(goal)
        && registration.definition.isReadOnly !== true) {
        throw new RunnerExecutionError(
            "TOOL_NOT_AUTHORIZED",
            `Tool "${action.toolId}" is not explicitly read-only before the Plan task is approved`,
        );
    }

    let prepared: PreparedToolResult;

    try {
        prepared = registration.prepare(action.input, control);
        throwIfAborted(control);
    } catch (error) {
        if (isExecutionAbortedError(error)) {
            throw error;
        }

        throwIfAborted(control);

        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            error instanceof Error ? error.message : String(error),
        );
    }

    if (!isRecord(prepared) || (prepared.ok !== true && prepared.ok !== false)) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            "Tool prepare returned an invalid result",
        );
    }

    if (prepared.ok === false) {
        if (
            !isRecord(prepared.error)
            || prepared.error.code !== "INVALID_TOOL_INPUT"
            || !isNonEmptyText(prepared.error.message)
        ) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool prepare returned an invalid error",
            );
        }

        throw new RunnerExecutionError(
            "INVALID_TOOL_INPUT",
            prepared.error.message,
            prepared.error.issues,
        );
    }

    if (
        !isJsonValue(prepared.input)
        || typeof prepared.execute !== "function"
        || (prepared.stream !== undefined && typeof prepared.stream !== "function")
    ) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            "Tool prepare returned an invalid success result",
        );
    }

    const canonicalAction: ToolCallAction = {
        ...action,
        input: prepared.input,
    };

    const executionContext: ToolExecutionContext = {
        goalId: goal.id,
        runId: goal.state.run.id,
    };

    if (evaluatePolicy && prepared.inputDiagnostic !== undefined) {
        recordToolInputDiagnostic(traceSink, goal, prepared.inputDiagnostic);
    }

    if (!evaluatePolicy) {
        return {
            registration,
            action: canonicalAction,
            policy: "allow",
            ...(prepared.inputDiagnostic === undefined
                ? {}
                : { inputDiagnostic: prepared.inputDiagnostic }),
            ...(plan !== undefined ? { plan } : {}),
            ...(prepared.resolveSandboxAccess === undefined
                ? {}
                : {
                    resolveSandboxAccess: (resolveControl?: ExecutionControl) =>
                        prepared.resolveSandboxAccess!(resolveControl),
                }),
            execute: (executeControl, execPlan) =>
                prepared.execute(canonicalAction.actionId, executionContext, executeControl, execPlan ?? plan),
            ...(prepared.stream === undefined
                ? {}
                : {
                    stream: (executeControl?: ExecutionControl, streamPlan?: SandboxExecutionPlan) =>
                        prepared.stream!(canonicalAction.actionId, executionContext, executeControl, streamPlan ?? plan),
                }),
        };
    }

    let policyResult: "allow" | "require_approval";

    try {
        policyResult = policy.evaluate({
            goal,
            action: canonicalAction,
            tool: registration.definition,
        });
        throwIfAborted(control);
    } catch (error) {
        if (isExecutionAbortedError(error)) {
            throw error;
        }

        throwIfAborted(control);

        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            error instanceof Error ? error.message : String(error),
        );
    }

    if (policyResult !== "allow" && policyResult !== "require_approval") {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            `Unsupported Tool policy result "${String(policyResult)}"`,
        );
    }

    return {
        registration,
        action: canonicalAction,
        policy: policyResult,
        ...(prepared.inputDiagnostic === undefined
            ? {}
            : { inputDiagnostic: prepared.inputDiagnostic }),
        ...(plan !== undefined ? { plan } : {}),
        ...(prepared.resolveSandboxAccess === undefined
            ? {}
            : {
                resolveSandboxAccess: (resolveControl?: ExecutionControl) =>
                    prepared.resolveSandboxAccess!(resolveControl),
            }),
        execute: (executeControl, execPlan) =>
            prepared.execute(canonicalAction.actionId, executionContext, executeControl, execPlan ?? plan),
        ...(prepared.stream === undefined
            ? {}
            : {
                stream: (executeControl?: ExecutionControl, streamPlan?: SandboxExecutionPlan) =>
                    prepared.stream!(canonicalAction.actionId, executionContext, executeControl, streamPlan ?? plan),
            }),
    };
}

function programToolInputMessage(toolId: string, issues?: readonly RuntimeFeedbackIssue[]): string {
    const issue = issues?.[0];
    if (issue === undefined) return `Invalid input for ${toolId}.`;
    const path = issue.path.reduce<string>((current, segment) =>
        typeof segment === "number" ? `${current}[${segment}]` : `${current}.${segment}`, "$");
    return `Invalid input for ${toolId} at ${path}: ${issue.message.slice(0, 160)}`;
}

function validateToolObservation(value: unknown): ToolObservation {
    if (!isRecord(value) || !isNonEmptyText(value.kind)) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            "Tool returned an invalid Observation",
        );
    }

    if (value.kind === "success") {
        if (
            !hasOnlyKeys(value, ["kind", "output", "summary"])
            || !isJsonValue(value.output)
            || !isNonEmptyText(value.summary)
        ) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool success Observation does not match the protocol",
            );
        }

        return value as unknown as ToolObservation;
    }

    if (value.kind === "failure") {
        if (
            !hasOnlyKeys(value, ["kind", "code", "message", "retryable", "details"])
            || !isNonEmptyText(value.code)
            || !isNonEmptyText(value.message)
            || typeof value.retryable !== "boolean"
            || (value.details !== undefined && !isJsonValue(value.details))
        ) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool failure Observation does not match the protocol",
            );
        }

        return value as unknown as ToolObservation;
    }

    throw new RunnerExecutionError(
        "TOOL_EXECUTION_ERROR",
        `Unsupported Tool Observation kind: ${value.kind}`,
    );
}

function validateActionLifecycle(
    goal: Goal,
    action: Extract<AgentDecision, { readonly kind: "tool_call" }>['action'],
): void {
    if (goal.state.run.pendingAction !== undefined) {
        throw new RunnerExecutionError(
            "INVALID_AGENT_DECISION",
            "Cannot request a new Action while another Action is pending",
        );
    }

    const lastStep = goal.state.run.lastStep;

    if (
        lastStep?.kind === "action"
        && lastStep.action.actionId === action.actionId
    ) {
        throw new RunnerExecutionError(
            "INVALID_AGENT_DECISION",
            `Action ID "${action.actionId}" repeats the latest completed Action`,
        );
    }
}

/** Runner 的公开结果；其中 state 是 Run 状态，不是模型原始输出。 */
export type RunnerResult =
    | { readonly ok: true; readonly state: RunState }
    | {
        readonly ok: false;
        readonly error: {
            readonly code:
                | "RUN_NOT_FOUND"
                | "ACTION_NOT_AUTHORIZED"
                | "INVALID_CONTEXT_LOOKUP"
                | "CONTEXT_LOOKUP_CHAIN_LIMIT";
            readonly message: string;
        };
    };

/**
 * 创建 {@link Runner} 所需的持久化与单步执行依赖。
 *
 * @remarks
 * Step 上限来自每个 Goal 冻结的 executionPolicy，不属于 Runner 实例配置。
 *
 * @example
 * ```ts
 * const runner = new Runner({ store, executor });
 * ```
 */
export interface RunnerDependencies {
    /** 完整 Goal 的最新快照存储。 */
    readonly store: GoalStore;
    /** 返回 AgentDecision 的单步执行器。 */
    readonly executor: StepExecutor;
    /**
     * 按 Tool ID 查找实现；省略时视为空 Registry，所有 Tool Action 都会
     * 以 `TOOL_NOT_FOUND` 拒绝。
     */
    readonly toolRegistry?: ToolRegistry;
    /**
     * Tool 执行前的策略边界；省略时使用允许策略。
     *
     * @remarks
     * Policy 只决定 Tool 自身是否可用于该 Action，不再产生审批等待；越界裁决由
     * 工作区权限档位的边界判定负责。
     */
    readonly toolPolicy?: ToolPolicy;
    /** 读取会话或 Workspace 级持续 Sandbox 授权；缺省时所有越界沙箱能力仍需审批。 */
    readonly sandboxGrantLookup?: SandboxGrantLookup;
    /** 用于隔离 Workspace 授权的稳定身份；必须与授权账本位置一致。 */
    readonly workspaceId?: string;
    /** 文件 Tool 授权身份解析时使用的 Workspace 根目录。 */
    readonly workspaceRoot?: string;
    /** 可选 Domain Event 追加与 Snapshot 边界读取端口；省略时只保存 Snapshot。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 可选诊断记录边界；诊断故障不得改变 Snapshot 或 Domain Event 语义。 */
    readonly traceSink?: DiagnosticTraceSink;
    /**
     * 可选的阈值压缩调度。
     *
     * @remarks
     * 省略时不调度压缩。`readOccupancy` 返回当次已结算的工作窗口占用与容量；
     * `compact` 只执行一次提炼调用。Runtime 负责候选选择、有效性判断与提交边界。
     */
    readonly contextCompaction?: {
        readonly readOccupancy: (goal: Goal) => Promise<{
            readonly occupiedTokens: number;
            readonly capacityTokens: number;
            readonly thresholdPercent: number;
        } | null>;
        readonly compact: (input: ContextCompactionInput) => Promise<string | undefined>;
    };
    /** structured@1 Patch 接受时使用的 Working Memory 限制。 */
    readonly workingMemoryLimits?: WorkingMemoryLimitsInput;
    /**
     * 可选 Prompt/Memory 协议校验器；Composition Root 可用它在运行前执行
     * 额外的协议边界校验。
     */
    readonly protocolValidator?: GoalProtocolValidator;
    /** 可选共享提交器；省略时由 Runner 按当前依赖创建。 */
    readonly checkpointCommitter?: TrajectoryCheckpointCommitterPort;
    /** 只读 committed Trajectory 检索端口；缺失时 lookup 产生 unavailable 结果。 */
    readonly contextLookupPort?: ContextLookupPort;
    /** 可选的 Goal/Run 实时事件发布端口；发布故障不得改变执行语义。 */
    readonly executionStream?: ExecutionStreamPublisher;
    /**
     * 可选的沙箱执行计划解析器。
     *
     * @remarks
     * Runner 在受限 Action 获准执行前调用此解析器以生成或验证沙箱执行计划。
     */
    readonly sandboxPlanResolver?: SandboxPlanResolver;
    /**
     * 当前工作区的权限档位存储；省略或缺少 `workspaceId` 时使用默认档位。
     *
     * @remarks
     * 每个待判定 Action 都在决策期重新读取档位；读取失败向上抛出，不回退默认档位。
     */
    readonly permissionProfileStore?: ProjectPermissionProfileStore;
}

/**
 * 持有单次活动执行的最新已提交 Goal，并推进 Run 直到 waiting 或终态。
 *
 * @remarks
 * RunExecutor 是状态推进与持久化顺序的拥有者。启动、恢复和每个 Step 完成后，
 * 都会先保存最新完整 Goal，再继续下一步。阶段化 Executor 可在一个 Step 内返回
 * 多个 Decide/Think 结果；每次 Think 的请求与输出先提交 Trajectory 和 Snapshot，
 * Snapshot 的 `pendingThink` 指向当前 Step 最近一个已提交输出。恢复会校验 Goal、Run、
 * Step、执行单元、输入摘要及事件父链，复用该链并只重试 Decide；最终有效 AgentDecision
 * 才进入状态转换。正数 `maxSteps` 使用快照中的累计 `stepCount`；`0` 表示不按 Step 数终止。
 *
 * `execute()` 兼容实现返回的 AgentDecision 会先做运行时严格校验；阶段化实现由
 * `decide()` 返回业务决策或 Think 请求，并由 `think()` 生成自由文本。完成候选通过协议和证据校验后，
 * 必须经 `reviewCompletion()` 接受才提交完成、回复和 Memory Patch；拒绝复用 Decide 纠错边界。Think 不增加
 * Step、不执行 Tool。`tool_call` 按冻结 Profile、Registry、输入协议和 Policy 顺序校验，自动允许
 * 的 Action 会先保存 pendingAction，再调用 Tool，最后保存 Observation；需要
 * 批准的 Action 会保存为 `awaiting_approval` 并返回 waiting，不调用 Tool。收到
 * 匹配的瞬时 `authorizedActionId` 后，Runner 才会执行已批准的同一 Action。
 * 进程恢复时，`safe` Tool 会沿用原 `actionId` 自动重放；`manual` Tool 会转为
 * `outcome_unknown` waiting，等待 Coordinator 再次批准或拒绝。领域 failure 会
 * 继续下一轮；Tool 异常会保存 `outcome_unknown` execution_error。
 *
 * 旧式 Executor 抛出的非协议异常会规范化为当前 `fail` Decision 并持久化；阶段化
 * Executor 在 Think 请求或输出检查点之后失败/取消时，Runner 保留运行中的 Step 和
 * 已提交 `pendingThink`，传播原错误供调用方恢复，且不伪造 AgentDecision。Store 的
 * 读取或写入异常原样传播，写入失败后不会继续执行下一阶段或 Step。
 */
class RunExecutor {
    private readonly store: GoalStore;
    private readonly recoveryReader: RunRecoveryReader;
    private readonly executor: StepExecutor;
    private readonly toolRegistry: ToolRegistry;
    private readonly toolPolicy: ToolPolicy;
    private readonly sandboxGrantLookup: SandboxGrantLookup | undefined;
    private readonly workspaceId: string | undefined;
    private readonly workspaceRoot: string | undefined;
    private readonly checkpointCommitter: TrajectoryCheckpointCommitterPort;
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly workingMemoryLimits: WorkingMemoryLimitsInput | undefined;
    private readonly protocolValidator: GoalProtocolValidator | undefined;
    private readonly contextLookupPort: ContextLookupPort | undefined;
    private readonly executionStream: ExecutionStreamPublisher | undefined;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly contextCompaction: RunnerDependencies["contextCompaction"];
    private readonly sandboxPlanResolver: SandboxPlanResolver | undefined;
    private readonly permissionProfileStore: ProjectPermissionProfileStore | undefined;
    private readonly activeRunControllers = new Map<string, AbortController>();
    /** 当前 Run 的瞬时导航投影；Goal 字段已定义时优先使用 Goal 上的增量结果。 */
    private navigationProjection:
        | {
            readonly goalId: string;
            readonly runId: string;
            readonly stages: readonly RunStageState[];
            readonly notes: readonly RuntimeContextNote[];
        }
        | undefined;

    /** @param dependencies - GoalStore、Executor 与可选 Tool 边界依赖。 */
    constructor(dependencies: RunnerDependencies) {
        this.store = dependencies.store;
        this.recoveryReader = new RunRecoveryReader({
            store: dependencies.store,
            ...(dependencies.trajectoryStore === undefined
                ? {}
                : { trajectoryStore: dependencies.trajectoryStore }),
        });
        this.executor = dependencies.executor;
        this.toolRegistry = dependencies.toolRegistry ?? EMPTY_TOOL_REGISTRY;
        this.toolPolicy = dependencies.toolPolicy ?? ALLOW_ALL_TOOL_POLICY;
        this.sandboxGrantLookup = dependencies.sandboxGrantLookup;
        this.permissionProfileStore = dependencies.permissionProfileStore;
        this.workspaceId = dependencies.workspaceId;
        this.workspaceRoot = dependencies.workspaceRoot;
        this.sandboxPlanResolver = dependencies.sandboxPlanResolver;
        this.trajectoryStore = dependencies.trajectoryStore;
        this.workingMemoryLimits = dependencies.workingMemoryLimits;
        this.protocolValidator = dependencies.protocolValidator;
        this.contextLookupPort = dependencies.contextLookupPort;
        this.executionStream = dependencies.executionStream;
        this.traceSink = dependencies.traceSink;
        this.contextCompaction = dependencies.contextCompaction;
        this.checkpointCommitter = dependencies.checkpointCommitter
            ?? new TrajectoryCheckpointCommitter({
                store: dependencies.store,
                ...(dependencies.trajectoryStore === undefined
                    ? {}
                    : { trajectoryStore: dependencies.trajectoryStore }),
                ...(dependencies.traceSink === undefined
                    ? {}
                    : { traceSink: dependencies.traceSink }),
            });
    }

    /** 发布一次旁路执行事件；发布端故障不得覆盖 Runtime 结果。 */
    private publishExecutionEvent(
        target: Goal | { readonly goalId: string; readonly runId: string },
        event: Omit<ExecutionStreamEventDraft, "goalId" | "runId">,
    ): void {
        if (this.executionStream === undefined) return;
        const goalId = "goalId" in target ? target.goalId : target.id;
        const runId = "runId" in target ? target.runId : target.state.run.id;
        try {
            this.executionStream.publish({
                goalId,
                runId,
                ...event,
            });
        } catch {
            // Stream 是旁路观察面，不能改变 Goal 状态机或持久化语义。
        }
    }

    /** 在同一模型阶段内执行最多三次调用；只有适配器分类的暂时故障会重试。 */
    private async executeModelStage<T>(
        operation: () => Promise<T>,
        control?: ExecutionControl,
        onTransientFailure?: (attempt: number, error: TransientModelRequestFailure) => Promise<void>,
    ): Promise<T> {
        const failures: ModelRequestAttemptFailure[] = [];
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            throwIfAborted(control);
            try {
                return await operation();
            } catch (error) {
                if (isExecutionAbortedError(error) || control?.signal?.aborted) {
                    throwIfAborted(control);
                    throw error;
                }
                if (!(error instanceof TransientModelRequestFailure)) throw error;
                failures.push({
                    attempt,
                    reason: error.reason,
                    ...(error.status === undefined ? {} : { status: error.status }),
                });
                await onTransientFailure?.(attempt, error);
                if (attempt === 3) throw new ModelRequestRetriesExhaustedError(failures);
                const exponentialDelay = 250 * 2 ** (attempt - 1);
                await waitForRetry(Math.min(30_000, Math.max(exponentialDelay, error.retryAfterMs ?? 0)), control);
            }
        }
        throw new Error("Unreachable model retry state");
    }

    private async recordModelRequestFailure(
        goal: Goal,
        input: StepExecutionInput,
        stage: ModelContextStage,
        attempt: number,
        error: TransientModelRequestFailure,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const draft: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
            stepIndex: goal.state.run.stepCount + 1,
            eventType: "model_request_retry_recorded",
            payload: {
                type: "model_request_retry_recorded",
                stage,
                attempt,
                reason: error.reason,
                ...(error.status === undefined ? {} : { status: error.status }),
            },
        };
        const event = await this.checkpointCommitter.append(draft, control);
        if (event?.eventType !== "model_request_retry_recorded") {
            throw new TrajectoryAppendError("Model request retries require an enabled Trajectory sink");
        }
        const savedGoal = await this.commitStageCheckpoint(goal, [], control);
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [draft]);
        return savedGoal;
    }

    /**
     * @deprecated 请使用与 RunScheduler 契约一致的 {@link runUntilBlocked}。
     */
    async run(
        ref: RunRef,
        options: RunExecutionOptions = {},
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        return this.runUntilBlocked(ref, options, control);
    }

    /**
     * 启动或继续一个已经保存的 Goal，推进直到 waiting 或终态。
     *
     * @remarks
     * `created` 会先转换并保存为 `running`；`running` 会继续执行；waiting
     * 和终态直接返回且不产生副作用。当前 workflow 只有 executing 阶段，
     * 因此没有其它阶段需要启动 Run 或消费 Step。Goal 不存在或 runId 不匹配时
     * 返回 `RUN_NOT_FOUND`。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @param options - 可选的本次调用瞬时 Action 授权；有授权时只接受与已批准
     *   `pendingAction` 相同的 `actionId`，不会写入快照；无授权恢复已批准 Action
     *   时按 Tool 的 `replayPolicy` 分流。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns Run 到达 waiting 或终态时的结果。
     * @throws GoalStore/Trajectory 读取或保存错误；有已提交阶段检查点时阶段调用错误
     *   原样传播且保留恢复指针；中止时抛出 `ExecutionAbortedError`。
     */
    async runUntilBlocked(
        ref: RunRef,
        options: RunExecutionOptions = {},
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        const key = `${ref.goalId}:${ref.runId}`;
        const runController = new AbortController();
        if (this.activeRunControllers.has(key)) {
            return this.runUntilBlockedCore(ref, options, control);
        }
        this.activeRunControllers.set(key, runController);
        const parentSignal = control?.signal ?? options.signal;
        const abortFromParent = () => runController.abort(parentSignal?.reason);
        if (parentSignal?.aborted) abortFromParent();
        else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
        try {
            try {
                return await this.runUntilBlockedCore(ref, options, { signal: runController.signal });
            } catch (error) {
                if (parentSignal?.aborted) throw error;
                const latest = await this.restore(ref);
                if (latest?.state.run.interruption !== undefined) {
                    return this.resumeInterruptedRun(latest, control);
                }
                throw error;
            }
        } finally {
            parentSignal?.removeEventListener("abort", abortFromParent);
            if (this.activeRunControllers.get(key) === runController) this.activeRunControllers.delete(key);
        }
    }

    private async runUntilBlockedCore(
        ref: RunRef,
        options: RunExecutionOptions = {},
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        const effectiveControl = resolveExecutionControl(options, control);
        if (effectiveControl?.signal?.aborted
            && effectiveControl.signal.reason === "user_cancel_program") {
            const pending = await this.restore(ref);
            if (pending?.state.run.pendingProgram !== undefined) {
                const stopped = await this.stopProgram(pending, "PTC_CANCELLED", "Program cancelled.");
                return { ok: true, state: stopped.state.run };
            }
        }
        throwIfAborted(effectiveControl);
        const goal = await this.restore(ref, effectiveControl);
        throwIfAborted(effectiveControl);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        if (goal.state.run.interruption !== undefined) {
            return this.resumeInterruptedRun(goal, control);
        }

        this.validateGoalProtocol(goal);

        if (
            goal.state.run.status === "running"
            && goal.state.run.pendingAction?.status === "approved"
            && options.authorizedActionId === undefined
        ) {
            return this.recoverPendingAction(goal, effectiveControl);
        }

        if (!this.hasMatchingTransientAuthorization(goal, options)) {
            return this.actionNotAuthorized(ref, options.authorizedActionId);
        }

        if (goal.state.run.status === "created") {
            const start = await withGoalMutationGate(this.store, goal.id, async () => {
                throwIfAborted(effectiveControl);
                const latestGoal = await this.restore(ref, effectiveControl);
                throwIfAborted(effectiveControl);
                if (latestGoal === undefined) return { kind: "missing" as const };
                this.validateGoalProtocol(latestGoal);
                if (latestGoal.state.run.status !== "created") {
                    return { kind: "already_started" as const, goal: latestGoal };
                }
                if (!this.hasMatchingTransientAuthorization(latestGoal, options)) {
                    return {
                        kind: "unauthorized" as const,
                        result: this.actionNotAuthorized(ref, options.authorizedActionId),
                    };
                }

                const runningGoal = this.withRun(
                    latestGoal,
                    this.applyTransition(latestGoal.state.run, { kind: "start" }),
                );
                const committed = await this.checkpointCommitter.commit(runningGoal, {
                    facts: [{
                        goalId: latestGoal.id,
                        runId: latestGoal.state.run.id,
                        phase: "executing",
                        eventType: "run_started",
                        payload: { type: "run_started" },
                    }],
                    ...(effectiveControl === undefined ? {} : { control: effectiveControl }),
                });
                this.publishCommittedEvents(committed);
                return { kind: "started" as const, goal: committed.goal };
            });

            if (start.kind === "missing") return this.runNotFound(ref);
            if (start.kind === "unauthorized") return start.result;
            if (start.kind === "already_started") return { ok: true, state: start.goal.state.run };

            const contextLookupResult = options.contextLookupResult
                ?? await this.restoreContextLookupResult(start.goal, effectiveControl);
            return this.runLoop(
                start.goal,
                options.authorizedActionId,
                effectiveControl,
                contextLookupResult,
                undefined,
                options.sandboxExecutionPlan,
            );
        }

        const contextLookupResult = options.contextLookupResult
            ?? await this.restoreContextLookupResult(goal, effectiveControl);

        return this.runLoop(
            goal,
            options.authorizedActionId,
            effectiveControl,
            contextLookupResult,
            undefined,
            options.sandboxExecutionPlan,
        );
    }

    /**
     * 持久化受理当前活动 Run 的 Steer；执行器在下一个模型边界应用。
     *
     * @remarks
     * 提供 `ledger.queueBinding` 时，同一提交会验证并消费指定队列消息，再写入
     * Steer；队列修订过期、消息不存在或正文不同会明确拒绝。
     *
     * @param ref - 目标 Goal 与 Run 的稳定关联身份。
     * @param messageId - 新 Steer 的幂等身份。
     * @param content - 非空的补充或修正文本。
     * @param ledger - 可选去重摘要及原队列消息绑定。
     * @returns 已持久化受理、幂等重试或稳定拒绝结果。
     * @example
     * ```ts
     * await runner.steer({ goalId, runId }, "steer-1", "聚焦这一项");
     * ```
     */
    async steer(
        ref: RunRef,
        messageId: string,
        content: string,
        ledger?: {
            readonly digest: SessionInputDigest;
            readonly queueBinding?: { readonly messageId: string; readonly queueRevision: number };
        },
    ): Promise<SteerInputResult> {
        if (messageId.trim().length === 0 || content.trim().length === 0 || content.length > 64_000) {
            return { ok: false, error: "STEER_CONFLICT" };
        }
        return withGoalMutationGate(this.store, ref.goalId, async () => {
            const goal = await this.restore(ref);
            if (goal === undefined || goal.state.run.id !== ref.runId) {
                return { ok: false, error: "RUN_NOT_FOUND" };
            }
            const run = goal.state.run;
            const ledgerRecord = ledger === undefined
                ? undefined
                : findSessionInputRecord(goal, messageId);
            if (ledgerRecord !== undefined && ledger !== undefined && ledgerRecord.digest !== ledger.digest) {
                return { ok: false, error: "STEER_CONFLICT" };
            }
            const existing = (run.steerInputs ?? []).find((input) => input.messageId === messageId);
            if (existing !== undefined) {
                const existingContent = existing.status === "pending"
                    ? existing.content
                    : goal.state.messages[existing.messageIndex]?.content;
                return existingContent === content
                    ? { ok: true, goalId: goal.id, runId: run.id, messageId, existing: true }
                    : { ok: false, error: "STEER_CONFLICT" };
            }
            if (run.status !== "running") return { ok: false, error: "RUN_NOT_RUNNING" };
            if (run.interruption !== undefined) return { ok: false, error: "RUN_NOT_RUNNING" };

            const queueBinding = ledger?.queueBinding;
            const queue = goal.state.messageQueue ?? { revision: 0, items: [] };
            const queueRemoval = queueBinding === undefined
                ? undefined
                : removeQueuedMessage(queue, queueBinding.messageId);
            const queuedMessage = queueRemoval?.item;
            if (queueBinding !== undefined && queue.revision !== queueBinding.queueRevision) {
                return { ok: false, error: "QUEUE_REVISION_MISMATCH" };
            }
            if (queueBinding !== undefined && (
                queuedMessage === undefined
                || queuedMessage.content !== content
                || findSessionInputRecord(goal, queueBinding.messageId)?.status !== "pending"
            )) {
                return { ok: false, error: queuedMessage !== undefined && queuedMessage.content !== content
                    ? "STEER_CONFLICT"
                    : "QUEUED_MESSAGE_NOT_FOUND" };
            }
            const steerInputs: readonly RunSteerInput[] = [
                ...(run.steerInputs ?? []),
                { messageId, status: "pending", content },
            ];
            const ledgerEntry: SessionInputRecord | undefined = ledger === undefined || ledgerRecord !== undefined
                ? undefined
                : {
                    inputId: messageId,
                    kind: "steer",
                    digest: ledger.digest,
                    sequence: nextSessionInputSequence(goal),
                    status: "pending",
                    admittedAtRevision: (goal.state.commitRevision ?? 0) + 1,
                    targetRunId: run.id,
                };
            const inputLedger = queueBinding === undefined
                ? goal.state.inputLedger ?? []
                : clearPendingSessionInputs(
                    goal.state.inputLedger ?? [],
                    new Set([queueBinding.messageId]),
                ) ?? [];
            const nextInputLedger = queueBinding === undefined && ledgerEntry === undefined
                ? undefined
                : [...inputLedger, ...(ledgerEntry === undefined ? [] : [ledgerEntry])];
            const nextGoal: Goal = {
                ...goal,
                state: {
                    ...goal.state,
                    run: { ...run, steerInputs },
                    ...(queueRemoval === undefined ? {} : { messageQueue: queueRemoval.queue }),
                    ...(nextInputLedger === undefined ? {} : { inputLedger: nextInputLedger }),
                },
            };
            const fact: TrajectoryEventDraft = {
                goalId: goal.id,
                runId: run.id,
                phase: "executing",
                eventType: "steer_input_received",
                payload: { type: "steer_input_received", messageId },
            };
            const committed = await this.checkpointCommitter.commit(nextGoal, {
                facts: [fact],
                ...(ledgerEntry === undefined ? {} : { sessionState: "caller" as const }),
            });
            this.publishCommittedEvents(committed);
            this.publishCheckpointCommitted(committed, [fact]);
            return { ok: true, goalId: goal.id, runId: run.id, messageId, existing: false };
        });
    }

    async interrupt(
        ref: RunRef,
        requestId: string,
        ledger?: { readonly digest: SessionInputDigest },
    ): Promise<InterruptRunResult> {
        if (requestId.trim().length === 0) return { ok: false, error: "INTERRUPT_CONFLICT" };
        const result = await withGoalMutationGate(this.store, ref.goalId, async (): Promise<InterruptRunResult> => {
            const goal = await this.restore(ref);
            if (goal === undefined || goal.state.run.id !== ref.runId) return { ok: false, error: "RUN_NOT_FOUND" };
            const existing = goal.state.run.interruption;
            if (existing !== undefined) {
                return existing.requestId === requestId
                    ? { ok: true, goalId: goal.id, runId: ref.runId, requestId, existing: true }
                    : { ok: false, error: "INTERRUPT_CONFLICT" };
            }
            if (goal.state.run.status !== "running" && goal.state.run.status !== "waiting") {
                return { ok: false, error: "RUN_NOT_RUNNING" };
            }
            if (ledger !== undefined) {
                const existingRecord = findSessionInputRecord(goal, requestId);
                if (existingRecord !== undefined && existingRecord.digest !== ledger.digest) {
                    return { ok: false, error: "INTERRUPT_CONFLICT" };
                }
            }
            const interruption: RunInterruption = { requestId, status: "requested" };
            const ledgerEntry: SessionInputRecord | undefined = ledger === undefined
                ? undefined
                : {
                    // 中断意图在同一提交中生效；收据直接记录为已应用。
                    inputId: requestId,
                    kind: "interrupt",
                    digest: ledger.digest,
                    sequence: nextSessionInputSequence(goal),
                    status: "applied",
                    admittedAtRevision: (goal.state.commitRevision ?? 0) + 1,
                    targetRunId: ref.runId,
                    appliedRunId: ref.runId,
                };
            const nextGoal: Goal = {
                ...goal,
                state: {
                    ...goal.state,
                    ...(ledgerEntry === undefined
                        ? {}
                        : { inputLedger: [...(goal.state.inputLedger ?? []), ledgerEntry] }),
                    // 中断意图与队列暂停在同一提交边界生效。
                    messageQueue: withQueuePause(goal.state.messageQueue, {
                        reason: "user_interrupt",
                        runId: ref.runId,
                    }),
                    run: { ...goal.state.run, interruption },
                },
            };
            const fact: TrajectoryEventDraft = {
                goalId: goal.id,
                runId: ref.runId,
                phase: "executing",
                eventType: "run_interrupt_requested",
                payload: { type: "run_interrupt_requested", requestId },
            };
            const committed = await this.checkpointCommitter.commit(nextGoal, {
                facts: [fact],
                sessionState: "caller",
            });
            this.publishCommittedEvents(committed);
            this.publishCheckpointCommitted(committed, [fact]);
            return { ok: true, goalId: goal.id, runId: ref.runId, requestId, existing: false };
        });
        if (!result.ok) return result;
        if (result.existing) return result;
        const controller = this.activeRunControllers.get(`${ref.goalId}:${ref.runId}`);
        if (controller !== undefined) controller.abort("user_interrupt");
        else {
            const goal = await this.restore(ref);
            if (goal !== undefined) await this.resumeInterruptedRun(goal);
        }
        return result;
    }

    private async resumeInterruptedRun(goal: Goal, control?: ExecutionControl): Promise<RunnerResult> {
        return withGoalMutationGate(this.store, goal.id, async () => {
            const latest = await this.restore({ goalId: goal.id, runId: goal.state.run.id }, control);
            if (latest === undefined) return { ok: true, state: goal.state.run };
            const interruption = latest.state.run.interruption;
            if (interruption === undefined) return { ok: true, state: latest.state.run };
            if (interruption.status === "finished" || latest.state.run.status === "cancelled") {
                return { ok: true, state: latest.state.run };
            }
            if (interruption.status === "requested") {
                const pending = latest.state.run.pendingAction;
                const program = latest.state.run.pendingProgram;
                const unknownActions = [
                    ...(pending?.status === "approved" && (pending.attemptsStarted ?? 0) > 0 ? [pending.action] : []),
                    ...(program === undefined ? [] : [program.action]),
                ].filter((action, index, actions) => actions.findIndex((candidate) => candidate.actionId === action.actionId) === index);
                if (unknownActions.length === 0) return this.cancelInterruptedRun(latest, control);
                const attempt = pending?.attemptsStarted ?? Math.max(1, program?.nextCallIndex ?? 1);
                const nextInterruption: RunInterruption = {
                    ...interruption,
                    interruptedActions: unknownActions,
                    outcomeUnknown: true,
                };
                const nextGoalWithRun = this.withRun(latest, {
                    ...latest.state.run,
                    interruption: nextInterruption,
                });
                const facts: TrajectoryEventDraft[] = unknownActions.flatMap((action) => {
                    const unknownObservation: ToolObservation = {
                        kind: "failure",
                        code: "TOOL_INTERRUPTED_OUTCOME_UNKNOWN",
                        message: `Tool ${action.toolId} was interrupted; its external effect is unknown. The operation was not replayed.`,
                        retryable: false,
                        details: { actionId: action.actionId, requestId: interruption.requestId, outcome: "unknown" },
                    };
                    return [
                        {
                            goalId: latest.id, runId: latest.state.run.id, phase: "executing", actionId: action.actionId,
                            eventType: "tool_attempt_failed",
                            payload: { type: "tool_attempt_failed", actionId: action.actionId, attempt, reason: "outcome_unknown" },
                        },
                        {
                            goalId: latest.id, runId: latest.state.run.id, phase: "executing", actionId: action.actionId,
                            eventType: "observation_recorded",
                            payload: { type: "observation_recorded", actionId: action.actionId, observation: unknownObservation },
                        },
                        {
                            goalId: latest.id, runId: latest.state.run.id, phase: "executing", actionId: action.actionId,
                            eventType: "run_interrupted_action_unknown",
                            payload: { type: "run_interrupted_action_unknown", requestId: interruption.requestId, actionId: action.actionId, toolId: action.toolId },
                        },
                    ];
                });
                return this.cancelInterruptedRun(nextGoalWithRun, control, facts);
            }
            return this.cancelInterruptedRun(latest, control);
        });
    }

    private async cancelInterruptedRun(goal: Goal, control?: ExecutionControl, interruptedFacts: readonly TrajectoryEventDraft[] = []): Promise<RunnerResult> {
        const interruption = goal.state.run.interruption;
        if (interruption === undefined) return { ok: true, state: goal.state.run };
        if (goal.state.run.status === "cancelled" || interruption.status === "finished") {
            return { ok: true, state: goal.state.run };
        }
        const cancelledRun = this.applyTransition(goal.state.run, { kind: "cancel" });
        const cancelledGoal = this.withRun(goal, {
            ...cancelledRun,
            interruption: { ...interruption, status: "finished" },
        });
        const closed = this.contextEpochClosedFact(cancelledGoal, "run_cancelled");
        const facts: TrajectoryEventDraft[] = [
            ...interruptedFacts,
            { goalId: goal.id, runId: goal.state.run.id, phase: "executing", eventType: "run_cancelled", payload: { type: "run_cancelled", reason: "user_interrupt" } },
            ...(closed === undefined ? [] : [closed]),
        ];
        const committed = await this.checkpointCommitter.commit(cancelledGoal, {
            facts,
            ...(control === undefined ? {} : { control }),
        });
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, facts);
        return { ok: true, state: committed.goal.state.run };
    }

    private async restore(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<Goal | undefined> {
        return this.recoveryReader.restoreGoal(ref, control);
    }

    private async restoreContextLookupResult(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<ContextLookupResult | undefined> {
        const trajectoryStore = this.trajectoryStore;
        const boundary = goal.state.run.committedThroughSequence;
        const lastStep = goal.state.run.lastStep;
        if (
            trajectoryStore === undefined
            || boundary <= 0
            || lastStep?.kind !== "decision"
            || lastStep.result.kind !== "context_lookup"
        ) {
            return undefined;
        }

        throwIfAborted(control);
        const raw = await this.recoveryReader.readTrajectory(
            { goalId: goal.id, runId: goal.state.run.id },
            boundary,
            control,
        );
        throwIfAborted(control);
        const committed = [...raw.committed]
            .filter((event) => event.goalId === goal.id && event.runId === goal.state.run.id)
            .sort((left, right) => right.sequence - left.sequence);
        const runBoundaries = getCommittedRunBoundaries(goal);
        const currentEvidenceIndex = buildCommittedEvidenceIndex({
            goalId: goal.id,
            runId: goal.state.run.id,
            committedThroughSequence: boundary,
            events: raw.committed,
        });
        const historicalEvidenceIndexes: CommittedEvidenceIndex[] = [];
        for (const source of runBoundaries) {
            if (source.runId === goal.state.run.id) continue;
            const sourceRaw = await this.recoveryReader.readTrajectory(
                { goalId: goal.id, runId: source.runId },
                source.committedThroughSequence,
                control,
            );
            historicalEvidenceIndexes.push(buildCommittedEvidenceIndex({
                goalId: goal.id,
                runId: source.runId,
                committedThroughSequence: source.committedThroughSequence,
                events: sourceRaw.committed,
            }));
        }
        const lookupBoundary = Math.max(...runBoundaries.map((source) => source.committedThroughSequence));

        const request = normalizeContextLookupRequest(lastStep.result);
        const expectedLookupId = createContextLookupId(
            goal.id,
            goal.state.run.id,
            request,
        );
        const lastFact = committed.find((event) =>
            (event.eventType === "context_lookup_completed"
                || event.eventType === "context_lookup_not_found"
                || event.eventType === "context_lookup_failed")
            && event.payload.lookupId === expectedLookupId,
        );
        if (lastFact === undefined) return undefined;

        const normalizeRestoredResult = (value: unknown): ContextLookupResult => {
            const result = normalizeContextLookupResult(
                value,
                expectedLookupId,
                lookupBoundary,
                request,
            );
            if (result.status === "found") {
                assertContextLookupResultOwnership(
                    result,
                    goal.id,
                    goal.state.run.id,
                    runBoundaries,
                );
                validateContextLookupSourceReferences(
                    result,
                    currentEvidenceIndex,
                    historicalEvidenceIndexes,
                );
            }
            return result;
        };
        if (
            (lastFact.eventType !== "context_lookup_completed"
                && lastFact.eventType !== "context_lookup_not_found"
                && lastFact.eventType !== "context_lookup_failed")
            || lastFact.payload.lookupId !== expectedLookupId
        ) {
            return undefined;
        }

        const requested = committed.find((event) =>
            event.eventType === "context_lookup_requested"
            && event.payload.lookupId === expectedLookupId
            && event.sequence < lastFact.sequence,
        );
        if (requested === undefined) {
            throw new ContextLookupProtocolError(
                "committed lookup result has no preceding requested fact",
            );
        }

        if (lastFact.eventType === "context_lookup_completed") {
            return normalizeRestoredResult(lastFact.payload.result);
        }
        if (lastFact.eventType === "context_lookup_not_found") {
            return normalizeRestoredResult(lastFact.payload.result);
        }

        return normalizeRestoredResult(
            {
                status: "lookup_error",
                lookupId: expectedLookupId,
                code: lastFact.payload.code,
                message: lastFact.payload.message,
                committedThroughSequence: boundary,
            },
        );
    }

    /** 从 committed Trajectory 尾部恢复本次连续 Lookup 链长度。 */
    private async restoreContextLookupChainCount(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<number> {
        const trajectoryStore = this.trajectoryStore;
        const boundary = goal.state.run.committedThroughSequence;
        if (trajectoryStore === undefined || boundary <= 0) return 0;
        throwIfAborted(control);
        const raw = await this.recoveryReader.readTrajectory(
            { goalId: goal.id, runId: goal.state.run.id },
            boundary,
            control,
        );
        throwIfAborted(control);
        const facts = [...raw.committed]
            .filter((event) => event.goalId === goal.id && event.runId === goal.state.run.id)
            .filter((event) => event.eventType === "context_lookup_requested"
                || event.eventType === "context_lookup_completed"
                || event.eventType === "context_lookup_not_found"
                || event.eventType === "context_lookup_failed")
            .sort((left, right) => left.sequence - right.sequence);
        let count = 0;
        for (let index = facts.length - 1; index >= 1;) {
            const result = facts[index];
            const requested = facts[index - 1];
            if (
                result === undefined
                || requested === undefined
                ||
                (result.eventType !== "context_lookup_completed"
                    && result.eventType !== "context_lookup_not_found"
                    && result.eventType !== "context_lookup_failed")
                || requested.eventType !== "context_lookup_requested"
                || !("lookupId" in result.payload)
                || !("lookupId" in requested.payload)
                || result.payload.lookupId !== requested.payload.lookupId
            ) {
                break;
            }
            count += 1;
            index -= 2;
        }
        return count;
    }

    /**
     * 恢复并填充运行时 Goal 的历史阶段和 notes，用于支持模型请求中的工作导航投影。
     *
     * @remarks
     * 每个 `(goalId, runId)` 只读取自身 Snapshot 提交边界内的事实；读取失败或非零
     * 水位缺少提交边界时抛出 `RunNavigationRecoveryError`，停止本次依赖该导航的模型推进。
     */
    /**
     * 在完成交互与已结算执行单元的边界上按阈值执行一轮提炼。
     *
     * @remarks
     * 占用严格超过阈值才触发；正文无效、未缩减或提炼失败时保持旧窗口并继续执行。
     * 提交点唯一：把压缩正文与来源范围写入 Epoch 切换事件，并在同一提交中保存新 Epoch。
     */
    private async maybeCompactContext(goal: Goal, control?: ExecutionControl): Promise<Goal> {
        const step = await this.compactContext(goal, "threshold", control);
        return step.kind === "compacted" ? step.goal : goal;
    }

    /**
     * 在工作窗口边界执行一轮提炼并提交新 Epoch。
     *
     * @remarks
     * `threshold` 只在占用严格超过阈值时触发；`context_window` 与 `command` 忽略占用阈值，
     * 但沿用同一套候选选择、有效性与提交规则。超窗恢复由供应商拒绝产生且尚未产生任何模型
     * 输出，因此允许在待修复的模型阶段内切换窗口；其它触发仍要求没有待处理执行事实。
     * 提交点唯一：把压缩正文与来源范围写入 Epoch 切换事件，并在同一提交中保存新 Epoch。
     */
    private async compactContext(
        goal: Goal,
        trigger: ContextCompactionTrigger,
        control?: ExecutionControl,
    ): Promise<ContextCompactionStep> {
        const scheduler = this.contextCompaction;
        if (scheduler === undefined) return { kind: "skipped", reason: "unsupported" };
        const status = goal.state.run.status;
        const ended = status === "completed" || status === "failed" || status === "cancelled";
        if (status !== "running" && status !== "waiting" && !(trigger === "command" && ended)) {
            return { kind: "skipped", reason: "not_running" };
        }
        if (goal.state.run.pendingAction !== undefined
            || goal.state.run.pendingActionBatch !== undefined
            || goal.state.run.pendingInteraction !== undefined
            || goal.state.run.pendingThink !== undefined
            || goal.state.run.pendingProgram !== undefined
            || (goal.state.run.pendingModelRepair !== undefined && trigger !== "context_window")) {
            return { kind: "skipped", reason: "pending" };
        }
        if (trigger === "threshold") {
            const occupancy = await scheduler.readOccupancy(goal);
            if (occupancy === null) return { kind: "skipped", reason: "capacity_unavailable" };
            if (occupancy.occupiedTokens * 100 <= occupancy.thresholdPercent * occupancy.capacityTokens) {
                return { kind: "skipped", reason: "below_threshold" };
            }
        }

        const epoch = goal.state.run.contextEpoch;
        const window = selectCompactionWindow(goal.state.messages, epoch.conversationStartIndex);
        if (window === undefined) return { kind: "skipped", reason: "no_window" };
        const evictedTranscript = renderCompactionTranscript(window.evicted);
        if (evictedTranscript.length === 0) return { kind: "skipped", reason: "empty" };

        let body: string | undefined;
        try {
            body = await scheduler.compact({
                intent: goal.definition.intent,
                ...(goal.state.run.approvedTask === undefined
                    ? {}
                    : { objective: goal.state.run.approvedTask.objective }),
                evictedTranscript,
                recentTranscript: renderCompactionTranscript(window.retained),
                evictedCharacters: evictedTranscript.length,
            });
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            await this.recordCompactionFailure(goal, error);
            return { kind: "skipped", reason: "failed" };
        }
        throwIfAborted(control);
        const result = evaluateCompactionBody(body, evictedTranscript.length);
        if (result.kind !== "compacted") return { kind: "skipped", reason: result.reason };

        const openedAtSequence = goal.state.run.committedThroughSequence + 1;
        const source = await this.readCompactionSource(goal, epoch.openedAtSequence, control);
        if (source === undefined) return { kind: "skipped", reason: "source_unavailable" };
        const nextEpoch = advanceContextEpoch(
            epoch,
            goal.state.messages,
            window.retainedStartIndex,
            openedAtSequence,
            { sourceRunId: goal.state.run.id },
        );
        const closedEpoch = toEpochRange(
            epoch,
            goal.state.messages.length,
            goal.state.run.committedThroughSequence,
        );
        const nextGoal = this.withRun(goal, {
            ...goal.state.run,
            contextEpoch: nextEpoch,
        });
        const reason = trigger === "threshold"
            ? "threshold_compaction" as const
            : trigger === "context_window"
                ? "context_window_recovery" as const
                : "command_compaction" as const;
        const committed = await this.commitDecision(nextGoal, [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "context_epoch_advanced",
            payload: {
                type: "context_epoch_advanced",
                closedEpoch,
                openedEpoch: nextEpoch,
                reason,
                compaction: {
                    body: result.body,
                    sourceRunId: goal.state.run.id,
                    firstSequence: source.firstSequence,
                    lastSequence: source.lastSequence,
                    eventIds: source.eventIds,
                },
            },
        }], undefined, control);
        return { kind: "compacted", goal: committed };
    }

    /**
     * 按用户命令整理当前 Goal 的工作窗口。
     *
     * @remarks
     * 绑定 Goal 的当前 Epoch，不创建业务 Run，也不写入对话。已进入终态的 Run 仍可追加
     * 上下文事件，保留原终态与 Step 计数；正在等待外部动作且无法切换时返回稳定原因。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @returns 整理结果与原因；不会抛出可预期的不满足边界条件。
     * @example
     * ```ts
     * const outcome = await runner.compactContextNow({ goalId: "goal-1", runId: "run-1" });
     * ```
     */
    async compactContextNow(ref: RunRef, control?: ExecutionControl): Promise<ContextCompactionCommandOutcome> {
        throwIfAborted(control);
        const goal = await this.store.restore(ref.goalId);
        if (goal === undefined) return { kind: "unavailable", reason: "goal_not_found" };
        if (goal.state.run.id !== ref.runId) return { kind: "unavailable", reason: "run_mismatch" };
        const step = await this.compactContext(goal, "command", control);
        if (step.kind === "compacted") {
            const epoch = step.goal.state.run.contextEpoch;
            return {
                kind: "compacted",
                epochNumber: epoch.number,
                conversationStartIndex: epoch.conversationStartIndex,
            };
        }
        return {
            kind: "unavailable",
            reason: step.reason === "unsupported"
                ? "unsupported"
                : step.reason === "not_running"
                    ? "not_at_safe_boundary"
                    : step.reason === "pending"
                        ? "not_at_safe_boundary"
                        : step.reason === "no_window" || step.reason === "empty"
                            ? "empty_window"
                            : "not_reduced",
        };
    }

    /**
     * 在供应商明确以超窗拒绝后执行一次工作窗口整理。
     *
     * @remarks
     * 只在 Epoch 确实推进时返回新 Goal；提炼端口缺失、候选不足、正文无效或提交未推进时
     * 返回 `undefined`，由调用方按恢复失败结束本次 Run。
     */
    private async recoverContextWindow(goal: Goal, control?: ExecutionControl): Promise<Goal | undefined> {
        const step = await this.compactContext(goal, "context_window", control);
        return step.kind === "compacted" ? step.goal : undefined;
    }

    /** 构造一次已用尽超窗恢复机会的稳定执行错误。 */
    private contextWindowExceeded(goal: Goal): RunnerExecutionError {
        return new RunnerExecutionError(
            "CONTEXT_WINDOW_EXCEEDED",
            "Provider rejected the retried request because it still exceeds the model context window",
            undefined,
            goal,
        );
    }

    /**
     * 读取被移出历史对应的已提交事件范围。
     *
     * @remarks
     * 当前 Epoch 的 `openedAtSequence` 与提交边界定义被移出范围；代表事件身份只用于
     * 恢复时核验，不参与正文。没有可读的 Trajectory 时不提交压缩。
     */
    private async readCompactionSource(
        goal: Goal,
        firstSequence: number,
        control?: ExecutionControl,
    ): Promise<{ readonly firstSequence: number; readonly lastSequence: number; readonly eventIds: readonly string[] } | undefined> {
        const store = this.trajectoryStore;
        if (store === undefined) return undefined;
        const lastSequence = goal.state.run.committedThroughSequence;
        if (lastSequence < firstSequence) return undefined;
        const committed = await store.readWithBoundary(
            { goalId: goal.id, runId: goal.state.run.id },
            lastSequence,
        );
        const inRange = committed.committed.filter((event) =>
            event.sequence >= firstSequence && event.sequence <= lastSequence);
        if (inRange.length === 0) return undefined;
        throwIfAborted(control);
        return Object.freeze({
            firstSequence: inRange[0]!.sequence,
            lastSequence: inRange[inRange.length - 1]!.sequence,
            eventIds: Object.freeze([inRange[0]!.eventId, inRange[inRange.length - 1]!.eventId]
                .filter((id, index, ids) => ids.indexOf(id) === index)),
        });
    }

    /** @returns 提炼失败的诊断已尽力写入后的 Promise；诊断故障不改变执行结果。 */
    private async recordCompactionFailure(goal: Goal, error: unknown): Promise<void> {
        if (this.traceSink === undefined) return;
        try {
            await this.traceSink.append(allocateDiagnosticTraceRecord({
                goalId: goal.id,
                runId: goal.state.run.id,
                kind: "context_compaction_failed",
                payload: {
                    message: error instanceof Error ? error.message : String(error),
                },
            }));
        } catch {
            // 诊断失败不得改变执行结果。
        }
    }

    private async populateHistoricalContext(goal: Goal, control?: ExecutionControl): Promise<Goal> {
        if (goal.state.historicalStages !== undefined && goal.state.notes !== undefined) {
            return goal;
        }

        const cached = this.navigationProjection;
        if (cached !== undefined && cached.goalId === goal.id && cached.runId === goal.state.run.id) {
            return this.withNavigationProjection(goal, cached.stages, cached.notes);
        }

        const trajectoryStore = this.trajectoryStore;
        if (trajectoryStore === undefined) {
            const stages = Object.freeze([]) as readonly RunStageState[];
            const notes = Object.freeze([]) as readonly RuntimeContextNote[];
            this.navigationProjection = { goalId: goal.id, runId: goal.state.run.id, stages, notes };
            return this.withNavigationProjection(goal, stages, notes);
        }

        const runIds = [
            ...(goal.state.completedRuns ?? []).map((r) => r.runId),
            goal.state.run.id,
        ];

        const stagesList: RunStageState[] = [];
        const notesMap = new Map<string, RuntimeContextNote>();

        for (const runId of runIds) {
            throwIfAborted(control);
            const events = await this.recoveryReader.readNavigationHistory(
                { goalId: goal.id, runId },
                trajectoryWatermark(goal, runId),
                control,
            );

            const stagesByStageId = new Map<string, RunStageState>();
            for (const event of events) {
                if (event.eventType === "run_stage_declared") {
                    const p = event.payload as any;
                    stagesByStageId.set(p.stageId, {
                        stageId: p.stageId,
                        revision: p.revision,
                        status: "executing",
                        target: p.target,
                        acceptanceCriteria: p.acceptanceCriteria,
                        ...(p.previousStageResultRef !== undefined ? { previousStageResultRef: p.previousStageResultRef } : {}),
                        runId,
                    });
                } else if (event.eventType === "run_stage_accepted") {
                    const p = event.payload as any;
                    const existing = stagesByStageId.get(p.stageId);
                    if (existing !== undefined) {
                        stagesByStageId.set(p.stageId, {
                            ...existing,
                            revision: p.revision,
                            status: "accepted",
                            acceptedSequence: event.sequence,
                            ...(p.summary !== undefined ? { summary: p.summary } : {}),
                            runId,
                        });
                    }
                } else if (event.eventType === "context_note_declared") {
                    const p = event.payload as any;
                    const noteKey = `${runId}:${p.noteId}`;
                    notesMap.set(noteKey, {
                        noteId: p.noteId,
                        revision: p.revision,
                        category: p.category,
                        content: p.content,
                        ...(p.reason !== undefined ? { reason: p.reason } : {}),
                        ...(p.stageId !== undefined ? { stageId: p.stageId } : {}),
                        source: p.source as ContextNoteSource,
                        ...(p.supersedesNoteId !== undefined ? { supersedesNoteId: p.supersedesNoteId } : {}),
                    });
                }
            }

            for (const stage of stagesByStageId.values()) {
                if (stage.status === "accepted") {
                    stagesList.push(stage);
                }
            }
        }

        const stages = Object.freeze(stagesList);
        const notes = Object.freeze([...notesMap.values()]);
        this.navigationProjection = { goalId: goal.id, runId: goal.state.run.id, stages, notes };
        return this.withNavigationProjection(goal, stages, notes);
    }

    private withNavigationProjection(
        goal: Goal,
        stages: readonly RunStageState[],
        notes: readonly RuntimeContextNote[],
    ): Goal {
        const historicalStages = goal.state.historicalStages ?? stages;
        const projectedNotes = goal.state.notes ?? notes;
        if (historicalStages.length === 0 && projectedNotes.length === 0) {
            return goal;
        }
        return {
            ...goal,
            state: {
                ...goal.state,
                historicalStages,
                notes: projectedNotes,
            },
        };
    }

    private validateGoalProtocol(goal: Goal): void {
        if (this.protocolValidator === undefined) return;

        this.protocolValidator.validate({
            promptBundleVersion: goal.definition.promptBundleVersion,
            memoryProtocol: goal.definition.memoryProtocol,
            modelContextProtocol: goal.definition.modelContextProtocol,
            contextRetrievalProtocol: goal.definition.contextRetrievalProtocol,
        });
    }

    private async saveCheckpoint(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<Goal> {
        return this.checkpointCommitter.saveCheckpoint(goal, control);
    }

    private async appendTrajectory(
        draft: TrajectoryEventDraft,
        control?: ExecutionControl,
        countAsFact = true,
    ): Promise<Readonly<TrajectoryEvent> | undefined> {
        const event = await this.checkpointCommitter.append(draft, control, countAsFact);
        this.publishExecutionEvent(
            draft,
            {
                ...(event?.executionUnitId ?? draft.executionUnitId) === undefined
                    ? {}
                    : { executionUnitId: event?.executionUnitId ?? draft.executionUnitId },
                ...(event?.actionId ?? draft.actionId) === undefined
                    ? {}
                    : { actionId: event?.actionId ?? draft.actionId },
                kind: event?.payload.type ?? draft.eventType,
                visibility: "public",
                durability: event?.payload.type === "state_committed"
                    ? "checkpoint"
                    : event === undefined ? "live" : "trajectory",
                delivery: isStreamDeltaKind(event?.payload.type ?? draft.eventType)
                    ? "delta"
                    : "control",
                ...(isStreamDeltaKind(event?.payload.type ?? draft.eventType)
                    ? { coalescingKey: streamCoalescingKey(event?.executionUnitId ?? draft.executionUnitId, event?.actionId ?? draft.actionId, event?.payload.type ?? draft.eventType) }
                    : {}),
                payload: (event?.payload ?? draft.payload) as unknown as StreamJsonValue,
            },
        );
        return event;
    }

    private async openWorkingMemorySession(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<WorkingMemorySession> {
        throwIfAborted(control);
        const session = await WorkingMemorySession.restore(goal, {
            ...(this.trajectoryStore === undefined
                ? {}
                : { trajectoryStore: this.trajectoryStore }),
            ...(this.workingMemoryLimits === undefined
                ? {}
                : { limits: this.workingMemoryLimits }),
        });
        throwIfAborted(control);
        return session;
    }

    private validateDecisionPatchForStage(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession,
        executionUnitId: string,
    ): void {
        if (!("memoryPatch" in decision) || decision.memoryPatch === undefined) return;
        const workingMemory = session.workingMemory;
        try {
            validateMemoryPatchPhase(decision.memoryPatch, "executing", {
                workingMemory,
                ...(this.workingMemoryLimits === undefined ? {} : { limits: this.workingMemoryLimits }),
            });
            session.validatePatch(decision.memoryPatch, "execution");
            // 试归约只检验冲突和容量；阶段检查点后按实际序号重新生成条目身份。
            normalizeMemoryPatch(decision.memoryPatch, {
                phase: "executing", originSequence: goal.state.run.committedThroughSequence + 1,
                workingMemory,
                ...(this.workingMemoryLimits === undefined ? {} : { limits: this.workingMemoryLimits }),
            });
        } catch (error) {
            if (!(error instanceof WorkingMemoryPatchError) && !(error instanceof EvidenceGateError)) throw error;
            throw new ModelStageFeedbackError(createMemoryPatchFeedback(error, {
                goalId: goal.id, runId: goal.state.run.id, executionUnitId,
                stepOrdinal: goal.state.run.stepCount + 1,
            }, session.evidenceIndex), "Decide Memory proposal failed validation", error);
        }
    }

    private normalizeDecisionPatch(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession,
        factCount: number,
    ): AcceptedMemoryPatchInput | undefined {
        const memoryPatch = "memoryPatch" in decision
            ? decision.memoryPatch
            : undefined;

        const workingMemory = session.workingMemory;
        try {
            let normalized: NormalizedWorkingMemoryPatch = {
                protocolVersion: 1,
                operations: [],
                suppressed: [],
            };
            if (memoryPatch !== undefined) {
                const validationSession: WorkingMemorySession = session;
                validateMemoryPatchPhase(memoryPatch, "executing", {
                    workingMemory,
                    ...(this.workingMemoryLimits === undefined
                        ? {}
                        : { limits: this.workingMemoryLimits }),
                });
                validationSession.validatePatch(memoryPatch, "execution");
                normalized = normalizeMemoryPatch(memoryPatch, {
                    phase: "executing",
                    originSequence: Math.max(
                        1,
                        goal.state.run.committedThroughSequence + factCount + 1,
                    ),
                    workingMemory,
                    ...(this.workingMemoryLimits === undefined
                        ? {}
                        : { limits: this.workingMemoryLimits }),
                });
            }
            const terminalLifecycle = decision.kind === "complete" || decision.kind === "fail"
                ? [createSupersedeScopeOperation("phase", {
                    phase: "executing",
                    kinds: ["hypothesis", "blocker"],
                })]
                : [];
            const operations = [...normalized.operations, ...terminalLifecycle];
            if (operations.length === 0) return undefined;
            return {
                phase: "executing",
                producers: [
                    ...(normalized.operations.length === 0 ? [] : ["model" as const]),
                    ...(terminalLifecycle.length === 0 ? [] : ["runtime_lifecycle" as const]),
                ],
                operations,
                ...(memoryPatch === undefined ? {} : {
                    operationsAtSequence: (originSequence: number) => [
                        ...normalizeMemoryPatch(memoryPatch, {
                            phase: "executing", originSequence, workingMemory,
                            ...(this.workingMemoryLimits === undefined ? {} : { limits: this.workingMemoryLimits }),
                        }).operations,
                        ...terminalLifecycle,
                    ],
                }),
            };
        } catch (error) {
            if (error instanceof RunnerExecutionError) throw error;
            throw new RunnerExecutionError(
                "INVALID_MEMORY_PATCH",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private async createTerminalLifecyclePatch(
        goal: Goal,
        factCount: number,
        control?: ExecutionControl,
    ): Promise<AcceptedMemoryPatchInput | undefined> {
        const session = await this.openWorkingMemorySession(goal, control);
        try {
            return this.normalizeDecisionPatch(
                goal,
                { kind: "fail", error: "Runtime terminal lifecycle cleanup" },
                session,
                factCount,
            );
        } finally {
            session.close();
        }
    }

    private validateDecisionForStage(
        goal: Goal,
        candidate: unknown,
        executionUnitId: string,
        control?: ExecutionControl,
        session?: WorkingMemorySession,
    ): NormalizedExecution {
        let decision: AgentDecision;
        try {
            decision = validateAgentDecision(candidate);
        } catch (error) {
            if (error instanceof RunnerExecutionError && error.code === "INVALID_AGENT_DECISION") {
                throw createRunnerFeedbackError(error, goal, executionUnitId, "decide", "decision_semantics");
            }
            throw error;
        }

        let acceptedContextNotes: readonly RuntimeContextNote[] | undefined;
        if ("contextNotes" in decision && Array.isArray(decision.contextNotes) && decision.contextNotes.length > 0) {
            try {
                const existingNotes = goal.state.notes ?? (
                    session === undefined
                        ? []
                        : extractExistingContextNotesFromEvents([...session.evidenceIndex.events.values()])
                );
                const committedMessages = goal.state.messages.map((m, idx) => {
                    const steerInput = (goal.state.run.steerInputs ?? []).find(
                        (s) => s.status === "applied" && s.messageIndex === idx,
                    );
                    const messageId = steerInput?.messageId ?? (idx === 0 ? "msg-0" : `msg-${idx}`);
                    return {
                        messageId,
                        role: m.role,
                        content: m.content,
                    };
                });
                const reduction = validateAndReduceContextNotes(decision.contextNotes, {
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    ...(goal.state.run.currentStage?.stageId !== undefined
                        ? { currentStageId: goal.state.run.currentStage.stageId }
                        : {}),
                    committedMessages,
                    existingNotes,
                });
                acceptedContextNotes = reduction.acceptedEvents;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new ModelStageFeedbackError(createRuntimeFeedback({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    executionUnitId,
                    stepOrdinal: goal.state.run.stepCount + 1,
                    stage: "decide",
                    origin: "decision_semantics",
                    code: "INVALID_AGENT_DECISION",
                    attempt: 1,
                    issues: [{
                        code: "INVALID_AGENT_DECISION",
                        path: ["result", "contextNotes"],
                        message,
                    }],
                    constraints: ["Provide valid contextNotes citing verified sources and matching current revisions."],
                }), message);
            }
        }

        if (decision.kind === "run_stage_update") {
            try {
                if (goal.state.run.planRoute !== undefined) {
                    updateRunPlanStage(goal.state.run.planRoute, {
                        target: decision.target,
                        acceptanceCriteria: decision.acceptanceCriteria,
                        ...(decision.stageId !== undefined ? { stageId: decision.stageId } : {}),
                        ...(decision.baseRevision !== undefined ? { baseRevision: decision.baseRevision } : {}),
                        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
                    });
                } else if (decision.stageId === undefined) {
                    const previousStage = goal.state.run.currentStage;
                    const stageOrdinal = previousStage !== undefined
                        ? parseInt(previousStage.stageId.replace("stage-", ""), 10) + 1
                        : 1;
                    createInitialRunStage(
                        { target: decision.target, acceptanceCriteria: decision.acceptanceCriteria },
                        stageOrdinal,
                        previousStage,
                    );
                } else {
                    if (goal.state.run.currentStage === undefined) {
                        throw new RunStageTransitionError("Cannot revise stage: no active stage exists");
                    }
                    if (decision.baseRevision === undefined) {
                        throw new RunStageTransitionError("baseRevision is required when revising a stage");
                    }
                    if (decision.reason === undefined || decision.reason.trim().length === 0) {
                        throw new RunStageTransitionError("reason is required when revising a stage");
                    }
                    reviseRunStage(goal.state.run.currentStage, {
                        stageId: decision.stageId,
                        baseRevision: decision.baseRevision,
                        reason: decision.reason,
                        target: decision.target,
                        acceptanceCriteria: decision.acceptanceCriteria,
                    });
                }
            } catch (error) {
                if (error instanceof RunStageTransitionError || error instanceof RunPlanTransitionError) {
                    throw new ModelStageFeedbackError(createRuntimeFeedback({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        executionUnitId,
                        stepOrdinal: goal.state.run.stepCount + 1,
                        stage: "decide",
                        origin: "decision_semantics",
                        code: "INVALID_STAGE_PROPOSAL",
                        attempt: 1,
                        issues: [{
                            code: "INVALID_STAGE_PROPOSAL",
                            path: ["result"],
                            message: error.message,
                        }],
                        constraints: [goal.state.run.currentStage?.status === "executing"
                            ? "The call was not applied. Use system_revise_run_stage with target, acceptanceCriteria and reason, or system_complete_run_stage with summary and evidenceSequences. Runtime binds the active stage."
                            : goal.state.run.planRoute !== undefined
                                ? "The call was not applied. Start only the next pending approved stage with system_start_run_stage and an empty object. If no stage remains, complete the Run under its completion contract."
                                : "The call was not applied. No executing stage exists. Use system_start_run_stage with target and acceptanceCriteria; Runtime allocates its identity. Do not supply stageId, baseRevision or memoryPatch."],
                    }), error.message);
                }
                throw error;
            }
            return {
                decision,
                ...(acceptedContextNotes !== undefined ? { acceptedContextNotes } : {}),
            };
        }

        if (decision.kind === "run_plan_route_update") {
            try {
                const route = goal.state.run.planRoute;
                if (goal.state.run.mode !== "plan"
                    || goal.state.run.approvedTask === undefined
                    || route === undefined) {
                    throw new RunPlanTransitionError("完整路线修订仅允许用于已批准的 Plan Run");
                }
                if (decision.baseRevision !== route.revision) {
                    throw new RunPlanTransitionError("路线修订 baseRevision 与当前路线不匹配");
                }
                reviseRunPlanRoute(route, decision.route, decision.reason);
            } catch (error) {
                if (error instanceof RunPlanTransitionError) {
                    throw new ModelStageFeedbackError(createRuntimeFeedback({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        executionUnitId,
                        stepOrdinal: goal.state.run.stepCount + 1,
                        stage: "decide",
                        origin: "decision_semantics",
                        code: "INVALID_AGENT_DECISION",
                        attempt: 1,
                        issues: [{
                            code: "INVALID_AGENT_DECISION",
                            path: ["result", "route"],
                            message: error.message,
                        }],
                        constraints: [
                            "Use the current route revision, provide a concrete reason, and preserve every accepted stage exactly.",
                        ],
                    }), error.message);
                }
                throw error;
            }
            return {
                decision,
                ...(acceptedContextNotes !== undefined ? { acceptedContextNotes } : {}),
            };
        }

        if (decision.kind === "run_stage_complete") {
            if (goal.state.run.currentStage === undefined || goal.state.run.currentStage.status !== "executing") {
                throw new ModelStageFeedbackError(createRuntimeFeedback({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    executionUnitId,
                    stepOrdinal: goal.state.run.stepCount + 1,
                    stage: "decide",
                    origin: "decision_semantics",
                    code: "INVALID_STAGE_COMPLETION",
                    attempt: 1,
                    issues: [{
                        code: "INVALID_STAGE_COMPLETION",
                        path: ["result"],
                        message: "Cannot submit stage completion without an active executing stage.",
                    }],
                    constraints: ["Declare a stage before completing it."],
                }), "No active stage to complete");
            }
            if (goal.state.run.currentStage.stageId !== decision.stageId) {
                throw new ModelStageFeedbackError(createRuntimeFeedback({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    executionUnitId,
                    stepOrdinal: goal.state.run.stepCount + 1,
                    stage: "decide",
                    origin: "decision_semantics",
                    code: "INVALID_STAGE_COMPLETION",
                    attempt: 1,
                    issues: [{
                        code: "INVALID_STAGE_COMPLETION",
                        path: ["result", "stageId"],
                        message: `stageId mismatch: active stage is "${goal.state.run.currentStage.stageId}", got "${decision.stageId}"`,
                    }],
                    constraints: ["Use the declared system_complete_run_stage with summary and evidenceSequences. Runtime binds the active stage; do not supply stageId."],
                }), "stageId mismatch in stage completion candidate");
            }
            return {
                decision,
                ...(acceptedContextNotes !== undefined ? { acceptedContextNotes } : {}),
            };
        }

        if (decision.kind === "complete" && goal.state.run.planRoute !== undefined) {
            const route = goal.state.run.planRoute;
            const allStagesAccepted = route.nextStageIndex === route.stages.length;
            const completingFinalActiveStage = route.nextStageIndex === route.stages.length - 1
                && goal.state.run.currentStage?.status === "executing"
                && goal.state.run.currentStage.stageId === route.stages[route.nextStageIndex]?.stageId;
            if (!allStagesAccepted && !completingFinalActiveStage) {
                throw new ModelStageFeedbackError(createRuntimeFeedback({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    executionUnitId,
                    stepOrdinal: goal.state.run.stepCount + 1,
                    stage: "decide",
                    origin: "decision_semantics",
                    code: "INVALID_AGENT_DECISION",
                    attempt: 1,
                    issues: [{
                        code: "INVALID_AGENT_DECISION",
                        path: ["result"],
                        message: "The approved Plan route still has an incomplete stage.",
                    }],
                    constraints: ["Complete each approved route stage in order before completing the Run."],
                }), "Approved Plan route is incomplete");
            }
        }

        if (decision.kind !== "tool_call") {
            return {
                decision,
                ...(acceptedContextNotes !== undefined ? { acceptedContextNotes } : {}),
            };
        }

        const isSystemTool = decision.action.toolId.startsWith("system_");
        const isPlanModePreApproval = isPlanRunAwaitingTaskApproval(goal);
        if (!isSystemTool && !isPlanModePreApproval) {
            if (goal.state.run.currentStage === undefined || goal.state.run.currentStage.status !== "executing") {
                throw new ModelStageFeedbackError(createRuntimeFeedback({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    executionUnitId,
                    stepOrdinal: goal.state.run.stepCount + 1,
                    stage: "decide",
                    origin: "decision_semantics",
                    code: "STAGE_DECLARATION_REQUIRED",
                    attempt: 1,
                    issues: [{
                        code: "STAGE_DECLARATION_REQUIRED",
                        path: ["result"],
                        message: "Declare an executing stage using system_start_run_stage before executing business actions.",
                    }],
                    constraints: ["Declare a stage with target and acceptanceCriteria using system_start_run_stage before executing business tools."],
                }), "Stage declaration required before executing business tools");
            }
        }

        let prepared: PreparedToolAction;
        try {
            prepared = prepareToolAction(
                goal,
                decision.action,
                this.toolRegistry,
                this.toolPolicy,
                true,
                control,
                undefined,
                this.traceSink,
            );
            validateActionLifecycle(goal, prepared.action);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            if (error instanceof RunnerExecutionError
                && (error.code === "TOOL_NOT_AUTHORIZED"
                    || error.code === "TOOL_NOT_FOUND"
                    || error.code === "INVALID_TOOL_INPUT")) {
                throw createRunnerFeedbackError(
                    error,
                    goal,
                    executionUnitId,
                    "decide",
                    error.code === "INVALID_TOOL_INPUT" ? "tool_input" : "tool_selection",
                );
            }
            if (error instanceof RunnerExecutionError && error.code === "INVALID_AGENT_DECISION") {
                throw createRunnerFeedbackError(error, goal, executionUnitId, "decide", "decision_semantics");
            }
            throw error;
        }
        return {
            decision: { ...decision, action: prepared.action },
            preparedToolAction: prepared,
            ...(acceptedContextNotes !== undefined ? { acceptedContextNotes } : {}),
        };
    }

    private validateEvidenceForStage(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession,
        executionUnitId: string,
    ): void {
        try {
            this.validateCompletionEvidence(goal, decision, session);
        } catch (error) {
            if (!(error instanceof RunnerExecutionError) || error.code !== "INVALID_AGENT_DECISION") throw error;
            if (decision.kind !== "complete" && decision.kind !== "run_stage_complete") {
                throw createRunnerFeedbackError(error, goal, executionUnitId, "decide", "decision_semantics");
            }
            const validSequences = [...session.evidenceIndex.events.entries()]
                .filter(([, event]) => event.eventType === "tool_finished" || event.eventType === "observation_recorded")
                .map(([sequence]) => sequence);
            throw createRunnerFeedbackError(
                error,
                goal,
                executionUnitId,
                "decide",
                "completion_evidence",
                [`Valid committed evidence sequences: ${validSequences.join(", ") || "none"}.`],
            );
        }
    }

    private validateCompletionEvidence(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession,
    ): void {
        const run = goal.state.run;
        const task = goal.state.run.approvedTask;
        if (decision.kind === "run_plan_route_update"
            && (run.mode !== "plan" || task === undefined || run.planRoute === undefined)) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "run_plan_route_update is only allowed for an approved Plan route",
            );
        }
        if (decision.kind === "task_proposal" && (run.mode !== "plan" || task !== undefined)) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "task_proposal is only allowed before approval in Plan Mode",
            );
        }
        if (decision.kind === "goal_plan_update" && !canUpdateGoalPlan(run.mode)) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "goal_plan_update is not authorized in the current Run mode",
            );
        }

        if (run.mode === "plan" && task === undefined) {
            if (["complete", "wait", "fail"].includes(decision.kind)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    `${decision.kind} is not allowed before a Plan task is approved`,
                );
            }
            return;
        }

        if (decision.kind === "run_stage_complete") {
            if (decision.evidenceSequences && decision.evidenceSequences.length > 0) {
                try {
                    session.validateEvidence(decision.evidenceSequences);
                } catch (error) {
                    throw new RunnerExecutionError(
                        "INVALID_AGENT_DECISION",
                        error instanceof Error ? error.message : String(error),
                    );
                }
            }
            return;
        }

        if (decision.kind !== "complete") return;

        if (run.mode === "normal") {
            if (!("evidenceSequences" in decision) || !Array.isArray(decision.evidenceSequences)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "normal complete must include evidenceSequences",
                );
            }
            if (decision.evidenceSequences.length > 0) {
                try {
                    session.validateEvidence(decision.evidenceSequences);
                } catch (error) {
                    throw new RunnerExecutionError(
                        "INVALID_AGENT_DECISION",
                        error instanceof Error ? error.message : String(error),
                    );
                }
            }

            const evidenceIndex = session.evidenceIndex;
            const hasBusinessObservation = [...evidenceIndex.events.values()].some((event) =>
                event.payload.type === "tool_finished",
            );
            if (hasBusinessObservation && decision.evidenceSequences.length === 0) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "normal complete must cite current Run Tool/Observation evidence",
                );
            }
            return;
        }

        if (task === undefined) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "Plan complete requires an approved Goal Task",
            );
        }

        if (!("completionEvidence" in decision)) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "structured complete must include completionEvidence",
            );
        }

        const evidence = decision.completionEvidence;
        if (!Array.isArray(evidence) || evidence.length !== task.completionCriteria.length) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "completionEvidence must cover every completion criterion exactly once",
            );
        }

        const seen = new Set<number>();
        for (const item of evidence as readonly unknown[]) {
            const criterionIndexValue = isRecord(item)
                ? item.criterionIndex
                : undefined;
            if (
                !isRecord(item)
                || !hasOnlyKeys(item, ["criterionIndex", "evidenceSequences"])
                || typeof criterionIndexValue !== "number"
                || !Number.isSafeInteger(criterionIndexValue)
                || criterionIndexValue < 0
                || criterionIndexValue >= task.completionCriteria.length
                || !Array.isArray(item.evidenceSequences)
            ) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "completionEvidence item is invalid",
                );
            }

            const criterionIndex = criterionIndexValue;
            if (seen.has(criterionIndex)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "completionEvidence contains duplicate criterionIndex",
                );
            }
            seen.add(criterionIndex);

            try {
                session.validateEvidence(item.evidenceSequences as readonly number[]);
            } catch (error) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    error instanceof Error ? error.message : String(error),
                );
            }
        }

        for (let index = 0; index < task.completionCriteria.length; index += 1) {
            if (!seen.has(index)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "completionEvidence is missing a criterion",
                );
            }
        }

        const evidenceIndex = session.evidenceIndex;
        for (const item of evidence as readonly { readonly criterionIndex: number; readonly evidenceSequences: readonly number[] }[]) {
            const criterion = task.completionCriteria[item.criterionIndex];
            if (criterion?.acceptance !== undefined) {
                const { expectToolId, expectOutcome } = criterion.acceptance;
                if (expectToolId.startsWith("system_")) {
                    continue;
                }
                const hasMatch = item.evidenceSequences.some((seq) => {
                    const observation = resolveEvidenceObservation(seq, evidenceIndex);
                    return (
                        observation !== undefined
                        && observation.toolId === expectToolId
                        && observation.outcome === expectOutcome
                    );
                });
                if (!hasMatch) {
                    throw new RunnerExecutionError(
                        "INVALID_AGENT_DECISION",
                        `completion criterion ${item.criterionIndex} requires ${expectToolId} ${expectOutcome} observation, referenced evidence does not match`,
                    );
                }
            }
        }
    }

    private async commitDecision(
        goal: Goal,
        facts: readonly TrajectoryEventDraft[],
        acceptedPatch: AcceptedMemoryPatchInput | undefined,
        control?: ExecutionControl,
        modelContextFrame?: ModelContextFrameForStage & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        },
        expectedStageKey?: string,
    ): Promise<Goal> {
        const terminalSessionState = goal.state.run.status === "failed" || goal.state.run.status === "cancelled";
        return withGoalMutationGate(this.store, goal.id, async () => {
            const result = await this.checkpointCommitter.commit(goal, {
                facts,
                ...(acceptedPatch === undefined ? {} : { acceptedPatch }),
                ...(terminalSessionState ? { sessionState: "caller" as const } : {}),
                prepare: (latest) => {
                    const latestForRun = latest?.state.run.id === goal.state.run.id
                        ? latest
                        : undefined;
                    if (expectedStageKey !== undefined
                        && latestForRun !== undefined
                        && stageRequestKey(latestForRun) !== expectedStageKey) {
                        throw new StaleStageRequestError(latestForRun);
                    }
                    if (latestForRun?.state.run.interruption?.status === "requested") {
                        throw new RunInterruptAcceptedError("Run Interrupt was accepted before the model checkpoint");
                    }
                    if (latestForRun !== undefined
                        && (latestForRun.state.run.steerInputs ?? []).some(input => input.status === "pending")) {
                        throw new PendingSteerAcceptedError();
                    }
                    if (!terminalSessionState || latest === undefined) return goal;
                    const latestSessionGoal = withLatestSessionState(goal, latest);
                    if (latestForRun === undefined) return latestSessionGoal;
                    const messageQueue = pauseQueuedMessagesForTerminalRun(
                        latestForRun.state.messageQueue,
                        goal.state.run,
                    );
                    return messageQueue === undefined
                        ? latestSessionGoal
                        : { ...latestSessionGoal, state: { ...latestSessionGoal.state, messageQueue } };
                },
                ...(control === undefined ? {} : { control }),
                ...(modelContextFrame === undefined ? {} : { modelContextFrame }),
            });
            this.publishCommittedEvents(result);
            this.publishCheckpointCommitted(result, facts);

            let nextHistStages = goal.state.historicalStages ?? [];
            let nextNotes = goal.state.notes ?? [];

            for (const fact of facts) {
                if (fact.eventType === "run_stage_accepted") {
                    const p = fact.payload as any;
                    const current = goal.state.run.currentStage;
                    if (current !== undefined && current.stageId === p.stageId) {
                        const acceptedItem: RunStageState = {
                            ...current,
                            revision: p.revision,
                            status: "accepted",
                            ...(p.summary !== undefined ? { summary: p.summary } : {}),
                            ...(goal.state.run.id !== undefined ? { runId: goal.state.run.id } : {}),
                        };
                        const filtered = nextHistStages.filter(s => !(s.stageId === acceptedItem.stageId && s.runId === acceptedItem.runId));
                        nextHistStages = [...filtered, acceptedItem];
                    }
                } else if (fact.eventType === "context_note_declared") {
                    const p = fact.payload as any;
                    const noteItem: RuntimeContextNote = {
                        noteId: p.noteId,
                        revision: p.revision,
                        category: p.category,
                        content: p.content,
                        ...(p.reason !== undefined ? { reason: p.reason } : {}),
                        ...(p.stageId !== undefined ? { stageId: p.stageId } : {}),
                        source: p.source,
                        ...(p.supersedesNoteId !== undefined ? { supersedesNoteId: p.supersedesNoteId } : {}),
                    };
                    const filtered = nextNotes.filter(n => n.noteId !== noteItem.noteId);
                    nextNotes = [...filtered, noteItem];
                }
            }

            const shouldSetHist = nextHistStages.length > 0 || goal.state.historicalStages !== undefined;
            const shouldSetNotes = nextNotes.length > 0 || goal.state.notes !== undefined;

            if (!shouldSetHist && !shouldSetNotes) {
                return result.goal;
            }

            return {
                ...result.goal,
                state: {
                    ...result.goal.state,
                    ...(shouldSetHist ? { historicalStages: Object.freeze(nextHistStages) } : {}),
                    ...(shouldSetNotes ? { notes: Object.freeze(nextNotes) } : {}),
                },
            };
        });
    }

    private async commitToolProgressPreservingSteers(
        goal: Goal,
        facts: readonly TrajectoryEventDraft[],
        control?: ExecutionControl,
    ): Promise<TrajectoryCheckpointCommitResult> {
        const committed = await this.checkpointCommitter.commit(goal, {
            facts,
            prepare: (latest) => {
                const latestForRun = latest?.state.run.id === goal.state.run.id
                    ? latest
                    : undefined;
                if (latestForRun?.state.run.interruption?.status === "requested") {
                    throw new RunInterruptAcceptedError("Run Interrupt was accepted before a new Tool attempt");
                }
                const steerInputs = latestForRun?.state.run.steerInputs;
                return steerInputs === undefined
                    ? goal
                    : this.withRun(goal, { ...goal.state.run, steerInputs });
            },
            ...(control === undefined ? {} : { control }),
        });
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, facts);
        if (goal.state.historicalStages === undefined && goal.state.notes === undefined) {
            return committed;
        }
        const nextState: GoalState = {
            ...committed.goal.state,
            ...(goal.state.historicalStages !== undefined ? { historicalStages: goal.state.historicalStages } : {}),
            ...(goal.state.notes !== undefined ? { notes: goal.state.notes } : {}),
        };
        return {
            ...committed,
            goal: {
                ...committed.goal,
                state: nextState,
            },
        };
    }

    private async applyPendingSteers(goal: Goal, control?: ExecutionControl): Promise<Goal> {
        return withGoalMutationGate(this.store, goal.id, async (): Promise<Goal> => {
            const latest = await this.restore({ goalId: goal.id, runId: goal.state.run.id }, control);
            if (latest === undefined || latest.state.run.status !== "running") return latest ?? goal;
            const pending = (latest.state.run.steerInputs ?? []).filter(
                (input): input is Extract<RunSteerInput, { readonly status: "pending" }> => input.status === "pending",
            );
            if (pending.length === 0) {
                if (goal.state.historicalStages === undefined && goal.state.notes === undefined) {
                    return latest;
                }
                const nextState: GoalState = {
                    ...latest.state,
                    ...(goal.state.historicalStages !== undefined ? { historicalStages: goal.state.historicalStages } : {}),
                    ...(goal.state.notes !== undefined ? { notes: goal.state.notes } : {}),
                };
                return {
                    ...latest,
                    state: nextState,
                };
            }
            let messages = latest.state.messages;
            const steerInputs = [...(latest.state.run.steerInputs ?? [])];
            const facts: TrajectoryEventDraft[] = [];
            const appliedPositions = new Map<string, number>();
            for (const input of pending) {
                const messageIndex = messages.length;
                const appended = appendGoalMessage({
                    ...latest,
                    state: { ...latest.state, messages },
                }, {
                    role: "user",
                    content: input.content,
                    runId: latest.state.run.id,
                    source: { kind: "user_input", inputId: input.messageId },
                });
                messages = appended.goal.state.messages;
                appliedPositions.set(input.messageId, messageIndex);
                const index = steerInputs.findIndex(item => item.messageId === input.messageId);
                steerInputs[index] = { messageId: input.messageId, status: "applied", messageIndex };
                facts.push({
                    goalId: latest.id,
                    runId: latest.state.run.id,
                    phase: "executing",
                    eventType: "steer_input_applied",
                    payload: { type: "steer_input_applied", messageId: input.messageId, messageIndex },
                });
            }
            // 统一账本同步标记为已应用；没有账本条目的旧路径不凭空创建收据。
            const inputLedger = applyPendingSessionInputs(
                latest.state.inputLedger,
                [...appliedPositions].map(([inputId, messageIndex]) => ({
                    inputId,
                    appliedRunId: latest.state.run.id,
                    messageIndex,
                })),
            );
            const nextState: GoalState = {
                ...latest.state,
                messages,
                ...(inputLedger === undefined ? {} : { inputLedger }),
                ...(goal.state.historicalStages !== undefined ? { historicalStages: goal.state.historicalStages } : {}),
                ...(goal.state.notes !== undefined ? { notes: goal.state.notes } : {}),
                run: (() => {
                    const {
                        pendingThink: _pendingThink,
                        pendingModelRepair: _pendingModelRepair,
                        ...runWithoutStaleStage
                    } = latest.state.run;
                    return { ...runWithoutStaleStage, steerInputs };
                })(),
            };
            const nextGoal: Goal = {
                ...latest,
                state: nextState,
            };
            const committed = await this.checkpointCommitter.commit(nextGoal, {
                facts,
                sessionState: "caller",
                ...(control === undefined ? {} : { control }),
            });
            this.publishCommittedEvents(committed);
            this.publishCheckpointCommitted(committed, facts);
            const finalState: GoalState = {
                ...committed.goal.state,
                ...(goal.state.historicalStages !== undefined ? { historicalStages: goal.state.historicalStages } : {}),
                ...(goal.state.notes !== undefined ? { notes: goal.state.notes } : {}),
            };
            return {
                ...committed.goal,
                state: finalState,
            };
        });
    }

    private async commitStageCheckpoint(
        goal: Goal,
        facts: readonly TrajectoryEventDraft[],
        control: ExecutionControl | undefined,
        modelContextFrame?: ModelContextFrameForStage & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        },
        expectedStageKey?: string,
    ): Promise<Goal> {
        try {
            if (this.trajectoryStore === undefined
                && facts.some((fact) => fact.eventType === "think_requested")) {
                throw new TrajectoryAppendError("Think checkpoints require an enabled Trajectory sink");
            }
            return await this.commitDecision(
                goal,
                facts,
                undefined,
                control,
                modelContextFrame,
                expectedStageKey,
            );
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            if (error instanceof StaleStageRequestError) throw error;
            throw new StageCheckpointFailure(error);
        }
    }

    private async appendRepairAttempt(
        goal: Goal,
        input: StepExecutionInput,
        stage: ModelContextStage,
        inputBoundary: PendingThink["inputBoundary"],
        thinkRequestId: string | undefined,
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly pending: PendingModelRepair }> {
        const previous = goal.state.run.pendingModelRepair;
        if (previous !== undefined && (
            previous.goalId !== goal.id
            || previous.runId !== goal.state.run.id
            || previous.stepOrdinal !== goal.state.run.stepCount + 1
            || previous.executionUnitId !== input.executionUnitId
            || previous.stage !== stage
            || previous.inputBoundary !== inputBoundary
            || previous.thinkRequestId !== thinkRequestId
        )) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair identity does not match the current stage");
        }
        const isContinuation = previous?.latestFailureClass === "non_advancing";
        const attempt = isContinuation ? (previous?.attemptsStarted ?? 0) : (previous?.attemptsStarted ?? 0) + 1;
        const continuationAttempt = isContinuation ? (previous?.continuationsStarted ?? 0) + 1 : (previous?.continuationsStarted ?? 0);
        if (attempt > 3 || continuationAttempt > 3) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION",
                isContinuation
                    ? "Model output continuation exhausted after three calls"
                    : "Model output correction exhausted after three calls");
        }
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Model output correction requires a Trajectory store");
        }
        const draft: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
            stepIndex: goal.state.run.stepCount + 1,
            eventType: "model_repair_attempt_started",
            payload: {
                type: "model_repair_attempt_started",
                stage,
                attempt,
                inputBoundary,
                ...(thinkRequestId === undefined ? {} : { thinkRequestId }),
            },
        };
        const event = await this.checkpointCommitter.append(draft, control);
        if (event?.eventType !== "model_repair_attempt_started") {
            throw new TrajectoryAppendError("Model repair attempts require an enabled Trajectory sink");
        }
        const pending: PendingModelRepair = {
            goalId: goal.id,
            runId: goal.state.run.id,
            stepOrdinal: goal.state.run.stepCount + 1,
            executionUnitId: input.executionUnitId ?? "unbound",
            stage,
            inputBoundary,
            attemptsStarted: attempt,
            ...(continuationAttempt === 0 ? {} : { continuationsStarted: continuationAttempt }),
            ...(previous?.latestFailureClass === undefined ? {} : { latestFailureClass: previous.latestFailureClass }),
            latestAttemptEventId: event.eventId,
            ...(previous?.latestFeedbackEventId === undefined
                ? {}
                : { latestFeedbackEventId: previous.latestFeedbackEventId }),
            ...(thinkRequestId === undefined ? {} : { thinkRequestId }),
        };
        const nextGoal = this.withRun(goal, {
            ...goal.state.run,
            pendingModelRepair: pending,
        });
        const savedGoal = await this.commitStageCheckpoint(nextGoal, [], control);
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [draft]);
        return { goal: savedGoal, pending };
    }

    private async appendRepairFeedback(
        goal: Goal,
        pending: PendingModelRepair,
        feedback: RuntimeFeedback,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const draft: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: pending.executionUnitId,
            stepIndex: pending.stepOrdinal,
            eventType: "model_repair_feedback_recorded",
            payload: {
                type: "model_repair_feedback_recorded",
                stage: pending.stage,
                attempt: feedback.attempt,
                feedback,
            },
        };
        const event = await this.checkpointCommitter.append(draft, control);
        if (event?.eventType !== "model_repair_feedback_recorded") {
            throw new TrajectoryAppendError("Model repair feedback requires an enabled Trajectory sink");
        }
        const nextPending: PendingModelRepair = {
            ...pending,
            latestFeedbackEventId: event.eventId,
            latestFailureClass: isNonAdvancingFeedback(feedback) ? "non_advancing" : "protocol",
        };
        const nextGoal = this.withRun(goal, {
            ...goal.state.run,
            pendingModelRepair: nextPending,
        });
        const savedGoal = await this.commitStageCheckpoint(nextGoal, [], control);
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [draft]);
        return savedGoal;
    }

    private async readRepairFeedback(
        goal: Goal,
        pending: PendingModelRepair | undefined,
        control?: ExecutionControl,
    ): Promise<RuntimeFeedback | undefined> {
        if (pending?.latestFeedbackEventId === undefined) return undefined;
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Cannot restore model repair feedback without Trajectory");
        }
        const result = await this.recoveryReader.readTrajectory(
            { goalId: goal.id, runId: goal.state.run.id },
            goal.state.run.committedThroughSequence,
            control,
        );
        const matches = result.committed.filter((event) =>
            event.eventType === "model_repair_feedback_recorded"
            && event.eventId === pending.latestFeedbackEventId,
        );
        if (matches.length !== 1) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair feedback is missing or duplicated");
        }
        const event = matches[0]!;
        if (event.eventType !== "model_repair_feedback_recorded"
            || event.goalId !== goal.id
            || event.runId !== goal.state.run.id
            || event.executionUnitId !== pending.executionUnitId
            || event.stepIndex !== pending.stepOrdinal
            || event.payload.stage !== pending.stage
            || event.payload.feedback.goalId !== goal.id
            || event.payload.feedback.runId !== goal.state.run.id
            || event.payload.feedback.executionUnitId !== pending.executionUnitId
            || event.payload.feedback.stepOrdinal !== pending.stepOrdinal
            || event.payload.feedback.stage !== pending.stage) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair feedback identity is invalid");
        }
        throwIfAborted(control);
        return event.payload.feedback;
    }

    /**
     * 计算暂存队首后应写入的批次指针。
     *
     * @param goal - 暂存前的 Goal，用于读取当前队列。
     * @param batch - 本次 Decide 新建的批次剩余项；来自队列时省略。
     * @param consumedFromBatch - 队首是否取自既有队列。
     * @returns 应合并进 run 状态的批次补丁；队列为空时显式清空。
     * @remarks
     * 指针与 `pendingAction` 在同一次提交写入，避免"Action 已暂存但队列未推进"导致恢复后重放。
     * @example
     * ```ts
     * Object.assign(stagedRun, runner.pendingBatchPatch(goal, undefined, true));
     * ```
     */
    private pendingBatchPatch(
        goal: Goal,
        batch: PendingActionBatch | undefined,
        consumedFromBatch: boolean,
    ): { readonly pendingActionBatch?: PendingActionBatch | undefined } {
        const current = goal.state.run.pendingActionBatch;
        const next = batch !== undefined
            ? batch.remaining
            : consumedFromBatch && current !== undefined
                ? current.remaining.slice(1)
                : undefined;
        if (next === undefined) return {};
        if (next.length === 0) return { pendingActionBatch: undefined };
        const batchId = current?.batchId ?? batch?.batchId ?? "batch";
        return { pendingActionBatch: { batchId, remaining: next } };
    }

    /**
     * 提交零调用且正文非空的 Assistant 消息。
     *
     * @remarks
     * 该消息只作为 Goal 消息持久化：不推进 Step、不执行 Tool、不构成完成语义。
     * 调用方在提交后按"不推进类决策"抛出反馈，让 Decide 在同 stage 的有界修复链内继续。
     *
     * @param goal - 当前已提交的 Goal。
     * @param result - Executor 返回的 assistant_message 结果。
     * @param executionUnitId - 当前执行单元标识；缺省时不写入事件归属。
     * @param control - 共享取消控制；提交过程中止时抛出。
     * @returns 含新消息的已提交 Goal。
     * @throws 提交失败或取消时抛出。
     * @example
     * ```ts
     * const committed = await runner.commitAssistantMessage(goal, result, "exec-1");
     * ```
     */
    private async commitAssistantMessage(
        goal: Goal,
        result: Extract<DecideStageResult, { readonly kind: "assistant_message" }>,
        executionUnitId: string,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const modelCallId = result.modelCallId ?? result.modelContextFrame?.modelCallId;
        const nextGoal: Goal = appendGoalMessage(goal, {
            role: "assistant",
            content: result.text,
            runId: goal.state.run.id,
            purpose: "process",
            profileId: goal.definition.profile.id,
            source: modelCallId === undefined
                ? createStageOutputSource(executionUnitId, 0)
                : createModelTextSource(modelCallId, 0),
        }).goal;
        const committed = await this.checkpointCommitter.commit(
            nextGoal,
            { facts: [], ...(control === undefined ? {} : { control }) },
        );
        this.publishCommittedEvents(committed);
        return committed.goal;
    }

    /**
     * 把混合工具响应中的公开正文块按块顺序追加为过程消息。
     *
     * @remarks
     * 每条正文保留原块下标与模型调用来源；空白块不产生消息。追加只改变内存中的
     * Goal，真正落盘由随后的决策提交完成，因此响应失败、参数无效或完成候选被
     * 审查拒绝时不会留下正式正文。
     *
     * @param goal - 当前已提交的 Goal。
     * @param blocks - 本次响应被接受后应保存的公开正文块。
     * @param modelCallId - 产生该正文的模型调用身份；缺省时不虚构模型调用。
     * @param executionUnitId - 当前执行单元身份；仅在没有模型调用身份时作为来源。
     * @returns 含过程消息的新 Goal；不修改输入对象。
     */
    private appendProcessTextMessages(
        goal: Goal,
        blocks: readonly PublicTextBlock[],
        modelCallId: string | undefined,
        executionUnitId: string,
    ): Goal {
        let next = goal;
        for (const block of blocks) {
            if (block.text.trim().length === 0) continue;
            next = appendGoalMessage(next, {
                role: "assistant",
                content: block.text,
                runId: goal.state.run.id,
                purpose: "process",
                profileId: goal.definition.profile.id,
                source: modelCallId === undefined
                    ? createStageOutputSource(executionUnitId, block.index)
                    : createModelTextSource(modelCallId, block.index),
            }).goal;
        }
        return next;
    }

    private async executeRepairableModelStage<T, U>(
        goal: Goal,
        input: StepExecutionInput,
        stage: ModelContextStage,
        inputBoundary: PendingThink["inputBoundary"],
        thinkRequestId: string | undefined,
        operation: (goal: Goal, feedback: RuntimeFeedback | undefined) => Promise<T>,
        validate: (goal: Goal, value: T) => U | Promise<U>,
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly result: U }> {
        let currentGoal = goal;
        let pending = currentGoal.state.run.pendingModelRepair;
        if (pending !== undefined && pending.stage !== stage) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair stage does not match the requested stage");
        }
        let feedback = await this.readRepairFeedback(currentGoal, pending, control);
        // 同一阶段的连续模型调用最多消耗一次超窗整理，避免反复压缩退化为无界重试。
        let contextRecoveryUsed = false;
        while (true) {
            throwIfAborted(control);
            const started = await this.appendRepairAttempt(
                currentGoal,
                input,
                stage,
                inputBoundary,
                thinkRequestId,
                control,
            );
            currentGoal = started.goal;
            pending = started.pending;
            try {
                const value = await this.executeModelStage(
                    async () => {
                        try {
                            return await operation(currentGoal, feedback);
                        } catch (error) {
                            if (!(error instanceof ContextWindowRejectedError)) throw error;
                            if (contextRecoveryUsed) throw this.contextWindowExceeded(currentGoal);
                            contextRecoveryUsed = true;
                            const recovered = await this.recoverContextWindow(currentGoal, control);
                            if (recovered === undefined) {
                                throw new RunnerExecutionError(
                                    "CONTEXT_WINDOW_RECOVERY_FAILED",
                                    "Provider rejected the request because it exceeds the context window, and the working window could not be compacted",
                                    undefined,
                                    currentGoal,
                                );
                            }
                            currentGoal = recovered;
                            try {
                                return await operation(currentGoal, feedback);
                            } catch (retryError) {
                                if (retryError instanceof ContextWindowRejectedError) {
                                    throw this.contextWindowExceeded(currentGoal);
                                }
                                throw retryError;
                            }
                        }
                    },
                    control,
                    async (attempt, error) => {
                        currentGoal = await this.recordModelRequestFailure(currentGoal, input, stage, attempt, error, control);
                    },
                );
                // 模型调用可能在用户中断已经落下后才返回；提交任何事实前必须再次观察取消。
                throwIfAborted(control);
                const result = await this.executeModelStage(
                    async () => validate(currentGoal, value),
                    control,
                    async (attempt, error) => {
                        currentGoal = await this.recordModelRequestFailure(currentGoal, input, stage, attempt, error, control);
                    },
                );
                throwIfAborted(control);
                return { goal: currentGoal, result };
            } catch (error) {
                if (isExecutionAbortedError(error)) throw error;
                if (error instanceof StageCheckpointFailure) throw error;
                if (error instanceof StaleStageRequestError) throw error;
                if (!(error instanceof ModelStageFeedbackError)) {
                    throw new StageExecutionFailure(
                        error,
                        error instanceof RunnerExecutionError && error.committedGoal !== undefined ? error.committedGoal : undefined,
                    );
                }
                if (error.feedback.stage !== stage
                    || error.feedback.goalId !== currentGoal.id
                    || error.feedback.runId !== currentGoal.state.run.id
                    || error.feedback.stepOrdinal !== currentGoal.state.run.stepCount + 1
                    || error.feedback.executionUnitId !== input.executionUnitId) {
                    throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Model repair feedback identity does not match the current stage");
                }
                const isContinuationFailure = isNonAdvancingFeedback(error.feedback);
                feedback = createRuntimeFeedback({
                    ...error.feedback,
                    attempt: isContinuationFailure
                        ? (pending.continuationsStarted ?? 0) + 1
                        : pending.attemptsStarted,
                });
                currentGoal = await this.appendRepairFeedback(currentGoal, pending, feedback, control);
                if (error.assistantMessageText !== undefined) {
                    currentGoal = await this.commitAssistantMessage(
                        currentGoal,
                        {
                            kind: "assistant_message",
                            text: error.assistantMessageText,
                            ...(error.modelCallId === undefined ? {} : { modelCallId: error.modelCallId }),
                        },                        pending.executionUnitId,
                        control,
                    );
                }
                const startedBudget = isContinuationFailure
                    ? (pending.continuationsStarted ?? 0) + 1
                    : pending.attemptsStarted;
                if (startedBudget >= 3) {
                    throw new RunnerExecutionError(
                        "INVALID_AGENT_DECISION",
                        isContinuationFailure
                            ? "Model output continuation exhausted after three " + stage + " attempts (" + feedback.code + ")"
                            : "Model output correction exhausted after three " + stage + " attempts (" + feedback.code + ")",
                        undefined,
                        currentGoal,
                    );
                }
            }
        }
    }

    private createRepairInputBoundary(
        baseBoundary: string,
        stage: ModelContextStage,
        thinkRequestId?: string,
        thinkGoal?: string,
    ): PendingThink["inputBoundary"] {
        const identity = canonicalJson({
            baseBoundary,
            stage,
            thinkRequestId,
            thinkGoal,
        });
        return ("sha256:" + createHash("sha256").update(identity, "utf8").digest("hex")) as PendingThink["inputBoundary"];
    }

    private async commitThinkRequestForRepair(
        goal: Goal,
        fact: Extract<TrajectoryEventDraft, { readonly eventType: "think_requested" }>,
        input: StepExecutionInput,
        baseBoundary: string,
        modelContextFrame: ModelContextFrameForStage & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        } | undefined,
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly requestEventId: string }> {
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Think recovery requires an enabled Trajectory store");
        }
        const event = await this.checkpointCommitter.append(fact, control);
        if (event?.eventType !== "think_requested") {
            throw new TrajectoryAppendError("Think repair requires a committed Think request event");
        }
        const boundary = this.createRepairInputBoundary(
            baseBoundary,
            "think",
            event.payload.requestId,
            event.payload.goal,
        );
        const pending: PendingModelRepair = {
            goalId: goal.id,
            runId: goal.state.run.id,
            stepOrdinal: goal.state.run.stepCount + 1,
            executionUnitId: input.executionUnitId ?? "unbound",
            stage: "think",
            inputBoundary: boundary,
            attemptsStarted: 0,
            latestAttemptEventId: event.eventId,
            thinkRequestId: event.payload.requestId,
        };
        const checkpointGoal = this.withRun(goal, {
            ...goal.state.run,
            pendingModelRepair: pending,
        });
        const savedGoal = await this.commitStageCheckpoint(
            checkpointGoal,
            [],
            control,
            modelContextFrame,
        );
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [fact]);
        return { goal: savedGoal, requestEventId: event.payload.requestId };
    }

    private async restoreThinkRequest(
        goal: Goal,
        pending: PendingModelRepair,
        baseBoundary: PendingThink["inputBoundary"],
        control?: ExecutionControl,
    ): Promise<Extract<TrajectoryEvent, { readonly eventType: "think_requested" }>> {
        if (this.trajectoryStore === undefined || pending.thinkRequestId === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending Think repair has no restorable request");
        }
        const result = await this.recoveryReader.readTrajectory(
            { goalId: goal.id, runId: goal.state.run.id },
            goal.state.run.committedThroughSequence,
            control,
        );
        const matches = result.committed.filter((event) =>
            event.eventType === "think_requested"
            && event.payload.requestId === pending.thinkRequestId,
        );
        if (matches.length !== 1) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending Think request is missing or duplicated");
        }
        const event = matches[0]!;
        if (event.eventType !== "think_requested"
            || event.goalId !== goal.id
            || event.runId !== goal.state.run.id
            || event.executionUnitId !== pending.executionUnitId
            || event.stepIndex !== pending.stepOrdinal
            || event.payload.stepOrdinal !== pending.stepOrdinal
            || event.payload.requestId !== pending.thinkRequestId
            || pending.inputBoundary !== this.createRepairInputBoundary(
                baseBoundary,
                "think",
                event.payload.requestId,
                event.payload.goal,
            )) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending Think request identity is invalid");
        }
        throwIfAborted(control);
        return event;
    }

    private async executeThinkRepair(
        goal: Goal,
        input: StepExecutionInput,
        request: Extract<TrajectoryEvent, { readonly eventType: "think_requested" }>,
        baseBoundary: PendingThink["inputBoundary"],
        thinkHistory: ThinkExchange[],
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly exchange: ThinkExchange }> {
        const repairBoundary = this.createRepairInputBoundary(
            baseBoundary,
            "think",
            request.payload.requestId,
            request.payload.goal,
        );
        const executed = await this.executeRepairableModelStage(
            goal,
            input,
            "think",
            repairBoundary,
            request.payload.requestId,
            (activeGoal, runtimeFeedback) => this.executor.think!({
                ...input,
                goal: activeGoal,
                thinkGoal: request.payload.goal,
                thinkHistory,
                ...(runtimeFeedback === undefined ? {} : { runtimeFeedback }),
            }),
            (activeGoal, result) => {
                if (result.goal.trim() !== request.payload.goal
                    || (result.modelContextFrame?.stage !== undefined
                        && result.modelContextFrame.stage !== "think")
                    || result.output.trim().length === 0) {
                    throw createRunnerFeedbackError(
                        new RunnerExecutionError("INVALID_AGENT_DECISION", "Think output does not satisfy the requested goal contract"),
                        activeGoal,
                        input.executionUnitId ?? "unbound",
                        "think",
                        "output_contract",
                    );
                }
                return result;
            },
            control,
        );
        const output = executed.result.output.trim();
        const completedFact: TrajectoryEventDraft = {
            goalId: executed.goal.id,
            runId: executed.goal.state.run.id,
            phase: "executing",
            executionUnitId: input.executionUnitId ?? "unbound",
            stepIndex: request.payload.stepOrdinal,
            ...(executed.goal.state.run.pendingThink === undefined
                ? {}
                : { parentEventId: executed.goal.state.run.pendingThink.latestThinkEventId }),
            eventType: "think_completed",
            payload: {
                type: "think_completed",
                requestId: request.payload.requestId,
                stepOrdinal: request.payload.stepOrdinal,
                goal: request.payload.goal,
                output,
            },
        };
        const nextGoal = await this.commitThinkCompletion(
            executed.goal,
            completedFact as Extract<TrajectoryEventDraft, { readonly eventType: "think_completed" }>,
            request.payload.stepOrdinal,
            request.executionUnitId ?? "unbound",
            baseBoundary,
            control,
            executed.result.modelContextFrame === undefined
                ? undefined
                : {
                    ...executed.result.modelContextFrame,
                    executionUnitId: input.executionUnitId ?? "unbound",
                    stepIndex: request.payload.stepOrdinal,
                },
        );
        return {
            goal: nextGoal,
            exchange: {
                requestId: request.payload.requestId,
                goal: request.payload.goal,
                output,
            },
        };
    }

    private async commitThinkCompletion(
        goal: Goal,
        fact: Extract<TrajectoryEventDraft, { readonly eventType: "think_completed" }>,
        stepOrdinal: number,
        executionUnitId: string,
        inputBoundary: `sha256:${string}`,
        control: ExecutionControl | undefined,
        modelContextFrame?: ModelContextFrameForStage & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        },
    ): Promise<Goal> {
        try {
            const event = await this.checkpointCommitter.append(fact, control);
            if (event?.eventType !== "think_completed") {
                throw new TrajectoryAppendError("Think checkpoints require an enabled Trajectory sink");
            }
            const pendingThink: PendingThink = {
                goalId: goal.id,
                runId: goal.state.run.id,
                stepOrdinal,
                executionUnitId,
                inputBoundary,
                latestThinkEventId: event.eventId,
            };
            const { pendingModelRepair: _pendingModelRepair, ...runWithoutRepair } = goal.state.run;
            const checkpointGoal = this.withRun(goal, {
                ...runWithoutRepair,
                pendingThink,
            });
            const savedGoal = await this.commitStageCheckpoint(
                checkpointGoal,
                [],
                control,
                modelContextFrame,
            );
            const committed = { goal: savedGoal, events: [event] };
            this.publishCommittedEvents(committed);
            this.publishCheckpointCommitted(committed, [fact]);
            return savedGoal;
        } catch (error) {
            if (error instanceof StageCheckpointFailure) throw error;
            if (isExecutionAbortedError(error)) throw error;
            throw new StageCheckpointFailure(error);
        }
    }

    private async restoreThinkHistory(
        goal: Goal,
        stepOrdinal: number,
        executionUnitId: string,
        inputBoundary: `sha256:${string}`,
        control?: ExecutionControl,
    ): Promise<ThinkExchange[]> {
        const pendingThink = goal.state.run.pendingThink;
        if (this.trajectoryStore === undefined) {
            if (pendingThink !== undefined) {
                invalidAgentDecision("Cannot restore a Think chain without its Trajectory store");
            }
            return [];
        }

        let committed: readonly TrajectoryEvent[];
        try {
            throwIfAborted(control);
            const result = await this.recoveryReader.readTrajectory(
                { goalId: goal.id, runId: goal.state.run.id },
                goal.state.run.committedThroughSequence,
                control,
            );
            if (result.committed.some((event) =>
                event.goalId !== goal.id || event.runId !== goal.state.run.id,
            )) {
                invalidAgentDecision("Committed Think history contains a foreign Goal or Run event");
            }
            committed = result.committed.filter((event) =>
                event.sequence <= goal.state.run.committedThroughSequence,
            );
            throwIfAborted(control);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            if (error instanceof RunnerExecutionError) throw error;
            throw new StageCheckpointFailure(error);
        }

        const stepCompletions = committed.filter((event): event is Extract<
            TrajectoryEvent,
            { readonly eventType: "think_completed" }
        > =>
            event.eventType === "think_completed"
            && event.payload.stepOrdinal === stepOrdinal,
        );
        if (pendingThink === undefined) {
            // Without a Snapshot pointer, no output may seed a resumed stage chain.
            // This also excludes an append-only tail that a later commit may have crossed.
            return [];
        }

        const pendingThinkMismatch = [
            pendingThink.goalId !== goal.id ? "Goal" : undefined,
            pendingThink.runId !== goal.state.run.id ? "Run" : undefined,
            pendingThink.stepOrdinal !== stepOrdinal ? "Step" : undefined,
            pendingThink.executionUnitId !== executionUnitId ? "execution unit" : undefined,
            pendingThink.inputBoundary !== inputBoundary ? "input boundary" : undefined,
        ].filter((value): value is string => value !== undefined);
        if (pendingThinkMismatch.length > 0) {
            invalidAgentDecision(`Pending Think identity does not match the current execution: ${pendingThinkMismatch.join(", ")}`);
        }

        const completions = stepCompletions.filter((event) =>
            event.executionUnitId === executionUnitId && event.stepIndex === stepOrdinal,
        );
        const completionById = new Map(completions.map((event) => [event.eventId, event]));
        const requests = committed.filter((event): event is Extract<
            TrajectoryEvent,
            { readonly eventType: "think_requested" }
        > =>
            event.eventType === "think_requested"
            && event.executionUnitId === executionUnitId
            && event.stepIndex === stepOrdinal
            && event.payload.stepOrdinal === stepOrdinal,
        );
        const requestById = new Map<string, typeof requests>();
        for (const request of requests) {
            if (requestById.has(request.payload.requestId)) {
                invalidAgentDecision("Think request ID is duplicated inside the committed Step chain");
            }
            requestById.set(request.payload.requestId, [request]);
            if (request.parentEventId !== undefined && !completionById.has(request.parentEventId)) {
                invalidAgentDecision("Think request points outside its committed Step chain");
            }
        }

        const reverseChain: Extract<TrajectoryEvent, { readonly eventType: "think_completed" }>[] = [];
        const visited = new Set<string>();
        let currentEventId: string | undefined = pendingThink.latestThinkEventId;
        while (currentEventId !== undefined) {
            if (visited.has(currentEventId)) {
                invalidAgentDecision("Committed Think chain contains a parent cycle");
            }
            visited.add(currentEventId);
            const completion = completionById.get(currentEventId);
            if (completion === undefined) {
                invalidAgentDecision("Pending Think pointer references a missing or uncommitted output");
            }
            const matchingRequests = requestById.get(completion.payload.requestId);
            if (matchingRequests === undefined || matchingRequests.length !== 1) {
                invalidAgentDecision("Committed Think output has no unique matching request");
            }
            const request = matchingRequests[0]!;
            if (
                completion.goalId !== goal.id
                || completion.runId !== goal.state.run.id
                || completion.phase !== "executing"
                || completion.payload.stepOrdinal !== stepOrdinal
                || completion.stepIndex !== stepOrdinal
                || request.goalId !== completion.goalId
                || request.runId !== completion.runId
                || request.phase !== completion.phase
                || request.payload.goal !== completion.payload.goal
                || request.payload.stepOrdinal !== completion.payload.stepOrdinal
                || request.parentEventId !== completion.parentEventId
                || request.sequence >= completion.sequence
            ) {
                invalidAgentDecision("Think request and output identities do not match");
            }
            reverseChain.push(completion);
            if (completion.parentEventId !== undefined) {
                const parent = completionById.get(completion.parentEventId);
                if (parent === undefined || parent.sequence >= completion.sequence) {
                    invalidAgentDecision("Think output parent is missing or out of order");
                }
            }
            currentEventId = completion.parentEventId;
        }

        // Only the Snapshot pointer's parent chain is recoverable. Disconnected facts can
        // be append-only tails from an interrupted attempt and never seed this history.
        return reverseChain.reverse().map((completion) => ({
            requestId: completion.payload.requestId,
            goal: completion.payload.goal,
            output: completion.payload.output,
        }));
    }

    /**
     * 明确作废一个仍然有效的完成候选预览。
     *
     * @remarks
     * 作废只影响观察：它不改写候选正文、不改变完成审查、重试预算或 Run 状态，
     * 也不等同于 Run 失败。
     *
     * @param goal - 当前 Goal。
     * @param candidateId - 被作废的候选身份。
     * @param reason - 作废原因。
     */
    private publishCandidateInvalidated(
        goal: Goal,
        candidateId: string,
        reason: "rejected" | "cancelled" | "failed" | "replaced" | "ambiguous",
    ): void {
        this.publishExecutionEvent(goal, {
            kind: "candidate_invalidated",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: { candidateId, reason },
        });
    }

    private publishCommittedEvents(result: TrajectoryCheckpointCommitResult): void {        for (const event of result.events) {
            const executionUnitId = event.executionUnitId;
            const actionId = event.actionId;
            this.publishExecutionEvent(result.goal, {
                ...(executionUnitId === undefined ? {} : { executionUnitId }),
                ...(actionId === undefined ? {} : { actionId }),
                kind: event.eventType,
                visibility: "public",
                durability: "checkpoint",
                delivery: isStreamDeltaKind(event.eventType) ? "delta" : "control",
                ...(isStreamDeltaKind(event.eventType)
                    ? { coalescingKey: streamCoalescingKey(executionUnitId, actionId, event.eventType) }
                    : {}),
                payload: event.payload as unknown as StreamJsonValue,
            });
        }
    }

    private publishCheckpointCommitted(
        result: TrajectoryCheckpointCommitResult,
        facts: readonly TrajectoryEventDraft[],
    ): void {
        const firstFact = facts.find((fact) => fact.executionUnitId !== undefined);
        if (firstFact === undefined) return;
        this.publishExecutionEvent(result.goal, {
            ...(firstFact.executionUnitId === undefined ? {} : { executionUnitId: firstFact.executionUnitId }),
            ...(firstFact.actionId === undefined ? {} : { actionId: firstFact.actionId }),
            kind: "step_committed",
            visibility: "public",
            durability: "checkpoint",
            delivery: "control",
            payload: {
                committedThroughSequence: result.goal.state.run.committedThroughSequence,
                eventIds: result.events.map((event) => event.eventId),
                eventTypes: result.events.map((event) => event.eventType),
            },
        });
    }

    private runNotFound(ref: RunRef): RunnerResult {
        return {
            ok: false,
            error: {
                code: "RUN_NOT_FOUND",
                message: `Run "${ref.runId}" for Goal "${ref.goalId}" was not found`,
            },
        };
    }

    private actionNotAuthorized(
        ref: RunRef,
        actionId: string | undefined,
    ): RunnerResult {
        return {
            ok: false,
            error: {
                code: "ACTION_NOT_AUTHORIZED",
                message: actionId === undefined
                    ? `Run "${ref.runId}" requires a matching transient Action authorization`
                    : `Action "${actionId}" is not the approved pending Action for Run "${ref.runId}"`,
            },
        };
    }

    private invalidContextLookup(message: string): RunnerResult {
        return {
            ok: false,
            error: {
                code: "INVALID_CONTEXT_LOOKUP",
                message,
            },
        };
    }

    private async recoverPendingAction(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        throwIfAborted(control);
        const pendingAction = goal.state.run.pendingAction;

        if (pendingAction === undefined || pendingAction.status !== "approved") {
            return { ok: true, state: goal.state.run };
        }

        let validated;

        try {
            validated = prepareToolAction(
                goal,
                resolveActionExecutionAction(pendingAction),
                this.toolRegistry,
                this.toolPolicy,
                false,
                control,
                undefined,
                this.traceSink,
            );
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            throwIfAborted(control);

            const stableError = toStableExecutionError(error)
                ?? new RunnerExecutionError(
                    "TOOL_EXECUTION_ERROR",
                    error instanceof Error ? error.message : String(error),
                );

            return this.stopWithExecutionError(goal, stableError, control);
        }

        if (goal.state.run.pendingProgram !== undefined && pendingAction.attemptsStarted === undefined) {
            return this.runLoop(goal, pendingAction.action.actionId, control);
        }

        if (validated.registration.replayPolicy === "safe"
            && (goal.state.run.pendingProgram === undefined || validated.registration.definition.isReadOnly)) {
            return this.runLoop(
                goal,
                pendingAction.action.actionId,
                control,
                undefined,
                validated,
            );
        }

        throwIfAborted(control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            actionId: pendingAction.action.actionId,
            eventType: "action_recovered",
            payload: {
                type: "action_recovered",
                actionId: pendingAction.action.actionId,
                replayPolicy: validated.registration.replayPolicy,
            },
        }, control);
        const recoveredRun = this.applyTransition(goal.state.run, {
            kind: "recover_action",
            actionId: pendingAction.action.actionId,
        });
        const recoveredGoal = this.withRun(goal, recoveredRun);

        const checkpoint = await this.saveCheckpoint(recoveredGoal, control);
        return { ok: true, state: checkpoint.state.run };
    }

    private hasMatchingTransientAuthorization(
        goal: Goal,
        options: RunExecutionOptions,
    ): boolean {
        const pendingAction = goal.state.run.pendingAction;

        if (pendingAction === undefined) {
            return options.authorizedActionId === undefined;
        }

        if (pendingAction.status !== "approved") {
            return options.authorizedActionId === undefined;
        }

        return options.authorizedActionId === pendingAction.action.actionId;
    }

    private getAuthorizedToolDefinitions(
        goal: Goal,
        control?: ExecutionControl,
    ): readonly AnyBoundToolDefinition[] {
        try {
            throwIfAborted(control);
            const definitions = resolveAuthorizedToolDefinitions(
                goal,
                this.toolRegistry,
            );
            throwIfAborted(control);
            return isPlanRunAwaitingTaskApproval(goal)
                ? definitions.filter((definition) => definition.isReadOnly === true)
                : definitions;
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }
            throwIfAborted(control);
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private async stopWithExecutionError(
        goal: Goal,
        error: RunnerExecutionError,
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        throwIfAborted(control);
        const lifecyclePatch = await this.createTerminalLifecyclePatch(
            goal,
            1,
            control,
        );
        const executionErrorFact: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: goal.state.workflow.phase,
            ...(goal.state.run.pendingAction === undefined
                ? {}
                : { actionId: goal.state.run.pendingAction.action.actionId }),
            eventType: "execution_error",
            payload: {
                type: "execution_error",
                code: error.code,
                message: error.message,
                ...(goal.state.run.pendingAction === undefined
                    ? {}
                    : { actionId: goal.state.run.pendingAction.action.actionId }),
            },
        };
        const failedRun = this.applyTransition(goal.state.run, {
            kind: "execution_error",
            code: error.code,
            message: error.message,
        });
        const failedGoal = this.withRun(goal, failedRun);
        const closedEpochFact = this.contextEpochClosedFact(failedGoal, "run_failed");

        const checkpoint = await this.commitDecision(
            failedGoal,
            [
                executionErrorFact,
                ...(closedEpochFact === undefined ? [] : [closedEpochFact]),
            ],
            lifecyclePatch,
            control,
        );
        return { ok: true, state: checkpoint.state.run };
    }

    private contextEpochClosedFact(
        goal: Goal,
        reason: "run_completed" | "run_failed" | "run_cancelled",
    ): TrajectoryEventDraft | undefined {
        const epoch = goal.state.run.contextEpoch;
        return {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: goal.state.workflow.phase,
            eventType: "context_epoch_closed",
            payload: {
                type: "context_epoch_closed",
                epoch: toEpochRange(
                    epoch,
                    goal.state.messages.length,
                    goal.state.run.committedThroughSequence,
                ),
                reason,
            },
        };
    }

    private async executeToolAndObserve(
        goal: Goal,
        prepared: PreparedToolAction,
        executionUnitId: string,
        control?: ExecutionControl,
        plan?: SandboxExecutionPlan,
        program?: { readonly programId: string; readonly callIndex: number },
    ): Promise<
        | {
            readonly kind: "observed";
            readonly goal: Goal;
            readonly observation: ToolObservation;
            readonly sourceSequence?: number;
            readonly revision?: ProgramCallRevision | undefined;
        }
        | { readonly kind: "stopped"; readonly result: RunnerResult }
    > {
        const association = program === undefined ? {} : {
            programId: program.programId,
            callIndex: program.callIndex,
        };
        // 修订说明在执行前从已获批版本派生：实际执行的参数与原请求同时可见。
        const revision = resolveProgramCallRevision(goal.state.run.pendingAction);
        let observation: ToolObservation | undefined;
        const replaySafe = prepared.registration.replayPolicy === "safe"
            && (program === undefined || prepared.registration.definition.isReadOnly);
        const effectivePlan = plan ?? prepared.plan;
        while (observation === undefined) {
            throwIfAborted(control);
            const pending = goal.state.run.pendingAction;
            if (pending === undefined || pending.status !== "approved"
                || pending.action.actionId !== prepared.action.actionId) {
                throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Tool attempt lost its approved pending Action");
            }
            const attempt = (pending.attemptsStarted ?? 0) + 1;
            if (attempt > 3) {
                return {
                    kind: "stopped",
                    result: await this.stopWithExecutionError(
                        goal,
                        new RunnerExecutionError("TOOL_EXECUTION_ERROR", "Safe Tool retry limit exhausted after three calls"),
                        control,
                    ),
                };
            }
            const attemptFact: TrajectoryEventDraft = {
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                executionUnitId,
                actionId: prepared.action.actionId,
                ...association,
                eventType: "tool_attempt_started",
                payload: { type: "tool_attempt_started", actionId: prepared.action.actionId, attempt },
            };
            const attemptGoal = this.withRun(goal, {
                ...goal.state.run,
                pendingAction: { ...pending, attemptsStarted: attempt },
            });
            const attemptCommit = await this.commitToolProgressPreservingSteers(attemptGoal, [attemptFact], control);
            goal = attemptCommit.goal;

            try {
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    executionUnitId,
                    actionId: prepared.action.actionId,
                    ...association,
                    eventType: "tool_started",
                    payload: {
                        type: "tool_started",
                        actionId: prepared.action.actionId,
                        toolId: prepared.action.toolId,
                        input: prepared.action.input,
                        ...(revision === undefined ? {} : {
                            revision: {
                                reviewRef: revision.reviewRef,
                                originalInput: revision.originalInput,
                            },
                        }),
                    },
                }, control);
                const rawObservation = prepared.stream === undefined
                    ? await prepared.execute(control, effectivePlan)
                    : await this.consumeToolStream(goal, prepared, executionUnitId, control, effectivePlan);
                throwIfAborted(control);
                observation = validateToolObservation(rawObservation);
            } catch (error) {
                if (isExecutionAbortedError(error)) throw error;
                if (error instanceof TrajectoryAppendError) throw error;
                throwIfAborted(control);
                if (error instanceof TransientToolExecutionFailure && replaySafe) {
                    const failedFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        actionId: prepared.action.actionId,
                        eventType: "tool_attempt_failed",
                        payload: {
                            type: "tool_attempt_failed",
                            actionId: prepared.action.actionId,
                            attempt,
                            reason: error.reason.slice(0, 120),
                            ...(error.retryAfterMs === undefined
                                ? {}
                                : { retryAfterMs: Math.min(30_000, Math.max(0, error.retryAfterMs)) }),
                        },
                    };
                    const failedCommit = await this.commitToolProgressPreservingSteers(goal, [failedFact], control);
                    goal = failedCommit.goal;
                    if (attempt === 3) {
                        return {
                            kind: "stopped",
                            result: await this.stopWithExecutionError(
                                goal,
                                new RunnerExecutionError("TOOL_EXECUTION_ERROR", "Safe Tool retry limit exhausted after three calls"),
                                control,
                            ),
                        };
                    }
                    const delay = Math.min(30_000, Math.max(250 * 2 ** (attempt - 1), error.retryAfterMs ?? 0));
                    await waitForRetry(delay, control);
                    continue;
                }

                const message = error instanceof TransientToolExecutionFailure
                    ? error.reason
                    : error instanceof Error ? error.message : String(error);
                const toolError = error instanceof RunnerExecutionError
                    ? error
                    : new RunnerExecutionError("TOOL_EXECUTION_ERROR", message);
                if (!replaySafe) {
                    const failedFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        actionId: prepared.action.actionId,
                        eventType: "tool_attempt_failed",
                        payload: {
                            type: "tool_attempt_failed",
                            actionId: prepared.action.actionId,
                            attempt,
                            reason: "outcome_unknown",
                        },
                    };
                    const waitingRun = this.applyTransition(goal.state.run, {
                        kind: "tool_outcome_unknown",
                        actionId: prepared.action.actionId,
                    });
                    const waitingGoal = this.withRun(goal, waitingRun);
                    const waitingCommit = await this.commitDecision(waitingGoal, [failedFact], undefined, control);
                    return { kind: "stopped", result: { ok: true, state: waitingCommit.state.run } };
                }
                return {
                    kind: "stopped",
                    result: await this.stopWithExecutionError(goal, toolError, control),
                };
            }
        }

        let programResultBytes = 0;
        if (program !== undefined) {
            const current = goal.state.run.pendingProgram;
            if (current === undefined) throw new Error("PTC_REPLAY_MISMATCH");
            const bytes = Buffer.byteLength(JSON.stringify(
                createProgramCallEnvelope(observation, 0, revision),
            ));
            if (bytes > 16 * 1024 * 1024) throw new ProgramResourceError("PTC_FRAME_LIMIT");
            if (current.resultBytes + bytes > 256 * 1024 * 1024) {
                throw new ProgramResourceError("PTC_LOG_LIMIT");
            }
            programResultBytes = bytes;
        }

        throwIfAborted(control);
        const observationFact: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: prepared.action.actionId,
            ...association,
            eventType: "observation_recorded",
            payload: { type: "observation_recorded", actionId: prepared.action.actionId, observation },
        };
        const committed = await this.checkpointCommitter.commit(goal, {
            facts: [observationFact],
            prepare: async (latest) => {
                if (latest === undefined || latest.state.run.id !== goal.state.run.id) {
                    throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "Run disappeared before Observation commit");
                }
                await this.appendTrajectory({
                    goalId: latest.id,
                    runId: latest.state.run.id,
                    phase: "executing",
                    executionUnitId,
                    actionId: prepared.action.actionId,
                    ...association,
                    eventType: "tool_finished",
                    payload: { type: "tool_finished", actionId: prepared.action.actionId, toolId: prepared.action.toolId, observation },
                }, control);
                const observedRun = program === undefined
                    ? this.applyTransition(latest.state.run, {
                        kind: "observe_action",
                        actionId: prepared.action.actionId,
                        observation,
                    })
                    : (() => {
                        const { pendingAction: _pendingAction, ...run } = latest.state.run;
                        const current = run.pendingProgram;
                        if (current?.programId !== program.programId
                            || current.nextCallIndex !== program.callIndex) {
                            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
                        }
                        return {
                            ...run,
                            pendingProgram: {
                                ...current,
                                nextCallIndex: current.nextCallIndex + 1,
                                resultBytes: current.resultBytes + programResultBytes,
                            },
                        };
                    })();
                return this.withRun(latest, observedRun);
            },
            ...(control === undefined ? {} : { control }),
        });
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [observationFact]);
        const checkpoint = committed.goal;
        const sourceSequence = committed.events.find((event) =>
            event.eventType === "observation_recorded"
            && event.actionId === prepared.action.actionId)?.sequence;
        return {
            kind: "observed",
            ...(revision === undefined ? {} : { revision }),
            goal: checkpoint,
            observation,
            ...(sourceSequence === undefined ? {} : { sourceSequence }),
        };
    }

    private async consumeToolStream(
        goal: Goal,
        prepared: PreparedToolAction,
        executionUnitId: string,
        control?: ExecutionControl,
        plan?: SandboxExecutionPlan,
    ): Promise<ToolObservation> {
        const stream = prepared.stream;
        if (stream === undefined) {
            return prepared.execute(control, plan);
        }

        let observation: ToolObservation | undefined;
        for await (const event of stream(control, plan)) {
            throwIfAborted(control);
            if (event.kind === "output") {
                if (event.text.length === 0) continue;
                this.publishExecutionEvent(goal, {
                    executionUnitId,
                    actionId: prepared.action.actionId,
                    kind: "tool_output_delta",
                    visibility: "diagnostic",
                    durability: "live",
                    delivery: "delta",
                    coalescingKey: `tool:${prepared.action.actionId}:${event.channel}`,
                    payload: {
                        channel: event.channel,
                        text: event.text,
                    },
                });
                continue;
            }

            if (observation !== undefined) {
                throw new RunnerExecutionError(
                    "TOOL_EXECUTION_ERROR",
                    "Tool stream returned more than one completed Observation",
                );
            }
            observation = validateToolObservation(event.observation);
        }

        if (observation === undefined) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool stream completed without an Observation",
            );
        }
        return observation;
    }

    private async runLoop(
        initialGoal: Goal,
        authorizedActionId?: string,
        control?: ExecutionControl,
        initialContextLookupResult?: ContextLookupResult,
        initialPreparedAction?: PreparedToolAction,
        initialSandboxPlan?: SandboxExecutionPlan,
    ): Promise<RunnerResult> {
        let goal = initialGoal;
        let transientAuthorization = authorizedActionId;
        let transientSandboxPlan = initialSandboxPlan;
        let contextLookupResult = initialContextLookupResult;
        let toolDiscoveryResult: ToolDiscoveryResult | undefined;
        let preparedAction = initialPreparedAction;
        let contextLookupChainCount = await this.restoreContextLookupChainCount(goal, control);

        while (goal.state.run.status === "running") {
            throwIfAborted(control);
            if (goal.state.run.pendingProgram !== undefined) {
                const pendingProgram = goal.state.run.pendingProgram;
                try {
                    goal = await this.continueProgram(goal, control);
                } catch (error) {
                    if (!(error instanceof Error) || error.message !== "PTC_REPLAY_MISMATCH") {
                        throw error;
                    }
                    const latest = await this.restore(
                        { goalId: goal.id, runId: goal.state.run.id },
                        control,
                    );
                    if (latest === undefined) throw error;
                    if (latest.state.run.status !== "running") {
                        return { ok: true, state: latest.state.run };
                    }
                    if (latest.state.run.pendingProgram?.programId !== pendingProgram.programId) {
                        goal = latest;
                        continue;
                    }
                    return this.stopWithExecutionError(
                        latest,
                        error instanceof RunnerExecutionError
                            ? error
                            : new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH"),
                        control,
                    );
                }
                if (control?.signal?.aborted && control.signal.reason === "user_cancel_program"
                    && goal.state.run.pendingProgram === undefined) {
                    return { ok: true, state: goal.state.run };
                }
                continue;
            }
            const pendingAction = goal.state.run.pendingAction;

            if (pendingAction?.status === "approved") {
                if (transientAuthorization !== pendingAction.action.actionId) {
                    return this.actionNotAuthorized(
                        { goalId: goal.id, runId: goal.state.run.id },
                        transientAuthorization,
                    );
                }

                const executionAction = resolveActionExecutionAction(pendingAction);

                let effectivePlan: SandboxExecutionPlan | undefined = undefined;
                if (
                    transientSandboxPlan !== undefined
                    && (transientSandboxPlan.actionId === undefined || transientSandboxPlan.actionId === pendingAction.action.actionId)
                    && (this.workspaceRoot === undefined || transientSandboxPlan.workspaceRoot === this.workspaceRoot)
                ) {
                    effectivePlan = transientSandboxPlan;
                } else if (this.sandboxPlanResolver !== undefined && this.workspaceRoot !== undefined) {
                    effectivePlan = await this.sandboxPlanResolver({
                        workspaceRoot: this.workspaceRoot,
                        action: executionAction,
                        effectiveScope: pendingAction.effectiveSandboxScope,
                    });
                }

                let validated: PreparedToolAction;

                try {
                    validated = preparedAction === undefined
                        ? prepareToolAction(
                            goal,
                            executionAction,
                            this.toolRegistry,
                            this.toolPolicy,
                            false,
                            control,
                            effectivePlan,
                            this.traceSink,
                        )
                        : preparedAction;
                    preparedAction = undefined;
                } catch (error) {
                    if (isExecutionAbortedError(error)) {
                        throw error;
                    }

                    throwIfAborted(control);

                    const stableError = toStableExecutionError(error)
                        ?? new RunnerExecutionError(
                            "TOOL_EXECUTION_ERROR",
                            error instanceof Error ? error.message : String(error),
                        );

                    return this.stopWithExecutionError(goal, stableError, control);
                }

                if (validated.registration.kind === "program") {
                    const executionUnitId = await this.findProgramExecutionUnit(goal, validated.action.actionId, control);
                    // 审批等待检查点已经消费该批次项；此处只接手已暂存的程序。
                    goal = await this.beginProgram(goal, validated.action, executionUnitId, undefined, control);
                    transientAuthorization = undefined;
                    continue;
                }

                const outcome = await this.executeToolAndObserve(
                    goal,
                    validated,
                    pendingAction.executionUnitId ?? createExecutionUnitId(),
                    control,
                    effectivePlan,
                );
                transientAuthorization = undefined;
                transientSandboxPlan = undefined;

                if (outcome.kind === "stopped") {
                    return outcome.result;
                }

                goal = outcome.goal;
                contextLookupResult = undefined;
                contextLookupChainCount = 0;
                continue;
            }

            goal = await this.applyPendingSteers(goal, control);
            if (goal.state.run.status !== "running") break;

            const maxSteps = goal.definition.executionPolicy.maxSteps;

            if (maxSteps > 0 && goal.state.run.stepCount >= maxSteps) {
                throwIfAborted(control);
                const lifecyclePatch = await this.createTerminalLifecyclePatch(
                    goal,
                    1,
                    control,
                );
                const failedGoal = this.withRun(goal, {
                    ...goal.state.run,
                    status: "failed",
                    stopReason: { kind: "max_steps_exceeded" },
                });
                const closedEpochFact = this.contextEpochClosedFact(failedGoal, "run_failed");
                const checkpoint = await this.commitDecision(
                    failedGoal,
                    [
                        {
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            phase: "executing",
                            eventType: "run_failed",
                            payload: {
                                type: "run_failed",
                                code: "MAX_STEPS_EXCEEDED",
                                message: "The configured maximum step count was exceeded",
                            },
                        },
                        ...(closedEpochFact === undefined ? [] : [closedEpochFact]),
                    ],
                    lifecyclePatch,
                    control,
                );
                return { ok: true, state: checkpoint.state.run };
            }

            goal = await this.populateHistoricalContext(goal, control);
            goal = await this.maybeCompactContext(goal, control);

            const executionUnitId = goal.state.run.pendingThink?.executionUnitId
                ?? goal.state.run.pendingModelRepair?.executionUnitId
                ?? createExecutionUnitId();
            const session = await this.openWorkingMemorySession(goal, control);

            this.publishExecutionEvent(goal, {
                executionUnitId,
                kind: "step_started",
                visibility: "public",
                durability: "live",
                delivery: "control",
                payload: {
                    stepCount: goal.state.run.stepCount + 1,
                },
            });

            /** 本次执行单元仍然有效的完成候选身份；决策被弃用时必须作废它。 */
            let pendingCandidateId: string | undefined;
            let expectedStageKey: string | undefined;

            try {
                let normalized: NormalizedExecution;
                /** 追加过程正文之前的 Goal；完成候选被审查拒绝时不提交这些正文。 */
                let goalBeforeProcessText: Goal | undefined;
                let stepInput!: StepExecutionInput;
                let pendingThinkRequestCommitted = false;
                /** 本次 Decide 新建的批次剩余项；来自队列时为 undefined。 */
                let decidedBatch: PendingActionBatch | undefined;
                /** 队首是否取自既有队列。 */
                let consumedFromBatch = false;
                try {
                    throwIfAborted(control);
                    const tools = this.getAuthorizedToolDefinitions(goal, control);
                    const stageFeedback = goal.state.run.currentStage?.latestReviewRejection !== undefined
                        ? createRuntimeFeedback({
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            executionUnitId,
                            stepOrdinal: goal.state.run.stepCount + 1,
                            stage: "decide",
                            origin: "completion_review",
                            code: "INCOMPLETE_COMPLETION",
                            attempt: 1,
                            issues: [{
                                code: "incomplete_completion",
                                path: ["summary"],
                                message: goal.state.run.currentStage.latestReviewRejection.feedback,
                            }],
                            constraints: [
                                "Continue the original task. Obtain missing evidence or provide the requested deliverable before submitting another completion candidate.",
                            ],
                        })
                        : undefined;
                    stepInput = {
                        goal,
                        authorizedTools: tools,
                        exposedToolIds: goal.state.run.exposedToolIds,
                        ...(stageFeedback === undefined ? {} : { runtimeFeedback: stageFeedback }),
                        ...(session === undefined
                            ? {}
                            : { workingMemory: session.workingMemory }),
                        ...(control === undefined ? {} : { control }),
                        ...(contextLookupResult === undefined
                            ? {}
                            : { contextLookupResult }),
                        ...(toolDiscoveryResult === undefined
                            ? {}
                            : { toolDiscoveryResult }),
                        executionUnitId,
                        ...(this.executionStream === undefined
                            ? {}
                            : { executionStream: this.executionStream }),
                    };
                    const stepOrdinal = goal.state.run.stepCount + 1;
                    const thinkInputBoundary = createThinkInputBoundary(stepInput, stepOrdinal);
                    const thinkHistory = await this.restoreThinkHistory(
                            goal,
                            stepOrdinal,
                            executionUnitId,
                            thinkInputBoundary,
                            control,
                        );
                        const pendingRepair = goal.state.run.pendingModelRepair;
                        if (pendingRepair?.stage === "think") {
                            const request = await this.restoreThinkRequest(
                                goal,
                                pendingRepair,
                                thinkInputBoundary,
                                control,
                            );
                            const recoveredThink = await this.executeThinkRepair(
                                goal,
                                stepInput,
                                request,
                                thinkInputBoundary,
                                thinkHistory,
                                control,
                            );
                            goal = recoveredThink.goal;
                            thinkHistory.push(recoveredThink.exchange);
                            pendingThinkRequestCommitted = false;
                        }

                        while (true) {
                            throwIfAborted(control);
                            const decideBoundary = this.createRepairInputBoundary(
                                thinkInputBoundary,
                                "decide",
                                goal.state.run.pendingThink?.latestThinkEventId,
                            );
                            const decided = await this.executeRepairableModelStage(
                                goal,
                                stepInput,
                                "decide",
                                decideBoundary,
                                undefined,
                                (activeGoal, runtimeFeedback) => {
                                    const queued = activeGoal.state.run.pendingAction === undefined
                                        ? activeGoal.state.run.pendingActionBatch?.remaining[0]
                                        : undefined;
                                    if (queued !== undefined) {
                                        // 批次顺序执行：队列中尚未暂存的决策直接作为本次 Decide 结果，不重新请求模型。
                                        const fromQueue: DecideStageResult = { kind: "decision", decision: { kind: "tool_call", action: queued } };
                                        return Promise.resolve({ result: fromQueue, fromBatch: true });
                                    }
                                    return this.executor.decide({
                                        ...stepInput,
                                        goal: activeGoal,
                                        thinkHistory,
                                        ...(runtimeFeedback === undefined ? {} : { runtimeFeedback }),
                                    }).then(result => ({ result }));
                                },
                                async (activeGoal, operationResult: { readonly result: DecideStageResult; readonly fromBatch?: boolean }) => {
                                    const result = operationResult.result;
                                    if (result.kind === "decision" && (result.decision.kind === "run_stage_update" || result.decision.kind === "run_stage_complete")) {
                                        expectedStageKey = stageRequestKey(activeGoal);
                                        const latest = await this.restore({ goalId: activeGoal.id, runId: activeGoal.state.run.id }, control);
                                        if (latest !== undefined && stageRequestKey(latest) !== expectedStageKey) {
                                            throw new StaleStageRequestError(latest);
                                        }
                                    }
                                    const fromBatch = operationResult.fromBatch === true;
                                    if (result.modelContextFrame !== undefined
                                        && result.modelContextFrame.stage !== "decide") {
                                        throw createRunnerFeedbackError(
                                            new RunnerExecutionError("INVALID_AGENT_DECISION", "Decide frame stage is invalid"),
                                            activeGoal,
                                            executionUnitId,
                                            "decide",
                                            "output_contract",
                                        );
                                    }
                                    if (result.kind === "request_think") {
                                        const thinkGoal = result.goal.trim();
                                        if (thinkGoal.length === 0) {
                                            throw createRunnerFeedbackError(
                                                new RunnerExecutionError("INVALID_AGENT_DECISION", "Think goal must not be blank"),
                                                activeGoal,
                                                executionUnitId,
                                                "decide",
                                                "decision_semantics",
                                            );
                                        }
                                        return { stageResult: { ...result, goal: thinkGoal } };
                                    }
                                    if (result.kind === "assistant_message") {
                                        throw new ModelStageFeedbackError(createRuntimeFeedback({
                                            goalId: activeGoal.id,
                                            runId: activeGoal.state.run.id,
                                            executionUnitId,
                                            stepOrdinal: activeGoal.state.run.stepCount + 1,
                                            stage: "decide",
                                            origin: "output_contract",
                                            code: "NO_USABLE_RESULT",
                                            attempt: 1,
                                            issues: [{
                                                code: "no_usable_result",
                                                path: ["toolCalls"],
                                                message: "Return one declared tool call, or a non-empty text answer.",
                                            }],
                                            constraints: ["A text-only answer is accepted as an assistant message but does not advance the task. Continue the original task with one declared tool call."],
                                        }), "A text-only answer does not advance the task.", undefined, result.text, result.modelContextFrame?.modelCallId);
                                    }
                                    const queue = result.kind === "batch" ? result.decisions.slice(1) : [];
                                    if (result.kind === "batch" && result.decisions.some(decision => decision.kind !== "tool_call")) {
                                        throw new ModelStageFeedbackError(createRuntimeFeedback({
                                            goalId: activeGoal.id, runId: activeGoal.state.run.id, executionUnitId,
                                            stepOrdinal, stage: "decide", origin: "output_contract", code: "INVALID_AGENT_DECISION", attempt: 1,
                                            issues: [{ code: "multiple_tool_calls", path: ["toolCalls"], message: "This batch was not applied. Call exactly one declared system tool, such as one system_find_tools query, then wait for its result." }],
                                            constraints: ["System control calls cannot be batched. Continue the original task with one declared tool call."],
                                        }), "System calls cannot be batched");
                                    }
                                    const businessQueue = queue.flatMap(decision => decision.kind === "tool_call" ? [decision.action] : []);
                                    const normalizedDecision = this.validateDecisionForStage(
                                        activeGoal,
                                        result.kind === "batch" ? result.decisions[0]! : result.decision,
                                        executionUnitId,
                                        control,
                                        session,
                                    );
                                    if (normalizedDecision.decision.kind === "tool_call" && session !== undefined) {
                                        // 已提交结果的 Action 不得重放：同一 actionId 只能暂存一次。
                                        const actionId = normalizedDecision.decision.action.actionId;
                                        const alreadyStaged = [...session.evidenceIndex.events.values()].some(event =>
                                            event.eventType === "action_staged" && event.actionId === actionId);
                                        if (alreadyStaged) {
                                            throw createRunnerFeedbackError(
                                                new RunnerExecutionError(
                                                    "INVALID_AGENT_DECISION",
                                                    `Action ${actionId} already produced a committed result and must not be replayed`,
                                                ),
                                                activeGoal,
                                                executionUnitId,
                                                "decide",
                                                "output_contract",
                                                ["Continue with a new Action that has not been committed yet."],
                                            );
                                        }
                                    }
                                    this.validateEvidenceForStage(
                                        activeGoal,
                                        normalizedDecision.decision,
                                        session,
                                        executionUnitId,
                                    );
                                    this.validateDecisionPatchForStage(
                                        activeGoal, normalizedDecision.decision, session, executionUnitId,
                                    );
                                    if (normalizedDecision.decision.kind === "complete" && activeGoal.state.run.currentStage === undefined) {
                                        const candidate = normalizedDecision.decision;
                                        const sequences = new Set("evidenceSequences" in candidate
                                            ? candidate.evidenceSequences
                                            : candidate.completionEvidence.flatMap(item => item.evidenceSequences));
                                        const events = session === undefined ? [] : [...session.evidenceIndex.events.values()];
                                        const actions = new Set(events.filter(event => sequences.has(event.sequence))
                                            .map(event => event.actionId).filter(id => id !== undefined));
                                        const evidence = events.filter(event => sequences.has(event.sequence)
                                            || (event.actionId !== undefined && actions.has(event.actionId)
                                                && ["action_staged", "tool_started", "tool_finished", "observation_recorded"].includes(event.eventType)));
                                        const reviewed = await this.executor.reviewCompletion({
                                            ...stepInput, goal: activeGoal, candidate, evidence,
                                        });
                                        if (reviewed.kind === "reject") {
                                            // 审查拒绝的候选必须明确作废：它不是正式答复，也不改变重试预算。
                                            this.publishCandidateInvalidated(
                                                activeGoal,
                                                result.modelContextFrame?.modelCallId ?? executionUnitId,
                                                "rejected",
                                            );
                                            throw new ModelStageFeedbackError(createRuntimeFeedback({
                                                goalId: activeGoal.id, runId: activeGoal.state.run.id,
                                                executionUnitId, stepOrdinal, stage: "decide",
                                                origin: "completion_review", code: "INCOMPLETE_COMPLETION", attempt: 1,
                                                issues: [{ code: "incomplete_completion", path: ["summary"], message: reviewed.feedback }],
                                                constraints: ["Continue the original task. Obtain missing evidence or provide the requested deliverable before submitting another completion candidate."],
                                            }), "Completion candidate rejected");
                                        }
                                    }
                                    return {
                                        stageResult: {
                                            ...result,
                                            kind: "decision" as const,
                                            decision: normalizedDecision.decision,
                                        },
                                        ...(normalizedDecision.preparedToolAction === undefined
                                            ? {}
                                            : { preparedToolAction: normalizedDecision.preparedToolAction }),
                                        ...(normalizedDecision.acceptedContextNotes === undefined
                                            ? {}
                                            : { acceptedContextNotes: normalizedDecision.acceptedContextNotes }),
                                        ...(queue.length === 0 || normalizedDecision.decision.kind !== "tool_call"
                                            ? {}
                                            : { pendingBatch: { batchId: randomUUID(), remaining: businessQueue } }),
                                        ...(fromBatch ? { batchConsumed: true } : {}),
                                    };
                                },
                                control,
                            );
                            goal = decided.goal;
                            const stageResult = decided.result.stageResult;
                            decidedBatch = "pendingBatch" in decided.result ? decided.result.pendingBatch : undefined;
                            consumedFromBatch = "batchConsumed" in decided.result && decided.result.batchConsumed === true;
                            if (decidedBatch !== undefined && "decision" in stageResult) {
                                // 记录一次模型响应产生的多调用批次，供 Trajectory/界面与单调用、零调用、无可用结果区分。
                                await this.appendTrajectory({
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    eventType: "decide_batch_accepted",
                                    payload: {
                                        type: "decide_batch_accepted",
                                        batchId: decidedBatch.batchId,
                                        callIds: [stageResult.decision.kind === "tool_call"
                                            ? stageResult.decision.action.actionId : "",
                                            ...decidedBatch.remaining.map(action => action.actionId)].filter(id => id.length > 0),
                                        remainingCount: decidedBatch.remaining.length,
                                    },
                                }, control);
                            }

                            if (stageResult.kind === "request_think") {
                                const requestId = randomUUID();
                                const requestedFact: TrajectoryEventDraft = {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    stepIndex: stepOrdinal,
                                    ...(goal.state.run.pendingThink === undefined
                                        ? {}
                                        : { parentEventId: goal.state.run.pendingThink.latestThinkEventId }),
                                    eventType: "think_requested",
                                    payload: {
                                        type: "think_requested",
                                        requestId,
                                        stepOrdinal,
                                        goal: stageResult.goal,
                                    },
                                };
                                const requested = await this.commitThinkRequestForRepair(
                                    goal,
                                    requestedFact as Extract<TrajectoryEventDraft, { readonly eventType: "think_requested" }>,
                                    stepInput,
                                    thinkInputBoundary,
                                    stageResult.modelContextFrame === undefined
                                        ? undefined
                                        : {
                                            ...stageResult.modelContextFrame,
                                            executionUnitId,
                                            stepIndex: stepOrdinal,
                                        },
                                    control,
                                );
                                goal = requested.goal;
                                pendingThinkRequestCommitted = true;
                                const request = await this.restoreThinkRequest(
                                    goal,
                                    goal.state.run.pendingModelRepair!,
                                    thinkInputBoundary,
                                    control,
                                );
                                const completedThink = await this.executeThinkRepair(
                                    goal,
                                    stepInput,
                                    request,
                                    thinkInputBoundary,
                                    thinkHistory,
                                    control,
                                );
                                goal = completedThink.goal;
                                pendingThinkRequestCommitted = false;
                                thinkHistory.push(completedThink.exchange);
                                continue;
                            }

                            if (stageResult.modelContextFrame !== undefined) {
                                goal = await this.commitStageCheckpoint(
                                    goal,
                                    [],
                                    control,
                                    {
                                        ...stageResult.modelContextFrame,
                                        executionUnitId,
                                        stepIndex: stepOrdinal,
                                    },
                                    expectedStageKey,
                                );
                            }
                            normalized = {
                                decision: stageResult.decision,
                                ...(stageResult.modelContextFrame?.modelCallId === undefined
                                    ? {}
                                    : { modelCallId: stageResult.modelContextFrame.modelCallId }),
                                ...(!("preparedToolAction" in decided.result)
                                    || decided.result.preparedToolAction === undefined
                                    ? {}
                                    : { preparedToolAction: decided.result.preparedToolAction }),
                                ...(!("acceptedContextNotes" in decided.result)
                                    || decided.result.acceptedContextNotes === undefined
                                    ? {}
                                    : { acceptedContextNotes: decided.result.acceptedContextNotes }),
                            };
                            if (normalized.decision.kind === "complete") {
                                pendingCandidateId = normalized.modelCallId ?? executionUnitId;
                            }
                            // 混合响应被接受后，其公开正文块按块顺序成为过程消息；
                            // 正文与随后的决策事实一起提交，失败或审查拒绝时不落盘。
                            goalBeforeProcessText = goal;
                            const publicTextBlocks = "publicTextBlocks" in stageResult
                                ? stageResult.publicTextBlocks
                                : undefined;
                            if (publicTextBlocks !== undefined && publicTextBlocks.length > 0) {
                                goal = this.appendProcessTextMessages(
                                    goal,
                                    publicTextBlocks,
                                    normalized.modelCallId,
                                    executionUnitId,
                                );
                            }
                            break;
                        }
                } catch (error) {
                    // 阶段调用中途已提交的 Goal 必须优先于进入调用前的快照，否则已提交事实会被旧快照覆盖。
                    if (error instanceof RunnerExecutionError && error.committedGoal !== undefined) {
                        goal = error.committedGoal;
                    }
                    if (isExecutionAbortedError(error)) {
                        throw error;
                    }

                    if (error instanceof StageCheckpointFailure) {
                        throw error.original;
                    }
                    if (error instanceof TrajectoryCommitMarkerError) {
                        throw error;
                    }
                    if (error instanceof StaleStageRequestError) throw error;

                    throwIfAborted(control);

                    const stableError = toStableExecutionError(error);
                    if (stableError !== undefined) {
                        return this.stopWithExecutionError(goal, stableError, control);
                    }
                    if (error instanceof ContextLookupProtocolError) {
                        return this.invalidContextLookup(error.message);
                    }
                    if (error instanceof StageExecutionFailure) {
                        if (error.original instanceof TrajectoryCommitMarkerError) {
                            throw error.original;
                        }
                        if (error.committedGoal !== undefined) {
                            goal = error.committedGoal;
                        }
                        const stageError = toStableExecutionError(error.original);
                        if (stageError !== undefined) {
                            return this.stopWithExecutionError(goal, stageError, control);
                        }
                        if (goal.state.run.pendingThink !== undefined
                            || goal.state.run.pendingModelRepair !== undefined
                            || pendingThinkRequestCommitted) {
                            throw error.original;
                        }
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                error.message,
                            ),
                            control,
                        );
                    }

                    // 未批准任务时，当前协议尚未允许 fail Decision 形成执行 Step。
                    // 直接记录稳定执行错误，保持无任务快照仍满足 stepCount/lastStep 不变量。
                    if (goal.state.run.mode === "plan" && goal.state.run.approvedTask === undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                error instanceof Error ? error.message : String(error),
                            ),
                            control,
                        );
                    }

                    // 非协议 Executor 异常规范化为当前 fail Decision；错误文本保持
                    // 用户可见内容。
                    const decision: AgentDecision = {
                        kind: "fail",
                        error: error instanceof Error ? error.message : String(error),
                    };
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "execution_error",
                        payload: {
                            type: "execution_error",
                            code: "EXECUTOR_FAILURE",
                            message: error instanceof Error ? error.message : String(error),
                        },
                    }, control);

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "decision",
                        decision,
                    });
                    const nextGoal = this.appendDecisionMessage(
                        this.withRun(goal, nextRun),
                        decision,
                        executionUnitId,
                    );

                    const closedEpochFact = this.contextEpochClosedFact(nextGoal, "run_failed");
                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            ...(closedEpochFact === undefined ? [] : [closedEpochFact]),
                        ],
                        undefined,
                        control,
                    );
                    contextLookupResult = undefined;
                    continue;
                }

                toolDiscoveryResult = undefined;
                const contextNoteDrafts = toContextNoteEventDrafts(
                    normalized.acceptedContextNotes,
                    goal.id,
                    goal.state.run.id,
                    executionUnitId,
                );
                let acceptedPatch: AcceptedMemoryPatchInput | undefined;
                try {
                    acceptedPatch = this.normalizeDecisionPatch(
                        goal,
                        normalized.decision,
                        session,
                        2,
                    );
                } catch (error) {
                    if (isExecutionAbortedError(error)) {
                        throw error;
                    }

                    throwIfAborted(control);
                    const stableError = toStableExecutionError(error)
                        ?? new RunnerExecutionError(
                            "INVALID_MEMORY_PATCH",
                            error instanceof Error ? error.message : String(error),
                        );
                    return this.stopWithExecutionError(goal, stableError, control);
                }

                if (normalized.decision.kind === "tool_discovery") {
                    const discovered = findTools(
                        normalized.decision.query,
                        this.getAuthorizedToolDefinitions(goal, control),
                    );
                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "tool_discovery",
                        decision: normalized.decision,
                        matchedToolIds: discovered.tools.map((tool) => tool.id),
                    });
                    const nextGoal = this.withRun(goal, nextRun);
                    goal = await this.commitDecision(
                        nextGoal,
                        [{
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            phase: "executing",
                            executionUnitId,
                            eventType: "decision_received",
                            payload: {
                                type: "decision_received",
                                decision: normalized.decision,
                                ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                            },
                        }, ...contextNoteDrafts],
                        acceptedPatch,
                        control,
                    );
                    toolDiscoveryResult = discovered;
                    contextLookupResult = undefined;
                    continue;
                }

                if (normalized.decision.kind === "context_lookup") {
                    if (contextLookupChainCount >= 3) {
                        return {
                            ok: false,
                            error: {
                                code: "CONTEXT_LOOKUP_CHAIN_LIMIT",
                                message: `${CONTEXT_LOOKUP_CHAIN_LIMIT_CODE}: Executing lookup chain exceeds 3 queries`,
                            },
                        };
                    }

                    throwIfAborted(control);
                    let invocation;
                    try {
                        invocation = await invokeContextLookup({
                            goal,
                            request: normalized.decision,
                            phase: "executing",
                            ...(this.contextLookupPort === undefined
                                ? {}
                                : { port: this.contextLookupPort }),
                            executionUnitId,
                            ...(control === undefined ? {} : { control }),
                        });
                    } catch (error) {
                        if (error instanceof ContextLookupProtocolError) {
                            return this.invalidContextLookup(error.message);
                        }
                        throw error;
                    }
                    throwIfAborted(control);

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "context_lookup",
                        request: invocation.request,
                    });
                    const nextGoal = this.withRun(goal, nextRun);
                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision: invocation.request,
                                    ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                },
                            },
                            ...contextNoteDrafts,
                            ...invocation.facts,
                        ],
                        undefined,
                        control,
                    );
                    contextLookupResult = invocation.result;
                    contextLookupChainCount += 1;
                    continue;
                }

                if (normalized.decision.kind === "context_checkpoint") {
                    if (goal.state.run.pendingAction !== undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                "context_checkpoint cannot advance with a pending Action",
                            ),
                            control,
                        );
                    }
                    const currentEpoch = goal.state.run.contextEpoch;
                    const messages = goal.state.messages;
                    const newStart = selectLatestConversationStart(
                        messages,
                        currentEpoch.conversationStartIndex,
                    );
                    const nextEpoch = advanceContextEpoch(
                        currentEpoch,
                        messages,
                        newStart,
                        goal.state.run.committedThroughSequence + 1,
                    );
                    const closedEpoch = toEpochRange(
                        currentEpoch,
                        messages.length,
                        goal.state.run.committedThroughSequence,
                    );
                    const {
                        pendingThink: _pendingThink,
                        pendingModelRepair: _pendingModelRepair,
                        ...runWithoutPendingThink
                    } = goal.state.run;
                    const nextGoal = this.withRun(goal, {
                        ...runWithoutPendingThink,
                        contextEpoch: nextEpoch,
                    });
                    goal = await this.commitDecision(nextGoal, [{
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "context_epoch_advanced",
                        payload: {
                            type: "context_epoch_advanced",
                            closedEpoch,
                            openedEpoch: nextEpoch,
                            reason: "input_threshold",
                        },
                    }, ...contextNoteDrafts], acceptedPatch, control);
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "ask_user") {
                    const normalizedReq = normalizeAskUserRequest(normalized.decision.questions);
                    const mode: "plan" | "execution" = goal.state.run.approvedTask === undefined ? "plan" : "execution";
                    const pendingInteraction: PendingInteractionAskUser = {
                        kind: "ask_user",
                        requestId: normalizedReq.requestId,
                        mode,
                        questions: normalizedReq.questions,
                    };

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "stage_interaction",
                        interaction: pendingInteraction,
                    });
                    const transitionedGoal = this.withRun(goal, nextRun);
                    const formattedContent = this.formatAskUserQuestions(normalizedReq.questions);
                    const nextGoal = this.appendAssistantContent(transitionedGoal, formattedContent, {
                        purpose: "notice",
                        source: { kind: "runtime_notice", noticeId: `ask_user:${normalizedReq.requestId}` },
                    });

                    const decisionFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "decision_received",
                        payload: {
                            type: "decision_received",
                            decision: normalized.decision,
                            ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                        },
                    };

                    const waitingFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_waiting",
                        payload: {
                            type: "run_waiting",
                            reason: "ask_user",
                            requestId: normalizedReq.requestId,
                        },
                    };

                    goal = await this.commitDecision(
                        nextGoal,
                        [decisionFact, ...contextNoteDrafts, waitingFact],
                        acceptedPatch,
                        control,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "run_plan_route_update") {
                    const decision = normalized.decision;
                    const currentRoute = goal.state.run.planRoute;
                    if (currentRoute === undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError("INVALID_AGENT_DECISION", "Approved Plan route is unavailable"),
                            control,
                        );
                    }
                    if (decision.approvalRequest !== undefined) {
                        const normalizedAsk = normalizeAskUserRequest({
                            questions: [{
                                header: "Plan route revision",
                                question: decision.approvalRequest,
                                options: [
                                    { label: "Approve revised route" },
                                    { label: "Keep current route" },
                                ],
                                multiSelect: false,
                            }],
                        });
                        const pendingInteraction: PendingInteractionAskUser = {
                            kind: "ask_user",
                            requestId: normalizedAsk.requestId,
                            mode: "execution",
                            questions: normalizedAsk.questions,
                            routeRevision: {
                                baseRevision: decision.baseRevision,
                                candidate: decision.route,
                                reason: decision.reason,
                                approvalRequest: decision.approvalRequest,
                                approvalOptionId: normalizedAsk.questions[0]!.options[0]!.id,
                            },
                        };
                        const nextRun = this.applyTransition(goal.state.run, {
                            kind: "stage_interaction",
                            interaction: pendingInteraction,
                        });
                        const nextGoal = this.appendAssistantContent(
                            this.withRun(goal, nextRun),
                            this.formatAskUserQuestions(normalizedAsk.questions),
                            {
                                purpose: "notice",
                                source: { kind: "runtime_notice", noticeId: `ask_user:${normalizedAsk.requestId}` },
                            },
                        );
                        goal = await this.commitDecision(
                            nextGoal,
                            [
                                {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    eventType: "decision_received",
                                    payload: {
                                        type: "decision_received",
                                        decision,
                                        ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                    },
                                },
                                {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    eventType: "run_waiting",
                                    payload: {
                                        type: "run_waiting",
                                        reason: "ask_user",
                                        requestId: normalizedAsk.requestId,
                                    },
                                },
                            ],
                            acceptedPatch,
                            control,
                        );
                        contextLookupResult = undefined;
                        contextLookupChainCount = 0;
                        continue;
                    }

                    const revised = reviseRunPlanExecution(
                        currentRoute,
                        decision.route,
                        decision.reason,
                        goal.state.run.currentStage,
                    );
                    const nextGoal = this.withRun(goal, {
                        ...goal.state.run,
                        planRoute: revised.route,
                        ...(revised.currentStage === undefined ? {} : { currentStage: revised.currentStage }),
                    });
                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision,
                                    ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                },
                            },
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "run_plan_route_revised",
                                payload: {
                                    type: "run_plan_route_revised",
                                    route: revised.route,
                                    reason: decision.reason,
                                },
                            },
                        ],
                        acceptedPatch,
                        control,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "task_proposal") {
                    if (goal.state.run.mode !== "plan" || goal.state.run.approvedTask !== undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                "task_proposal is only allowed before approval in Plan Mode",
                            ),
                            control,
                        );
                    }

                    const requestId = `proposal-${randomUUID()}`;
                    const pendingInteraction: PendingInteractionTaskApproval = {
                        kind: "task_approval",
                        requestId,
                        proposal: normalized.decision.task,
                        planRouteCandidate: normalized.decision.planRoute,
                        approvalRequest: normalized.decision.approvalRequest,
                    };

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "stage_interaction",
                        interaction: pendingInteraction,
                    });
                    const transitionedGoal = this.withRun(goal, nextRun);
                    const formattedContent = this.formatTaskProposal(
                        normalized.decision.task,
                        normalized.decision.approvalRequest,
                    );
                    const nextGoal = this.appendAssistantContent(transitionedGoal, formattedContent, {
                        purpose: "notice",
                        source: { kind: "runtime_notice", noticeId: `task_proposal:${requestId}` },
                    });

                    const decisionFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "decision_received",
                        payload: {
                            type: "decision_received",
                            decision: normalized.decision,
                            ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                        },
                    };

                    const waitingFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_waiting",
                        payload: {
                            type: "run_waiting",
                            reason: "task_approval",
                            requestId,
                        },
                    };

                    goal = await this.commitDecision(
                        nextGoal,
                        [decisionFact, ...contextNoteDrafts, waitingFact],
                        acceptedPatch,
                        control,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "tool_call") {
                    const validated = normalized.preparedToolAction;
                    if (validated === undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError("INVALID_AGENT_DECISION", "Tool Action passed validation without a prepared Action"),
                            control,
                        );
                    }

                    try {
                        validateActionLifecycle(goal, validated.action);
                    } catch (error) {
                        if (isExecutionAbortedError(error)) {
                            throw error;
                        }

                        throwIfAborted(control);

                        const stableError = toStableExecutionError(error)
                            ?? new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                error instanceof Error ? error.message : String(error),
                            );

                        return this.stopWithExecutionError(goal, stableError, control);
                    }

                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "decision_received",
                        payload: {
                            type: "decision_received",
                            decision: {
                                ...normalized.decision,
                                action: validated.action,
                            },
                            ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                        },
                    }, control);

                    if (validated.registration.kind === "program") {
                        if (this.trajectoryStore === undefined) {
                            return this.stopWithExecutionError(goal, new RunnerExecutionError(
                                "TOOL_EXECUTION_ERROR", "PTC requires a Trajectory store",
                            ), control);
                        }
                        const authorization = await this.authorizeToolAction(goal, validated, control);
                        if (authorization.kind === "deny") {
                            goal = (await this.settleDeniedToolAction({
                                goal,
                                prepared: validated,
                                executionUnitId,
                                reason: authorization.reason,
                                control,
                                batchPatch: this.pendingBatchPatch(goal, decidedBatch, consumedFromBatch),
                                acceptedPatch,
                                extraFacts: contextNoteDrafts,
                            })).goal;
                            continue;
                        }
                        if (authorization.kind === "approval") {
                            const stagedRun = this.applyTransition(goal.state.run, {
                                kind: "stage_action",
                                action: validated.action,
                                executionUnitId,
                                status: "awaiting_approval",
                                approvalKind: authorization.approvalKind,
                            });
                            Object.assign(stagedRun, this.pendingBatchPatch(goal, decidedBatch, consumedFromBatch));
                            goal = await this.commitDecision(this.withRun(goal, stagedRun), [{
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                actionId: validated.action.actionId,
                                eventType: "action_staged",
                                payload: {
                                    type: "action_staged",
                                    action: validated.action,
                                    approvalStatus: "awaiting_approval",
                                    approvalKind: authorization.approvalKind,
                                },
                            }, ...contextNoteDrafts], acceptedPatch, control);
                            continue;
                        }
                        goal = await this.beginProgram(
                            goal,
                            validated.action,
                            executionUnitId,
                            acceptedPatch,
                            control,
                            contextNoteDrafts,
                            { decided: decidedBatch, consumed: consumedFromBatch },
                        );
                        continue;
                    }

                    const authorization = await this.authorizeToolAction(goal, validated, control);
                    const { effectiveSandboxScope } = authorization;

                    if (authorization.kind === "deny") {
                        goal = (await this.settleDeniedToolAction({
                            goal,
                            prepared: validated,
                            executionUnitId,
                            reason: authorization.reason,
                            control,
                            batchPatch: this.pendingBatchPatch(goal, decidedBatch, consumedFromBatch),
                            acceptedPatch,
                            extraFacts: contextNoteDrafts,
                        })).goal;
                        contextLookupResult = undefined;
                        contextLookupChainCount = 0;
                        continue;
                    }

                    if (authorization.kind === "approval") {
                        throwIfAborted(control);
                        const hasCustomSandboxScope = effectiveSandboxScope.extraFiles.length > 0 || effectiveSandboxScope.network !== "none";
                        const approvalKind = authorization.approvalKind;
                        const stagedRun = this.applyTransition(goal.state.run, {
                            kind: "stage_action",
                            action: validated.action,
                            executionUnitId,
                            status: "awaiting_approval",
                            approvalKind,
                            ...(hasCustomSandboxScope ? { effectiveSandboxScope } : {}),
                        });
                        Object.assign(stagedRun, this.pendingBatchPatch(goal, decidedBatch, consumedFromBatch));
                        const stagedGoal = this.withRun(goal, stagedRun);

                        goal = await this.commitDecision(
                            stagedGoal,
                            [{
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                actionId: validated.action.actionId,
                                eventType: "action_staged",
                                payload: {
                                    type: "action_staged",
                                    action: validated.action,
                                    approvalStatus: "awaiting_approval",
                                    approvalKind,
                                    ...(hasCustomSandboxScope ? { effectiveSandboxScope } : {}),
                                },
                            }, ...contextNoteDrafts],
                            acceptedPatch,
                            control,
                        );
                        continue;
                    }

                    throwIfAborted(control);
                    const hasCustomSandboxScope = effectiveSandboxScope.extraFiles.length > 0 || effectiveSandboxScope.network !== "none";
                    const stagedRun = this.applyTransition(goal.state.run, {
                        kind: "stage_action",
                        action: validated.action,
                        executionUnitId,
                        status: "approved",
                        ...(hasCustomSandboxScope ? { effectiveSandboxScope } : {}),
                    });
                    Object.assign(stagedRun, this.pendingBatchPatch(goal, decidedBatch, consumedFromBatch));
                    const stagedGoal = this.withRun(goal, stagedRun);

                    // Durable intent must exist before the Tool can produce an effect.
                    const stagedCheckpoint = await this.commitDecision(
                        stagedGoal,
                        [{
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            phase: "executing",
                            executionUnitId,
                            actionId: validated.action.actionId,
                            eventType: "action_staged",
                            payload: {
                                type: "action_staged",
                                action: validated.action,
                                approvalStatus: "approved",
                            },
                        }, ...contextNoteDrafts],
                        acceptedPatch,
                        control,
                    );

                    let effectivePlan: SandboxExecutionPlan | undefined = undefined;
                    if (this.sandboxPlanResolver !== undefined && this.workspaceRoot !== undefined) {
                        effectivePlan = await this.sandboxPlanResolver({
                            workspaceRoot: this.workspaceRoot,
                            action: validated.action,
                            effectiveScope: effectiveSandboxScope,
                        });
                    }

                    const outcome = await this.executeToolAndObserve(
                        stagedCheckpoint,
                        validated,
                        executionUnitId,
                        control,
                        effectivePlan,
                    );

                    if (outcome.kind === "stopped") {
                        return outcome.result;
                    }

                    goal = outcome.goal;
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "run_stage_update") {
                    const stageDecision = normalized.decision;
                    const nextPlanRoute = goal.state.run.planRoute === undefined
                        ? undefined
                        : updateRunPlanStage(goal.state.run.planRoute, {
                            target: stageDecision.target,
                            acceptanceCriteria: stageDecision.acceptanceCriteria,
                            ...(stageDecision.stageId !== undefined ? { stageId: stageDecision.stageId } : {}),
                            ...(stageDecision.baseRevision !== undefined ? { baseRevision: stageDecision.baseRevision } : {}),
                            ...(stageDecision.reason !== undefined ? { reason: stageDecision.reason } : {}),
                        });
                    let nextStage: RunStageState;
                    if (stageDecision.stageId === undefined) {
                        const previousStage = goal.state.run.currentStage;
                        const stageOrdinal = previousStage !== undefined
                            ? parseInt(previousStage.stageId.replace("stage-", ""), 10) + 1
                            : 1;
                        nextStage = createInitialRunStage(
                            {
                                target: stageDecision.target,
                                acceptanceCriteria: stageDecision.acceptanceCriteria,
                            },
                            stageOrdinal,
                            previousStage,
                        );
                        if (nextPlanRoute !== undefined) {
                            const plannedStage = nextPlanRoute.stages[nextPlanRoute.nextStageIndex]!;
                            nextStage = { ...nextStage, stageId: plannedStage.stageId, revision: plannedStage.revision };
                        }
                    } else {
                        nextStage = reviseRunStage(
                            goal.state.run.currentStage!,
                            {
                                stageId: stageDecision.stageId,
                                baseRevision: stageDecision.baseRevision!,
                                reason: stageDecision.reason!,
                                target: stageDecision.target,
                                acceptanceCriteria: stageDecision.acceptanceCriteria,
                            },
                        );
                    }

                    const transitionedRun = this.applyTransition(goal.state.run, {
                        kind: "stage_update",
                        stage: nextStage,
                        decision: normalized.decision,
                    });
                    const nextRun = nextPlanRoute === undefined
                        ? transitionedRun
                        : { ...transitionedRun, planRoute: nextPlanRoute };
                    const nextGoal = this.withRun(goal, nextRun);

                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision: normalized.decision,
                                    ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                },
                            },
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "run_stage_declared",
                                payload: {
                                    type: "run_stage_declared",
                                    stageId: nextStage.stageId,
                                    revision: nextStage.revision,
                                    target: nextStage.target,
                                    acceptanceCriteria: nextStage.acceptanceCriteria,
                                    ...(nextStage.previousStageResultRef !== undefined
                                        ? { previousStageResultRef: nextStage.previousStageResultRef }
                                        : {}),
                                    ...(stageDecision.reason !== undefined ? { reason: stageDecision.reason } : {}),
                                },
                            },
                            ...(nextPlanRoute !== undefined
                                && goal.state.run.planRoute !== undefined
                                && nextPlanRoute.revision !== goal.state.run.planRoute.revision
                                ? [{
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing" as const,
                                    executionUnitId,
                                    eventType: "run_plan_route_revised" as const,
                                    payload: {
                                        type: "run_plan_route_revised" as const,
                                        route: nextPlanRoute,
                                        reason: stageDecision.reason!,
                                    },
                                }]
                                : []),
                            ...contextNoteDrafts,
                        ],
                        acceptedPatch,
                        control,
                        undefined,
                        expectedStageKey,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "goal_plan_update") {
                    if (
                        !canUpdateGoalPlan(goal.state.run.mode)
                        || (goal.state.goalPlan === undefined && normalized.decision.baseRevision !== 0)
                    ) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                "goal_plan_update is not authorized in the current Run mode",
                            ),
                            control,
                        );
                    }

                    try {
                        for (const operation of normalized.decision.operations) {
                            if (operation.type !== "update") continue;
                            if (operation.status === "completed") {
                                if (
                                    operation.evidenceSequences === undefined
                                    || operation.evidenceSequences.length === 0
                                ) {
                                    throw new RunnerExecutionError(
                                        "INVALID_AGENT_DECISION",
                                        "completed Todo update must cite current Run evidence",
                                    );
                                }
                                session.validateEvidence(operation.evidenceSequences);
                            } else if (operation.evidenceSequences !== undefined) {
                                throw new RunnerExecutionError(
                                    "INVALID_AGENT_DECISION",
                                    "GoalPlan evidence is only valid when completing a Todo",
                                );
                            }
                        }
                    } catch (error) {
                        return this.stopWithExecutionError(
                            goal,
                            error instanceof RunnerExecutionError
                                ? error
                                : new RunnerExecutionError(
                                    "INVALID_AGENT_DECISION",
                                    error instanceof Error ? error.message : String(error),
                                ),
                            control,
                        );
                    }

                    const reduced = reduceGoalPlan(
                        goal.state.goalPlan ?? createEmptyGoalPlan(),
                        {
                            baseRevision: normalized.decision.baseRevision,
                            operations: normalized.decision.operations,
                        },
                    );
                    if (!reduced.ok) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                reduced.error.message,
                            ),
                            control,
                        );
                    }

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "plan_update",
                        decision: normalized.decision,
                    });
                    const nextGoal = this.withRun(
                        {
                            ...goal,
                            state: {
                                ...goal.state,
                                goalPlan: reduced.plan,
                            },
                        },
                        nextRun,
                    );

                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision: normalized.decision,
                                    ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                },
                            },
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "goal_plan_updated",
                                payload: {
                                    type: "goal_plan_updated",
                                    revision: reduced.plan.revision,
                                    operations: normalized.decision.operations,
                                },
                            },
                            ...contextNoteDrafts,
                        ],
                        acceptedPatch,
                        control,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "run_stage_complete") {
                    const stageDecision = normalized.decision;
                    if (goal.state.run.currentStage === undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                "run_stage_complete requires an active RunStageState",
                            ),
                            control,
                        );
                    }
                    const candidate = stageDecision;
                    const sequences = new Set(candidate.evidenceSequences ?? []);
                    const events = session === undefined ? [] : [...session.evidenceIndex.events.values()];
                    const actions = new Set(events.filter(event => sequences.has(event.sequence))
                        .map(event => event.actionId).filter(id => id !== undefined));
                    const evidence = events.filter(event => sequences.has(event.sequence)
                        || (event.actionId !== undefined && actions.has(event.actionId)
                            && ["action_staged", "tool_started", "tool_finished", "observation_recorded"].includes(event.eventType)));

                    let reviewed: CompletionReviewResult;
                    try {
                        reviewed = await this.executor.reviewCompletion({
                            ...stepInput,
                            goal,
                            candidate,
                            evidence,
                            currentStage: goal.state.run.currentStage,
                        });
                    } catch (error) {
                        const stableError = toStableExecutionError(error);
                        if (stableError !== undefined) {
                            return this.stopWithExecutionError(goal, stableError, control);
                        }
                        throw error;
                    }

                    throwIfAborted(control);

                    if (reviewed.kind === "reject") {
                        const rejectedStage = rejectCurrentRunStage(goal.state.run.currentStage, reviewed.feedback);
                        const nextRun = this.applyTransition(goal.state.run, {
                            kind: "stage_settle",
                            stage: rejectedStage,
                            decision: stageDecision,
                        });
                        // 被审查拒绝的完成候选不提交其公开正文。
                        const nextGoal = this.withRun(goalBeforeProcessText ?? goal, nextRun);
                        goal = await this.commitDecision(
                            nextGoal,
                            [
                                {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    eventType: "decision_received",
                                    payload: {
                                        type: "decision_received",
                                        decision: stageDecision,
                                        ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                    },
                                },
                                {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    eventType: "run_stage_rejected",
                                    payload: {
                                        type: "run_stage_rejected",
                                        stageId: rejectedStage.stageId,
                                        revision: rejectedStage.revision,
                                        feedback: reviewed.feedback,
                                    },
                                },
                            ],
                            undefined,
                            control,
                            undefined,
                            expectedStageKey,
                        );
                        contextLookupResult = undefined;
                        contextLookupChainCount = 0;
                        continue;
                    }

                    const acceptedSequence = goal.state.run.committedThroughSequence + 2;
                    const acceptedStage = acceptCurrentRunStage(goal.state.run.currentStage, acceptedSequence);
                    const nextPlanRoute = goal.state.run.planRoute === undefined
                        ? undefined
                        : acceptRunPlanStage(goal.state.run.planRoute, acceptedStage.stageId, acceptedSequence);
                    const transitionedRun = this.applyTransition(goal.state.run, {
                        kind: "stage_settle",
                        stage: acceptedStage,
                        decision: stageDecision,
                    });
                    const nextRun = nextPlanRoute === undefined
                        ? transitionedRun
                        : { ...transitionedRun, planRoute: nextPlanRoute };
                    const nextGoal = this.withRun(goal, nextRun);
                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision: stageDecision,
                                    ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                },
                            },
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "run_stage_accepted",
                                payload: {
                                    type: "run_stage_accepted",
                                    stageId: acceptedStage.stageId,
                                    revision: acceptedStage.revision,
                                    summary: stageDecision.summary,
                                    ...(stageDecision.evidenceSequences !== undefined
                                        ? { evidenceSequences: stageDecision.evidenceSequences }
                                        : {}),
                                },
                            },
                            ...contextNoteDrafts,
                        ],
                        acceptedPatch,
                        control,
                        undefined,
                        expectedStageKey,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                let acceptedStage: RunStageState | undefined;
                let acceptedPlanRoute = goal.state.run.planRoute;
                if (normalized.decision.kind === "complete" && goal.state.run.currentStage !== undefined) {
                    const candidate = normalized.decision;
                    const sequences = new Set("evidenceSequences" in candidate && candidate.evidenceSequences !== undefined
                        ? candidate.evidenceSequences
                        : "completionEvidence" in candidate && candidate.completionEvidence !== undefined
                            ? candidate.completionEvidence.flatMap(item => item.evidenceSequences)
                            : []);
                    const events = session === undefined ? [] : [...session.evidenceIndex.events.values()];
                    const actions = new Set(events.filter(event => sequences.has(event.sequence))
                        .map(event => event.actionId).filter(id => id !== undefined));
                    const evidence = events.filter(event => sequences.has(event.sequence)
                        || (event.actionId !== undefined && actions.has(event.actionId)
                            && ["action_staged", "tool_started", "tool_finished", "observation_recorded"].includes(event.eventType)));

                    const acceptedStageEvents = events.filter(e => e.eventType === "run_stage_accepted");
                    const histSeqs = new Set(acceptedStageEvents.flatMap(e => (e.payload as any).evidenceSequences ?? []));
                    const historicalAcceptedEvidence = histSeqs.size > 0
                        ? events.filter(e => histSeqs.has(e.sequence))
                        : undefined;

                    let reviewed: CompletionReviewResult;
                    try {
                        reviewed = await this.executor.reviewCompletion({
                            ...stepInput,
                            goal,
                            candidate,
                            evidence,
                            currentStage: goal.state.run.currentStage,
                            ...(historicalAcceptedEvidence !== undefined ? { historicalAcceptedEvidence } : {}),
                        });
                    } catch (error) {
                        const stableError = toStableExecutionError(error);
                        if (stableError !== undefined) {
                            return this.stopWithExecutionError(goal, stableError, control);
                        }
                        throw error;
                    }

                    throwIfAborted(control);

                    if (reviewed.kind === "reject") {
                        const rejectedStage = rejectCurrentRunStage(goal.state.run.currentStage, reviewed.feedback, undefined, true);
                        // 已接受的末阶段与路线游标必须在同一检查点一起重开。
                        const rejectedPlanRoute = goal.state.run.planRoute !== undefined
                            && goal.state.run.currentStage.status === "accepted"
                            ? reopenRunPlanStage(goal.state.run.planRoute, rejectedStage.stageId)
                            : goal.state.run.planRoute;
                        const transitionedRun = this.applyTransition(goal.state.run, {
                            kind: "stage_settle",
                            stage: rejectedStage,
                            decision: normalized.decision,
                        });
                        const nextRun = rejectedPlanRoute === undefined
                            ? transitionedRun
                            : { ...transitionedRun, planRoute: rejectedPlanRoute };
                        // 被审查拒绝的完成候选不提交其公开正文。
                        const nextGoal = this.withRun(goalBeforeProcessText ?? goal, nextRun);
                        goal = await this.commitDecision(
                            nextGoal,
                            [
                                {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    eventType: "decision_received",
                                    payload: {
                                        type: "decision_received",
                                        decision: normalized.decision,
                                        ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                    },
                                },
                                {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    eventType: "run_stage_rejected",
                                    payload: {
                                        type: "run_stage_rejected",
                                        stageId: rejectedStage.stageId,
                                        revision: rejectedStage.revision,
                                        feedback: reviewed.feedback,
                                    },
                                },
                            ],
                            undefined,
                            control,
                        );
                        contextLookupResult = undefined;
                        contextLookupChainCount = 0;
                        continue;
                    }

                    if (goal.state.run.currentStage.status === "executing") {
                        const acceptedSequence = goal.state.run.committedThroughSequence + 2;
                        acceptedStage = acceptCurrentRunStage(goal.state.run.currentStage, acceptedSequence);
                        if (acceptedPlanRoute !== undefined) {
                            acceptedPlanRoute = acceptRunPlanStage(acceptedPlanRoute, acceptedStage.stageId, acceptedSequence);
                        }
                    }
                }

                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    executionUnitId,
                    eventType: "decision_received",
                    payload: {
                        type: "decision_received",
                        decision: normalized.decision,
                        ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                    },
                }, control);

                throwIfAborted(control);
                const transitionedRun = this.applyTransition(goal.state.run, {
                    kind: "decision",
                    decision: normalized.decision,
                    ...(acceptedStage !== undefined ? { stage: acceptedStage } : {}),
                });
                const nextRun = acceptedPlanRoute === undefined
                    ? transitionedRun
                    : { ...transitionedRun, planRoute: acceptedPlanRoute };
                const decisionIdentity = normalized.modelCallId ?? executionUnitId;
                const nextGoal = this.appendDecisionMessage(
                    this.withRun(goal, nextRun),
                    normalized.decision,
                    decisionIdentity,
                );

                let terminalFact: TrajectoryEventDraft;
                if (normalized.decision.kind === "complete") {
                    terminalFact = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_completed",
                        payload: { type: "run_completed", summary: normalized.decision.summary },
                    };
                } else if (normalized.decision.kind === "wait") {
                    terminalFact = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_waiting",
                        payload: { type: "run_waiting", reason: normalized.decision.reason },
                    };
                } else if (normalized.decision.kind === "fail") {
                    // 失败通知正文已在统一决策提交处追加；此处只补充终态事实。
                    terminalFact = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_failed",
                        payload: {
                            type: "run_failed",
                            code: "AGENT_DECISION_FAILED",
                            message: normalized.decision.error,
                        },
                    };
                } else {
                    return this.stopWithExecutionError(
                        goal,
                        new RunnerExecutionError(
                            "INVALID_AGENT_DECISION",
                            "Unsupported non-terminal AgentDecision",
                        ),
                        control,
                    );
                }
                const stageAcceptedFact: TrajectoryEventDraft | undefined = acceptedStage !== undefined
                    ? {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_stage_accepted",
                        payload: {
                            type: "run_stage_accepted",
                            stageId: acceptedStage.stageId,
                            revision: acceptedStage.revision,
                            summary: normalized.decision.kind === "complete" ? normalized.decision.summary : undefined,
                            ...(normalized.decision.kind === "complete" && "evidenceSequences" in normalized.decision && normalized.decision.evidenceSequences !== undefined
                                ? { evidenceSequences: normalized.decision.evidenceSequences }
                                : {}),
                        },
                    }
                    : undefined;
                goal = await this.commitDecision(
                    nextGoal,
                    [
                        ...contextNoteDrafts,
                        ...(stageAcceptedFact !== undefined ? [stageAcceptedFact] : []),
                        terminalFact,
                        ...(normalized.decision.kind === "complete" || normalized.decision.kind === "fail"
                            ? (() => {
                                const closed = this.contextEpochClosedFact(
                                    nextGoal,
                                    normalized.decision.kind === "complete" ? "run_completed" : "run_failed",
                                );
                                return closed === undefined ? [] : [closed];
                            })()
                            : []),
                    ],
                    acceptedPatch,
                    control,
                );
                contextLookupResult = undefined;
                contextLookupChainCount = 0;
            } catch (error) {
                if (error instanceof StaleStageRequestError) {
                    const { pendingModelRepair: _repair, pendingThink: _think, ...run } = error.goal.state.run;
                    goal = await this.commitStageCheckpoint(this.withRun(error.goal, run), [], control);
                    contextLookupResult = undefined;
                    toolDiscoveryResult = undefined;
                    continue;
                }
                if (error instanceof RunInterruptAcceptedError) {
                    // 已被受理的中断使当前候选失效：它不是正式答复，Run 随后结算为取消。
                    if (pendingCandidateId !== undefined) {
                        this.publishCandidateInvalidated(goal, pendingCandidateId, "cancelled");
                    }
                    throw error;
                }
                if (error instanceof PendingSteerAcceptedError) {
                    // Steer 到达使旧决策被弃用：对应候选必须先作废。
                    if (pendingCandidateId !== undefined) {
                        this.publishCandidateInvalidated(goal, pendingCandidateId, "replaced");
                    }
                    goal = await this.applyPendingSteers(goal, control);
                    continue;
                }
                throw error;
            } finally {
                session?.close();
            }
        }

        return { ok: true, state: goal.state.run };
    }

    private async findProgramExecutionUnit(goal: Goal, actionId: string, control?: ExecutionControl): Promise<string> {
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC requires a Trajectory store");
        }
        const history = await this.recoveryReader.readTrajectory(
            { goalId: goal.id, runId: goal.state.run.id },
            goal.state.run.committedThroughSequence,
            control,
        );
        const decisions = history.committed.filter((event) =>
            event.eventType === "decision_received"
            && event.payload.decision.kind === "tool_call"
            && event.payload.decision.action.actionId === actionId);
        if (decisions.length !== 1 || decisions[0]?.executionUnitId === undefined) {
            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
        }
        return decisions[0].executionUnitId;
    }

    private async beginProgram(
        goal: Goal,
        action: ToolCallAction,
        executionUnitId: string,
        acceptedPatch?: AcceptedMemoryPatchInput,
        control?: ExecutionControl,
        contextNoteDrafts: readonly TrajectoryEventDraft[] = [],
        batch?: {
            readonly decided: PendingActionBatch | undefined;
            readonly consumed: boolean;
        },
    ): Promise<Goal> {
        if (this.trajectoryStore === undefined || goal.state.run.pendingProgram !== undefined) {
            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC requires a fresh program and Trajectory store");
        }
        const code = (action.input as { readonly code: string }).code;
        const pendingProgram = {
            programId: randomUUID(),
            action,
            executionUnitId,
            codeHash: createHash("sha256").update(code).digest("hex"),
            workerHash: programWorkerHash(),
            nodeVersion: process.version,
            fixedTime: Date.now(),
            seed: Math.floor(Math.random() * 0xffffffff),
            nextCallIndex: 0,
            resultBytes: 0,
        };
        const {
            pendingAction: _pendingAction,
            pendingActionBatch: _pendingActionBatch,
            pendingModelRepair: _pendingModelRepair,
            pendingThink: _pendingThink,
            ...runForProgram
        } = goal.state.run;
        // 程序开始与消费批次队首共用同一检查点，恢复时剩余 Action 仍按原顺序继续。
        const nextBatch = batch === undefined
            ? goal.state.run.pendingActionBatch
            : this.pendingBatchPatch(goal, batch.decided, batch.consumed).pendingActionBatch;
        return this.commitDecision(this.withRun(goal, {
            ...runForProgram,
            ...(nextBatch === undefined ? {} : { pendingActionBatch: nextBatch }),
            pendingProgram,
        }), [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: action.actionId,
            eventType: "action_staged",
            payload: { type: "action_staged", action, approvalStatus: "approved" },
        }, ...contextNoteDrafts, {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: action.actionId,
            eventType: "tool_started",
            payload: {
                type: "tool_started",
                actionId: action.actionId,
                toolId: action.toolId,
                input: action.input,
            },
        }, {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: action.actionId,
            eventType: "program_started",
            payload: {
                type: "program_started",
                programId: pendingProgram.programId,
                parentActionId: action.actionId,
                codeHash: pendingProgram.codeHash,
                workerHash: pendingProgram.workerHash,
                nodeVersion: pendingProgram.nodeVersion,
            },
        }], acceptedPatch, control);
    }

    private async continueProgram(goal: Goal, control?: ExecutionControl): Promise<Goal> {
        const program = goal.state.run.pendingProgram;
        if (program === undefined) throw new Error("Missing pending program");
        if (program.pendingStop !== undefined) {
            const pending = goal.state.run.pendingAction;
            if (pending?.status === "approved") {
                const executionAction = resolveActionExecutionAction(pending);
                const prepared = prepareToolAction(
                    goal, executionAction, this.toolRegistry, this.toolPolicy, false, control,
                    undefined, this.traceSink,
                );
                const callIndex = program.nextCallIndex;
                let plan: SandboxExecutionPlan | undefined;
                if (this.sandboxPlanResolver !== undefined && this.workspaceRoot !== undefined) {
                    plan = await this.sandboxPlanResolver({
                        workspaceRoot: this.workspaceRoot,
                        action: executionAction,
                        effectiveScope: pending.effectiveSandboxScope,
                    });
                }
                let outcome: { readonly kind: "observed"; readonly goal: Goal }
                    | { readonly kind: "stopped"; readonly result: RunnerResult };
                try {
                    outcome = await this.executeToolAndObserve(
                        goal, prepared, `${program.executionUnitId}:call:${callIndex}`,
                        control, plan, { programId: program.programId, callIndex },
                    );
                } catch (error) {
                    if (error instanceof ProgramResourceError) {
                        return this.stopProgram(
                            goal,
                            program.pendingStop.code,
                            program.pendingStop.message,
                            control,
                        );
                    }
                    throw error;
                }
                if (outcome.kind === "stopped") {
                    const latest = await this.restore({ goalId: goal.id, runId: goal.state.run.id }, control);
                    if (latest === undefined) throw new Error("PTC_REPLAY_MISMATCH");
                    return latest;
                }
                goal = outcome.goal;
            } else if (pending !== undefined) {
                return goal;
            }
            return this.settleProgram(goal, {
                kind: "failure",
                code: program.pendingStop.code,
                message: program.pendingStop.message,
                retryable: false,
            }, control);
        }
        const code = (program.action.input as { readonly code: string }).code;
        if (program.codeHash !== createHash("sha256").update(code).digest("hex")
            || program.workerHash !== programWorkerHash()
            || program.nodeVersion !== process.version) {
            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
        }
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
        }
        const ledger = await this.recoveryReader.readTrajectory(
            { goalId: goal.id, runId: goal.state.run.id },
            goal.state.run.committedThroughSequence,
            control,
        );
        const starts = ledger.committed.filter((event) => event.eventType === "program_started"
            && event.payload.programId === program.programId);
        if (starts.length !== 1 || starts[0]?.eventType !== "program_started"
            || starts[0].payload.parentActionId !== program.action.actionId
            || starts[0].payload.codeHash !== program.codeHash
            || starts[0].payload.workerHash !== program.workerHash
            || starts[0].payload.nodeVersion !== program.nodeVersion
            || starts[0].executionUnitId !== program.executionUnitId) {
            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
        }
        const reservations = [...ledger.committed, ...ledger.uncommittedTail]
            .filter((event) => event.eventType === "program_time_reserved"
                && event.payload.programId === program.programId);
        for (let index = 0; index < reservations.length; index += 1) {
            const reservation = reservations[index];
            if (reservation?.eventType !== "program_time_reserved"
                || reservation.payload.sliceIndex !== index
                || reservation.executionUnitId !== program.executionUnitId
                || reservation.actionId !== program.action.actionId) {
                throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
            }
        }
        let reservedSlices = reservations.length;
        const committed = ledger.committed.filter((event) =>
            event.sequence <= goal.state.run.committedThroughSequence);
        const actionIdAt = (index: number): string => `${program.programId}:${index}`;
        let committedResultBytes = 0;
        for (let index = 0; index < program.nextCallIndex; index += 1) {
            const actionId = actionIdAt(index);
            const staged = committed.filter((event) => event.eventType === "action_staged"
                && event.actionId === actionId && event.programId === program.programId
                && event.callIndex === index);
            const observed = committed.filter((event) => event.eventType === "observation_recorded"
                && event.actionId === actionId && event.programId === program.programId
                && event.callIndex === index);
            if (staged.length !== 1 || observed.length !== 1) {
                throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
            }
            const result = observed[0];
            if (result?.eventType !== "observation_recorded"
                || staged[0]!.sequence >= result.sequence) {
                throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
            }
            const revision = resolveCommittedProgramCallRevision(
                committed,
                program,
                index,
                actionId,
            );
            committedResultBytes += Buffer.byteLength(JSON.stringify(
                createProgramCallEnvelope(
                    result.payload.observation,
                    0,
                    revision,
                ),
            ));
        }
        if (committedResultBytes !== program.resultBytes) {
            throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
        }
        let issued = 0;
        let inputFailureMessage: string | undefined;
        let observation: ToolObservation;
        try {
            const value = await runProgramSandbox({
                code,
                fixedTime: program.fixedTime,
                seed: program.seed,
                ...(control?.signal === undefined ? {} : { signal: control.signal }),
                onReserveTime: async () => {
                    if (reservedSlices >= 120) throw new ProgramResourceError("PTC_TIME_LIMIT");
                    try {
                        await this.trajectoryStore!.append({
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            phase: "executing",
                            executionUnitId: program.executionUnitId,
                            actionId: program.action.actionId,
                            eventType: "program_time_reserved",
                            payload: {
                                type: "program_time_reserved",
                                programId: program.programId,
                                sliceIndex: reservedSlices,
                                milliseconds: 1000,
                            },
                        });
                    } catch (error) {
                        throw new ProgramReservationError(error);
                    }
                    reservedSlices += 1;
                },
                onToolCall: async (call, workerSignal) => {
                    const toolControl: ExecutionControl = {
                        signal: control?.signal === undefined
                            ? workerSignal
                            : AbortSignal.any([control.signal, workerSignal]),
                    };
                    const callIndex = issued++;
                    if (callIndex >= 128) throw new Error("PTC_CALL_LIMIT");
                    if (call.toolId === "execute_program" || call.toolId.startsWith("system_")
                        || !isJsonValue(call.input)) {
                        throw new Error("PTC_INVALID_TOOL_CALL");
                    }
                    const actionId = actionIdAt(callIndex);
                    const action: ToolCallAction = {
                        actionId,
                        toolId: call.toolId,
                        input: call.input,
                    };
                    const replay = callIndex < goal.state.run.pendingProgram!.nextCallIndex;
                    let prepared: PreparedToolAction;
                    try {
                        prepared = prepareToolAction(
                            goal, action, this.toolRegistry, this.toolPolicy,
                            !replay && goal.state.run.pendingAction?.action.actionId !== actionId,
                            toolControl,
                            undefined,
                            this.traceSink,
                        );
                    } catch (error) {
                        if (error instanceof RunnerExecutionError && error.code === "INVALID_TOOL_INPUT") {
                            inputFailureMessage = programToolInputMessage(call.toolId, error.issues);
                        }
                        throw error;
                    }
                    if (prepared.registration.kind === "program") {
                        throw new Error("PTC_INVALID_TOOL_CALL");
                    }
                    if (replay) {
                        const stage = committed.find((event) =>
                            event.eventType === "action_staged"
                            && event.actionId === actionId
                            && event.programId === program.programId
                            && event.callIndex === callIndex);
                        const result = committed.find((event) =>
                            event.eventType === "observation_recorded"
                            && event.actionId === actionId
                            && event.programId === program.programId
                            && event.callIndex === callIndex);
                        if (stage?.eventType !== "action_staged"
                            || result?.eventType !== "observation_recorded"
                            || stage.payload.action.toolId !== prepared.action.toolId
                            || JSON.stringify(stage.payload.action.input) !== JSON.stringify(prepared.action.input)) {
                            throw new Error("PTC_REPLAY_MISMATCH");
                        }
                        // 已结算子调用只返回保存结果；修订说明与首次执行保持一致。
                        const revision = resolveCommittedProgramCallRevision(
                            committed,
                            program,
                            callIndex,
                            actionId,
                        );
                        return createProgramCallEnvelope(
                            result.payload.observation,
                            result.sequence,
                            revision,
                        );
                    }
                    if (callIndex !== goal.state.run.pendingProgram!.nextCallIndex) {
                        throw new Error("PTC_REPLAY_MISMATCH");
                    }
                    const childExecutionUnitId = `${program.executionUnitId}:call:${callIndex}`;
                    let pending = goal.state.run.pendingAction;
                    if (pending !== undefined && pending.action.actionId !== actionId) {
                        throw new Error("PTC_REPLAY_MISMATCH");
                    }
                    if (pending === undefined) {
                        const authorization = await this.authorizeToolAction(goal, prepared, toolControl);
                        if (authorization.kind === "deny") {
                            const denied = await this.settleDeniedToolAction({
                                goal,
                                prepared,
                                executionUnitId: childExecutionUnitId,
                                reason: authorization.reason,
                                control: toolControl,
                                program: { programId: program.programId, callIndex },
                            });
                            goal = denied.goal;
                            return createProgramCallEnvelope(
                                denied.observation,
                                denied.sourceSequence ?? 0,
                                undefined,
                            );
                        }
                        const awaitingApproval = authorization.kind === "approval";
                        const hasCustomScope = authorization.effectiveSandboxScope.extraFiles.length > 0
                            || authorization.effectiveSandboxScope.network !== "none";
                        const stagedRun = this.applyTransition(goal.state.run, {
                            kind: "stage_action",
                            action: prepared.action,
                            executionUnitId: childExecutionUnitId,
                            status: awaitingApproval ? "awaiting_approval" : "approved",
                            ...(authorization.kind === "approval" ? { approvalKind: authorization.approvalKind } : {}),
                            ...(hasCustomScope ? { effectiveSandboxScope: authorization.effectiveSandboxScope } : {}),
                        });
                        goal = await this.commitDecision(this.withRun(goal, stagedRun), [{
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            phase: "executing",
                            executionUnitId: childExecutionUnitId,
                            actionId,
                            programId: program.programId,
                            callIndex,
                            eventType: "action_staged",
                            payload: {
                                type: "action_staged",
                                action: prepared.action,
                                approvalStatus: awaitingApproval ? "awaiting_approval" : "approved",
                                ...(authorization.kind === "approval" ? { approvalKind: authorization.approvalKind } : {}),
                                ...(hasCustomScope ? { effectiveSandboxScope: authorization.effectiveSandboxScope } : {}),
                            },
                        }], undefined, toolControl);
                        pending = goal.state.run.pendingAction;
                        if (awaitingApproval) throw new ProgramWaitingError();
                    }
                    if (pending?.status !== "approved") throw new ProgramWaitingError();
                    const childExecutionAction = resolveActionExecutionAction(pending);
                    if (JSON.stringify(childExecutionAction.input) !== JSON.stringify(prepared.action.input)) {
                        prepared = prepareToolAction(
                            goal,
                            childExecutionAction,
                            this.toolRegistry,
                            this.toolPolicy,
                            false,
                            toolControl,
                            undefined,
                            this.traceSink,
                        );
                        if (prepared.registration.kind === "program") {
                            throw new Error("PTC_INVALID_TOOL_CALL");
                        }
                    }
                    let plan: SandboxExecutionPlan | undefined;
                    if (this.sandboxPlanResolver !== undefined && this.workspaceRoot !== undefined) {
                        plan = await this.sandboxPlanResolver({
                            workspaceRoot: this.workspaceRoot,
                            action: childExecutionAction,
                            effectiveScope: pending.effectiveSandboxScope,
                        });
                    }
                    const outcome = await this.executeToolAndObserve(
                        goal,
                        prepared,
                        childExecutionUnitId,
                        toolControl,
                        plan,
                        { programId: program.programId, callIndex },
                    );
                    if (outcome.kind === "stopped") {
                        const restored = await this.restore(
                            { goalId: goal.id, runId: goal.state.run.id }, toolControl,
                        );
                        if (restored === undefined) throw new Error("PTC_REPLAY_MISMATCH");
                        goal = restored;
                        throw new ProgramWaitingError();
                    }
                    goal = outcome.goal;
                    return createProgramCallEnvelope(
                        outcome.observation,
                        outcome.sourceSequence ?? 0,
                        outcome.revision,
                    );
                },
            });
            observation = { kind: "success", output: value as JsonValue, summary: "Program returned a result." };
        } catch (error) {
            if (error instanceof ProgramWaitingError) return goal;
            if (error instanceof ProgramReservationError) throw error;
            if (error instanceof ProgramSandboxAbortedError || control?.signal?.aborted) {
                if (control?.signal?.reason === "user_cancel_program") {
                    return this.stopProgram(goal, "PTC_CANCELLED", "Program cancelled.");
                }
                throw new ExecutionAbortedError();
            }
            if (isExecutionAbortedError(error)) throw error;
            if (error instanceof ProgramResourceError) {
                return this.stopProgram(goal, error.code, "Program resource limit exceeded.", control);
            }
            if (error instanceof Error && [
                "PTC_TIME_LIMIT", "PTC_MEMORY_LIMIT", "PTC_FRAME_LIMIT",
                "PTC_RETURN_LIMIT", "PTC_DIAGNOSTIC_LIMIT", "PTC_CODE_LIMIT",
            ].includes(error.message)) {
                return this.stopProgram(goal, error.message, "Program resource limit exceeded.", control);
            }
            const knownProgramCodes = new Set([
                "PTC_UNAWAITED_CALL", "PTC_INVALID_RETURN", "PTC_INVALID_TOOL_INPUT",
                "PTC_CALL_LIMIT", "PTC_INVALID_TOOL_CALL", "PTC_REPLAY_MISMATCH",
                "PTC_PROTOCOL_ERROR", "PTC_SANDBOX_UNAVAILABLE",
            ]);
            observation = {
                kind: "failure",
                code: error instanceof RunnerExecutionError ? error.code
                    : error instanceof Error && knownProgramCodes.has(error.message)
                        ? error.message : "PTC_EXECUTION_ERROR",
                message: error instanceof RunnerExecutionError && error.code === "INVALID_TOOL_INPUT"
                    ? inputFailureMessage ?? "Program execution failed."
                    : "Program execution failed.",
                retryable: false,
            };
        }
        return this.settleProgram(goal, observation, control);
    }

    private async stopProgram(
        currentGoal: Goal,
        code: string,
        message: string,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const latest = await this.restore({
            goalId: currentGoal.id,
            runId: currentGoal.state.run.id,
        });
        if (latest?.state.run.pendingProgram === undefined) {
            throw new Error("PTC_REPLAY_MISMATCH");
        }
        const program = latest.state.run.pendingProgram;
        const pending = latest.state.run.pendingAction;
        if (pending !== undefined && pending.attemptsStarted !== undefined
            && !this.toolRegistry.get(pending.action.toolId)?.definition.isReadOnly) {
            const waitingRun = pending.status === "outcome_unknown"
                ? latest.state.run
                : this.applyTransition(latest.state.run, {
                    kind: "tool_outcome_unknown",
                    actionId: pending.action.actionId,
                });
            return this.commitDecision(this.withRun(latest, {
                ...waitingRun,
                pendingProgram: {
                    ...program,
                    pendingStop: { code, message },
                },
            }), [{
                goalId: latest.id,
                runId: latest.state.run.id,
                phase: "executing",
                executionUnitId: `${program.executionUnitId}:call:${program.nextCallIndex}`,
                actionId: pending.action.actionId,
                programId: program.programId,
                callIndex: program.nextCallIndex,
                eventType: "tool_attempt_failed",
                payload: {
                    type: "tool_attempt_failed",
                    actionId: pending.action.actionId,
                    attempt: pending.attemptsStarted,
                    reason: "outcome_unknown",
                },
            }], undefined, control);
        }
        const { pendingAction: _pendingAction, ...runWithoutChild } = latest.state.run;
        return this.settleProgram(this.withRun(latest, {
            ...runWithoutChild,
            status: "running",
        }), {
            kind: "failure",
            code,
            message,
            retryable: false,
        }, control);
    }

    private async settleProgram(
        goal: Goal,
        observation: ToolObservation,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const program = goal.state.run.pendingProgram;
        if (program === undefined || goal.state.run.pendingAction !== undefined) {
            throw new Error("PTC_REPLAY_MISMATCH");
        }
        const { pendingProgram: _pendingProgram, ...run } = goal.state.run;
        const settled = this.withRun(goal, {
            ...run,
            stepCount: run.stepCount + 1,
            lastStep: { kind: "action", action: program.action, observation },
        });
        return this.commitDecision(settled, [{
            goalId: goal.id,
            runId: run.id,
            phase: "executing",
            executionUnitId: program.executionUnitId,
            actionId: program.action.actionId,
            eventType: "program_settled",
            payload: {
                type: "program_settled",
                programId: program.programId,
                parentActionId: program.action.actionId,
                outcome: observation.kind,
            },
        }, {
            goalId: goal.id,
            runId: run.id,
            phase: "executing",
            executionUnitId: program.executionUnitId,
            actionId: program.action.actionId,
            eventType: "tool_finished",
            payload: {
                type: "tool_finished",
                actionId: program.action.actionId,
                toolId: program.action.toolId,
                observation,
            },
        }, {
            goalId: goal.id,
            runId: run.id,
            phase: "executing",
            executionUnitId: program.executionUnitId,
            actionId: program.action.actionId,
            eventType: "observation_recorded",
            payload: {
                type: "observation_recorded",
                actionId: program.action.actionId,
                observation,
            },
        }], undefined, control);
    }

    /**
     * 判定一次待执行 Action 是否越过当前工作区权限边界。
     *
     * @remarks
     * 每个待判定 Action 都在决策期重新读取工作区档位。边界内的 Action 直接放行；
     * 越界 Action 在已有匹配的边界豁免时放行，否则按档位的 `approvals` 与 `reviewer`
     * 得到人工裁决或拒绝。档位读取失败向上抛出，不回退默认档位。
     *
     * @param goal - 当前已提交的 Goal。
     * @param validated - 已校验并 canonical 化的待执行 Action。
     * @param control - 共享取消控制。
     * @returns 放行、等待审批或拒绝的判定结果及其实际能力范围。
     * @throws 档位读取失败、能力范围解析失败或取消时抛出。
     */
    private async authorizeToolAction(
        goal: Goal,
        validated: PreparedToolAction,
        control?: ExecutionControl,
    ): Promise<ActionAuthorization> {
        throwIfAborted(control);
        const profile = await this.readPermissionProfile();
        throwIfAborted(control);
        let effectiveSandboxScope: EffectiveSandboxScope;
        try {
            effectiveSandboxScope = await this.deriveEffectiveSandboxScope(validated, control);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            throwIfAborted(control);
            // 能力申请本身被沙箱拒绝（例如 `.lazygoal` 内部状态）时按拒绝边界处理，
            // 不把权限拒绝降级为执行错误。
            return {
                kind: "deny",
                effectiveSandboxScope: { extraFiles: [], network: "none" },
                reason: error instanceof Error ? error.message : String(error),
            };
        }
        throwIfAborted(control);

        // 权限边界以工作区根目录为基准；未绑定工作区时没有可判定的边界。
        if (this.workspaceRoot === undefined) {
            return { kind: "allow", effectiveSandboxScope };
        }

        const action = validated.action;
        const decision = evaluatePermissionBoundary({
            profile,
            request: {
                toolId: action.toolId,
                effectiveScope: effectiveSandboxScope,
                workspaceRoot: this.workspaceRoot,
                ...(action.toolId === "bash"
                    && isRecord(action.input)
                    && typeof action.input.command === "string"
                    ? { destructiveCommand: isDestructiveCommand(action.input.command) }
                    : {}),
            },
        });

        if (decision.kind === "allow") {
            return { kind: "allow", effectiveSandboxScope };
        }

        if (decision.kind === "deny") {
            return { kind: "deny", effectiveSandboxScope, reason: decision.reason };
        }

        if (await this.hasMatchingSandboxGrant(goal, action, effectiveSandboxScope)) {
            return { kind: "allow", effectiveSandboxScope };
        }

        return {
            kind: "approval",
            approvalKind: "sandbox",
            effectiveSandboxScope,
            reason: decision.reason,
        };
    }

    private async readPermissionProfile(): Promise<PermissionProfile> {
        if (this.permissionProfileStore === undefined || this.workspaceId === undefined) {
            return DEFAULT_PERMISSION_PROFILE;
        }
        const current = await this.permissionProfileStore.get(this.workspaceId);
        return current.profile;
    }

    private async deriveEffectiveSandboxScope(
        validated: PreparedToolAction,
        control?: ExecutionControl,
    ): Promise<EffectiveSandboxScope> {
        const rawInput = validated.action.input;
        let sandboxAccessRequest: SandboxAccessRequest | undefined;
        if (typeof validated.resolveSandboxAccess === "function") {
            const derived = await validated.resolveSandboxAccess(control);
            if (derived !== undefined) {
                sandboxAccessRequest = derived;
            }
        } else if (isRecord(rawInput) && isRecord(rawInput.sandboxAccess)) {
            sandboxAccessRequest = rawInput.sandboxAccess as SandboxAccessRequest;
        }

        if (this.workspaceRoot === undefined || sandboxAccessRequest === undefined) {
            return { extraFiles: [], network: "none" };
        }

        return resolveEffectiveSandboxScope(this.workspaceRoot, sandboxAccessRequest);
    }

    private async hasMatchingSandboxGrant(
        goal: Goal,
        action: ToolCallAction,
        effectiveSandboxScope: EffectiveSandboxScope,
    ): Promise<boolean> {
        if (this.sandboxGrantLookup === undefined || this.workspaceId === undefined) {
            return false;
        }
        const matcher = createSandboxGrantMatcher(
            action.toolId,
            action.input,
            effectiveSandboxScope,
        );
        return await this.sandboxGrantLookup.findActiveMatching({
            workspaceId: this.workspaceId,
            goalId: goal.id,
            matcher,
        }) !== undefined;
    }

    /**
     * 以一次失败 Observation 结算被权限边界拒绝的 Action。
     *
     * @remarks
     * 拒绝发生在 Tool 执行之前：调用本方法的路径不会调用 Tool，也不产生
     * `tool_started`、`tool_attempt_started` 或 `tool_finished`。`action_staged` 与
     * `observation_recorded` 在同一提交写入，Observation 的 `code` 为
     * `TOOL_NOT_AUTHORIZED`，Run 保持 running，模型在下一步读取该反馈。
     *
     * @param input - 被拒绝的 Action、实际拒绝依据与同一提交的附加内容。
     * @returns 结算后的 Goal、失败 Observation 与它在 Trajectory 中的序号。
     * @throws 提交失败、PTC 结果额度超限或取消时抛出。
     */
    private async settleDeniedToolAction(input: {
        readonly goal: Goal;
        readonly prepared: PreparedToolAction;
        readonly executionUnitId: string;
        readonly reason: string;
        readonly control?: ExecutionControl | undefined;
        readonly program?: { readonly programId: string; readonly callIndex: number } | undefined;
        readonly batchPatch?: { readonly pendingActionBatch?: PendingActionBatch | undefined } | undefined;
        readonly acceptedPatch?: AcceptedMemoryPatchInput | undefined;
        readonly extraFacts?: readonly TrajectoryEventDraft[] | undefined;
    }): Promise<{
        readonly goal: Goal;
        readonly observation: ToolObservation;
        readonly sourceSequence?: number;
    }> {
        const actionId = input.prepared.action.actionId;
        const association = input.program === undefined
            ? {}
            : { programId: input.program.programId, callIndex: input.program.callIndex };
        const observation: ToolObservation = {
            kind: "failure",
            code: "TOOL_NOT_AUTHORIZED",
            message: input.reason,
            retryable: false,
        };

        let programResultBytes = 0;
        if (input.program !== undefined) {
            const current = input.goal.state.run.pendingProgram;
            if (current === undefined) throw new Error("PTC_REPLAY_MISMATCH");
            programResultBytes = Buffer.byteLength(JSON.stringify(
                createProgramCallEnvelope(observation, 0, undefined),
            ));
            if (programResultBytes > 16 * 1024 * 1024) throw new ProgramResourceError("PTC_FRAME_LIMIT");
            if (current.resultBytes + programResultBytes > 256 * 1024 * 1024) {
                throw new ProgramResourceError("PTC_LOG_LIMIT");
            }
        }

        throwIfAborted(input.control);
        const settleFact: TrajectoryEventDraft = {
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
            phase: "executing",
            executionUnitId: input.executionUnitId,
            actionId,
            ...association,
            eventType: "observation_recorded",
            payload: { type: "observation_recorded", actionId, observation },
        };
        const stagedFact: TrajectoryEventDraft = {
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
            phase: "executing",
            executionUnitId: input.executionUnitId,
            actionId,
            ...association,
            eventType: "action_staged",
            payload: {
                type: "action_staged",
                action: input.prepared.action,
                approvalStatus: "approved",
            },
        };

        const committed = await this.checkpointCommitter.commit(input.goal, {
            facts: [stagedFact, settleFact, ...(input.extraFacts ?? [])],
            ...(input.acceptedPatch === undefined ? {} : { acceptedPatch: input.acceptedPatch }),
            prepare: (latest) => {
                if (latest === undefined || latest.state.run.id !== input.goal.state.run.id) {
                    throw new RunnerExecutionError(
                        "TOOL_EXECUTION_ERROR",
                        "Run disappeared before Observation commit",
                    );
                }
                const staged = this.applyTransition(latest.state.run, {
                    kind: "stage_action",
                    action: input.prepared.action,
                    executionUnitId: input.executionUnitId,
                    status: "approved",
                });
                if (input.program === undefined) {
                    const settled = this.applyTransition(staged, {
                        kind: "observe_action",
                        actionId,
                        observation,
                    });
                    if (input.batchPatch !== undefined) Object.assign(settled, input.batchPatch);
                    return this.withRun(latest, settled);
                }

                const { pendingAction: _pendingAction, ...run } = staged;
                const current = run.pendingProgram;
                if (current?.programId !== input.program.programId
                    || current.nextCallIndex !== input.program.callIndex) {
                    throw new RunnerExecutionError("TOOL_EXECUTION_ERROR", "PTC_REPLAY_MISMATCH");
                }
                return this.withRun(latest, {
                    ...run,
                    pendingProgram: {
                        ...current,
                        nextCallIndex: current.nextCallIndex + 1,
                        resultBytes: current.resultBytes + programResultBytes,
                    },
                });
            },
            ...(input.control === undefined ? {} : { control: input.control }),
        });
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [stagedFact, settleFact]);
        const sourceSequence = committed.events.find((event) =>
            event.eventType === "observation_recorded" && event.actionId === actionId)?.sequence;
        return {
            goal: committed.goal,
            observation,
            ...(sourceSequence === undefined ? {} : { sourceSequence }),
        };
    }

    private formatAskUserQuestions(questions: readonly AskUserQuestion[]): string {
        const blocks: string[] = [];
        for (const q of questions) {
            const lines: string[] = [
                `### ${q.header}`,
                q.question,
                `Options (${q.multiSelect ? "multiple choice" : "single choice"}):`,
            ];
            for (const opt of q.options) {
                const desc = opt.description ? ` - ${opt.description}` : "";
                lines.push(`- [${opt.id}] ${opt.label}${desc}`);
            }
            blocks.push(lines.join("\n"));
        }
        return blocks.join("\n\n");
    }

    private formatTaskProposal(task: GoalTask, approvalRequest: string): string {
        const criteria = task.completionCriteria.length === 0
            ? ["None"]
            : task.completionCriteria.map(
                (criterion, index) => `${index + 1}. ${criterion.text}`,
            );

        return [
            `Objective: ${task.objective}`,
            "Completion criteria:",
            ...criteria,
            `Approval request: ${approvalRequest}`,
        ].join("\n");
    }

    private withRun(goal: Goal, run: RunState): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                run,
            },
        };
    }

    private appendDecisionMessage(
        goal: Goal,
        decision: Exclude<
            AgentDecision,
            { readonly kind: "tool_call" }
                | { readonly kind: "context_lookup" }
                | { readonly kind: "tool_discovery" }
                | { readonly kind: "context_checkpoint" }
                | { readonly kind: "ask_user" }
                | { readonly kind: "task_proposal" }
                | { readonly kind: "goal_plan_update" }
                | { readonly kind: "run_stage_update" }
                | { readonly kind: "run_stage_complete" }
                | { readonly kind: "run_plan_route_update" }
        >,
        candidateId: string,
    ): Goal {
        if (decision.kind === "complete") {
            // 只有 Runtime 真正结算当前 Run 的最终答复才标记为 answer。
            return this.appendAssistantContent(goal, decision.summary, {
                purpose: "answer",
                source: { kind: "completion_candidate", candidateId },
            });
        }
        const content = decision.kind === "wait" ? decision.reason : decision.error;
        return this.appendAssistantContent(goal, content, {
            purpose: "notice",
            source: { kind: "runtime_notice", noticeId: `${decision.kind}:${candidateId}` },
        });
    }

    private appendAssistantContent(
        goal: Goal,
        content: string,
        identity: {
            readonly purpose: AssistantMessagePurpose;
            readonly source: GoalMessageSource;
        },
    ): Goal {
        return appendGoalMessage(goal, {
            role: "assistant",
            content,
            runId: goal.state.run.id,
            purpose: identity.purpose,
            profileId: goal.definition.profile.id,
            source: identity.source,
        }).goal;
    }

    private applyTransition(state: RunState, input: RunInput): RunState {
        const result = transition(state, input);

        if (!result.ok) {
            throw new Error(`Runner invariant violated: ${result.error.message}`);
        }

        return result.state;
    }
}

/**
 * 保持原调度入口的 Run 执行门面。
 *
 * @remarks
 * Runner 将执行推进委派给唯一的 RunExecutor；调用方仍通过原有方法启动或恢复 Run。
 * 恢复读取使用只读 RunRecoveryReader，执行检查点仍由共享提交器管理。
 *
 * @example
 * ```ts
 * const runner = new Runner({ store, executor });
 * await runner.runUntilBlocked({ goalId, runId });
 * ```
 */
export class Runner {
    private readonly executor: RunExecutor;

    /** @param dependencies - GoalStore、Executor 与可选 Tool 边界依赖。 */
    constructor(dependencies: RunnerDependencies) {
        this.executor = new RunExecutor(dependencies);
    }

    /**
     * @deprecated 请使用与 RunScheduler 契约一致的 `runUntilBlocked`。
     */
    run(
        ref: RunRef,
        options: RunExecutionOptions = {},
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        return this.executor.runUntilBlocked(ref, options, control);
    }

    /**
     * 启动或继续一个已保存的 Run，直到等待点或终态。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @param options - 本次调用的瞬时 Action 授权及恢复上下文。
     * @param control - 当前推进调用的取消控制。
     * @returns Run 到达等待点或终态时的结果。
     * @throws 快照/轨迹读取或提交错误、或调用级中止。
     */
    runUntilBlocked(
        ref: RunRef,
        options: RunExecutionOptions = {},
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        return this.executor.runUntilBlocked(ref, options, control);
    }

    /**
     * 按用户命令整理当前 Goal 的工作窗口。
     *
     * @remarks
     * 绑定 Goal 的当前 Epoch，不创建业务 Run，也不写入对话。已进入终态的 Run 仍可追加
     * 上下文事件，保留原终态与 Step 计数；无法推进窗口时返回带原因的稳定结果。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @param control - 当前调用的取消控制。
     * @returns 整理结果与原因。
     * @example
     * ```ts
     * const outcome = await runner.compactContextNow({ goalId: "goal-1", runId: "run-1" });
     * ```
     */
    compactContextNow(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<ContextCompactionCommandOutcome> {
        return this.executor.compactContextNow(ref, control);
    }

    /**
     * 将用户输入持久化受理为当前 Run 的 Steer。
     *
     * @remarks
     * 消息不会中断当前模型调用或工具；执行器在下一模型边界按受理顺序应用。
     * 同一消息身份与正文的重试幂等，身份复用但正文不同会拒绝。
     *
     * @param ref - 目标 Goal 与 Run 的关联身份。
     * @param messageId - 客户端为该次发送分配的稳定身份，同时作为统一输入账本身份。
     * @param content - 非空 Steer 正文。
     * @param ledger - 提供时在同一提交中写入统一输入账本条目。
     * @returns 已持久化受理、幂等重试或稳定拒绝结果。
     * @throws Snapshot 或 Trajectory 保存失败时传播原始错误；失败时不报告受理。
     * @example
     * ```ts
     * const accepted = await runner.steer({ goalId, runId }, "steer-1", "保留当前 API");
     * ```
     */
    steer(
        ref: RunRef,
        messageId: string,
        content: string,
        ledger?: { readonly digest: SessionInputDigest },
    ): Promise<SteerInputResult> {
        return this.executor.steer(ref, messageId, content, ledger);
    }

    /**
     * 受理并中止指定 Run；同一 Run 执行器记录未知工具结果并直接结算取消，不再调用模型。
     *
     * @param ref - Goal 与目标 Run 的稳定身份。
     * @param requestId - 客户端稳定请求身份。
     * @returns 已持久化受理或明确拒绝。
     * @throws Snapshot 或 Trajectory 保存失败时传播原始错误。
     * @example
     * ```ts
     * await runner.interrupt({ goalId, runId }, "interrupt-1");
     * ```
     */
    interrupt(
        ref: RunRef,
        requestId: string,
        ledger?: { readonly digest: SessionInputDigest },
    ): Promise<InterruptRunResult> {
        return this.executor.interrupt(ref, requestId, ledger);
    }
}
