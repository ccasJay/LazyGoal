import type {
    ExecutingWorkingMemoryPatch,
} from "../../contracts/src/index";
import type {
    AgentProfile,
    CompletionAcceptance,
    CompletionCriterion,
    CompletedRunRecord,
    Goal,
    GoalPlan,
    GoalPlanItem,
    GoalPlanPatchOperation,
    GoalMessage,
    GoalModelSelection,
    GoalTask,
    GoalWorkflowState,
    Observation,
    PendingAction,
    PendingInteraction,
    StepRecord,
    ToolCallAction,
} from "../../runtime/src/index";
import {
    GoalSnapshotProtocolError,
    GoalSnapshotV1Schema,
    type GoalSnapshotCompletionAcceptanceV1,
    type GoalSnapshotCompletionCriterionV1,
    type GoalSnapshotCompletedRunV1,
    type GoalSnapshotDecisionResultV1,
    type GoalSnapshotGoalPlanItemV1,
    type GoalSnapshotGoalPlanPatchOperationV1,
    type GoalSnapshotGoalPlanV1,
    type GoalSnapshotMessageV1,
    type GoalSnapshotModelSelectionV1,
    type GoalSnapshotObservationV1,
    type GoalSnapshotPendingActionV1,
    type GoalSnapshotPendingInteractionV1,
    type GoalSnapshotProfileV1,
    type GoalSnapshotStepRecordV1,
    type GoalSnapshotTaskV1,
    type GoalSnapshotToolCallActionV1,
    type GoalSnapshotV1,
    type GoalSnapshotWorkflowV1,
} from "./goal-snapshot";

/**
 * Runtime Goal 与当前 Goal Snapshot v1 之间的双向转换边界。
 *
 * @remarks
 * Codec 只接受当前 Snapshot schemaVersion 1。历史快照、未知版本和非法结构
 * 会立即失败；decode 不执行迁移、删除或写回。编码和解码均深复制边界数据，
 * 防止 Runtime 对象与 DTO 共享可变引用。
 *
 * @example
 * ```ts
 * const snapshot = goalSnapshotCodec.encode(goal);
 * const restored = goalSnapshotCodec.decode(snapshot);
 * ```
 */
export interface GoalSnapshotCodec {
    /**
     * @param goal - 完整的 Runtime Goal 聚合。
     * @returns 通过当前 v1 Schema 与跨字段校验的 Snapshot DTO。
     * @throws GoalSnapshotProtocolError 当 Goal 不符合当前快照协议时抛出。
     */
    encode(goal: Goal): GoalSnapshotV1;

    /**
     * @param input - 已解析的 Snapshot JSON 值。
     * @returns 与输入隔离的 Runtime Goal。
     * @throws GoalSnapshotProtocolError 当版本或结构不受支持时抛出；不会产生 I/O。
     */
    decode(input: unknown): Goal;
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
}

function readSchemaVersion(input: unknown): unknown {
    if (!isRecord(input) || !isRecord(input.metadata)) {
        return undefined;
    }

    return input.metadata.schemaVersion;
}

function protocolError(message: string, cause?: unknown): GoalSnapshotProtocolError {
    return new GoalSnapshotProtocolError(message, cause === undefined
        ? undefined
        : { cause } as ErrorOptions);
}

function encodeProfile(profile: AgentProfile): GoalSnapshotProfileV1 {
    return {
        id: profile.id,
        ...(profile.name === undefined ? {} : { name: profile.name }),
        ...(profile.description === undefined ? {} : { description: profile.description }),
        systemPrompt: profile.systemPrompt,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };
}

function encodeAcceptance(
    acceptance: CompletionAcceptance,
): GoalSnapshotCompletionAcceptanceV1 {
    return {
        expectToolId: acceptance.expectToolId,
        expectOutcome: acceptance.expectOutcome,
    };
}

function encodeCriterion(criterion: CompletionCriterion): GoalSnapshotCompletionCriterionV1 {
    return {
        text: criterion.text,
        ...(criterion.acceptance === undefined
            ? {}
            : { acceptance: encodeAcceptance(criterion.acceptance) }),
    };
}

function encodeTask(task: GoalTask): GoalSnapshotTaskV1 {
    return {
        objective: task.objective,
        completionCriteria: task.completionCriteria.map(encodeCriterion),
    };
}

function encodeWorkflow(workflow: GoalWorkflowState): GoalSnapshotWorkflowV1 {
    return { phase: workflow.phase };
}

function encodePendingInteraction(
    interaction: PendingInteraction,
): GoalSnapshotPendingInteractionV1 {
    switch (interaction.kind) {
        case "ask_user":
            return {
                kind: "ask_user",
                requestId: interaction.requestId,
                mode: interaction.mode,
                questions: interaction.questions.map((q) => ({
                    id: q.id,
                    header: q.header,
                    question: q.question,
                    options: q.options.map((opt) => ({
                        id: opt.id,
                        label: opt.label,
                        ...(opt.description === undefined ? {} : { description: opt.description }),
                    })),
                    multiSelect: q.multiSelect,
                })),
            };
        case "task_approval":
            return {
                kind: "task_approval",
                proposal: encodeTask(interaction.proposal),
                approvalRequest: interaction.approvalRequest,
                ...(interaction.requestId === undefined ? {} : { requestId: interaction.requestId }),
            };
    }
}

function encodeAction(action: ToolCallAction): GoalSnapshotToolCallActionV1 {
    return {
        actionId: action.actionId,
        toolId: action.toolId,
        input: structuredClone(action.input),
    };
}

function encodeObservation(observation: Observation): GoalSnapshotObservationV1 {
    switch (observation.kind) {
        case "success":
            return {
                kind: "success",
                output: structuredClone(observation.output),
                summary: observation.summary,
            };
        case "failure":
            return {
                kind: "failure",
                code: observation.code,
                message: observation.message,
                retryable: observation.retryable,
            };
        case "rejected":
            return { kind: "rejected", reason: observation.reason };
    }
}

function encodeDecision(result: Exclude<StepRecord, { readonly kind: "action" }> ["result"]): GoalSnapshotDecisionResultV1 {
    switch (result.kind) {
        case "complete":
            return {
                kind: "complete",
                summary: result.summary,
                ...( "completionEvidence" in result
                    ? {
                        completionEvidence: result.completionEvidence.map((evidence) => ({
                            criterionIndex: evidence.criterionIndex,
                            evidenceSequences: [...evidence.evidenceSequences],
                        })),
                    }
                    : { evidenceSequences: [...result.evidenceSequences] }),
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) }),
            };
        case "wait":
            return {
                kind: "wait",
                reason: result.reason,
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) }),
            };
        case "fail":
            return {
                kind: "fail",
                error: result.error,
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) }),
            };
        case "context_lookup":
            return {
                kind: "context_lookup",
                need: result.need,
                question: result.question,
                ...(result.filters === undefined
                    ? {}
                    : { filters: structuredClone(result.filters) }),
            };
        case "goal_plan_update":
            return {
                kind: "goal_plan_update",
                baseRevision: result.baseRevision,
                operations: result.operations.map(encodeGoalPlanOperation),
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) }),
            };
    }
}

function encodeStep(step: StepRecord): GoalSnapshotStepRecordV1 {
    return step.kind === "action"
        ? {
            kind: "action",
            action: encodeAction(step.action),
            observation: encodeObservation(step.observation),
        }
        : { kind: "decision", result: encodeDecision(step.result) };
}

function encodeMessage(message: GoalMessage): GoalSnapshotMessageV1 {
    return message.role === "user"
        ? { role: "user", content: message.content }
        : {
            role: "assistant",
            assistant: { profileId: message.assistant.profileId },
            content: message.content,
        };
}

function encodeModelSelection(selection: GoalModelSelection): GoalSnapshotModelSelectionV1 {
    return {
        provider: selection.provider,
        modelId: selection.modelId,
        ...(selection.structuredOutputMode !== undefined ? { structuredOutputMode: selection.structuredOutputMode } : {}),
        ...(selection.contextWindowTokens !== undefined ? { contextWindowTokens: selection.contextWindowTokens } : {}),
        ...(selection.maxOutputTokens !== undefined ? { maxOutputTokens: selection.maxOutputTokens } : {}),
        inputEstimator: selection.inputEstimator.kind === "character-v1"
            ? { kind: "character-v1" }
            : { kind: "token-encoding", encoding: selection.inputEstimator.encoding },
    };
}

function encodeGoalPlanItem(item: GoalPlanItem): GoalSnapshotGoalPlanItemV1 {
    return {
        id: item.id,
        content: item.content,
        position: item.position,
        status: item.status,
    };
}

function encodeGoalPlanOperation(
    operation: GoalPlanPatchOperation,
): GoalSnapshotGoalPlanPatchOperationV1 {
    switch (operation.type) {
        case "add":
            return {
                type: "add",
                content: operation.content,
                ...(operation.position === undefined ? {} : { position: operation.position }),
            };
        case "update":
            return {
                type: "update",
                id: operation.id,
                ...(operation.content === undefined ? {} : { content: operation.content }),
                ...(operation.status === undefined ? {} : { status: operation.status }),
            };
        case "reorder":
            return { type: "reorder", id: operation.id, position: operation.position };
        case "cancel":
            return { type: "cancel", id: operation.id };
    }
}

function encodeGoalPlan(plan: GoalPlan): GoalSnapshotGoalPlanV1 {
    return {
        revision: plan.revision,
        items: plan.items.map(encodeGoalPlanItem),
    };
}

function encodeCompletedRun(record: CompletedRunRecord): GoalSnapshotCompletedRunV1 {
    return {
        runId: record.runId,
        stepCount: record.stepCount,
        committedThroughSequence: record.committedThroughSequence,
        messageRange: { ...record.messageRange },
    };
}

function encodeSnapshot(goal: Goal): GoalSnapshotV1 {
    if (
        goal.definition.promptBundleVersion !== 1
        || goal.definition.memoryProtocol.kind !== "structured"
        || goal.definition.memoryProtocol.version !== 1
        || goal.definition.modelContextProtocol.kind !== "trajectory-layered"
        || goal.definition.modelContextProtocol.version !== 1
        || goal.definition.contextRetrievalProtocol.kind !== "bm25-lite"
        || goal.definition.contextRetrievalProtocol.version !== 1
    ) {
        throw protocolError("Goal definition uses an unsupported current protocol combination");
    }

    const run = goal.state.run;
    if (run.committedThroughSequence === undefined || run.contextEpoch === undefined) {
        throw protocolError("Goal Run is missing current recovery state");
    }

    const candidate = {
        id: goal.id,
        metadata: { schemaVersion: 1 as const },
        definition: {
            intent: goal.definition.intent,
            promptBundleVersion: 1 as const,
            memoryProtocol: { kind: "structured" as const, version: 1 as const },
            modelContextProtocol: {
                kind: "trajectory-layered" as const,
                version: 1 as const,
            },
            contextRetrievalProtocol: {
                kind: "bm25-lite" as const,
                version: 1 as const,
            },
            profile: encodeProfile(goal.definition.profile),
            executionPolicy: { maxSteps: goal.definition.executionPolicy.maxSteps },
        },
        state: {
            ...(goal.state.nextRunMode === undefined ? {} : { nextRunMode: goal.state.nextRunMode }),
            workflow: encodeWorkflow(goal.state.workflow),
            messages: goal.state.messages.map(encodeMessage),
            run: {
                id: run.id,
                mode: run.mode,
                ...(run.approvedTask === undefined ? {} : { approvedTask: encodeTask(run.approvedTask) }),
                status: run.status,
                stepCount: run.stepCount,
                committedThroughSequence: run.committedThroughSequence,
                ...(run.memoryRevision === undefined
                    ? {}
                    : {
                        memoryRevision: {
                            eventId: run.memoryRevision.eventId,
                            sequence: run.memoryRevision.sequence,
                        },
                    }),
                ...(run.lastStep === undefined ? {} : { lastStep: encodeStep(run.lastStep) }),
                ...(run.pendingAction === undefined
                    ? {}
                    : {
                        pendingAction: {
                            action: encodeAction(run.pendingAction.action),
                            status: run.pendingAction.status,
                        },
                    }),
                ...(run.pendingInteraction === undefined
                    ? {}
                    : { pendingInteraction: encodePendingInteraction(run.pendingInteraction) }),
                ...(run.stopReason === undefined ? {} : { stopReason: structuredClone(run.stopReason) }),
                contextEpoch: structuredClone(run.contextEpoch),
            },
            modelSelection: encodeModelSelection(goal.state.modelSelection),
            ...(goal.state.goalPlan === undefined ? {} : { goalPlan: encodeGoalPlan(goal.state.goalPlan) }),
            completedRuns: (goal.state.completedRuns ?? []).map(encodeCompletedRun),
        },
    };

    const validation = GoalSnapshotV1Schema.safeParse(candidate);
    if (!validation.success) {
        throw protocolError("Goal does not satisfy the current snapshot schema", validation.error);
    }

    return structuredClone(validation.data) as GoalSnapshotV1;
}

function decodeProfile(profile: GoalSnapshotProfileV1): AgentProfile {
    return {
        id: profile.id,
        ...(profile.name === undefined ? {} : { name: profile.name }),
        ...(profile.description === undefined ? {} : { description: profile.description }),
        systemPrompt: profile.systemPrompt,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };
}

function decodeAcceptance(
    acceptance: GoalSnapshotCompletionAcceptanceV1,
): CompletionAcceptance {
    return {
        expectToolId: acceptance.expectToolId,
        expectOutcome: acceptance.expectOutcome,
    };
}

function decodeCriterion(
    criterion: GoalSnapshotCompletionCriterionV1,
): CompletionCriterion {
    return {
        text: criterion.text,
        ...(criterion.acceptance === undefined
            ? {}
            : { acceptance: decodeAcceptance(criterion.acceptance) }),
    };
}

function decodeTask(task: GoalSnapshotTaskV1): GoalTask {
    return {
        objective: task.objective,
        completionCriteria: task.completionCriteria.map(decodeCriterion),
    };
}

function decodeWorkflow(workflow: GoalSnapshotWorkflowV1): GoalWorkflowState {
    return { phase: workflow.phase };
}

function decodePendingInteraction(
    interaction: GoalSnapshotPendingInteractionV1,
): PendingInteraction {
    switch (interaction.kind) {
        case "ask_user":
            return {
                kind: "ask_user",
                requestId: interaction.requestId,
                mode: interaction.mode,
                questions: interaction.questions.map((q) => ({
                    id: q.id,
                    header: q.header,
                    question: q.question,
                    options: q.options.map((opt) => ({
                        id: opt.id,
                        label: opt.label,
                        ...(opt.description === undefined ? {} : { description: opt.description }),
                    })),
                    multiSelect: q.multiSelect,
                })),
            };
        case "task_approval":
            return {
                kind: "task_approval",
                proposal: decodeTask(interaction.proposal),
                approvalRequest: interaction.approvalRequest,
                ...(interaction.requestId === undefined ? {} : { requestId: interaction.requestId }),
            };
    }
}

function decodeAction(action: GoalSnapshotToolCallActionV1): ToolCallAction {
    return {
        actionId: action.actionId,
        toolId: action.toolId,
        input: structuredClone(action.input),
    };
}

function decodeObservation(observation: GoalSnapshotObservationV1): Observation {
    switch (observation.kind) {
        case "success":
            return {
                kind: "success",
                output: structuredClone(observation.output),
                summary: observation.summary,
            };
        case "failure":
            return {
                kind: "failure",
                code: observation.code,
                message: observation.message,
                retryable: observation.retryable,
            };
        case "rejected":
            return { kind: "rejected", reason: observation.reason };
    }
}

function decodeDecision(result: GoalSnapshotDecisionResultV1): Exclude<StepRecord, { readonly kind: "action" }> ["result"] {
    switch (result.kind) {
        case "complete":
            return {
                kind: "complete",
                summary: result.summary,
                ...( "completionEvidence" in result
                    ? {
                        completionEvidence: result.completionEvidence.map((evidence) => ({
                            criterionIndex: evidence.criterionIndex,
                            evidenceSequences: [...evidence.evidenceSequences],
                        })),
                    }
                    : { evidenceSequences: [...result.evidenceSequences] }),
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) as ExecutingWorkingMemoryPatch }),
            };
        case "wait":
            return {
                kind: "wait",
                reason: result.reason,
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) as ExecutingWorkingMemoryPatch }),
            };
        case "fail":
            return {
                kind: "fail",
                error: result.error,
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) as ExecutingWorkingMemoryPatch }),
            };
        case "context_lookup":
            return {
                kind: "context_lookup",
                need: result.need,
                question: result.question,
                ...(result.filters === undefined
                    ? {}
                    : { filters: structuredClone(result.filters) }),
            };
        case "goal_plan_update":
            return {
                kind: "goal_plan_update",
                baseRevision: result.baseRevision,
                operations: result.operations.map((operation) => ({
                    ...operation,
                })) as GoalPlanPatchOperation[],
                ...(result.memoryPatch === undefined
                    ? {}
                    : { memoryPatch: structuredClone(result.memoryPatch) as ExecutingWorkingMemoryPatch }),
            };
    }
}

function decodeStep(step: GoalSnapshotStepRecordV1): StepRecord {
    return step.kind === "action"
        ? {
            kind: "action",
            action: decodeAction(step.action),
            observation: decodeObservation(step.observation),
        }
        : { kind: "decision", result: decodeDecision(step.result) };
}

function decodePendingAction(pendingAction: GoalSnapshotPendingActionV1): PendingAction {
    return {
        action: decodeAction(pendingAction.action),
        status: pendingAction.status,
    };
}

function decodeModelSelection(selection: GoalSnapshotModelSelectionV1): GoalModelSelection {
    return {
        provider: selection.provider,
        modelId: selection.modelId,
        ...(selection.structuredOutputMode !== undefined ? { structuredOutputMode: selection.structuredOutputMode } : {}),
        ...(selection.contextWindowTokens !== undefined ? { contextWindowTokens: selection.contextWindowTokens } : {}),
        ...(selection.maxOutputTokens !== undefined ? { maxOutputTokens: selection.maxOutputTokens } : {}),
        inputEstimator: selection.inputEstimator.kind === "character-v1"
            ? { kind: "character-v1" }
            : { kind: "token-encoding", encoding: selection.inputEstimator.encoding },
    };
}

function decodeGoalPlanItem(item: GoalSnapshotGoalPlanItemV1): GoalPlanItem {
    return {
        id: item.id,
        content: item.content,
        position: item.position,
        status: item.status,
    };
}

function decodeGoalPlan(plan: GoalSnapshotGoalPlanV1): GoalPlan {
    return {
        revision: plan.revision,
        items: plan.items.map(decodeGoalPlanItem),
    };
}

function decodeCompletedRun(record: GoalSnapshotCompletedRunV1): CompletedRunRecord {
    return {
        runId: record.runId,
        stepCount: record.stepCount,
        committedThroughSequence: record.committedThroughSequence,
        messageRange: { ...record.messageRange },
    };
}

function decodeSnapshot(snapshot: GoalSnapshotV1): Goal {
    const run = snapshot.state.run;
    return {
        id: snapshot.id,
        definition: {
            intent: snapshot.definition.intent,
            promptBundleVersion: 1,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
            profile: decodeProfile(snapshot.definition.profile),
            executionPolicy: { maxSteps: snapshot.definition.executionPolicy.maxSteps },
        },
        state: {
            ...(snapshot.state.nextRunMode === undefined ? {} : { nextRunMode: snapshot.state.nextRunMode }),
            workflow: decodeWorkflow(snapshot.state.workflow),
            messages: snapshot.state.messages.map((message): GoalMessage =>
                message.role === "user"
                    ? { role: "user", content: message.content }
                    : {
                        role: "assistant",
                        assistant: { profileId: message.assistant.profileId },
                        content: message.content,
                    }
            ),
            run: {
                id: run.id,
                mode: run.mode,
                ...(run.approvedTask === undefined ? {} : { approvedTask: decodeTask(run.approvedTask) }),
                status: run.status,
                stepCount: run.stepCount,
                committedThroughSequence: run.committedThroughSequence,
                ...(run.memoryRevision === undefined
                    ? {}
                    : {
                        memoryRevision: {
                            eventId: run.memoryRevision.eventId,
                            sequence: run.memoryRevision.sequence,
                        },
                    }),
                ...(run.lastStep === undefined ? {} : { lastStep: decodeStep(run.lastStep) }),
                ...(run.pendingAction === undefined
                    ? {}
                    : { pendingAction: decodePendingAction(run.pendingAction) }),
                ...(run.pendingInteraction === undefined
                    ? {}
                    : { pendingInteraction: decodePendingInteraction(run.pendingInteraction) }),
                ...(run.stopReason === undefined ? {} : { stopReason: structuredClone(run.stopReason) }),
                contextEpoch: structuredClone(run.contextEpoch),
            },
            modelSelection: decodeModelSelection(snapshot.state.modelSelection),
            ...(snapshot.state.goalPlan === undefined ? {} : { goalPlan: decodeGoalPlan(snapshot.state.goalPlan) }),
            completedRuns: snapshot.state.completedRuns.map(decodeCompletedRun),
        },
    };
}

/**
 * 检查快照中是否残留旧版 Preparation 工作流并给出明确错误。
 *
 * @remarks
 * 移除独立 preparation phase 后，旧的 `gathering_context`、`planning` 阶段
 * 以及旧的 `preparation` 对象均不再支持，fail-closed 拒绝并指引重建。
 */
function assertNoLegacyPreparationWorkflow(input: unknown): void {
    if (!isRecord(input) || !isRecord(input.state) || !isRecord(input.state.workflow)) {
        return;
    }

    const workflow = input.state.workflow;
    if (
        workflow.phase === "gathering_context"
        || workflow.phase === "planning"
        || "preparation" in workflow
    ) {
        throw protocolError(
            "Invalid Goal snapshot: legacy preparation workflows are no longer supported; delete and recreate the Goal",
        );
    }
}

/**
 * 检查快照中是否残留旧版 `string[]` 完成条件并给出明确错误。
 *
 * @remarks
 * 开发期不保证旧快照兼容；旧形态 criteria 无法安全读取时必须 fail fast，
 * 指引用户删除或重建 Goal 而不是猜测迁移。
 */
function assertNoLegacyStringCriteria(input: unknown): void {
    if (!isRecord(input) || !isRecord(input.state)) {
        return;
    }

    const workflowTask = isRecord(input.state.workflow) ? input.state.workflow.task : undefined;
    const runTask = isRecord(input.state.run) ? input.state.run.approvedTask : undefined;
    const pending = isRecord(input.state.run) && isRecord(input.state.run.pendingInteraction)
        ? input.state.run.pendingInteraction
        : undefined;
    const pendingTask = pending?.kind === "task_approval" && isRecord(pending.proposal)
        ? pending.proposal
        : undefined;
    for (const task of [workflowTask, runTask, pendingTask]) {
        if (isRecord(task) && Array.isArray(task.completionCriteria)
            && task.completionCriteria.some((criterion) => typeof criterion === "string")) {
            throw protocolError(
                "Invalid Goal snapshot: legacy string completionCriteria are no longer supported; delete and recreate the Goal",
            );
        }
    }
}

/** 拒绝已迁移出当前 Snapshot 契约的 Goal 级模式与 Todo/Run 绑定字段。 */
function assertNoLegacyRunAndTodoBindings(input: unknown): void {
    if (!isRecord(input) || !isRecord(input.state)) return;
    const state = input.state;
    if ("mode" in state) {
        throw protocolError(
            "Invalid Goal snapshot: Goal-level mode is no longer supported; store mode on state.run",
        );
    }
    if (isRecord(state.workflow) && "task" in state.workflow) {
        throw protocolError(
            "Invalid Goal snapshot: workflow.task is no longer supported; store an approved task on state.run",
        );
    }
    if (isRecord(state.run) && "todoId" in state.run) {
        throw protocolError(
            "Invalid Goal snapshot: Run-to-Todo binding is no longer supported",
        );
    }
    if (isRecord(state.goalPlan) && Array.isArray(state.goalPlan.items)) {
        if (state.goalPlan.items.some((item) => isRecord(item) && "activeRunId" in item)) {
            throw protocolError(
                "Invalid Goal snapshot: GoalPlan items cannot persist activeRunId",
            );
        }
    }
    if (Array.isArray(state.completedRuns)) {
        if (state.completedRuns.some((run) => isRecord(run) && "todoId" in run)) {
            throw protocolError(
                "Invalid Goal snapshot: completed Runs cannot persist Todo bindings",
            );
        }
    }
}

/** 共享的无状态 Codec 实例。 */
export const goalSnapshotCodec: GoalSnapshotCodec = new (class implements GoalSnapshotCodec {
    encode(goal: Goal): GoalSnapshotV1 {
        return encodeSnapshot(goal);
    }

    decode(input: unknown): Goal {
        const schemaVersion = readSchemaVersion(input);
        if (schemaVersion !== 1) {
            throw protocolError(
                `Invalid Goal snapshot: unsupported schemaVersion ${String(schemaVersion)}`,
            );
        }

        assertNoLegacyPreparationWorkflow(input);
        assertNoLegacyStringCriteria(input);
        assertNoLegacyRunAndTodoBindings(input);

        const validation = GoalSnapshotV1Schema.safeParse(input);
        if (!validation.success) {
            throw protocolError("Invalid Goal snapshot", validation.error);
        }

        return decodeSnapshot(structuredClone(validation.data) as GoalSnapshotV1);
    }
});

/** 便于需要显式类实例的调用方使用的 Codec 实现。 */
export class DefaultGoalSnapshotCodec implements GoalSnapshotCodec {
    encode(goal: Goal): GoalSnapshotV1 {
        return encodeSnapshot(goal);
    }

    decode(input: unknown): Goal {
        return goalSnapshotCodec.decode(input);
    }
}
