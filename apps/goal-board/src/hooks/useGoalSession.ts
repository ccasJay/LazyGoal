import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  BrowserActivityPage,
  BrowserActivityQuery,
  BrowserControlSnapshot,
  BrowserGoalSession,
  BrowserModelCatalog,
} from "../../../../packages/web-contracts/src/index";
import type { GoalView } from "../control/types";
import type { ControlIntents } from "./useControlIntents";
import { browserApi } from "../api";
import { errorMessage } from "../types";
import {
  ACTIVITY_PREFETCH_ITEM_BUDGET,
  ACTIVITY_PREFETCH_MAX_PAGES,
  applyActivityPage,
  applyActivityPageFailure,
  appendActivityPage,
  createActivityWindowState,
  mergeLatestPage,
  prependActivityPage,
  type ActivityWindowState,
} from "../activity-page-window";

/**
 * 同步选中 Goal 的窄状态与首个 Activity 页，并按需读取完整会话。
 *
 * @remarks
 * 初始读取不下载完整消息／步骤历史；切换 Goal 会使旧响应失效。完整读取只返回只读投影，
 * 不触发 Runtime 推进。
 *
 * @param callbacks - Goal 列表刷新与正式消息保存后清除对应临时正文的页面回调。
 * @returns 当前选择、窄状态、Activity 窗口、按需完整会话及草稿控制。
 * @example
 * ```ts
 * const session = useGoalSession({ control, onGoalsRefresh, onClearLiveText });
 * ```
 */
export function useGoalSession({
  control,
  onGoalsRefresh,
  onClearLiveText,
}: {
  control: ControlIntents;
  onGoalsRefresh: () => Promise<void>;
  onClearLiveText: () => void;
}) {
  const { acceptSnapshot, currentState, ownsView, selectGoal: setSelectedGoalId } = control;
  const { view, snapshot } = control.state;
  const selectedGoalId = view?.goalId ?? null;
  const session = snapshot?.goal ?? null;
  const sessionState = snapshot?.session ?? null;
  const [activityPage, setActivityPage] = useState<BrowserActivityPage | null>(null);
  const [activityWindow, setActivityWindow] = useState<ActivityWindowState>(createActivityWindowState());
  const setFollow = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    setActivityWindow(current => {
      const following = typeof value === "function" ? value(current.following) : value;
      return { ...current, following, unread: following ? 0 : current.unread };
    });
  }, []);
  const [fullSession, setFullSession] = useState<BrowserGoalSession | null>(null);
  const [fullSessionLoading, setFullSessionLoading] = useState(false);
  const [fullSessionError, setFullSessionError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionLoading = view !== null && session === null && sessionError === null;
  const [activityError, setActivityError] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadingEarlierRef = useRef<object | null>(null);
  const activityLoadVersion = useRef(0);
  const activityWindowVersion = useRef(0);
  const sessionReadVersion = useRef(0);
  const sessionConfirmed = useRef(0);

  const [draftSessionOpen, setDraftSessionOpen] = useState(false);
  const [draftPlanMode, setDraftPlanMode] = useState(false);
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const [draftModelCatalog, setDraftModelCatalog] = useState<BrowserModelCatalog | null>(null);
  const [draftModelError, setDraftModelError] = useState<string | null>(null);

  const draftGoalId = useRef<string | null>(null);
  const draftGeneration = useRef(0);
  const draftLoadVersion = useRef(0);
  const fullLoadVersion = useRef(0);
  const fullSessionRequested = useRef(false);
  const latestActivityPage = useRef<BrowserActivityPage | null>(null);

  const loadDraftDefault = useCallback(async (generation: number) => {
    const version = ++draftLoadVersion.current;
    setDraftModelError(null);
    try {
      const catalog = await browserApi.listModels();
      if (generation !== draftGeneration.current || version !== draftLoadVersion.current) return;
      setDraftModelCatalog(catalog);
      const selected = catalog.models.find((model) => model.id === catalog.currentModelId && model.selectable);
      setDraftModelId(selected?.id ?? null);
    } catch {
      if (generation !== draftGeneration.current || version !== draftLoadVersion.current) return;
      setDraftModelError("Could not load the new Goal model. Retry or choose a model.");
    }
  }, []);

  const openNewGoalDraft = useCallback(() => {
    draftGoalId.current = null;
    setDraftModelId(null);
    setDraftModelCatalog(null);
    setDraftModelError(null);
    const generation = ++draftGeneration.current;
    void loadDraftDefault(generation);
    setSelectedGoalId(null);
    setDraftPlanMode(false);
    setDraftSessionOpen(true);
  }, [loadDraftDefault, setSelectedGoalId]);

  const closeSession = useCallback(() => {
    setSelectedGoalId(null);
    setDraftSessionOpen(false);
    draftGeneration.current += 1;
  }, [setSelectedGoalId]);

  const selectGoal = useCallback((goalId: string) => {
    setDraftSessionOpen(false);
    setSelectedGoalId(goalId);
  }, [setSelectedGoalId]);

  const onGoalsRefreshRef = useRef(onGoalsRefresh);
  const onClearLiveTextRef = useRef(onClearLiveText);
  useEffect(() => {
    onGoalsRefreshRef.current = onGoalsRefresh;
    onClearLiveTextRef.current = onClearLiveText;
  }, [onGoalsRefresh, onClearLiveText]);

  const loadFullSession = useCallback(async () => {
    if (view === null || !ownsView(view)) return null;
    fullSessionRequested.current = true;
    const version = ++fullLoadVersion.current;
    const current = () => ownsView(view) && version === fullLoadVersion.current;
    setFullSessionLoading(true);
    setFullSessionError(null);
    try {
      const next = await browserApi.readGoal(view.goalId);
      if (!current() || next.goalId !== view.goalId) return null;
      setFullSession(next);
      return next;
    } catch (error) {
      if (current()) setFullSessionError(errorMessage(error));
      return null;
    } finally {
      if (current()) setFullSessionLoading(false);
    }
  }, [ownsView, view]);

  const confirmSession = useCallback(() => {
    sessionConfirmed.current += 1;
    setSessionError(null);
  }, []);

  const readSessionState = useCallback(async (target: GoalView, signal?: AbortSignal): Promise<boolean> => {
    if (!ownsView(target) || signal?.aborted) return false;
    const version = ++sessionReadVersion.current;
    const confirmed = sessionConfirmed.current;
    const reportFailure = (message: string) => {
      if (ownsView(target) && !signal?.aborted && version === sessionReadVersion.current
        && confirmed === sessionConfirmed.current) setSessionError(message);
    };
    try {
      const next = await browserApi.readGoalSessionState(target.goalId, signal);
      if (signal?.aborted || !ownsView(target)) return false;
      if (next.session === undefined || next.goal.goalId !== target.goalId || next.session.goalId !== target.goalId
        || next.goal.currentRunId !== next.session.runId) {
        reportFailure("Could not confirm the current Goal state. Reload the session.");
        return false;
      }
      if (version !== sessionReadVersion.current
        && next.session.commitRevision === currentState().snapshot?.session.commitRevision) return false;
      const accepted = acceptSnapshot(target, { goal: next.goal, session: next.session });
      if (accepted) confirmSession();
      return accepted;
    } catch (error) {
      reportFailure(errorMessage(error));
      return false;
    }
  }, [acceptSnapshot, confirmSession, currentState, ownsView]);

  const refreshSessionState = useCallback(async (): Promise<boolean> =>
    view !== null && readSessionState(view), [readSessionState, view]);

  const loadLatestActivity = useCallback(async (target: GoalView, signal?: AbortSignal) => {
    if (!ownsView(target)) return undefined;
    const version = ++activityLoadVersion.current;
    const current = () => ownsView(target) && !signal?.aborted && version === activityLoadVersion.current;
    try {
      const next = await browserApi.readGoalActivity(target.goalId, {}, signal);
      if (!current() || next.goalId !== target.goalId) return undefined;
      const previous = latestActivityPage.current;
      const previousMessageIds = new Set(previous?.items.filter((item) => item.type === "message").map((item) => item.messageId));
      latestActivityPage.current = next;
      setActivityPage(next);
      setActivityWindow((window) => previous === null ? applyActivityPage(window, next) : mergeLatestPage(window, next));
      setActivityError(null);
      if (previous !== null && next.items.some((item) => item.type === "message" && !previousMessageIds.has(item.messageId))) {
        onClearLiveTextRef.current();
      }
      return next;
    } catch (error) {
      if (current()) setActivityError(errorMessage(error));
      return undefined;
    }
  }, [ownsView]);

  const refreshActivity = useCallback(async (target: GoalView, signal?: AbortSignal): Promise<boolean> =>
    (await loadLatestActivity(target, signal)) !== undefined, [loadLatestActivity]);

  const refreshSelectedSession = useCallback(async () => {
    if (view === null || !ownsView(view)) return;
    await Promise.all([readSessionState(view), loadLatestActivity(view)]);
    if (!ownsView(view)) return;
    await onGoalsRefreshRef.current();
    if (ownsView(view) && fullSessionRequested.current) await loadFullSession();
  }, [loadFullSession, loadLatestActivity, ownsView, readSessionState, view]);

  const readActivityWindow = useCallback(async (query: BrowserActivityQuery): Promise<BrowserActivityPage | undefined> => {
    if (view === null || !ownsView(view)) return undefined;
    const page = await browserApi.readGoalActivity(view.goalId, query);
    return ownsView(view) && page.goalId === view.goalId ? page : undefined;
  }, [ownsView, view]);

  /**
   * 连续读取更早的 Activity 页并入当前窗口。
   *
   * @remarks
   * 只读历史：读取不恢复执行、不消费队列，也不提交任何输入。调用方给出起始 cursor、
   * 项数预算与页数上限；读取失败保留当前窗口，不阻断已展示内容。
   */
  const loadEarlierPages = useCallback(async (
    target: GoalView,
    startCursor: string | undefined,
    budgetItems: number,
    maxPages: number,
  ): Promise<void> => {
    if (startCursor === undefined || loadingEarlierRef.current !== null || !ownsView(target)) return;
    const request = {};
    const windowVersion = activityWindowVersion.current;
    loadingEarlierRef.current = request;
    setLoadingEarlier(true);
    try {
      let cursor: string | undefined = startCursor;
      let items = 0;
      let pages = 0;
      while (cursor !== undefined && items < budgetItems && pages < maxPages) {
        const page = await browserApi.readGoalActivity(target.goalId, { before: cursor });
        if (!ownsView(target) || activityWindowVersion.current !== windowVersion || page.goalId !== target.goalId) return;
        setActivityWindow((current) => prependActivityPage(current, page));
        items += page.items.length;
        pages += 1;
        cursor = page.beforeCursor;
      }
    } catch {
      // 保留当前窗口；用户继续上滑时仍可再次尝试。
    } finally {
      if (ownsView(target) && loadingEarlierRef.current === request) {
        loadingEarlierRef.current = null;
        setLoadingEarlier(false);
      }
    }
  }, [ownsView]);

  /**
   * 读取更早一页并并入当前窗口。
   *
   * @remarks 只读历史：读取不恢复执行、不消费队列，也不提交任何输入。失败保留当前窗口。
   */
  const loadEarlierActivity = useCallback(async (): Promise<void> => {
    const cursor = activityWindow.page?.beforeCursor;
    if (view === null || cursor === undefined) return;
    await loadEarlierPages(view, cursor, Number.MAX_SAFE_INTEGER, 1);
  }, [activityWindow.page, loadEarlierPages, view]);

  /**
   * 读取更新一页并并入当前窗口。
   *
   * @remarks 只读历史：读取不恢复执行、不消费队列，也不提交任何输入。失败保留当前窗口。
   */
  const loadNewerActivity = useCallback(async (): Promise<void> => {
    const cursor = activityWindow.page?.afterCursor;
    if (cursor === undefined || view === null) return;
    const version = activityWindowVersion.current;
    const current = () => ownsView(view) && activityWindowVersion.current === version;
    try {
      const page = await readActivityWindow({ after: cursor });
      if (page === undefined || !current()) return;
      setActivityWindow((current) => appendActivityPage(current, page));
    } catch (error) {
      if (current()) setActivityWindow((window) => applyActivityPageFailure(window, { kind: "failed", message: errorMessage(error) }));
    }
  }, [activityWindow.page, ownsView, readActivityWindow, view]);

  /**
   * 重新读取最新固定窗口并回到跟随状态。
   *
   * @remarks 只读操作：不提交输入，不恢复执行，也不消费队列。
   */
  const jumpToLatestActivity = useCallback(async (): Promise<void> => {
    if (view === null || !ownsView(view)) return;
    const version = ++activityWindowVersion.current;
    const current = () => ownsView(view) && activityWindowVersion.current === version;
    try {
      const page = await readActivityWindow({});
      if (page === undefined || !current()) return;
      activityLoadVersion.current += 1;
      latestActivityPage.current = page;
      setActivityWindow((current) => applyActivityPage({ ...current, following: true, unread: 0 }, page));
      setActivityPage(page);
    } catch (error) {
      if (current()) setActivityWindow((window) => applyActivityPageFailure(window, { kind: "failed", message: errorMessage(error) }));
    }
  }, [ownsView, readActivityWindow, view]);

  useLayoutEffect(() => {
    latestActivityPage.current = null;
    loadingEarlierRef.current = null;
    fullSessionRequested.current = false;
    setActivityPage(null);
    setActivityWindow(createActivityWindowState());
    setFullSession(null);
    setFullSessionLoading(false);
    setFullSessionError(null);
    if (view !== null || browserApi.hasAccessToken) setSessionError(null);
    setActivityError(null);
    setLoadingEarlier(false);
  }, [view]);

  useEffect(() => {
    if (view === null) return;
    const controller = new AbortController();
    void readSessionState(view, controller.signal);
    void loadLatestActivity(view, controller.signal).then((page) => {
      if (page === undefined || controller.signal.aborted) return;
      void loadEarlierPages(view, page.beforeCursor,
        Math.max(0, ACTIVITY_PREFETCH_ITEM_BUDGET - page.items.length),
        ACTIVITY_PREFETCH_MAX_PAGES);
    });
    return () => controller.abort();
  }, [loadEarlierPages, loadLatestActivity, readSessionState, view]);

  return {
    selectedGoalId,
    setSelectedGoalId,
    selectGoal,
    session,
    sessionState,
    activityPage,
    activityWindow,
    setFollow,
    loadEarlierActivity,
    loadNewerActivity,
    jumpToLatestActivity,
    fullSession,
    fullSessionLoading,
    fullSessionError,
    loadFullSession,
    sessionLoading,
    sessionError,
    activityError,
    loadingEarlier,
    refreshSelectedSession,
    confirmSession,
    readSessionState,
    refreshSessionState,
    refreshActivity,
    draftSessionOpen,
    setDraftSessionOpen,
    draftPlanMode,
    setDraftPlanMode,
    draftModelId,
    setDraftModelId,
    draftModelCatalog,
    setDraftModelCatalog,
    draftModelError,
    setDraftModelError,
    draftGoalId,
    openNewGoalDraft,
    closeSession,
    loadDraftDefault,
  };
}
