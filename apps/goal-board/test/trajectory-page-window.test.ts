import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserTrajectoryEntry, BrowserTrajectoryPage } from "../../../packages/web-contracts/src/index";
import { EMPTY_TRAJECTORY_PAGE_WINDOW, receiveTrajectoryPage, viewedThrough } from "../src/trajectory-page-window";

function page(first: number, last: number, total = 350): BrowserTrajectoryPage {
  const entries: BrowserTrajectoryEntry[] = Array.from({ length: last - first + 1 }, (_, index) => ({
    eventId: `event-${first + index}`, sequence: first + index, occurredAt: "2026-10-09T00:00:00.000Z",
    eventType: "run_started", category: "lifecycle", title: "Run started", preview: "", previewTruncated: false,
  }));
  return {
    goalId: "goal", run: { runId: "run", status: "completed", current: true, committedThroughSequence: total },
    entries, total, committedCount: total, previousCursor: first === 1 ? null : first,
    nextCursor: last === total ? null : last, locatedSequence: null,
  };
}

test("page window caps retained entries while navigation position survives eviction and reload", () => {
  let window = receiveTrajectoryPage(EMPTY_TRAJECTORY_PAGE_WINDOW, page(1, 100), "replace");
  for (const [first, last] of [[101, 200], [201, 300], [301, 350]]) {
    window = receiveTrajectoryPage(window, page(first!, last!), "append");
  }
  assert.equal(window.pages.length, 3);
  assert.equal(window.pages.reduce((count, current) => count + current.entries.length, 0), 250);
  assert.equal(window.pages[0]?.entries[0]?.sequence, 101);
  assert.equal(viewedThrough(window), 350);

  window = { ...window, viewIndex: 1 };
  assert.equal(viewedThrough(window), 300);
  window = { ...window, viewIndex: 0 };
  assert.equal(viewedThrough(window), 200);
  window = receiveTrajectoryPage(window, page(1, 100), "prepend");
  assert.equal(window.pages.length, 3);
  assert.equal(window.pages.at(-1)?.entries.at(-1)?.sequence, 300);
  assert.equal(viewedThrough(window), 100);
});

test("starting at Latest keeps absolute position when loading earlier pages", () => {
  let window = receiveTrajectoryPage(EMPTY_TRAJECTORY_PAGE_WINDOW, page(251, 350), "replace");
  assert.equal(viewedThrough(window), 350);
  window = receiveTrajectoryPage(window, page(151, 250), "prepend");
  assert.equal(viewedThrough(window), 250);
  window = receiveTrajectoryPage(window, page(51, 150), "prepend");
  assert.equal(viewedThrough(window), 150);
  window = receiveTrajectoryPage(window, page(1, 50), "prepend");
  assert.equal(window.pages.length, 3);
  assert.equal(viewedThrough(window), 50);
});
