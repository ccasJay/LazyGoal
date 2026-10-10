import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BrowserGoalSession,
  BrowserModelCatalog,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { committedStepCount, errorMessage } from "../types";

export function useGoalSession({
  onGoalsRefresh,
  onClearLiveText,
}: {
  onGoalsRefresh: () => Promise<void>;
  onClearLiveText: () => void;
}) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [session, setSession] = useState<BrowserGoalSession | null>(null);
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
  const latestSession = useRef<BrowserGoalSession | null>(null);

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

  const refreshSelectedSession = useCallback(async () => {
    if (selectedGoalId === null) return;
    const hasVisibleSession = latestSession.current !== null;
    if (!hasVisibleSession) setSessionLoading(true);
    try {
      const next = await browserApi.readGoal(selectedGoalId);
      const previous = latestSession.current;
      latestSession.current = next;
      setSession(next);
      setSessionError(null);
      if (
        previous !== null &&
        (next.messages.length > previous.messages.length ||
          committedStepCount(next) > committedStepCount(previous))
      ) {
        onClearLiveTextRef.current();
      }
      await onGoalsRefreshRef.current();
    } catch (error) {
      setSessionError(errorMessage(error));
    } finally {
      if (!hasVisibleSession) setSessionLoading(false);
    }
  }, [selectedGoalId]);

  useEffect(() => {
    if (selectedGoalId === null) {
      latestSession.current = null;
      setSession(null);
      setSessionLoading(false);
      if (browserApi.hasAccessToken) setSessionError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    latestSession.current = null;
    setSession(null);
    setSessionLoading(true);
    setSessionError(null);

    void browserApi
      .readGoal(selectedGoalId, controller.signal)
      .then((next) => {
        if (!active) return;
        latestSession.current = next;
        setSession(next);
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
    setSession,
    latestSession,
    sessionLoading,
    sessionError,
    setSessionError,
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
