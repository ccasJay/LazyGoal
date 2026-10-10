import { useCallback, useEffect, useState } from "react";
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

  const refreshGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const result = await browserApi.listGoals();
      setGoals(result);
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
    const controller = new AbortController();
    for (const goal of goals) {
      void browserApi
        .readMetrics(goal.goalId, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted)
            setMetricsByGoal((current) => ({
              ...current,
              [goal.goalId]: { kind: "ready", value },
            }));
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setMetricsByGoal((current) => ({
              ...current,
              [goal.goalId]: { kind: "error" },
            }));
        });
    }
    return () => controller.abort();
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

