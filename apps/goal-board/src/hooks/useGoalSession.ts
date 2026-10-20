import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BrowserActivityPage,
  BrowserGoalSession,
  BrowserGoalSessionState,
  BrowserModelCatalog,
  BrowserSessionState,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { errorMessage } from "../types";

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
  const [fullSession, setFullSession] = useState<BrowserGoalSession | null>(null);
  const [fullSessionLoading, setFullSessionLoading] = useState(false);
  const [fullSessionError, setFullSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

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
      const [next, nextActivity] = await Promise.all([
        browserApi.readGoalSessionState(goalId),
        browserApi.readGoalActivity(goalId),
      ]);
      if (selectedGoalIdRef.current !== goalId) return;
      const previousPage = latestActivityPage.current;
      const previousMessageIds = new Set(previousPage?.items
        .filter((item) => item.type === "message")
        .map((item) => item.messageId) ?? []);
      latestSession.current = next.goal;
      latestActivityPage.current = nextActivity;
      setSession(next.goal);
      setSessionState(next.session ?? null);
      setActivityPage(nextActivity);
      setSessionError(null);
      const hasNewSavedMessage = nextActivity.items.some((item) => item.type === "message" && !previousMessageIds.has(item.messageId));
      if (hadVisibleSession && hasNewSavedMessage) onClearLiveTextRef.current();
      await onGoalsRefreshRef.current();
      if (fullSessionRequested.current) await loadFullSession();
    } catch (error) {
      if (selectedGoalIdRef.current === goalId) setSessionError(errorMessage(error));
    } finally {
      if (!hadVisibleSession && selectedGoalIdRef.current === goalId) setSessionLoading(false);
    }
  }, [loadFullSession, selectedGoalId]);

  useEffect(() => {
    if (selectedGoalId === null) {
      latestSession.current = null;
      latestActivityPage.current = null;
      fullSessionRequested.current = false;
      fullLoadVersion.current += 1;
      setSession(null);
      setSessionState(null);
      setActivityPage(null);
      setFullSession(null);
      setFullSessionLoading(false);
      setFullSessionError(null);
      setSessionLoading(false);
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

    void Promise.all([
      browserApi.readGoalSessionState(selectedGoalId, controller.signal),
      browserApi.readGoalActivity(selectedGoalId, {}, controller.signal),
    ])
      .then(([next, nextActivity]) => {
        if (!active) return;
        latestSession.current = next.goal;
        latestActivityPage.current = nextActivity;
        setSession(next.goal);
        setSessionState(next.session ?? null);
        setActivityPage(nextActivity);
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) setSessionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedGoalId]);

  return {
    selectedGoalId,
    setSelectedGoalId,
    selectGoal,
    session,
    sessionState,
    activityPage,
    fullSession,
    fullSessionLoading,
    fullSessionError,
    loadFullSession,
    sessionLoading,
    sessionError,
    setSessionError,
    latestSession,
    refreshSelectedSession,
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
