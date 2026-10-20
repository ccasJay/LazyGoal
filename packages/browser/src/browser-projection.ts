import { Buffer } from "node:buffer";

import type {
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalStore,
    JsonObject,
    JsonValue,
    Observation,
    RunMode,
    TrajectoryEvent,
    TrajectoryReadQuery,
    TrajectoryReadResult,
} from "../../runtime/src/index";
import { projectInteractionView } from "../../runtime/src/index";
import {
    NETWORK_ALL_OUTBOUND_NOTICE,
    type EffectiveSandboxReview,
} from "../../permission/src/index";
import type {
    BrowserBashExecutionDetail,
    BrowserGoalListItem,
    BrowserGoalPlan,
    BrowserGoalSession,
    BrowserGoalSessionState,
    BrowserActivityActionContext,
    BrowserActivityEventType,
    BrowserActivityFactItem,
    BrowserActivityGap,
    BrowserActivityItem,
    BrowserActivityMessageItem,
    BrowserActivityPage,
    BrowserActivityPosition,
    BrowserActivityQuery,
    BrowserActivityReadResult,
    BrowserActivityRunContext,
    BrowserActivityRunWindow,
    BrowserActivityStageContext,
    BrowserInteractionView,
    BrowserPendingAction,
    BrowserSessionMessage,
    BrowserSessionRun,
    BrowserSessionStep,
    BrowserRunStageGroup,
    BrowserRunStageStatus,
    BrowserPlanRoute,
    BrowserPlanRouteStage,
} from "../../web-contracts/src/index";
import { BROWSER_ACTIVITY_EVENT_TYPES, isRecord } from "../../web-contracts/src/index";

export type {
    BrowserBashExecutionDetail,
    BrowserGoalListItem,
    BrowserGoalPlan,
    BrowserGoalSession,
    BrowserGoalSessionState,
    BrowserInteractionView,
    BrowserPendingAction,
    BrowserSessionMessage,
    BrowserSessionRun,
    BrowserSessionStep,
    BrowserRunStageGroup,
    BrowserRunStageStatus,
    BrowserPlanRoute,
    BrowserPlanRouteStage,
};

const MAX_TEXT_LENGTH = 4_000;
const MAX_MESSAGE_LENGTH = 64_000;
const MAX_ACTION_PREVIEW_LENGTH = 320;
const MAX_MESSAGES = 100;
const MAX_RUNS = 50;
const MAX_STEPS_PER_RUN = 200;
const MAX_STEP_SUMMARY_LENGTH = 1_000;
const MAX_BASH_EXECUTION_DETAILS = 100;
const MAX_BASH_COMMAND_LENGTH = 2_000;
const MAX_BASH_OUTPUT_LENGTH = 4_000;
const MAX_ACTIVITY_CURSOR_LENGTH = 65_536;
const DEFAULT_ACTIVITY_PAGE_SIZE = 50;
const MAX_ACTIVITY_PAGE_SIZE = 100;

interface ActivityCursor {
    readonly version: 1;
    readonly goalId: string;
    readonly runFilter?: string;
    readonly window: readonly BrowserActivityRunWindow[];
    readonly anchor: BrowserActivityPosition;
}

interface ActivityRunSnapshot {
    readonly runId: string;
    readonly status: Goal["state"]["run"]["status"];
    readonly current: boolean;
    readonly runOrder: number;
    readonly messages: readonly Goal["state"]["messages"][number][];
    readonly committedThroughSequence: number;
}

/**
 * 将正式 Goal Catalog 摘要投影为看板白名单条目。
 *
 * @param entries - 正式工作区 Catalog 返回的真实摘要；Benchmark 聚合条目不应传入。
 * @returns 与输入顺序一致的安全条目，不保留输入对象引用。
 * @example
 * ```ts
 * const items = projectBrowserGoalList(await workspaceCatalog.listHistory!());
 * ```
 */
export function projectBrowserGoalList(
    entries: readonly GoalCatalogEntry[],
    activeGoalId?: string,
): readonly BrowserGoalListItem[] {
    return entries.map((entry) => {
        const isActive = activeGoalId !== undefined && entry.goalId === activeGoalId;
        const state = isActive ? "active"
            : (entry.runStatus === "created" || entry.runStatus === "running") ? "recoverable"
                : "inactive";
        return {
            goalId: entry.goalId,
            runId: entry.runId,
            intent: boundedText(entry.intent, MAX_TEXT_LENGTH),
            workflowPhase: entry.workflowPhase,
            runStatus: entry.runStatus,
            execution: {
                state,
                committedThroughSequence: entry.committedThroughSequence ?? 0,
            },
            updatedAt: entry.updatedAt,
            archived: entry.archived === true,
        };
    });
}

/**
 * 从真实正式工作区 Catalog 读取看板条目。
 *
 * @param catalog - 仅指向正式 workspace Goals 目录的目录边界。
 * @returns 全部已持久化真实 Goal；Catalog 错误向调用方传播，不伪造空条目。
 * @throws Catalog 未实现全量历史列表或目录读取失败时拒绝，避免静默漏掉终态 Goal。
 * @example
 * ```ts
 * const goals = await listBrowserGoals(root.workspaceGoalStore);
 * ```
 */
export async function listBrowserGoals(
    catalog: GoalCatalog,
    activeGoalId?: string,
): Promise<readonly BrowserGoalListItem[]> {
    if (catalog.listHistory === undefined) {
        throw new Error("Browser Goal listing requires a full Goal history catalog");
    }
    const entries = await catalog.listHistory();
    return projectBrowserGoalList(entries, activeGoalId);
}

/**
 * 从正式工作区 Snapshot 与各 Run 的已提交 Trajectory 投影浏览器会话。
 *
 * @param goalId - 要恢复的 Goal 稳定标识。
 * @param store - 正式工作区 Snapshot 读取端口；不得传入含 Benchmark 回退行为的聚合 Store。
 * @param readTrajectory - 限定正式工作区并按 Snapshot 边界分类事件的读取器。
 * @returns 最新白名单会话；Goal 不存在时返回 `undefined`，损坏或 I/O 错误向上拒绝。
 * @throws Snapshot 或 Trajectory 无法读取时传播错误，调用方应返回读取错误而非旧视图。
 * @example
 * ```ts
 * const session = await readBrowserGoalSession(goalId, root.workspaceGoalStore, root.readWorkspaceTrajectory);
 * ```
 */
export async function readBrowserGoalSession(
    goalId: string,
    store: Pick<GoalStore, "restore">,
    readTrajectory: (query: TrajectoryReadQuery) => Promise<Readonly<TrajectoryReadResult>>,
    activeGoalId?: string,
): Promise<BrowserGoalSession | undefined> {
    const goal = await store.restore(goalId);
    if (goal === undefined) return undefined;

    const isActive = activeGoalId !== undefined && goal.id === activeGoalId;
    const executionState = isActive ? "active"
        : (goal.state.run.status === "created" || goal.state.run.status === "running") ? "recoverable"
            : "inactive";

    const completedRuns = goal.state.completedRuns ?? [];
    const recentCompletedRuns = completedRuns.slice(-Math.max(0, MAX_RUNS - 1));
    const projectedRuns: BrowserSessionRun[] = [];
    let historyTruncated = completedRuns.length > recentCompletedRuns.length;
    const bashDetailsBudget = { remaining: MAX_BASH_EXECUTION_DETAILS };

    const currentRun = goal.state.run;
    const currentResult = await readTrajectory({ goalId, runId: currentRun.id });
    const currentSteps = projectBrowserSteps(currentRun.id, currentResult.committed, bashDetailsBudget);
    if (currentSteps.length > MAX_STEPS_PER_RUN) historyTruncated = true;
    const currentStages = projectBrowserRunStages(currentResult.committed, currentSteps);
    const currentPlanRoute = currentRun.planRoute === undefined ? undefined : projectBrowserPlanRoute(currentRun.planRoute);
    projectedRuns.push({
        runId: currentRun.id,
        status: currentRun.status,
        stepCount: currentRun.stepCount,
        steps: currentSteps.slice(-MAX_STEPS_PER_RUN),
        current: true,
        ...(currentStages === undefined ? {} : { stages: currentStages }),
        ...(currentPlanRoute === undefined ? {} : { planRoute: currentPlanRoute }),
        ...projectRunTerminalDetail(currentResult.committed, currentRun.status, currentRun.stopReason),
    });

    for (const completed of [...recentCompletedRuns].reverse()) {
        const result = await readTrajectory({ goalId, runId: completed.runId });
        const steps = projectBrowserSteps(completed.runId, result.committed, bashDetailsBudget);
        if (steps.length > MAX_STEPS_PER_RUN) historyTruncated = true;
        const stages = projectBrowserRunStages(result.committed, steps);
        projectedRuns.unshift({
            runId: completed.runId,
            status: completed.status,
            stepCount: completed.stepCount,
            steps: steps.slice(-MAX_STEPS_PER_RUN),
            current: false,
            ...(stages === undefined ? {} : { stages }),
            ...projectRunTerminalDetail(result.committed, completed.status),
        });
    }

    const allMessages = goal.state.messages;
    if (allMessages.length > MAX_MESSAGES) historyTruncated = true;
    const firstMessageIndex = Math.max(0, allMessages.length - MAX_MESSAGES);
    const messages = allMessages.slice(firstMessageIndex).map((message) => {
        return {
            messageId: message.messageId,
            role: message.role,
            content: boundedText(message.content, MAX_MESSAGE_LENGTH),
            runId: message.runId,
            position: { ...message.position },
        };
    });
    if (allMessages.some((message) => message.content.length > MAX_MESSAGE_LENGTH)) {
        historyTruncated = true;
    }

    const pendingTruncated = pendingInteractionDisplayTruncated(currentRun.pendingInteraction);
    const pendingSteers = (currentRun.steerInputs ?? [])
        .filter((input): input is Extract<NonNullable<Goal["state"]["run"]["steerInputs"]>[number], { readonly status: "pending" }> => input.status === "pending")
        .map(({ messageId, content }) => ({ messageId, content: boundedText(content, MAX_MESSAGE_LENGTH) }));
    const queue = goal.state.messageQueue;
    const pendingMessages = (queue?.items ?? [])
        .map((item) => ({ inputId: item.inputId, content: boundedText(item.content, MAX_MESSAGE_LENGTH) }));
    const pendingAction = currentRun.pendingAction === undefined
        ? undefined
        : projectPendingAction(currentRun.pendingAction, currentRun.pendingProgram);
    const interaction = projectBrowserInteractionView(goal, pendingTruncated
        || (pendingAction?.inputPreviewTruncated ?? false));
    const goalPlan = goal.state.goalPlan === undefined
        ? undefined
        : projectGoalPlan(goal.state.goalPlan);

    return {
        goalId: goal.id,
        intent: boundedText(goal.definition.intent, MAX_TEXT_LENGTH),
        currentRunId: currentRun.id,
        runStatus: currentRun.status,
        currentRunMode: currentRun.mode,
        ...(goal.state.nextRunMode === undefined ? {} : { nextRunMode: goal.state.nextRunMode }),
        execution: {
            state: executionState,
            committedThroughSequence: currentRun.committedThroughSequence ?? 0,
        },
        messages,
        ...(pendingSteers.length === 0 ? {} : { pendingSteers }),
        ...(pendingMessages.length === 0 ? {} : { pendingMessages }),
        ...(queue === undefined ? {} : {
            queue: {
                revision: queue.revision,
                paused: queue.pause !== undefined,
                ...(queue.pause === undefined ? {} : { pauseReason: queue.pause.reason }),
            },
        }),
        ...(currentRun.interruption === undefined ? {} : {
            interruption: {
                requestId: currentRun.interruption.requestId,
                status: currentRun.interruption.status,
                repairCallsStarted: currentRun.interruption.repairCallsStarted,
                ...(currentRun.interruption.outcomeUnknown === undefined ? {} : { outcomeUnknown: currentRun.interruption.outcomeUnknown }),
            },
        }),
        runs: projectedRuns,
        ...(goalPlan === undefined ? {} : { goalPlan }),
        ...(interaction === undefined ? {} : { interaction }),
        ...(pendingAction === undefined ? {} : { pendingAction }),
        historyTruncated,
    };
}

/**
 * 只从最新 Snapshot 投影当前 Goal 状态，不读取消息历史或任何 Run Trajectory。
 *
 * @param goalId - 要恢复的 Goal 稳定标识。
 * @param store - 正式工作区 Snapshot 读取端口。
 * @param activeGoalId - 当前服务正持有活动执行预约的 Goal；省略时按 Snapshot 推断。
 * @returns 明确把消息、步骤和阶段历史指向 Activity 的窄状态；Goal 不存在时返回 `undefined`。
 * @throws Snapshot 损坏或底层读取失败时拒绝。
 * @example
 * ```ts
 * const state = await readBrowserGoalSessionState(goalId, root.workspaceGoalStore);
 * ```
 */
export async function readBrowserGoalSessionState(
    goalId: string,
    store: Pick<GoalStore, "restore">,
    activeGoalId?: string,
): Promise<BrowserGoalSessionState | undefined> {
    const goal = await store.restore(goalId);
    if (goal === undefined) return undefined;

    const currentRun = goal.state.run;
    const isActive = activeGoalId !== undefined && goal.id === activeGoalId;
    const executionState = isActive ? "active"
        : (currentRun.status === "created" || currentRun.status === "running") ? "recoverable"
            : "inactive";
    const pendingAction = currentRun.pendingAction === undefined
        ? undefined
        : projectPendingAction(currentRun.pendingAction, currentRun.pendingProgram);
    const interaction = projectBrowserInteractionView(goal, pendingInteractionDisplayTruncated(currentRun.pendingInteraction)
        || (pendingAction?.inputPreviewTruncated ?? false));
    const queue = goal.state.messageQueue;
    const pendingSteers = (currentRun.steerInputs ?? [])
        .filter((input): input is Extract<NonNullable<Goal["state"]["run"]["steerInputs"]>[number], { readonly status: "pending" }> => input.status === "pending")
        .map(({ messageId, content }) => ({ messageId, content: boundedText(content, MAX_MESSAGE_LENGTH) }));
    const pendingMessages = (queue?.items ?? [])
        .map((item) => ({ inputId: item.inputId, content: boundedText(item.content, MAX_MESSAGE_LENGTH) }));
    const goalPlan = goal.state.goalPlan === undefined ? undefined : projectGoalPlan(goal.state.goalPlan);
    const planRoute = currentRun.planRoute === undefined ? undefined : projectBrowserPlanRoute(currentRun.planRoute);

    return {
        goalId: goal.id,
        intent: boundedText(goal.definition.intent, MAX_TEXT_LENGTH),
        currentRunId: currentRun.id,
        runStatus: currentRun.status,
        currentRunMode: currentRun.mode,
        ...(goal.state.nextRunMode === undefined ? {} : { nextRunMode: goal.state.nextRunMode }),
        currentRunStepCount: currentRun.stepCount,
        ...(planRoute === undefined ? {} : { currentPlanRoute: planRoute }),
        execution: {
            state: executionState,
            committedThroughSequence: currentRun.committedThroughSequence ?? 0,
        },
        ...(pendingSteers.length === 0 ? {} : { pendingSteers }),
        ...(pendingMessages.length === 0 ? {} : { pendingMessages }),
        ...(queue === undefined ? {} : {
            queue: {
                revision: queue.revision,
                paused: queue.pause !== undefined,
                ...(queue.pause === undefined ? {} : { pauseReason: queue.pause.reason }),
            },
        }),
        ...(currentRun.interruption === undefined ? {} : {
            interruption: {
                requestId: currentRun.interruption.requestId,
                status: currentRun.interruption.status,
                repairCallsStarted: currentRun.interruption.repairCallsStarted,
                ...(currentRun.interruption.outcomeUnknown === undefined ? {} : { outcomeUnknown: currentRun.interruption.outcomeUnknown }),
            },
        }),
        ...(goalPlan === undefined ? {} : { goalPlan }),
        ...(interaction === undefined ? {} : { interaction }),
        ...(pendingAction === undefined ? {} : { pendingAction }),
        history: {
            messages: { included: false, source: "activity" },
            steps: { included: false, source: "activity" },
            stages: { included: false, source: "activity" },
        },
    };
}

/**
 * 按固定 Snapshot 水位组合有界 Activity 页；已提交事实之外的 Trajectory tail 不会投影。
 *
 * @param goalId - 正式工作区 Goal 身份。
 * @param query - 可选 Run 过滤、互斥双向 cursor 与页大小。
 * @param store - 正式工作区 Goal Snapshot 读取边界。
 * @param readTrajectory - 按 Snapshot 提交边界分类的正式工作区读取器。
 * @returns 最多 100 项的白名单 Activity 页，或稳定的 Goal、Run、cursor 拒绝。
 * @throws Snapshot 或轨迹读取失败时拒绝；文件 JSONL 读取可扫描完整 Run 文件，不承诺磁盘随机访问有界。
 * @example
 * ```ts
 * const page = await readBrowserGoalActivity(goalId, { limit: 50 }, root.workspaceGoalStore, root.readWorkspaceTrajectory);
 * ```
 */
export async function readBrowserGoalActivity(
    goalId: string,
    query: BrowserActivityQuery,
    store: Pick<GoalStore, "restore">,
    readTrajectory: (query: TrajectoryReadQuery) => Promise<Readonly<TrajectoryReadResult>>,
): Promise<BrowserActivityReadResult> {
    const goal = await store.restore(goalId);
    if (goal === undefined) return { ok: false, error: "goal_not_found" };
    const limit = query.limit ?? DEFAULT_ACTIVITY_PAGE_SIZE;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ACTIVITY_PAGE_SIZE) {
        return { ok: false, error: "activity_cursor_invalid" };
    }

    const runSnapshots = projectActivityRunSnapshots(goal);
    const runById = new Map(runSnapshots.map((run) => [run.runId, run]));
    if (query.runId !== undefined && !runById.has(query.runId)) return { ok: false, error: "run_not_found" };

    let window: readonly BrowserActivityRunWindow[];
    let anchor: BrowserActivityPosition | undefined;
    let direction: "before" | "after" | undefined;
    const cursorToken = query.before ?? query.after;
    if (cursorToken !== undefined) {
        const cursor = decodeActivityCursor(cursorToken);
        if (cursor === undefined || cursor.goalId !== goalId || cursor.runFilter !== query.runId) {
            return { ok: false, error: "activity_cursor_invalid" };
        }
        if (!isActivityCursorValid(cursor, runById)) return { ok: false, error: "activity_cursor_invalid" };
        window = cursor.window;
        anchor = cursor.anchor;
        direction = query.before === undefined ? "after" : "before";
    } else {
        const selectedRuns = query.runId === undefined ? runSnapshots : runSnapshots.filter((run) => run.runId === query.runId);
        window = selectedRuns.map((run) => {
            const runMessages = run.messages;
            const lastMessage = runMessages.at(-1);
            return {
                runId: run.runId,
                messageCount: runMessages.length,
                ...(lastMessage === undefined ? {} : { throughMessageId: lastMessage.messageId }),
                committedThroughSequence: run.committedThroughSequence,
            };
        });
    }

    const windowByRun = new Map(window.map((item) => [item.runId, item]));
    const selectedRuns = window.map((item) => runById.get(item.runId)!);
    const activity: BrowserActivityItem[] = [];
    for (const run of selectedRuns) {
        const runWindow = windowByRun.get(run.runId)!;
        const boundedMessages = run.messages.slice(0, runWindow.messageCount);
        if (runWindow.messageCount > 0 && boundedMessages.at(-1)?.messageId !== runWindow.throughMessageId) {
            return { ok: false, error: "activity_cursor_invalid" };
        }
        for (const message of boundedMessages) {
            if (message.position.afterSequence > runWindow.committedThroughSequence) {
                return { ok: false, error: "activity_cursor_invalid" };
            }
            activity.push(projectActivityMessage(message, run));
        }
        const result = await readTrajectory({ goalId, runId: run.runId });
        for (const event of result.committed) {
            if (event.sequence > runWindow.committedThroughSequence || !isBrowserActivityFact(event.eventType)) continue;
            activity.push(projectActivityFact(event, run));
        }
    }
    activity.sort(compareActivityPosition);

    const anchorIndex = anchor === undefined ? undefined : findActivityAnchor(activity, anchor);
    if (anchor !== undefined && (anchorIndex === undefined || anchorIndex < 0)) {
        return { ok: false, error: "activity_cursor_invalid" };
    }
    const startIndex = anchorIndex === undefined ? Math.max(0, activity.length - limit)
        : direction === "before" ? Math.max(0, anchorIndex - limit) : anchorIndex + 1;
    const endIndex = anchorIndex === undefined ? activity.length
        : direction === "before" ? anchorIndex : Math.min(activity.length, startIndex + limit);
    const pageItems = activity.slice(startIndex, endIndex);
    const pageStart = pageItems[0];
    const pageEnd = pageItems.at(-1);
    const gaps: BrowserActivityGap[] = [];
    const olderItems = activity.slice(0, startIndex);
    const olderFirst = olderItems[0];
    const olderLast = olderItems.at(-1);
    if (olderFirst !== undefined && olderLast !== undefined) {
        gaps.push({
            direction: "older",
            itemCount: olderItems.length,
            first: olderFirst.position,
            last: olderLast.position,
        });
    }
    const newerItems = activity.slice(endIndex);
    const newerFirst = newerItems[0];
    const newerLast = newerItems.at(-1);
    if (newerFirst !== undefined && newerLast !== undefined) {
        gaps.push({
            direction: "newer",
            itemCount: newerItems.length,
            first: newerFirst.position,
            last: newerLast.position,
        });
    }
    const olderAvailable = gaps.some((gap) => gap.direction === "older");
    const newerAvailable = gaps.some((gap) => gap.direction === "newer");
    const runs: BrowserActivityRunContext[] = selectedRuns.map((run) => ({
        runId: run.runId,
        status: run.status,
        current: run.current,
        runOrder: run.runOrder,
        committedThroughSequence: windowByRun.get(run.runId)!.committedThroughSequence,
    }));
    const { stages, actionGroups } = projectActivityContexts(activity, pageItems);
    const page: BrowserActivityPage = {
        goalId,
        ...(query.runId === undefined ? {} : { runFilter: query.runId }),
        limit,
        items: pageItems,
        runs,
        window,
        gaps,
        range: {
            ...(pageStart === undefined ? {} : { first: pageStart.position }),
            ...(pageEnd === undefined ? {} : { last: pageEnd.position }),
            olderAvailable,
            newerAvailable,
        },
        stages,
        actionGroups,
        ...(olderAvailable && pageStart !== undefined ? { beforeCursor: encodeActivityCursor({
            version: 1, goalId, ...(query.runId === undefined ? {} : { runFilter: query.runId }), window,
            anchor: pageStart.position,
        }) } : {}),
        ...(newerAvailable && pageEnd !== undefined ? { afterCursor: encodeActivityCursor({
            version: 1, goalId, ...(query.runId === undefined ? {} : { runFilter: query.runId }), window,
            anchor: pageEnd.position,
        }) } : {}),
    };
    return { ok: true, page };
}

function projectActivityRunSnapshots(goal: Goal): ActivityRunSnapshot[] {
    const messagesByRun = new Map<string, Goal["state"]["messages"][number][]>();
    for (const message of goal.state.messages) {
        const messages = messagesByRun.get(message.runId) ?? [];
        messages.push(message);
        messagesByRun.set(message.runId, messages);
    }
    const completed = goal.state.completedRuns ?? [];
    const snapshots: ActivityRunSnapshot[] = completed.map((run, runOrder) => ({
        runId: run.runId,
        status: run.status,
        current: false,
        runOrder,
        messages: messagesByRun.get(run.runId) ?? [],
        committedThroughSequence: run.committedThroughSequence,
    }));
    snapshots.push({
        runId: goal.state.run.id,
        status: goal.state.run.status,
        current: true,
        runOrder: snapshots.length,
        messages: messagesByRun.get(goal.state.run.id) ?? [],
        committedThroughSequence: goal.state.run.committedThroughSequence ?? 0,
    });
    return snapshots;
}

function projectActivityMessage(
    message: Goal["state"]["messages"][number],
    run: ActivityRunSnapshot,
): BrowserActivityMessageItem {
    const summary = boundedActivityMessage(message.content, 4_000);
    return {
        type: "message",
        itemId: `message:${message.messageId}`,
        messageId: message.messageId,
        role: message.role,
        runId: run.runId,
        position: {
            runId: run.runId,
            runOrder: run.runOrder,
            sequence: message.position.afterSequence,
            itemKind: "message",
            order: message.position.order,
        },
        content: summary.content,
        contentLength: message.content.length,
        truncated: summary.truncated,
    };
}

function projectActivityFact(event: TrajectoryEvent, run: ActivityRunSnapshot): BrowserActivityFactItem {
    const payload = event.payload;
    const stageId = payload.type === "run_stage_declared" || payload.type === "run_stage_accepted" || payload.type === "run_stage_rejected"
        ? payload.stageId : undefined;
    const stageRevision = payload.type === "run_stage_declared" || payload.type === "run_stage_accepted" || payload.type === "run_stage_rejected"
        ? payload.revision : undefined;
    const actionId = event.actionId
        ?? ("actionId" in payload ? payload.actionId : undefined)
        ?? (payload.type === "action_staged" ? payload.action.actionId : undefined);
    return {
        type: "fact",
        itemId: `event:${event.eventId}`,
        eventId: event.eventId,
        runId: run.runId,
        position: {
            runId: run.runId,
            runOrder: run.runOrder,
            sequence: event.sequence,
            itemKind: "fact",
            order: 0,
        },
        eventType: event.eventType as BrowserActivityEventType,
        title: activityEventTitle(event.eventType as BrowserActivityEventType),
        ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
        ...(actionId === undefined ? {} : { actionId }),
        ...(stageId === undefined ? {} : { stageId }),
        ...(stageRevision === undefined ? {} : { stageRevision }),
    };
}

function activityEventTitle(eventType: BrowserActivityEventType): string {
    const titles: Record<BrowserActivityEventType, string> = {
        run_created: "Run created",
        run_started: "Run started",
        run_waiting: "Waiting for input",
        run_completed: "Run completed",
        run_failed: "Run failed",
        run_cancelled: "Run cancelled",
        run_stage_declared: "Stage started",
        run_stage_accepted: "Stage accepted",
        run_stage_rejected: "Stage revised",
        decision_received: "Decision received",
        action_staged: "Action staged",
        action_approved: "Action approved",
        action_revised: "Action revised",
        action_rejected: "Action rejected",
        tool_started: "Tool started",
        tool_attempt_started: "Tool retry started",
        tool_attempt_failed: "Tool attempt failed",
        tool_finished: "Tool finished",
        observation_recorded: "Observation recorded",
        ask_user_answered: "Question answered",
        ask_user_replied: "Reply submitted",
        ask_user_skipped: "Question skipped",
        task_approved: "Task approved",
        task_feedback_received: "Plan feedback received",
        session_input_applied: "Queued input applied",
        steer_input_applied: "Steer applied",
    };
    return titles[eventType];
}

function isBrowserActivityFact(eventType: string): eventType is BrowserActivityEventType {
    return (BROWSER_ACTIVITY_EVENT_TYPES as readonly string[]).includes(eventType);
}

function compareActivityPosition(left: BrowserActivityItem, right: BrowserActivityItem): number {
    return left.position.runOrder - right.position.runOrder
        || left.position.sequence - right.position.sequence
        || (left.position.itemKind === right.position.itemKind ? 0 : left.position.itemKind === "fact" ? -1 : 1)
        || left.position.order - right.position.order;
}

function findActivityAnchor(items: readonly BrowserActivityItem[], anchor: BrowserActivityPosition): number {
    return items.findIndex((item) => comparePosition(item.position, anchor) === 0);
}

function comparePosition(left: BrowserActivityPosition, right: BrowserActivityPosition): number {
    return left.runOrder - right.runOrder
        || left.sequence - right.sequence
        || (left.itemKind === right.itemKind ? 0 : left.itemKind === "fact" ? -1 : 1)
        || left.order - right.order;
}

function encodeActivityCursor(cursor: ActivityCursor): string {
    return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeActivityCursor(token: string): ActivityCursor | undefined {
    if (token.length === 0 || token.length > MAX_ACTIVITY_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) return undefined;
    try {
        const parsed: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
        if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.goalId !== "string"
            || (parsed.runFilter !== undefined && typeof parsed.runFilter !== "string")
            || !Array.isArray(parsed.window) || !isBrowserActivityPosition(parsed.anchor)) return undefined;
        if (!parsed.window.every(isBrowserActivityRunWindow)) return undefined;
        return {
            version: 1,
            goalId: parsed.goalId,
            ...(parsed.runFilter === undefined ? {} : { runFilter: parsed.runFilter }),
            window: parsed.window,
            anchor: parsed.anchor,
        };
    } catch {
        return undefined;
    }
}

function isBrowserActivityRunWindow(value: unknown): value is BrowserActivityRunWindow {
    return isRecord(value)
        && typeof value.runId === "string"
        && Number.isSafeInteger(value.messageCount) && Number(value.messageCount) >= 0
        && (value.throughMessageId === undefined || typeof value.throughMessageId === "string")
        && Number.isSafeInteger(value.committedThroughSequence) && Number(value.committedThroughSequence) >= 0;
}

function isBrowserActivityPosition(value: unknown): value is BrowserActivityPosition {
    return isRecord(value)
        && typeof value.runId === "string"
        && Number.isSafeInteger(value.runOrder) && Number(value.runOrder) >= 0
        && Number.isSafeInteger(value.sequence) && Number(value.sequence) >= 0
        && (value.itemKind === "fact" || value.itemKind === "message")
        && Number.isSafeInteger(value.order) && Number(value.order) >= 0;
}

function isActivityCursorValid(cursor: ActivityCursor, runs: ReadonlyMap<string, ActivityRunSnapshot>): boolean {
    let previousRunOrder = -1;
    const runIds = new Set<string>();
    for (const bound of cursor.window) {
        const run = runs.get(bound.runId);
        if (run === undefined || runIds.has(bound.runId) || run.runOrder <= previousRunOrder
            || bound.messageCount > run.messages.length
            || bound.committedThroughSequence > run.committedThroughSequence
            || (bound.messageCount === 0 && bound.throughMessageId !== undefined)
            || (bound.messageCount > 0 && run.messages[bound.messageCount - 1]?.messageId !== bound.throughMessageId)) return false;
        previousRunOrder = run.runOrder;
        runIds.add(bound.runId);
    }
    if (cursor.window.length === 0 || (cursor.runFilter !== undefined
        && (cursor.window.length !== 1 || cursor.window[0]?.runId !== cursor.runFilter))) return false;
    const anchorRun = runs.get(cursor.anchor.runId);
    const anchorWindow = cursor.window.find((item) => item.runId === cursor.anchor.runId);
    return anchorRun !== undefined && anchorWindow !== undefined
        && cursor.anchor.runOrder === anchorRun.runOrder
        && cursor.anchor.sequence <= anchorWindow.committedThroughSequence
        && (cursor.anchor.itemKind !== "message" || cursor.anchor.order < anchorWindow.messageCount);
}

function projectActivityContexts(
    allItems: readonly BrowserActivityItem[],
    pageItems: readonly BrowserActivityItem[],
): { readonly stages: readonly BrowserActivityStageContext[]; readonly actionGroups: readonly BrowserActivityActionContext[] } {
    const stageKey = (item: BrowserActivityFactItem): string | undefined => item.stageId === undefined
        ? undefined : `${item.runId}\u0000${item.stageId}`;
    const actionKey = (item: BrowserActivityFactItem): string | undefined => item.actionId === undefined
        ? undefined : `${item.runId}\u0000${item.actionId}`;
    const stageItems = allItems.filter((item): item is BrowserActivityFactItem => item.type === "fact" && stageKey(item) !== undefined);
    const actionItems = allItems.filter((item): item is BrowserActivityFactItem => item.type === "fact" && actionKey(item) !== undefined);
    const pageStageItems = pageItems.filter((item): item is BrowserActivityFactItem => item.type === "fact" && stageKey(item) !== undefined);
    const pageActionItems = pageItems.filter((item): item is BrowserActivityFactItem => item.type === "fact" && actionKey(item) !== undefined);
    const stages: BrowserActivityStageContext[] = [];
    for (const key of new Set(pageStageItems.map(stageKey).filter((value): value is string => value !== undefined))) {
        const members = stageItems.filter((item) => stageKey(item) === key);
        const visible = pageStageItems.filter((item) => stageKey(item) === key);
        const first = members[0]!;
        const last = members.at(-1)!;
        const lastEvent = last.eventType;
        stages.push({
            runId: first.runId,
            stageId: first.stageId!,
            revision: last.stageRevision ?? first.stageRevision ?? 1,
            status: lastEvent === "run_stage_accepted" ? "accepted" : lastEvent === "run_stage_rejected" ? "rejected" : "executing",
            firstSequence: first.position.sequence,
            ...(last.position.sequence === first.position.sequence ? {} : { lastSequence: last.position.sequence }),
            completeWithinPage: visible.length === members.length,
        });
    }
    const actionGroups: BrowserActivityActionContext[] = [];
    for (const key of new Set(pageActionItems.map(actionKey).filter((value): value is string => value !== undefined))) {
        const members = actionItems.filter((item) => actionKey(item) === key);
        const visible = pageActionItems.filter((item) => actionKey(item) === key);
        const first = members[0]!;
        const last = members.at(-1)!;
        actionGroups.push({
            runId: first.runId,
            actionId: first.actionId!,
            firstSequence: first.position.sequence,
            lastSequence: last.position.sequence,
            completeWithinPage: visible.length === members.length,
        });
    }
    return { stages, actionGroups };
}

function boundedActivityMessage(value: string, maxLength: number): { readonly content: string; readonly truncated: boolean } {
    let end = Math.min(value.length, maxLength);
    if (end < value.length && end > 0) {
        const previous = value.charCodeAt(end - 1);
        const next = value.charCodeAt(end);
        if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end -= 1;
    }
    return { content: value.slice(0, end), truncated: end < value.length };
}

function projectBrowserPlanRoute(route: NonNullable<Goal["state"]["run"]["planRoute"]>): BrowserPlanRoute {
    return {
        revision: route.revision,
        ...(route.revisionReason === undefined ? {} : { revisionReason: boundedText(route.revisionReason, 1_000) }),
        nextStageIndex: route.nextStageIndex,
        stages: route.stages.map((stage) => ({
            stageId: stage.stageId,
            revision: stage.revision,
            status: stage.status,
            target: boundedText(stage.target, 1_000),
            acceptanceCriteria: stage.acceptanceCriteria.map((criterion) => boundedText(criterion, 500)),
            ...(stage.acceptedSequence === undefined ? {} : { acceptedSequence: stage.acceptedSequence }),
        })),
    };
}

function projectPendingAction(
    action: NonNullable<Goal["state"]["run"]["pendingAction"]>,
    program?: Goal["state"]["run"]["pendingProgram"],
): NonNullable<BrowserGoalSession["pendingAction"]> {
    const completeInput = JSON.stringify(action.action.input);
    const inputPreview = boundedText(completeInput, MAX_ACTION_PREVIEW_LENGTH);
    const input = action.action.input;
    const command = action.action.toolId === "bash" ? readBashCommand(input) : undefined;
    const inputSummary = command === undefined ? projectToolInputSummary(action.action.toolId, input)
        : boundedText(command, MAX_ACTION_PREVIEW_LENGTH);
    const targetPath = isJsonObject(input)
        && (action.action.toolId === "write_file" || action.action.toolId === "edit_file")
        && typeof input.path === "string"
        ? boundedText(input.path, MAX_ACTION_PREVIEW_LENGTH)
        : undefined;
    let sandboxReview: EffectiveSandboxReview | undefined = undefined;
    if (action.effectiveSandboxScope !== undefined) {
        const { extraFiles, network } = action.effectiveSandboxScope;
        if (extraFiles.length > 0 || network !== "none") {
            sandboxReview = {
                extraFiles,
                network,
                ...(network === "all_outbound" ? { networkNotice: NETWORK_ALL_OUTBOUND_NOTICE } : {}),
            };
        }
    }

    return {
        actionId: action.action.actionId,
        toolId: action.action.toolId,
        status: action.status,
        ...(inputSummary === undefined ? {} : { inputSummary }),
        inputPreview,
        inputPreviewTruncated: completeInput.length > MAX_ACTION_PREVIEW_LENGTH,
        ...(targetPath === undefined ? {} : { targetPath }),
        ...(action.approvalKind === undefined ? {} : { approvalKind: action.approvalKind }),
        ...(sandboxReview === undefined ? {} : { sandboxReview }),
        ...(program === undefined ? {} : {
            parentProgram: { actionId: program.action.actionId, callNumber: program.nextCallIndex + 1 },
        }),
    };
}

/**
 * 只使用已提交 Trajectory 事件构造浏览器步骤；未提交 tail 应由调用方省略。
 */
function projectBrowserSteps(
    runId: string,
    committedEvents: readonly TrajectoryEvent[],
    bashDetailsBudget: { remaining: number },
): readonly BrowserSessionStep[] {
    const sortedCommitted = [...committedEvents].sort((left, right) => left.sequence - right.sequence);
    const unitStageMap = new Map<string, string>();
    let currentStageId: string | undefined = undefined;
    for (const event of sortedCommitted) {
        if (event.payload.type === "run_stage_declared") {
            currentStageId = event.payload.stageId;
        }
        if (event.executionUnitId !== undefined && currentStageId !== undefined) {
            if (!unitStageMap.has(event.executionUnitId)) {
                unitStageMap.set(event.executionUnitId, currentStageId);
            }
        }
    }

    const actionByExecutionUnit = new Map<string, string | null>();
    for (const event of committedEvents) {
        if (event.programId !== undefined) continue;
        if (event.executionUnitId === undefined) continue;
        const actionId = trajectoryActionId(event);
        if (actionId === undefined) continue;
        const existing = actionByExecutionUnit.get(event.executionUnitId);
        if (existing === undefined) actionByExecutionUnit.set(event.executionUnitId, actionId);
        else if (existing !== actionId) actionByExecutionUnit.set(event.executionUnitId, null);
    }

    const groups = new Map<string, TrajectoryEvent[]>();
    const thinkUnits = new Set(committedEvents.filter((event) => event.eventType === "think_requested")
        .map((event) => event.executionUnitId));
    for (const event of committedEvents) {
        if (event.programId !== undefined) continue;
        if (event.executionUnitId === undefined) continue;
        if (event.eventType === "think_requested" || event.eventType === "think_completed") continue;
        const actionId = trajectoryActionId(event)
            ?? actionByExecutionUnit.get(event.executionUnitId)
            ?? undefined;
        const groupId = actionId === undefined ? `unit:${event.executionUnitId}` : `action:${actionId}`;
        const group = groups.get(groupId) ?? [];
        group.push(event);
        groups.set(groupId, group);
    }

    const steps: BrowserSessionStep[] = [];
    const sourceRangeByEventId = new Map<string, { readonly first: number; readonly last: number }>();
    for (const request of sortedCommitted) {
        if (request.eventType !== "think_requested" || request.executionUnitId === undefined) continue;
        const completed = sortedCommitted.find((event) => event.eventType === "think_completed"
            && event.payload.requestId === request.payload.requestId
            && event.executionUnitId === request.executionUnitId);
        const output = completed?.eventType === "think_completed" ? completed.payload.output : undefined;
        const stopped = sortedCommitted.some((event) => event.sequence > request.sequence
            && ["run_failed", "run_cancelled"].includes(event.eventType));
        const source = completed ?? request;
        steps.push({
            runId, executionUnitId: request.executionUnitId,
            sourceEventId: request.eventId, sequence: request.sequence,
            stepIndex: request.payload.stepOrdinal,
            decisionKind: "request_think",
            status: output !== undefined ? "completed" : stopped ? "failed" : "recorded",
            ...(unitStageMap.has(request.executionUnitId) ? { stageId: unitStageMap.get(request.executionUnitId)! } : {}),
            think: {
                goal: boundedText(request.payload.goal, MAX_TEXT_LENGTH),
                ...(output === undefined ? {} : { output: boundedText(output, MAX_MESSAGE_LENGTH) }),
                ...(request.payload.goal.length > MAX_TEXT_LENGTH || (output?.length ?? 0) > MAX_MESSAGE_LENGTH
                    ? { truncated: true as const } : {}),
            },
        });
        sourceRangeByEventId.set(request.eventId, { first: request.sequence, last: source.sequence });
    }
    for (const events of groups.values()) {
        events.sort((left, right) => left.sequence - right.sequence);
        const first = thinkUnits.has(events[0]?.executionUnitId)
            ? events.find((event) => event.eventType === "decision_received" || event.eventType === "action_staged"
                || event.eventType === "tool_started" || event.eventType === "observation_recorded")
            : events[0];
        if (first === undefined) continue;

        const executionUnitId = first.executionUnitId;
        if (executionUnitId === undefined) continue;
        let decisionKind: string | undefined;
        let toolId: string | undefined;
        let actionStatus: BrowserSessionStep["actionStatus"];
        let status: BrowserSessionStep["status"] = "recorded";
        let summary: string | undefined;
        let inputSummary: string | undefined;
        let bashCommand: string | undefined;
        let bashObservation: Observation | undefined;
        const recoveryAttempts: string[] = [];

        for (const event of events) {
            const payload = event.payload;
            if (payload.type === "decision_received") {
                decisionKind = payload.decision.kind;
                if (payload.decision.kind === "tool_call") {
                    toolId = payload.decision.action.toolId;
                }
            } else if (payload.type === "action_staged") {
                toolId = payload.action.toolId;
                inputSummary = projectToolInputSummary(toolId, payload.action.input);
                actionStatus = payload.approvalStatus;
                if (payload.action.toolId === "bash") {
                    bashCommand = readBashCommand(payload.action.input);
                }
            } else if (payload.type === "action_approved") {
                actionStatus = "approved";
            } else if (payload.type === "action_revised") {
                actionStatus = "approved";
            } else if (payload.type === "action_rejected") {
                actionStatus = "rejected";
                status = "rejected";
            } else if (payload.type === "observation_recorded") {
                bashObservation = payload.observation;
                if (payload.observation.kind === "success") {
                    status = "completed";
                    summary = boundedText(payload.observation.summary, MAX_STEP_SUMMARY_LENGTH);
                } else if (payload.observation.kind === "failure") {
                    status = "failed";
                    summary = boundedText(payload.observation.message, MAX_STEP_SUMMARY_LENGTH);
                } else {
                    status = "rejected";
                }
            } else if (payload.type === "tool_finished") {
                // A recovery checkpoint can adopt an old uncommitted tail; without the
                // persisted Observation it must not present a Tool result as a saved Step.
                toolId = payload.toolId;
            } else if (payload.type === "tool_started") {
                toolId = payload.toolId;
                inputSummary = projectToolInputSummary(toolId, payload.input);
                if (toolId === "bash") bashCommand = readBashCommand(payload.input);
            } else if (payload.type === "tool_attempt_started") {
                recoveryAttempts.push(`Tool attempt ${payload.attempt}`);
            } else if (payload.type === "tool_attempt_failed") {
                recoveryAttempts.push(`Tool retry ${payload.attempt} failed: ${boundedText(payload.reason, 160)}`);
            } else if (payload.type === "model_repair_attempt_started") {
                if (payload.attempt > 1) recoveryAttempts.push(`${payload.stage} output retry ${payload.attempt}`);
            } else if (payload.type === "model_repair_feedback_recorded") {
                recoveryAttempts.push(`${payload.feedback.stage} repair feedback: ${payload.feedback.code}`);
            } else if (payload.type === "model_request_retry_recorded") {
                recoveryAttempts.push(`${payload.stage} model request attempt ${payload.attempt} failed: ${payload.reason}${payload.status === undefined ? "" : ` HTTP ${payload.status}`}`);
            }
        }

        // 仅包含阶段声明、接受或拒绝等阶段控制事实且无业务行为的单元不作为 Step 展示。
        const isStageControlOnly = events.every((event) =>
            event.payload.type === "run_stage_declared"
            || event.payload.type === "run_stage_accepted"
            || event.payload.type === "run_stage_rejected"
        );
        if (isStageControlOnly) continue;

        // complete 决策由 Run 终态展示，不另列一条没有 Action 的重复步骤。
        if (decisionKind === "complete" && toolId === undefined) continue;

        let bashExecution: BrowserBashExecutionDetail | undefined;
        let bashExecutionOmitted: true | undefined;
        if (toolId === "bash" && bashCommand !== undefined) {
            if (bashDetailsBudget.remaining > 0) {
                bashDetailsBudget.remaining -= 1;
                bashExecution = projectBashExecution(bashCommand, bashObservation);
            } else {
                bashExecutionOmitted = true;
            }
        }

        const stageId = unitStageMap.get(executionUnitId);
        steps.push({
            runId,
            executionUnitId,
            sequence: first.sequence,
            stepIndex: first.stepIndex ?? steps.length + 1,
            sourceEventId: first.eventId,
            ...(actionByExecutionUnit.get(executionUnitId) === undefined || actionByExecutionUnit.get(executionUnitId) === null
                ? {} : { actionId: actionByExecutionUnit.get(executionUnitId)! }),
            ...(stageId === undefined ? {} : { stageId }),
            ...(decisionKind === undefined ? {} : { decisionKind }),
            ...(toolId === undefined ? {} : { toolId }),
            ...(actionStatus === undefined ? {} : { actionStatus }),
            status,
            ...(summary === undefined ? {} : { summary }),
            ...(inputSummary === undefined ? {} : { inputSummary }),
            ...(bashExecution === undefined ? {} : { bashExecution }),
            ...(bashExecutionOmitted === undefined ? {} : { bashExecutionOmitted }),
            ...(recoveryAttempts.length === 0 ? {} : { recoveryAttempts }),
        });
        sourceRangeByEventId.set(first.eventId, {
            first: first.sequence,
            last: events.at(-1)?.sequence ?? first.sequence,
        });
    }
    const orderedSteps = steps.sort((left, right) => left.sequence - right.sequence);
    let previousRange: { readonly last: number; readonly stageId?: string } | undefined;
    return orderedSteps.map((step) => {
        const range = step.sourceEventId === undefined ? undefined : sourceRangeByEventId.get(step.sourceEventId);
        const hasBoundaryInStep = range !== undefined && sortedCommitted.some((event) =>
            event.sequence >= range.first && event.sequence <= range.last && isActivityBoundaryEvent(event));
        const boundaryBefore = previousRange !== undefined
            && (hasBoundaryInStep || previousRange.stageId !== step.stageId
                || range === undefined || !hasVerifiedActivityBridge(previousRange.last, range.first, sortedCommitted));
        if (range !== undefined) previousRange = { last: range.last, ...(step.stageId === undefined ? {} : { stageId: step.stageId }) };
        return boundaryBefore ? { ...step, activityBoundaryBefore: true as const } : step;
    });
}

function hasVerifiedActivityBridge(previousSequence: number, nextSequence: number, events: readonly TrajectoryEvent[]): boolean {
    if (nextSequence <= previousSequence) return false;
    let expectedSequence = previousSequence + 1;
    for (const event of events) {
        if (event.sequence <= previousSequence || event.sequence >= nextSequence) continue;
        if (event.sequence !== expectedSequence || isActivityBoundaryEvent(event) || !isTransparentActivityBridge(event)) return false;
        expectedSequence += 1;
    }
    return expectedSequence === nextSequence;
}

function isActivityBoundaryEvent(event: TrajectoryEvent): boolean {
    const payload = event.payload;
    if (payload.type === "decision_received") return payload.decision.kind !== "tool_call";
    return payload.type === "run_waiting"
        || payload.type === "ask_user_answered"
        || payload.type === "ask_user_replied"
        || payload.type === "ask_user_skipped"
        || payload.type === "task_approved"
        || payload.type === "task_feedback_received"
        || payload.type === "run_stage_declared"
        || payload.type === "run_stage_accepted"
        || payload.type === "run_stage_rejected"
        || payload.type === "run_plan_route_revised"
        || payload.type === "run_completed"
        || payload.type === "run_failed"
        || payload.type === "run_cancelled"
        || payload.type === "execution_error"
        || payload.type === "action_rejected"
        || payload.type === "action_reexecution_declined";
}

function isTransparentActivityBridge(event: TrajectoryEvent): boolean {
    const type = event.payload.type;
    if (type === "decision_received") return event.payload.decision.kind === "tool_call";
    return type === "action_staged"
        || type === "action_approved"
        || type === "action_revised"
        || type === "action_reexecution_authorized"
        || type === "action_recovered"
        || type === "tool_started"
        || type === "tool_attempt_started"
        || type === "tool_attempt_failed"
        || type === "tool_finished"
        || type === "observation_recorded"
        || type === "state_committed"
        || type === "model_context_frame"
        || type === "model_response_received"
        || type === "model_repair_attempt_started"
        || type === "model_repair_feedback_recorded"
        || type === "model_request_retry_recorded"
        || type === "think_requested"
        || type === "think_completed"
        || type === "context_lookup_requested"
        || type === "context_lookup_completed"
        || type === "context_lookup_not_found"
        || type === "context_lookup_failed"
        || type === "memory_patch_accepted";
}

interface MutableStageGroup {
    stageId: string;
    revision: number;
    target: string;
    acceptanceCriteria: string[];
    status: BrowserRunStageStatus;
    resultSummary?: string;
    latestReviewRejection?: { code: string; issues: readonly string[] };
    previousStageResultRef?: { stageId: string; revision: number };
    revisions: { revision: number; target: string; reason?: string }[];
}

/**
 * 从已提交轨迹事件与已投影步骤中聚合阶段分组。
 *
 * @remarks
 * 按阶段首次声明顺序保留阶段分组，聚合同一阶段的多轮修订、状态、验收条件、
 * 审查拒绝反馈以及归属于该阶段的真实步骤。若轨迹未包含阶段事件，则返回 `undefined`。
 *
 * @param committedEvents - 当前 Run 已提交的轨迹事件列表。
 * @param steps - 已投影并关联 stageId 的浏览器步骤列表。
 * @returns 阶段分组列表；若无阶段则返回 `undefined`。
 *
 * @example
 * ```ts
 * const stages = projectBrowserRunStages(committedEvents, steps);
 * ```
 */
export function projectBrowserRunStages(
    committedEvents: readonly TrajectoryEvent[],
    steps: readonly BrowserSessionStep[],
): readonly BrowserRunStageGroup[] | undefined {
    const stageIds: string[] = [];
    const stagesMap = new Map<string, MutableStageGroup>();

    const sortedEvents = [...committedEvents].sort((left, right) => left.sequence - right.sequence);
    for (const event of sortedEvents) {
        const payload = event.payload;
        if (payload.type === "run_stage_declared") {
            const { stageId, revision, target, acceptanceCriteria, previousStageResultRef, reason } = payload;
            let group = stagesMap.get(stageId);
            if (!group) {
                stageIds.push(stageId);
                const newGroup: MutableStageGroup = {
                    stageId,
                    revision,
                    target: boundedText(target, MAX_TEXT_LENGTH),
                    acceptanceCriteria: (acceptanceCriteria ?? []).map((c) => boundedText(c, MAX_TEXT_LENGTH)),
                    status: "in_progress",
                    ...(previousStageResultRef !== undefined
                        ? { previousStageResultRef: { stageId: previousStageResultRef.stageId, revision: previousStageResultRef.sequence } }
                        : {}),
                    revisions: [{
                        revision,
                        target: boundedText(target, MAX_TEXT_LENGTH),
                        ...(reason !== undefined ? { reason: boundedText(reason, MAX_TEXT_LENGTH) } : {}),
                    }],
                };
                stagesMap.set(stageId, newGroup);
            } else {
                group.revision = revision;
                group.target = boundedText(target, MAX_TEXT_LENGTH);
                if (acceptanceCriteria !== undefined) {
                    group.acceptanceCriteria = acceptanceCriteria.map((c) => boundedText(c, MAX_TEXT_LENGTH));
                }
                group.status = "in_progress";
                if (previousStageResultRef !== undefined) {
                    group.previousStageResultRef = { stageId: previousStageResultRef.stageId, revision: previousStageResultRef.sequence };
                }
                group.revisions.push({
                    revision,
                    target: boundedText(target, MAX_TEXT_LENGTH),
                    ...(reason !== undefined ? { reason: boundedText(reason, MAX_TEXT_LENGTH) } : {}),
                });
            }
        } else if (payload.type === "run_stage_rejected") {
            const { stageId, feedback } = payload;
            const group = stagesMap.get(stageId);
            if (group) {
                group.status = "in_progress";
                group.latestReviewRejection = {
                    code: "stage_rejected",
                    issues: [boundedText(feedback, MAX_STEP_SUMMARY_LENGTH)],
                };
            }
        } else if (payload.type === "run_stage_accepted") {
            const { stageId, summary } = payload;
            const group = stagesMap.get(stageId);
            if (group) {
                group.status = "accepted";
                if (summary !== undefined) {
                    group.resultSummary = boundedText(summary, MAX_STEP_SUMMARY_LENGTH);
                }
            }
        }
    }

    if (stageIds.length === 0) {
        return undefined;
    }

    const stageStepsMap = new Map<string, BrowserSessionStep[]>();
    for (const step of steps) {
        if (step.stageId !== undefined) {
            const list = stageStepsMap.get(step.stageId) ?? [];
            list.push(step);
            stageStepsMap.set(step.stageId, list);
        }
    }

    return stageIds.map((id) => {
        const group = stagesMap.get(id)!;
        return {
            stageId: group.stageId,
            revision: group.revision,
            target: group.target,
            acceptanceCriteria: group.acceptanceCriteria,
            status: group.status,
            ...(group.resultSummary !== undefined ? { resultSummary: group.resultSummary } : {}),
            ...(group.latestReviewRejection !== undefined ? { latestReviewRejection: group.latestReviewRejection } : {}),
            ...(group.previousStageResultRef !== undefined ? { previousStageResultRef: group.previousStageResultRef } : {}),
            revisions: group.revisions,
            steps: stageStepsMap.get(id) ?? [],
        };
    });
}

function projectRunTerminalDetail(
    events: readonly TrajectoryEvent[],
    status: Goal["state"]["run"]["status"],
    stopReason?: Goal["state"]["run"]["stopReason"],
): Pick<BrowserSessionRun, "terminalDetail"> | Record<string, never> {
    if (status === "failed" && stopReason?.kind === "execution_error") {
        return { terminalDetail: { code: stopReason.code, message: boundedText(stopReason.message, MAX_STEP_SUMMARY_LENGTH) } };
    }
    for (const event of [...events].reverse()) {
        const payload = event.payload;
        if (payload.type === "run_failed" || payload.type === "execution_error") {
            return { terminalDetail: { code: String(payload.code), message: boundedText(payload.message, MAX_STEP_SUMMARY_LENGTH) } };
        }
        if (status === "waiting" && payload.type === "run_waiting") {
            return { terminalDetail: { message: boundedText(payload.reason, MAX_STEP_SUMMARY_LENGTH) } };
        }
    }
    return {};
}

function projectBrowserInteractionView(
    goal: Goal,
    truncatedDisplay: boolean,
): BrowserInteractionView | undefined {
    const view = projectInteractionView(goal);
    if (view === undefined) return undefined;
    return {
        goalId: view.goalId,
        runId: view.runId,
        kind: view.kind,
        interactionId: view.interactionId,
        ...(view.kind === "question" || view.kind === "task_approval"
            ? { requestId: view.requestId }
            : { actionId: view.actionId }),
        ...(view.kind === "action_recovery" ? { recoveryRef: view.recoveryRef } : {}),
        decisions: view.decisions,
        truncated: truncatedDisplay,
    };
}

/** 有界摘要是否省略了问答／任务提案的决定内容；越界内容必须经详情读取查看。 */
function pendingInteractionDisplayTruncated(
    pending: Goal["state"]["run"]["pendingInteraction"],
): boolean {
    if (pending === undefined) return false;
    if (pending.kind === "ask_user") {
        const routeRevision = pending.routeRevision;
        return pending.questions.some((question) =>
            exceeds(question.header, 500)
            || exceeds(question.question, 2_000)
            || question.options.some((option) => exceeds(option.label, 500)
                || (option.description !== undefined && exceeds(option.description, 1_000))))
            || (routeRevision !== undefined && (
                exceeds(routeRevision.approvalRequest, 1_000)
                || exceeds(routeRevision.reason, 1_000)
                || routeRevision.candidate.stages.some((stage) => exceeds(stage.target, 1_000)
                    || stage.acceptanceCriteria.some((criterion) => exceeds(criterion, 500)))));
    }
    return exceeds(pending.proposal.objective, 2_000)
        || exceeds(pending.approvalRequest, 1_000)
        || pending.proposal.completionCriteria.length > 32
        || pending.proposal.completionCriteria.some((criterion) => exceeds(criterion.text, 1_000))
        || pending.planRouteCandidate.stages.some((stage) => exceeds(stage.target, 1_000)
            || stage.acceptanceCriteria.some((criterion) => exceeds(criterion, 500)));
}

function projectGoalPlan(plan: NonNullable<Goal["state"]["goalPlan"]>): BrowserGoalPlan {
    return {
        revision: plan.revision,
        items: plan.items.map((item) => ({
            id: item.id,
            content: boundedText(item.content, 1_000),
            position: item.position,
            status: item.status,
        })),
    };
}

function trajectoryActionId(event: TrajectoryEvent): string | undefined {
    if (event.actionId !== undefined) return event.actionId;
    const payload = event.payload;
    if (payload.type === "decision_received") {
        return payload.decision.kind === "tool_call" ? payload.decision.action.actionId : undefined;
    }
    if (payload.type === "action_staged") return payload.action.actionId;
    if (
        payload.type === "action_approved"
        || payload.type === "action_revised"
        || payload.type === "action_reexecution_authorized"
        || payload.type === "action_reexecution_declined"
        || payload.type === "action_rejected"
        || payload.type === "action_recovered"
        || payload.type === "tool_started"
        || payload.type === "tool_finished"
        || payload.type === "observation_recorded"
    ) {
        return payload.actionId;
    }
    return undefined;
}

function projectToolInputSummary(toolId: string, input: JsonValue): string | undefined {
    if (!isJsonObject(input)) return undefined;
    const key = toolId === "read_file" || toolId === "write_file" || toolId === "edit_file" ? "path"
        : toolId === "grep" ? "pattern"
            : toolId === "web_search" ? "query"
                : toolId === "web_fetch" ? "url" : undefined;
    const value = key === undefined ? undefined : input[key];
    return typeof value === "string" ? boundedText(value.replace(/\s+/g, " ").trim(), 240) : undefined;
}

function readBashCommand(input: JsonValue): string | undefined {
    if (!isJsonObject(input)) return undefined;
    const command = input.command;
    return typeof command === "string" ? command : undefined;
}

function projectBashExecution(
    command: string,
    observation: Observation | undefined,
): BrowserBashExecutionDetail {
    if (observation?.kind === "success") {
        const output = observation.output;
        const result = isJsonObject(output) ? output : undefined;
        return {
            command: boundedText(command, MAX_BASH_COMMAND_LENGTH),
            ...(typeof result?.exitCode === "number" ? { exitCode: result.exitCode } : {}),
            ...(typeof result?.stdout === "string"
                ? { stdout: boundedText(result.stdout, MAX_BASH_OUTPUT_LENGTH) }
                : {}),
            ...(typeof result?.stderr === "string"
                ? { stderr: boundedText(result.stderr, MAX_BASH_OUTPUT_LENGTH) }
                : {}),
        };
    }
    return {
        command: boundedText(command, MAX_BASH_COMMAND_LENGTH),
        ...(observation?.kind === "failure"
            ? { failure: boundedText(observation.message, MAX_BASH_OUTPUT_LENGTH) }
            : {}),
    };
}


function boundedText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}…`;
}

function exceeds(value: string, maxLength: number): boolean {
    return value.length > maxLength;
}

function isJsonObject(value: JsonValue): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
