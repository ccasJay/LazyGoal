import { useCallback, useState } from "react";
import type {
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserGoalSessionState,
  BrowserSessionState,
  BrowserSessionInputCommand,
} from "../../../../packages/web-contracts/src/index";
import {
  type ModelPickerTarget,
  dispatchBrowserInput,
} from "../types";
import type { ControlIntents } from "./useControlIntents";
import { pendingIntentOfKind } from "../control/reducer";
import type { FrozenSubmission } from "../session-controls";

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
  sessionState: _sessionState,
  canSendText,
  draftGoalId,
  draftPlanMode,
  draftModelId,
  onOpenModelPicker,
  onSetDraftPlanMode,
  onDraftCreated,
  onRefreshSession,
  onRefreshGoals,
  control,
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
  control: ControlIntents;
}) {
  const [commandError, setCommandErrorState] = useState<string | null>(null);
  const [draftGoalBusy, setDraftGoalBusy] = useState(false);
  const setCommandError = useCallback((error: string | null) => {
    setCommandErrorState(error);
    setDraftGoalBusy(false);
  }, []);
  const commandBusy = control.state.intents.some((entry) => entry.phase === "pending"
    && (entry.intent.kind === "create_session" || entry.intent.kind === "session_input" || entry.intent.kind === "plan_mode"));
  const pendingSessionInput = pendingIntentOfKind(control.state, "session_input");
  const stoppingRunId = pendingSessionInput?.input.kind === "interrupt" ? pendingSessionInput.input.runId : null;

  const unverifiedSubmissions: readonly UnverifiedSubmission[] = control.state.intents
    .flatMap((entry) => {
      if (entry.intent.kind !== "session_input" || entry.phase !== "unknown") return [];
      const submission = toFrozenSubmission(entry.intent, session?.currentRunId ?? "");
      return submission === undefined ? [] : [submission];
    });

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
      setCommandError(null);
      const goalId = draftGoalId.current ?? crypto.randomUUID();
      draftGoalId.current = goalId;
      const inputId = crypto.randomUUID();
      const receipt = await control.submit({
        kind: "create_session",
        intentId: inputId,
        goalId,
        inputId,
        intent,
        ...(draftPlanMode ? { mode: "plan" as const } : {}),
        modelId: draftModelId,
      });
      if (receipt.status === "accepted" || receipt.status === "existing") {
        onDraftCreated(goalId);
        await onRefreshGoals();
        return true;
      }
      if (receipt.status === "rejected") {
        setCommandError(receipt.error === "goal_busy"
          ? "This Goal is still busy. Wait for the current run to finish or reload."
          : "The Goal could not be created.");
        if (receipt.error === "goal_busy") {
          setDraftGoalBusy(true);
          void onRefreshGoals();
        }
        if (["model_not_selectable", "model_catalog_unavailable", "goal_busy"].includes(receipt.error)) {
          draftGoalId.current = null;
        }
        return false;
      }
      const verification = await control.verify(receipt.intentId);
      if (verification === "applied") {
        onDraftCreated(goalId);
        await onRefreshGoals();
        return true;
      }
      setCommandError("The Goal creation result is unknown. Verify it before creating it again.");
      return false;
    },
    [
      commandBusy,
      draftModelId,
      draftPlanMode,
      draftGoalId,
      control.submit,
      control.verify,
      onSetDraftPlanMode,
      onOpenModelPicker,
      onDraftCreated,
      onRefreshGoals,
      setCommandError,
    ]
  );

  const submitInput = useCallback(
    async (goalId: string, input: BrowserSessionInputCommand): Promise<BrowserControlReceipt> => {
      return control.submit({ kind: "session_input", intentId: input.inputId, goalId, input });
    },
    [control.submit]
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
        setCommandError(null);
        const receipt = await control.submit({
          kind: "plan_mode",
          intentId: crypto.randomUUID(),
          goalId: session.goalId,
          runId: session.currentRunId,
        });
        if (receipt.status === "accepted" || receipt.status === "existing") {
          await onRefreshSession();
          return true;
        }
        if (receipt.status === "rejected") {
          setCommandError("Plan Mode can only be selected before the Run starts or after it ends.");
          if (receipt.refresh === true) await onRefreshSession();
          return false;
        }
        setCommandError("The Plan Mode result is unknown. Reload before trying again.");
        return false;
      }
      const trimmed = dispatched.content.trim();
      if (!session || !trimmed || !canSendText || commandBusy) return false;
      setCommandError(null);
      const receipt = await submitInput(session.goalId, {
        kind: "message",
        inputId: crypto.randomUUID(),
        content: trimmed,
      });
      if (receipt.status === "rejected") {
        setCommandError(receipt.error);
        await onRefreshSession();
        return false;
      }
      if (receipt.status === "unknown") {
        setCommandError("The message result is unknown. Verify it before sending it again.");
        return false;
      }
      await onRefreshSession();
      return true;
    },
    [session, commandBusy, canSendText, control.submit, submitInput, onOpenModelPicker, onRefreshSession, setCommandError]
  );

  const submitSteer = useCallback(
    async (
      content: string,
      queueBinding?: { readonly messageId: string; readonly queueRevision: number },
    ): Promise<boolean> => {
      if (!session || session.runStatus !== "running" || !content.trim() || commandBusy) return false;
      setCommandError(null);
      const receipt = await submitInput(session.goalId, {
        kind: "steer",
        inputId: crypto.randomUUID(),
        runId: session.currentRunId,
        content: content.trim(),
        ...(queueBinding === undefined ? {} : { queueBinding }),
      });
      if (receipt.status === "rejected") {
        setCommandError(receipt.error);
        await onRefreshSession();
        return false;
      }
      if (receipt.status === "unknown") {
        setCommandError("The Steer result is unknown. Verify it before sending it again.");
        return false;
      }
      await onRefreshSession();
      return true;
    },
    [session, commandBusy, submitInput, onRefreshSession, setCommandError]
  );

  /**
   * 按原身份核验一条结果不明的输入。
   *
   * @remarks
   * 统一核验只读取既有资源身份：已应用则清除不确定状态，未应用则保留原身份允许重试；
   * 读取失败不改写为“未受理”，也不触发新的提交。
   */
  const verifySubmission = useCallback(
    async (inputId: string): Promise<void> => {
      const verification = await control.verify(inputId);
      if (verification === "applied") {
        setCommandError(null);
        await onRefreshSession();
        return;
      }
      if (verification === "not_applied") {
        setCommandError("The Runtime has no receipt for this input. Retry with the same identity or edit it.");
        return;
      }
      setCommandError("Could not read the input receipt. Try the verification again.");
    },
    [control.verify, onRefreshSession, setCommandError]
  );

  /**
   * 以原身份与冻结载荷重试一条结果不明的输入。
   *
   * @remarks
   * 重试复用同一意图对象，不生成新的 `inputId`；服务端对同一身份返回既有收据，
   * 因此不会重复受理。
   */
  const retrySubmission = useCallback(
    async (inputId: string): Promise<boolean> => {
      const entry = control.state.intents.find((candidate) => candidate.intent.intentId === inputId);
      if (entry === undefined || entry.intent.kind !== "session_input") return false;
      const receipt = await control.submit(entry.intent);
      if (receipt.status === "rejected") {
        setCommandError(receipt.error);
        if (receipt.refresh === true) await onRefreshSession();
        return false;
      }
      if (receipt.status === "unknown") {
        setCommandError("The message result is still unknown. Verify it again before retrying.");
        return false;
      }
      setCommandError(null);
      await onRefreshSession();
      return true;
    },
    [control.state.intents, control.submit, onRefreshSession, setCommandError]
  );

  /** 放弃一条结果不明的输入；其原身份不再重发。 */
  const discardSubmission = useCallback((inputId: string): void => {
    control.discard(inputId);
  }, [control.discard]);

  const interruptCurrentRun = useCallback(async (): Promise<void> => {
    if (!session || !["running", "waiting"].includes(session.runStatus) || stoppingRunId !== null) return;
    setCommandError(null);
    const receipt = await submitInput(session.goalId, {
      kind: "interrupt",
      inputId: crypto.randomUUID(),
      runId: session.currentRunId,
    });
    if (receipt.status === "rejected") {
      setCommandError(receipt.error);
      if (receipt.refresh === true) await onRefreshSession();
      return;
    }
    if (receipt.status === "unknown") {
      setCommandError("The stop result is unknown. Reload before trying again.");
      return;
    }
    await onRefreshSession();
  }, [session, stoppingRunId, submitInput, onRefreshSession, setCommandError]);

  const submitResume = useCallback(async () => {
    if (!session || commandBusy) return;
    setCommandError(null);
    const receipt = await submitInput(session.goalId, {
      kind: "resume",
      inputId: crypto.randomUUID(),
      runId: session.currentRunId,
      commitRevision: session.execution?.committedThroughSequence ?? 0,
    });
    if (receipt.status === "rejected") {
      setCommandError(receipt.error);
      if (receipt.refresh === true) await onRefreshSession();
      return;
    }
    if (receipt.status === "unknown") {
      setCommandError("The resume result is unknown. Reload before trying again.");
      return;
    }
    await onRefreshSession();
  }, [session, commandBusy, submitInput, onRefreshSession, setCommandError]);

  return {
    commandBusy,
    commandError,
    draftGoalBusy,
    setCommandError,
    stoppingRunId,
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

function toFrozenSubmission(
  intent: Extract<BrowserControlIntentCommand, { readonly kind: "session_input" }>,
  runId: string,
): FrozenSubmission | undefined {
  const input = intent.input;
  if (input.kind !== "message" && input.kind !== "steer") return undefined;
  return {
    inputId: input.inputId,
    goalId: intent.goalId,
    runId: input.kind === "steer" ? input.runId : runId,
    kind: input.kind,
    content: input.content,
    ...(input.kind === "steer" && input.queueBinding !== undefined ? { queueBinding: input.queueBinding } : {}),
  };
}
