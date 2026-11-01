import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserGoalListItem } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { type MetricsState, errorMessage } from "../types";
import { pendingIntentOfKind } from "../control/reducer";
import type { ControlIntents } from "./useControlIntents";

export function useGoals({
  selectedGoalId,
  onError,
  control,
}: {
  selectedGoalId: string | null;
  onError?: (message: string | null) => void;
  control: ControlIntents;
}) {
  const goalList = control.state.resources.goals;
  const goals = goalList?.goals ?? [];
  const unreadableCount = goalList?.unreadableCount ?? 0;
  const [metricsByGoal, setMetricsByGoal] = useState<Record<string, MetricsState>>({});
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [manageError, setManageError] = useState<string | null>(null);
  const [undoArchiveId, setUndoArchiveId] = useState<string | null>(null);
  const manageBusyId = pendingIntentOfKind(control.state, "goal_archive")?.goalId
    ?? pendingIntentOfKind(control.state, "goal_delete")?.goalId
    ?? null;

  const loadedMetricsRef = useRef<Set<string>>(new Set());
  const pendingMetricsRef = useRef<Set<string>>(new Set());

  const refreshGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const result = await browserApi.listGoals();
      control.mergeResources({ goals: result });
      loadedMetricsRef.current.clear();
      onError?.(null);
    } catch (error) {
      onError?.(errorMessage(error));
    } finally {
      setGoalsLoading(false);
    }
  }, [onError, control.mergeResources]);

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
        control.mergeResources({ goals: result });
        onError?.(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) onError?.(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setGoalsLoading(false);
      });
    return () => controller.abort();
  }, [onError, control.mergeResources]);

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

  const applyArchived = useCallback((goalId: string, archived: boolean) => {
    const current = control.state.resources.goals;
    if (current === undefined) return;
    control.mergeResources({
      goals: {
        ...current,
        goals: current.goals.map((item) => (item.goalId === goalId ? { ...item, archived } : item)),
      },
    });
  }, [control.mergeResources, control.state.resources.goals]);

  const applyDeleted = useCallback((goalId: string) => {
    const current = control.state.resources.goals;
    if (current !== undefined) {
      control.mergeResources({
        goals: { ...current, goals: current.goals.filter((item) => item.goalId !== goalId) },
      });
    }
    loadedMetricsRef.current.delete(goalId);
    pendingMetricsRef.current.delete(goalId);
    setMetricsByGoal((current) => {
      if (!(goalId in current)) return current;
      const next = { ...current };
      delete next[goalId];
      return next;
    });
  }, [control.mergeResources, control.state.resources.goals]);

  const changeArchive = useCallback(
    async (goal: BrowserGoalListItem, archived: boolean) => {
      setManageError(null);
      const receipt = await control.submit({
        kind: "goal_archive",
        intentId: crypto.randomUUID(),
        goalId: goal.goalId,
        archived,
      });
      if (receipt.status === "accepted" || receipt.status === "existing") {
        applyArchived(goal.goalId, archived);
        setUndoArchiveId(archived ? goal.goalId : null);
        return;
      }
      if (receipt.status === "unknown") {
        const verification = await control.verify(receipt.intentId);
        if (verification === "applied") {
          applyArchived(goal.goalId, archived);
          setUndoArchiveId(archived ? goal.goalId : null);
          return;
        }
        setManageError("The archive result could not be confirmed. Reload before trying again.");
        await refreshGoals();
        return;
      }
      setManageError("Archive failed: the Goal is not in a terminal state or has pending inputs.");
      await refreshGoals();
    },
    [refreshGoals, applyArchived, control.submit, control.verify]
  );

  const deleteGoal = useCallback(
    async (goal: BrowserGoalListItem, onDeleted?: () => void) => {
      setManageError(null);
      const receipt = await control.submit({
        kind: "goal_delete",
        intentId: crypto.randomUUID(),
        goalId: goal.goalId,
      });
      if (receipt.status === "unknown") {
        const verification = await control.verify(receipt.intentId);
        if (verification !== "applied") {
          setManageError(verification === "not_applied"
            ? "Deletion did not apply. You can try again."
            : "The deletion result could not be confirmed. Reload before trying again.");
          await refreshGoals();
          return;
        }
      } else if (receipt.status === "rejected") {
        setManageError("Deletion failed: the Goal is not in a terminal state or has pending inputs.");
        await refreshGoals();
        return;
      }
      applyDeleted(goal.goalId);
      setUndoArchiveId(null);
      onDeleted?.();
    },
    [refreshGoals, applyDeleted, control.submit, control.verify]
  );

  return {
    goals,
    unreadableCount,
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

