import { Button } from "./ui/button";
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
import { SettingsPage } from "./SettingsPage";
import { SessionBoundary } from "./error-boundary";
import { WorkspaceContext } from "./WorkspaceContext";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { ResizablePanelGroup, ResizablePanel } from "./ui/resizable";
import { ResizableSidebar } from "./ResizableSidebar";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from "./ui/breadcrumb";

const ACTIVITY_WIDTH_COOKIE = "lazygoal_activity_width";

function readActivityWidthCookie(): string | undefined {
  const prefix = `${ACTIVITY_WIDTH_COOKIE}=`;
  return document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
}

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
  const [activityWidth, setActivityWidth] = useState<"standard" | "wide">(() => {
    try { return readActivityWidthCookie() === "wide" ? "wide" : "standard"; }
    catch { return "standard"; }
  });
  const [widthSaveError, setWidthSaveError] = useState<string | undefined>();
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);

  const changeActivityWidth = (width: "standard" | "wide") => {
    setActivityWidth(width);
    try {
      document.cookie = `${ACTIVITY_WIDTH_COOKIE}=${width}; path=/; max-age=31536000; samesite=strict`;
      if (readActivityWidthCookie() !== width) throw new Error("Preference cookie was not saved");
      setWidthSaveError(undefined);
    } catch {
      setWidthSaveError("Could not save this setting. It will reset when the page is reloaded.");
    }
  };

  useEffect(() => {
    if (!settingsOpen) return;
    settingsHeading.current?.focus();
    return () => { (settingsButton.current ?? sidebarToggle.current)?.focus(); };
  }, [settingsOpen]);

  useEffect(() => {
    setSearchShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('[role="dialog"]:not(.workspace-sidebar-dialog)') && !searchOpen) return;
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
              <Button variant="ghost" size="sm" className="sidebar-brand" aria-label="Open Board" onClick={openBoard}>
                <picture className="brand-logo"><source media="(max-width: 760px)" srcSet={markOnLight} /><img className="sidebar-full-logo" src={logoOnLight} alt="LazyGoal" width={124} height={30} /></picture>
              </Button>
              <Button variant="ghost" size="sm" className="icon workspace-mobile-close" aria-label="Close sidebar" data-modal-autofocus onClick={() => setCollapsed(true)}><X size={17} /></Button>
            </div>
            <Popover>
              <PopoverTrigger asChild><Button variant="ghost" className="workspace-project-name" title={workspacePath ?? "Current workspace"} aria-label={`Workspace details: ${workspaceName}`}>
                <span className="project-symbol">{workspaceName[0]?.toUpperCase()}</span>
                <span className="project-name-text sidebar-label">{workspaceName}</span>
                <ChevronDown size={14} className="workspace-details-chevron sidebar-label" />
              </Button></PopoverTrigger>
              <PopoverContent align="start" className="workspace-popover">
                <strong>Current workspace</strong>
                <dl><dt>Directory</dt><dd>{context?.workspaceRoot ?? "Workspace unavailable"}</dd><dt>Branch</dt><dd>{context?.branch ?? (context === null ? "Branch unavailable" : context.worktreeRoot === null ? "No Git branch" : "Detached HEAD")}</dd></dl>
                <p>Goals execute in this directory.</p>
              </PopoverContent>
            </Popover>
            <div className="workspace-quick-actions">
              <Button variant="ghost" size="sm" className="workspace-search" title={`Search goals (${searchShortcut})`} aria-label="Search all goals" aria-haspopup="dialog" aria-expanded={searchOpen} aria-keyshortcuts="Meta+K Control+K" onClick={() => { if (mobile) setCollapsed(true); setSearchOpen(true); }}>
                <Search size={16} /><span className="sidebar-label">Search goals</span><kbd className="sidebar-label">{searchShortcut}</kbd>
              </Button>
              <Button variant="ghost" size="sm" className="workspace-new-goal primary" aria-current={!settingsOpen && app.draftSessionOpen ? "page" : undefined} aria-label="New goal" title="New goal" onClick={() => { setSettingsOpen(false); app.openNewGoalDraft(); if (mobile) setCollapsed(true); }} disabled={!browserApi.hasAccessToken}>
                <SquarePen size={16} /><span className="sidebar-label">New goal</span>
              </Button>
            </div>
            <nav className="workspace-nav" aria-label="Main navigation">
              <Button variant="ghost" size="sm" aria-label="All goals" aria-current={settingsOpen || app.draftSessionOpen ? undefined : app.sessionVisible ? "location" : "page"} onClick={openBoard} title="All goals">
                <LayoutDashboard size={16} /><span>Goals</span><small>{goals.length}</small>
              </Button>
            </nav>
            <div className="workspace-projects">
              <Button variant="ghost" size="sm" className="sidebar-section-toggle" aria-expanded={recentOpen} aria-controls="sidebar-recent-goals" onClick={() => setRecentOpen(value => !value)}>
                <ChevronRight size={12} /><span>Recent goals</span>
              </Button>
              {recentOpen && <nav className="workspace-recent" id="sidebar-recent-goals" aria-label="Recent goals">
                {recent.map(goal => <Button variant="ghost" size="sm" key={goal.goalId} aria-current={!settingsOpen && app.selectedGoalId === goal.goalId ? "page" : undefined} title={goal.intent} onClick={() => selectGoal(goal.goalId)}>
                  <span className={`status-dot ${statusClass(statusFromRun(goal.runStatus))}`} /><span className="recent-title">{goal.intent}</span>
                </Button>)}
                {recent.length === 0 && <p className="sidebar-empty">No recent goals yet.</p>}
              </nav>}
            </div>
            <footer className="workspace-sidebar-footer">
              <Button variant="ghost" size="sm" ref={settingsButton} className="workspace-settings" aria-current={settingsOpen ? "page" : undefined} onClick={() => { setSettingsOpen(true); if (mobile) setCollapsed(true); }}>
                <Settings size={16} aria-hidden="true" />
                <span>Settings</span>
              </Button>
            </footer>
    </div>
  );

  return (
    <GoalSessionProvider value={app.sessionContextValue}>
      <RunControlProvider value={app.runControlContextValue}>
        <ResizablePanelGroup direction="horizontal" style={{ height: "100dvh" }} className={`workspace-shell ${collapsed ? "is-collapsed" : ""}`} data-activity-width={activityWidth}>
          {mobile ? <Sheet open={!collapsed} onOpenChange={open => setCollapsed(!open)}><SheetContent showCloseButton={false} side="left" className="workspace-sidebar workspace-sidebar-dialog" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); sidebarToggle.current?.focus(); }}><SheetTitle className="sr-only">Workspace navigation</SheetTitle>{navigation}</SheetContent></Sheet> : <ResizableSidebar hidden={collapsed}>{navigation}</ResizableSidebar>}
          <ResizablePanel minSize={30} className="min-w-0">
          <main className="workspace-main">
            <div className="workspace-canvas">
              <div className="main project-view">
                <header className="topbar">
                  <div className="topbar-identity">
                    <Button variant="ghost" size="sm" ref={sidebarToggle} className="icon workspace-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Show sidebar" : "Hide sidebar"} aria-expanded={!collapsed} aria-controls="workspace-navigation" onClick={() => setCollapsed(value => !value)}>
                      {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
                    </Button>
                    {settingsOpen ? <h1 ref={settingsHeading} tabIndex={-1}>Settings</h1> : app.sessionVisible ? <Breadcrumb><BreadcrumbList><BreadcrumbItem><Button variant="ghost" size="sm" onClick={app.closeSession}>Goals</Button></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage className="breadcrumb-current truncate">{app.activeGoal?.intent ?? "New goal"}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb> : <h1>Goals</h1>}
                  </div>
                  <div className="header-actions">
                    {!settingsOpen && app.sessionVisible && <WorkspaceContext context={app.workspaceContext} error={app.sessionContextValue.workspaceContextError} />}
                    {settingsOpen && <Button variant="ghost" size="sm" className="settings-back" onClick={() => setSettingsOpen(false)}><ArrowLeft size={15} />{app.sessionVisible ? "Back to goal" : "Back to goals"}</Button>}
                    {!settingsOpen && app.isCurrentGoalSelected && <Button variant="ghost" size="sm" className="goal-info-toggle" aria-label="Goal information and permissions" onClick={() => app.setGoalInfoOpen(true)}>Goal info</Button>}
                    {!settingsOpen && app.sessionVisible && <Button variant="ghost" size="sm" className="icon" title="Back to goals" aria-label="Close session" onClick={app.closeSession}><X size={17} /></Button>}
                    {!settingsOpen && !app.sessionVisible && <span className="workspace-heading-location" title={workspacePath}><Folder size={14} />{workspaceName}</span>}
                  </div>
                </header>
                {settingsOpen && <SettingsPage activityWidth={activityWidth} onActivityWidthChange={changeActivityWidth} widthSaveError={widthSaveError} />}
                <div className={`content ${app.sessionVisible ? "session-open" : ""}`} hidden={settingsOpen}>
                  <SessionBoundary label="Board and session content" onReload={() => window.location.reload()}>
                  {app.sessionVisible && app.manageError && <div className="manage-error-overlay" role="alert">{app.manageError}<Button variant="ghost" size="sm" onClick={app.onClearManageError}>Dismiss</Button></div>}
                  {!app.sessionVisible && app.goalBoardElement}
                  {app.sessionVisible && <GoalSession activeGoal={app.activeGoal} goals={app.goals} draftText={app.draftText} onDraftTextChange={app.setDraftText}
                    onSelectGoal={selectGoal} onViewGoals={openBoard} boardContent={app.goalBoardElement} renderPermissionControl={app.renderPermissionControl}
                    onRevokeToolGrant={app.revokeToolGrant} onDeleteGoal={app.onDeleteGoal} manageBusyId={app.manageBusyId} />}
                  </SessionBoundary>
                </div>
              </div>
            </div>
          </main>
          </ResizablePanel>
          {searchOpen && <GoalSearch goals={app.goals} onSelect={selectGoal} onClose={() => setSearchOpen(false)} />}
          {app.modelPickerTarget !== null && <ModelPicker key={app.modelPickerTarget.kind === "draft" ? "draft" : `${app.modelPickerTarget.goalId}:${app.modelPickerTarget.runId}`} target={app.modelPickerTarget} selectedId={app.modelPickerTarget.kind === "draft" ? app.draftModelId : null} onSelect={app.onSelectModel} onClose={() => app.setModelPickerTarget(null)} onDone={app.onDoneModelPicker} />}
        </ResizablePanelGroup>
      </RunControlProvider>
    </GoalSessionProvider>
  );
}
