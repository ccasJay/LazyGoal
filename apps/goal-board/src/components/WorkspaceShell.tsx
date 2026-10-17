import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Folder, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Search, Settings, SquarePen, X } from "lucide-react";
import { browserApi } from "../api";
import { Modal } from "../modal";
import markOnLight from "../assets/lazygoal/mark-on-light.svg?no-inline";
import logoOnLight from "../assets/lazygoal/logo-on-light.svg?no-inline";
import { GoalSessionProvider } from "../context/GoalSessionContext";
import { RunControlProvider } from "../context/RunControlContext";
import { useGoalBoardApp } from "../hooks/useGoalBoardApp";
import { statusClass, statusFromRun } from "../types";
import { GoalSession } from "./GoalSession";
import { GoalSearch } from "./GoalSearch";
import { ModelPicker } from "./ModelPicker";
import { ResizableSidebar } from "./ResizableSidebar";
import { SettingsPage } from "./SettingsPage";

/** 工作区导航与当前会话的展示外壳；沿用当前服务的唯一执行目录和既有会话生命周期。 */
export function WorkspaceShell() {
  const app = useGoalBoardApp();
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => { setMobile(media.matches); setCollapsed(media.matches); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [recentOpen, setRecentOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState("Ctrl K");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    settingsHeading.current?.focus();
    return () => { (settingsButton.current ?? sidebarToggle.current)?.focus(); };
  }, [settingsOpen]);

  useEffect(() => {
    setSearchShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('dialog[open]:not(.workspace-sidebar-dialog)') && !searchOpen) return;
      event.preventDefault();
      if (mobile) setCollapsed(true);
      setSearchOpen(value => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, mobile]);
  const context = app.workspaceContext;
  const workspacePath = context?.worktreeRoot ?? context?.workspaceRoot;
  const workspaceName = workspacePath?.split(/[\\/]/).filter(Boolean).at(-1) ?? "Workspace";
  const goals = app.goals.filter(goal => !goal.archived);
  const recent = goals.slice(0, 8);
  const openBoard = () => { setSettingsOpen(false); app.closeSession(); if (mobile) setCollapsed(true); };
  const selectGoal = (goalId: string) => { setSettingsOpen(false); app.selectGoal(goalId); if (mobile) setCollapsed(true); };

  const navigation = (
    <div className="workspace-sidebar-content" id="workspace-navigation">
            <div className="workspace-brand-row">
              <button className="sidebar-brand" aria-label="Open Board" onClick={openBoard}>
                <picture className="brand-logo"><source media="(max-width: 760px)" srcSet={markOnLight} /><img className="sidebar-full-logo" src={logoOnLight} alt="LazyGoal" width={124} height={30} /></picture>
              </button>
              <button className="icon workspace-mobile-close" aria-label="Close sidebar" data-modal-autofocus onClick={() => setCollapsed(true)}><X size={17} /></button>
            </div>
            <details className="workspace-details" onKeyDown={event => {
              if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
            }}>
              <summary className="workspace-project-name" title={workspacePath ?? "Current workspace"} aria-label={`Workspace details: ${workspaceName}`}>
                <span className="project-symbol">{workspaceName[0]?.toUpperCase()}</span>
                <span className="project-name-text sidebar-label">{workspaceName}</span>
                <ChevronDown size={14} className="workspace-details-chevron sidebar-label" />
              </summary>
              <div className="workspace-popover">
                <strong>Current workspace</strong>
                <dl><dt>Directory</dt><dd>{context?.workspaceRoot ?? "Workspace unavailable"}</dd><dt>Branch</dt><dd>{context?.branch ?? (context === null ? "Branch unavailable" : context.worktreeRoot === null ? "No Git branch" : "Detached HEAD")}</dd></dl>
                <p>Goals execute in this directory.</p>
              </div>
            </details>
            <div className="workspace-quick-actions">
              <button className="workspace-search" title={`Search goals (${searchShortcut})`} aria-label="Search all goals" aria-haspopup="dialog" aria-expanded={searchOpen} aria-keyshortcuts="Meta+K Control+K" onClick={() => { if (mobile) setCollapsed(true); setSearchOpen(true); }}>
                <Search size={16} /><span className="sidebar-label">Search goals</span><kbd className="sidebar-label">{searchShortcut}</kbd>
              </button>
              <button className="workspace-new-goal primary" aria-current={!settingsOpen && app.draftSessionOpen ? "page" : undefined} aria-label="New goal" title="New goal" onClick={() => { setSettingsOpen(false); app.openNewGoalDraft(); if (mobile) setCollapsed(true); }} disabled={!browserApi.hasAccessToken}>
                <SquarePen size={16} /><span className="sidebar-label">New goal</span>
              </button>
            </div>
            <nav className="workspace-nav" aria-label="Main navigation">
              <p className="sidebar-section-label">Workspace</p>
              <button aria-label="All goals" aria-current={settingsOpen || app.draftSessionOpen ? undefined : app.sessionVisible ? "location" : "page"} onClick={openBoard} title="All goals">
                <LayoutDashboard size={16} /><span>Goals</span><small>{goals.length}</small>
              </button>
            </nav>
            <div className="workspace-projects">
              <button className="sidebar-section-toggle" aria-expanded={recentOpen} aria-controls="sidebar-recent-goals" onClick={() => setRecentOpen(value => !value)}>
                <ChevronRight size={12} /><span>Recent goals</span>
              </button>
              {recentOpen && <nav className="workspace-recent" id="sidebar-recent-goals" aria-label="Recent goals">
                {recent.map(goal => <button key={goal.goalId} aria-current={!settingsOpen && app.selectedGoalId === goal.goalId ? "page" : undefined} title={goal.intent} onClick={() => selectGoal(goal.goalId)}>
                  <span className={`status-dot ${statusClass(statusFromRun(goal.runStatus))}`} /><span className="recent-title">{goal.intent}</span>
                </button>)}
                {recent.length === 0 && <p className="sidebar-empty">No recent goals yet.</p>}
              </nav>}
            </div>
            <footer className="workspace-sidebar-footer">
              <button ref={settingsButton} className="workspace-settings" aria-current={settingsOpen ? "page" : undefined} onClick={() => { setSettingsOpen(true); if (mobile) setCollapsed(true); }}>
                <Settings size={16} aria-hidden="true" /><span>Settings</span>
              </button>
            </footer>
    </div>
  );

  return (
    <GoalSessionProvider value={app.sessionContextValue}>
      <RunControlProvider value={app.runControlContextValue}>
        <div className={`workspace-shell ${collapsed ? "is-collapsed" : ""}`}>
          {mobile ? (!collapsed && <Modal label="Workspace navigation" className="workspace-sidebar workspace-sidebar-dialog" onClose={() => setCollapsed(true)}>{navigation}</Modal>) : <ResizableSidebar hidden={collapsed}>{navigation}</ResizableSidebar>}
          <main className="workspace-main">
            <div className="workspace-canvas">
              <div className="main project-view">
                <header className="topbar">
                  <div className="topbar-identity">
                    <button ref={sidebarToggle} className="icon workspace-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Show sidebar" : "Hide sidebar"} aria-expanded={!collapsed} aria-controls="workspace-navigation" onClick={() => setCollapsed(value => !value)}>
                      {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
                    </button>
                    {settingsOpen ? <h1 ref={settingsHeading} tabIndex={-1}>Settings</h1> : app.sessionVisible ? <div className="breadcrumb"><button onClick={app.closeSession}>Goals</button><ChevronRight size={13} /><strong className="breadcrumb-current">{app.activeGoal?.intent ?? "New goal"}</strong></div> : <h1>Goals</h1>}
                  </div>
                  <div className="header-actions">
                    {settingsOpen && <button className="settings-back" onClick={() => setSettingsOpen(false)}><ArrowLeft size={15} />{app.sessionVisible ? "Back to goal" : "Back to goals"}</button>}
                    {!settingsOpen && app.isCurrentGoalSelected && <button className="goal-info-toggle" aria-label="Goal information and permissions" onClick={() => app.setGoalInfoOpen(true)}>Goal info</button>}
                    {!settingsOpen && app.sessionVisible && <button className="icon" title="Back to goals" aria-label="Close session" onClick={app.closeSession}><X size={17} /></button>}
                    {!settingsOpen && !app.sessionVisible && <span className="workspace-heading-location" title={workspacePath}><Folder size={14} />{workspaceName}</span>}
                  </div>
                </header>
                {settingsOpen && <SettingsPage />}
                <div className={`content ${app.sessionVisible ? "session-open" : ""}`} hidden={settingsOpen}>
                  {app.sessionVisible && app.manageError && <div className="manage-error-overlay" role="alert">{app.manageError}<button onClick={app.onClearManageError}>Dismiss</button></div>}
                  {!app.sessionVisible && app.goalBoardElement}
                  {app.sessionVisible && <GoalSession activeGoal={app.activeGoal} boardContent={app.goalBoardElement} renderPermissionControl={app.renderPermissionControl} onRevokeToolGrant={app.revokeToolGrant} onDeleteGoal={app.onDeleteGoal} manageBusyId={app.manageBusyId} />}
                </div>
              </div>
            </div>
          </main>
          {searchOpen && <GoalSearch goals={app.goals} onSelect={selectGoal} onClose={() => setSearchOpen(false)} />}
          {app.modelPickerTarget !== null && <ModelPicker key={app.modelPickerTarget.kind === "draft" ? "draft" : `${app.modelPickerTarget.goalId}:${app.modelPickerTarget.runId}`} target={app.modelPickerTarget} selectedId={app.modelPickerTarget.kind === "draft" ? app.draftModelId : null} onSelect={app.onSelectModel} onClose={() => app.setModelPickerTarget(null)} onDone={app.onDoneModelPicker} />}
        </div>
      </RunControlProvider>
    </GoalSessionProvider>
  );
}
