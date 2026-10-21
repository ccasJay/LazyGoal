import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  BrowserGoalListItem,
  BrowserModelCatalog,
  BrowserModelOption,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import { GoalBoard } from "../components/GoalBoard";
import { PermissionControl } from "../components/PermissionControl";
import type { GoalSessionContextValue } from "../context/GoalSessionContext";
import type { RunControlContextValue } from "../context/RunControlContext";
import { useGoals } from "./useGoals";
import { useGoalSession } from "./useGoalSession";
import { useModelSelection } from "./useModelSelection";
import { usePermissions } from "./usePermissions";
import { useQueue } from "./useQueue";
import { useRunCommands } from "./useRunCommands";
import { useRunStream } from "./useRunStream";
import { useToolGrants } from "./useToolGrants";
import { useWorkspaceContext } from "./useWorkspaceContext";
import type { SessionTab } from "../types";

export function useGoalBoardApp() {
  const [goalInfoOpen, setGoalInfoOpen] = useState(false);
  const [trajectoryTarget, setTrajectoryTarget] = useState<{ runId: string; executionUnitId: string; nonce: number } | null>(null);
  const [sessionTab, setSessionTab] = useState<SessionTab>("Activity");
  const [follow, setFollow] = useState(true);
  const [showTools, setShowTools] = useState(true);

  const draftGeneration = useRef(0);
  const draftLoadVersion = useRef(0);

  const sessionManager = useGoalSession({
    onGoalsRefresh: async () => { await goalsManager.refreshGoals(); },
    onClearLiveText: () => { streamManager.setLiveText(""); },
  });

  const goalsManager = useGoals({
    selectedGoalId: sessionManager.selectedGoalId,
    onError: sessionManager.setSessionError,
  });

  const streamManager = useRunStream({
    selectedGoalId: sessionManager.selectedGoalId,
    session: sessionManager.session,
    activityPage: sessionManager.activityPage,
    sessionLoading: sessionManager.sessionLoading,
    onRefresh: sessionManager.refreshSelectedSession,
  });

  const permissionsManager = usePermissions({
    session: sessionManager.session,
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
    toolGrants,
    setToolGrants,
    toolGrantsLoading,
    toolGrantsError,
    revokeToolGrant,
  } = useToolGrants({
    enabled: goalInfoOpen,
    session: sessionManager.session,
    selectedGoalId: sessionManager.selectedGoalId,
    onRefreshSession: sessionManager.refreshSelectedSession,
  });

  // 运行中的文本发送进入持久化队列；等待交互时普通消息同样只排队（界面单独标注用途），
  // 不会代答当前请求。
  const canSendText = sessionManager.session !== null
    && ["running", "waiting", "completed", "failed", "cancelled"].includes(sessionManager.session.runStatus);

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
  });

  const commandsManager = useRunCommands({
    session: sessionManager.session,
    sessionState: sessionManager.sessionState,
    canSendText,
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
  });

  const queueManager = useQueue({
    session: sessionManager.session,
    onRefreshSession: sessionManager.refreshSelectedSession,
    onCommandError: commandsManager.setCommandError,
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
      mode={permissionsManager.permissionMode?.mode ?? null}
      modeError={permissionsManager.permissionModeError}
      modeBusy={permissionsManager.permissionModeBusy}
      onChooseMode={(mode) => void permissionsManager.updatePermissionMode(mode)}
      grants={permissionsManager.permissionMenuGrants}
      grantsLoading={permissionsManager.permissionMenuGrantsLoading}
      grantsError={permissionsManager.permissionMenuGrantsError}
      hasGoal={hasGoal}
      revokingGrantId={permissionsManager.revokingGrantId}
      onRevokeGrant={(grant) => void permissionsManager.revokePermissionGrant(grant, setToolGrants)}
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
      sessionError={sessionManager.sessionError}
    />
  );

  const sessionContextValue: GoalSessionContextValue = {
    selectedGoalId: sessionManager.selectedGoalId,
    session: sessionManager.session,
    activityPage: sessionManager.activityPage,
    activityWindow: sessionManager.activityWindow,
    loadEarlierActivity: sessionManager.loadEarlierActivity,
    loadNewerActivity: sessionManager.loadNewerActivity,
    jumpToLatestActivity: sessionManager.jumpToLatestActivity,
    fullSession: sessionManager.fullSession,
    fullSessionLoading: sessionManager.fullSessionLoading,
    fullSessionError: sessionManager.fullSessionError,
    sessionLoading: sessionManager.sessionLoading,
    sessionError: sessionManager.sessionError,
    workspaceContext,
    workspaceContextError,
    sessionTab,
    setSessionTab,
    trajectoryTarget,
    setTrajectoryTarget,
    follow,
    setFollow,
    showTools,
    setShowTools,
    goalInfoOpen,
    setGoalInfoOpen,
    toolGrants,
    toolGrantsLoading,
    toolGrantsError,
    revokingGrantId: permissionsManager.revokingGrantId,
    liveText: streamManager.liveText,
    liveActivity: streamManager.liveActivity,
    candidatePresentation: streamManager.candidatePresentation,
    expandCandidateDraft: streamManager.expandCandidateDraft,
    releaseCandidateDraft: streamManager.releaseCandidateDraft,
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
    commandBusy: commandsManager.commandBusy,
    commandError: commandsManager.commandError,
    setCommandError: commandsManager.setCommandError,
    stoppingRunId: commandsManager.stoppingRunId,
    canSendText,
    queuedInputs: queueManager.queuedInputs,
    queuePaused: queueManager.queuePaused,
    onContinueQueue: queueManager.continueQueue,
    onClearQueue: queueManager.clearQueue,
    onSubmitMessage: commandsManager.submitMessage,
    onSubmitDraftMessage: commandsManager.submitDraftMessage,
    onSubmitSteer: commandsManager.submitSteer,
    onInterrupt: commandsManager.interruptCurrentRun,
    onSubmitResume: commandsManager.submitResume,
    unverifiedSubmissions: commandsManager.unverifiedSubmissions,
    onVerifySubmission: commandsManager.verifySubmission,
    onRetrySubmission: commandsManager.retrySubmission,
    onDiscardSubmission: commandsManager.discardSubmission,
  };

  return {
    goals: goalsManager.goals,
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
    revokeToolGrant,
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
