import type {
    BrowserActionDetailsResult,
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
import { safeParse } from "../../contracts/src/index";
import {
    hasConsistentTerminalDetail,
    hasNoProviderCredentialKey,
    hasValidContextRemainingPercent,
    isActivityPage,
    isInteractionView,
    isJsonValue,
    isLiveEventStructure,
    isMetricValues as hasValidMetricValues,
    isPlanRoute,
    isRecord,
    isTrajectoryDetail as hasValidTrajectoryDetail,
} from "./invariants";
import {
    browserActivityPageContract,
} from "./contracts/activity";
import {
    acceptedCommandContract,
    browserActionDetailsResultContract,
    browserModelPreferenceResultContract,
    browserModelSelectionResultContract,
    browserPermissionModeResultContract,
    browserToolGrantResultContract,
    browserWorkspaceContextContract,
} from "./contracts/command";
import { browserGoalLiveEventContract } from "./contracts/events";
import {
    browserModelCatalogContract,
    browserModelCatalogReadResultContract,
} from "./contracts/model";
import {
    browserProviderModelsContract,
    browserProviderProfileActivationResultContract,
    browserProviderProfileContract,
    browserProviderProfileDeleteResultContract,
    browserProviderProfileTestResultContract,
    browserProviderProfileWriteResultContract,
    browserProviderSettingsContract,
    browserProviderSettingsReadResultContract,
} from "./contracts/provider";
import {
    sessionMetricsSnapshotContract,
    sessionMetricsValuesContract,
} from "./contracts/metrics";
import {
    browserModelInputDetailContract,
    browserModelInputsContract,
} from "./contracts/model-input";
import {
    browserTrajectoryDetailContract,
    browserTrajectoryEntryContract,
    browserTrajectoryPageContract,
    browserTrajectoryRunContract,
    browserTrajectoryRunsContract,
} from "./contracts/trajectory";
import {
    browserInteractionViewContract,
    browserMessagePositionContract,
    browserRunStatusContract,
    browserSessionInputReceiptContract,
} from "./contracts/common";
import {
    browserActionReviewResultContract,
    browserInteractionDetailResultContract,
} from "./contracts/interaction";
import {
    browserCreateSessionResultContract,
    browserGoalSessionEnvelopeContract,
    browserGoalSessionStateEnvelopeContract,
    browserSessionInputQueryResultContract,
    browserSessionInputResultContract,
    browserSessionStateContract,
} from "./contracts/input";
import {
    browserGoalListItemContract,
    browserGoalListContract,
    browserGoalPlanContract,
    browserGoalSessionContract,
    browserGoalSessionStateContract,
    browserPendingActionContract,
    browserSessionRunContract,
} from "./contracts/session";

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
    return safeParse(browserRunStatusContract, value).success;
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
    return safeParse(acceptedCommandContract, value).success;
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
    return safeParse(browserSessionInputResultContract, value).success;
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
    return safeParse(browserSessionInputReceiptContract, value).success;
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
    return safeParse(browserSessionInputQueryResultContract, value).success;
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
    return safeParse(browserSessionStateContract, value).success;
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
    return safeParse(browserCreateSessionResultContract, value).success;
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
    return safeParse(browserGoalListItemContract, value).success;
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
    return safeParse(browserGoalListContract, value).success;
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
    const parsed = safeParse(browserSessionRunContract, value);
    if (!parsed.success) return false;
    return parsed.data.planRoute === undefined || isPlanRoute(parsed.data.planRoute);
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
    return safeParse(browserGoalPlanContract, value).success;
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
    return safeParse(browserPendingActionContract, value).success;
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
    const parsed = safeParse(browserInteractionViewContract, value);
    return parsed.success && isInteractionView(parsed.data);
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
    return safeParse(browserInteractionDetailResultContract, value).success;
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
    return safeParse(browserActionReviewResultContract, value).success;
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
    const parsed = safeParse(browserGoalSessionContract, value);
    if (!parsed.success) return false;
    return parsed.data.runs.every((run) =>
        run.planRoute === undefined || isPlanRoute(run.planRoute))
        && (parsed.data.interaction === undefined
            || isBrowserInteractionView(parsed.data.interaction));
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
    const parsed = safeParse(browserGoalSessionStateContract, value);
    if (!parsed.success) return false;
    return hasConsistentTerminalDetail(parsed.data)
        && (parsed.data.currentPlanRoute === undefined
            || isPlanRoute(parsed.data.currentPlanRoute))
        && (parsed.data.interaction === undefined
            || isBrowserInteractionView(parsed.data.interaction));
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
    const parsed = safeParse(browserActivityPageContract, value);
    return parsed.success && isActivityPage(parsed.data);
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
    return safeParse(browserGoalSessionEnvelopeContract, value).success;
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
    return safeParse(browserGoalSessionStateEnvelopeContract, value).success;
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
    return safeParse(browserModelCatalogContract, value).success;
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
export function isModelSelectionAccepted(value: unknown): value is { readonly ok: true; readonly goalId: string; readonly runId: string; readonly modelId: string; readonly defaultModelSaved: boolean } {
    const parsed = safeParse(browserModelSelectionResultContract, value);
    return parsed.success && parsed.data.ok;
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
    const parsed = safeParse(browserModelPreferenceResultContract, value);
    return parsed.success && parsed.data.ok;
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
    const parsed = safeParse(browserProviderProfileContract, value);
    return parsed.success && hasNoProviderCredentialKey(parsed.data);
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
    const parsed = safeParse(browserProviderSettingsContract, value);
    return parsed.success
        && parsed.data.profiles.every(hasNoProviderCredentialKey);
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
    const parsed = safeParse(browserProviderProfileWriteResultContract, value);
    return parsed.success
        && (!parsed.data.ok || hasNoProviderCredentialKey(parsed.data.profile));
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
    const parsed = safeParse(browserProviderProfileDeleteResultContract, value);
    return parsed.success
        && (!parsed.data.ok || hasNoProviderCredentialKey(parsed.data.profile));
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
    return safeParse(browserProviderProfileActivationResultContract, value).success;
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
    return safeParse(browserProviderProfileTestResultContract, value).success;
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
    return safeParse(browserActionDetailsResultContract, value).success;
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
    return safeParse(browserToolGrantResultContract, value).success;
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
    return safeParse(browserPermissionModeResultContract, value).success;
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
    return safeParse(browserWorkspaceContextContract, value).success;
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
    const parsed = safeParse(browserGoalLiveEventContract, value);
    return parsed.success && isLiveEventStructure(parsed.data);
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
    return safeParse(browserTrajectoryRunContract, value).success;
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
    return safeParse(browserTrajectoryRunsContract, value).success;
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
    return safeParse(browserTrajectoryEntryContract, value).success;
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
    return safeParse(browserTrajectoryPageContract, value).success;
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
    const parsed = safeParse(browserTrajectoryDetailContract, value);
    return parsed.success && hasValidTrajectoryDetail(parsed.data);
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
    return safeParse(browserModelInputsContract, value).success;
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
    return safeParse(browserModelInputDetailContract, value).success;
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
    const parsed = safeParse(sessionMetricsValuesContract, value);
    return parsed.success && hasValidMetricValues(parsed.data);
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
    const parsed = safeParse(sessionMetricsSnapshotContract, value);
    if (!parsed.success) return false;
    return hasValidMetricValues(parsed.data)
        && hasValidContextRemainingPercent(parsed.data)
        && parsed.data.runs.every((run) => hasValidMetricValues(run));
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
    return safeParse(browserProviderModelsContract, value).success;
}

