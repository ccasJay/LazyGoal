import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOLLOW_THRESHOLD_PX,
  MAX_CACHED_ACTIVITY_PAGES,
  MAX_CACHED_MESSAGE_DETAILS,
  applyActivityPage,
  applyActivityPageFailure,
  captureAnchor,
  createActivityWindowState,
  mergeActivityItems,
  mergeLatestPage,
  resolveActivityGaps,
  resolveAnchorScrollTop,
  resolveFollowing,
} from "../src/activity-page-window";
import type {
  BrowserActivityFactItem,
  BrowserActivityMessageItem,
  BrowserActivityPage,
  BrowserActivityPosition,
} from "../../../packages/web-contracts/src/index";

function position(sequence: number, runId = "run-1", itemKind: "fact" | "message" = "fact"): BrowserActivityPosition {
  return { runId, runOrder: 0, sequence, itemKind, order: 0 };
}

test("repeated latest refreshes count unread items once while keeping the reading page", () => {
  const initial = pageFixture({ items: [factItem(1, "e1")], newerCount: 1 });
  const latest = pageFixture({ items: [factItem(1, "e1"), factItem(2, "e2")] });
  const paused = { ...applyActivityPage(createActivityWindowState(), initial), following: false };
  const updated = mergeLatestPage(paused, latest);
  assert.equal(updated.unread, 1);
  const repeated = mergeLatestPage(updated, latest);
  assert.equal(repeated.unread, 1);
  assert.equal(repeated.page, initial);
});

function messageItem(sequence: number, messageId: string, runId = "run-1"): BrowserActivityMessageItem {
  return {
    type: "message",
    itemId: `message:${messageId}`,
    messageId,
    role: "assistant",
    purpose: "process",
    runId,
    position: position(sequence, runId, "message"),
    content: `content-${messageId}`,
    contentLength: `content-${messageId}`.length,
    truncated: false,
  };
}

function factItem(sequence: number, eventId: string, runId = "run-1"): BrowserActivityFactItem {
  return {
    type: "fact",
    itemId: `fact:${eventId}`,
    eventId,
    runId,
    position: position(sequence, runId),
    eventType: "tool_started",
    title: "Tool started",
    tool: { toolId: "read_file", status: "completed" },
  };
}

function pageFixture(options: {
  readonly items: readonly (BrowserActivityMessageItem | BrowserActivityFactItem)[];
  readonly beforeCursor?: string;
  readonly afterCursor?: string;
  readonly olderCount?: number;
  readonly newerCount?: number;
}): BrowserActivityPage {
  const first = options.items[0];
  const last = options.items.at(-1);
  return {
    goalId: "goal-1",
    limit: 50,
    items: options.items,
    runs: [{ runId: "run-1", status: "running", current: true, runOrder: 0, committedThroughSequence: 100 }],
    window: [],
    gaps: [
      ...(options.olderCount === undefined || options.olderCount === 0 ? [] : [{
        direction: "older" as const,
        itemCount: options.olderCount,
        first: position(1),
        last: position(options.olderCount),
      }]),
      ...(options.newerCount === undefined || options.newerCount === 0 ? [] : [{
        direction: "newer" as const,
        itemCount: options.newerCount,
        first: position(900),
        last: position(900 + options.newerCount),
      }]),
    ],
    range: {
      ...(first === undefined ? {} : { first: first.position }),
      ...(last === undefined ? {} : { last: last.position }),
      olderAvailable: (options.olderCount ?? 0) > 0,
      newerAvailable: (options.newerCount ?? 0) > 0,
    },
    stages: [],
    actionGroups: [],
    ...(options.beforeCursor === undefined ? {} : { beforeCursor: options.beforeCursor }),
    ...(options.afterCursor === undefined ? {} : { afterCursor: options.afterCursor }),
  };
}

test("小会话一次读取即可呈现，不需要分页", () => {
  const page = pageFixture({ items: [messageItem(1, "m1"), messageItem(2, "m2")] });
  const state = applyActivityPage(createActivityWindowState(), page);
  assert.equal(state.page?.items.length, 2);
  assert.equal(state.cachedPages.length, 1);
  assert.equal(state.unread, 0);
  assert.equal(resolveActivityGaps(state.page).length, 0);
});

test("长会话按固定水位分页，翻页既不重复也不遗漏", () => {
  const first = pageFixture({ items: [messageItem(1, "m1"), factItem(2, "e2")], beforeCursor: "older", olderCount: 12 });
  const older = pageFixture({ items: [messageItem(0, "m0"), messageItem(1, "m1")], afterCursor: "newer" });

  const merged = mergeActivityItems(first.items, older.items);
  assert.deepEqual(merged.map((item) => item.itemId), ["message:m0", "message:m1", "fact:e2"]);
  assert.equal(new Set(merged.map((item) => item.itemId)).size, merged.length, "同身份只保留一份");
});

test("历史页缓存至多三页，更早的页被释放但可按原身份再读", () => {
  let state = createActivityWindowState();
  state = applyActivityPage(state, pageFixture({ items: [messageItem(1, "m1")], beforeCursor: "c1" }));
  state = applyActivityPage(state, pageFixture({ items: [messageItem(2, "m2")], beforeCursor: "c2" }));
  state = applyActivityPage(state, pageFixture({ items: [messageItem(3, "m3")], beforeCursor: "c3" }));
  state = applyActivityPage(state, pageFixture({ items: [messageItem(4, "m4")], beforeCursor: "c4" }));

  assert.equal(state.cachedPages.length, MAX_CACHED_ACTIVITY_PAGES);
  assert.equal(state.cachedPages.some((cached) => cached.beforeCursor === "c1"), false);
  assert.equal(state.page?.beforeCursor, "c4");
  assert.equal(MAX_CACHED_MESSAGE_DETAILS, 3);
});

test("读取失败保留现有窗口与锚点，可以原地重试", () => {
  let state = applyActivityPage(createActivityWindowState(), pageFixture({ items: [messageItem(1, "m1")] }));
  state = { ...state, anchor: { itemId: "message:m1", offset: 12 } };
  const failed = applyActivityPageFailure(state, { kind: "failed", message: "read failed" });

  assert.equal(failed.page?.items.length, 1);
  assert.deepEqual(failed.anchor, { itemId: "message:m1", offset: 12 });
  assert.equal(failed.error?.kind, "failed");
});

test("阅读旧页时只更新最新水位与未读提示，不挤掉锚点页", () => {
  let state = applyActivityPage(createActivityWindowState(), pageFixture({ items: [messageItem(1, "m1")], newerCount: 1 }));
  state = { ...state, following: false, anchor: { itemId: "message:m1", offset: 4 } };
  const merged = mergeLatestPage(state, pageFixture({ items: [messageItem(1, "m1"), messageItem(2, "m2")] }));

  assert.equal(merged.following, false);
  assert.equal(merged.unread, 1);
  assert.deepEqual(merged.anchor, { itemId: "message:m1", offset: 4 });
  assert.equal(merged.newest?.sequence, 2);
  assert.equal(merged.page?.items.length, 1, "未跟随时不替换当前页");
});

test("跟随状态下最新读取直接并入当前窗口", () => {
  let state = applyActivityPage(createActivityWindowState(), pageFixture({ items: [messageItem(1, "m1")] }));
  state = { ...state, following: true };
  const merged = mergeLatestPage(state, pageFixture({ items: [messageItem(1, "m1"), messageItem(2, "m2")] }));

  assert.equal(merged.page?.items.length, 2);
  assert.equal(merged.unread, 0);
});

test("距底部 60px 内视为跟随，用户上滑立即暂停跟随", () => {
  assert.equal(resolveFollowing({ scrollHeight: 1000, scrollTop: 940, clientHeight: 50 }), true);
  assert.equal(resolveFollowing({ scrollHeight: 1000, scrollTop: 880, clientHeight: 50 }), false);
  assert.equal(FOLLOW_THRESHOLD_PX, 60);
});

test("阅读锚点按稳定身份恢复，锚点项不在当前页时保留原位置", () => {
  const offsets = new Map<string, number>([["message:m1", 100], ["message:m2", 220]]);
  const anchor = captureAnchor({ offsets, scrollTop: 130 });
  assert.deepEqual(anchor, { itemId: "message:m1", offset: 30 });
  assert.equal(resolveAnchorScrollTop(anchor, offsets), 130);

  const missing = resolveAnchorScrollTop({ itemId: "message:gone", offset: 10 }, offsets);
  assert.equal(missing, undefined);
});

test("暂停滚动的末尾窗口仍接收正式回答和终态，重复刷新不累计同一未读项", () => {
  const initial = pageFixture({ items: [messageItem(1, "question")] });
  const anchor = { itemId: "message:question", offset: 4 };
  const paused = { ...applyActivityPage(createActivityWindowState(), initial), following: false, anchor };
  const answer = { ...messageItem(2, "answer"), purpose: "answer" as const };
  const terminal = { ...factItem(3, "completed"), eventType: "run_completed", title: "Run completed" };
  const latest = { ...pageFixture({ items: [...initial.items, answer, terminal] }),
    runs: initial.runs.map(run => ({ ...run, status: "completed" as const })) };
  const updated = mergeLatestPage(paused, latest);
  assert.deepEqual(updated.page?.items.map(item => item.itemId), ["message:question", "message:answer", "fact:completed"]);
  assert.equal(updated.page?.runs[0]?.status, "completed");
  assert.equal(updated.following, false);
  assert.deepEqual(updated.anchor, anchor);
  assert.equal(updated.unread, 2);
  const repeated = mergeLatestPage(updated, latest);
  assert.equal(repeated.unread, 2);
  assert.equal(repeated.page?.items.length, 3);
  assert.deepEqual(repeated.anchor, anchor);
});
