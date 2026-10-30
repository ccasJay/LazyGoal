import { useCallback, useRef, useState } from "react";
import type {
  BrowserGoalSessionState,
  BrowserSessionState,
} from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import {
  type ModelPickerTarget,
  dispatchBrowserInput,
  errorMessage,
} from "../types";
import {
  classifySubmissionAttempt,
  reduceUnverifiedSubmissions,
  type FrozenSubmission,
} from "../session-controls";

/**
 * 受理结果不明的一条会话输入。
 *
 * @remarks
 * 保留原 `inputId` 与冻结载荷，使页面可以核验收据或以同一身份重试；不换用新身份
 * 重复发送，也不把未确认项显示为已受理。
 *
 * @example
 * ```ts
 * const pending: UnverifiedSubmission = {
 *   inputId: "input-1", goalId: "goal-1", runId: "run-1",
 *   kind: "message", content: "Continue the review",
 * };
 * ```
 */
export type UnverifiedSubmission = FrozenSubmission;

export function useRunCommands({
  session,
  sessionState,
  canSendText,
  draftGoalId,
  draftPlanMode,
  draftModelId,
  onOpenModelPicker,
  onSetDraftPlanMode,
  onDraftCreated,
  onRefreshSession,
  onRefreshGoals,
}: {
  session: BrowserGoalSessionState | null;
  sessionState?: BrowserSessionState | null;
  canSendText: boolean;
  draftGoalId: React.MutableRefObject<string | null>;
  draftPlanMode: boolean;
  draftModelId: string | null;
  onOpenModelPicker: (target: ModelPickerTarget) => void;
  onSetDraftPlanMode: (mode: boolean) => void;
  onDraftCreated: (goalId: string) => void;
  onRefreshSession: () => Promise<void>;
  onRefreshGoals: () => Promise<void>;
}) {
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandErrorState] = useState<string | null>(null);
  const [draftGoalBusy, setDraftGoalBusy] = useState(false);
  const setCommandError = useCallback((error: string | null) => {
    setCommandErrorState(error);
    setDraftGoalBusy(false);
  }, []);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const [unverifiedSubmissions, setUnverifiedSubmissions] = useState<readonly UnverifiedSubmission[]>([]);
  const interruptInFlight = useRef(false);

  const submitDraftMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const dispatched = await dispatchBrowserInput(content);
      if (dispatched.kind === "error") {
        setCommandError(dispatched.message);
        return false;
      }
      if (dispatched.kind === "plan") {
        onSetDraftPlanMode(true);
        setCommandError(null);
        return true;
      }
      if (dispatched.kind === "model") {
        onOpenModelPicker({ kind: "draft" });
        setCommandError(null);
        return true;
      }
      const intent = dispatched.content.trim();
      if (!intent || commandBusy) return false;
      if (draftModelId === null) {
        setCommandError("Choose an available model before creating this Goal.");
        return false;
      }
      setCommandBusy(true);
      setCommandError(null);
      try {
        const goalId = draftGoalId.current ?? crypto.randomUUID();
        draftGoalId.current = goalId;
        const inputId = crypto.randomUUID();
        const result = await browserApi.createGoal({
          goalId,
          inputId,
          intent,
          ...(draftPlanMode ? { mode: "plan" as const } : {}),
          modelId: draftModelId,
        });
        if (!result.ok) throw new BrowserApiError(result.error, 409, false);
        onDraftCreated(result.goalId);
        await onRefreshGoals();
        return true;
      } catch (error) {
        setCommandError(errorMessage(error));
        if (error instanceof BrowserApiError && error.code === "goal_busy") {
          setDraftGoalBusy(true);
          void onRefreshGoals();
        }
        if (
          error instanceof BrowserApiError &&
          ["model_not_selectable", "model_catalog_unavailable", "goal_busy"].includes(error.code)
        ) {
          draftGoalId.current = null;
        }
        return false;
      } finally {
        setCommandBusy(false);
      }
    },
    [
      commandBusy,
      draftModelId,
      draftPlanMode,
      draftGoalId,
      onSetDraftPlanMode,
      onOpenModelPicker,
      onDraftCreated,
      onRefreshGoals,
    ]
  );

  const submitMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const dispatched = await dispatchBrowserInput(content);
      if (dispatched.kind === "error") {
        setCommandError(dispatched.message);
        return false;
      }
      if (dispatched.kind === "model") {
        if (
          !session ||
          commandBusy ||
          !["waiting", "completed", "failed"].includes(session.runStatus) ||
          session.pendingAction !== undefined
        )
          return false;
        onOpenModelPicker({ kind: "goal", goalId: session.goalId, runId: session.currentRunId });
        setCommandError(null);
        return true;
      }
      if (dispatched.kind === "plan") {
        if (!session || commandBusy) return false;
        setCommandBusy(true);
        setCommandError(null);
        try {
          await browserApi.enterPlanMode(session.goalId, { runId: session.currentRunId });
          await onRefreshSession();
          return true;
        } catch (error) {
          setCommandError(errorMessage(error));
          if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
          return false;
        } finally {
          setCommandBusy(false);
        }
      }
      const trimmed = dispatched.content.trim();
      if (!session || !trimmed || !canSendText || commandBusy) return false;
      setCommandBusy(true);
      setCommandError(null);
      const submission: FrozenSubmission = {
        inputId: crypto.randomUUID(),
        goalId: session.goalId,
        runId: session.currentRunId,
        kind: "message",
        content: trimmed,
      };
      try {
        const accepted = await browserApi.submitInput(submission.goalId, {
          kind: "message",
          inputId: submission.inputId,
          content: submission.content,
        });
        const outcome = classifySubmissionAttempt(accepted);
        if (outcome.kind === "rejected") {
          setCommandError(outcome.code);
          await onRefreshSession();
          return false;
        }
        await onRefreshSession();
        return true;
      } catch (error) {
        // 明确拒绝保留可编辑草稿；结果不明则保留原身份等待核验。
        const outcome = classifySubmissionAttempt(undefined, error);
        if (outcome.kind === "rejected") {
          setCommandError(outcome.code);
          await onRefreshSession();
          return false;
        }
        setUnverifiedSubmissions((current) => reduceUnverifiedSubmissions(current, { kind: "record", submission }));
        setCommandError("The message result is unknown. Verify it before sending it again.");
        return false;
      } finally {
        setCommandBusy(false);
      }
    },
    [session, commandBusy, canSendText, onOpenModelPicker, onRefreshSession]
  );

  const submitSteer = useCallback(
    async (
      content: string,
      queueBinding?: { readonly messageId: string; readonly queueRevision: number },
    ): Promise<boolean> => {
      if (!session || session.runStatus !== "running" || !content.trim() || commandBusy) return false;
      setCommandBusy(true);
      setCommandError(null);
      const submission: FrozenSubmission = {
        inputId: crypto.randomUUID(),
        goalId: session.goalId,
        runId: session.currentRunId,
        kind: "steer",
        content: content.trim(),
        ...(queueBinding === undefined ? {} : { queueBinding }),
      };
      try {
        const accepted = await browserApi.submitInput(submission.goalId, {
          kind: "steer",
          inputId: submission.inputId,
          runId: submission.runId,
          content: submission.content,
          ...(submission.queueBinding === undefined ? {} : { queueBinding: submission.queueBinding }),
        });
        const outcome = classifySubmissionAttempt(accepted);
        if (outcome.kind === "rejected") {
          setCommandError(outcome.code);
          await onRefreshSession();
          return false;
        }
        await onRefreshSession();
        return true;
      } catch (error) {
        // 明确拒绝保留草稿且不降级为普通排队；结果不明保留原身份等待核验。
        const outcome = classifySubmissionAttempt(undefined, error);
        if (outcome.kind === "rejected") {
          setCommandError(outcome.code);
          await onRefreshSession();
          return false;
        }
        setUnverifiedSubmissions((current) => reduceUnverifiedSubmissions(current, { kind: "record", submission }));
        setCommandError("The Steer result is unknown. Verify it before sending it again.");
        return false;
      } finally {
        setCommandBusy(false);
      }
    },
    [session, sessionState, commandBusy, onRefreshSession]
  );

  /**
   * 按原身份核验一条结果不明的输入。
   *
   * @remarks
   * 只读取持久化收据：已受理则清除不确定状态，未找到则保留原身份允许重试；读取失败
   * 不改写为“未受理”，也不触发新的提交。
   */
  const verifySubmission = useCallback(
    async (inputId: string): Promise<void> => {
      const target = unverifiedSubmissions.find((item) => item.inputId === inputId);
      if (target === undefined) return;
      try {
        const receipt = await browserApi.readInputReceipt(target.goalId, inputId);
        if (receipt.ok && receipt.found) {
          setUnverifiedSubmissions((current) => reduceUnverifiedSubmissions(current, { kind: "settled", inputId }));
          setCommandError(null);
          await onRefreshSession();
          return;
        }
        if (receipt.ok) {
          setCommandError("The Runtime has no receipt for this input. Retry with the same identity or edit it.");
          return;
        }
        setCommandError("Could not read the input receipt. Try the verification again.");
      } catch (error) {
        setCommandError(errorMessage(error));
      }
    },
    [unverifiedSubmissions, onRefreshSession]
  );

  /**
   * 以原身份与冻结载荷重试一条结果不明的输入。
   *
   * @remarks
   * 重试不生成新的 `inputId`；服务端对同一身份返回既有收据，因此不会重复受理。
   */
  const retrySubmission = useCallback(
    async (inputId: string): Promise<boolean> => {
      const target = unverifiedSubmissions.find((item) => item.inputId === inputId);
      if (target === undefined) return false;
      setCommandBusy(true);
      try {
        const accepted = target.kind === "steer"
          ? await browserApi.submitInput(target.goalId, {
            kind: "steer",
            inputId: target.inputId,
            runId: target.runId,
            content: target.content,
            ...(target.queueBinding === undefined ? {} : { queueBinding: target.queueBinding }),
          })
          : await browserApi.submitInput(target.goalId, {
            kind: "message",
            inputId: target.inputId,
            content: target.content,
          });
        if (!accepted.ok) throw new BrowserApiError(accepted.error, 409, true);
        setUnverifiedSubmissions((current) => reduceUnverifiedSubmissions(current, { kind: "settled", inputId: target.inputId }));
        setCommandError(null);
        await onRefreshSession();
        return true;
      } catch (error) {
        setCommandError(errorMessage(error));
        if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
        return false;
      } finally {
        setCommandBusy(false);
      }
    },
    [unverifiedSubmissions, onRefreshSession]
  );

  /** 放弃一条结果不明的输入；其原身份不再重发。 */
  const discardSubmission = useCallback((inputId: string): void => {
    setUnverifiedSubmissions((current) => reduceUnverifiedSubmissions(current, { kind: "settled", inputId }));
  }, []);

  const interruptCurrentRun = useCallback(async (): Promise<void> => {
    // 停止使用独立输入身份与在途标记：等待中的回答提交不能锁住停止入口。
    if (!session || !["running", "waiting"].includes(session.runStatus) || interruptInFlight.current) return;
    interruptInFlight.current = true;
    setStoppingRunId(session.currentRunId);
    setCommandError(null);
    try {
      const accepted = await browserApi.submitInput(session.goalId, {
        kind: "interrupt",
        inputId: crypto.randomUUID(),
        runId: session.currentRunId,
      });
      if (!accepted.ok) throw new BrowserApiError(accepted.error, 409, true);
      await onRefreshSession();
    } catch (error) {
      setStoppingRunId(null);
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
    } finally {
      interruptInFlight.current = false;
    }
  }, [session, onRefreshSession]);

  const submitResume = useCallback(async () => {
    if (!session || commandBusy) return;
    setCommandBusy(true);
    setCommandError(null);
    try {
      const commitRevision = sessionState?.commitRevision ?? 0;
      const accepted = await browserApi.submitInput(session.goalId, {
        kind: "resume",
        inputId: crypto.randomUUID(),
        runId: session.currentRunId,
        commitRevision,
      });
      if (!accepted.ok) throw new BrowserApiError(accepted.error, 409, true);
      await onRefreshSession();
    } catch (error) {
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
    } finally {
      setCommandBusy(false);
    }
  }, [session, commandBusy, onRefreshSession]);

  return {
    commandBusy,
    commandError,
    draftGoalBusy,
    setCommandError,
    stoppingRunId,
    setStoppingRunId,
    submitDraftMessage,
    submitMessage,
    submitSteer,
    interruptCurrentRun,
    submitResume,
    unverifiedSubmissions,
    verifySubmission,
    retrySubmission,
    discardSubmission,
  };
}

