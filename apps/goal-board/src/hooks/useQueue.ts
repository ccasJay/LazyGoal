import { useCallback } from "react";
import type { BrowserGoalSessionState } from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import { type QueuedInput, errorMessage } from "../types";

/**
 * 队列、单条删除与继续操作。
 *
 * @remarks
 * 已受理队列、暂停状态与修订全部来自 Runtime 会话投影；本钩子不维护本地任务镜像，
 * 也不由前端 effect 启动后继 Run。删除和继续都绑定当前队列修订，受理只等待持久化。
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
    async (
      command: { readonly action: "continue" } | { readonly action: "remove"; readonly messageId: string },
      goalId: string,
      queueRevision: number,
    ): Promise<boolean> => {
      onCommandError(null);
      try {
        const accepted = await browserApi.submitInput(goalId, {
          kind: "queue_control",
          inputId: crypto.randomUUID(),
          action: command.action,
          queueRevision,
          ...(command.action === "remove" ? { messageId: command.messageId } : {}),
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
    await submitQueueControl({ action: "continue" }, session.goalId, session.queue?.revision ?? 0);
  }, [session, submitQueueControl]);

  const removeQueuedInput = useCallback(async (messageId: string): Promise<void> => {
    if (!session) return;
    await submitQueueControl(
      { action: "remove", messageId },
      session.goalId,
      session.queue?.revision ?? 0,
    );
  }, [session, submitQueueControl]);

  return {
    queuedInputs,
    queuePaused,
    continueQueue,
    removeQueuedInput,
  };
}
