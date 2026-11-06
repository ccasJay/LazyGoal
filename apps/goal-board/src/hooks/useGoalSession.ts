import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BrowserActivityPage,
  BrowserActivityQuery,
  BrowserControlSnapshot,
  BrowserGoalSession,
  BrowserGoalSessionState,
  BrowserModelCatalog,
  BrowserSessionState,
} from "../../../../packages/web-contracts/src/index";
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
 * const session = useGoalSession({ onGoalsRefresh, onClearLiveText });
 * ```
 */
export function useGoalSession({
  onGoalsRefresh,
  onClearLiveText,
}: {
  onGoalsRefresh: () => Promise<void>;
  onClearLiveText: () => void;
}) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [session, setSession] = useState<BrowserGoalSessionState | null>(null);
  const [sessionState, setSessionState] = useState<BrowserSessionState | null>(null);
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
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadingEarlierRef = useRef(false);

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
  const latestSession = useRef<BrowserGoalSessionState | null>(null);
  const latestActivityPage = useRef<BrowserActivityPage | null>(null);
  const selectedGoalIdRef = useRef(selectedGoalId);
  selectedGoalIdRef.current = selectedGoalId;

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
  }, [loadDraftDefault]);

  const closeSession = useCallback(() => {
    setSelectedGoalId(null);
    setDraftSessionOpen(false);
    draftGeneration.current += 1;
  }, []);

  const selectGoal = useCallback((goalId: string) => {
    setDraftSessionOpen(false);
    setSelectedGoalId(goalId);
  }, []);

  const onGoalsRefreshRef = useRef(onGoalsRefresh);
  const onClearLiveTextRef = useRef(onClearLiveText);
  useEffect(() => {
    onGoalsRefreshRef.current = onGoalsRefresh;
    onClearLiveTextRef.current = onClearLiveText;
  }, [onGoalsRefresh, onClearLiveText]);

  const loadFullSession = useCallback(async () => {
    const goalId = selectedGoalId;
    if (goalId === null) return null;
    fullSessionRequested.current = true;
    const version = ++fullLoadVersion.current;
    setFullSessionLoading(true);
    setFullSessionError(null);
    try {
      const next = await browserApi.readGoal(goalId);
      if (selectedGoalIdRef.current !== goalId || version !== fullLoadVersion.current) return null;
      setFullSession(next);
      return next;
    } catch (error) {
      if (selectedGoalIdRef.current === goalId && version === fullLoadVersion.current) {
        setFullSessionError(errorMessage(error));
      }
      return null;
    } finally {
      if (version === fullLoadVersion.current) setFullSessionLoading(false);
    }
  }, [selectedGoalId]);

  const refreshSelectedSession = useCallback(async () => {
    const goalId = selectedGoalId;
    if (goalId === null) return;
    const hadVisibleSession = latestSession.current !== null;
    if (!hadVisibleSession) setSessionLoading(true);
    try {
      const [stateResult, activityResult] = await Promise.allSettled([
        browserApi.readGoalSessionState(goalId),
        browserApi.readGoalActivity(goalId),
      ]);
      if (selectedGoalIdRef.current !== goalId) return;
      if (stateResult.status === "fulfilled") {
        latestSession.current = stateResult.value.goal;
        setSession(stateResult.value.goal);
        setSessionState(stateResult.value.session ?? null);
        setSessionError(null);
      } else {
        setSessionError(errorMessage(stateResult.reason));
      }
      if (activityResult.status === "fulfilled") {
        const nextActivity = activityResult.value;
        const previousPage = latestActivityPage.current;
        const previousMessageIds = new Set(previousPage?.items
          .filter((item) => item.type === "message")
          .map((item) => item.messageId) ?? []);
        latestActivityPage.current = nextActivity;
        setActivityPage(nextActivity);
        setActivityWindow((current) => mergeLatestPage(current, nextActivity));
        setActivityError(null);
        const hasNewSavedMessage = nextActivity.items.some((item) => item.type === "message" && !previousMessageIds.has(item.messageId));
        if (hadVisibleSession && hasNewSavedMessage) onClearLiveTextRef.current();
      } else {
        setActivityError(errorMessage(activityResult.reason));
      }
      await onGoalsRefreshRef.current();
      if (fullSessionRequested.current) await loadFullSession();
    } catch (error) {
      if (selectedGoalIdRef.current === goalId) setSessionError(errorMessage(error));
    } finally {
      if (!hadVisibleSession && selectedGoalIdRef.current === goalId) setSessionLoading(false);
    }
  }, [loadFullSession, selectedGoalId]);

  /**
   * 直接应用权威控制快照。
   *
   * @remarks
   * 流式 `state_sync` 携带完整快照时，只替换会话控制状态；不重读 Activity、
   * Trajectory、Metrics 或完整历史。快照的 Goal 身份与当前选择不一致时忽略，
   * 避免迟到快照覆盖新选择。
   *
   * @param snapshot - 同一提交边界的 Goal 与会话控制状态。
   * @example
   * ```ts
   * applyControlSnapshot(event.snapshot);
   * ```
   */
  const applyControlSnapshot = useCallback((snapshot: BrowserControlSnapshot) => {
    if (selectedGoalIdRef.current === null || snapshot.goal.goalId !== selectedGoalIdRef.current) return;
    latestSession.current = snapshot.goal;
    setSession(snapshot.goal);
    setSessionState(snapshot.session);
    setSessionError(null);
  }, []);

  /**
   * 只重新读取窄会话状态。
   *
   * @remarks
   * 用于 `state_committed` 声明 `session` 作用域的定向失效；不读取 Activity、
   * 完整历史或 Goal 列表。
   */
  const refreshSessionState = useCallback(async (): Promise<void> => {
    const goalId = selectedGoalId;
    if (goalId === null) return;
    try {
      const next = await browserApi.readGoalSessionState(goalId);
      if (selectedGoalIdRef.current !== goalId) return;
      latestSession.current = next.goal;
      setSession(next.goal);
      setSessionState(next.session ?? null);
      setSessionError(null);
    } catch (error) {
      if (selectedGoalIdRef.current === goalId) setSessionError(errorMessage(error));
    }
  }, [selectedGoalId]);

  /**
   * 只重新读取最新 Activity 窗口。
   *
   * @remarks
   * 用于 `activity`／`trajectory` 作用域的定向失效；保留当前窗口的滚动与缺口
   * 状态，不重读窄会话状态或完整历史。
   */
  const refreshActivity = useCallback(async (): Promise<void> => {
    const goalId = selectedGoalId;
    if (goalId === null) return;
    try {
      const nextActivity = await browserApi.readGoalActivity(goalId);
      if (selectedGoalIdRef.current !== goalId) return;
      const previousPage = latestActivityPage.current;
      const previousMessageIds = new Set(previousPage?.items
        .filter((item) => item.type === "message")
        .map((item) => item.messageId) ?? []);
      latestActivityPage.current = nextActivity;
      setActivityPage(nextActivity);
      setActivityWindow((current) => mergeLatestPage(current, nextActivity));
      setActivityError(null);
      const hasNewSavedMessage = nextActivity.items.some((item) => item.type === "message" && !previousMessageIds.has(item.messageId));
      if (previousPage !== null && hasNewSavedMessage) onClearLiveTextRef.current();
    } catch (error) {
      setActivityError(errorMessage(error));
    }
  }, [selectedGoalId]);

  const readActivityWindow = useCallback(async (query: BrowserActivityQuery): Promise<BrowserActivityPage | undefined> => {
    const goalId = selectedGoalId;
    if (goalId === null) return undefined;
    const page = await browserApi.readGoalActivity(goalId, query);
    if (selectedGoalIdRef.current !== goalId) return undefined;
    return page;
  }, [selectedGoalId]);

  /**
   * 连续读取更早的 Activity 页并入当前窗口。
   *
   * @remarks
   * 只读历史：读取不恢复执行、不消费队列，也不提交任何输入。调用方给出起始 cursor、
   * 项数预算与页数上限；读取失败保留当前窗口，不阻断已展示内容。
   */
  const loadEarlierPages = useCallback(async (
    goalId: string,
    startCursor: string | undefined,
    budgetItems: number,
    maxPages: number,
  ): Promise<void> => {
    if (startCursor === undefined || loadingEarlierRef.current) return;
    loadingEarlierRef.current = true;
    setLoadingEarlier(true);
    try {
      let cursor: string | undefined = startCursor;
      let items = 0;
      let pages = 0;
      while (cursor !== undefined && items < budgetItems && pages < maxPages) {
        const page = await browserApi.readGoalActivity(goalId, { before: cursor });
        if (selectedGoalIdRef.current !== goalId) return;
        setActivityWindow((current) => prependActivityPage(current, page));
        items += page.items.length;
        pages += 1;
        cursor = page.beforeCursor;
      }
    } catch {
      // 保留当前窗口；用户继续上滑时仍可再次尝试。
    } finally {
      loadingEarlierRef.current = false;
      if (selectedGoalIdRef.current === goalId) setLoadingEarlier(false);
    }
  }, []);

  /**
   * 读取更早一页并并入当前窗口。
   *
   * @remarks 只读历史：读取不恢复执行、不消费队列，也不提交任何输入。失败保留当前窗口。
   */
  const loadEarlierActivity = useCallback(async (): Promise<void> => {
    const goalId = selectedGoalId;
    const cursor = activityWindow.page?.beforeCursor;
    if (goalId === null || cursor === undefined) return;
    await loadEarlierPages(goalId, cursor, Number.MAX_SAFE_INTEGER, 1);
  }, [activityWindow.page, loadEarlierPages, selectedGoalId]);

  /**
   * 读取更新一页并并入当前窗口。
   *
   * @remarks 只读历史：读取不恢复执行、不消费队列，也不提交任何输入。失败保留当前窗口。
   */
  const loadNewerActivity = useCallback(async (): Promise<void> => {
    const cursor = activityWindow.page?.afterCursor;
    if (cursor === undefined) return;
    try {
      const page = await readActivityWindow({ after: cursor });
      if (page === undefined) return;
      setActivityWindow((current) => appendActivityPage(current, page));
    } catch (error) {
      setActivityWindow((current) => applyActivityPageFailure(current, { kind: "failed", message: errorMessage(error) }));
    }
  }, [activityWindow.page, readActivityWindow]);

  /**
   * 重新读取最新固定窗口并回到跟随状态。
   *
   * @remarks 只读操作：不提交输入，不恢复执行，也不消费队列。
   */
  const jumpToLatestActivity = useCallback(async (): Promise<void> => {
    try {
      const page = await readActivityWindow({});
      if (page === undefined) return;
      setActivityWindow((current) => applyActivityPage({ ...current, following: true, unread: 0 }, page));
      setActivityPage(page);
    } catch (error) {
      setActivityWindow((current) => applyActivityPageFailure(current, { kind: "failed", message: errorMessage(error) }));
    }
  }, [readActivityWindow]);

  useEffect(() => {
    if (selectedGoalId === null) {
      latestSession.current = null;
      latestActivityPage.current = null;
      fullSessionRequested.current = false;
      fullLoadVersion.current += 1;
      setSession(null);
      setSessionState(null);
      setActivityPage(null);
      setActivityWindow(createActivityWindowState());
      setFullSession(null);
      setFullSessionLoading(false);
      setFullSessionError(null);
      setSessionLoading(false);
      setActivityError(null);
      setLoadingEarlier(false);
      if (browserApi.hasAccessToken) setSessionError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    latestSession.current = null;
    latestActivityPage.current = null;
    fullSessionRequested.current = false;
    fullLoadVersion.current += 1;
    setSession(null);
    setSessionState(null);
    setActivityPage(null);
    setFullSession(null);
    setFullSessionError(null);
    setSessionLoading(true);
    setSessionError(null);
    setActivityError(null);
    setLoadingEarlier(false);

    void browserApi.readGoalSessionState(selectedGoalId, controller.signal)
      .then((next) => {
        if (!active) return;
        latestSession.current = next.goal;
        setSession(next.goal);
        setSessionState(next.session ?? null);
        setSessionError(null);
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) setSessionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });

    void browserApi.readGoalActivity(selectedGoalId, {}, controller.signal)
      .then((nextActivity) => {
        if (!active) return;
        latestActivityPage.current = nextActivity;
        setActivityPage(nextActivity);
        setActivityWindow((current) => applyActivityPage(current, nextActivity));
        setActivityError(null);
        void loadEarlierPages(
          selectedGoalId,
          nextActivity.beforeCursor,
          Math.max(0, ACTIVITY_PREFETCH_ITEM_BUDGET - nextActivity.items.length),
          ACTIVITY_PREFETCH_MAX_PAGES,
        );
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) setActivityError(errorMessage(error));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [loadEarlierPages, selectedGoalId]);

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
    setSessionError,
    latestSession,
    refreshSelectedSession,
    applyControlSnapshot,
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
