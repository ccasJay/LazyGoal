import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserGoalSession } from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import { type QueuedInput, errorMessage } from "../types";

export function useQueue({
  session,
  selectedGoalId,
  onRefreshSession,
  onCommandError,
}: {
  session: BrowserGoalSession | null;
  selectedGoalId: string | null;
  onRefreshSession: () => Promise<void>;
  onCommandError: (message: string | null) => void;
}) {
  const [queuedByGoal, setQueuedByGoal] = useState<Record<string, readonly QueuedInput[]>>({});
  const [queuePausedByGoal, setQueuePausedByGoal] = useState<Record<string, boolean>>({});
  const queueSendInFlight = useRef(new Set<string>());

  const queueInput = useCallback((goalId: string, content: string): boolean => {
    if (!content.trim()) return false;
    const item = { messageId: crypto.randomUUID(), content: content.trim() };
    setQueuedByGoal((current) => ({
      ...current,
      [goalId]: [...(current[goalId] ?? []), item],
    }));
    return true;
  }, []);

  const startQueuedInput = useCallback(
    async (goalId: string, runId: string, item: QueuedInput): Promise<boolean> => {
      const reservation = `${goalId}:${item.messageId}`;
      if (queueSendInFlight.current.has(reservation)) return false;
      queueSendInFlight.current.add(reservation);
      try {
        await browserApi.sendMessage(goalId, { runId, messageId: item.messageId, content: item.content });
        setQueuedByGoal((current) => {
          const items = current[goalId] ?? [];
          return {
            ...current,
            [goalId]:
              items[0]?.messageId === item.messageId
                ? items.slice(1)
                : items.filter((entry) => entry.messageId !== item.messageId),
          };
        });
        setQueuePausedByGoal((current) => ({ ...current, [goalId]: false }));
        if (selectedGoalId === goalId) await onRefreshSession();
        return true;
      } catch (error) {
        setQueuePausedByGoal((current) => ({ ...current, [goalId]: true }));
        if (selectedGoalId === goalId) {
          onCommandError(errorMessage(error));
          if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
        }
        return false;
      } finally {
        queueSendInFlight.current.delete(reservation);
      }
    },
    [selectedGoalId, onRefreshSession, onCommandError]
  );

  const continueQueue = useCallback(async (): Promise<void> => {
    if (!session) return;
    const first = queuedByGoal[session.goalId]?.[0];
    if (!first || !["failed", "cancelled", "completed"].includes(session.runStatus)) return;
    setQueuePausedByGoal((current) => ({ ...current, [session.goalId]: false }));
    await startQueuedInput(session.goalId, session.currentRunId, first);
  }, [session, queuedByGoal, startQueuedInput]);

  useEffect(() => {
    if (!session) return;
    const items = queuedByGoal[session.goalId] ?? [];
    if (items.length === 0) return;
    if (session.runStatus === "failed" || session.runStatus === "cancelled") {
      setQueuePausedByGoal((current) => ({ ...current, [session.goalId]: true }));
      return;
    }
    if (session.runStatus !== "completed" || queuePausedByGoal[session.goalId]) return;
    void startQueuedInput(session.goalId, session.currentRunId, items[0]!);
  }, [
    session?.goalId,
    session?.currentRunId,
    session?.runStatus,
    queuedByGoal,
    queuePausedByGoal,
    startQueuedInput,
  ]);

  return {
    queuedByGoal,
    queuePausedByGoal,
    queueInput,
    startQueuedInput,
    continueQueue,
  };
}

