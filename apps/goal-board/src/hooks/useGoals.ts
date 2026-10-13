import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserGoalListItem } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { type MetricsState, errorMessage } from "../types";

export function useGoals({
  selectedGoalId,
  onError,
}: {
  selectedGoalId: string | null;
  onError?: (message: string | null) => void;
}) {
  const [goals, setGoals] = useState<readonly BrowserGoalListItem[]>([]);
  const [metricsByGoal, setMetricsByGoal] = useState<Record<string, MetricsState>>({});
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [manageBusyId, setManageBusyId] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [undoArchiveId, setUndoArchiveId] = useState<string | null>(null);

  const loadedMetricsRef = useRef<Set<string>>(new Set());
  const pendingMetricsRef = useRef<Set<string>>(new Set());

  const refreshGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const result = await browserApi.listGoals();
      setGoals(result);
      loadedMetricsRef.current.clear();
      onError?.(null);
    } catch (error) {
      onError?.(errorMessage(error));
    } finally {
      setGoalsLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!browserApi.hasAccessToken) {
      setGoalsLoading(false);
      onError?.("Open the local link printed by `lazygoal web` to connect this board.");
      return;
    }
    const controller = new AbortController();
    void browserApi
      .listGoals(controller.signal)
      .then((result) => {
        setGoals(result);
        onError?.(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) onError?.(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setGoalsLoading(false);
      });
    return () => controller.abort();
  }, [onError]);

  useEffect(() => {
    if (goals.length === 0) return;

    const goalsToFetch = goals.filter(
      (goal) => !loadedMetricsRef.current.has(goal.goalId) && !pendingMetricsRef.current.has(goal.goalId)
    );
    if (goalsToFetch.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (controller.signal.aborted) return;

      for (const goal of goalsToFetch) {
        pendingMetricsRef.current.add(goal.goalId);
      }

      const BATCH_SIZE = 4;
      for (let i = 0; i < goalsToFetch.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;
        const batch = goalsToFetch.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (goal) => {
            const value = await browserApi.readMetrics(goal.goalId, controller.signal);
            return { goalId: goal.goalId, value };
          })
        );

        if (controller.signal.aborted) break;

        const updates: Record<string, MetricsState> = {};
        for (let j = 0; j < results.length; j++) {
          const res = results[j];
          const goal = batch[j];
          if (!goal) continue;
          pendingMetricsRef.current.delete(goal.goalId);
          if (res.status === "fulfilled") {
            loadedMetricsRef.current.add(goal.goalId);
            updates[goal.goalId] = { kind: "ready", value: res.value.value };
          } else {
            updates[goal.goalId] = { kind: "error" };
          }
        }

        setMetricsByGoal((current) => ({ ...current, ...updates }));
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      for (const goal of goalsToFetch) {
        pendingMetricsRef.current.delete(goal.goalId);
      }
    };
  }, [goals]);

  useEffect(() => {
    if (selectedGoalId === null) return;
    const controller = new AbortController();
    const listen = async () => {
      while (!controller.signal.aborted) {
        try {
          for await (const value of browserApi.metrics(selectedGoalId, controller.signal)) {
            if (controller.signal.aborted) return;
            setMetricsByGoal((current) => ({
              ...current,
              [selectedGoalId]: { kind: "ready", value },
            }));
            loadedMetricsRef.current.add(selectedGoalId);
          }
        } catch {
          if (controller.signal.aborted) return;
          setMetricsByGoal((current) => ({
            ...current,
            [selectedGoalId]: { kind: "error" },
          }));
        }
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 800);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timeout);
              resolve();
            },
            { once: true }
          );
        });
      }
    };
    void listen();
    return () => controller.abort();
  }, [selectedGoalId]);

  const changeArchive = useCallback(
    async (goal: BrowserGoalListItem, archived: boolean) => {
      setManageBusyId(goal.goalId);
      setManageError(null);
      try {
        await browserApi.setGoalArchived(goal.goalId, archived);
        setGoals((current) =>
          current.map((item) => (item.goalId === goal.goalId ? { ...item, archived } : item))
        );
        setUndoArchiveId(archived ? goal.goalId : null);
      } catch (error) {
        setManageError(`Archive failed: ${errorMessage(error)}`);
        await refreshGoals();
      } finally {
        setManageBusyId(null);
      }
    },
    [refreshGoals]
  );

  const deleteGoal = useCallback(
    async (goal: BrowserGoalListItem, onDeleted?: () => void) => {
      setManageBusyId(goal.goalId);
      setManageError(null);
      try {
        await browserApi.deleteGoal(goal.goalId);
        setGoals((current) => current.filter((item) => item.goalId !== goal.goalId));
        loadedMetricsRef.current.delete(goal.goalId);
        pendingMetricsRef.current.delete(goal.goalId);
        setMetricsByGoal((current) => {
          if (!(goal.goalId in current)) return current;
          const next = { ...current };
          delete next[goal.goalId];
          return next;
        });
        setUndoArchiveId(null);
        onDeleted?.();
      } catch (error) {
        setManageError(`Deletion failed: ${errorMessage(error)}`);
        await refreshGoals();
      } finally {
        setManageBusyId(null);
      }
    },
    [refreshGoals]
  );

  return {
    goals,
    setGoals,
    metricsByGoal,
    goalsLoading,
    manageBusyId,
    manageError,
    undoArchiveId,
    setUndoArchiveId,
    refreshGoals,
    changeArchive,
    deleteGoal,
  };
}

