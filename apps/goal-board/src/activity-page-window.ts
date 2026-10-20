import type {
  BrowserActivityGap,
  BrowserActivityItem,
  BrowserActivityPage,
  BrowserActivityPosition,
} from "../../../packages/web-contracts/src/index";

/** 最多缓存的历史 Activity 页数量。 */
export const MAX_CACHED_ACTIVITY_PAGES = 3;
/** 最多缓存的正文分段数量。 */
export const MAX_CACHED_MESSAGE_DETAILS = 3;
/** 距底部该距离内视为仍在跟随最新内容。 */
export const FOLLOW_THRESHOLD_PX = 60;

/**
 * 阅读锚点：可见项的稳定身份与其项内偏移。
 *
 * @remarks
 * 锚点只引用稳定身份，不引用数组下标；加载、展开与候选转正后按同一锚点恢复阅读位置。
 */
export interface ActivityAnchor {
  /** 锚点项的稳定身份。 */
  readonly itemId: string;
  /** 锚点项顶部到视口顶部的偏移。 */
  readonly offset: number;
}

/**
 * 窗口内某一项的局部读取状态。
 *
 * @remarks
 * `not-loaded` 表示该区间尚未读取；`truncated` 表示来源被公开上限截断；`missing`
 * 表示来源不存在；`failed` 表示读取失败。四者必须分别呈现，不能合并为“未加载”。
 */
export type ActivityWindowError =
  | { readonly kind: "not-loaded" }
  | { readonly kind: "truncated" }
  | { readonly kind: "missing" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * 有界 Activity 窗口的本地状态。
 *
 * @remarks
 * 窗口只保存最近读取的若干页与当前阅读位置；不保存第二份会话账本，也不镜像原始轨迹。
 */
export interface ActivityWindowState {
  /** 当前显示的页。 */
  readonly page: BrowserActivityPage | undefined;
  /** 已缓存的历史页，按最近使用顺序排列。 */
  readonly cachedPages: readonly BrowserActivityPage[];
  /** 是否仍跟随最新内容。 */
  readonly following: boolean;
  /** 当前阅读锚点。 */
  readonly anchor: ActivityAnchor | undefined;
  /** 最新已知的来源位置水位。 */
  readonly newest: BrowserActivityPosition | undefined;
  /** 未跟随时累计的新增项数量。 */
  readonly unread: number;
  /** 最近一次局部读取错误。 */
  readonly error: ActivityWindowError | undefined;
}

/**
 * 创建空的窗口状态。
 *
 * @returns 尚未读取任何页的窗口状态。
 * @example
 * ```ts
 * const state = createActivityWindowState();
 * ```
 */
export function createActivityWindowState(): ActivityWindowState {
  return {
    page: undefined,
    cachedPages: [],
    following: true,
    anchor: undefined,
    newest: undefined,
    unread: 0,
    error: undefined,
  };
}

/**
 * 应用一次成功读取的 Activity 页。
 *
 * @remarks
 * 新页成为当前页并进入缓存；缓存超过上限时释放最早的页。被释放的内容仍可按原身份
 * 重新读取。读取失败不调用本函数，因此不会丢失现有窗口。
 *
 * @param state - 当前窗口状态。
 * @param page - 读取到的页。
 * @returns 更新后的窗口状态。
 * @example
 * ```ts
 * const next = applyActivityPage(state, page);
 * ```
 */
export function applyActivityPage(state: ActivityWindowState, page: BrowserActivityPage): ActivityWindowState {
  const cached = [page, ...state.cachedPages.filter((cachedPage) => pageKey(cachedPage) !== pageKey(page))]
    .slice(0, MAX_CACHED_ACTIVITY_PAGES);
  const newest = state.newest === undefined ? page.range.last : maxPosition(state.newest, page.range.last);
  return {
    ...state,
    page,
    cachedPages: cached,
    newest,
    unread: state.following ? 0 : state.unread,
    error: undefined,
  };
}

/**
 * 应用一次局部读取失败。
 *
 * @remarks
 * 失败只记录错误状态：当前页、缓存与阅读锚点都保持不变，用户可以原地重试。
 *
 * @param state - 当前窗口状态。
 * @param error - 读取错误。
 * @returns 更新后的窗口状态。
 * @example
 * ```ts
 * const next = applyActivityPageFailure(state, { kind: "failed", message: "read failed" });
 * ```
 */
export function applyActivityPageFailure(
  state: ActivityWindowState,
  error: ActivityWindowError,
): ActivityWindowState {
  return { ...state, error };
}

/**
 * 把最新读取的页合并进当前窗口。
 *
 * @remarks
 * 合并按稳定身份去重并按位置排序，因此不会重复或遗漏已读项。未跟随时只更新最新水位
 * 与未读提示，不替换当前页，也不移动阅读锚点。
 *
 * @param state - 当前窗口状态。
 * @param page - 最新读取的页。
 * @returns 更新后的窗口状态。
 * @example
 * ```ts
 * const next = mergeLatestPage(state, page);
 * ```
 */
export function mergeLatestPage(state: ActivityWindowState, page: BrowserActivityPage): ActivityWindowState {
  if (state.page === undefined) return applyActivityPage(state, page);
  const newest = state.newest === undefined ? page.range.last : maxPosition(state.newest, page.range.last);
  if (!state.following) {
    return {
      ...state,
      newest,
      unread: state.unread + countNewItems(state.page, page),
    };
  }
  const merged: BrowserActivityPage = {
    ...page,
    items: mergeActivityItems(state.page.items, page.items),
  };
  return { ...applyActivityPage(state, merged), newest };
}

/**
 * 合并两页 Activity 项。
 *
 * @remarks
 * 同名项只保留一份（后到的读取结果覆盖先前结果），并按服务端位置排序；因此翻页
 * 既不重复也不遗漏正文与活动。
 *
 * @param current - 当前页的项。
 * @param incoming - 新读到的项。
 * @returns 合并后的项。
 * @example
 * ```ts
 * mergeActivityItems(page.items, older.items);
 * ```
 */
export function mergeActivityItems(
  current: readonly BrowserActivityItem[],
  incoming: readonly BrowserActivityItem[],
): readonly BrowserActivityItem[] {
  const merged = new Map<string, BrowserActivityItem>();
  for (const item of current) merged.set(item.itemId, item);
  for (const item of incoming) merged.set(item.itemId, item);
  return [...merged.values()].sort((left, right) =>
    left.position.runOrder - right.position.runOrder
    || left.position.sequence - right.position.sequence
    || (left.position.itemKind === right.position.itemKind ? 0 : left.position.itemKind === "fact" ? -1 : 1)
    || left.position.order - right.position.order);
}

/**
 * 判断滚动位置是否仍处于跟随状态。
 *
 * @remarks
 * 距底部 {@link FOLLOW_THRESHOLD_PX} 以内视为跟随；用户主动向上滚动后立即暂停跟随，
 * 程序恢复锚点不算用户重新选择跟随。
 *
 * @param metrics - 滚动容器的度量。
 * @returns 是否仍在跟随。
 * @example
 * ```ts
 * resolveFollowing({ scrollHeight: 1000, scrollTop: 940, clientHeight: 50 }); // true
 * ```
 */
export function resolveFollowing(metrics: {
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly clientHeight: number;
}): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < FOLLOW_THRESHOLD_PX;
}

/**
 * 捕获当前阅读锚点。
 *
 * @remarks
 * 锚点取视口顶部所在的稳定项与其项内偏移；视口在所有项之上时取第一项。
 *
 * @param layout - 当前布局度量。
 * @returns 锚点；没有任何项时返回 `undefined`。
 * @example
 * ```ts
 * captureAnchor({ offsets: new Map([["message:m1", 100]]), scrollTop: 120 });
 * ```
 */
export function captureAnchor(layout: {
  readonly offsets: ReadonlyMap<string, number>;
  readonly scrollTop: number;
}): ActivityAnchor | undefined {
  const entries = [...layout.offsets.entries()].sort((left, right) => left[1] - right[1]);
  const first = entries[0];
  if (first === undefined) return undefined;
  let anchor: ActivityAnchor | undefined;
  for (const [itemId, top] of entries) {
    if (top > layout.scrollTop) break;
    anchor = { itemId, offset: layout.scrollTop - top };
  }
  return anchor ?? { itemId: first[0], offset: layout.scrollTop - first[1] };
}

/**
 * 按锚点计算应恢复的滚动位置。
 *
 * @remarks
 * 锚点项已不在当前页时返回 `undefined`，调用方据此保留原位置而不是跳到顶部。
 *
 * @param anchor - 当前锚点。
 * @param offsets - 当前布局度量。
 * @returns 应恢复的滚动位置；锚点不可用时返回 `undefined`。
 * @example
 * ```ts
 * resolveAnchorScrollTop(anchor, { offsets });
 * ```
 */
export function resolveAnchorScrollTop(
  anchor: ActivityAnchor | undefined,
  offsets: ReadonlyMap<string, number>,
): number | undefined {
  if (anchor === undefined) return undefined;
  const top = offsets.get(anchor.itemId);
  if (top === undefined) return undefined;
  return top + anchor.offset;
}

/**
 * 汇总当前页首尾的未加载区间。
 *
 * @param page - 当前页。
 * @returns 更早与更新的缺口；没有缺口时返回空数组。
 * @example
 * ```ts
 * resolveActivityGaps(page);
 * ```
 */
export function resolveActivityGaps(page: BrowserActivityPage | undefined): readonly BrowserActivityGap[] {
  return page?.gaps ?? [];
}

/**
 * 把更早的一页并入当前窗口。
 *
 * @remarks
 * 更早页的项按稳定身份并入当前页并排在前面，因此用户向上翻页时当前可见项不移动；
 * 更早方向的缺口来自新页，更新方向的缺口保持当前页的读数。
 *
 * @param state - 当前窗口状态。
 * @param page - 更早的一页。
 * @returns 更新后的窗口状态。
 * @example
 * ```ts
 * const next = prependActivityPage(state, olderPage);
 * ```
 */
export function prependActivityPage(state: ActivityWindowState, page: BrowserActivityPage): ActivityWindowState {
  if (state.page === undefined) return applyActivityPage(state, page);
  const merged: BrowserActivityPage = {
    ...state.page,
    items: mergeActivityItems(page.items, state.page.items),
    gaps: [
      ...page.gaps.filter((gap) => gap.direction === "older"),
      ...state.page.gaps.filter((gap) => gap.direction === "newer"),
    ],
    range: {
      ...state.page.range,
      ...(page.range.first === undefined ? {} : { first: page.range.first }),
      olderAvailable: page.range.olderAvailable,
    },
    ...(page.beforeCursor === undefined ? {} : { beforeCursor: page.beforeCursor }),
  };
  return {
    ...state,
    page: merged,
    cachedPages: [page, ...state.cachedPages.filter((cached) => cached.beforeCursor !== page.beforeCursor)]
      .slice(0, MAX_CACHED_ACTIVITY_PAGES),
  };
}

/**
 * 把更新的一页并入当前窗口。
 *
 * @remarks
 * 更新页的项按稳定身份并入当前页并排在后面；更新方向的缺口来自新页。
 *
 * @param state - 当前窗口状态。
 * @param page - 更新的一页。
 * @returns 更新后的窗口状态。
 * @example
 * ```ts
 * const next = appendActivityPage(state, newerPage);
 * ```
 */
export function appendActivityPage(state: ActivityWindowState, page: BrowserActivityPage): ActivityWindowState {
  if (state.page === undefined) return applyActivityPage(state, page);
  const merged: BrowserActivityPage = {
    ...state.page,
    items: mergeActivityItems(state.page.items, page.items),
    gaps: [
      ...state.page.gaps.filter((gap) => gap.direction === "older"),
      ...page.gaps.filter((gap) => gap.direction === "newer"),
    ],
    range: {
      ...state.page.range,
      ...(page.range.last === undefined ? {} : { last: page.range.last }),
      newerAvailable: page.range.newerAvailable,
    },
    ...(page.afterCursor === undefined ? {} : { afterCursor: page.afterCursor }),
  };
  return {
    ...state,
    page: merged,
    cachedPages: [page, ...state.cachedPages.filter((cached) => cached.afterCursor !== page.afterCursor)]
      .slice(0, MAX_CACHED_ACTIVITY_PAGES),
  };
}

/**
 * 生成页的缓存键。
 *
 * @param page - Activity 页。
 * @returns 由游标与范围组成的稳定键。
 */
function pageKey(page: BrowserActivityPage): string {
  return `${page.beforeCursor ?? ""}|${page.afterCursor ?? ""}|${page.range.first?.sequence ?? ""}|${page.range.last?.sequence ?? ""}`;
}

function countNewItems(current: BrowserActivityPage, incoming: BrowserActivityPage): number {
  const known = new Set(current.items.map((item) => item.itemId));
  return incoming.items.filter((item) => !known.has(item.itemId)).length;
}

function maxPosition(left: BrowserActivityPosition, right: BrowserActivityPosition | undefined): BrowserActivityPosition {
  if (right === undefined) return left;
  const byRun = left.runOrder - right.runOrder;
  if (byRun !== 0) return byRun > 0 ? left : right;
  if (left.sequence !== right.sequence) return left.sequence > right.sequence ? left : right;
  if (left.itemKind === right.itemKind) return left.order >= right.order ? left : right;
  return left.itemKind === "fact" ? left : right;
}
