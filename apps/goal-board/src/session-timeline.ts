import type {
  BrowserActivityItem,
  BrowserActivityPage,
  BrowserActivityPosition,
  BrowserGoalSessionState,
} from "../../../packages/web-contracts/src/index";
import {
  candidatePresentationKey,
  EMPTY_SESSION_OUTPUT_DISPLAY,
  type SessionOutputDisplay,
} from "./session-output-consumer";
import type { ActivityGroup } from "./activity-projector";

/**
 * 单一时间线中的已保存来源边界、消息、事实和当前临时正文。
 *
 * @remarks
 * 各持久化项使用 Activity `itemId` 与位置；Run 终态只由 Goal/Run 状态构造，临时正文身份
 * 仅在当前 Run 内有效，不能作为已保存消息提交或恢复。同一 Action 的授权、执行、重试与
 * 结果事实先归入同一活动，工具活动以真实动作组呈现，组的位置取其首个成员，组内成员保持
 * 各自来源身份。历史检索事实按同 Run 的 `lookupId` 归入单条活动；未命中和失败保持不同状态，
 * 缺失的分页侧不从相邻事实推断。
 * 事实保留真实 executionUnitId，供公开进度关联；缺少身份时不按相邻位置推断。
 * 当前失败 Run 的错误摘要只取同 Run 的窄状态，不附到历史 Run 或尚未结算的 Run。
 *
 * @example
 * ```ts
 * const item: SessionTimelineEntry = {
 *   kind: "message", itemId: "message:m1", presentationKey: "message:m1", runId: "run-1", role: "assistant",
 *   purpose: "answer", content: "完成", position,
 * };
 * ```
 */
export type SessionTimelineEntry =
  | { readonly kind: "run"; readonly itemId: string; readonly runId: string; readonly status: string; readonly detail?: BrowserGoalSessionState["currentRunTerminalDetail"]; readonly position: BrowserActivityPosition }
  | { readonly kind: "message"; readonly itemId: string; readonly presentationKey: string; readonly runId: string; readonly role: "user" | "assistant"; readonly purpose?: "process" | "answer" | "notice"; readonly content: string; readonly position: BrowserActivityPosition; readonly previewIssue?: "official-text-differs" | "preview-incomplete" }
  | { readonly kind: "activity"; readonly itemId: string; readonly runId: string; readonly group: ActivityGroup; readonly position?: BrowserActivityPosition }
  | {
      readonly kind: "lookup";
      readonly itemId: string;
      readonly runId: string;
      readonly lookupId: string;
      readonly status: "requested" | "completed" | "not_found" | "failed";
      readonly request?: string;
      readonly requestDetail?: string;
      readonly resultDetail?: string;
      readonly errorCode?: string;
      readonly executionUnitId?: string;
      readonly stageId?: string;
      readonly position: BrowserActivityPosition;
    }
  | { readonly kind: "interaction"; readonly itemId: string; readonly runId: string; readonly interactionId: string; readonly interactionKind: string; readonly position: BrowserActivityPosition }
  | { readonly kind: "fact"; readonly itemId: string; readonly runId: string; readonly title: string; readonly detail?: string; readonly eventType: string; readonly executionUnitId?: string; readonly stageId?: string; readonly stageRevision?: number; readonly stageTarget?: string; readonly position: BrowserActivityPosition }
  | { readonly kind: "terminal"; readonly itemId: string; readonly runId: string; readonly status: "completed" | "failed" | "cancelled"; readonly detail?: BrowserGoalSessionState["currentRunTerminalDetail"]; readonly position: BrowserActivityPosition }
  | { readonly kind: "live-preview"; readonly itemId: string; readonly runId: string; readonly content: string }
  | { readonly kind: "candidate-preview"; readonly itemId: string; readonly presentationKey: string; readonly candidateId: string; readonly runId: string; readonly content: string; readonly status: "generating" | "ready" | "pending-verification"; readonly missingPrefix: boolean; readonly truncated: boolean };

/**
 * Activity 时间线的只读投影。
 *
 * @remarks
 * `items` 依据服务端位置排序；阶段与 Action 上下文透传本页来源完整性，阶段声明可在页外。
 * 当前路线仍来自状态 DTO，因此正文历史保持有界。
 *
 * @example
 * ```ts
 * const entryIds = projection.items.map((item) => item.itemId);
 * ```
 */
export interface SessionTimelineProjection {
  /** 按服务端 Activity 位置排列的本页正文、事实与 Run 边界。 */
  readonly items: readonly SessionTimelineEntry[];
  /** 服务端按 Run 提供的阶段标题、状态与本页完整性；不要求声明位于本页。 */
  readonly stages: BrowserActivityPage["stages"];
  /** 服务端按 Run 和 Action 提供的来源完整性；不扩充已加载成员。 */
  readonly actionGroups: BrowserActivityPage["actionGroups"];
  /** 当前窄状态提供的 Plan 路线；不从历史事实推断。 */
  readonly currentPlanRoute: BrowserGoalSessionState["currentPlanRoute"];
}

/**
 * 从固定 Activity 页和窄 Goal 状态构建单一、稳定的会话时间线。
 *
 * @remarks
 * 已保存项只按服务端位置排序并按稳定身份去重；当前候选与临时正文排在已保存来源之后。
 * Run 完成状态只来自状态投影，不从模型正文、过程提交或阶段事实推断。同一 Action 的
 * 授权、执行、重试与结果事实先归入一个活动，组出现在其首个成员的位置；实时活动组没有
 * 已提交位置，排在当前 Run 末尾。检索请求和结果按 `lookupId` 关联，取当前窗口内最早
 * 来源位置；跨页只显示已加载的事实，不将未命中误判为失败。
 *
 * @param page - 服务端固定水位 Activity 页。
 * @param state - 不含历史正文的当前 Goal 状态。
 * @param activityGroups - 按 Run 收集的真实活动组。
 * @param liveText - 当前连接尚未提交的正文；空字符串不生成临时项。
 * @returns 按 Run 与来源位置排序的时间线及当前 Plan 路线。
 * @example
 * ```ts
 * const timeline = projectSessionTimeline(activityPage, goalState, groups, liveText, outputDisplay);
 * ```
 */
export function projectSessionTimeline(
  page: BrowserActivityPage,
  state: BrowserGoalSessionState,
  activityGroups: ReadonlyMap<string, readonly ActivityGroup[]>,
  liveText = "",
  outputDisplay: SessionOutputDisplay = EMPTY_SESSION_OUTPUT_DISPLAY,
): SessionTimelineProjection {
  const unique = new Map<string, BrowserActivityItem>();
  for (const item of page.items) unique.set(item.itemId, item);

  const items: SessionTimelineEntry[] = [];
  const byRun = new Map<string, BrowserActivityItem[]>();
  for (const item of unique.values()) {
    const runItems = byRun.get(item.runId) ?? [];
    runItems.push(item);
    byRun.set(item.runId, runItems);
  }

  for (const run of page.runs) {
    const runItems = [...(byRun.get(run.runId) ?? [])].sort((left, right) => comparePositions(left.position, right.position));
    const first = runItems.reduce<BrowserActivityPosition | undefined>(
      (earliest, item) => earliest === undefined || comparePositions(item.position, earliest) < 0 ? item.position : earliest,
      undefined,
    );
    const last = runItems.reduce<BrowserActivityPosition | undefined>(
      (latest, item) => latest === undefined || comparePositions(item.position, latest) > 0 ? item.position : latest,
      undefined,
    );
    const runPosition = first ?? {
      runId: run.runId,
      runOrder: run.runOrder,
      sequence: 0,
      itemKind: "fact" as const,
      order: 0,
    };
    items.push({ kind: "run", itemId: `run:${run.runId}`, runId: run.runId, status: run.status, position: runPosition,
      ...(run.terminalDetail === undefined ? {} : { detail: run.terminalDetail }) });

    const groups = activityGroups.get(run.runId) ?? [];
    const groupBySourceItem = new Map<string, ActivityGroup>();
    for (const group of groups) {
      const first = group.members[0];
      if (first === undefined) continue;
      if (!groupBySourceItem.has(first.sourceItemId)) groupBySourceItem.set(first.sourceItemId, group);
    }
    const emittedGroups = new Set<string>();
    const lookupFacts = new Map<string, Extract<BrowserActivityItem, { readonly type: "fact" }>[]>();
    for (const item of runItems) {
      if (item.type !== "fact" || item.lookupId === undefined) continue;
      const events = lookupFacts.get(item.lookupId) ?? [];
      events.push(item);
      lookupFacts.set(item.lookupId, events);
    }
    const emittedLookups = new Set<string>();

    for (const item of runItems) {
      if (item.type === "message") {
        items.push({
          kind: "message",
          itemId: item.itemId,
          presentationKey: item.previewId === undefined
            ? item.itemId
            : candidatePresentationKey(page.goalId, item.runId, item.previewId),
          runId: item.runId,
          role: item.role,
          ...("purpose" in item && item.purpose !== undefined ? { purpose: item.purpose } : {}),
          content: item.content,
          position: item.position,
          ...findPreviewIssue(outputDisplay, page.goalId, item.runId, item.previewId),
        });
        continue;
      }
      if (item.type === "think") {
        const group = groupBySourceItem.get(item.itemId);
        if (group !== undefined && !emittedGroups.has(group.id)) {
          emittedGroups.add(group.id);
          items.push({
            kind: "activity",
            itemId: `activity:${group.id}`,
            runId: item.runId,
            group,
            ...(group.position === undefined ? {} : { position: group.position }),
          });
        }
        continue;
      }
      if (item.lookupId !== undefined) {
        if (emittedLookups.has(item.lookupId)) continue;
        emittedLookups.add(item.lookupId);
        const events = lookupFacts.get(item.lookupId)!;
        const request = events.find((event) => event.eventType === "context_lookup_requested");
        const result = events.find((event) => event.eventType !== "context_lookup_requested");
        const first = events.reduce((earliest, event) => comparePositions(event.position, earliest.position) < 0 ? event : earliest);
        const status = result?.eventType === "context_lookup_failed" ? "failed"
          : result?.eventType === "context_lookup_not_found" ? "not_found"
            : result?.eventType === "context_lookup_completed" ? "completed" : "requested";
        items.push({
          kind: "lookup", itemId: `lookup:${run.runId}:${item.lookupId}`, runId: run.runId,
          lookupId: item.lookupId, status, position: first.position,
          ...(request?.lookupRequest === undefined ? {} : { request: request.lookupRequest }),
          ...(request?.detail === undefined ? {} : { requestDetail: request.detail }),
          ...(result?.detail === undefined ? {} : { resultDetail: result.detail }),
          ...(result?.lookupErrorCode === undefined ? {} : { errorCode: result.lookupErrorCode }),
          ...(first.executionUnitId === undefined ? {} : { executionUnitId: first.executionUnitId }),
          ...(first.stageId === undefined ? {} : { stageId: first.stageId }),
        });
        continue;
      }
      if (item.tool !== undefined) {
        const group = groupBySourceItem.get(item.itemId);
        if (group === undefined || emittedGroups.has(group.id)) continue;
        emittedGroups.add(group.id);
        items.push({
          kind: "activity",
          itemId: `activity:${group.id}`,
          runId: item.runId,
          group,
          ...(group.position === undefined ? {} : { position: group.position }),
        });
        continue;
      }
      items.push({
        kind: "fact",
        itemId: item.itemId,
        runId: item.runId,
        title: item.title,
        ...(item.detail === undefined ? {} : { detail: item.detail }),
        eventType: item.eventType,
        ...(item.executionUnitId === undefined ? {} : { executionUnitId: item.executionUnitId }),
        ...(item.stageId === undefined ? {} : { stageId: item.stageId }),
        ...(item.stageRevision === undefined ? {} : { stageRevision: item.stageRevision }),
        ...(item.stageTarget === undefined ? {} : { stageTarget: item.stageTarget }),
        position: item.position,
      });
    }

    for (const group of groups) {
      if (group.live !== true || emittedGroups.has(group.id)) continue;
      emittedGroups.add(group.id);
      items.push({
        kind: "activity",
        itemId: `activity:${group.id}`,
        runId: run.runId,
        group,
      });
    }

    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      const terminalPosition = last ?? runPosition;
      items.push({
        kind: "terminal",
        itemId: `terminal:${run.runId}:${run.status}`,
        runId: run.runId,
        status: run.status,
        ...(run.terminalDetail !== undefined ? { detail: run.terminalDetail }
          : run.status === "failed" && state.runStatus === "failed" && run.runId === state.currentRunId
            && state.currentRunTerminalDetail !== undefined ? { detail: state.currentRunTerminalDetail } : {}),
        position: terminalPosition,
      });
    }
  }

  // 当前等待在时间线上只保留只读关联；唯一可操作区域在 Activity 下部。
  const currentInteraction = state.interaction;
  if (currentInteraction !== undefined) {
    const interactionRun = page.runs.find((run) => run.runId === currentInteraction.runId);
    if (interactionRun !== undefined) {
      items.push({
        kind: "interaction",
        itemId: `interaction:${currentInteraction.interactionId}`,
        runId: currentInteraction.runId,
        interactionId: currentInteraction.interactionId,
        interactionKind: currentInteraction.kind,
        position: {
          runId: interactionRun.runId,
          runOrder: interactionRun.runOrder,
          sequence: interactionRun.committedThroughSequence,
          itemKind: "fact",
          order: 0,
        },
      });
    }
  }

  const currentRun = page.runs.find((run) => run.runId === state.currentRunId && run.current);
  if (
    liveText.length > 0
    && currentRun !== undefined
    && (state.runStatus === "running" || state.runStatus === "waiting")
  ) {
    items.push({
      kind: "live-preview",
      itemId: `live:${currentRun.runId}`,
      runId: currentRun.runId,
      content: liveText,
    });
  }

  for (const candidate of outputDisplay.candidates) {
    const saved = Array.from(unique.values()).some((item) => item.type === "message"
      && item.runId === candidate.runId
      && item.previewId === candidate.candidateId);
    if (saved) continue;
    items.push({
      kind: "candidate-preview",
      itemId: candidate.presentationKey,
      presentationKey: candidate.presentationKey,
      candidateId: candidate.candidateId,
      runId: candidate.runId,
      content: candidate.content,
      status: candidate.status,
      missingPrefix: candidate.missingPrefix,
      truncated: candidate.truncated,
    });
  }

  items.sort(compareTimelineEntries);
  return { items, currentPlanRoute: state.currentPlanRoute, stages: page.stages, actionGroups: page.actionGroups };
}

function compareTimelineEntries(left: SessionTimelineEntry, right: SessionTimelineEntry): number {
  const leftPosition = "position" in left ? left.position : undefined;
  const rightPosition = "position" in right ? right.position : undefined;
  if (leftPosition !== undefined && rightPosition !== undefined) {
    const byPosition = comparePositions(leftPosition, rightPosition);
    if (byPosition !== 0) return byPosition;
  } else if (leftPosition === undefined && rightPosition !== undefined) {
    return 1;
  } else if (rightPosition === undefined && leftPosition !== undefined) {
    return -1;
  }
  const byKind = kindRank(left) - kindRank(right);
  return byKind !== 0 ? byKind : left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0;
}

function kindRank(entry: SessionTimelineEntry): number {
  if (entry.kind === "run") return 0;
  if (entry.kind === "terminal" || entry.kind === "interaction") return 2;
  if (entry.kind === "activity") return entry.position === undefined ? 3 : 1;
  if (entry.kind === "message" || entry.kind === "fact" || entry.kind === "lookup") return 1;
  return 4;
}

function findPreviewIssue(
  display: SessionOutputDisplay,
  goalId: string,
  runId: string,
  previewId: string | undefined,
): { readonly previewIssue?: "official-text-differs" | "preview-incomplete" } {
  if (previewId === undefined) return {};
  const key = candidatePresentationKey(goalId, runId, previewId);
  const settled = display.settledCandidates.find((candidate) => candidate.presentationKey === key);
  if (settled?.issue !== undefined) return { previewIssue: settled.issue };
  const candidate = display.candidates.find((item) => item.presentationKey === key);
  if (candidate === undefined) return {};
  return candidate.truncated || candidate.missingPrefix || !candidate.complete
    ? { previewIssue: "preview-incomplete" }
    : {};
}

function comparePositions(left: BrowserActivityPosition, right: BrowserActivityPosition): number {
  return left.runOrder - right.runOrder
    || left.sequence - right.sequence
    || (left.itemKind === right.itemKind ? 0 : left.itemKind === "fact" ? -1 : 1)
    || left.order - right.order;
}
