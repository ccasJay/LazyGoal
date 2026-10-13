import { useMemo, useState } from "react";
import { Clock3, Plus, Search, X } from "lucide-react";
import type { BrowserGoalListItem } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { GoalCard } from "./GoalCard";
import { InboxIcon } from "./MessageComposer";
import {
  type MetricsState,
  statusClass,
  statuses,
  statusFromRun,
} from "../types";

export function GoalBoard({
  goals,
  metricsByGoal,
  goalsLoading,
  selectedGoalId,
  onSelectGoal,
  onOpenNewGoalDraft,
  onChangeArchive,
  onDeleteGoal,
  manageBusyId,
  manageError,
  onClearManageError,
  undoArchiveId,
  onRefreshGoals,
  sessionError,
}: {
  goals: readonly BrowserGoalListItem[];
  metricsByGoal: Record<string, MetricsState>;
  goalsLoading: boolean;
  selectedGoalId: string | null;
  onSelectGoal: (goalId: string) => void;
  onOpenNewGoalDraft: () => void;
  onChangeArchive: (goal: BrowserGoalListItem, archived: boolean) => Promise<void>;
  onDeleteGoal: (goal: BrowserGoalListItem) => Promise<void>;
  manageBusyId: string | null;
  manageError: string | null;
  onClearManageError: () => void;
  undoArchiveId: string | null;
  onRefreshGoals: () => Promise<void>;
  sessionError: string | null;
}) {
  const [search, setSearch] = useState("");
  const [archivedView, setArchivedView] = useState(false);

  const visibleGoals = useMemo(
    () =>
      goals.filter(
        (goal) =>
          goal.archived === archivedView &&
          goal.intent.toLowerCase().includes(search.toLowerCase())
      ),
    [goals, search, archivedView]
  );

  return (
    <section className="board-area">
      <div className="toolbar">
        <strong className="board-title">
          {archivedView ? "Archived" : "All goals"}{" "}
          <span>{goals.filter((goal) => goal.archived === archivedView).length}</span>
        </strong>
        <button
          className={`archive-view-toggle ${archivedView ? "is-active" : ""}`}
          type="button"
          onClick={() => {
            setArchivedView(!archivedView);
          }}
        >
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
          <button
            className="icon"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => setSearch("")}
          >
            <X size={14} />
          </button>
        )}
        <button
          className="icon refresh-button"
          aria-label="Refresh goals"
          onClick={() => void onRefreshGoals()}
        >
          <Clock3 size={14} />
        </button>
      </div>
      {sessionError && selectedGoalId === null && (
        <div className="page-error" role="alert">
          <span>{sessionError}</span>
          {browserApi.hasAccessToken && (
            <button onClick={() => void onRefreshGoals()}>Retry</button>
          )}
        </div>
      )}
      {manageError && (
        <div className="page-error" role="alert">
          <span>{manageError}</span>
          <button onClick={onClearManageError}>Dismiss</button>
        </div>
      )}
      {undoArchiveId && !archivedView && (
        <div className="archive-notice" role="status">
          Goal archived.{" "}
          <button
            onClick={() => {
              const goal = goals.find((item) => item.goalId === undoArchiveId);
              if (goal) void onChangeArchive(goal, false);
            }}
          >
            Undo
          </button>
        </div>
      )}
      {goalsLoading ? (
        <div className="board-empty">
          <span className="loading-mark" />
          <p>Loading saved Goals…</p>
        </div>
      ) : goals.filter((goal) => goal.archived === archivedView).length === 0 && !sessionError ? (
        <div className="board-empty">
          <InboxIcon />
          <h2>{archivedView ? "No archived Goals" : "No saved Goals yet"}</h2>
          <p>
            {archivedView
              ? "Archived Goals will appear here."
              : "Create a Goal to start a real session in this workspace."}
          </p>
          {!archivedView && (
            <button
              className="primary"
              onClick={onOpenNewGoalDraft}
              disabled={!browserApi.hasAccessToken}
            >
              <Plus size={14} /> New goal
            </button>
          )}
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
                  {statusGoals.map((goal) => (
                    <GoalCard
                      key={goal.goalId}
                      goal={goal}
                      metrics={metricsByGoal[goal.goalId]}
                      selected={selectedGoalId === goal.goalId}
                      onSelect={() => onSelectGoal(goal.goalId)}
                      busy={manageBusyId === goal.goalId}
                      onArchive={() => void onChangeArchive(goal, !goal.archived)}
                      onDelete={() => void onDeleteGoal(goal)}
                    />
                  ))}
                  {statusGoals.length === 0 && <div className="empty-column">No goals here</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

