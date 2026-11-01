import { useCallback } from "react";
import type { BrowserGoalSessionState } from "../../../../packages/web-contracts/src/index";
import type { ControlIntents } from "./useControlIntents";
import { type QueuedInput } from "../types";

/**
 * 队列、单条删除与继续操作。
 *
 * @remarks
 * 已受理队列、暂停状态与修订全部来自 Runtime 会话投影；本钩子不维护本地任务镜像，
 * 也不由前端 effect 启动后继 Run。删除和继续都以原 `inputId` 作为控制意图身份，
 * 结果不明时复用统一核验，不生成第二个身份。
 */
export function useQueue({
  session,
  control,
  onRefreshSession,
  onCommandError,
}: {
  session: BrowserGoalSessionState | null;
  control: ControlIntents;
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
      const inputId = crypto.randomUUID();
      const receipt = await control.submit({
        kind: "session_input",
        intentId: inputId,
        goalId,
        input: {
          kind: "queue_control",
          inputId,
          action: command.action,
          queueRevision,
          ...(command.action === "remove" ? { messageId: command.messageId } : {}),
        },
      });
      if (receipt.status === "rejected") {
        onCommandError(receipt.error === "QUEUE_REVISION_MISMATCH"
          ? "The queue changed before this action was applied. Reload and try again."
          : "The queue action could not be applied.");
        await onRefreshSession();
        return false;
      }
      if (receipt.status === "unknown") {
        onCommandError("The queue action result is unknown. Verify it before trying again.");
        return false;
      }
      await onRefreshSession();
      return true;
    },
    [control.submit, onRefreshSession, onCommandError]
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
