import type {
    BrowserActionDetailsResult,
    BrowserJsonValue,
    BrowserActionReviewResult,
    BrowserGoalListItem,
    BrowserGoalList,
    BrowserInteractionDetailResult,
    BrowserInteractionView,
    BrowserGoalPlan,
    BrowserGoalSession,
    BrowserGoalSessionState,
    BrowserActivityPage,
    BrowserActivityPosition,
    BrowserActivityGap,
    BrowserPendingAction,
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
    BrowserCreateSessionResult,
    BrowserSessionInputQueryResult,
    BrowserSessionInputReceipt,
    BrowserSessionInputResult,
    BrowserSessionState,
    SessionMetricsSnapshot,
    BrowserProviderProfile,
    BrowserProviderSettings,
    BrowserProviderProfileWriteResult,
    BrowserProviderProfileDeleteResult,
    BrowserProviderProfileActivationResult,
    BrowserProviderProfileTestResult,
} from "./index";
import { BROWSER_ACTIVITY_EVENT_TYPES } from "./activity";

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

function isMessagePosition(value: unknown): value is { readonly afterSequence: number; readonly order: number } {
    return isRecord(value)
        && Number.isSafeInteger(value.afterSequence) && Number(value.afterSequence) >= 0
        && Number.isSafeInteger(value.order) && Number(value.order) >= 0;
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
export function isJsonValue(value: unknown): value is BrowserJsonValue {
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
 * 验证 inputs 路由返回的持久化受理或既有收据结果。
 *
 * @param value - HTTP 响应 JSON。
 * @returns 字段与已知错误码均符合受理响应契约时为 `true`。
 * @example
 * ```ts
 * if (isBrowserSessionInputResult(response)) console.log(response.ok);
 * ```
 */
export function isBrowserSessionInputResult(value: unknown): value is BrowserSessionInputResult {
    if (!isRecord(value)) return false;
    if (value.ok === true) {
        return typeof value.existing === "boolean" && isBrowserSessionInputReceipt(value.receipt);
    }
    return value.ok === false && SESSION_INPUT_ERROR_CODES.has(String(value.error));
}

/**
 * 输入收据类型守卫。
 *
 * @param value - 待检测值。
 * @returns 字段符合收据契约时为 `true`。
 * @example
 * ```ts
 * if (isBrowserSessionInputReceipt(receipt)) console.log(receipt.status);
 * ```
 */
export function isBrowserSessionInputReceipt(value: unknown): value is BrowserSessionInputReceipt {
    return isRecord(value)
        && isNonEmptyString(value.goalId)
        && isNonEmptyString(value.inputId)
        && SESSION_INPUT_KINDS.has(String(value.kind))
        && Number.isSafeInteger(value.sequence) && Number(value.sequence) > 0
        && ["pending", "applied", "cleared"].includes(String(value.status))
        && Number.isSafeInteger(value.admittedAtRevision) && Number(value.admittedAtRevision) >= 0
        && (value.targetRunId === undefined || isNonEmptyString(value.targetRunId))
        && (value.appliedRunId === undefined || isNonEmptyString(value.appliedRunId))
        && (value.messageIndex === undefined || (Number.isSafeInteger(value.messageIndex) && Number(value.messageIndex) >= 0));
}

/**
 * 按身份查询收据的类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为未找到、命中收据或稳定读取失败。
 * @example
 * ```ts
 * if (isBrowserSessionInputQueryResult(res) && res.ok && res.found) console.log(res.receipt.status);
 * ```
 */
export function isBrowserSessionInputQueryResult(value: unknown): value is BrowserSessionInputQueryResult {
    if (!isRecord(value)) return false;
    if (value.ok === true) {
        return value.found === false || (value.found === true && isBrowserSessionInputReceipt(value.receipt));
    }
    return value.ok === false && (value.error === "GOAL_NOT_FOUND" || value.error === "input_read_failed");
}

/**
 * 安全会话状态投影类型守卫。
 *
 * @param value - 待检测值。
 * @returns 字段符合公开会话投影契约时为 `true`。
 * @example
 * ```ts
 * if (isBrowserSessionState(state)) console.log(state.queueRevision);
 * ```
 */
export function isBrowserSessionState(value: unknown): value is BrowserSessionState {
    if (!isRecord(value)) return false;
    return isNonEmptyString(value.goalId)
        && isNonEmptyString(value.runId)
        && isRunStatus(value.runStatus)
        && (value.mode === "normal" || value.mode === "plan")
        && Number.isSafeInteger(value.commitRevision) && Number(value.commitRevision) >= 0
        && Number.isSafeInteger(value.queueRevision) && Number(value.queueRevision) >= 0
        && typeof value.queuePaused === "boolean"
        && (value.queuePauseReason === undefined || value.queuePauseReason === "run_failed" || value.queuePauseReason === "user_interrupt")
        && Number.isSafeInteger(value.pendingMessageCount) && Number(value.pendingMessageCount) >= 0
        && Number.isSafeInteger(value.pendingSteerCount) && Number(value.pendingSteerCount) >= 0
        && (value.waitingFor === undefined
            || ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"].includes(String(value.waitingFor)))
        && (value.interaction === undefined || (isRecord(value.interaction)
            && isNonEmptyString(value.interaction.interactionId)
            && ["question", "task_approval", "action_approval", "action_recovery"].includes(String(value.interaction.kind))
            && isNonEmptyString(value.interaction.runId)))
        && isRecord(value.messages)
        && Number.isSafeInteger(value.messages.count) && Number(value.messages.count) >= 0
        && (value.messages.throughMessageId === undefined || isNonEmptyString(value.messages.throughMessageId))
        && Array.isArray(value.messages.recent)
        && value.messages.recent.every((message: unknown) => isRecord(message)
            && isNonEmptyString(message.messageId)
            && ["user", "assistant"].includes(String(message.role))
            && isNonEmptyString(message.runId)
            && isMessagePosition(message.position)
            && isNonEmptyString(message.sourceKind)
            && isNonEmptyString(message.sourceId))
        && typeof value.needsRecovery === "boolean"
        && typeof value.executionOwner === "boolean"
        && (value.interruption === undefined || (isRecord(value.interruption)
            && isNonEmptyString(value.interruption.requestId)
            && ["requested", "finished"].includes(String(value.interruption.status))
            && typeof value.interruption.outcomeUnknown === "boolean"));
}

/**
 * 创建 Session 的 wire 结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为已受理创建（含首条收据）或稳定拒绝。
 * @example
 * ```ts
 * if (isBrowserCreateSessionResult(res) && res.ok) console.log(res.runId);
 * ```
 */
export function isBrowserCreateSessionResult(value: unknown): value is BrowserCreateSessionResult {
    if (!isRecord(value)) return false;
    if (value.ok === true) {
        return typeof value.existing === "boolean"
            && isNonEmptyString(value.goalId)
            && isNonEmptyString(value.runId)
            && isBrowserSessionInputReceipt(value.receipt);
    }
    return value.ok === false && [
        "goal_id_conflict", "goal_busy", "model_not_selectable", "model_catalog_unavailable",
        "profile_not_found", "invalid_goal_input", "goal_unreadable", "service_shutting_down", "create_failed",
    ].includes(String(value.error));
}

const SESSION_INPUT_KINDS: ReadonlySet<string> = new Set([
    "message", "steer", "interrupt", "respond", "resume", "queue_control",
]);

const SESSION_INPUT_ERROR_CODES: ReadonlySet<string> = new Set([
    "INVALID_INPUT", "INPUT_CONFLICT", "INPUT_NOT_FOUND", "GOAL_NOT_FOUND", "BUSY", "STEER_CONFLICT",
    "INTERRUPT_CONFLICT", "STALE_REVISION", "INTERACTION_MISMATCH", "INTERACTION_REQUIRED", "QUEUE_PAUSED",
    "RUN_NOT_RESUMABLE", "QUEUE_FULL", "QUEUE_TEXT_TOO_LARGE", "TEXT_TOO_LARGE", "QUEUE_NOT_PAUSED",
    "QUEUE_REVISION_MISMATCH", "QUEUED_MESSAGE_NOT_FOUND", "RUN_NOT_FOUND", "RUN_NOT_RUNNING", "RUN_CONTROL_UNAVAILABLE",
    "input_admission_failed", "session_unavailable",
]);


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
 * @returns 是否为包含 goals 数组与 unreadableCount 计数的列表响应。
 *
 * @example
 * ```ts
 * if (isGoalList(res)) console.log(res.goals.length, res.unreadableCount);
 * ```
 */
export function isGoalList(value: unknown): value is BrowserGoalList {
    return isRecord(value)
        && Array.isArray(value.goals)
        && value.goals.every(isGoalListItem)
        && Number.isSafeInteger(value.unreadableCount)
        && Number(value.unreadableCount) >= 0;
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
            && (step.sourceEventId === undefined || isNonEmptyString(step.sourceEventId))
            && (step.actionId === undefined || isNonEmptyString(step.actionId))
            && (step.activityBoundaryBefore === undefined || step.activityBoundaryBefore === true)
            && Number.isSafeInteger(step.sequence)
            && Number.isSafeInteger(step.stepIndex)
            && ["recorded", "completed", "failed", "rejected"].includes(String(step.status))
            && (step.summary === undefined || typeof step.summary === "string")
            && (step.think === undefined || isRecord(step.think)
                && typeof step.think.goal === "string"
                && (step.think.output === undefined || typeof step.think.output === "string")
                && (step.think.truncated === undefined || step.think.truncated === true))
            && (step.stageId === undefined || isNonEmptyString(step.stageId))
            && (step.recoveryAttempts === undefined || Array.isArray(step.recoveryAttempts)
                && step.recoveryAttempts.every((attempt) => typeof attempt === "string")))
        && (value.terminalDetail === undefined || isRecord(value.terminalDetail)
            && typeof value.terminalDetail.message === "string"
            && (value.terminalDetail.code === undefined || typeof value.terminalDetail.code === "string"))
        && (value.stages === undefined || Array.isArray(value.stages)
            && value.stages.every((stage) => isRecord(stage)
                && isNonEmptyString(stage.stageId)
                && Number.isSafeInteger(stage.revision)
                && typeof stage.target === "string"
                && Array.isArray(stage.acceptanceCriteria)
                && ["in_progress", "review_pending", "accepted"].includes(String(stage.status))
                && Array.isArray(stage.steps)))
        && (value.planRoute === undefined || isBrowserPlanRoute(value.planRoute))
        && typeof value.current === "boolean";
}

function isBrowserPlanRoute(value: unknown): boolean {
    if (!isRecord(value)
        || !Number.isSafeInteger(value.revision)
        || Number(value.revision) < 1
        || (value.revisionReason !== undefined && !isNonEmptyString(value.revisionReason))
        || (Number(value.revision) > 1 && !isNonEmptyString(value.revisionReason))
        || !Number.isSafeInteger(value.nextStageIndex)
        || !Array.isArray(value.stages)
        || value.stages.length === 0
        || Number(value.nextStageIndex) < 0
        || Number(value.nextStageIndex) > value.stages.length) return false;

    const ids = new Set<string>();
    return value.stages.every((stage, index) => {
        if (!isRecord(stage)
            || !isNonEmptyString(stage.stageId)
            || ids.has(stage.stageId)
            || !Number.isSafeInteger(stage.revision)
            || Number(stage.revision) < 1
            || !["pending", "executing", "accepted"].includes(String(stage.status))
            || !isNonEmptyString(stage.target)
            || !Array.isArray(stage.acceptanceCriteria)
            || stage.acceptanceCriteria.length === 0
            || !stage.acceptanceCriteria.every(isNonEmptyString)
            || (stage.acceptedSequence !== undefined && (!Number.isSafeInteger(stage.acceptedSequence) || Number(stage.acceptedSequence) < 0))) return false;
        ids.add(stage.stageId);
        const cursor = Number(value.nextStageIndex);
        const expectedStatus = index < cursor ? "accepted"
            : index === cursor && stage.status === "executing" ? "executing"
                : "pending";
        return stage.status === expectedStatus
            && ((stage.status === "accepted") === (stage.acceptedSequence !== undefined));
    });
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
 * 当前交互视图摘要类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserInteractionView。
 *
 * @example
 * ```ts
 * if (isBrowserInteractionView(view)) console.log(view.interactionId);
 * ```
 */
export function isBrowserInteractionView(value: unknown): value is BrowserInteractionView {
    if (!isRecord(value)
        || !isNonEmptyString(value.goalId)
        || !isNonEmptyString(value.runId)
        || !isNonEmptyString(value.interactionId)
        || typeof value.truncated !== "boolean"
        || !["question", "task_approval", "action_approval", "action_recovery"].includes(String(value.kind))) {
        return false;
    }
    const kind = String(value.kind);
    if (kind === "question" || kind === "task_approval") {
        if (!isNonEmptyString(value.requestId) || value.actionId !== undefined) return false;
    } else if (!isNonEmptyString(value.actionId) || value.requestId !== undefined) {
        return false;
    }
    if (!Array.isArray(value.decisions) || value.decisions.length === 0) return false;
    const allowed = kind === "question" ? ["answer_questions", "reply_to_question", "skip_question"]
        : kind === "task_approval" ? ["approve_task", "send_task_feedback"]
            : kind === "action_recovery" ? ["retry_unknown_action", "decline_unknown_action_retry"]
                : ["approve_action", "approve_action_revision", "reject_action"];
    return value.decisions.every((decision) => allowed.includes(String(decision)));
}

/**
 * 交互详情读取结果类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserInteractionDetailResult。
 *
 * @example
 * ```ts
 * if (isBrowserInteractionDetailResult(result)) console.log(result.detail.kind);
 * ```
 */
export function isBrowserInteractionDetailResult(value: unknown): value is BrowserInteractionDetailResult {
    if (!isRecord(value)) return false;
    if (value.ok === false) {
        return [
            "goal_not_found",
            "stale_run",
            "interaction_not_waiting",
            "interaction_mismatch",
            "interaction_details_unavailable",
        ].includes(String(value.error));
    }
    if (value.ok !== true
        || !isNonEmptyString(value.goalId)
        || !isNonEmptyString(value.runId)
        || !isNonEmptyString(value.interactionId)
        || !isRecord(value.detail)) {
        return false;
    }
    const detail = value.detail;
    if (detail.kind === "question") {
        return (detail.mode === "plan" || detail.mode === "execution")
            && Array.isArray(detail.questions)
            && detail.questions.every((question) => isRecord(question)
                && isNonEmptyString(question.id)
                && typeof question.header === "string"
                && typeof question.question === "string"
                && typeof question.multiSelect === "boolean"
                && Array.isArray(question.options))
            && (detail.routeRevision === undefined
                || (isRecord(detail.routeRevision)
                    && isNonEmptyString(detail.routeRevision.approvalRequest)
                    && isNonEmptyString(detail.routeRevision.reason)
                    && Array.isArray(detail.routeRevision.stages)));
    }
    if (detail.kind === "task_approval") {
        return typeof detail.objective === "string"
            && typeof detail.approvalRequest === "string"
            && Array.isArray(detail.completionCriteria)
            && detail.completionCriteria.every((criterion) => typeof criterion === "string")
            && Array.isArray(detail.stages);
    }
    if (detail.kind === "action_approval" || detail.kind === "action_recovery") {
        return isNonEmptyString(detail.actionId)
            && isNonEmptyString(detail.toolId)
            && detail.input !== undefined
            && (detail.approvalKind === undefined || detail.approvalKind === "tool" || detail.approvalKind === "sandbox");
    }
    return false;
}

/**
 * 只读审批预检结果类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserActionReviewResult。
 *
 * @example
 * ```ts
 * if (isBrowserActionReviewResult(result)) console.log(result.review.reviewRef);
 * ```
 */
export function isBrowserActionReviewResult(value: unknown): value is BrowserActionReviewResult {
    if (!isRecord(value)) return false;
    if (value.ok === false) {
        return [
            "goal_not_found",
            "stale_run",
            "action_not_waiting",
            "action_id_mismatch",
            "tool_not_found",
            "invalid_tool_input",
            "scope_unavailable",
            "sandbox_scope_unavailable",
            "review_unavailable",
        ].includes(String(value.error));
    }
    if (value.ok !== true
        || !isNonEmptyString(value.goalId)
        || !isNonEmptyString(value.runId)
        || !isRecord(value.review)) {
        return false;
    }
    const review = value.review;
    return isNonEmptyString(review.actionId)
        && isNonEmptyString(review.toolId)
        && review.originalInput !== undefined
        && review.finalInput !== undefined
        && typeof review.changed === "boolean"
        && ["action", "goal", "workspace"].includes(String(review.scope))
        && Array.isArray(review.availableScopes)
        && isRecord(review.capability)
        && typeof review.requiresSandboxApproval === "boolean"
        && isNonEmptyString(review.reviewRef);
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
            && typeof message.content === "string"
            && isNonEmptyString(message.messageId)
            && isNonEmptyString(message.runId)
            && isMessagePosition(message.position))
        || (value.pendingSteers !== undefined && (!Array.isArray(value.pendingSteers)
            || !value.pendingSteers.every((steer) => isRecord(steer)
                && isNonEmptyString(steer.messageId)
                && typeof steer.content === "string")))
        || (value.pendingMessages !== undefined && (!Array.isArray(value.pendingMessages)
            || !value.pendingMessages.every((message) => isRecord(message)
                && isNonEmptyString(message.inputId)
                && typeof message.content === "string")))
        || (value.queue !== undefined && (!isRecord(value.queue)
            || !Number.isSafeInteger(value.queue.revision) || Number(value.queue.revision) < 0
            || typeof value.queue.paused !== "boolean"
            || (value.queue.pauseReason !== undefined && value.queue.pauseReason !== "run_failed" && value.queue.pauseReason !== "user_interrupt")))
        || (value.interruption !== undefined && (!isRecord(value.interruption)
            || !isNonEmptyString(value.interruption.requestId)
            || !["requested", "finished"].includes(String(value.interruption.status))
            || (value.interruption.outcomeUnknown !== undefined && typeof value.interruption.outcomeUnknown !== "boolean")))
        || !Array.isArray(value.runs)
        || !value.runs.every(isBrowserRun)
        || typeof value.historyTruncated !== "boolean") return false;

    if (value.goalPlan !== undefined && !isGoalPlan(value.goalPlan)) return false;
    if (value.execution !== undefined && !(
        isRecord(value.execution)
        && ["active", "recoverable", "inactive"].includes(String(value.execution.state))
        && typeof value.execution.committedThroughSequence === "number"
    )) return false;
    if (value.pendingAction !== undefined && !isPendingAction(value.pendingAction)) return false;
    if (value.interaction !== undefined && !isBrowserInteractionView(value.interaction)) return false;
    return true;
}

/**
 * 窄 Goal 状态类型守卫。
 *
 * @param value - 待检测的 wire 值。
 * @returns 是否为不包含消息、步骤和阶段历史的 `BrowserGoalSessionState`。
 * @example
 * ```ts
 * if (isBrowserGoalSessionState(state)) console.log(state.currentRunId);
 * ```
 */
export function isBrowserGoalSessionState(value: unknown): value is BrowserGoalSessionState {
    if (!isRecord(value)
        || Object.keys(value).some((key) => !["goalId", "intent", "currentRunId", "runStatus", "currentRunMode", "nextRunMode", "currentRunStepCount", "currentRunTerminalDetail", "currentPlanRoute", "execution", "pendingSteers", "pendingMessages", "queue", "interruption", "goalPlan", "interaction", "pendingAction", "history"].includes(key))
        || !isNonEmptyString(value.goalId)
        || typeof value.intent !== "string"
        || !isNonEmptyString(value.currentRunId)
        || !isRunStatus(value.runStatus)
        || (value.currentRunMode !== "normal" && value.currentRunMode !== "plan")
        || (value.nextRunMode !== undefined && value.nextRunMode !== "plan")
        || !Number.isSafeInteger(value.currentRunStepCount) || Number(value.currentRunStepCount) < 0
        || !isRecord(value.history)
        || !isActivityHistoryMarker(value.history.messages)
        || !isActivityHistoryMarker(value.history.steps)
        || !isActivityHistoryMarker(value.history.stages)) return false;
    if (value.currentPlanRoute !== undefined && !isBrowserPlanRoute(value.currentPlanRoute)) return false;
    if (value.currentRunTerminalDetail !== undefined && (value.runStatus !== "failed"
        || !isRecord(value.currentRunTerminalDetail)
        || Object.keys(value.currentRunTerminalDetail).some((key) => key !== "code" && key !== "message")
        || typeof value.currentRunTerminalDetail.message !== "string"
        || (value.currentRunTerminalDetail.code !== undefined && typeof value.currentRunTerminalDetail.code !== "string"))) return false;
    if (value.execution !== undefined && !(isRecord(value.execution)
        && ["active", "recoverable", "inactive"].includes(String(value.execution.state))
        && Number.isSafeInteger(value.execution.committedThroughSequence)
        && Number(value.execution.committedThroughSequence) >= 0)) return false;
    if (value.pendingSteers !== undefined && (!Array.isArray(value.pendingSteers)
        || !value.pendingSteers.every((item) => isRecord(item) && isNonEmptyString(item.messageId) && typeof item.content === "string"))) return false;
    if (value.pendingMessages !== undefined && (!Array.isArray(value.pendingMessages)
        || !value.pendingMessages.every((item) => isRecord(item) && isNonEmptyString(item.inputId) && typeof item.content === "string"))) return false;
    if (value.queue !== undefined && (!isRecord(value.queue)
        || !Number.isSafeInteger(value.queue.revision) || Number(value.queue.revision) < 0
        || typeof value.queue.paused !== "boolean"
        || (value.queue.pauseReason !== undefined && value.queue.pauseReason !== "run_failed" && value.queue.pauseReason !== "user_interrupt"))) return false;
    if (value.interruption !== undefined && (!isRecord(value.interruption)
        || !isNonEmptyString(value.interruption.requestId)
        || !["requested", "finished"].includes(String(value.interruption.status))
        || (value.interruption.outcomeUnknown !== undefined && typeof value.interruption.outcomeUnknown !== "boolean"))) return false;
    return (value.goalPlan === undefined || isGoalPlan(value.goalPlan))
        && (value.interaction === undefined || isBrowserInteractionView(value.interaction))
        && (value.pendingAction === undefined || isPendingAction(value.pendingAction));
}

/**
 * 有界 Activity 页类型守卫。
 *
 * @param value - 待检测的 wire 值。
 * @returns 是否为仅含白名单事件摘要和最多 100 个原子项的页面。
 * @example
 * ```ts
 * if (isBrowserActivityPage(page)) console.log(page.items.length);
 * ```
 */
export function isBrowserActivityPage(value: unknown): value is BrowserActivityPage {
    if (!isRecord(value) || !isNonEmptyString(value.goalId)
        || Object.keys(value).some((key) => !["goalId", "runFilter", "limit", "items", "runs", "window", "gaps", "range", "stages", "actionGroups", "beforeCursor", "afterCursor"].includes(key))
        || (value.runFilter !== undefined && !isNonEmptyString(value.runFilter))
        || !Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 100
        || !Array.isArray(value.items) || value.items.length > Number(value.limit)
        || !value.items.every(isBrowserActivityItem)
        || !Array.isArray(value.runs) || !value.runs.every((run) => isRecord(run)
            && isNonEmptyString(run.runId) && isRunStatus(run.status) && typeof run.current === "boolean"
            && Number.isSafeInteger(run.runOrder) && Number(run.runOrder) >= 0
            && Number.isSafeInteger(run.committedThroughSequence) && Number(run.committedThroughSequence) >= 0
            && (run.terminalDetail === undefined || (isRecord(run.terminalDetail)
                && Object.keys(run.terminalDetail).every(key => key === "code" || key === "message")
                && typeof run.terminalDetail.message === "string" && run.terminalDetail.message.length <= 500
                && (run.terminalDetail.code === undefined || (typeof run.terminalDetail.code === "string" && run.terminalDetail.code.length <= 80)))))
        || !Array.isArray(value.window) || !value.window.every((window) => isRecord(window)
            && isNonEmptyString(window.runId)
            && Number.isSafeInteger(window.messageCount) && Number(window.messageCount) >= 0
            && (window.throughMessageId === undefined || isNonEmptyString(window.throughMessageId))
            && Number.isSafeInteger(window.committedThroughSequence) && Number(window.committedThroughSequence) >= 0)
        || !Array.isArray(value.gaps) || value.gaps.length > 2 || !value.gaps.every(isBrowserActivityGap)
        || !isRecord(value.range)
        || typeof value.range.olderAvailable !== "boolean" || typeof value.range.newerAvailable !== "boolean"
        || (value.range.first !== undefined && !isActivityPosition(value.range.first))
        || (value.range.last !== undefined && !isActivityPosition(value.range.last))
        || value.gaps.some((gap) => gap.direction === "older") !== value.range.olderAvailable
        || value.gaps.some((gap) => gap.direction === "newer") !== value.range.newerAvailable
        || new Set(value.gaps.map((gap) => gap.direction)).size !== value.gaps.length
        || !Array.isArray(value.stages) || !value.stages.every((stage) => isRecord(stage)
            && isNonEmptyString(stage.runId) && isNonEmptyString(stage.stageId)
            && Number.isSafeInteger(stage.revision) && Number(stage.revision) > 0
            && ["executing", "accepted", "rejected"].includes(String(stage.status))
            && Number.isSafeInteger(stage.firstSequence) && Number(stage.firstSequence) >= 0
            && (stage.lastSequence === undefined || Number.isSafeInteger(stage.lastSequence) && Number(stage.lastSequence) >= Number(stage.firstSequence))
            && typeof stage.completeWithinPage === "boolean")
        || !Array.isArray(value.actionGroups) || !value.actionGroups.every((group) => isRecord(group)
            && isNonEmptyString(group.runId) && isNonEmptyString(group.actionId)
            && Number.isSafeInteger(group.firstSequence) && Number(group.firstSequence) >= 0
            && Number.isSafeInteger(group.lastSequence) && Number(group.lastSequence) >= Number(group.firstSequence)
            && typeof group.completeWithinPage === "boolean")
        || (value.beforeCursor !== undefined && !isActivityCursor(value.beforeCursor))
        || (value.afterCursor !== undefined && !isActivityCursor(value.afterCursor))) return false;
    return true;
}

function isBrowserActivityGap(value: unknown): value is BrowserActivityGap {
    if (!isRecord(value)
        || Object.keys(value).some((key) => !["direction", "itemCount", "first", "last"].includes(key))
        || (value.direction !== "older" && value.direction !== "newer")
        || !Number.isSafeInteger(value.itemCount) || Number(value.itemCount) < 1
        || !isActivityPosition(value.first) || !isActivityPosition(value.last)) return false;
    const first = value.first;
    const last = value.last;
    if (first.runOrder < last.runOrder) return true;
    if (first.runOrder !== last.runOrder || first.runId !== last.runId) return false;
    if (first.sequence !== last.sequence) return first.sequence < last.sequence;
    if (first.itemKind !== last.itemKind) return first.itemKind === "fact";
    return first.order <= last.order;
}

function isActivityHistoryMarker(value: unknown): boolean {
    return isRecord(value) && value.included === false && value.source === "activity";
}

function isActivityPosition(value: unknown): value is BrowserActivityPosition {
    return isRecord(value)
        && isNonEmptyString(value.runId)
        && Number.isSafeInteger(value.runOrder) && Number(value.runOrder) >= 0
        && Number.isSafeInteger(value.sequence) && Number(value.sequence) >= 0
        && (value.itemKind === "fact" || value.itemKind === "message")
        && Number.isSafeInteger(value.order) && Number(value.order) >= 0;
}

function isActivityCursor(value: unknown): boolean {
    return typeof value === "string" && value.length > 0 && value.length <= 65_536 && /^[A-Za-z0-9_-]+$/.test(value);
}

function isBrowserActivityItem(value: unknown): boolean {
    if (!isRecord(value) || !isNonEmptyString(value.itemId) || !isNonEmptyString(value.runId)
        || !isActivityPosition(value.position) || value.position.runId !== value.runId) return false;
    if (value.type === "message") {
        return !Object.keys(value).some((key) => !["type", "itemId", "messageId", "role", "purpose", "previewId", "runId", "position", "content", "contentLength", "truncated"].includes(key))
            && isNonEmptyString(value.messageId)
            && (value.role === "user" || value.role === "assistant")
            && (value.role === "user"
                ? value.purpose === undefined && value.previewId === undefined
                : (value.purpose === "process" || value.purpose === "answer" || value.purpose === "notice")
                    && (value.previewId === undefined
                        || (value.purpose === "answer" && isNonEmptyString(value.previewId) && value.previewId.length <= 200)))
            && typeof value.content === "string" && value.content.length <= 4_000
            && Number.isSafeInteger(value.contentLength) && Number(value.contentLength) >= value.content.length
            && typeof value.truncated === "boolean";
    }
    if (value.type !== "fact") return value.type === "think" && isActivityThinkItem(value);
    const isStageDeclaration = value.eventType === "run_stage_declared";
    const isLookup = ["context_lookup_requested", "context_lookup_completed", "context_lookup_not_found", "context_lookup_failed"].includes(String(value.eventType));
    return !Object.keys(value).some((key) => !["type", "itemId", "eventId", "runId", "position", "eventType", "title", "detail", "lookupId", "lookupRequest", "lookupErrorCode", "executionUnitId", "actionId", "stageId", "stageRevision", "stageTarget", "tool"].includes(key))
        && isNonEmptyString(value.eventId)
        && (BROWSER_ACTIVITY_EVENT_TYPES as readonly string[]).includes(String(value.eventType))
        && typeof value.title === "string"
        && (value.detail === undefined || typeof value.detail === "string" && value.detail.length <= 500)
        && (isLookup ? isNonEmptyString(value.lookupId) && value.lookupId.length <= 200 : value.lookupId === undefined)
        && (value.eventType === "context_lookup_requested"
            ? value.lookupRequest === undefined || typeof value.lookupRequest === "string" && value.lookupRequest.length <= 200
            : value.lookupRequest === undefined)
        && (value.eventType === "context_lookup_failed"
            ? value.lookupErrorCode === undefined || ["INVALID_CONTEXT_LOOKUP", "CONTEXT_LOOKUP_CHAIN_LIMIT", "CONTEXT_LOOKUP_UNAVAILABLE", "CONTEXT_LOOKUP_FAILED", "INVALID_CONTEXT_LOOKUP_RESULT"].includes(String(value.lookupErrorCode))
            : value.lookupErrorCode === undefined)
        && (value.executionUnitId === undefined || isNonEmptyString(value.executionUnitId))
        && (value.actionId === undefined || isNonEmptyString(value.actionId))
        && (value.stageId === undefined || isNonEmptyString(value.stageId))
        && (value.stageRevision === undefined || Number.isSafeInteger(value.stageRevision) && Number(value.stageRevision) > 0)
        && (isStageDeclaration
            ? isNonEmptyString(value.stageTarget) && value.stageTarget.length <= 1_000
            : value.stageTarget === undefined)
        && (value.tool === undefined || isActivityToolState(value.tool));
}

/**
 * Activity 显式 Think 摘要守卫。
 *
 * @remarks 只接受思考目标、已提交输出与截断标记。
 *
 * @param value - 待检测值。
 * @returns 是否为合法的 Think 摘要。
 */
function isActivityThinkItem(value: unknown): boolean {
    if (!isRecord(value)) return false;
    if (Object.keys(value).some((key) => !["type", "itemId", "runId", "position", "executionUnitId", "think"].includes(key))) return false;
    if (value.type !== "think") return false;
    if (!isNonEmptyString(value.itemId) || !isNonEmptyString(value.runId)) return false;
    if (!isActivityPosition(value.position) || value.position.runId !== value.runId) return false;
    if (value.executionUnitId !== undefined && (!isNonEmptyString(value.executionUnitId) || value.executionUnitId.length > 200)) return false;
    if (!isRecord(value.think)) return false;
    if (!isNonEmptyString(value.think.goal) || value.think.goal.length > 4_000) return false;
    if (value.think.output !== undefined && (typeof value.think.output !== "string" || value.think.output.length > 64_000)) return false;
    if (value.think.truncated !== undefined && value.think.truncated !== true) return false;
    return !Object.keys(value.think).some((key) => !["goal", "output", "truncated"].includes(key));
}

/**
 * Activity 事实项的已提交工具状态白名单守卫。
 *
 * @remarks 只接受工具身份、已提交状态与既有安全摘要；原始参数与 Observation 不在
 * wire 白名单内。
 *
 * @param value - 待检测值。
 * @returns 是否为合法的工具状态投影。
 */
function isActivityToolState(value: unknown): boolean {
    if (!isRecord(value)) return false;
    if (!isNonEmptyString(value.toolId)) return false;
    if (!["recorded", "pending-result", "completed", "failed", "rejected"].includes(String(value.status))) return false;
    if (value.actionStatus !== undefined && !["awaiting_approval", "approved", "rejected"].includes(String(value.actionStatus))) return false;
    if (value.inputSummary !== undefined && typeof value.inputSummary !== "string") return false;
    if (value.summary !== undefined && typeof value.summary !== "string") return false;
    if (value.attempts !== undefined && (!Array.isArray(value.attempts)
        || !value.attempts.every((attempt) => typeof attempt === "string"))) return false;
    if (value.revisionRef !== undefined && !isNonEmptyString(value.revisionRef)) return false;
    if (value.recoveryRef !== undefined && !isNonEmptyString(value.recoveryRef)) return false;
    if (value.parentActionId !== undefined && !isNonEmptyString(value.parentActionId)) return false;
    if (value.activityBoundaryBefore !== undefined && value.activityBoundaryBefore !== true) return false;
    return !Object.keys(value).some((key) => ![
        "toolId", "status", "actionStatus", "inputSummary", "summary",
        "attempts", "revisionRef", "recoveryRef", "parentActionId", "activityBoundaryBefore",
    ].includes(key));
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
export function isGoalSessionEnvelope(value: unknown): value is { readonly goal: BrowserGoalSession; readonly session?: BrowserSessionState } {
    return isRecord(value)
        && isBrowserGoalSession(value.goal)
        && (value.session === undefined || isBrowserSessionState(value.session));
}

/**
 * 窄状态响应信封类型守卫。
 *
 * @param value - 待检测的 wire 值。
 * @returns 是否包含 Activity 外置历史的 Goal 状态及可选会话元数据。
 * @example
 * ```ts
 * if (isGoalSessionStateEnvelope(response)) console.log(response.goal.history.messages.source);
 * ```
 */
export function isGoalSessionStateEnvelope(value: unknown): value is { readonly goal: BrowserGoalSessionState; readonly session?: BrowserSessionState } {
    return isRecord(value)
        && isBrowserGoalSessionState(value.goal)
        && (value.session === undefined || isBrowserSessionState(value.session));
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
            && ["live", "catalog", "execution", "configured", "mixed"].includes(String(model.metadataSource))
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
 * 受管 Provider 档案投影守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为掩码投影；含明文凭据字段时返回 false。
 *
 * @example
 * ```ts
 * if (isProviderProfile(p)) console.log(p.apiKeyMask);
 * ```
 */
export function isProviderProfile(value: unknown): value is BrowserProviderProfile {
    if (!isRecord(value)) return false;
    if ("apiKey" in value) return false;
    return isNonEmptyString(value.id)
        && isNonEmptyString(value.label)
        && isNonEmptyString(value.kind)
        && isNonEmptyString(value.defaultModel)
        && typeof value.hasApiKey === "boolean"
        && typeof value.apiKeyMask === "string"
        && (value.baseURL === undefined || typeof value.baseURL === "string")
        && (value.contextWindowTokens === undefined || typeof value.contextWindowTokens === "number")
        && (value.maxOutputTokens === undefined || typeof value.maxOutputTokens === "number")
        && (value.structuredOutputMode === undefined || value.structuredOutputMode === "strict"
            || value.structuredOutputMode === "prompt_only" || value.structuredOutputMode === "two_stage");
}

/**
 * 设置页读取守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为掩码后的设置投影；含明文凭据字段时返回 false。
 *
 * @remarks
 * 读取接口成功时直接返回设置投影本身，失败由非 2xx 状态加 `{ error }` 表达，
 * 因此本守卫只接受裸投影，不接受任何信封外层。
 *
 * @example
 * ```ts
 * if (isProviderSettings(res)) console.log(res.profiles.length);
 * ```
 */
export function isProviderSettings(value: unknown): value is BrowserProviderSettings {
    if (!isRecord(value)) return false;
    return (value.activeProfileId === undefined || typeof value.activeProfileId === "string")
        && Array.isArray(value.profiles)
        && value.profiles.every((profile) => isProviderProfile(profile))
        && (value.fallback === undefined || (isRecord(value.fallback)
            && value.fallback.source === "config"
            && isNonEmptyString(value.fallback.provider)
            && isNonEmptyString(value.fallback.model)));
}

/**
 * 档案写入结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为创建/更新成功响应或稳定错误响应。
 *
 * @example
 * ```ts
 * if (isProviderProfileWriteResult(res) && res.ok) console.log(res.profile.id);
 * ```
 */
export function isProviderProfileWriteResult(value: unknown): value is BrowserProviderProfileWriteResult {
    if (!isRecord(value) || typeof value.ok !== "boolean") return false;
    if (!value.ok) {
        return typeof value.error === "string" && (value.fields === undefined
            || (Array.isArray(value.fields) && value.fields.every((field) => typeof field === "string")));
    }
    return isProviderProfile(value.profile);
}

/**
 * 档案删除结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为删除成功响应或稳定错误响应。
 *
 * @example
 * ```ts
 * if (isProviderProfileDeleteResult(res) && res.ok) console.log(res.mayBeReferencedByGoals);
 * ```
 */
export function isProviderProfileDeleteResult(value: unknown): value is BrowserProviderProfileDeleteResult {
    if (!isRecord(value) || typeof value.ok !== "boolean") return false;
    if (!value.ok) return typeof value.error === "string";
    return isProviderProfile(value.profile) && typeof value.mayBeReferencedByGoals === "boolean";
}

/**
 * 档案激活结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为激活成功响应或稳定错误响应。
 *
 * @example
 * ```ts
 * if (isProviderProfileActivationResult(res) && res.ok) console.log(res.activeProfileId);
 * ```
 */
export function isProviderProfileActivationResult(value: unknown): value is BrowserProviderProfileActivationResult {
    if (!isRecord(value) || typeof value.ok !== "boolean") return false;
    if (!value.ok) return typeof value.error === "string";
    return isNonEmptyString(value.activeProfileId);
}

/**
 * 连接测试结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为测试成功响应或稳定错误响应。
 *
 * @example
 * ```ts
 * if (isProviderProfileTestResult(res) && res.ok) console.log(res.modelCount);
 * ```
 */
export function isProviderProfileTestResult(value: unknown): value is BrowserProviderProfileTestResult {
    if (!isRecord(value) || typeof value.ok !== "boolean") return false;
    if (!value.ok) return typeof value.error === "string";
    return typeof value.modelCount === "number" && Number.isFinite(value.modelCount) && value.modelCount >= 0;
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
    if (!isRecord(value) || !isNonEmptyString(value.goalId)) return false;
    if (value.type === "state_sync") return isBrowserSessionState(value.state);
    if (value.type === "input_result") {
        if (!isRecord(value.outcome)) return false;
        const outcome = value.outcome;
        return isNonEmptyString(outcome.inputId)
            && SESSION_INPUT_KINDS.has(String(outcome.kind))
            && typeof outcome.ok === "boolean"
            && (outcome.ok ? isBrowserSessionInputReceipt(outcome.receipt) : SESSION_INPUT_ERROR_CODES.has(String(outcome.code)));
    }
    if (value.type === "snapshot_changed" || value.type === "refresh_required") {
        return value.runId === undefined || isNonEmptyString(value.runId);
    }
    if (value.type === "message_committed") {
        if (!isNonEmptyString(value.runId) || !isRecord(value.message)) return false;
        const message = value.message;
        return isNonEmptyString(message.messageId)
            && message.messageId.length <= 200
            && ["user", "assistant"].includes(String(message.role))
            && isNonEmptyString(message.runId)
            && isMessagePosition(message.position)
            && Number.isSafeInteger(message.commitRevision)
            && (message.purpose === undefined
                || ["process", "answer", "notice"].includes(String(message.purpose)))
            && (message.previewId === undefined
                || (typeof message.previewId === "string" && message.previewId.length <= 200));
    }
    if (value.type === "interaction_required") {
        if (!isNonEmptyString(value.runId) || !isRecord(value.interaction)) return false;
        const interaction = value.interaction;
        return isNonEmptyString(interaction.interactionId)
            && interaction.interactionId.length <= 200
            && ["ask_user", "task_approval", "action_approval", "action_recovery"].includes(String(interaction.kind))
            && isNonEmptyString(interaction.runId);
    }
    if (value.type !== "activity" || !isNonEmptyString(value.runId) || !isRecord(value.activity)) return false;
    const activity = value.activity;
    if (activity.kind === "assistant_text_delta") {
        return typeof activity.text === "string" && activity.text.length <= 2_000 && typeof activity.truncated === "boolean"
            && isNonEmptyString(activity.sourceEventId)
            && activity.sourceEventId.length <= 200
            && Number.isSafeInteger(activity.sourceCursor) && Number(activity.sourceCursor) > 0;
    }
    if (activity.kind === "model_started") {
        return (activity.stage === undefined || ["think", "decide", "completion_review"].includes(String(activity.stage)))
            && (activity.modelCallId === undefined || (isNonEmptyString(activity.modelCallId) && activity.modelCallId.length <= 200))
            && (activity.executionUnitId === undefined || (isNonEmptyString(activity.executionUnitId) && activity.executionUnitId.length <= 200))
            && (activity.occurredAt === undefined || (typeof activity.occurredAt === "string" && activity.occurredAt.length <= 40 && Number.isFinite(Date.parse(activity.occurredAt))));
    }
    if (["model_completed", "step_started"].includes(String(activity.kind))) return true;
    if (activity.kind === "tool_started") {
        return isNonEmptyString(activity.sourceEventId)
            && activity.sourceEventId.length <= 200
            && Number.isSafeInteger(activity.sourceCursor) && Number(activity.sourceCursor) > 0
            && isNonEmptyString(activity.actionId)
            && activity.actionId.length <= 200
            && isNonEmptyString(activity.executionUnitId)
            && activity.executionUnitId.length <= 200
            && isNonEmptyString(activity.toolId)
            && activity.toolId.length <= 128
            && (activity.inputSummary === undefined || (typeof activity.inputSummary === "string" && activity.inputSummary.length <= 240));
    }
    if (activity.kind === "tool_finished") {
        return isNonEmptyString(activity.sourceEventId)
            && activity.sourceEventId.length <= 200
            && Number.isSafeInteger(activity.sourceCursor) && Number(activity.sourceCursor) > 0
            && isNonEmptyString(activity.actionId)
            && activity.actionId.length <= 200
            && isNonEmptyString(activity.toolId)
            && activity.toolId.length <= 128
            && ["success", "failure"].includes(String(activity.outcome))
            && (activity.summary === undefined || (typeof activity.summary === "string" && activity.summary.length <= 500));
    }
    if (activity.kind === "tool_attempt_started" || activity.kind === "tool_attempt_failed") {
        return isNonEmptyString(activity.sourceEventId)
            && activity.sourceEventId.length <= 200
            && Number.isSafeInteger(activity.sourceCursor) && Number(activity.sourceCursor) > 0
            && isNonEmptyString(activity.actionId)
            && activity.actionId.length <= 200
            && Number.isSafeInteger(activity.attempt) && Number(activity.attempt) > 0
            && (activity.kind !== "tool_attempt_failed" || (typeof activity.reason === "string" && activity.reason.length <= 160));
    }
    if (activity.kind === "activity_boundary") {
        return isNonEmptyString(activity.sourceEventId)
            && activity.sourceEventId.length <= 200
            && Number.isSafeInteger(activity.sourceCursor) && Number(activity.sourceCursor) > 0
            && ["assistant_reply", "user_wait", "stage_change", "terminal", "failure", "unknown"].includes(String(activity.reason));
    }
    if (activity.kind === "candidate_preview") {
        return isNonEmptyString(activity.sourceEventId)
            && activity.sourceEventId.length <= 200
            && Number.isSafeInteger(activity.sourceCursor) && Number(activity.sourceCursor) > 0
            && isNonEmptyString(activity.candidateId)
            && activity.candidateId.length <= 200
            && typeof activity.text === "string"
            && activity.text.length <= 64_000
            && Number.isSafeInteger(activity.startOffset) && Number(activity.startOffset) >= 0
            && typeof activity.truncated === "boolean"
            && typeof activity.complete === "boolean";
    }
    if (activity.kind === "candidate_invalidated") {
        return isNonEmptyString(activity.sourceEventId)
            && activity.sourceEventId.length <= 200
            && Number.isSafeInteger(activity.sourceCursor) && Number(activity.sourceCursor) > 0
            && isNonEmptyString(activity.candidateId)
            && activity.candidateId.length <= 200
            && ["rejected", "cancelled", "failed", "replaced", "ambiguous"].includes(String(activity.reason));
    }
    return false;
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
/**
 * 校验在线模型列表响应，不接受凭据或任意供应商响应正文。
 * @example
 * ```ts
 * if (isProviderModels(value)) console.log(value.models.length);
 * ```
 */
export function isProviderModels(value: unknown): value is import("./provider-settings").BrowserProviderModels {
    return isRecord(value) && value.ok === true && Array.isArray(value.models)
        && value.models.every(model => isRecord(model) && isNonEmptyString(model.id) && typeof model.name === "string");
}
