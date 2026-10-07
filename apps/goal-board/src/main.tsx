import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./modal";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Folder,
  Gauge,
  GitBranch,
  LayoutGrid,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  ChevronDown,
  Terminal,
  Trash2,
  FilePenLine,
  X,
  Zap,
} from "lucide-react";

import type {
  BrowserGoalInteractionCommand,
  BrowserGoalListItem,
  BrowserGoalSession,
  BrowserSessionMessage,
  BrowserSessionStep,
  BrowserToolGrantSummary,
  BrowserModelCatalog,
  BrowserModelOption,
  BrowserPermissionModeResult,
  BrowserWorkspaceContext,
  SessionMetricsSnapshot,
} from "../../../packages/web-contracts/src/index";
import { createSlashCommandRegistry, modelCommandDefinition, planCommandDefinition } from "../../../packages/slash-command/src/index";
import type { ModelCommandEffect } from "../../../packages/slash-command/src/index";
import { BrowserApiError, browserApi } from "./api";
import { GoalDetails, WaitingInteraction } from "./panels";
import "./style.css";
import { Trajectory } from "./trajectory";

type GoalStatus = "Ready" | "Running" | "Needs input" | "Completed" | "Stopped";
type SessionTab = "Board" | "Activity" | "Plan" | "Trajectory";
type MetricsState = { readonly kind: "ready"; readonly value: SessionMetricsSnapshot } | { readonly kind: "error" };
type QueuedInput = { readonly messageId: string; readonly content: string };

const statuses: readonly GoalStatus[] = [
  "Ready",
  "Running",
  "Needs input",
  "Completed",
  "Stopped",
];

const slashCommands = createSlashCommandRegistry<ModelCommandEffect>();
slashCommands.register(planCommandDefinition);
slashCommands.register(modelCommandDefinition);

type ModelPickerTarget = { readonly kind: "draft" } | { readonly kind: "goal"; readonly goalId: string; readonly runId: string };

function statusFromRun(status: BrowserGoalListItem["runStatus"]): GoalStatus {
  switch (status) {
    case "created": return "Ready";
    case "running": return "Running";
    case "waiting": return "Needs input";
    case "completed": return "Completed";
    case "failed":
    case "cancelled": return "Stopped";
  }
}

function statusClass(status: GoalStatus): string {
  return status.toLowerCase().replaceAll(" ", "-");
}

function App() {
  const [goals, setGoals] = useState<readonly BrowserGoalListItem[]>([]);
  const [metricsByGoal, setMetricsByGoal] = useState<Record<string, MetricsState>>({});
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [session, setSession] = useState<BrowserGoalSession | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<BrowserWorkspaceContext | null>(null);
  const [workspaceContextError, setWorkspaceContextError] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const [queuedByGoal, setQueuedByGoal] = useState<Record<string, readonly QueuedInput[]>>({});
  const [queuePausedByGoal, setQueuePausedByGoal] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [archivedView, setArchivedView] = useState(false);
  const [manageBusyId, setManageBusyId] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [undoArchiveId, setUndoArchiveId] = useState<string | null>(null);
  const [goalInfoOpen, setGoalInfoOpen] = useState(false);
  const [trajectoryTarget, setTrajectoryTarget] = useState<{runId: string; executionUnitId: string; nonce: number} | null>(null);
  const [sessionTab, setSessionTab] = useState<SessionTab>("Activity");
  const [follow, setFollow] = useState(true);
  const [showTools, setShowTools] = useState(true);
  const [liveText, setLiveText] = useState("");
  const [liveActivity, setLiveActivity] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [toolGrants, setToolGrants] = useState<readonly BrowserToolGrantSummary[]>([]);
  const [toolGrantsLoading, setToolGrantsLoading] = useState(false);
  const [toolGrantsError, setToolGrantsError] = useState<string | null>(null);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<Extract<BrowserPermissionModeResult, { ok: true }> | null>(null);
  const [permissionModeError, setPermissionModeError] = useState<string | null>(null);
  const [permissionModeBusy, setPermissionModeBusy] = useState(false);
  const [permissionMenuGrants, setPermissionMenuGrants] = useState<readonly BrowserToolGrantSummary[]>([]);
  const [permissionMenuGrantsLoading, setPermissionMenuGrantsLoading] = useState(false);
  const [permissionMenuGrantsError, setPermissionMenuGrantsError] = useState<string | null>(null);
  const [draftSessionOpen, setDraftSessionOpen] = useState(false);
  const [draftPlanMode, setDraftPlanMode] = useState(false);
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const [draftModelCatalog, setDraftModelCatalog] = useState<BrowserModelCatalog | null>(null);
  const [draftModelError, setDraftModelError] = useState<string | null>(null);
  const [modelPreferenceRetry, setModelPreferenceRetry] = useState<string | null>(null);
  const [modelPickerTarget, setModelPickerTarget] = useState<ModelPickerTarget | null>(null);
  const [currentModelCatalog, setCurrentModelCatalog] = useState<BrowserModelCatalog | null>(null);
  const [modelCatalogRefreshKey, setModelCatalogRefreshKey] = useState(0);
  const draftGoalId = useRef<string | null>(null);
  const draftGeneration = useRef(0);
  const draftLoadVersion = useRef(0);
  const timeline = useRef<HTMLDivElement>(null);
  const latestSession = useRef<BrowserGoalSession | null>(null);
  const queueSendInFlight = useRef(new Set<string>());
  const activeGoal = goals.find((goal) => goal.goalId === selectedGoalId);
  const sessionVisible = activeGoal !== undefined || draftSessionOpen;
  const currentRun = session?.runs.find((run) => run.current);
  const visibleGoals = useMemo(() => goals.filter((goal) => goal.archived === archivedView && goal.intent.toLowerCase().includes(search.toLowerCase())), [goals, search, archivedView]);
  const canSendText = session !== null
    && session.pendingInteraction === undefined
    && session.pendingAction === undefined
    && (session.runStatus === "waiting" || session.runStatus === "completed" || session.runStatus === "failed" || session.runStatus === "cancelled");
  const currentModelName = currentModelCatalog === null ? "Current model unavailable"
    : currentModelCatalog.models.find((model) => model.id === currentModelCatalog.currentModelId)?.displayName
      ?? currentModelCatalog.currentModelId;
  const draftModelName = draftModelId === null ? (draftModelCatalog === null && draftModelError === null ? "Loading model…" : "Choose model")
    : draftModelCatalog?.models.find((model) => model.id === draftModelId)?.displayName ?? draftModelId;
  const canSwitchCurrentModel = session !== null
    && (session.runStatus === "waiting" || session.runStatus === "completed" || session.runStatus === "failed" || session.runStatus === "cancelled")
    && session.pendingAction === undefined;

  useEffect(() => {
    if (!sessionVisible) return;
    const controller = new AbortController();
    const refresh = () => {
      void browserApi.readWorkspace(controller.signal).then((context) => {
        if (controller.signal.aborted) return;
        setWorkspaceContext(context);
        setWorkspaceContextError(false);
      }).catch(() => {
        if (controller.signal.aborted) return;
        setWorkspaceContext(null);
        setWorkspaceContextError(true);
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); };
  }, [sessionVisible, session]);

  useEffect(() => {
    let active = true;
    void browserApi.getPermissionMode().then((result) => {
      if (!active) return;
      if (result.ok) {
        setPermissionMode(result);
        setPermissionModeError(null);
      } else {
        setPermissionModeError("Project permissions are unavailable.");
      }
    }).catch(() => {
      if (active) setPermissionModeError("Could not load project permissions.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!permissionMenuOpen || session === null) {
      setPermissionMenuGrants([]);
      return;
    }
    let active = true;
    setPermissionMenuGrantsLoading(true);
    setPermissionMenuGrantsError(null);
    void browserApi.listToolGrants(session.goalId, session.currentRunId).then((result) => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      setPermissionMenuGrants(result.grants);
    }).catch(() => {
      if (active) setPermissionMenuGrantsError("Could not load saved permissions. Close and reopen the menu to retry.");
    }).finally(() => { if (active) setPermissionMenuGrantsLoading(false); });
    return () => { active = false; };
  }, [permissionMenuOpen, session?.goalId, session?.currentRunId]);

  useEffect(() => {
    if (session === null) {
      setCurrentModelCatalog(null);
      return;
    }
    let active = true;
    setCurrentModelCatalog(null);
    void browserApi.listModels({ goalId: session.goalId, runId: session.currentRunId }).then((catalog) => {
      if (active) setCurrentModelCatalog(catalog);
    }).catch(() => {
      if (active) setCurrentModelCatalog(null);
    });
    return () => { active = false; };
  }, [session?.goalId, session?.currentRunId, modelCatalogRefreshKey]);

  async function updatePermissionMode(mode: "default" | "yolo") {
    if (permissionMode === null || permissionModeBusy || mode === permissionMode.mode) return;
    setPermissionModeBusy(true);
    setPermissionModeError(null);
    try {
      const result = await browserApi.setPermissionMode({ mode, expectedRevision: permissionMode.revision });
      if (!result.ok) {
        const current = await browserApi.getPermissionMode().catch(() => null);
        if (current?.ok) setPermissionMode(current);
        throw new Error(result.error === "conflict" ? "Project permissions changed elsewhere. The current mode was reloaded." : result.error);
      }
      setPermissionMode(result);
      setPermissionMenuOpen(false);
    } catch (error) {
      setPermissionModeError(error instanceof Error && error.message !== "permissions_unavailable"
        ? error.message
        : "Could not save the project permission mode.");
    } finally {
      setPermissionModeBusy(false);
    }
  }

  async function revokePermissionGrant(grant: BrowserToolGrantSummary) {
    if (session === null || revokingGrantId !== null) return;
    setRevokingGrantId(grant.grantId);
    try {
      const result = await browserApi.revokeToolGrant(session.goalId, {
        runId: session.currentRunId,
        grantId: grant.grantId,
        scope: grant.scope,
        kind: grant.kind ?? "tool",
      });
      if (!result.ok) throw new Error(result.error);
      setPermissionMenuGrants(result.grants);
      setToolGrants(result.grants);
    } catch {
      setPermissionModeError("Could not revoke this permission. Reload the session and try again.");
    } finally {
      setRevokingGrantId(null);
    }
  }

  const renderPermissionControl = (hasGoal: boolean) => (
    <PermissionControl
      open={permissionMenuOpen}
      onToggle={() => setPermissionMenuOpen((value) => !value)}
      onClose={() => setPermissionMenuOpen(false)}
      mode={permissionMode?.mode ?? null}
      modeError={permissionModeError}
      modeBusy={permissionModeBusy}
      onChooseMode={(mode) => void updatePermissionMode(mode)}
      grants={permissionMenuGrants}
      grantsLoading={permissionMenuGrantsLoading}
      grantsError={permissionMenuGrantsError}
      hasGoal={hasGoal}
      revokingGrantId={revokingGrantId}
      onRevokeGrant={(grant) => void revokePermissionGrant(grant)}
    />
  );

  useEffect(() => {
    if (modelPickerTarget?.kind === "goal" && session !== null && (
      session.goalId !== modelPickerTarget.goalId || session.currentRunId !== modelPickerTarget.runId
    )) setModelPickerTarget(null);
  }, [session?.goalId, session?.currentRunId, modelPickerTarget]);

  function renderMessages(messages: readonly BrowserSessionMessage[]) {
    return messages.map((message, index) => (
      <article className={`message ${message.role}`} key={`${message.runId ?? "earlier"}:${index}:${message.role}`}>
        <div className="message-heading">
          <span className={`message-avatar ${message.role}`}>
            {message.role === "user" ? "You" : <Zap size={12} />}
          </span>
          <strong>{message.role === "user" ? "You" : "LazyGoal"}</strong>
        </div>
        <div className={`message-body ${message.role === "assistant" ? "markdown-body" : ""}`}>
          {message.role === "assistant" ? <AssistantMarkdown content={message.content} /> : message.content}
        </div>
      </article>
    ));
  }

  useEffect(() => {
    if (!browserApi.hasAccessToken) {
      setGoalsLoading(false);
      setSessionError("Open the local link printed by `lazygoal web` to connect this board.");
      return;
    }
    const controller = new AbortController();
    void browserApi.listGoals(controller.signal).then((result) => {
      setGoals(result);
      setSessionError(null);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setSessionError(errorMessage(error));
    }).finally(() => {
      if (!controller.signal.aborted) setGoalsLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectedGoalId === null) {
      latestSession.current = null;
      setSession(null);
      setGoalInfoOpen(false);
      setTrajectoryTarget(null);
      setSessionLoading(false);
      if (browserApi.hasAccessToken) setSessionError(null);
      setLiveText("");
      setLiveActivity(null);
      setStreamConnected(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    latestSession.current = null;
    setSession(null);
    setGoalInfoOpen(false);
    setTrajectoryTarget(null);
    setToolGrants([]);
    setToolGrantsError(null);
    setToolGrantsLoading(false);
    setSessionLoading(true);
    setSessionError(null);
    setCommandError(null);
    setLiveText("");
    setLiveActivity(null);
    void browserApi.readGoal(selectedGoalId, controller.signal).then((next) => {
      if (!active) return;
      latestSession.current = next;
      setSession(next);
      setSessionTab("Activity");
    }).catch((error: unknown) => {
      if (active && !controller.signal.aborted) setSessionError(errorMessage(error));
    }).finally(() => {
      if (active) setSessionLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedGoalId]);

  useEffect(() => {
    if (goals.length === 0) return;
    const controller = new AbortController();
    for (const goal of goals) {
      void browserApi.readMetrics(goal.goalId, controller.signal).then((value) => {
        if (!controller.signal.aborted) setMetricsByGoal((current) => ({ ...current, [goal.goalId]: { kind: "ready", value } }));
      }).catch(() => {
        if (!controller.signal.aborted) setMetricsByGoal((current) => ({ ...current, [goal.goalId]: { kind: "error" } }));
      });
    }
    return () => controller.abort();
  }, [goals]);

  useEffect(() => {
    if (selectedGoalId === null) return;
    const controller = new AbortController();
    const listen = async () => {
      while (!controller.signal.aborted) {
        try {
          for await (const value of browserApi.metrics(selectedGoalId, controller.signal)) {
            if (controller.signal.aborted) return;
            setMetricsByGoal((current) => ({ ...current, [selectedGoalId]: { kind: "ready", value } }));
          }
        } catch {
          if (controller.signal.aborted) return;
          setMetricsByGoal((current) => ({ ...current, [selectedGoalId]: { kind: "error" } }));
        }
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 800);
          controller.signal.addEventListener("abort", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
        });
      }
    };
    void listen();
    return () => controller.abort();
  }, [selectedGoalId]);

  useEffect(() => {
    if (!goalInfoOpen || session === null || selectedGoalId === null) return;
    let active = true;
    setToolGrantsLoading(true);
    setToolGrantsError(null);
    void browserApi.listToolGrants(session.goalId, session.currentRunId).then((result) => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      setToolGrants(result.grants);
    }).catch((error: unknown) => {
      if (active) setToolGrantsError(errorMessage(error));
    }).finally(() => { if (active) setToolGrantsLoading(false); });
    return () => { active = false; };
  }, [goalInfoOpen, session?.goalId, session?.currentRunId, selectedGoalId]);

  useEffect(() => {
    if (
      selectedGoalId === null
      || session === null
      || session.goalId !== selectedGoalId
      || sessionLoading
    ) return;
    const controller = new AbortController();
    let active = true;
    setStreamConnected(false);

    const refreshLatest = async () => {
      const previous = latestSession.current;
      const next = await browserApi.readGoal(selectedGoalId, controller.signal);
      if (!active) return;
      latestSession.current = next;
      setSession(next);
      setSessionError(null);
      if (previous !== null && (
        next.messages.length > previous.messages.length
        || committedStepCount(next) > committedStepCount(previous)
      )) setLiveText("");
      void browserApi.listGoals(controller.signal).then(setGoals).catch(() => undefined);
    };

    const delay = () => new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 800);
      controller.signal.addEventListener("abort", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });

    const listen = async () => {
      while (active && !controller.signal.aborted) {
        try {
          for await (const event of browserApi.events(
            selectedGoalId,
            session.currentRunId,
            controller.signal,
          )) {
            if (!active) return;
            setStreamConnected(true);
            if (event.type === "snapshot_changed" || event.type === "refresh_required") {
              await refreshLatest();
              continue;
            }
            switch (event.activity.kind) {
              case "assistant_text_delta": {
                const text = event.activity.text;
                setLiveActivity("A response is being generated");
                setLiveText((current) => (current + text).slice(-8_000));
                break;
              }
              case "model_started":
                setLiveText("");
                setLiveActivity("Runtime is working on this Goal");
                break;
              case "model_completed":
                setLiveActivity("Waiting for the saved result");
                break;
              case "step_started":
                setLiveText("");
                setLiveActivity("A new execution step has started");
                break;
              case "tool_started":
                setLiveActivity("A workspace action has started");
                break;
              case "tool_finished":
                setLiveActivity("Workspace action finished; waiting for saved state");
                break;
            }
          }
          if (active && !controller.signal.aborted) {
            setStreamConnected(false);
            await refreshLatest();
            await delay();
          }
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          setStreamConnected(false);
          if (error instanceof BrowserApiError && error.refresh) {
            try {
              await refreshLatest();
            } catch {
              // The next connection attempt will retry the official Snapshot read.
            }
          }
          await delay();
        }
      }
    };

    void listen();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedGoalId, session?.currentRunId, session?.goalId, sessionLoading]);

  useEffect(() => {
    if (follow && timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight;
  }, [session?.messages, currentRun?.steps, liveText, follow, selectedGoalId]);

  async function refreshGoals() {
    setGoalsLoading(true);
    try {
      setGoals(await browserApi.listGoals());
      setSessionError(null);
    } catch (error) {
      setSessionError(errorMessage(error));
    } finally {
      setGoalsLoading(false);
    }
  }

  async function changeArchive(goal: BrowserGoalListItem, archived: boolean) {
    setManageBusyId(goal.goalId);
    setManageError(null);
    try {
      await browserApi.setGoalArchived(goal.goalId, archived);
      setGoals((current) => current.map((item) => item.goalId === goal.goalId ? { ...item, archived } : item));
      setUndoArchiveId(archived ? goal.goalId : null);
    } catch (error) {
      setManageError(`Archive failed: ${errorMessage(error)}`);
      await refreshGoals();
    } finally {
      setManageBusyId(null);
    }
  }

  async function deleteGoal(goal: BrowserGoalListItem) {
    setManageBusyId(goal.goalId);
    setManageError(null);
    try {
      await browserApi.deleteGoal(goal.goalId);
      setGoals((current) => current.filter((item) => item.goalId !== goal.goalId));
      setUndoArchiveId(null);
      if (selectedGoalId === goal.goalId) setSelectedGoalId(null);
    } catch (error) {
      setManageError(`Deletion failed: ${errorMessage(error)}`);
      await refreshGoals();
    } finally {
      setManageBusyId(null);
    }
  }

  async function refreshSelectedSession() {
    if (selectedGoalId === null) return;
    const hasVisibleSession = latestSession.current !== null;
    if (!hasVisibleSession) setSessionLoading(true);
    try {
      const next = await browserApi.readGoal(selectedGoalId);
      const previous = latestSession.current;
      latestSession.current = next;
      setSession(next);
      setSessionError(null);
      if (previous !== null && (
        next.messages.length > previous.messages.length
        || committedStepCount(next) > committedStepCount(previous)
      )) setLiveText("");
      await refreshGoals();
    } catch (error) {
      setSessionError(errorMessage(error));
    } finally {
      if (!hasVisibleSession) setSessionLoading(false);
    }
  }

  function toggleGoalSelection(goalId: string) {
    setModelPickerTarget(null);
    setDraftSessionOpen(false);
    setSelectedGoalId(goalId);
    setSessionTab("Activity");
  }

  function openNewGoalDraft() {
    setModelPickerTarget(null);
    setModelPreferenceRetry(null);
    draftGoalId.current = null;
    setDraftModelId(null);
    setDraftModelCatalog(null);
    setDraftModelError(null);
    const generation = ++draftGeneration.current;
    void loadDraftDefault(generation);
    setSelectedGoalId(null);
    setDraftPlanMode(false);
    setDraftSessionOpen(true);
    setSessionTab("Activity");
    setCommandError(null);
  }

  function closeSession() {
    setModelPickerTarget(null);
    setModelPreferenceRetry(null);
    setSelectedGoalId(null);
    setDraftSessionOpen(false);
    draftGeneration.current += 1;
  }

  async function loadDraftDefault(generation: number) {
    const version = ++draftLoadVersion.current;
    setDraftModelError(null);
    try {
      const catalog = await browserApi.listModels();
      if (generation !== draftGeneration.current || version !== draftLoadVersion.current) return;
      setDraftModelCatalog(catalog);
      const selected = catalog.models.find((model) => model.id === catalog.currentModelId && model.selectable);
      setDraftModelId(selected?.id ?? null);
    } catch {
      if (generation !== draftGeneration.current || version !== draftLoadVersion.current) return;
      setDraftModelError("Could not load the new Goal model. Retry or choose a model.");
    }
  }

  async function submitDraftMessage(content: string): Promise<boolean> {
    const dispatched = await dispatchBrowserInput(content);
    if (dispatched.kind === "error") {
      setCommandError(dispatched.message);
      return false;
    }
    if (dispatched.kind === "plan") {
      setDraftPlanMode(true);
      setCommandError(null);
      return true;
    }
    if (dispatched.kind === "model") {
      setModelPickerTarget({ kind: "draft" });
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
      const result = await browserApi.createGoal({
        goalId,
        intent,
        ...(draftPlanMode ? { mode: "plan" as const } : {}),
        modelId: draftModelId,
      });
      setDraftSessionOpen(false);
      setSelectedGoalId(result.goalId);
      await refreshGoals();
      return true;
    } catch (error) {
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && ["model_not_selectable", "model_catalog_unavailable", "goal_busy"].includes(error.code)) {
        draftGoalId.current = null;
      }
      return false;
    } finally {
      setCommandBusy(false);
    }
  }

  async function submitMessage(content: string): Promise<boolean> {
    const dispatched = await dispatchBrowserInput(content);
    if (dispatched.kind === "error") {
      setCommandError(dispatched.message);
      return false;
    }
    if (dispatched.kind === "model") {
      if (!session || commandBusy || !["waiting", "completed", "failed"].includes(session.runStatus) || session.pendingAction !== undefined) return false;
      setModelPickerTarget({ kind: "goal", goalId: session.goalId, runId: session.currentRunId });
      setCommandError(null);
      return true;
    }
    if (dispatched.kind === "plan") {
      if (!session || commandBusy) return false;
      setCommandBusy(true);
      setCommandError(null);
      try {
        await browserApi.enterPlanMode(session.goalId, { runId: session.currentRunId });
        await refreshSelectedSession();
        return true;
      } catch (error) {
        setCommandError(errorMessage(error));
        if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
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
      await browserApi.sendMessage(session.goalId, {
        runId: session.currentRunId,
        messageId: crypto.randomUUID(),
        content: trimmed,
      });
      await refreshSelectedSession();
      return true;
    } catch (error) {
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
      return false;
    } finally {
      setCommandBusy(false);
    }
  }

  async function submitSteer(content: string): Promise<boolean> {
    if (!session || session.runStatus !== "running" || !content.trim() || commandBusy) return false;
    setCommandBusy(true);
    setCommandError(null);
    try {
      await browserApi.steer(session.goalId, {
        runId: session.currentRunId,
        messageId: crypto.randomUUID(),
        content: content.trim(),
      });
      await refreshSelectedSession();
      return true;
    } catch (error) {
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
      return false;
    } finally {
      setCommandBusy(false);
    }
  }

  function queueInput(content: string): boolean {
    if (!session || session.runStatus !== "running" || !content.trim()) return false;
    const item = { messageId: crypto.randomUUID(), content: content.trim() };
    setQueuedByGoal((current) => ({ ...current, [session.goalId]: [...(current[session.goalId] ?? []), item] }));
    return true;
  }

  async function interruptCurrentRun(): Promise<void> {
    if (!session || session.runStatus !== "running" || commandBusy) return;
    setCommandBusy(true);
    setStoppingRunId(session.currentRunId);
    setCommandError(null);
    try {
      await browserApi.interrupt(session.goalId, {
        runId: session.currentRunId,
        requestId: crypto.randomUUID(),
      });
      await refreshSelectedSession();
    } catch (error) {
      setStoppingRunId(null);
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
    } finally {
      setCommandBusy(false);
    }
  }

  async function startQueuedInput(goalId: string, runId: string, item: QueuedInput): Promise<boolean> {
    const reservation = `${goalId}:${item.messageId}`;
    if (queueSendInFlight.current.has(reservation)) return false;
    queueSendInFlight.current.add(reservation);
    try {
      await browserApi.sendMessage(goalId, { runId, messageId: item.messageId, content: item.content });
      setQueuedByGoal((current) => {
        const items = current[goalId] ?? [];
        return { ...current, [goalId]: items[0]?.messageId === item.messageId ? items.slice(1) : items.filter((entry) => entry.messageId !== item.messageId) };
      });
      setQueuePausedByGoal((current) => ({ ...current, [goalId]: false }));
      if (selectedGoalId === goalId) await refreshSelectedSession();
      return true;
    } catch (error) {
      setQueuePausedByGoal((current) => ({ ...current, [goalId]: true }));
      if (selectedGoalId === goalId) {
        setCommandError(errorMessage(error));
        if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
      }
      return false;
    } finally {
      queueSendInFlight.current.delete(reservation);
    }
  }

  async function continueQueue(): Promise<void> {
    if (!session) return;
    const first = queuedByGoal[session.goalId]?.[0];
    if (!first || !["failed", "cancelled", "completed"].includes(session.runStatus)) return;
    setQueuePausedByGoal((current) => ({ ...current, [session.goalId]: false }));
    await startQueuedInput(session.goalId, session.currentRunId, first);
  }

  useEffect(() => {
    if (!session) return;
    if (stoppingRunId !== null && session.currentRunId === stoppingRunId && session.runStatus !== "running") {
      setStoppingRunId(null);
    }
    const items = queuedByGoal[session.goalId] ?? [];
    if (items.length === 0) return;
    if (session.runStatus === "failed" || session.runStatus === "cancelled") {
      setQueuePausedByGoal((current) => ({ ...current, [session.goalId]: true }));
      return;
    }
    if (session.runStatus !== "completed" || queuePausedByGoal[session.goalId]) return;
    void startQueuedInput(session.goalId, session.currentRunId, items[0]!);
  }, [session?.goalId, session?.currentRunId, session?.runStatus, queuedByGoal, queuePausedByGoal, stoppingRunId]);

  async function submitInteraction(command: BrowserGoalInteractionCommand) {
    if (!session || commandBusy) return;
    setCommandBusy(true);
    setCommandError(null);
    try {
      await browserApi.interact(session.goalId, command);
      await refreshSelectedSession();
    } catch (error) {
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
    } finally {
      setCommandBusy(false);
    }
  }

  async function submitResume() {
    if (!session || commandBusy) return;
    setCommandBusy(true);
    setCommandError(null);
    try {
      const expectedCommittedThroughSequence = session.execution?.committedThroughSequence ?? 0;
      await browserApi.resumeGoal(session.goalId, {
        runId: session.currentRunId,
        expectedCommittedThroughSequence,
      });
      await refreshSelectedSession();
    } catch (error) {
      setCommandError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
    } finally {
      setCommandBusy(false);
    }
  }

  async function chooseModel(target: ModelPickerTarget, model: BrowserModelOption, catalog: BrowserModelCatalog): Promise<void> {
    const modelId = model.id;
    if (target.kind === "draft") {
      if (draftGoalId.current !== null) throw new Error("Retry this Goal with its original model before changing it.");
      const generation = draftGeneration.current;
      draftLoadVersion.current += 1;
      try {
        await browserApi.setModelPreference(modelId);
      } catch (error) {
        if (generation === draftGeneration.current && draftModelId === null) void loadDraftDefault(generation);
        throw error;
      }
      if (generation !== draftGeneration.current) return;
      setDraftModelCatalog({ ...catalog, currentModelId: modelId, defaultModelNotice: undefined });
      setDraftModelId(modelId);
      setDraftModelError(null);
      return;
    }
    try {
      const result = await browserApi.selectModel(target.goalId, { runId: target.runId, modelId });
      setModelPreferenceRetry(result.defaultModelSaved ? null : modelId);
      setCommandError(result.defaultModelSaved ? null : "Model switched, but the new Goal default was not saved.");
      if (latestSession.current?.goalId === target.goalId) {
        setModelCatalogRefreshKey((current) => current + 1);
        await refreshSelectedSession();
      }
    } catch (error) {
      if (error instanceof BrowserApiError && error.refresh && latestSession.current?.goalId === target.goalId) {
        await refreshSelectedSession();
      }
      throw error;
    }
  }

  async function retryModelPreference() {
    const modelId = modelPreferenceRetry;
    if (modelId === null) return;
    try {
      await browserApi.setModelPreference(modelId);
      setModelPreferenceRetry(null);
      setCommandError(null);
    } catch (error) {
      setCommandError(`Could not save the new Goal default: ${errorMessage(error)}`);
    }
  }

  async function revokeToolGrant(grant: BrowserToolGrantSummary) {
    if (session === null || revokingGrantId !== null) return;
    setRevokingGrantId(grant.grantId);
    setToolGrantsError(null);
    try {
      const result = await browserApi.revokeToolGrant(session.goalId, {
        runId: session.currentRunId,
        grantId: grant.grantId,
        scope: grant.scope,
      });
      if (!result.ok) throw new Error(result.error);
      setToolGrants(result.grants);
      await refreshSelectedSession();
    } catch (error) {
      setToolGrantsError(errorMessage(error));
      if (error instanceof BrowserApiError && error.refresh) await refreshSelectedSession();
    } finally { setRevokingGrantId(null); }
  }

  const sessionTabs: readonly SessionTab[] = session?.goalPlan === undefined
    ? ["Board", "Activity", "Trajectory"]
    : ["Board", "Activity", "Plan", "Trajectory"];

  const boardContent = (
    <section className="board-area">
      <div className="toolbar">
        <strong className="board-title">{archivedView ? "Archived" : "All goals"} <span>{goals.filter((goal) => goal.archived === archivedView).length}</span></strong>
        <button className={`archive-view-toggle ${archivedView ? "is-active" : ""}`} type="button" onClick={() => { setArchivedView(!archivedView); setUndoArchiveId(null); }}>
          {archivedView ? "All goals" : `Archived (${goals.filter((goal) => goal.archived).length})`}
        </button>
        <label className="search">
          <Search size={14} />
          <input
            aria-label="Search goals"
            placeholder="Search goals…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {search && (
          <button className="icon" aria-label="Clear search" title="Clear search" onClick={() => setSearch("")}>
            <X size={14} />
          </button>
        )}
        <button className="icon refresh-button" aria-label="Refresh goals" onClick={() => void refreshGoals()}>
          <Clock3 size={14} />
        </button>
      </div>
      {sessionError && selectedGoalId === null && (
        <div className="page-error" role="alert">
          <span>{sessionError}</span>
          {browserApi.hasAccessToken && <button onClick={() => void refreshGoals()}>Retry</button>}
        </div>
      )}
      {manageError && <div className="page-error" role="alert"><span>{manageError}</span><button onClick={() => setManageError(null)}>Dismiss</button></div>}
      {undoArchiveId && !archivedView && <div className="archive-notice" role="status">Goal archived. <button onClick={() => { const goal = goals.find((item) => item.goalId === undoArchiveId); if (goal) void changeArchive(goal, false); }}>Undo</button></div>}
      {goalsLoading ? (
        <div className="board-empty"><span className="loading-mark" /><p>Loading saved Goals…</p></div>
      ) : goals.filter((goal) => goal.archived === archivedView).length === 0 && !sessionError ? (
        <div className="board-empty">
          <InboxIcon />
          <h2>{archivedView ? "No archived Goals" : "No saved Goals yet"}</h2>
          <p>{archivedView ? "Archived Goals will appear here." : "Create a Goal to start a real session in this workspace."}</p>
          {!archivedView && <button className="primary" onClick={openNewGoalDraft} disabled={!browserApi.hasAccessToken}><Plus size={14} /> New goal</button>}
        </div>
      ) : visibleGoals.length === 0 && !sessionError ? (
        <div className="board-empty">
          <Search size={26} />
          <h2>No matching Goals</h2>
          <p>Clear the search to see saved Goals.</p>
        </div>
      ) : (
        <div className="board">
          {statuses.map((status) => {
            const statusGoals = visibleGoals.filter((item) => statusFromRun(item.runStatus) === status);
            return (
              <section className={`column ${statusClass(status)}`} key={status}>
                <div className="column-heading">
                  <span className="status-dot" />
                  <h2>{status}</h2>
                  <span className="count">{statusGoals.length}</span>
                </div>
                <div className="cards">
                  {statusGoals.map((goal) => <GoalCard
                    key={goal.goalId}
                    goal={goal}
                    metrics={metricsByGoal[goal.goalId]}
                    selected={selectedGoalId === goal.goalId}
                    onSelect={() => toggleGoalSelection(goal.goalId)}
                    busy={manageBusyId === goal.goalId}
                    onArchive={() => void changeArchive(goal, !goal.archived)}
                    onDelete={() => void deleteGoal(goal)}
                  />)}
                  {statusGoals.length === 0 && <div className="empty-column">No goals here</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="app">
      <main className="main">
        <header className="topbar">
          <div className="topbar-identity">
            <button className="topbar-brand" aria-label="Open Board" onClick={closeSession}>
              <span className="brand-icon"><Zap size={19} fill="currentColor" /></span>LazyGoal
            </button>
            <div className="breadcrumb">
              <Folder size={15} />
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>Goals</strong>
              {activeGoal && <><ChevronRight size={13} /><strong className="breadcrumb-current">{activeGoal.intent}</strong></>}
            </div>
          </div>
          <div className="header-actions">
            {session?.goalId === selectedGoalId && <button className="goal-info-toggle" aria-label="Goal information and permissions" onClick={() => setGoalInfoOpen(true)}>Goal info</button>}
            {sessionVisible && <button className="icon" aria-label="Close session" onClick={closeSession}><X size={17} /></button>}
            <button className="primary" onClick={openNewGoalDraft} disabled={!browserApi.hasAccessToken}>
              <Plus size={15} /> New goal
            </button>
          </div>
        </header>
        <div className={`content ${sessionVisible ? "session-open" : ""}`}>
          {sessionVisible && manageError && <div className="manage-error-overlay" role="alert">{manageError}<button onClick={() => setManageError(null)}>Dismiss</button></div>}
          {!sessionVisible && boardContent}
          {sessionVisible && (
            <section className="session">
                {goalInfoOpen && session && <section className="goal-info-panel" aria-label="Goal information"><header><strong>Goal information</strong><button className="icon" aria-label="Close Goal information" onClick={() => setGoalInfoOpen(false)}><X size={17}/></button></header><GoalDetails session={session} tab="Details" grants={toolGrants} grantsLoading={toolGrantsLoading} grantsError={toolGrantsError} revokingGrantId={revokingGrantId} onRevokeGrant={grant => void revokeToolGrant(grant)} onDelete={activeGoal ? () => void deleteGoal(activeGoal) : undefined} deleteBusy={manageBusyId === session.goalId}/></section>}
                {draftSessionOpen ? (
                  <>
                    <WorkspaceContext context={workspaceContext} error={workspaceContextError} />
                    <div className="session-tabs">
                      <div className="session-tab-buttons"><button aria-pressed="true">Activity</button></div>
                      <span className="stream-state"><span className="dot" />Local Runtime</span>
                    </div>
                    <div className="timeline draft-timeline">
                      <div className="timeline-date"><span />No saved messages<span /></div>
                      {draftPlanMode && <div className="session-intro">Plan Mode · The first message will start a Plan Run.</div>}
                      <p>Send your first message to create a Goal and start the session. Use <code>/plan</code> for Plan Mode or <code>/model</code> to choose a model.</p>
                    </div>
                    {commandError && (
                      <div className="command-error" role="alert">
                        <span>{commandError}</span>
                        <button aria-label="Dismiss error" onClick={() => setCommandError(null)}><X size={13} /></button>
                      </div>
                    )}
                    {draftModelCatalog?.defaultModelNotice && <div className="command-error" role="status">
                      {draftModelCatalog.defaultModelNotice === "provider_changed"
                        ? `Saved model belongs to a different provider. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`
                        : `Saved model is unavailable. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`}
                    </div>}
                    {draftModelCatalog !== null && draftModelId === null && <div className="command-error" role="alert">Configured default model is unavailable. Choose another model.</div>}
                    {draftModelError !== null && <div className="command-error" role="alert">
                      <span>{draftModelError}</span>
                      <button type="button" onClick={() => void loadDraftDefault(draftGeneration.current)}>Retry</button>
                    </div>}
                    <div className="composer-area">
                      <MessageComposer
                        key="new-goal-draft"
                        autoFocus
                        busy={commandBusy}
                        placeholder="Message LazyGoal…"
                        footerControls={<>
                          {renderPermissionControl(false)}
                          <CurrentModelControl
                            label={draftModelName}
                            enabled={!commandBusy && draftGoalId.current === null}
                            onClick={() => setModelPickerTarget({ kind: "draft" })}
                          />
                        </>}
                        onSubmit={submitDraftMessage}
                        sendDisabled={draftModelId === null}
                      />
                    </div>
                  </>
                ) : sessionLoading && session === null ? (
                  <div className="session-empty"><span className="loading-mark" /><p>Loading the latest saved session…</p></div>
                ) : sessionError ? (
                  <div className="session-empty" role="alert">
                    <CircleHelp size={24} />
                    <p>{sessionError}</p>
                    <button className="secondary" onClick={() => void refreshSelectedSession()}>Reload session</button>
                  </div>
                ) : session === null ? (
                  <div className="session-empty"><p>Loading session…</p></div>
                ) : (
                  <>
                    <WorkspaceContext context={workspaceContext} error={workspaceContextError} />
                    {session.nextRunMode === "plan" && <div className="session-intro">Next Run · Plan Mode</div>}
                    <div className="session-tabs">
                      <div className="session-tab-buttons">
                        {sessionTabs.map((tab) => (
                          <button key={tab} aria-pressed={sessionTab === tab} onClick={() => { setTrajectoryTarget(null); setSessionTab(tab); }}>{tab}</button>
                        ))}
                      </div>
                      <div className="session-state">
                        <span className={`task-state ${session.pendingAction?.status === "awaiting_approval" || session.pendingAction?.status === "outcome_unknown" || session.pendingInteraction ? "attention" : ""}`}>{sessionStatus(session)}</span>
                        <span className={`stream-state ${streamConnected ? "connected" : ""}`}>
                          <span className="dot" />{streamConnected ? "Connected" : "Reconnecting"}
                        </span>
                      </div>
                    </div>
                    {sessionTab === "Board" ? boardContent : sessionTab === "Trajectory" ? (
                      <Trajectory key={`${session.goalId}:${trajectoryTarget?.nonce ?? "browse"}`} session={session} target={trajectoryTarget}/>
                    ) : sessionTab === "Plan" ? (
                      <GoalDetails
                        session={session}
                        tab="Plan"
                        grants={toolGrants}
                        grantsLoading={toolGrantsLoading}
                        grantsError={toolGrantsError}
                        revokingGrantId={revokingGrantId}
                        onRevokeGrant={(grant) => void revokeToolGrant(grant)}
                      />
                    ) : (
                      <>
                        <div className="activity-filter">
                          <label>
                            <input type="checkbox" checked={showTools} onChange={(event) => setShowTools(event.target.checked)} />
                            Execution steps
                          </label>
                          <span>{session.messages.length} saved messages</span>
                        </div>
                        <div className="timeline-region">
                        <div
                          className="timeline"
                          ref={timeline}
                          onScroll={(event) => {
                            const element = event.currentTarget;
                            setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 60);
                          }}
                        >
                          {session.historyTruncated && <div className="history-note">Some session content is omitted.</div>}
                          {session.messages.length === 0 && <div className="timeline-date"><span />No saved messages<span /></div>}
                          {renderMessages(session.messages.filter((message) =>
                            message.runId === undefined || !session.runs.some((run) => run.runId === message.runId),
                          ))}
                          {session.runs.map((run) => {
                            const runMessages = session.messages.filter((message) => message.runId === run.runId);
                            return (
                              <div className="run-timeline" key={run.runId}>
                                {renderMessages(runMessages.filter((message) => message.role === "user"))}
                                {showTools && run.steps.length > 0 && (
                                  <details className="run-steps" open>
                                    <summary className="run-steps-heading">
                                      <Layers size={13} aria-hidden="true" />
                                      <span>{run.current ? "Execution activity" : "Earlier activity"}</span>
                                      <ChevronDown className="activity-chevron" size={12} aria-hidden="true" />
                                    </summary>
                                    {run.steps.map((step) => {
                                      const activity = stepActivity(step);
                                      const ActivityIcon = activity.icon;
                                      return <details className="tool-event" key={step.executionUnitId}>
                                        <summary>
                                          <ActivityIcon size={13} aria-hidden="true" />
                                          <span className="tool-activity-label" title={activity.label}>{activity.label}</span>
                                          {step.status !== "completed" && <span className={`step-status ${step.status}`}>{step.status === "recorded" ? "Attempt recorded" : step.status}</span>}
                                          <ChevronRight className="tool-chevron" size={12} aria-hidden="true" />
                                        </summary>
                                        <div className="tool-event-detail">
                                          {step.recoveryAttempts?.map((attempt, index) => (
                                            <div className="step-recovery" key={`${step.executionUnitId}:recovery:${index}`}>{attempt}</div>
                                          ))}
                                          {step.bashExecution && (
                                            <div className="tool-execution">
                                              <div className="tool-execution-field">
                                                <span>Command</span><pre>{step.bashExecution.command}</pre>
                                              </div>
                                              {step.bashExecution.exitCode !== undefined && (
                                                <div className="tool-execution-field">
                                                  <span>Exit code</span><pre>{step.bashExecution.exitCode}</pre>
                                                </div>
                                              )}
                                              {step.bashExecution.stdout !== undefined && (
                                                <div className="tool-execution-field">
                                                  <span>stdout</span><pre>{step.bashExecution.stdout || "(empty)"}</pre>
                                                </div>
                                              )}
                                              {step.bashExecution.stderr !== undefined && (
                                                <div className="tool-execution-field">
                                                  <span>stderr</span><pre>{step.bashExecution.stderr || "(empty)"}</pre>
                                                </div>
                                              )}
                                              {step.bashExecution.failure !== undefined && (
                                                <div className="tool-execution-field">
                                                  <span>Result</span><pre>{step.bashExecution.failure}</pre>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          {step.bashExecutionOmitted && <pre>Execution details omitted by the session size limit.</pre>}
                                          {!step.bashExecution && !step.bashExecutionOmitted && step.summary && <pre>{step.summary}</pre>}
                                          <footer className="trajectory-link"><button aria-label={`View Step ${step.stepIndex} in trajectory`} onClick={() => { setTrajectoryTarget({ runId: run.runId, executionUnitId: step.executionUnitId, nonce: Date.now() }); setSessionTab("Trajectory"); }}><Layers size={13}/>View in trajectory<ChevronRight size={12}/></button></footer>
                                        </div>
                                      </details>;
                                    })}
                                  </details>
                                )}
                                {run.current && liveText && (
                                  <article className="message assistant transient-message" aria-label="Uncommitted assistant activity">
                                    <div className="message-heading">
                                      <span className="message-avatar assistant"><Zap size={12} /></span>
                                      <strong>Live response</strong><small>Not saved yet</small>
                                    </div>
                                    <div className="message-body markdown-body"><AssistantMarkdown content={liveText} /><span className="cursor" /></div>
                                  </article>
                                )}
                                {run.current && run.status === "running" && (
                                  <div className="live-status" aria-live="polite">
                                    <span className="pulse" />{liveActivity ?? "Runtime is working on this Goal"}
                                    <span>{streamConnected ? "Temporary activity" : "Live connection reconnecting"}</span>
                                  </div>
                                )}
                                {run.status === "completed" && <div className="completion"><Check size={14} />Run completed</div>}
                                {run.status === "failed" && <div className="terminal-status failed">
                                  {run.terminalDetail
                                    ? `${run.terminalDetail.code ? `[${run.terminalDetail.code}] ` : ""}${run.terminalDetail.message}`
                                    : "This Run failed. Its saved history is still available."}
                                </div>}
                                {run.status === "waiting" && run.terminalDetail && <div className="terminal-status">Waiting: {run.terminalDetail.message}</div>}
                                {run.status === "cancelled" && <div className="terminal-status">This Run was cancelled.</div>}
                                {renderMessages(runMessages.filter((message) => message.role === "assistant"))}
                              </div>
                            );
                          })}
                        </div>
                        {!follow && (
                          <button className="jump" aria-label="Back to latest" title="Back to latest" onClick={() => setFollow(true)}><ArrowDown size={17} aria-hidden="true" /></button>
                        )}
                        </div>
                      </>
                    )}
                    {sessionTab !== "Board" && commandError && (
                      <div className="command-error" role="alert">
                        <span>{commandError}</span>
                        {modelPreferenceRetry !== null && <button type="button" onClick={() => void retryModelPreference()}>Retry saving default</button>}
                        <button aria-label="Dismiss error" onClick={() => setCommandError(null)}><X size={13} /></button>
                      </div>
                    )}
                    {sessionTab !== "Board" && <div className="composer-area">
                      {(queuedByGoal[session.goalId]?.length ?? 0) > 0 && (
                        <div className="queued-inputs" aria-label="Queued messages">
                          <div className="queued-inputs-heading">Queued messages · next Run order</div>
                          <ol>{queuedByGoal[session.goalId]!.map((item) => <li key={item.messageId}>{item.content}</li>)}</ol>
                          {queuePausedByGoal[session.goalId] && <div className="queue-paused">Queue paused. Continue when ready.
                            <button type="button" disabled={commandBusy} onClick={() => void continueQueue()}>Continue queue</button>
                          </div>}
                        </div>
                      )}
                      {session.runStatus === "waiting" && (
                        session.pendingInteraction !== undefined || session.pendingAction !== undefined
                          ? <>
                              <div className="composer-extra-controls">
                                {renderPermissionControl(true)}
                                <CurrentModelControl
                                  label={currentModelName}
                                  enabled={canSwitchCurrentModel && !commandBusy}
                                  onClick={() => setModelPickerTarget({ kind: "goal", goalId: session.goalId, runId: session.currentRunId })}
                                />
                              </div>
                              <WaitingInteraction session={session} busy={commandBusy} onSubmit={(command) => void submitInteraction(command)} />
                            </>
                          : <MessageComposer
                              key={session.currentRunId}
                              showHint={false}
                              busy={commandBusy}
                              placeholder="Give direction or ask a question…"
                              footerControls={<>
                                {renderPermissionControl(true)}
                                <CurrentModelControl
                                  label={currentModelName}
                                  enabled={canSwitchCurrentModel && !commandBusy}
                                  onClick={() => setModelPickerTarget({ kind: "goal", goalId: session.goalId, runId: session.currentRunId })}
                                />
                              </>}
                              onSubmit={submitMessage}
                            />
                      )}
                      {sessionTab === "Trajectory" && canSendText && <button className="trajectory-message-link" onClick={() => setSessionTab("Activity")}>Message this Goal from Activity <ChevronRight size={14}/></button>}
                      {sessionTab !== "Trajectory" && (session.runStatus === "completed" || session.runStatus === "failed" || session.runStatus === "cancelled") && session.pendingInteraction === undefined && session.pendingAction === undefined && (
                        <MessageComposer
                          key={`${session.currentRunId}:continue`}
                          showHint={false}
                          busy={commandBusy}
                          placeholder={session.runStatus === "failed" || session.runStatus === "cancelled" ? "Send a message to continue in a new Run…" : "Continue this Goal with a new task…"}
                          footerControls={<>
                            {renderPermissionControl(true)}
                            <CurrentModelControl
                              label={currentModelName}
                              enabled={canSwitchCurrentModel && !commandBusy}
                              onClick={() => setModelPickerTarget({ kind: "goal", goalId: session.goalId, runId: session.currentRunId })}
                            />
                          </>}
                          onSubmit={submitMessage}
                        />
                      )}
                      {session.runStatus === "running" && (
                        session.execution?.state === "recoverable" ? (
                          <div className="composer-recover-row">
                            <div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div>
                            <div className="composer-recover-actions">
                              <span className="composer-note">Execution paused or interrupted.</span>
                              <button
                                type="button"
                                className="primary"
                                disabled={commandBusy}
                                onClick={() => void submitResume()}
                              >
                                {commandBusy ? "Resuming…" : "Resume Run"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <MessageComposer
                            key={session.currentRunId}
                            showHint={false}
                            busy={commandBusy}
                            running
                            placeholder="Add direction while this Run is working…"
                            pendingSteers={session.pendingSteers ?? []}
                            onSteer={submitSteer}
                            onQueue={queueInput}
                            onInterrupt={interruptCurrentRun}
                            stopping={stoppingRunId === session.currentRunId || (session.interruption !== undefined && session.interruption.status !== "finished")}
                            footerControls={<>
                              {renderPermissionControl(true)}
                              <CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} />
                            </>}
                            onSubmit={submitMessage}
                          />
                        )
                      )}
                      {session.runStatus === "created" && (
                        session.execution?.state === "recoverable" ? (
                          <div className="composer-recover-row">
                            <div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div>
                            <div className="composer-recover-actions">
                              <span className="composer-note">Run not yet active in this process.</span>
                              <button
                                type="button"
                                className="primary"
                                disabled={commandBusy}
                                onClick={() => void submitResume()}
                              >
                                {commandBusy ? "Resuming…" : "Resume Run"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <><div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div><div className="composer-note">The Runtime is starting this Goal.</div></>
                        )
                      )}
                      {session.runStatus === "waiting" && session.pendingInteraction === undefined && session.pendingAction !== undefined && session.pendingAction.status === "approved" && (
                        <><div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div><div className="composer-note">The approved action is being recorded.</div></>
                      )}
                      <SessionMetricsBar state={metricsByGoal[session.goalId]} />
                    </div>}
                  </>
                )}
            </section>
          )}
        </div>
      </main>
      {modelPickerTarget !== null && (
        <ModelPicker
          key={modelPickerTarget.kind === "draft" ? "draft" : `${modelPickerTarget.goalId}:${modelPickerTarget.runId}`}
          target={modelPickerTarget}
          selectedId={modelPickerTarget.kind === "draft" ? draftModelId : null}
          onSelect={(model, catalog) => chooseModel(modelPickerTarget, model, catalog)}
          onClose={() => setModelPickerTarget(null)}
          onDone={() => setModelPickerTarget((current) => current === modelPickerTarget ? null : current)}
        />
      )}
    </div>
  );
}

function stepActivity(step: BrowserSessionStep) {
  const executed = step.status === "completed" || step.status === "failed";
  const target = step.inputSummary;
  if (step.toolId === "bash") {
    const command = step.bashExecution?.command.replace(/\s+/g, " ").trim();
    return { icon: Terminal, label: `${executed ? "Ran" : "Run"} ${command || "a command"}` };
  }
  if (step.toolId === "read_file") return { icon: BookOpen, label: `Read ${target || "a file"}` };
  if (step.toolId === "write_file") return { icon: FilePenLine, label: `${step.status === "completed" ? "Wrote" : "Write"} ${target || "a file"}` };
  if (step.toolId === "edit_file") return { icon: FilePenLine, label: `${step.status === "completed" ? "Edited" : "Edit"} ${target || "a file"}` };
  if (step.toolId === "grep" || step.toolId === "web_search") return { icon: Search, label: target ? `${executed ? "Searched" : "Search"} for ${target}` : `${executed ? "Searched" : "Search"} ${step.toolId === "grep" ? "files" : "the web"}` };
  if (step.toolId === "web_fetch") return { icon: BookOpen, label: `${executed ? "Fetched" : "Fetch"} ${target || "a page"}` };
  return { icon: step.decisionKind === "request_think" ? Clock3 : Zap, label: step.toolId ?? step.decisionKind ?? `Step ${step.stepIndex}` };
}

function AssistantMarkdown({ content }: { content: string }) {
  return <Markdown
    remarkPlugins={[remarkGfm]}
    skipHtml
    components={{
      table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ src, alt }) => src
        ? <a href={src} target="_blank" rel="noopener noreferrer">{alt || "Image"}</a>
        : <span>{alt || "Image"}</span>,
    }}
  >{content}</Markdown>;
}

function PermissionControl({
  open,
  onToggle,
  onClose,
  mode,
  modeError,
  modeBusy,
  onChooseMode,
  grants,
  grantsLoading,
  grantsError,
  hasGoal,
  revokingGrantId,
  onRevokeGrant,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  mode: "default" | "yolo" | null;
  modeError: string | null;
  modeBusy: boolean;
  onChooseMode: (mode: "default" | "yolo") => void;
  grants: readonly BrowserToolGrantSummary[];
  grantsLoading: boolean;
  grantsError: string | null;
  hasGoal: boolean;
  revokingGrantId: string | null;
  onRevokeGrant: (grant: BrowserToolGrantSummary) => void;
}) {
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  return (
    <div className="permission-control" ref={controlRef}>
      <button
        type="button"
        className={`permission-trigger ${mode === "yolo" ? "yolo" : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Shield size={13} />
        <span>Permission{mode === null ? "" : ` · ${mode === "yolo" ? "YOLO" : "Default"}`}</span>
        <ChevronDown size={12} />
      </button>
      {open && <section className="permission-popover" aria-label="Project permissions">
        <fieldset className="permission-modes" aria-label="Execution mode" disabled={modeBusy || mode === null}>
          <label className={mode === "default" ? "selected" : ""}>
            <input type="radio" name="project-permission-mode" checked={mode === "default"} onChange={() => onChooseMode("default")} />
            <Shield size={16} aria-hidden="true" />
            <span><strong>Default</strong><small>Review actions that need approval.</small></span>
            {mode === "default" && <Check className="permission-selected-icon" size={15} aria-hidden="true" />}
          </label>
          <label className={mode === "yolo" ? "selected" : ""}>
            <input type="radio" name="project-permission-mode" checked={mode === "yolo"} onChange={() => onChooseMode("yolo")} />
            <Zap size={16} aria-hidden="true" />
            <span><strong>YOLO</strong><small>Automatically approve eligible tools. Sandbox limits still apply.</small></span>
            {mode === "yolo" && <Check className="permission-selected-icon" size={15} aria-hidden="true" />}
          </label>
        </fieldset>
        {modeError && <p className="permission-error" role="alert">{modeError}</p>}
        <details className="permission-grants">
          <summary>Saved permissions{grants.length > 0 ? ` (${grants.length})` : ""}</summary>
          <div className="permission-grants-content">
            {!hasGoal ? <p>Select a Goal to review or revoke its saved permissions.</p>
              : grantsLoading ? <p>Loading permissions…</p>
                : grantsError ? <p className="permission-error" role="alert">{grantsError}</p>
                  : grants.length === 0 ? <p>No ongoing permissions.</p>
                    : <ul>{grants.map((grant) => (
                      <li key={grant.grantId}>
                        <div className="permission-grant-copy">
                          <strong>{grant.kind === "sandbox" ? "Sandbox · " : ""}{grant.toolId}</strong>
                          <span>{grant.scope === "goal" ? "This Goal" : "This project"} · {grant.status}</span>
                          {grant.kind === "sandbox" && grant.command && <code>{grant.command}</code>}
                          {grant.targetPath && <code>{grant.targetPath}</code>}
                          {grant.kind === "sandbox" && <span>{grant.network === "all_outbound" ? "All outbound network" : "No network"}</span>}
                          {grant.extraFiles?.map((file) => <code key={`${file.canonicalPath}:${file.access}`}>{file.access} · {file.canonicalPath}{file.kind === "directory_tree" ? "/…" : ""}</code>)}
                        </div>
                        {grant.status === "active" && <button
                          type="button"
                          className="permission-revoke"
                          disabled={revokingGrantId !== null}
                          onClick={() => onRevokeGrant(grant)}
                        >{revokingGrantId === grant.grantId ? "Revoking…" : "Revoke"}</button>}
                      </li>
                    ))}</ul>}
          </div>
        </details>
      </section>}
    </div>
  );
}

function CurrentModelControl({ label, enabled, onClick }: {
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="current-model-control"
      disabled={!enabled}
      aria-label={`Current model: ${label}${enabled ? ". Change model" : ""}`}
      title={enabled ? label : `${label}. Change model after the current action settles or the Run finishes.`}
      onClick={onClick}
    >
      <span>Model</span><strong>{label}</strong>{enabled && <ChevronDown size={11} />}
    </button>
  );
}

function WorkspaceContext({ context, error }: { context: BrowserWorkspaceContext | null; error: boolean }) {
  const branch = context === null ? (error ? "Branch unavailable" : "Loading branch…")
    : context.branch ?? (context.worktreeRoot === null ? "No Git branch" : "Detached HEAD");
  const path = context?.worktreeRoot ?? context?.workspaceRoot;
  const worktree = path?.split(/[\\/]/).filter(Boolean).at(-1) ?? path
    ?? (error ? "Worktree unavailable" : "Loading worktree…");
  return <div className="session-workspace" aria-label="Execution workspace">
    <span className="workspace-branch" title={branch} aria-label={`Branch: ${branch}`}><GitBranch size={13} /><span>{branch}</span></span>
    <span className="workspace-divider" aria-hidden="true">/</span>
    <span className="workspace-location" title={path ?? "Reload the session to retry."} aria-label={`${context?.worktreeRoot === null ? "Workspace" : "Worktree"}: ${path ?? worktree}`}><Folder size={13} /><span>{worktree}</span></span>
  </div>;
}

function sessionStatus(session: BrowserGoalSession): string {
  if (session.pendingAction?.status === "outcome_unknown") return "Outcome needs review";
  if (session.pendingAction?.status === "awaiting_approval") return "Awaiting approval";
  if (session.pendingAction?.status === "approved") return "Action accepted";
  if (session.pendingInteraction?.kind === "task_approval") return "Awaiting task approval";
  if (session.pendingInteraction) return "Awaiting your response";
  return session.runStatus.charAt(0).toUpperCase() + session.runStatus.slice(1);
}

function GoalCard({
  goal,
  metrics,
  selected,
  onSelect,
  busy,
  onArchive,
  onDelete,
}: {
  goal: BrowserGoalListItem;
  metrics?: MetricsState;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstMenuAction = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (menuOpen) firstMenuAction.current?.focus();
  }, [menuOpen]);
  const status = statusFromRun(goal.runStatus);
  const terminal = goal.runStatus === "completed" || goal.runStatus === "failed" || goal.runStatus === "cancelled";
  return (
    <article className="goal-card-shell">
    <button className={`goal-card ${selected ? "is-selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <h3>{goal.intent}</h3>
      <CardMetrics state={metrics} />
      <div className="card-footer">
        <span className={`status-pill ${statusClass(status)}`}><span className="status-dot" />{status}</span>
        <time dateTime={goal.updatedAt} title={goal.updatedAt}>{formatUpdatedAt(goal.updatedAt)}</time>
      </div>
    </button>
    <div className={`goal-card-menu ${menuOpen ? "is-expanded" : ""}`} onKeyDown={(event) => {
      if (event.key === "Escape") { setMenuOpen(false); setConfirmDelete(false); }
    }} onPointerLeave={(event) => {
      if (event.pointerType === "mouse") { setMenuOpen(false); setConfirmDelete(false); }
    }}>
      <button type="button" className="goal-card-options" aria-label={`More options for ${goal.intent}`} aria-expanded={menuOpen} tabIndex={menuOpen ? -1 : 0} onClick={() => { setConfirmDelete(false); setMenuOpen(true); }}><MoreHorizontal size={18} /></button>
      {menuOpen && <div className="goal-card-menu-items" role="group" aria-label={`Options for ${goal.intent}`}>
        <button ref={firstMenuAction} type="button" disabled={!terminal || busy} title={!terminal ? "Available after this Goal ends." : undefined} onClick={() => { onArchive(); setMenuOpen(false); }}><Archive size={14} /> {goal.archived ? "Restore" : "Archive"}</button>
        <button type="button" className={`danger ${confirmDelete ? "is-confirming" : ""}`} disabled={!terminal || busy} title={!terminal ? "Available after this Goal ends." : undefined} onClick={() => { if (confirmDelete) { onDelete(); setMenuOpen(false); } else setConfirmDelete(true); }}><Trash2 size={14} /> {busy ? "Deleting…" : confirmDelete ? "Confirm" : "Delete"}</button>
      </div>}
    </div>
    </article>
  );
}

function metricNumber(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function metricPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function metricSpeed(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

function metricCoverage(metrics: Pick<SessionMetricsSnapshot, "coverage" | "missingCalls">): string | null {
  if (metrics.coverage === "unavailable") return "Usage unavailable";
  if (metrics.coverage === "partial") return metrics.missingCalls > 0
    ? `${metrics.missingCalls} call${metrics.missingCalls === 1 ? "" : "s"} unreported`
    : "Partial coverage";
  return null;
}

function CardMetrics({ state }: { state?: MetricsState }) {
  if (state?.kind === "error") return <div className="card-metrics muted">Metrics unavailable</div>;
  if (state === undefined) return <div className="card-metrics muted">Loading metrics…</div>;
  const metrics = state.value;
  const coverage = metricCoverage(metrics);
  return <div className="card-metrics" aria-label={`Goal total: ${metrics.stepCount} committed steps, ${metrics.inputTokens ?? "unavailable"} input tokens, ${metrics.outputTokens ?? "unavailable"} output tokens`}>
    <span><strong>{metrics.stepCount}</strong> step{metrics.stepCount === 1 ? "" : "s"}<i /> <strong>{metricNumber(metrics.inputTokens)}</strong> in <span className="metric-separator">/</span> <strong>{metricNumber(metrics.outputTokens)}</strong> out</span>
    <span className={coverage === null ? "" : "metric-coverage"} title={coverage ?? "Goal cache hit rate and generation speed"}>
      {coverage ?? <><strong>{metricPercent(metrics.cacheHitRate)}</strong> cache<i /><strong>{metricSpeed(metrics.tokensPerSecond)}</strong> tok/s</>}
    </span>
  </div>;
}

function SessionMetricsBar({ state }: { state?: MetricsState }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (state?.kind === "error") return <div className="session-metrics-state">Recorded metrics unavailable</div>;
  if (state === undefined) return <div className="session-metrics-state">Loading recorded metrics…</div>;
  const metrics = state.value;
  const coverage = metricCoverage(metrics);
  return <><button type="button" className="session-metrics" aria-label="View recorded Goal metrics" onClick={() => setDetailsOpen(true)}>
    <span className="session-metric">
      <Gauge size={15} aria-hidden="true" />
      <span>{metrics.roundCount} run{metrics.roundCount === 1 ? "" : "s"} · {metrics.stepCount} step{metrics.stepCount === 1 ? "" : "s"}</span>
      <span className="session-metric-divider">·</span>
      <span title={`${metrics.throughputMeasuredCalls} measured calls; ${metrics.throughputExcludedCalls} excluded calls`}>{metricSpeed(metrics.tokensPerSecond)} tok/s</span>
    </span>
    <span className="session-metric">
      <Database size={15} aria-hidden="true" />
      <span>{metricNumber(metrics.inputTokens)} in / {metricNumber(metrics.outputTokens)} out</span>
      <span className="session-metric-divider">·</span>
      <span title={`${metrics.cacheMeasuredCalls} measured calls; ${metrics.cacheExcludedCalls} excluded calls`}>Cache hit {metricPercent(metrics.cacheHitRate)}</span>
    </span>
    <span className="session-metric" title="Remaining context after the latest confirmed call on the current model">
      <span className="context-ring" style={{ background: metrics.contextRemainingPercent == null ? "#59606d" : `conic-gradient(var(--blue) ${metrics.contextRemainingPercent * 100}%, #59606d 0)` }} aria-hidden="true" />
      <span>Context left {metricPercent(metrics.contextRemainingPercent ?? null)}</span>
    </span>
    {coverage !== null && <span className="session-metrics-coverage" title="Provider usage coverage">{coverage}</span>}
  </button>{detailsOpen && <Modal className="metrics-dialog" label="Recorded Goal metrics" onClose={() => setDetailsOpen(false)}>
    <div className="model-picker-head"><h2>Recorded Goal metrics</h2><button className="icon" aria-label="Close metrics" onClick={() => setDetailsOpen(false)}><X size={17}/></button></div>
    <dl className="metrics-details">
      <dt>Runs / committed steps</dt><dd>{metrics.roundCount} / {metrics.stepCount}</dd>
      <dt>Input / output tokens</dt><dd>{metricNumber(metrics.inputTokens)} / {metricNumber(metrics.outputTokens)}</dd>
      <dt>Generation</dt><dd>{metricSpeed(metrics.tokensPerSecond)} tok/s <small>{metrics.throughputMeasuredCalls} measured · {metrics.throughputExcludedCalls} excluded calls</small></dd>
      <dt>Cache hit</dt><dd>{metricPercent(metrics.cacheHitRate)} <small>{metrics.cacheMeasuredCalls} measured · {metrics.cacheExcludedCalls} excluded calls</small></dd>
      <dt>Context left</dt><dd>{metricPercent(metrics.contextRemainingPercent ?? null)} <small>Latest confirmed call on the current model</small></dd>
      <dt>Usage coverage</dt><dd>{coverage ?? "Complete coverage"}</dd>
    </dl><p className="metrics-note">— means unavailable. Missing values are not counted as zero.</p>
  </Modal>}</>;
}

function ModelPicker({ target, selectedId, onSelect, onClose, onDone }: {
  target: ModelPickerTarget;
  selectedId: string | null;
  onSelect: (model: BrowserModelOption, catalog: BrowserModelCatalog) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [catalog, setCatalog] = useState<BrowserModelCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const goalTarget = target.kind === "goal" ? { goalId: target.goalId, runId: target.runId } : undefined;
    void browserApi.listModels(goalTarget, controller.signal).then((result) => {
      if (!controller.signal.aborted && mounted.current) setCatalog(result);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted && mounted.current) setError(errorMessage(failure));
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [target.kind, target.kind === "goal" ? target.goalId : undefined, target.kind === "goal" ? target.runId : undefined]);

  async function pick(model: BrowserModelOption) {
    if (!model.selectable || busyId !== null) return;
    setBusyId(model.id);
    setError(null);
    try {
      if (catalog === null) return;
      await onSelect(model, catalog);
      if (mounted.current) onDone();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  return (
    <Modal className="model-picker" label="Choose model" onClose={onClose}>
        <div className="model-picker-head">
          <div><h2>Choose model</h2><p>Models available from the current provider</p></div>
          <button className="icon" type="button" aria-label="Close model picker" onClick={onClose}><X size={17} /></button>
        </div>
        {catalog !== null && <p className="model-provider">Configured provider · {catalog.provider}</p>}
        {catalog === null && error === null && <p className="model-loading"><span className="loading-mark small" /> Loading models…</p>}
        {error !== null && <p className="model-error" role="alert">{error}</p>}
        <input className="model-search" data-modal-autofocus type="search" aria-label="Search models" placeholder="Search models…" value={search} onChange={event => setSearch(event.target.value)}/>
        {catalog !== null && (
          <div className="model-list">
            {catalog.models.filter(model => `${model.displayName} ${model.id}`.toLowerCase().includes(search.toLowerCase())).map((model) => {
              const current = (selectedId ?? catalog.currentModelId) === model.id;
              return (
                <button key={model.id} type="button" className={`model-option ${current ? "current" : ""}`} disabled={!model.selectable || busyId !== null} onClick={() => void pick(model)}>
                  <span className="model-option-main"><strong>{model.displayName}</strong><code>{model.id}</code></span>
                  <span className="model-option-meta">
                    {current && <span className="model-current"><Check size={12} /> Current</span>}
                    <span>{model.availabilitySource === "live" ? "Live" : model.availabilitySource === "catalog" ? "Catalog fallback" : "Configured"}</span>
                    {model.contextWindowTokens !== undefined && <span>{Math.round(model.contextWindowTokens / 1000)}k context</span>}
                    {!model.selectable && <span className="model-unavailable">{model.unavailableReason ?? "Unavailable"}</span>}
                  </span>
                </button>
              );
            })}
            {!catalog.models.some(model => `${model.displayName} ${model.id}`.toLowerCase().includes(search.toLowerCase())) && <p className="model-empty">No models match this search.</p>}
          </div>
        )}
    </Modal>
  );
}

function MessageComposer({
  busy,
  running = false,
  stopping = false,
  sendDisabled = false,
  placeholder,
  footerControls,
  onSubmit,
  pendingSteers = [],
  onSteer,
  onQueue,
  onInterrupt,
  autoFocus = false,
  showHint = true,
}: {
  busy: boolean;
  running?: boolean;
  stopping?: boolean;
  sendDisabled?: boolean;
  placeholder: string;
  onSubmit: (content: string) => Promise<boolean>;
  pendingSteers?: readonly { readonly messageId: string; readonly content: string }[];
  onSteer?: (content: string) => Promise<boolean>;
  onQueue?: (content: string) => boolean;
  onInterrupt?: () => Promise<void>;
  footerControls?: ReactNode;
  autoFocus?: boolean;
  showHint?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [commandMenuClosed, setCommandMenuClosed] = useState(false);
  const [runSendOptionsOpen, setRunSendOptionsOpen] = useState(false);
  const inspection = slashCommands.inspect(draft);
  const candidates = !running && inspection.kind === "candidates" && !commandMenuClosed ? inspection.candidates : [];
  const activeCandidate = candidates[Math.min(selectedCommand, candidates.length - 1)];

  async function submit(content = draft) {
    if (busy || !content.trim()) return;
    if (running) {
      setRunSendOptionsOpen(true);
      return;
    }
    const submittedDraft = draft;
    if (await onSubmit(content)) {
      setDraft((current) => current === submittedDraft ? "" : current);
      setCommandMenuClosed(false);
      setSelectedCommand(0);
    }
  }
  async function chooseSteer() {
    if (!onSteer || busy || !draft.trim()) return;
    const submittedDraft = draft;
    if (await onSteer(submittedDraft)) {
      setDraft((current) => current === submittedDraft ? "" : current);
      setRunSendOptionsOpen(false);
    }
  }
  function chooseQueue() {
    if (!onQueue || !draft.trim()) return;
    const submittedDraft = draft;
    if (onQueue(submittedDraft)) {
      setDraft((current) => current === submittedDraft ? "" : current);
      setRunSendOptionsOpen(false);
    }
  }
  return (
    <>
      {running && pendingSteers.length > 0 && <div className="pending-steers" aria-label="Pending Steer messages">
        <strong>Steer · waiting for next model call</strong>
        <ol>{pendingSteers.map((item, index) => <li key={item.messageId}>{index + 1}. {item.content}</li>)}</ol>
      </div>}
      {candidates.length > 0 && (
        <div className="command-candidates" role="listbox" aria-label="Available commands">
          {candidates.map((candidate, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === Math.min(selectedCommand, candidates.length - 1)}
              className={`command-candidate ${index === Math.min(selectedCommand, candidates.length - 1) ? "active" : ""}`}
              key={candidate.name}
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void submit(candidate.usage)}
            >
              <span className="command-candidate-name">{candidate.usage}</span>
              <span className="command-candidate-description">{candidate.description}</span>
            </button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <textarea
          aria-label="Message the Goal"
          aria-keyshortcuts="Enter Shift+Enter"
          title={running ? "This Run is in progress." : "Enter to send · Shift + Enter for a new line"}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={draft}
          disabled={busy || (running && stopping)}
          onChange={(event) => {
            setDraft(event.target.value);
            setSelectedCommand(0);
            setCommandMenuClosed(false);
          }}
          onKeyDown={(event) => {
            if (candidates.length > 0 && !event.nativeEvent.isComposing) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedCommand((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (activeCandidate !== undefined) void submit(activeCandidate.usage);
                return;
              }
            }
            if (event.key === "Escape" && candidates.length > 0) {
              event.preventDefault();
              setCommandMenuClosed(true);
              return;
            }
            if (event.key === "Escape" && runSendOptionsOpen) {
              event.preventDefault();
              setRunSendOptionsOpen(false);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-tools">
          <div className="composer-controls">
            {footerControls}
          </div>
          {running && runSendOptionsOpen && draft.trim() ? (
            <div className="run-send-options" role="group" aria-label="Choose message action">
              <button type="button" disabled={busy} onClick={() => void chooseSteer()}>Steer</button>
              <button type="button" disabled={busy} onClick={chooseQueue}>Queue</button>
            </div>
          ) : (
            <button
              type={running ? "button" : "submit"}
              className={`send ${running ? "is-running" : ""} ${running && stopping ? "is-stopping" : ""}`}
              aria-label={running ? stopping ? "Stopping Run" : draft.trim() ? "Choose Steer or Queue" : "Interrupt Run" : busy ? "Sending message" : "Send message"}
              title={running ? stopping ? "Stopping Run" : draft.trim() ? "Choose Steer or Queue" : "Interrupt this Run" : undefined}
              disabled={busy || (running && stopping) || sendDisabled || (!running && !draft.trim())}
              onClick={running ? () => draft.trim() ? setRunSendOptionsOpen(true) : void onInterrupt?.() : undefined}
            >
              {running
                ? <>{stopping ? <span className="run-spinner stopping" aria-hidden="true" /> : <span className="run-spinner" aria-hidden="true" />}{stopping ? "Stopping" : "Running"}</>
                : busy ? <span className="loading-mark small" /> : <ArrowUp size={16} />}
            </button>
          )}
        </div>
      </form>
      {showHint && <div className="composer-hint">Enter to send · Shift + Enter for a new line</div>}
    </>
  );
}

type BrowserInputDispatch =
  | { readonly kind: "text"; readonly content: string }
  | { readonly kind: "plan" }
  | { readonly kind: "model" }
  | { readonly kind: "error"; readonly message: string };

async function dispatchBrowserInput(input: string): Promise<BrowserInputDispatch> {
  const result = await slashCommands.dispatch(input);
  switch (result.kind) {
    case "text":
      return { kind: "text", content: input };
    case "escaped_text":
      return { kind: "text", content: result.content };
    case "rejected":
      return { kind: "error", message: result.message };
    case "executed":
      return result.effect.kind === "enter_plan_mode" ? { kind: "plan" } : { kind: "model" };
  }
}

function InboxIcon() {
  return <div className="empty-icon"><Folder size={26} /></div>;
}

function committedStepCount(value: BrowserGoalSession): number {
  return value.runs.reduce((total, run) => total + run.steps.length, 0);
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function errorMessage(error: unknown): string {
  if (error instanceof BrowserApiError) {
    switch (error.code) {
      case "unauthorized": return "This browser link has expired. Restart `lazygoal web` and open its new link.";
      case "goal_busy": return "Another Goal is still active. Wait for it to stop at a waiting point.";
      case "plan_mode_busy": return "Plan Mode can only be selected before this Run starts or after it completes or fails.";
      case "plan_mode_failed": return "The local service could not save the Plan Mode selection.";
      case "model_not_selectable": return "This model is unavailable. Choose another model from the current provider.";
      case "model_switch_not_allowed": return "This Run cannot change models at its current step.";
      case "model_catalog_authentication": return "Model catalog authentication failed. Check the provider credentials.";
      case "model_catalog_permission": return "The provider denied access to its model catalog.";
      case "model_catalog_protocol": return "The provider returned an invalid model catalog.";
      case "model_catalog_unavailable": return "The model catalog is unavailable. Retry after the provider connection recovers.";
      case "model_selection_failed": return "The local service could not save this model selection.";
      case "model_restore_failed": return "The saved model binding could not be restored. This Run was not advanced.";
      case "invalid_model_selection": return "Choose a valid model from this list.";
      case "goal_not_found": return "This Goal is no longer available in the current workspace.";
      case "stale_run":
      case "stale_request":
      case "action_not_waiting":
      case "goal_not_waiting": return "The session changed. The latest saved state is being loaded.";
      case "structured_interaction_required": return "Use the answer or approval form shown for this request.";
      case "request_too_large": return "This request is too long. Shorten it and try again.";
      case "goal_id_conflict": return "A Goal with this request identity already exists.";
      case "invalid_plan_mode_command": return "This session cannot change Plan Mode because its Run identity is invalid.";
      case "invalid_goal_input":
      case "invalid_message": return "Enter a non-empty Goal or message.";
      default: return `The local service could not complete this request (${error.code}).`;
    }
  }
  if (error instanceof Error && error.message === "browser_session_token_missing") {
    return "Open the local link printed by `lazygoal web` to connect this board.";
  }
  if (error instanceof Error && error.message === "Failed to fetch") {
    return "Could not reach the local service. Check that LazyGoal is still running, then retry.";
  }
  return "Could not load the latest saved state. Retry to reconnect.";
}

createRoot(document.getElementById("root")!).render(<App />);
