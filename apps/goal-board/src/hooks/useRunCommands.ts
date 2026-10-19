import { useCallback, useState } from "react";
import type {
  BrowserGoalSession,
  BrowserSessionState,
} from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import {
  toSessionInteractionResponse,
  type BrowserGoalInteractionCommand,
  type ModelPickerTarget,
  dispatchBrowserInput,
  errorMessage,
} from "../types";

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
  session: BrowserGoalSession | null;
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
  const [commandError, setCommandError] = useState<string | null>(null);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);

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
      try {
        const accepted = await browserApi.submitInput(session.goalId, {
          kind: "message",
          inputId: crypto.randomUUID(),
          content: trimmed,
        });
        if (!accepted.ok) throw new BrowserApiError(accepted.error, 409, true);
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
    [session, commandBusy, canSendText, onOpenModelPicker, onRefreshSession]
  );

  const submitSteer = useCallback(
    async (content: string): Promise<boolean> => {
      if (!session || session.runStatus !== "running" || !content.trim() || commandBusy) return false;
      setCommandBusy(true);
      setCommandError(null);
      try {
        const accepted = await browserApi.submitInput(session.goalId, {
          kind: "steer",
          inputId: crypto.randomUUID(),
          runId: session.currentRunId,
          content: content.trim(),
        });
        if (!accepted.ok) throw new BrowserApiError(accepted.error, 409, true);
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
    [session, sessionState, commandBusy, onRefreshSession]
  );

  const interruptCurrentRun = useCallback(async (): Promise<void> => {
    if (!session || session.runStatus !== "running" || commandBusy) return;
    setCommandBusy(true);
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
      setCommandBusy(false);
    }
  }, [session, commandBusy, onRefreshSession]);

  const submitInteraction = useCallback(
    async (command: BrowserGoalInteractionCommand) => {
      if (!session || commandBusy) return;
      setCommandBusy(true);
      setCommandError(null);
      try {
        const accepted = await browserApi.submitInput(session.goalId, {
          kind: "respond",
          inputId: crypto.randomUUID(),
          runId: session.currentRunId,
          requestId: "requestId" in command ? command.requestId : command.actionId,
          response: toSessionInteractionResponse(command),
        });
        if (!accepted.ok) throw new BrowserApiError(accepted.error, 409, true);
        await onRefreshSession();
      } catch (error) {
        setCommandError(errorMessage(error));
        if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
      } finally {
        setCommandBusy(false);
      }
    },
    [session, commandBusy, onRefreshSession]
  );

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
    setCommandError,
    stoppingRunId,
    setStoppingRunId,
    submitDraftMessage,
    submitMessage,
    submitSteer,
    interruptCurrentRun,
    submitInteraction,
    submitResume,
  };
}

