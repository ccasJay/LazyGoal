import type {
  BrowserActivityItem,
  BrowserActivityPage,
  BrowserActivityPosition,
  BrowserGoalSessionState,
} from "../../../packages/web-contracts/src/index";

/**
 * 单一时间线中的已保存来源边界、消息、事实和当前临时正文。
 *
 * @remarks
 * 各持久化项使用 Activity `itemId` 与位置；Run 终态只由 Goal/Run 状态构造，临时正文身份
 * 仅在当前 Run 内有效，不能作为已保存消息提交或恢复。
 *
 * @example
 * ```ts
 * const item: SessionTimelineEntry = {
 *   kind: "message", itemId: "message:m1", runId: "run-1", role: "assistant",
 *   purpose: "answer", content: "完成", position,
 * };
 * ```
 */
export type SessionTimelineEntry =
  | { readonly kind: "run"; readonly itemId: string; readonly runId: string; readonly status: string; readonly position: BrowserActivityPosition }
  | { readonly kind: "message"; readonly itemId: string; readonly runId: string; readonly role: "user" | "assistant"; readonly purpose?: "process" | "answer" | "notice"; readonly content: string; readonly position: BrowserActivityPosition }
  | { readonly kind: "fact"; readonly itemId: string; readonly runId: string; readonly title: string; readonly eventType: string; readonly stageTarget?: string; readonly position: BrowserActivityPosition }
  | { readonly kind: "terminal"; readonly itemId: string; readonly runId: string; readonly status: "completed" | "failed" | "cancelled"; readonly position: BrowserActivityPosition }
  | { readonly kind: "live-preview"; readonly itemId: string; readonly runId: string; readonly content: string };

/**
 * Activity 时间线的只读投影。
 *
 * @remarks
 * `items` 依据服务端位置排序；当前路线仍来自状态 DTO，因此正文历史保持有界。
 *
 * @example
 * ```ts
 * const entryIds = projection.items.map((item) => item.itemId);
 * ```
 */
export interface SessionTimelineProjection {
  /** 按服务端 Activity 位置排列的本页正文、事实与 Run 边界。 */
  readonly items: readonly SessionTimelineEntry[];
  /** 当前窄状态提供的 Plan 路线；不从历史事实推断。 */
  readonly currentPlanRoute: BrowserGoalSessionState["currentPlanRoute"];
}

/**
 * 从固定 Activity 页和窄 Goal 状态构建单一、稳定的会话时间线。
 *
 * @remarks
 * 已保存项只按服务端位置排序并按稳定身份去重；临时正文排在当前 Run 的已保存来源之后。
 * Run 完成状态只来自状态投影，不从模型正文、过程提交或阶段事实推断。
 *
 * @param page - 服务端固定水位 Activity 页。
 * @param state - 不含历史正文的当前 Goal 状态。
 * @param liveText - 当前连接尚未提交的正文；空字符串不生成临时项。
 * @returns 按 Run 与来源位置排序的时间线及当前 Plan 路线。
 * @example
 * ```ts
 * const timeline = projectSessionTimeline(activityPage, goalState, liveText);
 * ```
 */
export function projectSessionTimeline(
  page: BrowserActivityPage,
  state: BrowserGoalSessionState,
  liveText = "",
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
    const runItems = byRun.get(run.runId) ?? [];
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
    items.push({ kind: "run", itemId: `run:${run.runId}`, runId: run.runId, status: run.status, position: runPosition });

    for (const item of runItems) {
      items.push(item.type === "message"
        ? {
            kind: "message",
            itemId: item.itemId,
            runId: item.runId,
            role: item.role,
            ...("purpose" in item && item.purpose !== undefined ? { purpose: item.purpose } : {}),
            content: item.content,
            position: item.position,
          }
        : {
            kind: "fact",
            itemId: item.itemId,
            runId: item.runId,
            title: item.stageTarget === undefined ? item.title : `${item.title} · ${item.stageTarget}`,
            eventType: item.eventType,
            ...(item.stageTarget === undefined ? {} : { stageTarget: item.stageTarget }),
            position: item.position,
          });
    }

    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      const terminalPosition = last ?? runPosition;
      items.push({
        kind: "terminal",
        itemId: `terminal:${run.runId}:${run.status}`,
        runId: run.runId,
        status: run.status,
        position: terminalPosition,
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

  items.sort(compareTimelineEntries);
  return { items, currentPlanRoute: state.currentPlanRoute };
}

function compareTimelineEntries(left: SessionTimelineEntry, right: SessionTimelineEntry): number {
  if (left.kind === "live-preview") return right.kind === "live-preview" ? left.itemId.localeCompare(right.itemId) : 1;
  if (right.kind === "live-preview") return -1;
  const byPosition = comparePositions(left.position, right.position);
  if (byPosition !== 0) return byPosition;
  const rank = (entry: SessionTimelineEntry) => entry.kind === "run" ? 0 : entry.kind === "terminal" ? 2 : 1;
  const byKind = rank(left) - rank(right);
  return byKind !== 0 ? byKind : left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0;
}

function comparePositions(left: BrowserActivityPosition, right: BrowserActivityPosition): number {
  return left.runOrder - right.runOrder
    || left.sequence - right.sequence
    || (left.itemKind === right.itemKind ? 0 : left.itemKind === "fact" ? -1 : 1)
    || left.order - right.order;
}
