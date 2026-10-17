import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserGoalSession } from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import { clearStoredQueue, readAllStoredQueues, readStoredQueue, writeStoredQueue } from "../queue-persistence";
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
  // 初始渲染即从 localStorage 恢复全部 Goal 的队列镜像：
  // 状态是唯一真值，镜像层在下方 effect 中幂等同步，钩子内不包含额外状态机逻辑。
  const [queuedByGoal, setQueuedByGoal] = useState<Record<string, readonly QueuedInput[]>>(() => {
    if (typeof localStorage === "undefined") return {};
    return readAllStoredQueues().items;
  });
  const [queuePausedByGoal, setQueuePausedByGoal] = useState<Record<string, boolean>>(() => {
    if (typeof localStorage === "undefined") return {};
    return readAllStoredQueues().paused;
  });
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

  // 内存状态是唯一真值：每次队列状态变更后把全量镜像幂等写入 localStorage，
  // 空且未暂停的 Goal 在镜像层删除 key，不留孤儿数据。
  useEffect(() => {
    for (const goalId of new Set([...Object.keys(queuedByGoal), ...Object.keys(queuePausedByGoal)])) {
      writeStoredQueue(goalId, {
        items: queuedByGoal[goalId] ?? [],
        paused: queuePausedByGoal[goalId] ?? false,
      });
    }
  }, [queuedByGoal, queuePausedByGoal]);

  const clearQueue = useCallback((goalId: string): void => {
    clearStoredQueue(goalId);
    setQueuedByGoal((current) => {
      if (!(goalId in current)) return current;
      const next = { ...current };
      delete next[goalId];
      return next;
    });
    setQueuePausedByGoal((current) => {
      if (!(goalId in current)) return current;
      const next = { ...current };
      delete next[goalId];
      return next;
    });
  }, []);

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
    clearQueue,
  };
}

