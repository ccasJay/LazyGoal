import { useCallback } from "react";
import type { BrowserGoalSessionState } from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import { type QueuedInput, errorMessage } from "../types";

/**
 * 队列与继续／清空操作。
 *
 * @remarks
 * 已受理队列、暂停状态与修订全部来自 Runtime 会话投影；本钩子不维护本地任务镜像，
 * 也不由前端 effect 启动后继 Run。受理只等待持久化，草稿在拒绝时保留。
 */
export function useQueue({
  session,
  onRefreshSession,
  onCommandError,
}: {
  session: BrowserGoalSessionState | null;
  onRefreshSession: () => Promise<void>;
  onCommandError: (message: string | null) => void;
}) {
  const queuedInputs: readonly QueuedInput[] = (session?.pendingMessages ?? [])
    .map((message) => ({ messageId: message.inputId, content: message.content }));
  const queuePaused = session?.queue?.paused ?? false;

  const submitQueueControl = useCallback(
    async (action: "continue" | "clear", goalId: string, queueRevision: number): Promise<boolean> => {
      onCommandError(null);
      try {
        const accepted = await browserApi.submitInput(goalId, {
          kind: "queue_control",
          inputId: crypto.randomUUID(),
          action,
          queueRevision,
        });
        if (!accepted.ok) throw new BrowserApiError(accepted.error, 409, true);
        await onRefreshSession();
        return true;
      } catch (error) {
        onCommandError(errorMessage(error));
        if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
        return false;
      }
    },
    [onRefreshSession, onCommandError]
  );

  const continueQueue = useCallback(async (): Promise<void> => {
    if (!session) return;
    await submitQueueControl("continue", session.goalId, session.queue?.revision ?? 0);
  }, [session, submitQueueControl]);

  const clearQueue = useCallback(async (): Promise<void> => {
    if (!session) return;
    await submitQueueControl("clear", session.goalId, session.queue?.revision ?? 0);
  }, [session, submitQueueControl]);

  return {
    queuedInputs,
    queuePaused,
    continueQueue,
    clearQueue,
  };
}
