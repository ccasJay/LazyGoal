import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  BrowserControlScope,
  BrowserGoalListItem,
  BrowserModelCatalog,
  BrowserModelOption,
} from "../../../../packages/web-contracts/src/index";
import { GoalBoard } from "../components/GoalBoard";
import { PermissionControl } from "../components/PermissionControl";
import type { GoalSessionContextValue } from "../context/GoalSessionContext";
import type { RunControlContextValue } from "../context/RunControlContext";
import { useGoals } from "./useGoals";
import { useControlIntents } from "./useControlIntents";
import { useGoalSession } from "./useGoalSession";
import { useModelSelection } from "./useModelSelection";
import { usePermissions } from "./usePermissions";
import { usePermissionExemptions } from "./usePermissionExemptions";
import { useRunCommands } from "./useRunCommands";
import { useRunStream } from "./useRunStream";
import { useWorkspaceContext } from "./useWorkspaceContext";
import type { GoalView } from "../control/types";
import type { SessionTab } from "../types";

export function useGoalBoardApp() {
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [goalInfoOpen, setGoalInfoOpen] = useState(false);
  const [trajectoryTarget, setTrajectoryTarget] = useState<{ runId: string; executionUnitId: string; nonce: number } | null>(null);
  const [sessionTab, setSessionTab] = useState<SessionTab>("Activity");
  const [draftText, setDraftText] = useState("");

  const draftGeneration = useRef(0);
  const draftLoadVersion = useRef(0);

  const control = useControlIntents();

  const sessionManager = useGoalSession({
    control,
    onGoalsRefresh: async () => { await goalsManager.refreshGoals(); },
    onClearLiveText: () => { streamManager.setLiveText(""); },
  });
  const follow = sessionManager.activityWindow.following;
  const setFollow = sessionManager.setFollow;

  const goalsManager = useGoals({
    selectedGoalId: sessionManager.selectedGoalId,
    onError: setGoalsError,
    control,
  });

  const permissionsManager = usePermissions({
    session: sessionManager.session,
    control,
    onRefreshSession: sessionManager.refreshSelectedSession,
  });

  const activeGoal = goalsManager.goals.find((goal) => goal.goalId === sessionManager.selectedGoalId);
  const sessionVisible = activeGoal !== undefined || sessionManager.draftSessionOpen;

  const handleDeleteGoal = async (goal: BrowserGoalListItem) => {
    await goalsManager.deleteGoal(goal, () => {
      if (sessionManager.selectedGoalId === goal.goalId) sessionManager.setSelectedGoalId(null);
    });
  };

  const { workspaceContext, workspaceContextError } = useWorkspaceContext({
    enabled: true,
    sessionKey: sessionManager.session,
  });

  const {
    exemptions,
    exemptionsLoading,
    exemptionsError,
    revokeExemption,
    reloadExemptions,
  } = usePermissionExemptions({
    enabled: goalInfoOpen,
    session: sessionManager.session,
    selectedGoalId: sessionManager.selectedGoalId,
    onRefreshSession: sessionManager.refreshSelectedSession,
    control,
  });

  const modelSelectionManager = useModelSelection({
    session: sessionManager.session,
    draftGoalId: sessionManager.draftGoalId,
    draftGeneration,
    draftLoadVersion,
    draftModelId: sessionManager.draftModelId,
    setDraftModelCatalog: sessionManager.setDraftModelCatalog,
    setDraftModelId: sessionManager.setDraftModelId,
    setDraftModelError: sessionManager.setDraftModelError,
    loadDraftDefault: sessionManager.loadDraftDefault,
    onRefreshSession: sessionManager.refreshSelectedSession,
    onSetCommandError: (err) => commandsManager.setCommandError(err),
    control,
  });

  const commandsManager = useRunCommands({
    session: sessionManager.session,
    sessionState: sessionManager.sessionState,
    draftGoalId: sessionManager.draftGoalId,
    draftPlanMode: sessionManager.draftPlanMode,
    draftModelId: sessionManager.draftModelId,
    onOpenModelPicker: modelSelectionManager.setModelPickerTarget,
    onSetDraftPlanMode: sessionManager.setDraftPlanMode,
    onDraftCreated: (goalId) => {
      sessionManager.setDraftSessionOpen(false);
      sessionManager.setSelectedGoalId(goalId);
    },
    onRefreshSession: sessionManager.refreshSelectedSession,
    onRefreshGoals: goalsManager.refreshGoals,
    control,
  });

  /** 按控制事件声明的范围定向读取；不触发完整会话重读。 */
  const readControlScopes = async (view: GoalView, scopes: readonly BrowserControlScope[], signal: AbortSignal): Promise<void> => {
    const isCurrent = () => control.ownsView(view) && !signal.aborted;
    if (!isCurrent()) return;
    await Promise.all(scopes.map(async (scope) => {
      if (scope === "session") {
        await sessionManager.readSessionState(view, signal);
        return;
      }
      if (scope === "activity" && !await sessionManager.refreshActivity(view, signal)) return;
      if (scope === "goals") await goalsManager.refreshGoals();
      // 服务端用 `grants` 作用域声明边界豁免变更，刷新的是豁免列表而不是 Tool 授权。
      if (scope === "grants") await reloadExemptions();
      if (scope === "permission") await permissionsManager.reloadPermissionProfile();
      if (scope === "model") await modelSelectionManager.refreshModelCatalog();
      if (isCurrent()) control.markFresh(view, [scope]);
    }));
  };

  const streamManager = useRunStream({
    control,
    activityPage: sessionManager.activityPage,
    onSessionConfirmed: sessionManager.confirmSession,
    onReadScopes: readControlScopes,
  });

  const currentModelName = modelSelectionManager.currentModelCatalog === null
    ? "Current model unavailable"
    : modelSelectionManager.currentModelCatalog.models.find(
        (m) => m.id === modelSelectionManager.currentModelCatalog?.currentModelId
      )?.displayName ?? modelSelectionManager.currentModelCatalog.currentModelId;

  const draftModelName = sessionManager.draftModelId === null
    ? (sessionManager.draftModelCatalog === null && sessionManager.draftModelError === null ? "Loading model…" : "Choose model")
    : sessionManager.draftModelCatalog?.models.find((m) => m.id === sessionManager.draftModelId)?.displayName ?? sessionManager.draftModelId;

  const canSwitchCurrentModel = sessionManager.session !== null
    && ["waiting", "completed", "failed", "cancelled"].includes(sessionManager.session.runStatus)
    && sessionManager.session.pendingAction === undefined;

  const renderPermissionControl = (hasGoal: boolean): ReactNode => (
    <PermissionControl
      open={permissionsManager.permissionMenuOpen}
      onToggle={() => permissionsManager.setPermissionMenuOpen((v) => !v)}
      onClose={() => permissionsManager.setPermissionMenuOpen(false)}
      profile={permissionsManager.permissionProfile?.profile ?? null}
      profileError={permissionsManager.permissionProfileError}
      profileBusy={permissionsManager.permissionProfileBusy}
      onChoosePreset={(profile) => void permissionsManager.updatePermissionProfile(profile)}
      exemptions={permissionsManager.exemptions}
      exemptionsLoading={permissionsManager.exemptionsLoading}
      exemptionsError={permissionsManager.exemptionsError}
      hasGoal={hasGoal}
      revokingExemptionId={permissionsManager.revokingExemptionId}
      onRevokeExemption={(exemption) => void permissionsManager.revokePermissionExemption(exemption)}
    />
  );

  const goalBoardElement = (
    <GoalBoard
      goals={goalsManager.goals}
      unreadableCount={goalsManager.unreadableCount}
      metricsByGoal={goalsManager.metricsByGoal}
      goalsLoading={goalsManager.goalsLoading}
      selectedGoalId={sessionManager.selectedGoalId}
      onSelectGoal={(id) => {
        modelSelectionManager.setModelPickerTarget(null);
        sessionManager.selectGoal(id);
        setSessionTab("Activity");
      }}
      onOpenNewGoalDraft={() => {
        modelSelectionManager.setModelPickerTarget(null);
        modelSelectionManager.setModelPreferenceRetry(null);
        sessionManager.openNewGoalDraft();
        setSessionTab("Activity");
        commandsManager.setCommandError(null);
      }}
      onChangeArchive={goalsManager.changeArchive}
      onDeleteGoal={handleDeleteGoal}
      manageBusyId={goalsManager.manageBusyId}
      manageError={goalsManager.manageError}
      onClearManageError={() => goalsManager.refreshGoals()}
      undoArchiveId={goalsManager.undoArchiveId}
      onRefreshGoals={goalsManager.refreshGoals}
      sessionError={goalsError}
    />
  );

  const sessionContextValue: GoalSessionContextValue = {
    selectedGoalId: sessionManager.selectedGoalId,
    session: sessionManager.session,
    activityPage: sessionManager.activityWindow.page ?? sessionManager.activityPage,
    activityWindow: sessionManager.activityWindow,
    loadEarlierActivity: sessionManager.loadEarlierActivity,
    loadNewerActivity: sessionManager.loadNewerActivity,
    jumpToLatestActivity: sessionManager.jumpToLatestActivity,
    fullSession: sessionManager.fullSession,
    fullSessionLoading: sessionManager.fullSessionLoading,
    fullSessionError: sessionManager.fullSessionError,
    sessionLoading: sessionManager.sessionLoading,
    sessionError: sessionManager.sessionError,
    activityError: sessionManager.activityError,
    loadingEarlier: sessionManager.loadingEarlier,
    workspaceContext,
    workspaceContextError,
    sessionTab,
    setSessionTab,
    trajectoryTarget,
    setTrajectoryTarget,
    follow,
    setFollow,
    goalInfoOpen,
    setGoalInfoOpen,
    exemptions,
    exemptionsLoading,
    exemptionsError,
    revokingExemptionId: permissionsManager.revokingExemptionId,
    liveText: streamManager.liveText,
    livePreviews: streamManager.livePreviews,
    liveActivity: streamManager.liveActivity,
    progressEntries: streamManager.progressEntries,
    candidatePresentation: streamManager.candidatePresentation,
    liveEvents: streamManager.liveEvents,
    streamConnected: streamManager.streamConnected,
    stateStale: streamManager.stateStale,
    streamSynced: streamManager.streamSynced,
    metricsByGoal: goalsManager.metricsByGoal,
    currentModelCatalog: modelSelectionManager.currentModelCatalog,
    currentModelName,
    canSwitchCurrentModel,
    modelPickerTarget: modelSelectionManager.modelPickerTarget,
    setModelPickerTarget: modelSelectionManager.setModelPickerTarget,
    modelPreferenceRetry: modelSelectionManager.modelPreferenceRetry,
    setModelPreferenceRetry: modelSelectionManager.setModelPreferenceRetry,
    retryModelPreference: modelSelectionManager.retryModelPreference,
    onModelCatalogRefresh: modelSelectionManager.refreshModelCatalog,
    refreshSelectedSession: sessionManager.refreshSelectedSession,
    loadFullSession: sessionManager.loadFullSession,
    selectGoal: sessionManager.selectGoal,
    closeSession: sessionManager.closeSession,
    openNewGoalDraft: sessionManager.openNewGoalDraft,
    draftSessionOpen: sessionManager.draftSessionOpen,
    draftPlanMode: sessionManager.draftPlanMode,
    setDraftPlanMode: sessionManager.setDraftPlanMode,
    draftModelId: sessionManager.draftModelId,
    setDraftModelId: sessionManager.setDraftModelId,
    draftModelCatalog: sessionManager.draftModelCatalog,
    draftModelError: sessionManager.draftModelError,
    draftModelName,
    loadDraftDefault: sessionManager.loadDraftDefault,
  };

  const runControlContextValue: RunControlContextValue = {
    control,
    commandBusy: commandsManager.commandBusy,
    commandError: commandsManager.commandError,
    draftGoalBusy: commandsManager.draftGoalBusy,
    setCommandError: commandsManager.setCommandError,
    stoppingRunId: commandsManager.stoppingRunId,
    onSubmitDraftMessage: commandsManager.submitDraftMessage,
    onInterrupt: commandsManager.interruptCurrentRun,
    onSubmitResume: commandsManager.submitResume,
    onSubmitContinuation: commandsManager.onSubmitContinuation,
    compactSession: commandsManager.compactSession,
    onVerifyIntent: commandsManager.verifyIntent,
    onRetryIntent: commandsManager.retryIntent,
    onDiscardIntent: commandsManager.discardIntent,
  };

  return {
    goals: goalsManager.goals,
    draftText,
    setDraftText,
    workspaceContext,
    selectGoal: (id: string) => {
      modelSelectionManager.setModelPickerTarget(null);
      sessionManager.selectGoal(id);
      setSessionTab("Activity");
      setGoalInfoOpen(false);
    },
    sessionContextValue,
    runControlContextValue,
    sessionVisible,
    activeGoal,
    selectedGoalId: sessionManager.selectedGoalId,
    isCurrentGoalSelected: sessionManager.session?.goalId === sessionManager.selectedGoalId,
    closeSession: sessionManager.closeSession,
    openNewGoalDraft: sessionManager.openNewGoalDraft,
    draftSessionOpen: sessionManager.draftSessionOpen,
    setGoalInfoOpen,
    manageError: goalsManager.manageError,
    manageBusyId: goalsManager.manageBusyId,
    onClearManageError: () => goalsManager.refreshGoals(),
    goalBoardElement,
    renderPermissionControl,
    revokeExemption,
    onDeleteGoal: handleDeleteGoal,
    modelPickerTarget: modelSelectionManager.modelPickerTarget,
    draftModelId: sessionManager.draftModelId,
    setModelPickerTarget: modelSelectionManager.setModelPickerTarget,
    onSelectModel: async (model: BrowserModelOption, catalog: BrowserModelCatalog) => {
      await modelSelectionManager.chooseModel(modelSelectionManager.modelPickerTarget!, model, catalog);
    },
    onDoneModelPicker: () => {
      modelSelectionManager.setModelPickerTarget((curr) => curr === modelSelectionManager.modelPickerTarget ? null : curr);
    },
  };
}
