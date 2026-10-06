import type {
    BrowserActionDetailsResult,
    BrowserGoalListItem,
    BrowserGoalPlan,
    BrowserGoalSession,
    BrowserPendingAction,
    BrowserPendingInteraction,
    BrowserPermissionModeResult,
    BrowserRunStatus,
    BrowserSessionRun,
    BrowserToolGrantResult,
    BrowserWorkspaceContext,
    BrowserModelCatalog,
    BrowserTrajectoryDetail,
    BrowserTrajectoryEntry,
    BrowserTrajectoryPage,
    BrowserTrajectoryRun,
    BrowserModelInputDetail,
    BrowserModelInputSummary,
    BrowserGoalLiveEvent,
    BrowserResumeGoalCommand,
    SessionMetricsSnapshot,
} from "./index";

/**
 * 通用对象类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为非空对象且非数组。
 *
 * @example
 * ```ts
 * if (isRecord(val)) console.log(Object.keys(val));
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 非空字符串类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为修剪后长度大于 0 的字符串。
 *
 * @example
 * ```ts
 * if (isNonEmptyString(val)) console.log(val.length);
 * ```
 */
export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * JSON-safe 合法值类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为可被 JSON 序列化的值。
 *
 * @example
 * ```ts
 * if (isJsonValue(val)) JSON.stringify(val);
 * ```
 */
export function isJsonValue(value: unknown): boolean {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isJsonValue);
    return isRecord(value) && Object.values(value).every(isJsonValue);
}

/**
 * Run 生命周期状态类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为合法的 BrowserRunStatus。
 *
 * @example
 * ```ts
 * if (isRunStatus(status)) console.log(status);
 * ```
 */
export function isRunStatus(value: unknown): value is BrowserRunStatus {
    return ["created", "running", "waiting", "completed", "failed", "cancelled"].includes(String(value));
}

/**
 * 成功响应通用守卫（`{ ok: true }`）。
 *
 * @param value - 待检测值。
 * @returns 是否包含 `ok: true`。
 *
 * @example
 * ```ts
 * if (isOkResponse(res)) console.log("Success");
 * ```
 */
export function isOkResponse(value: unknown): value is { readonly ok: true } {
    return isRecord(value) && value.ok === true;
}

/**
 * 受理命令结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为合法的受理事实验证对象。
 *
 * @example
 * ```ts
 * if (isAcceptedCommand(res)) console.log(res.goalId);
 * ```
 */
export function isAcceptedCommand(value: unknown): value is { readonly goalId: string; readonly runId: string; readonly existing: boolean } {
    return isRecord(value)
        && isNonEmptyString(value.goalId)
        && isNonEmptyString(value.runId)
        && typeof value.existing === "boolean";
}

/**
 * Goal 列表项类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserGoalListItem。
 *
 * @example
 * ```ts
 * if (isGoalListItem(item)) console.log(item.goalId);
 * ```
 */
export function isGoalListItem(value: unknown): value is BrowserGoalListItem {
    return isRecord(value)
        && isNonEmptyString(value.goalId)
        && isNonEmptyString(value.runId)
        && typeof value.intent === "string"
        && typeof value.workflowPhase === "string"
        && isRunStatus(value.runStatus)
        && (value.execution === undefined || (
            isRecord(value.execution)
            && ["active", "recoverable", "inactive"].includes(String(value.execution.state))
            && typeof value.execution.committedThroughSequence === "number"
        ))
        && typeof value.archived === "boolean"
        && typeof value.updatedAt === "string";
}

/**
 * Goal 列表响应信封守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为包含 goals 数组的列表响应。
 *
 * @example
 * ```ts
 * if (isGoalList(res)) console.log(res.goals.length);
 * ```
 */
export function isGoalList(value: unknown): value is { readonly goals: readonly BrowserGoalListItem[] } {
    return isRecord(value) && Array.isArray(value.goals) && value.goals.every(isGoalListItem);
}

/**
 * Run 历史条目类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserSessionRun。
 *
 * @example
 * ```ts
 * if (isBrowserRun(run)) console.log(run.runId);
 * ```
 */
export function isBrowserRun(value: unknown): value is BrowserSessionRun {
    return isRecord(value)
        && isNonEmptyString(value.runId)
        && isRunStatus(value.status)
        && Number.isSafeInteger(value.stepCount)
        && Array.isArray(value.steps)
        && value.steps.every((step) => isRecord(step)
            && isNonEmptyString(step.executionUnitId)
            && Number.isSafeInteger(step.sequence)
            && Number.isSafeInteger(step.stepIndex)
            && ["recorded", "completed", "failed", "rejected"].includes(String(step.status))
            && (step.summary === undefined || typeof step.summary === "string")
            && (step.recoveryAttempts === undefined || Array.isArray(step.recoveryAttempts)
                && step.recoveryAttempts.every((attempt) => typeof attempt === "string")))
        && (value.terminalDetail === undefined || isRecord(value.terminalDetail)
            && typeof value.terminalDetail.message === "string"
            && (value.terminalDetail.code === undefined || typeof value.terminalDetail.code === "string"))
        && typeof value.current === "boolean";
}

/**
 * 目标任务计划类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserGoalPlan。
 *
 * @example
 * ```ts
 * if (isGoalPlan(plan)) console.log(plan.revision);
 * ```
 */
export function isGoalPlan(value: unknown): value is BrowserGoalPlan {
    return isRecord(value)
        && Number.isSafeInteger(value.revision)
        && Array.isArray(value.items)
        && value.items.every((item) => isRecord(item)
            && isNonEmptyString(item.id)
            && typeof item.content === "string"
            && Number.isSafeInteger(item.position)
            && ["pending", "in_progress", "completed", "cancelled"].includes(String(item.status)));
}

/**
 * 人工等待交互类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserPendingInteraction。
 *
 * @example
 * ```ts
 * if (isPendingInteraction(pending)) console.log(pending.kind);
 * ```
 */
export function isPendingInteraction(value: unknown): value is BrowserPendingInteraction {
    if (!isRecord(value) || !isNonEmptyString(value.requestId)) return false;
    if (value.kind === "task_approval") {
        return typeof value.objective === "string"
            && typeof value.approvalRequest === "string"
            && Array.isArray(value.completionCriteria)
            && value.completionCriteria.every((item) => typeof item === "string");
    }
    return value.kind === "ask_user"
        && (value.mode === "plan" || value.mode === "execution")
        && Array.isArray(value.questions)
        && value.questions.every((question) => isRecord(question)
            && isNonEmptyString(question.id)
            && typeof question.header === "string"
            && typeof question.question === "string"
            && typeof question.multiSelect === "boolean"
            && Array.isArray(question.options)
            && question.options.every((option) => isRecord(option)
                && isNonEmptyString(option.id)
                && typeof option.label === "string"
                && (option.description === undefined || typeof option.description === "string")));
}

/**
 * 待审 Action 类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserPendingAction。
 *
 * @example
 * ```ts
 * if (isPendingAction(action)) console.log(action.actionId);
 * ```
 */
export function isPendingAction(value: unknown): value is BrowserPendingAction {
    return isRecord(value)
        && isNonEmptyString(value.actionId)
        && isNonEmptyString(value.toolId)
        && ["approved", "awaiting_approval", "outcome_unknown"].includes(String(value.status))
        && typeof value.inputPreview === "string"
        && typeof value.inputPreviewTruncated === "boolean"
        && (value.targetPath === undefined || typeof value.targetPath === "string")
        && (value.inputSummary === undefined || typeof value.inputSummary === "string")
        && (value.parentProgram === undefined || isRecord(value.parentProgram)
            && isNonEmptyString(value.parentProgram.actionId)
            && Number.isSafeInteger(value.parentProgram.callNumber)
            && Number(value.parentProgram.callNumber) > 0);
}

/**
 * 完整 Goal 会话详情类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserGoalSession。
 *
 * @example
 * ```ts
 * if (isBrowserGoalSession(session)) console.log(session.goalId);
 * ```
 */
export function isBrowserGoalSession(value: unknown): value is BrowserGoalSession {
    if (!isRecord(value)
        || !isNonEmptyString(value.goalId)
        || typeof value.intent !== "string"
        || !isNonEmptyString(value.currentRunId)
        || !isRunStatus(value.runStatus)
        || (value.currentRunMode !== "normal" && value.currentRunMode !== "plan")
        || (value.nextRunMode !== undefined && value.nextRunMode !== "plan")
        || !Array.isArray(value.messages)
        || !value.messages.every((message) => isRecord(message)
            && (message.role === "user" || message.role === "assistant")
            && typeof message.content === "string")
        || !Array.isArray(value.runs)
        || !value.runs.every(isBrowserRun)
        || typeof value.historyTruncated !== "boolean") return false;

    if (value.goalPlan !== undefined && !isGoalPlan(value.goalPlan)) return false;
    if (value.execution !== undefined && !(
        isRecord(value.execution)
        && ["active", "recoverable", "inactive"].includes(String(value.execution.state))
        && typeof value.execution.committedThroughSequence === "number"
    )) return false;
    if (value.pendingInteraction !== undefined && !isPendingInteraction(value.pendingInteraction)) return false;
    if (value.pendingAction !== undefined && !isPendingAction(value.pendingAction)) return false;
    return true;
}

/**
 * 会话响应信封守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为包含 goal 的响应对象。
 *
 * @example
 * ```ts
 * if (isGoalSessionEnvelope(res)) console.log(res.goal.goalId);
 * ```
 */
export function isGoalSessionEnvelope(value: unknown): value is { readonly goal: BrowserGoalSession } {
    return isRecord(value) && isBrowserGoalSession(value.goal);
}

/**
 * 模型目录类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserModelCatalog。
 *
 * @example
 * ```ts
 * if (isModelCatalog(catalog)) console.log(catalog.models.length);
 * ```
 */
export function isModelCatalog(value: unknown): value is BrowserModelCatalog {
    return isRecord(value)
        && isNonEmptyString(value.provider)
        && isNonEmptyString(value.currentModelId)
        && (value.defaultModelNotice === undefined || value.defaultModelNotice === "provider_changed" || value.defaultModelNotice === "model_unavailable")
        && Array.isArray(value.models)
        && value.models.every((model) => isRecord(model)
            && isNonEmptyString(model.id)
            && isNonEmptyString(model.displayName)
            && ["live", "catalog", "configured"].includes(String(model.availabilitySource))
            && ["live", "catalog", "configured", "mixed"].includes(String(model.metadataSource))
            && typeof model.selectable === "boolean"
            && (model.contextWindowTokens === undefined || (Number.isSafeInteger(model.contextWindowTokens) && Number(model.contextWindowTokens) > 0))
            && (model.maxOutputTokens === undefined || (Number.isSafeInteger(model.maxOutputTokens) && Number(model.maxOutputTokens) > 0))
            && (model.reasoning === undefined || typeof model.reasoning === "boolean")
            && (model.vision === undefined || typeof model.vision === "boolean")
            && (model.unavailableReason === undefined || typeof model.unavailableReason === "string"));
}

/**
 * 模型选择受理结果类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为模型选择成功受理响应。
 *
 * @example
 * ```ts
 * if (isModelSelectionAccepted(res)) console.log(res.modelId);
 * ```
 */
export function isModelSelectionAccepted(value: unknown): value is { readonly ok: true; readonly modelId: string; readonly defaultModelSaved: boolean } {
    return isRecord(value) && value.ok === true && isNonEmptyString(value.modelId) && typeof value.defaultModelSaved === "boolean";
}

/**
 * 偏好模型设定受理守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为偏好设定成功受理响应。
 *
 * @example
 * ```ts
 * if (isModelPreferenceAccepted(res)) console.log(res.modelId);
 * ```
 */
export function isModelPreferenceAccepted(value: unknown): value is { readonly ok: true; readonly modelId: string } {
    return isRecord(value) && value.ok === true && isNonEmptyString(value.modelId);
}

/**
 * Action 完整输入结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserActionDetailsResult。
 *
 * @example
 * ```ts
 * if (isActionDetailsResult(res)) console.log(res.ok);
 * ```
 */
export function isActionDetailsResult(value: unknown): value is BrowserActionDetailsResult {
    if (!isRecord(value) || typeof value.ok !== "boolean") return false;
    if (!value.ok) return typeof value.error === "string";
    return isNonEmptyString(value.goalId)
        && isNonEmptyString(value.runId)
        && isNonEmptyString(value.actionId)
        && isNonEmptyString(value.toolId)
        && isJsonValue(value.input);
}

/**
 * 工具授权结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserToolGrantResult。
 *
 * @example
 * ```ts
 * if (isToolGrantResult(res)) console.log(res.ok);
 * ```
 */
export function isToolGrantResult(value: unknown): value is BrowserToolGrantResult {
    return isRecord(value)
        && (value.ok === false
            ? typeof value.error === "string"
            : value.ok === true
                && isNonEmptyString(value.goalId)
                && isNonEmptyString(value.runId)
                && Array.isArray(value.grants)
                && value.grants.every((grant) => isRecord(grant)
                    && isNonEmptyString(grant.grantId)
                    && (grant.scope === "goal" || grant.scope === "workspace")
                    && isNonEmptyString(grant.toolId)
                    && ["pending", "active", "revoked"].includes(String(grant.status))
                    && (grant.kind === undefined || grant.kind === "tool" || grant.kind === "sandbox")
                    && (grant.targetPath === undefined || typeof grant.targetPath === "string")
                    && (grant.command === undefined || typeof grant.command === "string")
                    && (grant.network === undefined || grant.network === "none" || grant.network === "all_outbound")
                    && (grant.extraFiles === undefined || (Array.isArray(grant.extraFiles) && grant.extraFiles.every((file) =>
                        isRecord(file)
                            && isNonEmptyString(file.canonicalPath)
                            && (file.access === "read" || file.access === "write")
                            && (file.kind === "file" || file.kind === "directory_tree"))))));
}

/**
 * 权限模式查询/设置结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserPermissionModeResult。
 *
 * @example
 * ```ts
 * if (isPermissionModeResult(res)) console.log(res.ok);
 * ```
 */
export function isPermissionModeResult(value: unknown): value is BrowserPermissionModeResult {
    if (!isRecord(value)) return false;
    if (value.ok === false) return typeof value.error === "string";
    return value.ok === true
        && (value.mode === "default" || value.mode === "yolo")
        && Number.isInteger(value.revision)
        && isNonEmptyString(value.workspaceId);
}

/**
 * 工作区上下文类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserWorkspaceContext。
 *
 * @example
 * ```ts
 * if (isWorkspaceContext(ctx)) console.log(ctx.workspaceRoot);
 * ```
 */
export function isWorkspaceContext(value: unknown): value is BrowserWorkspaceContext {
    return isRecord(value)
        && isNonEmptyString(value.workspaceRoot)
        && (value.worktreeRoot === null || isNonEmptyString(value.worktreeRoot))
        && (value.branch === null || isNonEmptyString(value.branch));
}

/**
 * 实时事件类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserGoalLiveEvent。
 *
 * @example
 * ```ts
 * if (isLiveEvent(evt)) console.log(evt.type);
 * ```
 */
export function isLiveEvent(value: unknown): value is BrowserGoalLiveEvent {
    if (!isRecord(value) || !isNonEmptyString(value.goalId) || !isNonEmptyString(value.runId)) return false;
    if (value.type === "snapshot_changed" || value.type === "refresh_required") return true;
    if (value.type !== "activity" || !isRecord(value.activity)) return false;
    const activity = value.activity;
    if (activity.kind === "assistant_text_delta") {
        return typeof activity.text === "string" && typeof activity.truncated === "boolean";
    }
    return ["model_started", "model_completed", "step_started", "tool_started", "tool_finished"]
        .includes(String(activity.kind));
}

function nullableSequence(value: unknown): boolean {
    return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}

/**
 * 轨迹 Run 投影类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserTrajectoryRun。
 *
 * @example
 * ```ts
 * if (isTrajectoryRun(run)) console.log(run.runId);
 * ```
 */
export function isTrajectoryRun(value: unknown): value is BrowserTrajectoryRun {
    return isRecord(value) && isNonEmptyString(value.runId) && isRunStatus(value.status)
        && typeof value.current === "boolean" && Number.isSafeInteger(value.committedThroughSequence) && Number(value.committedThroughSequence) >= 0;
}

/**
 * 轨迹 Run 列表响应类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否包含 runs 数组与 nextOffset。
 *
 * @example
 * ```ts
 * if (isTrajectoryRuns(res)) console.log(res.runs.length);
 * ```
 */
export function isTrajectoryRuns(value: unknown): value is { runs: BrowserTrajectoryRun[]; nextOffset: number | null } {
    return isRecord(value) && Array.isArray(value.runs) && value.runs.every(isTrajectoryRun) && nullableSequence(value.nextOffset);
}

/**
 * 轨迹事件条目类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserTrajectoryEntry。
 *
 * @example
 * ```ts
 * if (isTrajectoryEntry(entry)) console.log(entry.eventId);
 * ```
 */
export function isTrajectoryEntry(value: unknown): value is BrowserTrajectoryEntry {
    return isRecord(value) && isNonEmptyString(value.eventId) && Number.isSafeInteger(value.sequence) && Number(value.sequence) > 0
        && typeof value.occurredAt === "string" && typeof value.eventType === "string"
        && ["lifecycle", "decision", "memory", "action", "tool", "observation", "terminal", "commit"].includes(String(value.category))
        && [value.inputPreview, value.resultPreview, value.modelCallId].every((field) => field === undefined || typeof field === "string")
        && (value.modelStage === undefined || value.modelStage === "think" || value.modelStage === "decide")
        && typeof value.title === "string" && typeof value.preview === "string" && typeof value.previewTruncated === "boolean"
        && (value.executionUnitId === undefined || isNonEmptyString(value.executionUnitId))
        && (value.stepIndex === undefined || Number.isSafeInteger(value.stepIndex)) && (value.actionId === undefined || isNonEmptyString(value.actionId))
        && (value.programId === undefined || isNonEmptyString(value.programId))
        && (value.callIndex === undefined || (Number.isSafeInteger(value.callIndex) && Number(value.callIndex) >= 0))
        && (value.parentActionId === undefined || isNonEmptyString(value.parentActionId));
}

/**
 * 轨迹查询页响应守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserTrajectoryPage。
 *
 * @example
 * ```ts
 * if (isTrajectoryPage(page)) console.log(page.total);
 * ```
 */
export function isTrajectoryPage(value: unknown): value is BrowserTrajectoryPage {
    return isRecord(value) && isNonEmptyString(value.goalId) && isTrajectoryRun(value.run) && Array.isArray(value.entries)
        && value.entries.every(isTrajectoryEntry) && Number.isSafeInteger(value.total) && Number(value.total) >= 0
        && Number.isSafeInteger(value.committedCount) && Number(value.committedCount) >= 0
        && nullableSequence(value.previousCursor) && nullableSequence(value.nextCursor) && nullableSequence(value.locatedSequence);
}

/**
 * 轨迹事件详情响应守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserTrajectoryDetail。
 *
 * @example
 * ```ts
 * if (isTrajectoryDetail(detail)) console.log(detail.event.eventId);
 * ```
 */
export function isTrajectoryDetail(value: unknown): value is BrowserTrajectoryDetail {
    return isRecord(value) && isRecord(value.event) && value.event.eventSchemaVersion === 1
        && isNonEmptyString(value.event.eventId) && isNonEmptyString(value.event.goalId) && isNonEmptyString(value.event.runId)
        && Number.isSafeInteger(value.event.sequence) && Number(value.event.sequence) > 0 && typeof value.event.occurredAt === "string"
        && value.event.phase === "executing" && typeof value.event.eventType === "string" && isRecord(value.event.payload) && value.event.eventType === value.event.payload.type
        && typeof value.observationConfirmed === "boolean" && (value.toolDurationMs === null || (typeof value.toolDurationMs === "number" && Number.isFinite(value.toolDurationMs) && value.toolDurationMs >= 0))
        && (value.toolStartedAt === undefined || typeof value.toolStartedAt === "string") && (value.toolFinishedAt === undefined || typeof value.toolFinishedAt === "string")
        && (value.result === undefined || isRecord(value.result)) && (value.toolFinished === undefined || (isRecord(value.toolFinished)
            && value.toolFinished.eventType === "tool_finished" && isRecord(value.toolFinished.payload) && isRecord(value.toolFinished.payload.observation)));
}

function isInputIdentity(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && isNonEmptyString(value.callId) && isNonEmptyString(value.goalId) && isNonEmptyString(value.runId)
        && (value.stage === "think" || value.stage === "decide" || value.stage === "completion_review") && Number.isSafeInteger(value.stepIndex) && Number(value.stepIndex) > 0
        && typeof value.occurredAt === "string" && (value.executionUnitId === undefined || isNonEmptyString(value.executionUnitId));
}

function isInputMessage(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && ["system", "user", "assistant", "tool"].includes(String(value.role))
        && ["system", "conversation", "section", "working_context", "stage", "request", "native_history"].includes(String(value.source));
}

/**
 * 模型输入列表响应类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否包含 calls 数组、total 及 nextOffset。
 *
 * @example
 * ```ts
 * if (isModelInputs(inputs)) console.log(inputs.calls.length);
 * ```
 */
export function isModelInputs(value: unknown): value is { calls: BrowserModelInputSummary[]; total: number; nextOffset: number | null } {
    return isRecord(value) && nullableSequence(value.nextOffset) && Number.isSafeInteger(value.total) && Number(value.total) >= 0 && Array.isArray(value.calls)
        && value.calls.every((call) => isInputIdentity(call) && typeof call.systemVersion === "string" && typeof call.systemChanged === "boolean" && typeof call.firstSystem === "boolean"
            && (call.previousCallId === null || isNonEmptyString(call.previousCallId)) && Number.isSafeInteger(call.omittedMessageCount) && Number(call.omittedMessageCount) >= 0
            && Array.isArray(call.messages) && call.messages.every((message) => isInputMessage(message) && typeof message.preview === "string" && typeof message.truncated === "boolean" && Number.isSafeInteger(message.index) && Number(message.index) >= 0));
}

/**
 * 模型输入详情响应类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserModelInputDetail。
 *
 * @example
 * ```ts
 * if (isModelInputDetail(detail)) console.log(detail.call.callId);
 * ```
 */
export function isModelInputDetail(value: unknown): value is BrowserModelInputDetail {
    return isRecord(value) && isInputIdentity(value.call) && Array.isArray(value.call.messages) && value.call.messages.every((message) => isInputMessage(message) && typeof message.content === "string")
        && (value.previousSystem === null || typeof value.previousSystem === "string") && (value.previousCallId === null || isNonEmptyString(value.previousCallId)) && typeof value.systemVersion === "string";
}

/**
 * 会话指标数值项类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否满足指标数值规范。
 *
 * @example
 * ```ts
 * if (isMetricValues(vals)) console.log(vals.stepCount);
 * ```
 */
export function isMetricValues(value: Record<string, unknown>): boolean {
    const count = (item: unknown) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0;
    const optionalNumber = (item: unknown) => item === null || (typeof item === "number" && Number.isFinite(item) && item >= 0);
    return count(value.stepCount)
        && count(value.reportedCalls)
        && count(value.missingCalls)
        && optionalNumber(value.inputTokens)
        && optionalNumber(value.outputTokens)
        && ["complete", "partial", "unavailable"].includes(String(value.coverage))
        && count(value.cacheMeasuredCalls)
        && count(value.cacheExcludedCalls)
        && optionalNumber(value.cacheHitRate)
        && (value.cacheHitRate === null || Number(value.cacheHitRate) <= 1)
        && count(value.throughputMeasuredCalls)
        && count(value.throughputExcludedCalls)
        && optionalNumber(value.tokensPerSecond);
}

/**
 * 会话指标聚合快照类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 SessionMetricsSnapshot。
 *
 * @example
 * ```ts
 * if (isMetricsSnapshot(snapshot)) console.log(snapshot.goalId);
 * ```
 */
export function isMetricsSnapshot(value: unknown): value is SessionMetricsSnapshot {
    return isRecord(value)
        && isNonEmptyString(value.goalId)
        && isMetricValues(value)
        && (value.contextRemainingPercent === undefined || value.contextRemainingPercent === null || (typeof value.contextRemainingPercent === "number" && Number.isFinite(value.contextRemainingPercent) && value.contextRemainingPercent >= 0 && value.contextRemainingPercent <= 1))
        && Number.isInteger(value.roundCount)
        && Array.isArray(value.runs)
        && value.runs.every((run) => isRecord(run) && isNonEmptyString(run.runId) && isMetricValues(run));
}

/**
 * 显式恢复命令类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserResumeGoalCommand。
 *
 * @example
 * ```ts
 * if (isResumeGoalCommand(cmd)) console.log(cmd.runId);
 * ```
 */
export function isResumeGoalCommand(value: unknown): value is BrowserResumeGoalCommand {
    return isRecord(value)
        && isNonEmptyString(value.runId)
        && typeof value.expectedCommittedThroughSequence === "number"
        && Number.isSafeInteger(value.expectedCommittedThroughSequence)
        && value.expectedCommittedThroughSequence >= 0;
}
