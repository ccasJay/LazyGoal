import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Folder,
  GitBranch,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Shield,
  ChevronDown,
  Terminal,
  X,
  Zap,
} from "lucide-react";

import type {
  BrowserGoalInteractionCommand,
  BrowserGoalListItem,
  BrowserGoalSession,
  BrowserSessionMessage,
  BrowserToolGrantSummary,
  BrowserModelCatalog,
  BrowserModelOption,
  BrowserPermissionModeResult,
} from "../../../packages/browser/src/index";
import { createSlashCommandRegistry, modelCommandDefinition, planCommandDefinition } from "../../../packages/slash-command/src/index";
import type { ModelCommandEffect } from "../../../packages/slash-command/src/index";
import { BrowserApiError, browserApi } from "./api";
import { GoalDetails, runStatusLabel, WaitingInteraction } from "./panels";
import "./style.css";

type GoalStatus = "Ready" | "Running" | "Needs input" | "Completed" | "Stopped";
type SessionTab = "Activity" | "Plan" | "Details";
type BoardView = "board" | "list";

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
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [session, setSession] = useState<BrowserGoalSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [boardView, setBoardView] = useState<BoardView>("board");
  const [search, setSearch] = useState("");
  const [needsInputOnly, setNeedsInputOnly] = useState(false);
  const [sessionTab, setSessionTab] = useState<SessionTab>("Activity");
  const [expanded, setExpanded] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [width, setWidth] = useState(440);
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
  const [modelPickerTarget, setModelPickerTarget] = useState<ModelPickerTarget | null>(null);
  const [currentModelCatalog, setCurrentModelCatalog] = useState<BrowserModelCatalog | null>(null);
  const [modelCatalogRefreshKey, setModelCatalogRefreshKey] = useState(0);
  const draftGoalId = useRef<string | null>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const latestSession = useRef<BrowserGoalSession | null>(null);
  const activeGoal = goals.find((goal) => goal.goalId === selectedGoalId);
  const sessionVisible = activeGoal !== undefined || draftSessionOpen;
  const currentRun = session?.runs.find((run) => run.current);
  const visibleGoals = useMemo(() => goals.filter((goal) => {
    const matchesSearch = goal.intent.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (!needsInputOnly || goal.runStatus === "waiting");
  }), [goals, needsInputOnly, search]);
  const canSendText = session !== null
    && session.pendingInteraction === undefined
    && session.pendingAction === undefined
    && (session.runStatus === "waiting" || session.runStatus === "completed" || session.runStatus === "failed");
  const currentModelName = currentModelCatalog === null ? "Current model unavailable"
    : currentModelCatalog.models.find((model) => model.id === currentModelCatalog.currentModelId)?.displayName
      ?? currentModelCatalog.currentModelId;
  const canSwitchCurrentModel = session !== null
    && (session.runStatus === "waiting" || session.runStatus === "completed" || session.runStatus === "failed")
    && session.pendingAction === undefined;

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
        <div className="message-body">{message.content}</div>
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
      setExpanded(false);
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
    if (sessionTab !== "Details" || session === null || selectedGoalId === null) return;
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
  }, [sessionTab, session?.goalId, session?.currentRunId, selectedGoalId]);

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
                setLiveActivity("Runtime is working on this Goal");
                break;
              case "model_completed":
                setLiveActivity("Waiting for the saved result");
                break;
              case "step_started":
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
    setSelectedGoalId((current) => current === goalId ? null : goalId);
    setExpanded(false);
    setSessionTab("Activity");
  }

  function openNewGoalDraft() {
    setModelPickerTarget(null);
    draftGoalId.current = null;
    setDraftModelId(null);
    setSelectedGoalId(null);
    setDraftPlanMode(false);
    setDraftSessionOpen(true);
    setSessionTab("Activity");
    setExpanded(false);
    setCommandError(null);
  }

  function closeSession() {
    setModelPickerTarget(null);
    setSelectedGoalId(null);
    setDraftSessionOpen(false);
    setExpanded(false);
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
    setCommandBusy(true);
    setCommandError(null);
    try {
      const goalId = draftGoalId.current ?? crypto.randomUUID();
      draftGoalId.current = goalId;
      const result = await browserApi.createGoal({
        goalId,
        intent,
        ...(draftPlanMode ? { mode: "plan" as const } : {}),
        ...(draftModelId === null ? {} : { modelId: draftModelId }),
      });
      setDraftSessionOpen(false);
      setSelectedGoalId(result.goalId);
      await refreshGoals();
      return true;
    } catch (error) {
      setCommandError(errorMessage(error));
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

  async function chooseModel(target: ModelPickerTarget, modelId: string): Promise<void> {
    if (target.kind === "draft") {
      setDraftModelId(modelId);
      return;
    }
    try {
      await browserApi.selectModel(target.goalId, { runId: target.runId, modelId });
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
    ? ["Activity", "Details"]
    : ["Activity", "Plan", "Details"];

  return (
    <div className="app">
      {sidebar && (
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-icon"><Zap size={19} fill="currentColor" /></span>
            LazyGoal
            <button className="icon muted" aria-label="Hide sidebar" onClick={() => setSidebar(false)}>
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div className="workspace">
            <span className="workspace-avatar">LG</span>
            <div>Local workspace<small>Current project</small></div>
          </div>
          <div className="nav-label">Workspace</div>
          <button
            className={`nav ${!needsInputOnly ? "selected" : ""}`}
            onClick={() => setNeedsInputOnly(false)}
          >
            <LayoutGrid size={16} />
            All goals<span>{goals.length}</span>
          </button>
          <button
            className={`nav ${needsInputOnly ? "selected" : ""}`}
            onClick={() => setNeedsInputOnly((value) => !value)}
          >
            <CircleHelp size={16} />
            Needs input
            <span className="amber">{goals.filter((goal) => goal.runStatus === "waiting").length}</span>
          </button>
          <div className="sidebar-bottom">
            <div className="connection-label">
              <span className={`dot ${browserApi.hasAccessToken ? "connected" : ""}`} />
              {browserApi.hasAccessToken ? "Local Runtime" : "Not connected"}
            </div>
            <p>Goals and session history come from the current workspace.</p>
            <div className="profile">
              <span className="avatar">LG</span>
              <div>LazyGoal<small>Local session</small></div>
            </div>
          </div>
        </aside>
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            {!sidebar && (
              <button className="icon" aria-label="Show sidebar" onClick={() => setSidebar(true)}>
                <LayoutGrid size={16} />
              </button>
            )}
            <Folder size={15} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>Goals</strong>
            {activeGoal && <><ChevronRight size={13} /><strong className="breadcrumb-current">{activeGoal.intent}</strong></>}
          </div>
          <div className="header-actions">
            <span className={`runtime-state ${browserApi.hasAccessToken ? "connected" : ""}`}>
              <span className="dot" />
              {browserApi.hasAccessToken ? "Local Runtime" : "Preview only"}
            </span>
          </div>
        </header>
        <div className={`content ${sessionVisible ? "session-open" : ""}`}>
          {(!expanded || !sessionVisible) && (
            <section className="board-area">
              <div className="board-title">
                <div>
                  <h1>Goals <span>{goals.length}</span></h1>
                  <p>Choose a Goal to open its saved session.</p>
                </div>
                <button className="primary" onClick={openNewGoalDraft} disabled={!browserApi.hasAccessToken}>
                  <Plus size={15} /> New goal
                </button>
              </div>
              <div className="toolbar">
                <div className="view-switch" aria-label="Goal view">
                  <button aria-pressed={boardView === "board"} onClick={() => setBoardView("board")}>
                    <LayoutGrid size={14} /> Board
                  </button>
                  <button aria-pressed={boardView === "list"} onClick={() => setBoardView("list")}>
                    <List size={14} /> List
                  </button>
                </div>
                <button
                  className={`filter ${needsInputOnly ? "on" : ""}`}
                  aria-pressed={needsInputOnly}
                  onClick={() => setNeedsInputOnly((value) => !value)}
                >
                  <CircleHelp size={13} /> Needs input
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
                <button className="icon refresh-button" aria-label="Refresh goals" onClick={() => void refreshGoals()}>
                  <Clock3 size={14} />
                </button>
              </div>
              <div className="filter-row">
                <span>{visibleGoals.length} matching goals</span>
                {(search || needsInputOnly) && (
                  <button onClick={() => { setSearch(""); setNeedsInputOnly(false); }}>Clear filters</button>
                )}
              </div>
              {sessionError && selectedGoalId === null && (
                <div className="page-error" role="alert">
                  <span>{sessionError}</span>
                  {browserApi.hasAccessToken && <button onClick={() => void refreshGoals()}>Retry</button>}
                </div>
              )}
              {goalsLoading ? (
                <div className="board-empty"><span className="loading-mark" /><p>Loading saved Goals…</p></div>
              ) : goals.length === 0 && !sessionError ? (
                <div className="board-empty">
                  <InboxIcon />
                  <h2>No saved Goals yet</h2>
                  <p>Create a Goal to start a real session in this workspace.</p>
                  <button className="primary" onClick={openNewGoalDraft} disabled={!browserApi.hasAccessToken}><Plus size={14} /> New goal</button>
                </div>
              ) : visibleGoals.length === 0 && !sessionError ? (
                <div className="board-empty">
                  <Search size={26} />
                  <h2>No matching Goals</h2>
                  <p>Clear the search or input filter to see saved Goals.</p>
                </div>
              ) : boardView === "list" ? (
                <div className="goal-table">
                  <div className="list-heading"><span>Goal</span><span>Status</span><span>Updated</span></div>
                  {visibleGoals.map((goal) => <GoalRow
                    key={goal.goalId}
                    goal={goal}
                    selected={selectedGoalId === goal.goalId}
                    onSelect={() => toggleGoalSelection(goal.goalId)}
                  />)}
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
                            selected={selectedGoalId === goal.goalId}
                            onSelect={() => toggleGoalSelection(goal.goalId)}
                          />)}
                          {statusGoals.length === 0 && <div className="empty-column">No goals here</div>}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
              <footer className="board-footer">
                <span><span className="dot blue" />{goals.filter((goal) => goal.runStatus === "running").length} running</span>
                <span>Select a Goal to open its session <ChevronRight size={12} /></span>
              </footer>
            </section>
          )}
          {sessionVisible && (
            <>
              <div
                className="resize-handle"
                role="separator"
                aria-label="Resize session"
                aria-orientation="vertical"
                aria-valuenow={width}
                aria-valuemin={340}
                aria-valuemax={720}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  setWidth((current) => Math.max(340, Math.min(720, current + (event.key === "ArrowLeft" ? 20 : -20))));
                }}
                onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    setWidth(Math.max(340, Math.min(720, window.innerWidth - event.clientX)));
                  }
                }}
                onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
              />
              <section className={`session ${expanded ? "expanded" : ""}`} style={{ width: expanded ? "100%" : width }}>
                <header className="session-header">
                  <span>
                    {activeGoal
                      ? <><span className={`status-dot ${statusClass(statusFromRun(activeGoal.runStatus))}`} />{activeGoal.goalId.slice(0, 12)}</>
                      : <><span className="status-dot ready" />New conversation</>}
                    <ChevronRight size={12} /> Session
                  </span>
                  <div>
                    <button className="icon" aria-label={expanded ? "Collapse session" : "Expand session"} onClick={() => setExpanded((value) => !value)}>
                      {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                    <button className="icon" aria-label="Close session" onClick={closeSession}><X size={17} /></button>
                  </div>
                </header>
                {draftSessionOpen ? (
                  <>
                    <div className="session-intro">
                      <h2>New conversation</h2>
                      <div>
                        <span className="status-pill ready"><span className="status-dot" />Draft · not saved</span>
                        <span><GitBranch size={12} />{draftPlanMode ? "Plan Mode" : "Normal Mode"}</span>
                      </div>
                    </div>
                    <div className="session-tabs">
                      <div className="session-tab-buttons"><button aria-pressed="true">Activity</button></div>
                      <span className="stream-state"><span className="dot" />Local Runtime</span>
                    </div>
                    <div className="timeline draft-timeline">
                      <div className="timeline-date"><span />No saved messages<span /></div>
                      <p>Send your first message to create a Goal and start the session. Use <code>/plan</code> for Plan Mode or <code>/model</code> to choose a model.</p>
                    </div>
                    {commandError && (
                      <div className="command-error" role="alert">
                        <span>{commandError}</span>
                        <button aria-label="Dismiss error" onClick={() => setCommandError(null)}><X size={13} /></button>
                      </div>
                    )}
                    <div className="composer-area">
                      <button className="model-shortcut" type="button" disabled={commandBusy} onClick={() => setModelPickerTarget({ kind: "draft" })}>
                        Model{draftModelId === null ? "" : ` · ${draftModelId}`}
                      </button>
                      <MessageComposer
                        key="new-goal-draft"
                        autoFocus
                        busy={commandBusy}
                        placeholder="Message LazyGoal…"
                        footerControls={renderPermissionControl(false)}
                        onSubmit={submitDraftMessage}
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
                    <div className="session-intro">
                      <h2>{session.intent}</h2>
                      <div>
                        <span className={`status-pill ${statusClass(statusFromRun(session.runStatus))}`}>
                          <span className="status-dot" />{runStatusLabel(session.runStatus)}
                        </span>
                        <span><GitBranch size={12} /> {session.currentRunId}</span>
                        <span className={`mode-badge ${session.currentRunMode === "plan" || session.nextRunMode === "plan" ? "plan" : ""}`}>
                          {session.nextRunMode === "plan" ? "Next Run · Plan Mode" : `${session.currentRunMode === "plan" ? "Plan" : "Normal"} Mode`}
                        </span>
                        <span><Clock3 size={12} /> {currentRun?.stepCount ?? 0} runtime steps</span>
                      </div>
                    </div>
                    <div className="session-tabs">
                      <div className="session-tab-buttons">
                        {sessionTabs.map((tab) => (
                          <button key={tab} aria-pressed={sessionTab === tab} onClick={() => setSessionTab(tab)}>{tab}</button>
                        ))}
                      </div>
                      <span className={`stream-state ${streamConnected ? "connected" : ""}`}>
                        <span className="dot" />{streamConnected ? "Live" : "Reconnecting"}
                      </span>
                    </div>
                    {sessionTab !== "Activity" ? (
                      <GoalDetails
                        session={session}
                        tab={sessionTab}
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
                            Committed steps
                          </label>
                          <span>{session.messages.length} saved messages</span>
                        </div>
                        <div
                          className="timeline"
                          ref={timeline}
                          onScroll={(event) => {
                            const element = event.currentTarget;
                            setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 60);
                          }}
                        >
                          {session.historyTruncated && <div className="history-note">Some earlier history is omitted.</div>}
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
                                  <section className="run-steps">
                                    <h3>{run.current ? "Current Run · committed steps" : `Earlier Run · ${run.runId}`}</h3>
                                    {run.steps.map((step) => (
                                      <details className="tool-event" key={step.executionUnitId}>
                                        <summary>
                                          <Terminal size={13} />
                                          <span>{step.toolId ?? step.decisionKind ?? `Step ${step.stepIndex}`}</span>
                                          <span className={`step-status ${step.status}`}>{step.status}</span>
                                          <ChevronRight className="tool-chevron" size={13} />
                                        </summary>
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
                                      </details>
                                    ))}
                                  </section>
                                )}
                                {run.current && liveText && (
                                  <article className="message assistant transient-message" aria-label="Uncommitted assistant activity">
                                    <div className="message-heading">
                                      <span className="message-avatar assistant"><Zap size={12} /></span>
                                      <strong>Live response</strong><small>Not saved yet</small>
                                    </div>
                                    <div className="message-body">{liveText}<span className="cursor" /></div>
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
                      </>
                    )}
                    {sessionTab === "Activity" && !follow && (
                      <button className="jump" onClick={() => setFollow(true)}><ArrowDown size={13} /> Back to latest</button>
                    )}
                    {commandError && (
                      <div className="command-error" role="alert">
                        <span>{commandError}</span>
                        <button aria-label="Dismiss error" onClick={() => setCommandError(null)}><X size={13} /></button>
                      </div>
                    )}
                    <div className="composer-area">
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
                      {(session.runStatus === "completed" || session.runStatus === "failed") && session.pendingInteraction === undefined && session.pendingAction === undefined && (
                        <MessageComposer
                          key={`${session.currentRunId}:continue`}
                          busy={commandBusy}
                          placeholder={session.runStatus === "failed" ? "Send a message to continue in a new Run…" : "Continue this Goal with a new task…"}
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
                      {session.runStatus === "running" && <><div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div><div className="composer-note">Wait for the current Run to reach a saved waiting point or finish.</div></>}
                      {session.runStatus === "created" && <><div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div><div className="composer-note">The Runtime is starting this Goal.</div></>}
                      {session.runStatus === "cancelled" && (
                        <><div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div><div className="composer-note">Text input is unavailable for this Run.</div></>
                      )}
                      {session.runStatus === "waiting" && session.pendingInteraction === undefined && session.pendingAction !== undefined && session.pendingAction.status === "approved" && (
                        <><div className="composer-extra-controls">{renderPermissionControl(true)}<CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} /></div><div className="composer-note">The approved action is being recorded.</div></>
                      )}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      {modelPickerTarget !== null && (
        <ModelPicker
          key={modelPickerTarget.kind === "draft" ? "draft" : `${modelPickerTarget.goalId}:${modelPickerTarget.runId}`}
          target={modelPickerTarget}
          selectedId={modelPickerTarget.kind === "draft" ? draftModelId : null}
          onSelect={(modelId) => chooseModel(modelPickerTarget, modelId)}
          onClose={() => setModelPickerTarget(null)}
          onDone={() => setModelPickerTarget((current) => current === modelPickerTarget ? null : current)}
        />
      )}
    </div>
  );
}

function PermissionControl({
  open,
  onToggle,
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
  return (
    <div className="permission-control">
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
        <header>
          <strong>Project permissions</strong>
          <span>Applies to local Goals in this project</span>
        </header>
        <fieldset className="permission-modes" disabled={modeBusy || mode === null}>
          <legend>Execution mode</legend>
          <label className={mode === "default" ? "selected" : ""}>
            <input type="radio" name="project-permission-mode" checked={mode === "default"} onChange={() => onChooseMode("default")} />
            <span><strong>Default</strong><small>Review actions that need approval.</small></span>
          </label>
          <label className={mode === "yolo" ? "selected" : ""}>
            <input type="radio" name="project-permission-mode" checked={mode === "yolo"} onChange={() => onChooseMode("yolo")} />
            <span><strong>YOLO</strong><small>Automatically approve eligible tools. Sandbox limits still apply.</small></span>
          </label>
        </fieldset>
        {modeError && <p className="permission-error" role="alert">{modeError}</p>}
        <div className="permission-grants">
          <h4>Saved permissions</h4>
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
      title={label}
      onClick={onClick}
    >
      <span>Model</span><strong>{label}</strong>{enabled && <ChevronDown size={11} />}
    </button>
  );
}

function GoalCard({
  goal,
  selected,
  onSelect,
}: {
  goal: BrowserGoalListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = statusFromRun(goal.runStatus);
  return (
    <button className={`goal-card ${selected ? "is-selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <div className="card-meta">
        <span>{goal.goalId.slice(0, 12)}</span>
        {status === "Running" ? <span className="live-mini"><span />Live</span>
          : status === "Completed" ? <Check size={13} />
            : status === "Needs input" ? <CircleHelp size={13} className="amber" />
              : <MoreHorizontal size={15} />}
      </div>
      <h3>{goal.intent}</h3>
      <p>{status === "Needs input" ? "Waiting for a response or approval." : `Run ${goal.runId}`}</p>
      <div className="card-footer">
        <span className={`status-pill ${statusClass(status)}`}><span className="status-dot" />{status}</span>
        <time dateTime={goal.updatedAt} title={goal.updatedAt}>{formatUpdatedAt(goal.updatedAt)}</time>
      </div>
    </button>
  );
}

function GoalRow({
  goal,
  selected,
  onSelect,
}: {
  goal: BrowserGoalListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = statusFromRun(goal.runStatus);
  return (
    <button className={`goal-row ${selected ? "active" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <span><small>{goal.goalId.slice(0, 12)}</small><strong>{goal.intent}</strong></span>
      <span className={`status-pill ${statusClass(status)}`}><span className="status-dot" />{status}</span>
      <time dateTime={goal.updatedAt}>{formatUpdatedAt(goal.updatedAt)}</time>
    </button>
  );
}

function ModelPicker({ target, selectedId, onSelect, onClose, onDone }: {
  target: ModelPickerTarget;
  selectedId: string | null;
  onSelect: (modelId: string) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [catalog, setCatalog] = useState<BrowserModelCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);

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
      await onSelect(model.id);
      if (mounted.current) onDone();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  return (
    <div className="model-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="model-picker" role="dialog" aria-modal="true" aria-label="Choose model" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
        <div className="model-picker-head">
          <div><h2>Choose model</h2><p>Models available from the current provider</p></div>
          <button className="icon" type="button" aria-label="Close model picker" onClick={onClose}><X size={17} /></button>
        </div>
        {catalog !== null && <p className="model-provider">Provider · {catalog.provider}</p>}
        {catalog === null && error === null && <p className="model-loading"><span className="loading-mark small" /> Loading models…</p>}
        {error !== null && <p className="model-error" role="alert">{error}</p>}
        {catalog !== null && (
          <div className="model-list" role="list">
            {catalog.models.map((model) => {
              const current = (selectedId ?? catalog.currentModelId) === model.id;
              return (
                <button key={model.id} type="button" role="listitem" className={`model-option ${current ? "current" : ""}`} disabled={!model.selectable || busyId !== null} onClick={() => void pick(model)}>
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
            {catalog.models.length === 0 && <p className="model-empty">No selectable models were found for this provider.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function MessageComposer({
  busy,
  placeholder,
  footerControls,
  onSubmit,
  autoFocus = false,
}: {
  busy: boolean;
  placeholder: string;
  onSubmit: (content: string) => Promise<boolean>;
  footerControls?: ReactNode;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [commandMenuClosed, setCommandMenuClosed] = useState(false);
  const inspection = slashCommands.inspect(draft);
  const candidates = inspection.kind === "candidates" && !commandMenuClosed ? inspection.candidates : [];
  const activeCandidate = candidates[Math.min(selectedCommand, candidates.length - 1)];

  async function submit(content = draft) {
    if (busy || !content.trim()) return;
    const submittedDraft = draft;
    if (await onSubmit(content)) {
      setDraft((current) => current === submittedDraft ? "" : current);
      setCommandMenuClosed(false);
      setSelectedCommand(0);
    }
  }
  return (
    <>
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
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={draft}
          disabled={busy}
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
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-tools">
          <div className="composer-controls">
            {footerControls}
            <span><Zap size={12} /> Local Runtime</span>
          </div>
          <button type="submit" className="send" aria-label="Send message" disabled={busy || !draft.trim()}>
            {busy ? <span className="loading-mark small" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </form>
      <div className="composer-hint">Enter to send · Shift + Enter for a new line</div>
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
