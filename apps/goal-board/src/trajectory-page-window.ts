import type { BrowserTrajectoryPage } from "../../../packages/web-contracts/src/index";

/**
 * Activity 轨迹浏览保留的有界页面窗口。
 *
 * @remarks
 * `verifiedAdjacentPages[i]` 描述 `pages[i]` 与 `pages[i + 1]` 的来源相邻性；为 `false`
 * 时两页可以继续浏览，但不得跨页拼接活动组。
 *
 * @example
 * ```ts
 * const next = receiveTrajectoryPage(window, page, "append");
 * ```
 */
export type TrajectoryPageWindow = {
  readonly pages: readonly BrowserTrajectoryPage[];
  /** 每个相邻页对是否具备可验证的连续 Trajectory 来源边界。 */
  readonly verifiedAdjacentPages: readonly boolean[];
  readonly startOrdinal: number;
  readonly viewIndex: number;
};

/** 空轨迹窗口；首个页面通过 `receiveTrajectoryPage` 建立窗口。 */
export const EMPTY_TRAJECTORY_PAGE_WINDOW: TrajectoryPageWindow = { pages: [], verifiedAdjacentPages: [], startOrdinal: 0, viewIndex: 0 };
const MAX_PAGES = 3;

/**
 * 判断两页轨迹是否能作为同一条连续历史重建。
 *
 * @remarks
 * 只有 Goal/Run、提交边界、页游标和事件序号均一致时才返回 `true`。过滤页、
 * 过期页或跨提交边界的页面仍可浏览，但不能据此合并活动组。
 *
 * @param older - 较早的 Trajectory 页面。
 * @param newer - 较新的 Trajectory 页面。
 * @returns 两页是否存在已验证的连续来源关系。
 * @example
 * ```ts
 * if (trajectoryPagesAreAdjacent(previous, next)) joinActivityGroups(previous, next);
 * ```
 */
export function trajectoryPagesAreAdjacent(
  older: BrowserTrajectoryPage,
  newer: BrowserTrajectoryPage,
): boolean {
  if (older.entries.length === 0 || newer.entries.length === 0) return false;
  if (older.goalId !== newer.goalId || older.run.runId !== newer.run.runId) return false;
  if (older.total !== newer.total || older.committedCount !== newer.committedCount
    || older.run.committedThroughSequence !== newer.run.committedThroughSequence) return false;
  const oldFirst = older.entries[0];
  const oldLast = older.entries.at(-1);
  const newFirst = newer.entries[0];
  const newLast = newer.entries.at(-1);
  if (oldFirst === undefined || oldLast === undefined || newFirst === undefined || newLast === undefined) return false;
  if (older.entries.some((entry, index) => index > 0 && entry.sequence !== older.entries[index - 1]!.sequence + 1)) return false;
  if (newer.entries.some((entry, index) => index > 0 && entry.sequence !== newer.entries[index - 1]!.sequence + 1)) return false;
  if (older.entries.some((entry) => newer.entries.some((candidate) => candidate.eventId === entry.eventId))) return false;
  return oldLast.sequence + 1 === newFirst.sequence
    && older.nextCursor === oldLast.sequence
    && newer.previousCursor === newFirst.sequence
    && oldFirst.sequence <= oldLast.sequence
    && newFirst.sequence <= newLast.sequence;
}

/**
 * 把新页面加入有界浏览窗口并记录可验证的页间连续关系。
 *
 * @param current - 当前保留页面窗口。
 * @param next - 新加载的 Trajectory 页面。
 * @param direction - 页面是替换、向前翻页还是向后翻页。
 * @returns 保留最多三页的新窗口；不相邻页面仍可浏览，但相邻标志为 `false`。
 * @example
 * ```ts
 * setWindow((current) => receiveTrajectoryPage(current, nextPage, "append"));
 * ```
 */
export function receiveTrajectoryPage(
  current: TrajectoryPageWindow,
  next: BrowserTrajectoryPage,
  direction: "replace" | "prepend" | "append",
): TrajectoryPageWindow {
  if (direction === "replace" || current.pages.length === 0) {
    const startOrdinal = next.previousCursor === null ? 0 : next.nextCursor === null ? next.total - next.entries.length : 0;
    return { pages: [next], verifiedAdjacentPages: [], startOrdinal, viewIndex: 0 };
  }

  const pages = direction === "prepend" ? [next, ...current.pages] : [...current.pages, next];
  const verifiedAdjacentPages = direction === "prepend"
    ? [trajectoryPagesAreAdjacent(next, current.pages[0]!), ...current.verifiedAdjacentPages]
    : [...current.verifiedAdjacentPages, trajectoryPagesAreAdjacent(current.pages.at(-1)!, next)];
  let startOrdinal = current.startOrdinal;
  if (direction === "prepend") startOrdinal -= next.entries.length;
  if (pages.length > MAX_PAGES) {
    const removed = direction === "prepend" ? pages.pop() : pages.shift();
    if (direction === "prepend") verifiedAdjacentPages.pop();
    else verifiedAdjacentPages.shift();
    if (direction === "append") startOrdinal += removed?.entries.length ?? 0;
  }
  const retainedCount = pages.reduce((count, page) => count + page.entries.length, 0);
  if (pages[0]?.previousCursor === null) startOrdinal = 0;
  else if (pages.at(-1)?.nextCursor === null) startOrdinal = next.total - retainedCount;
  return { pages, verifiedAdjacentPages, startOrdinal: Math.max(0, startOrdinal), viewIndex: direction === "prepend" ? 0 : pages.length - 1 };
}

export function viewedThrough(window: TrajectoryPageWindow): number {
  return window.startOrdinal + window.pages.slice(0, window.viewIndex + 1)
    .reduce((count, page) => count + page.entries.length, 0);
}
