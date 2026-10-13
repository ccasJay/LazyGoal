import type { BrowserTrajectoryPage } from "../../../packages/web-contracts/src/index";

export type TrajectoryPageWindow = {
  readonly pages: readonly BrowserTrajectoryPage[];
  readonly startOrdinal: number;
  readonly viewIndex: number;
};

export const EMPTY_TRAJECTORY_PAGE_WINDOW: TrajectoryPageWindow = { pages: [], startOrdinal: 0, viewIndex: 0 };
const MAX_PAGES = 3;

export function receiveTrajectoryPage(
  current: TrajectoryPageWindow,
  next: BrowserTrajectoryPage,
  direction: "replace" | "prepend" | "append",
): TrajectoryPageWindow {
  if (direction === "replace" || current.pages.length === 0) {
    const startOrdinal = next.previousCursor === null ? 0 : next.nextCursor === null ? next.total - next.entries.length : 0;
    return { pages: [next], startOrdinal, viewIndex: 0 };
  }

  const pages = direction === "prepend" ? [next, ...current.pages] : [...current.pages, next];
  let startOrdinal = current.startOrdinal;
  if (direction === "prepend") startOrdinal -= next.entries.length;
  if (pages.length > MAX_PAGES) {
    const removed = direction === "prepend" ? pages.pop() : pages.shift();
    if (direction === "append") startOrdinal += removed?.entries.length ?? 0;
  }
  const retainedCount = pages.reduce((count, page) => count + page.entries.length, 0);
  if (pages[0]?.previousCursor === null) startOrdinal = 0;
  else if (pages.at(-1)?.nextCursor === null) startOrdinal = next.total - retainedCount;
  return { pages, startOrdinal: Math.max(0, startOrdinal), viewIndex: direction === "prepend" ? 0 : pages.length - 1 };
}

export function viewedThrough(window: TrajectoryPageWindow): number {
  return window.startOrdinal + window.pages.slice(0, window.viewIndex + 1)
    .reduce((count, page) => count + page.entries.length, 0);
}
