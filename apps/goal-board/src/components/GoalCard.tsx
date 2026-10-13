import { useEffect, useRef, useState } from "react";
import { Archive, MoreHorizontal, Trash2 } from "lucide-react";
import type { BrowserGoalListItem } from "../../../../packages/web-contracts/src/index";
import {
  type MetricsState,
  cardStatusPresentation,
  formatUpdatedAt,
  metricCoverage,
  metricNumber,
  metricPercent,
  metricSpeed,
  statusClass,
  statusFromRun,
} from "../types";

export function CardMetrics({ state }: { state?: MetricsState }) {
  if (state?.kind === "error") return <div className="card-metrics muted">Metrics unavailable</div>;
  if (state === undefined) return <div className="card-metrics muted">Loading metrics…</div>;
  const metrics = state.value;
  const coverage = metricCoverage(metrics);
  return (
    <div
      className="card-metrics"
      aria-label={`Goal total: ${metrics.stepCount} committed steps, ${metrics.inputTokens ?? "unavailable"} input tokens, ${metrics.outputTokens ?? "unavailable"} output tokens`}
    >
      <span>
        <strong>{metrics.stepCount}</strong> step{metrics.stepCount === 1 ? "" : "s"}<i />{" "}
        <strong>{metricNumber(metrics.inputTokens)}</strong> in{" "}
        <span className="metric-separator">/</span>{" "}
        <strong>{metricNumber(metrics.outputTokens)}</strong> out
      </span>
      <span
        className={coverage === null ? "" : "metric-coverage"}
        title={coverage ?? "Goal cache hit rate and generation speed"}
      >
        {coverage ?? (
          <>
            <strong>{metricPercent(metrics.cacheHitRate)}</strong> cache<i />
            <strong>{metricSpeed(metrics.tokensPerSecond)}</strong> tok/s
          </>
        )}
      </span>
    </div>
  );
}

export function GoalCard({
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
  const { label: statusLabel, className: statusPillClass } = cardStatusPresentation(goal.runStatus);
  const terminal = goal.runStatus === "completed" || goal.runStatus === "failed" || goal.runStatus === "cancelled";

  return (
    <article className="goal-card-shell">
      <button
        className={`goal-card ${selected ? "is-selected" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <h3>{goal.intent}</h3>
        <CardMetrics state={metrics} />
        <div className="card-footer">
          <span className={`status-pill ${statusPillClass}`}>
            <span className="status-dot" />
            {statusLabel}
          </span>
          <time dateTime={goal.updatedAt} title={goal.updatedAt}>
            {formatUpdatedAt(goal.updatedAt)}
          </time>
        </div>
      </button>
      <div
        className={`goal-card-menu ${menuOpen ? "is-expanded" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setMenuOpen(false);
            setConfirmDelete(false);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            setMenuOpen(false);
            setConfirmDelete(false);
          }
        }}
      >
        <button
          type="button"
          className="goal-card-options"
          aria-label={`More options for ${goal.intent}`}
          aria-expanded={menuOpen}
          tabIndex={menuOpen ? -1 : 0}
          onClick={() => {
            setConfirmDelete(false);
            setMenuOpen(true);
          }}
        >
          <MoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <div className="goal-card-menu-items" role="group" aria-label={`Options for ${goal.intent}`}>
            <button
              ref={firstMenuAction}
              type="button"
              disabled={!terminal || busy}
              title={!terminal ? "Available after this Goal ends." : undefined}
              onClick={() => {
                onArchive();
                setMenuOpen(false);
              }}
            >
              <Archive size={14} /> {goal.archived ? "Restore" : "Archive"}
            </button>
            <button
              type="button"
              className={`danger ${confirmDelete ? "is-confirming" : ""}`}
              disabled={!terminal || busy}
              title={!terminal ? "Available after this Goal ends." : undefined}
              onClick={() => {
                if (confirmDelete) {
                  onDelete();
                  setMenuOpen(false);
                } else {
                  setConfirmDelete(true);
                }
              }}
            >
              <Trash2 size={14} /> {busy ? "Deleting…" : confirmDelete ? "Confirm" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

