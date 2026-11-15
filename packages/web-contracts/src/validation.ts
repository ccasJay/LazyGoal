import type { ContractBinding, ContractReadResult } from "../../contract-binding/src/index";

import {
    acceptedCommandBinding,
    browserActionDetailsResultBinding,
    browserActionReviewResultBinding,
    browserActivityPageBinding,
    browserCreateSessionResultBinding,
    browserGoalListBinding,
    browserGoalListItemBinding,
    browserGoalEventBinding,
    browserGoalPlanBinding,
    browserGoalSessionBinding,
    browserGoalSessionEnvelopeBinding,
    browserGoalSessionStateBinding,
    browserGoalSessionStateEnvelopeBinding,
    browserInteractionDetailResultBinding,
    browserInteractionViewBinding,
    browserModelCatalogBinding,
    browserModelInputDetailBinding,
    browserModelInputsBinding,
    browserModelPreferenceResultBinding,
    browserModelSelectionResultBinding,
    browserPendingActionBinding,
    browserPermissionExemptionResultBinding,
    browserPermissionProfileResultBinding,
    browserProviderProfileActivationResultBinding,
    browserProviderProfileBinding,
    browserProviderProfileDeleteResultBinding,
    browserProviderProfileWriteResultBinding,
    browserProviderSettingsBinding,
    browserSessionInputQueryResultBinding,
    browserSessionInputReceiptBinding,
    browserSessionInputResultBinding,
    browserSessionMessageListBinding,
    browserSessionMessageBinding,
    browserSessionRunBinding,
    browserSessionStateBinding,
    browserTrajectoryDetailBinding,
    browserTrajectoryEntryBinding,
    browserTrajectoryPageBinding,
    browserTrajectoryRunBinding,
    browserTrajectoryRunsBinding,
    browserWorkspaceContextBinding,
    sessionMetricsSnapshotBinding,
    sessionMetricsValuesBinding,
} from "./bindings";
import {
    hasConsistentTerminalDetail,
    hasNoProviderCredentialKey,
    hasValidContextUsage,
    isActivityPage,
    isInteractionView,
    isJsonValue,
    isLiveEventStructure,
    isMetricValues as hasValidMetricValues,
    isNullableSafeInteger,
    isPlanRoute,
    isRecord,
    isTrajectoryDetail as hasValidTrajectoryDetail,
} from "./invariants";
import type {
    AcceptedCommand,
    BrowserActionDetailsResult,
    BrowserActionReviewResult,
    BrowserActivityPage,
    BrowserCreateSessionResult,
    BrowserGoalList,
    BrowserGoalListItem,
    BrowserGoalEvent,
    BrowserGoalPlan,
    BrowserGoalSession,
    BrowserGoalSessionState,
    BrowserInteractionDetailResult,
    BrowserInteractionView,
    BrowserModelCatalog,
    BrowserModelInputDetail,
    BrowserModelInputs,
    BrowserModelPreferenceResult,
    BrowserModelSelectionResult,
    BrowserPendingAction,
    BrowserPermissionExemptionResult,
    BrowserPermissionProfileResult,
    BrowserProviderProfile,
    BrowserProviderProfileActivationResult,
    BrowserProviderProfileDeleteResult,
    BrowserProviderProfileWriteResult,
    BrowserProviderSettings,
    BrowserRunStatus,
    BrowserSessionInputQueryResult,
    BrowserSessionInputReceipt,
    BrowserSessionInputResult,
    BrowserSessionMessageListResult,
    BrowserSessionMessageResult,
    BrowserSessionRun,
    BrowserSessionState,
    BrowserTrajectoryDetail,
    BrowserTrajectoryEntry,
    BrowserTrajectoryPage,
    BrowserTrajectoryRun,
    BrowserTrajectoryRuns,
    BrowserWorkspaceContext,
    SessionMetricsSnapshot,
    SessionMetricsValues,
} from "./wire";

/**
 * 通用对象类型守卫。
 *
 * @remarks
 * 共享实现归属 `@lazygoal/contracts` 的 JSON 原语；此处仅保留公开名称转发，不维护第二份实现。
 *
 * @param value - 待检测值。
 * @returns 是否为非空对象且非数组。
 *
 * @example
 * ```ts
 * if (isRecord(val)) console.log(Object.keys(val));
 * ```
 */
export { isRecord };

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

export { isJsonValue };

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
    return value === "created"
        || value === "running"
        || value === "waiting"
        || value === "completed"
        || value === "failed"
        || value === "cancelled";
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
export function isAcceptedCommand(value: unknown): value is AcceptedCommand {
    return accepts(acceptedCommandBinding, value);
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
    return accepts(browserSessionInputResultBinding, value);
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
    return accepts(browserSessionInputReceiptBinding, value);
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
    return accepts(browserSessionInputQueryResultBinding, value);
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
    return accepts(browserSessionStateBinding, value);
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
    return accepts(browserCreateSessionResultBinding, value);
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
    return accepts(browserGoalListItemBinding, value);
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
    return accepts(browserGoalListBinding, value);
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
    const result = browserSessionRunBinding.read(value, "strip");
    return result.ok
        && (result.data.planRoute === undefined || isPlanRoute(result.data.planRoute));
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
    return accepts(browserGoalPlanBinding, value);
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
    return accepts(browserPendingActionBinding, value);
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
    const result = browserInteractionViewBinding.read(value, "strip");
    return result.ok && isInteractionView(result.data);
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
    return accepts(browserInteractionDetailResultBinding, value);
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
    return accepts(browserActionReviewResultBinding, value);
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
    const result = browserGoalSessionBinding.read(value, "strip");
    if (!result.ok) return false;
    return result.data.runs.every((run) =>
        run.planRoute === undefined || isPlanRoute(run.planRoute))
        && (result.data.interaction === undefined
            || isInteractionView(result.data.interaction));
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
    const result = browserGoalSessionStateBinding.read(value, "strip");
    if (!result.ok) return false;
    return hasConsistentTerminalDetail(result.data)
        && (result.data.currentPlanRoute === undefined
            || isPlanRoute(result.data.currentPlanRoute))
        && (result.data.interaction === undefined
            || isInteractionView(result.data.interaction));
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
    const result = browserActivityPageBinding.read(value, "strip");
    return result.ok && isActivityPage(result.data);
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
    const result = browserGoalSessionEnvelopeBinding.read(value, "strip");
    if (!result.ok) return false;
    return isBrowserGoalSession(result.data.goal)
        && (result.data.session === undefined || isBrowserSessionState(result.data.session));
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
    const result = browserGoalSessionStateEnvelopeBinding.read(value, "strip");
    if (!result.ok) return false;
    return isBrowserGoalSessionState(result.data.goal)
        && (result.data.session === undefined || isBrowserSessionState(result.data.session));
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
    return accepts(browserModelCatalogBinding, value);
}

/**
 * 模型选择受理结果类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为模型选择成功受理响应。
 *
 * @example
 * ```ts
 * if (isModelSelectionAccepted(res)) console.log(res.selection.modelId);
 * ```
 */
export function isModelSelectionAccepted(
    value: unknown,
): value is Extract<BrowserModelSelectionResult, { readonly ok: true }> {
    const result = browserModelSelectionResultBinding.read(value, "strip");
    return result.ok && result.data.ok;
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
    const result = browserModelPreferenceResultBinding.read(value, "strip");
    return result.ok && result.data.ok;
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
    if (hasProviderCredentialKey(value)) return false;
    return accepts(browserProviderProfileBinding, value);
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
    if (isRecord(value) && Array.isArray(value.profiles) && value.profiles.some(hasProviderCredentialKey)) {
        return false;
    }
    return accepts(browserProviderSettingsBinding, value);
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
    if (isRecord(value) && hasProviderCredentialKey(value.profile)) return false;
    return accepts(browserProviderProfileWriteResultBinding, value);
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
    if (isRecord(value) && hasProviderCredentialKey(value.profile)) return false;
    return accepts(browserProviderProfileDeleteResultBinding, value);
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
    return accepts(browserProviderProfileActivationResultBinding, value);
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
    return accepts(browserActionDetailsResultBinding, value);
}

/**
 * 边界豁免结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserPermissionExemptionResult。
 *
 * @example
 * ```ts
 * if (isPermissionExemptionResult(res)) console.log(res.ok);
 * ```
 */
export function isPermissionExemptionResult(value: unknown): value is BrowserPermissionExemptionResult {
    return accepts(browserPermissionExemptionResultBinding, value);
}

/**
 * 权限档位查询/设置结果守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserPermissionProfileResult。
 *
 * @example
 * ```ts
 * if (isPermissionProfileResult(res)) console.log(res.ok);
 * ```
 */
export function isPermissionProfileResult(value: unknown): value is BrowserPermissionProfileResult {
    return accepts(browserPermissionProfileResultBinding, value);
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
    return accepts(browserWorkspaceContextBinding, value);
}

/**
 * 实时事件类型守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserGoalEvent。
 *
 * @example
 * ```ts
 * if (isLiveEvent(evt)) console.log(evt.type);
 * ```
 */
export function isLiveEvent(value: unknown): value is BrowserGoalEvent {
    const result = browserGoalEventBinding.read(value, "strip");
    return result.ok && isLiveEventStructure(result.data);
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
    return accepts(browserTrajectoryRunBinding, value);
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
export function isTrajectoryRuns(value: unknown): value is BrowserTrajectoryRuns {
    const result = browserTrajectoryRunsBinding.read(value, "strip");
    return result.ok && isNullableSafeInteger(result.data.nextOffset);
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
    return accepts(browserTrajectoryEntryBinding, value);
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
    const result = browserTrajectoryPageBinding.read(value, "strip");
    return result.ok
        && Number.isSafeInteger(result.data.committedThroughSequence)
        && result.data.committedThroughSequence >= 0
        && (result.data.previousCursor === null || typeof result.data.previousCursor === "string")
        && (result.data.nextCursor === null || typeof result.data.nextCursor === "string")
        && isNullableSafeInteger(result.data.locatedSequence);
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
    const result = browserTrajectoryDetailBinding.read(value, "strip");
    return result.ok && hasValidTrajectoryDetail(result.data);
}

/**
 * 会话消息列表响应守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserSessionMessageListResult。
 *
 * @example
 * ```ts
 * if (isSessionMessageList(res)) console.log(res.ok);
 * ```
 */
export function isSessionMessageList(value: unknown): value is BrowserSessionMessageListResult {
    return accepts(browserSessionMessageListBinding, value);
}

/**
 * 单条消息正文响应守卫。
 *
 * @param value - 待检测值。
 * @returns 是否为 BrowserSessionMessageResult。
 *
 * @example
 * ```ts
 * if (isSessionMessage(res)) console.log(res.ok);
 * ```
 */
export function isSessionMessage(value: unknown): value is BrowserSessionMessageResult {
    return accepts(browserSessionMessageBinding, value);
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
export function isModelInputs(value: unknown): value is BrowserModelInputs {
    const result = browserModelInputsBinding.read(value, "strip");
    return result.ok && isNullableSafeInteger(result.data.nextOffset);
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
    return accepts(browserModelInputDetailBinding, value);
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
    const result = sessionMetricsValuesBinding.read(value, "strip");
    return result.ok && hasValidMetricValues(result.data);
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
    const result = sessionMetricsSnapshotBinding.read(value, "strip");
    if (!result.ok) return false;
    return hasValidMetricValues(result.data)
        && hasValidContextUsage(result.data)
        && result.data.runs.every((run) => hasValidMetricValues(run));
}

function accepts<T>(binding: ContractBinding<T>, value: unknown): value is T {
    return binding.read(value, "strip").ok;
}
//
function hasProviderCredentialKey(value: unknown): boolean {
    return isRecord(value) && "apiKey" in value;
}
