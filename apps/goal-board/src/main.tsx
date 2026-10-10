import { createRoot } from "react-dom/client";
import { ChevronRight, Folder, Plus, X, Zap } from "lucide-react";

import { browserApi } from "./api";
import { GoalSession } from "./components/GoalSession";
import { ModelPicker } from "./components/ModelPicker";
import { GoalSessionProvider } from "./context/GoalSessionContext";
import { RunControlProvider } from "./context/RunControlContext";
import { useGoalBoardApp } from "./hooks/useGoalBoardApp";
import "./style.css";

function App() {
  const app = useGoalBoardApp();

  return (
    <GoalSessionProvider value={app.sessionContextValue}>
      <RunControlProvider value={app.runControlContextValue}>
        <div className="app">
          <main className="main">
            <header className="topbar">
              <div className="topbar-identity">
                <button className="topbar-brand" aria-label="Open Board" onClick={app.closeSession}>
                  <span className="brand-icon"><Zap size={19} fill="currentColor" /></span>LazyGoal
                </button>
                <div className="breadcrumb">
                  <Folder size={15} />
                  <span>Workspace</span>
                  <ChevronRight size={13} />
                  <strong>Goals</strong>
                  {app.activeGoal && (
                    <>
                      <ChevronRight size={13} />
                      <strong className="breadcrumb-current">{app.activeGoal.intent}</strong>
                    </>
                  )}
                </div>
              </div>
              <div className="header-actions">
                {app.isCurrentGoalSelected && (
                  <button
                    className="goal-info-toggle"
                    aria-label="Goal information and permissions"
                    onClick={() => app.setGoalInfoOpen(true)}
                  >
                    Goal info
                  </button>
                )}
                {app.sessionVisible && (
                  <button className="icon" aria-label="Close session" onClick={app.closeSession}>
                    <X size={17} />
                  </button>
                )}
                <button
                  className="primary"
                  onClick={app.openNewGoalDraft}
                  disabled={!browserApi.hasAccessToken}
                >
                  <Plus size={15} /> New goal
                </button>
              </div>
            </header>
            <div className={`content ${app.sessionVisible ? "session-open" : ""}`}>
              {app.sessionVisible && app.manageError && (
                <div className="manage-error-overlay" role="alert">
                  {app.manageError}
                  <button onClick={app.onClearManageError}>Dismiss</button>
                </div>
              )}
              {!app.sessionVisible && app.goalBoardElement}
              {app.sessionVisible && (
                <GoalSession
                  activeGoal={app.activeGoal}
                  boardContent={app.goalBoardElement}
                  renderPermissionControl={app.renderPermissionControl}
                  onRevokeToolGrant={app.revokeToolGrant}
                  onDeleteGoal={app.onDeleteGoal}
                  manageBusyId={app.manageBusyId}
                />
              )}
            </div>
          </main>
          {app.modelPickerTarget !== null && (
            <ModelPicker
              key={
                app.modelPickerTarget.kind === "draft"
                  ? "draft"
                  : `${app.modelPickerTarget.goalId}:${app.modelPickerTarget.runId}`
              }
              target={app.modelPickerTarget}
              selectedId={app.modelPickerTarget.kind === "draft" ? app.draftModelId : null}
              onSelect={app.onSelectModel}
              onClose={() => app.setModelPickerTarget(null)}
              onDone={app.onDoneModelPicker}
            />
          )}
        </div>
      </RunControlProvider>
    </GoalSessionProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

